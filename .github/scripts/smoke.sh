#!/usr/bin/env bash
# Checks that the deployed API answers and prints what the server really provides, so the design
# assumptions (MySQL 5.7, generated columns, WebP, limits) can be verified on the real host.
# Environment: APP_URL, DEPLOY_TOKEN and, optionally, BASIC_AUTH ("user:password").
set -euo pipefail

: "${APP_URL:?APP_URL is required (variable of the GitHub environment)}"
: "${DEPLOY_TOKEN:?DEPLOY_TOKEN is required (secret of the GitHub environment)}"

out=$(mktemp)

auth=()
if [ -n "${BASIC_AUTH:-}" ] && [ "$BASIC_AUTH" != ":" ]; then
    auth=(--user "$BASIC_AUTH")
fi

# The server may need a few seconds to pick up the new files (opcache, FTP propagation).
healthy=false
for attempt in 1 2 3 4 5 6; do
    status=$(curl --silent --max-time 30 --output "$out" --write-out '%{http_code}' \
        "${auth[@]}" "$APP_URL/api/v1/health" || true)
    if [ "$status" = "200" ] && jq -e '.status == "ok"' "$out" >/dev/null 2>&1; then
        healthy=true
        break
    fi
    echo "Attempt $attempt: HTTP $status; retrying in 10 s"
    sleep 10
done

if [ "$healthy" != "true" ]; then
    cat "$out"
    echo
    echo "::error::The health endpoint did not answer ok at $APP_URL/api/v1/health"
    exit 1
fi
echo "Health: ok"

echo "Server diagnostics:"
curl --fail --silent --show-error --max-time 60 \
    "${auth[@]}" \
    --header "X-Deploy-Token: $DEPLOY_TOKEN" \
    "$APP_URL/api/system/diagnostics" | tee "$out" | jq .

# The design relies on this one: fail when the hosting cannot do it.
if ! jq -e '.database.generated_column_unique.supported == true' "$out" >/dev/null; then
    echo "::error::MySQL on this server does not support a unique index on a generated column"
    exit 1
fi

# These do not block a deployment yet, but they will matter later.
if ! jq -e '.images.webp_encode == true' "$out" >/dev/null; then
    echo "::warning::GD on this server cannot encode WebP"
fi
if ! jq -e '[.extensions[]] | all' "$out" >/dev/null; then
    echo "::warning::Some required PHP extensions are missing: see the diagnostics above"
fi
if ! jq -e '.storage.writable == true' "$out" >/dev/null; then
    echo "::warning::The storage directory is missing or not writable"
fi
