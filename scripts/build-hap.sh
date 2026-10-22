#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-debug}"
ARTIFACT_TARGET="${2:-universal}"
case "$MODE" in debug|release) ;; *) echo 'Usage: build-hap.sh [debug|release] [artifact-target]' >&2; exit 2 ;; esac
[[ "$ARTIFACT_TARGET" =~ ^[a-z0-9-]+$ ]] || { echo 'Invalid artifact target' >&2; exit 2; }
VERSION="$(python3 "$ROOT_DIR/scripts/sync-app-version.py")"
python3 "$ROOT_DIR/scripts/bundle-harmonyos-web.py"
cd "$ROOT_DIR/platform/harmonyos"
./hvigorw assembleHap --mode module -p product=default -p "buildMode=$MODE" --no-daemon
mkdir -p "$ROOT_DIR/artifacts"
OUTPUT="$ROOT_DIR/artifacts/OH-Paseo-$VERSION-$ARTIFACT_TARGET-$MODE.hap"
cp entry/build/default/outputs/default/entry-default-signed.hap "$OUTPUT"
shasum -a 256 "$OUTPUT"
