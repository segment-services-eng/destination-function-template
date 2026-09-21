#!/usr/bin/env bash
#
# Fetch the Segment Public API token from AWS Secrets Manager and export it for
# the deploy steps. Requires temporary AWS credentials to already be present in
# the environment — supplied by the aws-assume-role-with-web-identity Buildkite
# plugin, whose IAM role is allowed to read this secret.
#
# The token is the only secret a deploy needs, and it is shared across all
# environments. Each function's per-environment Segment function ID is committed
# in functions/<name>/function.json, since a function ID is an identifier rather
# than a credential and is useless without this token.
#
# Sourced (not executed) so the export lands in the calling shell:
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

echo '--- :aws: Fetching the Segment Public API token from Secrets Manager'

PUBLIC_API_TOKEN="$(aws secretsmanager get-secret-value \
  --secret-id "$TOKEN_SECRET_ID" \
  --region "$SECRET_REGION" \
  --query 'SecretString' --output text | jq -r '.PUBLIC_API_TOKEN')"

export PUBLIC_API_TOKEN

if [ -z "$PUBLIC_API_TOKEN" ] || [ "$PUBLIC_API_TOKEN" = 'null' ]; then
  echo '+++ :boom: Missing PUBLIC_API_TOKEN in Secrets Manager' >&2
  exit 1
fi
