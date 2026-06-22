#!/usr/bin/env bash
#
# Fetch deploy secrets from AWS Secrets Manager and export them for the deploy
# step. Requires temporary AWS credentials to already be present in the
# environment — supplied by the aws-assume-role-with-web-identity Buildkite
# plugin, whose IAM role is allowed to read this one secret.
#
# Exports: FUNCTION_ID, PUBLIC_API_TOKEN
#
# Sourced (not executed) so the exports land in the calling shell:
#   source .buildkite/fetch-secrets.sh

set -euo pipefail

SECRET_ID='segment/destination-function-template'
SECRET_REGION='us-west-2'

echo '--- :aws: Fetching deploy secrets from Secrets Manager'

secret_json="$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --region "$SECRET_REGION" \
  --query 'SecretString' \
  --output text)"

FUNCTION_ID="$(printf '%s' "$secret_json" | jq -r '.FUNCTION_ID')"
PUBLIC_API_TOKEN="$(printf '%s' "$secret_json" | jq -r '.PUBLIC_API_TOKEN')"
export FUNCTION_ID PUBLIC_API_TOKEN

if [ -z "$FUNCTION_ID" ] || [ "$FUNCTION_ID" = 'null' ] ||
   [ -z "$PUBLIC_API_TOKEN" ] || [ "$PUBLIC_API_TOKEN" = 'null' ]; then
  echo '+++ :boom: Missing FUNCTION_ID or PUBLIC_API_TOKEN in secret' >&2
  exit 1
fi
