---
title: "I was wrong about Electron"
description: "Why I migrated Paseo from Tauri to Electron after the small-binary story stopped mattering more than rendering, notifications, and bundling a Node daemon."
date: "2026-05-28"
draft: "false"
---

When I started building Paseo, I picked Tauri.

The reasoning felt obvious at the time. I was building a desktop app with a web UI, and I cared about shipping something that did not feel bloated. Like a lot of developers, I had also internalized the idea that Electron was the bad option.

Tauri had all the right stuff: Rust, tiny binaries, native webviews, lower memory usage. It felt like the tasteful choice. I thought I knew better than all those other Electron apps.

You see this attitude everywhere. Products put "Built with Tauri" on their landing pages as if the framework itself is a selling point. I bought into that more than I realized.

At first, it felt like I was right. On macOS, the app was small, the UI worked well, and the bundle size made the decision feel obviously correct.

Windows did not really challenge that either. Tauri uses WebView2 there, which is Chromium-based, so the app behaved close enough to what I expected. There were platform details to deal with, but nothing that changed my mind.

Linux is where things started getting complicated.

Tauri does not bundle one browser engine across platforms. That is the point. On Linux, it relies on WebKitGTK, which sounds elegant until you are debugging rendering behavior across distros, GPU setups, and Wayland/X11 differences.

For Paseo, this turned into a lot of product work I did not want to be doing. The WebKitGTK bindings Tauri was using were too old. Wayland had problems. And once I got the app running, it just looked different. Not slightly different in the way you expect across platforms, and not only small things like font weights. Some screens had real layout differences.

I could maybe have lived with all of this, but then I started implementing notifications.

For Paseo, notifications are not a nice to have. If an agent finishes, fails, or needs attention, I want the user to click the notification and land in the right place.

Tauri's notification plugin can show notifications, but desktop click handling was not there in the way I needed. The Actions API exists, but the docs mark it as mobile-only, which was strange.

I noticed Tauri was expanding into mobile apps too. I get why that is exciting for the project, and I am not saying they should not do it. But from where I was sitting, it was hard not to feel some doubt. I was still fighting basic desktop product issues while the framework was moving into a much larger surface area.

I got notification clicks working by writing platform-specific code, but it was not straightforward, and now I had to maintain it. By then the pattern was familiar: the app needed a normal desktop behavior, and I was writing the missing glue myself.

There was also the daemon. This part is not really Tauri's fault, but it pushed me further toward Electron.

Paseo has a Node.js daemon, and I wanted a one-click experience. Download the app, open it, and go. No separate Node install. No manual daemon setup. No "run this command first."

Tauri supports sidecars, so I got the daemon bundled and it worked. But it became its own project: different binaries for different platforms and target triples, packaging details, permissions, process spawning, paths, upgrades. None of it was impossible. That was almost the problem. I kept making it work while slowly building around the framework instead of with it.

At some point I had the realization that I was building Electron with extra steps.

I decided to try Electron. The migration was a bit of a pain, but I got things working surprisingly fast, and after a week of solid work Paseo actually felt lighter and simpler. The UI looked the same across platforms. Notifications behaved the way I needed. The daemon fit naturally because Node was already there.

The app got bigger, obviously. Electron ships Chromium and Node. That is the tradeoff everyone knows about.

What I had missed was that app size was not the tradeoff that mattered most for Paseo. This is a development environment with a web UI, a local daemon, terminals, agents, process management, notifications, permissions, and long-running state. I need it to behave predictably on macOS, Windows, and Linux more than I need a small bundle.

I still think Tauri is appealing. If your app is mostly a Rust app with a web UI, or if you are staying on one platform and really care about bundle size, it can be a good choice. But at that point, I do wonder if you should just bite the bullet and write a native app.
