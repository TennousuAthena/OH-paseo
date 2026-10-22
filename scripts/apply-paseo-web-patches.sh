#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${1:-$ROOT_DIR/upstream/paseo}"
SOURCE="$(cd "$SOURCE" && pwd)"
# A source archive may sit inside OH-Paseo's repository. Do not let git apply
# treat it as a subdirectory of that outer repository and silently skip paths.
apply_patch() { (cd "$SOURCE" && GIT_CEILING_DIRECTORIES="$(dirname "$SOURCE")" git apply "$@"); }
for PATCH in "$ROOT_DIR"/web/patches/*.patch; do
  if apply_patch --check "$PATCH" 2>/dev/null; then
    apply_patch "$PATCH"
    echo "Applied $(basename "$PATCH")"
  elif apply_patch --reverse --check "$PATCH" 2>/dev/null; then
    echo "Already applied: $(basename "$PATCH")"
  else
    echo "Patch does not match source; refusing to overwrite local changes: $PATCH" >&2
    exit 1
  fi
done
