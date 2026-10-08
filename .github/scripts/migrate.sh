#!/usr/bin/env bash
# Applies pending migrations through the deployment endpoint and fails the workflow when they fail.
# Usage: migrate.sh [--allow-missing]
#   --allow-missing  tolerate 404/405 while the endpoint is not deployed yet (first deployment).
# Environment: APP_URL, DEPLOY_TOKEN and, optionally, BASIC_AUTH ("user:password").
set -euo pipefail

: "${APP_URL:?APP_URL is required (variable of the GitHub environment)}"
: "${DEPLOY_TOKEN:?DEPLOY_TOKEN is required (secret of the GitHub environment)}"

# Outside the workspace, so the log is never uploaded to the server.
log=$(mktemp)

# The cPanel directory protection is optional: with it removed the secrets are empty (":").
auth=()
if [ -n "${BASIC_AUTH:-}" ] && [ "$BASIC_AUTH" != ":" ]; then
    auth=(--user "$BASIC_AUTH")
fi

status=$(curl --silent --show-error --max-time 180 --output "$log" --write-out '%{http_code}' \
    --request POST \
    "${auth[@]}" \
    --header "X-Deploy-Token: $DEPLOY_TOKEN" \
    "$APP_URL/api/system/migrations/apply")

cat "$log"
echo

if { [ "$status" = "404" ] || [ "$status" = "405" ]; } && [ "${1:-}" = "--allow-missing" ]; then
    echo "The migrations endpoint is not deployed yet; they will run after the upload."
    exit 0
fi

if [ "$status" != "200" ]; then
    echo "::error::Migrations failed (HTTP $status)"
    exit 1
fi

# A 200 that is not the API's JSON (for example the web app's index.html) means the API is not reachable.
if ! jq -e 'has("applied")' "$log" >/dev/null 2>&1; then
    echo "::error::The migrations endpoint answered 200 but not with the expected JSON"
    exit 1
fi
