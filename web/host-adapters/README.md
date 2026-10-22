# ArkWeb host boundary

The HarmonyOS host is `platform/harmonyos/entry/src/main/ets/pages/Paseo.ets`.
It opens the selected daemon's own Web UI and persists only its service URL.
Paseo's existing initial connection hint, protocol, local storage, workspace,
terminal and reconnect code are reused. Two source patches in `web/patches/`
adapt the tablet composer and workspace side insets; apply them with
`bash scripts/apply-paseo-web-patches.sh` before building the daemon Web UI.

There is no injected `window.paseoDesktop` or privileged JavaScript bridge.
The client does not claim to be Electron. The daemon, agent processes, Git,
PTY and project files remain on the selected remote host.

The native host shows URL setup on first launch and retry/address controls on
load failure. There is no persistent native toolbar above the Paseo UI.
It handles loading timeout, main-frame HTTP and transport errors, and
renderer-exit recovery. WebSocket
connection state and retries are displayed by Paseo itself. Page load success
does not mean an authenticated daemon connection has succeeded.

Debug HAPs expose ArkWeb DevTools over the device's local abstract socket;
release builds set web debugging off. Local file access and HTTPS mixed content
are disabled; certificate errors are not bypassed.

LAN HTTP on API 26 supports the tested core task/terminal/editor workflow, but
does not provide a secure context: WebCrypto, Async Clipboard and microphone
capabilities must not be inferred from the packaged P0 probe's results.
Paseo's legacy copy fallback plus HarmonyOS Ctrl+V works on the tested PC.
Use a trusted HTTPS origin for features requiring a secure context.

On touch tablets, Return inserts a newline even in the wide layout. A mouse
pointer retains desktop Enter-to-send behavior. The existing reactive pointer
hook also updates this behavior when input capabilities change.

On ArkWeb tablets, the workspace shell ignores horizontal camera insets so a
side camera does not create a full-height blank strip. System top/bottom insets
are retained. Other browsers and native clients retain upstream safe-area
behavior. This adjustment is limited to the workspace/sidebar layout, not the
global safe-area provider or the keyboard.
