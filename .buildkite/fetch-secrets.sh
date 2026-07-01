#!/usr/bin/env bash
#
# Fetch deploy secrets from AWS Secrets Manager and export them for the deploy
# steps. Requires temporary AWS credentials to already be present in the
# environment — supplied by the aws-assume-role-with-web-identity Buildkite
# plugin, whose IAM role is allowed to read these secrets.
#
# Two-secret model (all in one account, 058449100246 / us-west-2):
#   * segment/destination-function-template/public-api-token -> PUBLIC_API_TOKEN
#       (shared across all envs)
#   * segment/destination-function-template/<env>/function-id -> FUNCTION_ID
#       (per env — dev/qa/prod — selected by DEPLOY_ENV)
#
# Sourced (not executed) so the exports land in the calling shell:
#   source .buildkite/fetch-secrets.sh

set -euo pipefail

# This runs on the Buildkite agent host (before `docker run`), so it relies on
# `aws` and `jq` being present there. Check up front for a clear, diagnosable
# failure instead of an opaque "command not found" mid-pipeline.
for tool in aws jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "+++ :boom: required tool '$tool' not found on the agent host" >&2
    exit 1
  fi
done

SECRET_REGION='us-west-2'
TOKEN_SECRET_ID='segment/destination-function-template/public-api-token'
# DEPLOY_ENV is DEV/QA/PROD; the function-id secrets are named with the
# lowercase env segment (dev/qa/prod).
DEPLOY_ENV_LOWER="$(printf '%s' "${DEPLOY_ENV:-}" | tr '[:upper:]' '[:lower:]')"
FUNCTION_ID_SECRET_ID="segment/destination-function-template/${DEPLOY_ENV_LOWER}/function-id"

echo '--- :aws: Fetching deploy secrets from Secrets Manager'

PUBLIC_API_TOKEN="$(aws secretsmanager get-secret-value \
  --secret-id "$TOKEN_SECRET_ID" \
  --region "$SECRET_REGION" \
  --query 'SecretString' --output text | jq -r '.PUBLIC_API_TOKEN')"

FUNCTION_ID="$(aws secretsmanager get-secret-value \
  --secret-id "$FUNCTION_ID_SECRET_ID" \
  --region "$SECRET_REGION" \
  --query 'SecretString' --output text | jq -r '.FUNCTION_ID')"

export PUBLIC_API_TOKEN FUNCTION_ID

if [ -z "$PUBLIC_API_TOKEN" ] || [ "$PUBLIC_API_TOKEN" = 'null' ] ||
   [ -z "$FUNCTION_ID" ] || [ "$FUNCTION_ID" = 'null' ]; then
  echo '+++ :boom: Missing PUBLIC_API_TOKEN or FUNCTION_ID in Secrets Manager' >&2
  exit 1
fi
