#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
    echo ".env not found. Copy .env.example to .env and configure deployment settings." >&2
    exit 1
fi

set -a
# shellcheck source=/dev/null
source .env
set +a

required_vars=(DEPLOY_HOST DEPLOY_USER DEPLOY_BASE_DIR)
for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        echo "$var must be set in .env before deploying." >&2
        exit 1
    fi
done

DEPLOY_SUB_DIR="${DEPLOY_SUB_DIR:-}"

if [[ ! "$DEPLOY_BASE_DIR" =~ ^/?[A-Za-z0-9._/-]+$ ]] ||
    [[ ! "$DEPLOY_SUB_DIR" =~ ^[A-Za-z0-9._/-]*$ ]]; then
    echo "Deployment paths may contain only letters, numbers, '.', '_', '-', and '/'." >&2
    exit 1
fi

DEPLOY_BASE_DIR="${DEPLOY_BASE_DIR%/}"
DEPLOY_SUB_DIR="${DEPLOY_SUB_DIR#/}"
DEPLOY_SUB_DIR="${DEPLOY_SUB_DIR%/}"
REMOTE_DIR="$DEPLOY_BASE_DIR"
if [[ -n "$DEPLOY_SUB_DIR" ]]; then
    REMOTE_DIR="$REMOTE_DIR/$DEPLOY_SUB_DIR"
fi

if [[ -z "$REMOTE_DIR" || "$REMOTE_DIR" == "/" ]]; then
    echo "DEPLOY_BASE_DIR must identify a deployment directory, not the filesystem root." >&2
    exit 1
fi

if [[ "/$REMOTE_DIR/" == *"/../"* || "/$REMOTE_DIR/" == *"/./"* ]]; then
    echo "Deployment paths must not contain '.' or '..' path segments." >&2
    exit 1
fi

TARGET="$DEPLOY_USER@$DEPLOY_HOST"
SSH_DIR="$HOME/.ssh"
CONTROL_PATH="$SSH_DIR/mapgenerator-deploy-$$"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

cleanup() {
    ssh -S "$CONTROL_PATH" -O exit "$TARGET" >/dev/null 2>&1 || true
    rm -f "$CONTROL_PATH"
}
trap cleanup EXIT

echo "Connecting to $TARGET (enter your SSH password if prompted)..."
ssh -o ControlMaster=auto \
    -o ControlPath="$CONTROL_PATH" \
    -o ControlPersist=10m \
    -fN "$TARGET"

if [[ ! -d node_modules ]]; then
    echo "Installing dependencies from package-lock.json..."
    npm ci
fi

echo "Building Map Generator..."
npm run build

if [[ ! -f dist/index.html ]]; then
    echo "Build completed without producing dist/index.html; deployment stopped." >&2
    exit 1
fi

echo "🚀 Deploying to $TARGET:$REMOTE_DIR"
echo "Only the configured web directory will be updated; remote files are not deleted."
ssh -S "$CONTROL_PATH" "$TARGET" "mkdir -p -- '$REMOTE_DIR'"
rsync -avz --progress \
    -e "ssh -S $CONTROL_PATH" \
    dist/ "$TARGET:$REMOTE_DIR/"

echo "✅ Deployment complete."
if [[ -n "${PRODUCTION_DOMAIN:-}" ]]; then
    PRODUCTION_DOMAIN="${PRODUCTION_DOMAIN%/}"
    if [[ -n "$DEPLOY_SUB_DIR" ]]; then
        echo "Web URL: $PRODUCTION_DOMAIN/$DEPLOY_SUB_DIR/"
    else
        echo "Web URL: $PRODUCTION_DOMAIN/"
    fi
else
    echo "Deployed files: $TARGET:$REMOTE_DIR/"
fi
