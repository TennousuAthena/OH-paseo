# OH-Paseo 资料阅读与验证记录

记录日期：2026-10-20。资料用途为开发计划；已连接真机并读取设备信息，尚未构建或在鸿蒙设备运行 Paseo。用户已明确优先鸿蒙原生运行，暂不接受同机 Linux 融合开发引擎。

## 1. 当前项目与工具检查

- 项目目录：`/Users/USER/Workspace/DevEco/OH-Paseo`。初始仅有空 `docs/` 和 `.DS_Store`，未发现已有实现或 Git 仓库。
- 未发现工作目录及其父级的 `AGENTS.md`。
- DevEco Studio：`/Applications/DevEco-Studio.app`，product-info 显示 `26.0.0.851`。
- SDK：`Contents/sdk/default/sdk-pkg.json` 显示 `apiVersion: 26`、`platformVersion: 26.0.0`、Release。
- 系统 PATH 未找到 hdc/ohpm/hvigorw；IDE 自带对应工具，规划阶段没有修改 PATH。
- hdc：`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc`，版本 `3.2.0f`。
- 初次 `hdc list targets` 与 `hdc list targets -v` 返回 `[Empty]`；用户随后提供网络地址，保持本机 hdc 服务运行后已连接 `DEVICE_ADDRESS`。
- 已读取 HUAWEI MateBook Pro（HAD-W32）、2in1、API 26、arm64-v8a 和 `OpenHarmony-7.0.0.105`；签名授权尚未验证。详见 [设备基线](device-baseline.md)。
- 本轮只写入规划文档，没有更改现有 Paseo 配置、重启现有 daemon、安装 PC 应用或操作代理授权。

## 2. Paseo：官方文档与源码

### 2.1 阅读基线

- [官方文档索引](https://paseo.sh/llms.txt)：已读取。
- [源码仓库](https://github.com/getpaseo/paseo)：已拉取只供阅读的浅 clone。
- 固定调研快照：[`3081b99b06aa29bf39b9a83aaed73cf854e4a89b`](https://github.com/getpaseo/paseo/tree/3081b99b06aa29bf39b9a83aaed73cf854e4a89b)，2026-10-20。
- [最新 release 查询结果 v0.12.0](https://github.com/getpaseo/paseo/releases/tag/v0.12.0)：GitHub API 显示发布时间 `2026-10-19T07:07:47Z`。
- `git ls-remote` 验证 annotated tag 的 peeled commit 为 `cafe4b01c8522ff39560241c5deb01427dc8dc5b`。它与调研 main 快照不是同一个提交，实施前需比较差异。
- 临时阅读路径：`/tmp/oh-paseo-research.9n7TbM/upstream`。它不是项目依赖，可能被系统清理；本文中的固定提交链接可重建资料基线。

站点的 `connectivity.md`、`web-ui.md`、`security.md` 在线直取出现 403/抓取失败，因此改读同一上游仓库的 `public-docs/` 原文件。不是把失败页面当成已读取的证据。

### 2.2 已查阅的源码入口与结论

以下路径均相对上述固定调研提交。

| 入口 | 已确认的内容 | 对移植的意义 |
|---|---|---|
| [docs/architecture.md](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/docs/architecture.md) | 客户端/daemon 分离；WebSocket；Electron 管理本机 daemon | 必须分别验证界面与本机执行 |
| [packages/app/package.json](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/packages/app/package.json) | Expo 57、RN 0.86.3、CodeMirror、xterm、多项 Expo/native 依赖 | 不将 Expo 原生模块默认视作鸿蒙可用 |
| [packages/desktop/package.json](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/packages/desktop/package.json) | Electron 44.2.0；依赖 server/CLI | 鸿蒙 Electron 的 API/ABI 兼容需另测 |
| [packages/server/package.json](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/packages/server/package.json) | node-pty、sherpa-onnx-node、各 provider SDK | 本机执行不是单纯构建 Web |
| [packages/app/metro.config.cjs](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/packages/app/metro.config.cjs) | `PASEO_WEB_PLATFORM` 可解析平台 overlay | 可以集中存放鸿蒙适配，避免复制业务 UI |
| [packages/app/src/desktop/host.ts](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/packages/app/src/desktop/host.ts) | 宿主桥含窗口、对话框、浏览器、通知等接口 | 可参考现有接口拆出宿主能力 |
| [packages/app/src/constants/platform.ts](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/packages/app/src/constants/platform.ts) | Electron 判断与 desktop host 绑定 | ArkWeb 不能只伪造 `paseoDesktop` |
| [client WebSocket transport](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/packages/client/src/daemon-client-websocket-transport.ts) | 浏览器 factory 与带 header 的 native factory 分开 | ArkWeb 使用浏览器限制，不能照搬 native headers |
| [client relay transport](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/packages/client/src/daemon-client-relay-e2ee-transport.ts) | relay upgrade 后才进行 E2EE；凭据不能提前发出 | 配对和认证复用上游实现 |
| [packages/relay/src/crypto.ts](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/packages/relay/src/crypto.ts) | tweetnacl；Curve25519/XSalsa20-Poly1305；需要安全随机源 | 本地页面需验证随机源，不能自换加密协议 |
| `runtime/replica-cache/row-store.web.ts` 与 native 版本 | Web 使用 IndexedDB；native 使用 Expo SQLite | ArkWeb 先复用 Web 存储，测试 origin 与缓存恢复 |
| `components/terminal-emulator.tsx` 及 native/webview 分支 | 已有终端实现和平台分支 | 优先复用 Web xterm，重点移植 PTY 后端 |
| `.tool-versions` | Node `22.20.0` | Node 20 系列鸿蒙运行资料不能直接证明兼容 |

还阅读了上游 `AGENTS.md` 的工程规则和协议兼容要求；实施时需要重新遵循实际选择基线中的文件。

### 2.3 连接与 Web 文档

- [Web UI 原文](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/public-docs/web-ui.md)：daemon 可以同源提供 Web UI、API、WebSocket 和服务代理；该能力默认关闭。启用配置在实施阶段用独立测试实例处理。
- [Connectivity 原文](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/public-docs/connectivity.md)：SSH、relay 和直连的能力边界不同；SSH 不负责安装/启动远端 daemon。
- [Security 原文](https://github.com/getpaseo/paseo/blob/3081b99b06aa29bf39b9a83aaed73cf854e4a89b/public-docs/security.md)：relay 为可选功能，配对链接是信任入口；直连同样需要认证和传输保护。

## 3. HarmonyOS 与运行时资料

### H1：ArkWeb

- [ArkWeb 简介](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/web-component-overview)
- [多设备 Web 适配 FAQ](https://developer.huawei.com/consumer/en/doc/harmonyos-faqs-V14/faqs-arkweb-92-V14)
- [ArkWeb 调试](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/web-debugging-with-devtools)

已读本地官方文档镜像的 `web-component-overview.md`：提供 Web 页面加载、JS 交互、存储和调试能力。可以据此建立宿主探针；Paseo 的实际编辑器、IME、终端、加密和存储仍须实测。多端布局应响应窗口尺寸。

### H2：网络、设备与进程

- [WebSocket 开发指导](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/websocket-connection)
- [module.json5 配置](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/module-configuration-file)
- [Native 子进程指导](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/capi-nativechildprocess-development-guideline)
- [扩展进程指导](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/extended-process-development)：已发现入口，在线正文抓取失败，尚未据此确认接口用法。
- [外部来源扩展程序说明](https://consumer.huawei.com/cn/support/content/zh-cn16079826/)

已读本地官方镜像的 module、WebSocket 和 Native 子进程文档。module 配置提到 PC 的 `executableBinaryPaths`（API 24 起）；这只是声明能力的证据，不能推出任意 Linux 二进制、PTY、代理或外部代码都可执行。Native 子进程的动态库入口和父进程生命周期也不同于通用 daemon。

### H3：融合开发引擎——已调研、当前不采用

[华为官方：融合开发引擎常见问题](https://consumer.huawei.com/cn/support/content/zh-cn16091898/)

已读官方正文：它提供 Linux 环境与共享目录；文档涉及 openEuler、网络模式、IP 变化和服务启动限制。它支持“同一台 PC 内运行 Linux 工具”的路线评估。**本文没有证据证明现有 PC 已安装该引擎，或 Paseo/代理已在其中通过测试。**

此为最初调研的候选方案。用户已明确暂不接受，当前计划不验证或部署该引擎，也不把它当作原生路线失败后的自动替代。

### H4：Harmony Electron——不能遗漏的 PC 候选

- [OpenHarmony SIG Electron 指导仓库](https://gitcode.com/openharmony-sig/electron)：已读可访问的 README 部分。
- [华为 Electron 鸿蒙化资料入口](https://developer.huawei.com/consumer/cn/forum/topic/0201224006482777110)：搜索索引可见，正文直取失败。
- [ohosvscode/ohos_electron_hap 模板](https://github.com/ohosvscode/ohos_electron_hap)：已读取原始 README；属于可参考的模板，权限/版本说明仍需独立核对。

资料确认存在 HAP 接入方式及原生库/资源要求。SIG 当前可访问说明涉及 `pc_chromium_132` 和 Node 20.18.1；没有因此确认其完整支持 Paseo 的 Electron 44.2.0。准确运行时版本、可分发构建包及更新维护情况列入 P0。

若自行全量编译，SIG 文档列出 Ubuntu x86_64 和较高的磁盘/内存需求；现有 Mac 不能直接按该流程承诺完成。优先检查可复用构建产物。

### H5：RNOH

[React Native for OpenHarmony 项目](https://gitcode.com/CPF-RN/ohos_react_native)

已读当前 README：默认 main 不保证稳定，示例推荐稳定 tag 为 `0.82-stable`。Paseo 调研基线为 RN 0.86.3/Expo 57，因此需要版本和 NativeModule 清单核对。没有找到足够证据证明可以直接打包为鸿蒙 app，不将 RNOH 设为无风险默认路线。

## 4. harmonyos-ai-skill 与本地知识库

- 用户提供的仓库：`/Users/USER/Workspace/DevEco/harmonyos-ai-skill`，提交 `8683eabf9aa926a3f4339f2c8a33c107f350ff68`。
- 实际可读技能文件：[dist/claude-code/harmonyos-development/SKILL.md](../../harmonyos-ai-skill/dist/claude-code/harmonyos-development/SKILL.md)。README 提及的源目录 `harmonyos-development/` 在本地不存在，故读取实际 dist 文件。
- 已参考：Stage、ArkTS 限制、module 配置、WebSocket、ArkWeb/桥接、后台任务、安全存储、响应式窗口、键盘、文件选择、测试与工具。
- 其平台概述停留在 API 23/24；部分示例属于简化/概念示例。没有复制为项目模板，也没有把该文件覆盖到项目 AGENTS.md。
- [harmonyos-doc-lookup 技能](../../../../.agents/skills/harmonyos-doc-lookup/SKILL.md) 提供本地官方资料；依赖检查通过。实际知识库位于 `/Users/USER/.agents/skills/harmonyos-doc-lookup/docs/`。

资料使用顺序：目标设备实测与所选 SDK 声明 → 对应版本官方指南 → 固定上游源码 → 技能示例。遇到差异记录版本，不凭技能的版本概述锁定最低 API。

## 5. 结论的证据等级

| 判断 | 等级 |
|---|---|
| Paseo 可以分开移植客户端与 daemon | 已由源码确认 |
| Paseo Web 可作为复用的业务层 | 已有上游实现；鸿蒙运行兼容未测 |
| 现有 PC 已连通 hdc | 已确认；TCP Connected，独立 shell 调用多次成功 |
| 融合开发引擎存在且可承载 Linux 环境 | 官方资料确认；用户当前不采用 |
| Paseo 与至少一个代理能在该机完成开发 | 未验证；P0/G1 核心门槛 |
| 鸿蒙 Electron 能原样运行 Paseo 44 桌面版 | 未确认；不得承诺 |
| 原生 node-pty、HNP Git、代理可执行 | 未验证；原生路线核心门槛 |
| 三端均已适配 | 未验证；需分别完成真机用例 |

本次交付的是有来源和验收门槛的开发计划；性能数字均为待冻结目标，未提供虚构跑分或真机截图。
