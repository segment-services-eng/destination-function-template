/**
 * Shared fetch-with-retries helper using Node's native fetch (Node >= 18).
 *
 * Retries on the retryable HTTP status codes AND on thrown network errors
 * (connection reset, DNS failure, TLS error, timeout) — the thrown-error path
 * that the previous fetch-retry setup missed. Exponential backoff with full
 * jitter, plus an AbortController timeout so a hung socket fails fast.
 *
 * Extracted into a shared module so the deploy and tracking-plan scripts can't
 * drift in retry behavior (retry codes, timeout, logging) over time.
 */
const RETRY_STATUS_CODES = [403, 429, 500, 502, 503, 504];
// Number of RETRIES after the initial attempt (so up to 1 + MAX_RETRIES total
// requests). Matches the previous fetch-retry `retries: 7` behavior.
const MAX_RETRIES = 7;
// Default per-request timeout. Suits the many small tracking-plan GET requests,
// where a short timeout means a single hung request fails fast and retries.
// Large requests (e.g. the ~2.3MB deploy PATCH) should override this via the
// `timeoutMs` option — otherwise they abort mid-upload and waste a retry
// re-sending the whole payload (and can orphan a partially-created version).
const REQUEST_TIMEOUT_MS = 15000;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const backoffDelay = attempt => {
  const capped = Math.min(Math.pow(2, attempt) * 1000, 8000);
  return Math.floor(Math.random() * capped);
};

const fetchWithTimeout = async (
  url,
  options = {},
  timeoutMs = REQUEST_TIMEOUT_MS
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Best-effort discard of an unread body so undici can release the socket before
// a retry. cancel() can itself reject (stream already disturbed/locked); that
// must NOT route control into the retry catch-path and mask the HTTP-status
// handling, so swallow any error here.
const discardBody = async response => {
  try {
    await response.body?.cancel();
  } catch {
    // ignore — releasing the socket is best-effort
  }
};

// `config.timeoutMs` overrides the per-request timeout (default REQUEST_TIMEOUT_MS).
// `config.attempt` is used internally for the retry recursion; callers omit it.
const fetchWithRetry = async (url, options, config = {}) => {
  const { timeoutMs = REQUEST_TIMEOUT_MS, attempt = 0 } = config;
  try {
    const response = await fetchWithTimeout(url, options, timeoutMs);
    if (RETRY_STATUS_CODES.includes(response.status) && attempt < MAX_RETRIES) {
      console.log(
        `Response ${response.status}. Retry ${attempt + 1}/${MAX_RETRIES}`
      );
      await discardBody(response);
      await wait(backoffDelay(attempt));
      return fetchWithRetry(url, options, { timeoutMs, attempt: attempt + 1 });
    }
    return response;
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      console.warn(
        `fetch attempt ${attempt + 1} failed (${error.message}), retrying`
      );
      await wait(backoffDelay(attempt));
      return fetchWithRetry(url, options, { timeoutMs, attempt: attempt + 1 });
    }
    throw error;
  }
};

module.exports = {
  fetchWithRetry,
  RETRY_STATUS_CODES,
  MAX_RETRIES,
  REQUEST_TIMEOUT_MS
};
