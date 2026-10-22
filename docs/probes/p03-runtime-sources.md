# P0.3 鸿蒙本机执行环境候选（调研快照）

记录日期：2026-10-20。仅资料调研，未在真机验证。

## 结论速览

| 路线 | 可行性 | 关键证据 | 建议 |
|---|---|---|---|
| **HAP 内嵌 `libnode.so`（dlopen）** | ✅ 社区已实测可用 | `electerm/ohos-node-shared`（`--shared` 构建真 `ET_DYN`，提供 `libnode-arm64.so` 预编译）；mailing-list 报告已在 API 26 真机跑通 `node v24.2.0` | **首选 daemon 宿主**。无需独立进程，规避子进程签名/权限 |
| **HNP 打包 node CLI** | ✅ 官方支持 | `hnpcli` 已在 OpenHarmony SDK 中；`module.json5` 支持 `hnpPackages`；公有/私有安装路径明确（`/data/service/hnp`、`/data/app`） | **Git/代理 CLI 分发的正确路径**；也可用于独立 node CLI |
| `hqzing/ohos-node` 独立可执行 | ✅ 有发布 | `node-v24.2.0-openharmony-arm64.tar.gz`；`--partly-static` 构建 PIE 可执行 | 仅用于 `hdc shell` 调试/排错，**不要**用于应用内嵌（PIE `PT_INTERP` 会崩 dlopen） |
| OHcode 参考实现 | ✅ 完整工程 | `HanversionOvO/OHcode` 已用 HNP 分发 `node.hnp`/`bash.hnp`/`rg.hnp`，并用 `libelectron.so` + QEMU 做 2in1 VS Code | 借鉴 HNP 结构、RepackHapWithHnp 流水线、OhPty 思路 |
| HarmonyOS Electron | ⚠️ 资料不完整 | openharmony-sig/electron 存在但公开 release 情况待查；OHcode 的 `libelectron.so` 是 200MB 社区构建 | 暂不优先；ArkWeb 宿主已能复用 Paseo Web 业务层 |
| `childProcessManager.startArkChildProcess` | ❌ 设备返回 801 | 邮件列表实测 `Capability not support`，hilog 无子进程入口日志 | **不依赖**；用 `dlopen`/`fork`/`execv` 组合替代 |

## 关键技术约束（API 26 / arm64 实测结论）

来源：`lists.openatom.io` 技术分享 + `electerm/ohos-node-shared` README（2026-10）。

1. **必须真共享库**：`libnode.so` 必须是 `ET_DYN` 且无 `PT_INTERP`。`--partly-static` 产物是 PIE，`dlopen` 会把 `local-exec` TLS 别名到宿主进程 → V8 在 `Isolate::Initialize` 首次堆分配就崩。
   - 校验：`llvm-readelf -l libnode.so | grep -c INTERP` 必须为 0。
2. **`libc++_shared.so` 必须同包**：漏了的症状是 `dlopen` 静默失败，ArkTS 拿到 `undefined`。
3. **`argc` 必须排除 `argv` 末尾 `nullptr` 哨兵**，多算一个 → Node 拿 NULL → 5ms 段错误。
4. **libuv `io_uring_setup` 被 seccomp trap**：需要 SIGSYS handler 把它转成 `-1`（不是 `-ENOSYS`），并设 `UV_USE_IO_URING=0`，必须在 libuv 初始化**之前**。
5. **`require('internal/...')` 只认 `process.execArgv`**：`--expose-internals` 不在 `NODE_OPTIONS` 白名单，必须出现在启动参数。
6. **同一进程内 `node::Start` 只能调一次**（`node.cc` 断言）→ 进程内"自动重启 daemon"这条设计不可行；重启要重启进程。

## 与 Linux 不一致的 syscall（Node 代码需适配）

| 调用 | OpenHarmony arm64 行为 | 替代方案 |
|---|---|---|
| `flock(2)` | `not supported` | 单进程场景视作成功；或改用 `open('wx')` 语义 |
| `link(2)` | `EACCES permission denied` | 用 `open(dst,'wx')` 保 `EEXIST`；确认不存在后 `rename` |
| 沙箱内日志文件 | `hdc` 读不到（permission denied） | native 关键日志**同时打 hilog**，否则排查被动 |
| `fork`/`execv("/system/bin/sh")` | 手机模拟器 `Permission denied`；2in1/PC 模拟器可跑 | PC 形态优先；手机侧退化为只连接远程 daemon |

## node-pty / Git / 代理 CLI 现状

- **node-pty**：上游依赖 `1.2.0-beta.15`，需要 OHOS 原生 `.node`。社区 `ohos-npm-ports` 已有 `bufferutil`/`sqlite3`/`typescript` 适配先例；`node-pty` 暂无公开 OHOS 构建，**需要移植**。
- **Git**：无 OHOS 现成 arm64 二进制公开下载；需交叉编译或用 `dulwich`/纯 JS Git（`isomorphic-git`）做客户端，再用 HNP 分发自建 `git` 二进制。
- **代理 CLI**（`@anthropic-ai/claude-agent-sdk`、`openai`、`@opencode-ai/sdk`）：都是纯 JS/TS npm 包，但需要 Node 运行时 + 网络栈；鸿蒙端只要 `libnode.so` 起来即可直接 `node` 跑，无需逐个移植。**关键前提仍是 `libnode.so` + `libc++_shared.so` 能 dlopen**。
- **sherpa-onnx-node`@1.12.28`**：daemon 启动期就有 `import`，是语音依赖。要么交叉编译 ONNX Runtime + sherpa 到 OHOS，要么把 daemon 的语音模块隔离为可选，P1 时先拆。

## 下一步动作（按优先级）

1. 从 `electerm/ohos-node-shared` 下载 `libnode-arm64.so` + `libc++_shared.so`（arm64，API 26 已实测可跑）。
2. 在 `platform/harmonyos/entry` 建 `cpp/` NAPI 模块，`dlopen libnode.so` 调 `node::Start` 起一个最小 `node -e "console.log('hi')"` 探针。
3. 用 `hnpcli` 把 HQZing 的 `node` 可执行 + `git` 二进制打成 HNP，嵌入 HAP 验证 `module.json5.hnpPackages` 和 `/data/app/bin` PATH 注入。
4. 对照 `OHcode` 的 `OhPtyChild` 与 `libelectron.so` 加载方式，决定 daemon 是「进程内 dlopen」还是「HNP 独立进程」——前者简单、后者更接近上游 daemon 模型。
5. 若走 HNP 独立进程，验证 `fork`/`execv` 在 2in1 真机（非模拟器）沙箱下可用，并确认 stdout/stderr 能跨进程回传给 ArkUI（管道 or TCP loopback）。
