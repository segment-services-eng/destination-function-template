# GitHub Copilot Review Instructions

## Project Context

This is a Twilio Segment Destination Function template written in JavaScript (Node.js 18). The function processes customer event data from Segment and executes custom logic for each event type.

## Code Review Philosophy

Review code like a maintainer who cares about production stability, developer experience, and long-term maintainability. Focus on catching issues that would cause runtime failures, security vulnerabilities, or make the codebase harder to maintain.

- Only comment when you have HIGH CONFIDENCE (>80%) that an issue exists
- Be concise: one sentence per comment when possible
- Focus on actionable feedback, not observations
- When reviewing text, only comment on clarity issues if the text is genuinely confusing or could lead to errors.

## Repository-Specific Patterns

### Twilio Segment Function Structure

- Main function is `onTrack(event, settings)` in `src/index.js`
- Must be an `async function` that handles `SegmentTrackEvent` and `FunctionSettings` parameters
- Functions are deployed to Segment's serverless runtime (no traditional server environment)
- Code runs in a sandboxed environment with limited access to Node.js APIs

### Conditional Exports for Testing

```javascript
// CORRECT: Export only in test environment
if (process.env.NODE_DEV === 'TEST') {
  module.exports = { onTrack };
}

// INCORRECT: Always exporting breaks Segment runtime
module.exports = { onTrack }; // ❌ Don't do this
```

### Required Dependencies

All external dependencies must be declared in `package.json`. The Segment runtime does NOT have built-in access to npm packages beyond what's explicitly included.

## Code Review Checklist

### 1. Functional Requirements

**✅ Check for:**

- The `onTrack` function signature matches: `async function onTrack(event, settings)`
- All async operations use `await` (not callbacks or bare promises)
- Function properly handles the event payload structure
- Settings are accessed correctly from the `settings` parameter

**❌ Reject if:**

- Using callbacks instead of async/await
- Function is not async but performs asynchronous operations
- Direct use of `process.env` for configuration (should use `settings` parameter)

### 2. Error Handling

**✅ Check for:**

- Try-catch blocks around external API calls
- Graceful degradation when non-critical operations fail
- Proper error logging with sufficient context
- Retry logic for transient failures (using `fetch-retry`)

**❌ Reject if:**

- Unhandled promise rejections
- Silent failure (catching errors without logging)
- Generic error messages without context
- Throwing errors that would crash the function without recovery

**Example:**

```javascript
// CORRECT: Proper error handling
async function onTrack(event, settings) {
  try {
    const response = await fetch(settings.apiUrl, {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      console.error(`API error: ${response.status} - ${response.statusText}`);
      return; // Graceful degradation
    }

    console.log('Event sent successfully');
  } catch (error) {
    console.error('Failed to send event:', error.message, {
      eventId: event.messageId
    });
    // Don't throw - function should complete even if external service fails
  }
}

// INCORRECT: Poor error handling
async function onTrack(event, settings) {
  const response = await fetch(settings.apiUrl); // ❌ No error handling
  console.log('Done'); // ❌ Doesn't check response status
}
```

### 3. Performance and Resource Usage

**✅ Check for:**

- Efficient use of Array methods (map, filter, reduce) instead of for loops
- Appropriate use of caching for repeated calculations
- Batching of API calls when possible
- Reasonable timeout values for external requests

**❌ Reject if:**

- Using for loops (violates project style guide)
- Synchronous blocking operations (like `fs.readFileSync`)
- Excessive memory allocation (large data structures)
- Missing timeout configuration on fetch requests
- N+1 query patterns (making API calls in loops)

**Example:**

```javascript
// CORRECT: Efficient Array methods
const validEvents = events.filter(event => event.userId);
const userIds = validEvents.map(event => event.userId);

// INCORRECT: Using for loops
const validEvents = []; // ❌ Don't use for loops
for (let i = 0; i < events.length; i++) {
  if (events[i].userId) {
    validEvents.push(events[i]);
  }
}
```

### 4. Testing Requirements

**✅ Check for:**

- Every new function has corresponding unit tests in `src/index.test.js`
- Tests use proper Jest patterns (describe, it, expect)
- Mocking of external dependencies (fetch, etc.)
- Tests verify both success and error cases
- `process.env['NODE_DEV'] = 'TEST'` set before importing functions
- Console methods properly mocked to avoid noisy test output

**❌ Reject if:**

- New functions added without tests
- Tests that make real network requests
- Missing error case testing
- Tests that don't use `expect.assertions(n)` for async tests
- Forgotten to mock console methods

**Example:**

```javascript
// CORRECT: Proper test structure
process.env['NODE_DEV'] = 'TEST';
const { onTrack } = require('./index.js');

jest.spyOn(global.console, 'log').mockImplementation();
jest.spyOn(global.console, 'error').mockImplementation();

describe('onTrack', () => {
  beforeEach(() => {
    fetch.resetMocks();
  });

  it('should send event to API successfully', async () => {
    expect.assertions(2);
    fetch.mockResponseOnce(JSON.stringify({ success: true }));

    await onTrack({ userId: '123' }, { apiUrl: 'https://api.example.com' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith('Event sent successfully');
  });

  it('should handle API errors gracefully', async () => {
    expect.assertions(1);
    fetch.mockReject(new Error('Network error'));

    await onTrack({ userId: '123' }, { apiUrl: 'https://api.example.com' });

    expect(console.error).toHaveBeenCalled();
  });
});
```

### 5. Security Concerns

**✅ Check for:**

- No hardcoded credentials (use `settings` parameter)
- Proper handling of sensitive data in logs
- Input validation for event data
- Safe URL construction (no string concatenation with user input)
- HTTPS for all external API calls

**❌ Reject if:**

- Hardcoded API keys, tokens, or secrets
- Logging sensitive PII without redaction
- SQL injection vulnerabilities (if using databases)
- Command injection vulnerabilities
- XSS vulnerabilities in any HTML generation
- Unsafe eval() or Function() constructor usage

**Example:**

```javascript
// CORRECT: Safe credential handling
async function onTrack(event, settings) {
  const response = await fetch(settings.apiUrl, {
    headers: {
      Authorization: `Bearer ${settings.apiToken}` // ✅ From settings
    }
  });
}

// INCORRECT: Hardcoded credentials
async function onTrack(event, settings) {
  const response = await fetch('https://api.example.com', {
    headers: {
      Authorization: 'Bearer sk-1234567890' // ❌ Hardcoded secret
    }
  });
}

// CORRECT: Safe logging (redact PII)
console.log('Processing event', { userId: event.userId, type: event.type });

// INCORRECT: Logging sensitive data
console.log('Event:', event); // ❌ May contain PII like email, phone, etc.
```

### 6. Code Style and Maintainability

**✅ Check for:**

- Descriptive variable and function names
- Functional programming principles (immutability, pure functions)
- Comments only where logic is not self-evident
- Consistent use of ESLint and Prettier formatting
- Native Fetch API usage (not Axios or other HTTP libraries)
- ES6+ syntax (const/let, arrow functions, destructuring, template literals)

**❌ Reject if:**

- Cryptic variable names (x, temp, data123)
- Global variables
- Using `var` instead of `const`/`let`
- Installing Axios or other HTTP libraries (use native fetch)
- Mutating function parameters
- Unnecessary comments explaining obvious code

**Example:**

```javascript
// CORRECT: Clean, functional style
async function onTrack(event, settings) {
  const { userId, properties } = event;
  const enrichedProperties = {
    ...properties,
    timestamp: new Date().toISOString()
  };

  await sendToAPI(userId, enrichedProperties, settings);
}

// INCORRECT: Poor style
async function onTrack(event, settings) {
  var x = event.userId; // ❌ Using var
  event.properties.timestamp = new Date(); // ❌ Mutating parameter
  temp = x; // ❌ Global variable, poor naming
  await sendToAPI(temp, event.properties, settings);
}
```

### 7. Deployment Considerations

**✅ Check for:**

- No dependencies on local file system (no `fs` module usage)
- Code is stateless (no in-memory state between invocations)
- Function completes quickly (avoid long-running operations)
- Proper validation of `settings` before use

**❌ Reject if:**

- Using `fs.readFile()` or `fs.writeFile()` (no file system in Segment runtime)
- Storing state in module-level variables
- Operations that take >30 seconds
- Missing validation of required settings

## Common Pitfalls to Avoid

### 1. Missing Retry Logic for External APIs

```javascript
// CORRECT: Use fetch-retry for resilience
const fetchRetry = require('fetch-retry')(fetch);

const response = await fetchRetry(url, {
  retries: 3,
  retryDelay: 1000
});

// INCORRECT: No retry on transient failures
const response = await fetch(url); // ❌ Single attempt
```

### 2. Not Validating Settings

```javascript
// CORRECT: Validate settings exist
async function onTrack(event, settings) {
  if (!settings.apiUrl || !settings.apiToken) {
    console.error('Missing required settings: apiUrl and apiToken');
    return;
  }
  // Proceed with logic
}

// INCORRECT: Assume settings are always present
async function onTrack(event, settings) {
  await fetch(settings.apiUrl); // ❌ May be undefined
}
```

### 3. Breaking Conditional Exports

```javascript
// CORRECT: Only export in test mode
if (process.env.NODE_DEV === 'TEST') {
  module.exports = { onTrack, helperFunction };
}

// INCORRECT: Always exporting
module.exports = { onTrack }; // ❌ Breaks Segment runtime
```

### 4. Improper Use of Globals Available in Tests

The test environment provides global mocks (`fetch`, `btoa`, `_`, `crypto`, `moment`, `cache`), but production code should explicitly require dependencies.

```javascript
// CORRECT: Explicit require in production code
const moment = require('moment-timezone');
const _ = require('lodash');

// INCORRECT: Relying on test globals in production
// Using _ or moment without require will fail in Segment runtime
```

## Review Response Format

When providing code review feedback, structure your response as:

1. **Summary**: Brief overview of the change and overall assessment
2. **Critical Issues**: Blocking problems that must be fixed (security, crashes, breaking changes)
3. **Warnings**: Important issues that should be addressed but aren't blocking
4. **Suggestions**: Nice-to-have improvements for code quality
5. **Positive Feedback**: Highlight what was done well

**Example Review:**

```
## Summary
Adding new email notification feature to send event data to external API. Overall approach is sound but has several issues that need addressing.

## Critical Issues
1. **Security**: API token is hardcoded on line 45. Move to `settings.emailApiToken`
2. **Error Handling**: Unhandled promise rejection on line 52. Wrap fetch in try-catch

## Warnings
1. **Testing**: Missing test case for error scenario when API returns 500
2. **Performance**: Making API call inside map() on line 38 creates N+1 pattern. Consider batching

## Suggestions
1. Consider adding request timeout to prevent hanging on slow API
2. Variable name `temp` on line 31 could be more descriptive (e.g., `formattedEvent`)

## Positive Feedback
- Excellent use of destructuring to extract event properties
- Good logging with context for debugging
- Proper use of async/await instead of callbacks
```

## Continuous Improvement

This document should evolve as the project grows. When new patterns emerge or common mistakes are identified, update these instructions to teach Copilot to catch them in future reviews.
