# P0 进度记录


日期：2026-10-21。状态：**G0 通过**。P0.3 实测完成 —— **路线 A 存在根本性阻塞，需要降级方案或换路线**。

## 已完成

- **真机连接恢复**：hdc TCP `DEVICE_ADDRESS` 已重连，`TCP Connected`；shell 验证通过（`HUAWEI MateBook Pro`，API 26，`arm64-v8a`，存储 1.6T 可用）。设备无 node/git 系统命令。
- **仓库初始化**：`OH-Paseo/` 建立 git 仓库与计划目录结构（`upstream/paseo`、`patches/paseo`、`platform/harmonyos`、`web/host-adapters`、`runtime`、`scripts`、`tests`、`docs/probes`）。
- **上游基线**：`upstream/paseo` clone 并 checkout 到调研快照 `3081b99b06aa29bf39b9a83aaed73cf854e4a89b`（main 分支，2026-10-20）。稳定版 `v0.12.0`（`cafe4b01`，2026-10-19）与快照差 5993 个提交且非祖先关系——它们在不同分支线上。决策：以调研快照为开发基线（与所有调研结论一致），v0.12.0 差异列入后续逐项核对。
- **鸿蒙工程骨架**：`platform/harmonyos` Stage/UIAbility 工程可构建，`entry-default-unsigned.hap` 已产出。
  - bundleName：`com.ohpaseo.dev`；deviceTypes：`2in1`,`tablet`（SDK 26 device-define 中无 `phone` syscap，手机类型后续再议）。
  - SDK 副本：`~/OpenHarmony/sdk/26.0.0/{ets,js,native,previewer,toolchains}`（hvigor 26 要求 SDK 可写且按 `apiVersion/component` 布局，从 DevEco 内置 SDK 复制 5.3G）。
  - `hvigorw` 包装脚本指向 `${HOME}/OpenHarmony/sdk` 并注入 `OHOS_BASE_SDK_HOME` / `DEVECO_SDK_HOME`。

## 进行中 / 阻塞

**G0 已全部通过**（2026-10-21 00:05）：
- ✅ HAP 构建、签名、安装到测试 PC 成功
- ✅ `aa start -a EntryAbility -b moe.kiwi.ohpaseo` 启动成功，EntryAbility 进入 foreground
- ✅ bundleName: `moe.kiwi.ohpaseo`，profile: `type=debug` + `app_gallery` issuer + UDID 白名单（含测试 PC）
- ✅ hilog 可抓取应用日志

**踩过的坑**：
- `runtimeOS` 必须设为 `HarmonyOS`（不能是 `OpenHarmony`）才能让 IDE 走华为账号 + UDID 白名单 debug profile 通道。`OpenHarmony` 会落到 `os_integration` 类型的过期模板
- `module.json5` 需要 `abilities[0].exported: true` 否则 `aa start` 拒绝
- `deviceTypes` 在 DevEco IDE 操作后会被重写为只有 `tablet`——需要保留 `2in1`（PC 目标）
- IDE SDK `~/Library/OpenHarmony/Sdk` 中 `ninja` 是 x86_64-only，需用 `~/OpenHarmony/sdk/26.0.0/native/build-tools/cmake/bin/ninja`（arm64）覆盖

## 待办（按 P0 清单）

- [x] **G0 闭环**：签名 HAP 安装到测试 PC 并冷启动成功，hilog 日志已抓取（2026-10-21 00:05）
- [x] **P0.3 实测**：Node 启动路径全部踩完，结果见下 —— **HarmonyOS NEXT 沙箱不允许 execve 任何独立二进制**；`libnode.so` 嵌入式路径被 V8 init 的 seccomp/CHECK 阻塞（不是 SIGSYS 了，是 V8 自己的 fatal check）
- [ ] **P0.4 ArkWeb 探针**：UI 有入口，未验证（下次跑 app 时点 "Open ArkWeb probe")
- [ ] P0.2 完成：v0.12.0 vs 3081b99 差异审计（269 文件改动集中在 server/app；先记要点，逐项必要性随功能推进核对）
- [ ] **路线决策**：基于 P0.3 发现，评估三个降级方案（见下）
- [ ] P0.5 路线报告

## 关键发现

- **hvigor 26 SDK 布局变更**：`sdkmanager-common` 校验要求组件路径为 `<sdkRoot>/<fullApiVersion>/<component>`（`platformVersion` 字段 `26.0.0`），且 SDK 目录必须可写。DevEco 内置路径只读，故复制到 `~/OpenHarmony/sdk/`。
- **设备侧无 node/git**：`/system/bin` 只有系统工具，daemon 依赖必须打包进应用或使用 HNP。
- **Paseo server 依赖**：`node-pty@1.2.0-beta.15`、`sherpa-onnx-node@1.12.28`、各 provider SDK（`@anthropic-ai/claude-agent-sdk@0.3.246`、`openai`、`@opencode-ai/sdk`）——原生移植核心门槛确认存在。
- **server 构建链**：`tsc` + esbuild + 复制 skills/plugins/shell-integration 资源到 `dist/server`；daemon 入口 `dist/scripts/supervisor-entrypoint.js`。

## P0.3 实测结论（2026-10-21 01:00）

### 尝试路径

| 方案 | 结果 | 阻塞原因 |
|---|---|---|
| `fork + execv` 独立 node 进程（binary 在 rawfile → filesDir) | ❌ execve `EPERM` | filesDir 目录被 mount 成 noexec / SELinux 不允许 |
| `fork + execv` 独立 node 进程（binary 伪装成 `libnodex.so` 放 libs/arm64) | ❌ execve `EACCES` | libs/ 也 noexec；且 hdc shell 手动 chmod+exec `/data/local/tmp/node` 也被拒（`shell` domain 都不让）|
| `libnode.so + node::Start` 嵌入式（同进程） | ⚠️ 非常接近但卡死 | 通过三层障碍后死在 V8 `Check failed: 12 == errno`（具体 subsystem 未定位）|

### 已越过的障碍

1. **dlopen libnode.so.137** OK — 需要把 `libc++_shared.so` 一起打包，否则 linker 失败
2. **SIGSYS (signo 31)** — V8 init 时 probe seccomp 不允许的 syscall，之前直接 kill。修复：在 `libentry.so` constructor 注册 SIGSYS handler, aarch64 下把 `uc->uc_mcontext.regs[0]` 设为 `-ENOSYS` 并 `pc += 4` 跳过 svc 指令
3. **libuv io_uring 探测 crash** — musl `__dlvsym` bug 导致 `strlen` crash。修复：导出 `io_uring_setup/enter/register` stub 符号，返回 -1 + errno=ENOMEM（内核拒绝 io_uring 时 errno 就是 ENOMEM)

### 当前卡死点

V8 init 中某处 `CHECK(12 == *errno_location())` 失败 —— 说明有代码期待 `errno=ENOMEM` 但拿到的是别的值（可能 `EAGAIN`/`ENOSYS`/0)。这是 **release build 的 CHECK，无文件/行号**。可能触发点：
- `v8::base::Thread::CreateThreadLocalKey` — `pthread_key_create` 失败（TLS 槽耗尽？)
- V8 `Malloced::New` / `Zone` 分配 — `malloc` 返回 null 后 errno 不对
- `uv_loop_init` 内部 — 某个 probe 期待 `ENOMEM` 返回

**注意**：`main thread` 是 "MainThread"(TID 7376）而非我们 spawn 的 pthread —— 说明 `node::Start` 把当前 pthread 认成 "MainThread" 注册到 V8 platform,signal handler 以 MainThread 名义 install。这暗示 V8 `Platform` 与 `main` 线程模型在嵌入场景有假设。

### 降级路径评估与最终裁定（2026-10-21 01:05)

1. **嵌入式 Node(libnode.so + node::Start)** — dlopen、SIGSYS、io_uring 三关已过，但死在 V8 `CHECK(errno == ENOMEM)`（具体 subsystem 未定位，release build 无行号）。每修一个 probe 会暴露下一个 CHECK —— HarmonyOS seccomp 返回的 errno 模式与 V8 的预期不匹配，是系统性问题而非单点 bug。**作为可行性判断：嵌入式在 2in1 上可作 demo，但不能作为 daemon 生产路径**（宿主进程耦合，crash 即整 app 死）。

2. **Worker/AbilityStage 隔离** — ArkTS Worker 是独立线程但仍是 ArkTS runtime，不能跑 Node.js;daemon 逻辑重写为 ArkTS 会失去 upstream server 兼容（269 文件审计面)。

3. **HNP 分发独立 binary** — ❌ 已验证不可行：`/system/bin/hnp`、`native_daemon`、`nativespawn` 存在但 `shell` domain 都无权 `ls`;HNP 是系统内部分发机制，第三方应用无法安装或 exec HNP 包。

4. **远程 Paseo server + ArkWeb 前端** — 剩余唯一不依赖 native exec 的路线。daemon 跑云端/局域网,HarmonyOS 端只做前端。**实质等同原计划路线 B**，但 P0.3 证明路线 A 的 native-exec 前提在 HarmonyOS NEXT 上不成立 —— 不是实现问题，是平台策略。

### 路线裁定

**路线 A（原生 daemon 跑在设备上）在 HarmonyOS NEXT API 26 上不成立。** 三个判据：
- app 无法 `execve` 任何独立二进制（app 数据、HAP libs、tmp 目录均被 SELinux/noexec 拒；`shell` domain 同样被拒）
- 嵌入式 `libnode.so` 被 V8 的 errno-CHECK 体系系统性阻塞（seccomp errno 语义不符）
- HNP 不开放给第三方应用

下一步建议按计划 P0.5 出路线 ADR，主推荐：**远程 daemon + ArkWeb 客户端**(Paseo server on dev-machine/云，device 只做 UI)。若仍要本地体验，次选为嵌入式 libnode 做受限 daemon(Short-lived，每次会话重新 init,crash 重启整个 app——只能当 beta)。P0.4 ArkWeb 探针（crypto/IDB/WS/Worker/IME）变为必测项，因为前端将承担全部 UI 职责。
