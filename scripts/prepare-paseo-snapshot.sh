#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM="$ROOT_DIR/upstream/paseo"
SNAPSHOT="$ROOT_DIR/runtime/verified-paseo"
COMMIT=1c00b365c9e0b74c1580eba33d905d693125ae21 # v0.15.4
if [[ -e "$SNAPSHOT" ]]; then
  if [[ -f "$SNAPSHOT/.upstream-commit" && "$(cat "$SNAPSHOT/.upstream-commit")" == "$COMMIT" ]]; then
    echo "Reusing existing source snapshot: $SNAPSHOT"
    bash "$ROOT_DIR/scripts/apply-paseo-web-patches.sh" "$SNAPSHOT"
    exit 0
  fi
  echo "Refusing to overwrite existing snapshot without the expected commit marker." >&2
  exit 1
fi
git -C "$UPSTREAM" cat-file -e "$COMMIT^{commit}"
mkdir -p "$ROOT_DIR/runtime"
TEMP_SNAPSHOT="$(mktemp -d "$ROOT_DIR/runtime/.paseo-snapshot.XXXXXX")"
trap 'rm -rf "$TEMP_SNAPSHOT"' EXIT
git -C "$UPSTREAM" archive "$COMMIT" | tar -x -C "$TEMP_SNAPSHOT"
bash "$ROOT_DIR/scripts/apply-paseo-web-patches.sh" "$TEMP_SNAPSHOT"
# Install from this snapshot's lockfile. Dependencies and generated code from a
# different release must not leak into the packaged client.
printf '%s\n' "$COMMIT" > "$TEMP_SNAPSHOT/.upstream-commit"
mv "$TEMP_SNAPSHOT" "$SNAPSHOT"
trap - EXIT
echo "Prepared source snapshot: $SNAPSHOT"
echo "Install dependencies: npm --prefix '$SNAPSHOT' ci"
