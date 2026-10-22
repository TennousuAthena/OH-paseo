#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM="$ROOT_DIR/upstream/paseo"
SNAPSHOT="$ROOT_DIR/runtime/verified-paseo"
COMMIT=3081b99b06aa29bf39b9a83aaed73cf854e4a89b
if [[ -e "$SNAPSHOT" ]]; then
  if [[ -f "$SNAPSHOT/.upstream-commit" && "$(cat "$SNAPSHOT/.upstream-commit")" == "$COMMIT" ]]; then
    echo "Reusing existing source snapshot: $SNAPSHOT"
    bash "$ROOT_DIR/scripts/apply-paseo-web-patches.sh" "$SNAPSHOT"
    exit 0
  fi
  echo "Refusing to overwrite existing snapshot without the expected commit marker." >&2
  exit 1
fi
test -d "$UPSTREAM/node_modules"
test -f "$UPSTREAM/packages/server/dist/server/web-ui/index.html"
git -C "$UPSTREAM" cat-file -e "$COMMIT^{commit}"
mkdir -p "$ROOT_DIR/runtime"
TEMP_SNAPSHOT="$(mktemp -d "$ROOT_DIR/runtime/.paseo-snapshot.XXXXXX")"
trap 'rm -rf "$TEMP_SNAPSHOT"' EXIT
git -C "$UPSTREAM" archive "$COMMIT" | tar -x -C "$TEMP_SNAPSHOT"
bash "$ROOT_DIR/scripts/apply-paseo-web-patches.sh" "$TEMP_SNAPSHOT"
# Reuse installed dependencies and build artifacts; this is not a clean install.
ln -s "$UPSTREAM/node_modules" "$TEMP_SNAPSHOT/node_modules"
for PACKAGE in "$UPSTREAM"/packages/*; do
  NAME="$(basename "$PACKAGE")"
  [[ -d "$TEMP_SNAPSHOT/packages/$NAME" ]] || continue
  for ENTRY in node_modules dist; do
    if [[ -d "$PACKAGE/$ENTRY" && ! -e "$TEMP_SNAPSHOT/packages/$NAME/$ENTRY" ]]; then
      ln -s "$PACKAGE/$ENTRY" "$TEMP_SNAPSHOT/packages/$NAME/$ENTRY"
    fi
  done
done
if [[ -d "$UPSTREAM/plugins/dist" && ! -e "$TEMP_SNAPSHOT/plugins/dist" ]]; then
  ln -s "$UPSTREAM/plugins/dist" "$TEMP_SNAPSHOT/plugins/dist"
fi
printf '%s\n' "$COMMIT" > "$TEMP_SNAPSHOT/.upstream-commit"
mv "$TEMP_SNAPSHOT" "$SNAPSHOT"
trap - EXIT
echo "Prepared source snapshot: $SNAPSHOT"
