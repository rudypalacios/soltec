#!/usr/bin/env bash
# Manual deployment: does what the "Deploy" GitHub workflow does (docs/despliegue.md, section 1), from this machine.
# For when the Actions minutes run out or a deployment has to be done by hand. It reads its settings from a `.deploy`
# file instead of GitHub secrets; see deploy/deploy.example.
#
# What it does, in the same order as the workflow:
#   1. builds the API (composer install --no-dev) and the web app (npm run build) in a temporary folder
#   2. uploads the migrations and applies them (POST /api/system/migrations/apply)
#   3. uploads the API, its front controller and the web app
#   4. prints the server requirements, applies migrations again (a no-op) and runs the smoke test
#
# Only what changed is uploaded: after each upload the script keeps, in .deploy-state/, the hash of every file that
# is now on the server, and the next run sends the files that differ and removes the ones that were deleted. Files
# that only live on the server (.env, storage/, public/.htaccess) are never touched because they are never in that
# list. FTP-Deploy-Action keeps its own list on the server, which would go stale after a manual deployment, so the
# script deletes it at the end and the next workflow run uploads everything once.
#
# Usage: deploy/deploy-manual.sh [options]   (run it inside the checkout of the branch to deploy)
#   --config FILE   settings file (default: .deploy in the checkout)
#   --full          upload every file, ignoring what the last run recorded (use it after a deployment from GitHub)
#   --dry-run       build and show what would be uploaded; contact nothing
#   --upload-only   do not call the server's endpoints (migrations, requirements, smoke test)
#   --skip-build    reuse web/dist as it is (the API is always rebuilt)
#   --tests         run the fast checks of the CI first (lint, static analysis, types and unit tests)
#   --yes           do not ask for confirmation (never for production)
#   -h, --help      this text
set -euo pipefail

CONFIG=""
FULL=false
DRY_RUN=false
UPLOAD_ONLY=false
SKIP_BUILD=false
RUN_TESTS=false
ASSUME_YES=false

die() {
    echo "ERROR: $*" >&2
    exit 1
}

step() {
    printf '\n==> %s\n' "$*"
}

usage() {
    sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
    case "$1" in
        --config) [ $# -ge 2 ] || die "--config needs a file"; CONFIG="$2"; shift 2 ;;
        --config=*) CONFIG="${1#--config=}"; shift ;;
        --full) FULL=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        --upload-only) UPLOAD_ONLY=true; shift ;;
        --skip-build) SKIP_BUILD=true; shift ;;
        --tests) RUN_TESTS=true; shift ;;
        --yes) ASSUME_YES=true; shift ;;
        -h | --help) usage; exit 0 ;;
        *) die "Unknown option: $1 (try --help)" ;;
    esac
done

SOURCE=$(git rev-parse --show-toplevel 2>/dev/null) || die "Run it inside the checkout of the branch to deploy."
if [ ! -f "$SOURCE/api/composer.json" ] || [ ! -f "$SOURCE/web/package.json" ]; then
    die "$SOURCE is not the repository."
fi
CONFIG=${CONFIG:-$SOURCE/.deploy}

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
DEPLOY_NAME=staging
FTP_SERVER=""
FTP_PORT=""
FTP_USERNAME=""
FTP_PASSWORD=""
FTP_SERVER_DIR=/
FTP_PROTOCOL=ftps
FTP_VERIFY_CERT=true
APP_URL=""
DEPLOY_TOKEN=""
ALLOWED_KEYS=" DEPLOY_NAME FTP_SERVER FTP_PORT FTP_USERNAME FTP_PASSWORD FTP_SERVER_DIR FTP_PROTOCOL FTP_VERIFY_CERT APP_URL DEPLOY_TOKEN "

# Reads KEY=value lines. The file is parsed, never sourced, so nothing in it runs; a line that is not understood is
# reported without printing it, because it may hold a password.
load_config() {
    [ -f "$CONFIG" ] || die "No settings file at $CONFIG. Copy deploy/deploy.example to .deploy and fill it in."
    local mode
    mode=$(stat -c %a "$CONFIG")
    case "$mode" in
        600 | 400) ;;
        *) die "$CONFIG holds passwords and must be private: chmod 600 $CONFIG (it is $mode)." ;;
    esac

    local line key value
    local pair='^[[:space:]]*([A-Z_]+)[[:space:]]*=(.*)$'
    local quoted_double='^"(.*)"$'
    local quoted_single="^'(.*)'\$"
    while IFS= read -r line || [ -n "$line" ]; do
        line=${line%$'\r'}
        [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
        [[ "$line" =~ $pair ]] || die "A line of $CONFIG is not KEY=value (not shown: it may hold a secret)."
        key=${BASH_REMATCH[1]}
        value=${BASH_REMATCH[2]}
        value=${value#"${value%%[![:space:]]*}"}
        value=${value%"${value##*[![:space:]]}"}
        if [[ "$value" =~ $quoted_double ]] || [[ "$value" =~ $quoted_single ]]; then
            value=${BASH_REMATCH[1]}
        fi
        case "$ALLOWED_KEYS" in
            *" $key "*) printf -v "$key" '%s' "$value" ;;
            *) die "Unknown setting $key in $CONFIG." ;;
        esac
    done <"$CONFIG"
}

validate_config() {
    local name
    for name in FTP_SERVER FTP_USERNAME FTP_PASSWORD APP_URL DEPLOY_TOKEN; do
        [ -n "${!name}" ] || die "$name is missing in $CONFIG."
    done
    case "$DEPLOY_NAME" in staging | production) ;; *) die "DEPLOY_NAME must be staging or production." ;; esac
    case "$FTP_PROTOCOL" in ftp | ftps | ftps-legacy) ;; *) die "FTP_PROTOCOL must be ftp, ftps or ftps-legacy." ;; esac
    case "$FTP_VERIFY_CERT" in true | false) ;; *) die "FTP_VERIFY_CERT must be true or false." ;; esac
    [ "${#DEPLOY_TOKEN}" -ge 32 ] || die "DEPLOY_TOKEN must have at least 32 characters (it is the one in the server's .env)."
    [[ "$FTP_PORT" =~ ^[0-9]*$ ]] || die "FTP_PORT must be a number."

    APP_URL=${APP_URL%/}
    case "$APP_URL" in
        https://*) ;;
        http://127.0.0.1* | http://localhost*) ;;
        *) die "APP_URL must start with https:// (http is accepted only for localhost)." ;;
    esac
    # The workflow joins the folder and the path as strings, so the folder always ends with a slash.
    [[ "$FTP_SERVER_DIR" == /* ]] || FTP_SERVER_DIR=/$FTP_SERVER_DIR
    [[ "$FTP_SERVER_DIR" == */ ]] || FTP_SERVER_DIR=$FTP_SERVER_DIR/
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
check_tools() {
    local missing=() tool
    for tool in git php composer node npm curl jq rsync lftp sha256sum; do
        command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
    done
    if [ "${#missing[@]}" -gt 0 ]; then
        echo "Missing tools: ${missing[*]}" >&2
        echo "On Ubuntu: sudo apt install lftp rsync jq curl git php-cli php-mbstring php-intl php-xml unzip" >&2
        echo "Composer: https://getcomposer.org/download/   Node 22: https://nodejs.org/ (or nvm)" >&2
        exit 1
    fi
    [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || die "Node 22 or newer is needed (it is $(node -v))."
    php -r 'exit(PHP_VERSION_ID >= 80300 ? 0 : 1);' || die "PHP 8.3 or newer is needed (it is $(php -r 'echo PHP_VERSION;'))."
    for script in migrate requirements smoke; do
        [ -f "$SOURCE/.github/scripts/$script.sh" ] || die "$SOURCE/.github/scripts/$script.sh is missing: update the branch."
    done
}

describe_source() {
    BRANCH=$(git -C "$SOURCE" rev-parse --abbrev-ref HEAD)
    COMMIT=$(git -C "$SOURCE" rev-parse --short HEAD)
    DIRTY=false
    [ -z "$(git -C "$SOURCE" status --porcelain --untracked-files=no)" ] || DIRTY=true

    if [ "$DEPLOY_NAME" = production ]; then
        [ "$BRANCH" = main ] || die "Production is only deployed from main (this is $BRANCH)."
        [ "$DIRTY" = false ] || die "Production is only deployed from a clean checkout: commit or stash your changes."
    fi
}

confirm() {
    echo
    echo "  Environment : $DEPLOY_NAME"
    echo "  Site        : $APP_URL"
    echo "  FTP         : $FTP_USERNAME@$FTP_SERVER ($FTP_PROTOCOL), folder $FTP_SERVER_DIR"
    echo "  Source      : $BRANCH @ $COMMIT$([ "$DIRTY" = true ] && echo ' (with uncommitted changes, which ARE deployed)')"
    echo "  Mode        : $([ "$FULL" = true ] && echo 'full upload' || echo 'only what changed')"
    echo
    if [ "$DEPLOY_NAME" = production ]; then
        local answer
        read -r -p "Type 'production' to deploy to production: " answer
        [ "$answer" = production ] || die "Cancelled."
    elif [ "$ASSUME_YES" = false ]; then
        local answer
        read -r -p "Deploy to $DEPLOY_NAME? [y/N] " answer
        [[ "$answer" =~ ^[yY]$ ]] || die "Cancelled."
    fi
}

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
BUILD=""
cleanup() {
    [ -z "$BUILD" ] || rm -rf "$BUILD"
}

run_checks() {
    step "Fast checks of the CI (lint, static analysis, types, unit tests)"
    (cd "$SOURCE/api" && composer install --no-interaction --no-progress --prefer-dist && composer lint && composer analyse)
    (cd "$SOURCE" && npm ci && npm run lint && npm run typecheck && npm test)
    echo "The API integration tests and the E2E need MySQL 5.7: run them separately if you need them."
}

build_api() {
    step "Building the API (composer install --no-dev)"
    mkdir -p "$BUILD/api"
    rsync -a --exclude='/vendor/' --exclude='/node_modules/' --exclude='/.phpunit.cache/' \
        --exclude='/.env' --exclude='/.env.*' "$SOURCE/api/" "$BUILD/api/"
    (cd "$BUILD/api" && composer install --no-dev --optimize-autoloader --no-interaction --no-progress --prefer-dist)

    # The same exclusions as the workflow ("Upload the API"). vendor/bin only holds symlinks to development tools.
    mkdir -p "$BUILD/up-api"
    rsync -a --prune-empty-dirs \
        --exclude='.git*' --exclude='/public/' --exclude='/tests/' --exclude='/storage/' \
        --exclude='/.env' --exclude='/.env.*' --exclude='/.phpunit.cache/' --exclude='/phpcs.xml' \
        --exclude='/phpstan.neon.dist' --exclude='/phpunit.xml' --exclude='/vendor/bin/' \
        --exclude='/vendor/**/docs/' --exclude='/vendor/**/doc/' --exclude='/vendor/**/tests/' \
        --exclude='/vendor/**/Tests/' --exclude='/vendor/**/examples/' --exclude='/vendor/**/*.md' \
        "$BUILD/api/" "$BUILD/up-api/"

    mkdir -p "$BUILD/up-public-api" "$BUILD/up-migrations"
    rsync -a --exclude='.git*' "$SOURCE/api/public/" "$BUILD/up-public-api/"
    rsync -a "$SOURCE/db/migrations/" "$BUILD/up-migrations/"
}

build_web() {
    mkdir -p "$BUILD/up-web"
    if [ "$SKIP_BUILD" = false ]; then
        step "Building the web app (npm run build)"
        [ -d "$SOURCE/node_modules" ] || (cd "$SOURCE" && npm ci)
        (cd "$SOURCE" && npm run build)
    fi
    [ -f "$SOURCE/web/dist/index.html" ] || die "web/dist is empty: run without --skip-build."
    # The same exclusions as the workflow ("Upload the web app"): .htaccess and api/ belong to the server.
    rsync -a --exclude='.git*' --exclude='/.htaccess' --exclude='/api/' "$SOURCE/web/dist/" "$BUILD/up-web/"
}

# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------
STATE_DIR=""
SYNC_STATE_FILE=".ftp-deploy-sync-state.json"

# lftp reads the password from the environment, so it never shows up in a command line or a file.
run_lftp() {
    local script=$1
    LFTP_PASSWORD=$FTP_PASSWORD lftp -f "$script"
}

# Commands that open the connection. "ftps" is explicit FTPS (AUTH TLS on the normal port), as in the workflow;
# "ftps-legacy" is the implicit one.
lftp_header() {
    local scheme=ftp
    echo "set net:max-retries 8"
    echo "set net:reconnect-interval-base 5"
    echo "set net:timeout 30"
    echo "set cmd:fail-exit yes"
    echo "set cmd:queue-parallel 4"
    case "$FTP_PROTOCOL" in
        ftps)
            echo "set ftp:ssl-force true"
            echo "set ftp:ssl-protect-data true"
            ;;
        ftps-legacy) scheme=ftps ;;
    esac
    echo "set ssl:verify-certificate $([ "$FTP_VERIFY_CERT" = true ] && echo yes || echo no)"
    echo "open --env-password -u \"$FTP_USERNAME\" ${FTP_PORT:+-p $FTP_PORT }$scheme://$FTP_SERVER"
}

# Quotes a path for an lftp command.
q() {
    local text=${1//\\/\\\\}
    text=${text//\"/\\\"}
    printf '"%s"' "$text"
}

# The remote folder of a file whose local folder is `folder` ("." for the root of the target).
remote_folder() {
    if [ "$2" = . ]; then
        printf '%s' "${1%/}"
    else
        printf '%s/%s' "${1%/}" "$2"
    fi
}

# sync_target LABEL LOCAL_DIR REMOTE_DIR
# Uploads what differs from the last recorded state of LOCAL_DIR and removes what disappeared from it.
sync_target() {
    local label=$1 dir=$2 remote=$FTP_SERVER_DIR$3
    local state="$STATE_DIR/$label.sha256" new="$BUILD/$label.new" old="$BUILD/$label.old"
    local changed="$BUILD/$label.changed" removed="$BUILD/$label.removed" cmds="$BUILD/$label.lftp"

    step "$label -> $remote"
    # "hash  path", sorted by the whole line so `comm` can compare it with the recorded one.
    (cd "$dir" && find . -type f -print0 | xargs -0 -r sha256sum) | sed 's#  \./#  #' | LC_ALL=C sort >"$new"

    if [ "$FULL" = true ] || [ ! -f "$state" ]; then
        : >"$old"
    else
        LC_ALL=C sort "$state" >"$old"
    fi

    LC_ALL=C comm -13 "$old" "$new" | cut -c67- >"$changed"
    LC_ALL=C comm -23 <(cut -c67- "$old" | LC_ALL=C sort) <(cut -c67- "$new" | LC_ALL=C sort) >"$removed"

    local n_changed n_removed n_total
    n_changed=$(wc -l <"$changed")
    n_removed=$(wc -l <"$removed")
    n_total=$(wc -l <"$new")
    echo "$n_total files; $n_changed to upload, $n_removed to remove"

    if [ "$DRY_RUN" = true ]; then
        head -n 15 "$changed" | sed 's/^/  + /'
        [ "$n_changed" -le 15 ] || echo "  ... and $((n_changed - 15)) more"
        head -n 15 "$removed" | sed 's/^/  - /'
        return 0
    fi
    if [ "$n_changed" -eq 0 ] && [ "$n_removed" -eq 0 ]; then
        cp "$new" "$state"
        return 0
    fi

    {
        lftp_header
        # Folders first, then the files in parallel, then the removals (a missing file is not an error).
        sed -E 's#/[^/]*$##; t; s#.*#.#' "$changed" | LC_ALL=C sort -u | while IFS= read -r folder; do
            echo "mkdir -p -f $(q "$(remote_folder "$remote" "$folder")")"
        done
        while IFS= read -r path; do
            folder=${path%/*}
            [ "$folder" != "$path" ] || folder=.
            echo "queue put -O $(q "$(remote_folder "$remote" "$folder")") $(q "$dir/$path")"
        done <"$changed"
        echo "wait all"
        echo "set cmd:fail-exit no"
        while IFS= read -r path; do
            echo "rm -f $(q "${remote%/}/$path")"
        done <"$removed"
        echo "bye"
    } >"$cmds"
    run_lftp "$cmds"

    # Recorded only after the upload finished, so a failed run sends the same files again.
    cp "$new" "$state"
}

# Deletes the state files FTP-Deploy-Action keeps on the server: after a manual deployment they no longer describe
# what is there, and the next workflow run would skip files it thinks are already up to date.
forget_workflow_state() {
    step "Removing the workflow's sync state from the server"
    local cmds="$BUILD/forget.lftp" folder
    {
        lftp_header
        echo "set cmd:fail-exit no"
        for folder in db/migrations/ api/ public/api/ public/; do
            echo "rm -f $(q "$FTP_SERVER_DIR$folder$SYNC_STATE_FILE")"
        done
        echo "bye"
    } >"$cmds"
    run_lftp "$cmds"
}

# The scripts of the workflow, with the same settings the workflow gives them.
remote_step() {
    local script=$1
    shift
    APP_URL=$APP_URL DEPLOY_TOKEN=$DEPLOY_TOKEN bash "$SOURCE/.github/scripts/$script.sh" "$@"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
trap cleanup EXIT
load_config
validate_config
check_tools
describe_source
[ "$DRY_RUN" = true ] || confirm

[ "$RUN_TESTS" = false ] || run_checks

BUILD=$(mktemp -d "${TMPDIR:-/tmp}/soltec-deploy.XXXXXX")
chmod 700 "$BUILD"
STATE_DIR="$SOURCE/.deploy-state/$DEPLOY_NAME"
mkdir -p "$STATE_DIR"

build_api
build_web

# 1) Migrations first: the schema is ready before the code that needs it (ADR-0003).
sync_target migrations "$BUILD/up-migrations" db/migrations/
if [ "$DRY_RUN" = false ] && [ "$UPLOAD_ONLY" = false ]; then
    step "Applying migrations"
    # 404/405 are tolerated only here: on the very first deployment the endpoint is not on the server yet.
    remote_step migrate --allow-missing
fi

# 2) The application.
sync_target api "$BUILD/up-api" api/
sync_target api-front-controller "$BUILD/up-public-api" public/api/
sync_target web "$BUILD/up-web" public/

if [ "$DRY_RUN" = true ]; then
    echo
    echo "Dry run: nothing was uploaded and the server was not contacted."
    exit 0
fi

forget_workflow_state

if [ "$UPLOAD_ONLY" = false ]; then
    step "Server requirements"
    remote_step requirements
    step "Applying migrations (a no-op unless this is the first deployment)"
    remote_step migrate
    step "Smoke test and server diagnostics"
    remote_step smoke
fi

echo
echo "Deployed $BRANCH @ $COMMIT to $DEPLOY_NAME ($APP_URL)."
