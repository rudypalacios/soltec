#!/usr/bin/env bash
# Prints the server requirements report and turns every problem into a workflow annotation.
# It never fails the job: a missing requirement shows up here first, and the steps that really need
# it (migrations, smoke test) fail with their own message. Pass --strict to fail on any "fail".
# Usage: requirements.sh [--strict]
# Environment: APP_URL, DEPLOY_TOKEN.
set -euo pipefail

: "${APP_URL:?APP_URL is required (variable of the GitHub environment)}"
: "${DEPLOY_TOKEN:?DEPLOY_TOKEN is required (secret of the GitHub environment)}"

out=$(mktemp)
status=$(curl --silent --show-error --max-time 90 --output "$out" --write-out '%{http_code}' \
    --header "X-Deploy-Token: $DEPLOY_TOKEN" \
    "$APP_URL/api/system/requirements" || true)

if [ "$status" != "200" ] || ! jq -e '.checks' "$out" >/dev/null 2>&1; then
    cat "$out" 2>/dev/null || true
    echo
    echo "::warning::The requirements report is not available (HTTP $status). On a new instance this is normal until the"
    echo "::warning::API is uploaded; if it persists, the API does not start: read the PHP error_log of the instance."
    exit 0
fi

echo "Requirements for $APP_URL: $(jq -r '.status' "$out")"
jq -r '.checks[] | "\(.status | ascii_upcase | .[0:4])  \(.id)  \(.message)"' "$out"

jq -r '.checks[] | select(.status != "pass") | "\(.status)\t\(.id)\t\(.message) \(.hint // "")"' "$out" |
    while IFS=$'\t' read -r level id text; do
        if [ "$level" = "fail" ]; then
            echo "::error title=Requirement $id::$text"
        else
            echo "::warning title=Requirement $id::$text"
        fi
    done

if [ "${1:-}" = "--strict" ] && jq -e '.status == "blocked"' "$out" >/dev/null; then
    exit 1
fi
