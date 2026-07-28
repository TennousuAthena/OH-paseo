{
  lib,
  stdenv,
  buildNpmPackage,
  nodejs_22,
  python3,
  makeWrapper,
  autoPatchelfHook,
  copyDesktopItems,
  makeDesktopItem,
  electron,
  libuv,
  # Reuse the daemon's prebuilt npm-deps FOD. Same lockfile, same content —
  # without this, the desktop drv produces a separately-named store path
  # (`paseo-desktop-<v>-npm-deps`) and refetches the entire registry. Override
  # the upstream hash via `paseo.override { npmDepsHash = "..."; }`.
  paseo,
}:

let
  version = (builtins.fromJSON (builtins.readFile ../package.json)).version;
  darwinInfoPlist = builtins.toFile "Paseo-Info.plist" (
    lib.generators.toPlist { escape = true; } {
      CFBundleDisplayName = "Paseo";
      CFBundleExecutable = "Paseo";
      CFBundleIconFile = "Paseo.icns";
      CFBundleIdentifier = "sh.paseo.desktop";
      CFBundleInfoDictionaryVersion = "6.0";
      CFBundleName = "Paseo";
      CFBundlePackageType = "APPL";
      CFBundleShortVersionString = version;
      CFBundleURLTypes = [
        {
          CFBundleURLName = "Paseo agent link";
          CFBundleURLSchemes = [ "paseo" ];
        }
      ];
      CFBundleVersion = version;
      LSApplicationCategoryType = "public.app-category.developer-tools";
      LSEnvironment.MallocNanoZone = "0";
      LSMinimumSystemVersion = "12.0";
      NSAppTransportSecurity.NSAllowsArbitraryLoads = true;
      NSAudioCaptureUsageDescription = "Paseo needs access to audio capture for voice input.";
      NSBluetoothAlwaysUsageDescription = "Paseo needs access to Bluetooth audio devices.";
      NSBluetoothPeripheralUsageDescription = "Paseo needs access to Bluetooth audio devices.";
      NSCameraUsageDescription = "Paseo needs access to the camera for image attachments.";
      NSHighResolutionCapable = true;
      NSMainNibFile = "MainMenu";
      NSMicrophoneUsageDescription = "Paseo needs access to the microphone for voice input.";
      NSPrefersDisplaySafeAreaCompatibilityMode = false;
      NSPrincipalClass = "AtomApplication";
      NSQuitAlwaysKeepsWindows = false;
      NSRequiresAquaSystemAppearance = false;
      NSSupportsAutomaticGraphicsSwitching = true;
    }
  );
in
buildNpmPackage {
  pname = "paseo-desktop";
  inherit version;

  src = lib.cleanSourceWith {
    src = ./..;
    filter =
      path: type:
      let
        baseName = builtins.baseNameOf path;
        relPath = lib.removePrefix (toString ./..) path;
      in
      # Exclude mobile-only platform code (we only need the web/electron build)
      !(lib.hasPrefix "/packages/app/android" relPath)
      && !(lib.hasPrefix "/packages/app/ios" relPath)
      # Website is unrelated to the desktop app
      && !(lib.hasPrefix "/packages/website" relPath)
      # Documentation, CI definitions and agent/editor configuration. None of
      # these reach the build, but every one of them is part of `src`, so a
      # docs-only or workflow-only commit currently invalidates the whole
      # desktop derivation and pays for a full Expo export to produce a
      # byte-identical result.
      && !(lib.hasPrefix "/docs" relPath)
      && !(lib.hasPrefix "/.github" relPath)
      && !(lib.hasPrefix "/.agents" relPath)
      && !(lib.hasPrefix "/.claude" relPath)
      && !(lib.hasPrefix "/.codex" relPath)
      && !(lib.hasPrefix "/docker" relPath)
      # Top-level prose only (README, CHANGELOG, AGENTS...). Deeper markdown is
      # not necessarily documentation: skills/*/SKILL.md is a runtime file the
      # installPhase copies into the output.
      && builtins.match "/[^/]+\\.md" relPath == null
      # Test fixtures and build artifacts
      && !(lib.hasSuffix ".test.ts" baseName)
      && !(lib.hasSuffix ".e2e.test.ts" baseName)
      && baseName != "node_modules"
      && baseName != ".git"
      && baseName != ".paseo"
      && baseName != ".DS_Store"
      && baseName != "release";
  };

  nodejs = nodejs_22;
  inherit (paseo) npmDeps;

  # Prevent onnxruntime-node's install script from running during automatic
  # npm rebuild. We manually rebuild only node-pty in buildPhase.
  npmRebuildFlags = [ "--ignore-scripts" ];

  nativeBuildInputs =
    [
      python3 # for node-gyp (node-pty)
      makeWrapper
    ]
    ++ lib.optionals stdenv.hostPlatform.isLinux [
      autoPatchelfHook
      copyDesktopItems
    ];

  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    libuv
    stdenv.cc.cc.lib # libstdc++ for sherpa-onnx prebuilt binaries
  ];

  dontNpmBuild = true;

  env = {
    EXPO_NO_TELEMETRY = "1";
    # Expo's web build pulls in some pre-bundled assets; ensure it doesn't try
    # to phone home during the build.
    CI = "1";
  };

  buildPhase = ''
    runHook preBuild

    # Native deps (terminal emulation; libuv-linked on Linux)
    npm rebuild node-pty

    # Server workspaces (highlight + relay + protocol + client + server + cli)
    npm run build:server

    # App workspace deps not covered by build:server
    npm run build --workspace=@getpaseo/expo-two-way-audio

    # Expo web export for the Electron renderer
    ( cd packages/app && PASEO_WEB_PLATFORM=electron npx expo export --platform web )

    # Desktop main process (tsc only — NOT electron-builder)
    npm run build:main --workspace=@getpaseo/desktop

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/paseo-desktop $out/bin

    # Materialize only the desktop and daemon runtime graphs. Copying the
    # complete monorepo used to ship every build-time dependency (including
    # Electron, Expo tooling, and cross-platform builder binaries), making the
    # desktop output larger than 2 GiB.
    PASEO_TRACE_DESKTOP=1 node scripts/trace-daemon.mjs > desktop-files.txt

    while IFS= read -r path; do
      [ -z "$path" ] && continue
      mkdir -p "$out/share/paseo-desktop/$(dirname "$path")"
      cp -a "$path" "$out/share/paseo-desktop/$path"
    done < desktop-files.txt

    # Keep the same unpackaged monorepo layout expected by main.js.
    cp package.json $out/share/paseo-desktop/
    mkdir -p $out/share/paseo-desktop/packages/app
    cp -a packages/app/dist $out/share/paseo-desktop/packages/app/

    for runtime_path in \
      packages/desktop/dist/main.js \
      packages/desktop/dist/preload.js \
      packages/desktop/dist/features/browser-keyboard/guest-preload.js \
      packages/desktop/package.json; do
      if [ ! -e "$out/share/paseo-desktop/$runtime_path" ]; then
        echo "desktop runtime trace omitted $runtime_path" >&2
        exit 1
      fi
    done

    if [ -e $out/share/paseo-desktop/node_modules/electron ]; then
      echo "desktop runtime trace included npm Electron" >&2
      exit 1
    fi

    # Skills directory referenced at runtime by some agents
    if [ -d skills ]; then
      cp -a skills $out/share/paseo-desktop/
    fi

    ${lib.optionalString stdenv.hostPlatform.isLinux ''
      # Hicolor icon for desktop environments
      install -Dm644 packages/desktop/assets/icon.png \
        $out/share/icons/hicolor/512x512/apps/paseo-desktop.png

      # Chromium's setuid sandbox cannot live in the immutable Nix store.
      makeWrapper ${electron}/bin/electron $out/bin/paseo-desktop \
        --add-flags "$out/share/paseo-desktop/packages/desktop/dist/main.js" \
        --add-flags "--no-sandbox" \
        --set EXPO_DEV_URL "paseo://app/"

      copyDesktopItems
    ''}

    ${lib.optionalString stdenv.hostPlatform.isDarwin ''
      app="$out/Applications/Paseo.app"
      mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

      # Reuse nixpkgs' Electron framework through store symlinks so the Paseo
      # output stays small while still presenting a normal application bundle
      # to LaunchServices.
      ln -s ${electron}/Applications/Electron.app/Contents/Frameworks \
        "$app/Contents/Frameworks"
      ln -s ${electron}/Applications/Electron.app/Contents/MacOS/Electron \
        "$app/Contents/MacOS/Electron"
      for resource in ${electron}/Applications/Electron.app/Contents/Resources/*; do
        ln -s "$resource" "$app/Contents/Resources/$(basename "$resource")"
      done

      cp ${darwinInfoPlist} "$app/Contents/Info.plist"
      cp ${electron}/Applications/Electron.app/Contents/PkgInfo "$app/Contents/PkgInfo"
      cp packages/desktop/assets/icon.icns "$app/Contents/Resources/Paseo.icns"

      # Keep the same unpackaged runtime layout as the Linux Nix package. The
      # outer .app supplies native macOS identity, icon, and URL handling while
      # the wrapper points Electron at the immutable built main process.
      makeWrapper "$app/Contents/MacOS/Electron" "$app/Contents/MacOS/Paseo" \
        --add-flags "$out/share/paseo-desktop/packages/desktop/dist/main.js" \
        --set EXPO_DEV_URL "paseo://app/"
      ln -s ../Applications/Paseo.app/Contents/MacOS/Paseo "$out/bin/paseo-desktop"
    ''}

    runHook postInstall
  '';

  desktopItems = lib.optionals stdenv.hostPlatform.isLinux [
    (makeDesktopItem {
      name = "paseo-desktop";
      desktopName = "Paseo";
      genericName = "AI Coding Agents";
      comment = "Self-hosted daemon for AI coding agents";
      exec = "paseo-desktop";
      icon = "paseo-desktop";
      categories = [ "Development" ];
      startupWMClass = "Paseo";
    })
  ];

  meta = {
    description = "Paseo desktop app (Electron wrapper)";
    homepage = "https://github.com/getpaseo/paseo";
    license = lib.licenses.agpl3Plus;
    mainProgram = "paseo-desktop";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
