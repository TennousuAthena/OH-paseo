#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HDC_BIN="${HDC_BIN:-/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc}"
DEVICE="${HDC_TARGET:-192.168.2.120:37687}"
EXPECTED_MODEL="${HDC_EXPECTED_MODEL:-HAD-W32}"
CDP_PORT="${OHPASEO_CDP_PORT:-9226}"
device() { "$HDC_BIN" -t "$DEVICE" "$@"; }
MODEL="$(device shell param get const.product.model | tr -d '\r\n ')"
if [[ "$MODEL" != "$EXPECTED_MODEL" ]]; then
  echo "Expected registered device $EXPECTED_MODEL, got: $MODEL" >&2
  exit 1
fi
case "${1:-status}" in
  status)
    device shell param get const.product.name
    device shell param get const.ohos.apiversion
    device shell pidof moe.kiwi.ohpaseo || true
    ;;
  install)
    VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT_DIR/upstream/paseo/packages/app/package.json")"
    HAP="${2:-$ROOT_DIR/artifacts/OH-Paseo-$VERSION-universal-debug.hap}"
    test -f "$HAP"
    # hdc can exit 0 even when Bundle Manager rejects the package.
    INSTALL_RESULT="$(device install -r "$HAP")"
    echo "$INSTALL_RESULT"
    [[ "$INSTALL_RESULT" == *"install bundle successfully"* ]] || exit 1
    ;;
  launch)
    LAUNCH_RESULT="$(device shell aa start -a EntryAbility -b moe.kiwi.ohpaseo)"
    echo "$LAUNCH_RESULT"
    [[ "$LAUNCH_RESULT" == *"start ability successfully"* ]] || exit 1
    ;;
  capture)
    OUTPUT="${2:?Specify a local .jpeg output path}"
    device shell snapshot_display -f /data/local/tmp/ohpaseo-verification.jpeg
    device file recv /data/local/tmp/ohpaseo-verification.jpeg "$OUTPUT"
    ;;
  forward)
    PID="$(device shell pidof moe.kiwi.ohpaseo | tr -d '\r\n ')"
    [[ "$PID" =~ ^[0-9]+$ ]] || { echo 'OH-Paseo is not running' >&2; exit 1; }
    [[ "$CDP_PORT" =~ ^[0-9]+$ ]] || { echo 'Invalid CDP port' >&2; exit 2; }
    echo "Remove only a stale Paseo tcp:$CDP_PORT forwarding rule if one already exists."
    device fport "tcp:$CDP_PORT" "localabstract:webview_devtools_remote_$PID"
    ;;
  *) echo 'Usage: matebook-device.sh [status|install [HAP]|launch|capture OUTPUT.jpeg|forward]' >&2; exit 2 ;;
esac
