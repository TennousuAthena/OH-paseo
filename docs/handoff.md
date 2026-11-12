# OH-Paseo 交接文档

## 当前交接（2026-11-13）

鸿蒙适配基线已跟进官方 **Paseo v0.15.4**，固定提交 `1c00b365c9e0b74c1580eba33d905d693125ae21`，HAP 版本 `0.15.4 / 1000010`。调试包和未签名 release 包已构建，平板与 MateBook Pro 均已原位升级并通过核心端到端测试；安装证据、模型测试边界和清理结果见 [0.15 系列记录](paseo-0.15-validation.md)。电脑本次地址为 `192.168.2.120:40679`；手机最后确认安装的仍是 0.15.2。用户已授权发布 `harmonyos-v0.15.4`，公开附件与校验信息见 [发布产物](paseo-0.15-validation.md#0154-公开发布产物)。

本次 App Web、client、protocol、plugin 实现源码均未变，8 个鸿蒙补丁原样可用，补丁涉及的 28 个源码文件与 0.15.2 相同。已运行更新的 Claude 模型定向测试（105 项）及必要类型、lint 和构建检查，随后按用户要求完成平板及电脑核心端到端验证，没有重复扫码、横竖屏和系统返回专项回归。本轮设备测试未发现需要修改产品代码的问题；临时环境已清理，两台设备均已回到各自原工作区。

`runtime/verified-paseo` 现在是独立安装依赖的 0.15.4，0.15.2 完整快照保留在 `runtime/verified-paseo-0.15.2`。可选推送插件开发 SDK 同步至 0.15.4，兼容范围仍为 0.13–0.15；其生命周期实现未变。正式 daemon 和 AGC 签名配置本轮未更改。新增模型目录依赖主机端升级，具体条件见验证记录。

## 历史交接（2026-11-06）

鸿蒙适配已跟进官方 **Paseo v0.15.2**，固定提交 `e896c05b09707e711a2324fcab7da84a0ae57291`。MateBook Pro（HAD-W32）、MatePad Pro（WEB-W00）及用户随后要求更新的 Mate 80 Pro Max（SGT-AL10）均已原位升级至 `0.15.2 / 1000009`，沿用现有签名。电脑地址由用户纠正为 `192.168.2.120:42477`，平板继续使用 `192.168.2.220:43789`；手机地址为 `192.168.2.136:45965`，已核实安装版本并启动成功，未追加未改动功能测试。

电脑已核验关于页、新版主题预览网格、首次设置入口和冷启动恢复；平板已核验横屏、用户实际旋转后的竖屏、触屏 Return 换行与隔离主机消息往返。电脑和平板升级前后的主机配置、草稿和设置摘要一致。原工作区离线是用户内网未开启，按用户要求不处理其连接；用户确认扫码正常，后续只测本次变更影响的部分。具体产物与验证范围见 [0.15 电脑与平板验证](paseo-0.15-validation.md)。

8 个补丁已重新基于干净 0.15.2 生成并验证可重复应用，保留上游新版设置与布局变化。实际构建仍统一读取 `runtime/verified-paseo`，0.14.0 快照及依赖保留在 `runtime/verified-paseo-0.14.0`；不要复用其他版本的依赖或覆盖 `upstream/paseo` 原有改动。

用户随后授权上传本版 Release，发布标签为 `harmonyos-v0.15.2`，沿用预览版与未签名 release HAP 的惯例。公开产物、校验和及验证范围见 [0.15 发布产物](paseo-0.15-validation.md#公开发布产物)。

可选 `harmonyos-push` 插件已验证兼容 0.15 并热加载为 `running`，正式 6767 daemon 未重启。华为云实际送达仍受此前暂缓 AGC 签名迁移的决定限制，见 [推送配置状态](harmonyos-push.md)。本轮临时测试主机、反向端口和临时文件均已清理，平板保留开发调试连接与 24 小时亮屏超时覆盖。

## 历史更新（2026-10-31）

鸿蒙适配已跟进官方 **Paseo v0.14.0**，固定提交 `8c6de842a3157530c26a7a94c78a3d647fb96ce9`。按用户要求先在 MatePad Pro（WEB-W00）开发测试，已原位升级至调试版 `0.14.0 / 1000007`。手机与 PC 的完整回归仍待进行。

用户随后要求安装到 HUAWEI Mate 80 Pro Max（SGT-AL10）。已用相同通用调试包原位覆盖手机上的 0.13.0，Bundle Manager 确认 `0.14.0 / 1000007`。启动命令因手机锁屏返回 `10106102`，待用户解锁后验证启动；不应关闭开发者模式或改动锁屏设置。PC 尚未安装本轮版本。

用户已授权推送源码并发布 `harmonyos-v0.14.0`。沿用公开预览版及未签名 release HAP 的惯例，产物、校验和与验证范围统一见 [0.14 平板验证](paseo-0.14-tablet-validation.md#公开发布产物)。

构建、版本同步和默认安装产物统一使用 `runtime/verified-paseo`。旧快照保留在 `runtime/verified-paseo-0.13.0`；不要复用旧版本依赖或生成文件。`upstream/paseo` 原有改动保留。构建准备与安装命令见 [README.harmonyos.md](../README.harmonyos.md)，本轮结果、产物与待办见 [0.14 平板验证](paseo-0.14-tablet-validation.md)。

本轮补齐了旧补丁遗漏的鸿蒙宿主/扫码能力导出，修正输入框补丁以保留上游发送快捷键设置，并加入 Web 导出版本、提交及补丁摘要校验。后续升级必须从干净上游验证全部补丁；不能把旧快照中的手工修复当成补丁集的一部分。

## 历史更新（2026-10-22，以下版本和运行进程信息不代表当前状态）

平板新增外链系统浏览器打开和系统 Back 分层返回，已完成真机验证并安装 release 内部版本 1000003；手机按用户要求未动。用户随后在手机体验后确认发布，GitHub 公开包已覆盖为 1000003。见 [导航验证](navigation-validation.md)。用户要求插电平板保持常亮，当前保留常亮锁与 24 小时超时覆盖，后续不要默认恢复。

最新启动流程改为 HAP 内置 Paseo Web UI（`paseo://app/`），移除原生开发主机连接页；先进入 Paseo，再在应用内添加主机。手机已验证直接连接、项目列表、历史任务与冷启动恢复；见 [内置界面验证](bundled-startup-validation.md)。随后手机和平板已加入系统扫码入口，均通过真实二维码经 relay.paseo.sh 配对并加载项目，已升级到 release。见 [扫码验证](qr-scan-validation.md)。PC 尚未回归此启动改动。旧远程 origin 配置需重新添加，daemon 数据保留。

最新通用 release 已覆盖上传到 GitHub `harmonyos-v0.12.0`，内部版本 1000003，包含内置界面、扫码、外链浏览器打开与系统返回修复。新包 SHA256：`5aca46cdf1fef0f509f48b7fd4ac66922604fc4d563959b84a6f1290f9e7d3e2`；扫码轮设备实测安装为内部编号 1000001；其后平板已继续升级至导航修复 1000003。

版本跟随已落实：当前上游客户端 0.12.0 → 鸿蒙 versionName 0.12.0、versionCode 1000003。构建前 scripts/sync-app-version.py 自动同步，HAP 文件名也读取上游版本；重复构建不递增，版本变更递增内部编号。三台设备已升级并通过 bm dump 核实版本。最新产物 `artifacts/OH-Paseo-0.12.0-universal-release.hap`，SHA-256 `86cec16ed504e6f26b988277b91238b2cb6976080eace314ed117776714ae9ac`，包含此前主题和安全区修复。下文旧版本包哈希为历史证据。

应用显示名和窗口标题已按用户要求改为 **Paseo**，应用及启动图标使用上游固定提交中的官方 PNG。包标识保留 `moe.kiwi.ohpaseo`，升级后原工作区正常恢复；来源见 [branding.md](branding.md)。

用户明确项目仍在开发，核心流程验证不等于开发完成。按最新反馈已删除额外的“OH-Paseo / 连接设置 / 重新加载”顶部工具栏；正常页面直接显示 Paseo，当前已进一步移除地址配置入口，首次进入内置 Paseo 欢迎页。新包已安装到 MateBook Pro，原工作区恢复正常。

用户已明确确认本轮采用 **远程 daemon + 鸿蒙客户端**。MateBook Pro 的真实 Codex 修复任务、终端、Git diff、中文编辑、审批接受/拒绝、断线恢复、升级与冷启动恢复均已验证。当前设备安装的是 release 构建模式的 `0.1.0`，仍使用已登记设备的 debug 签名。

- 当前入口：`platform/harmonyos/entry/src/main/ets/pages/Paseo.ets`；内置 Web UI，主机由 Paseo 添加并持久化。P0 探针源码保留。
- 构建：`bash scripts/build-hap.sh debug` / `release`；使用 DevEco 自带 Node，系统 Node 26 不能直接用于当前 Hvigor release 构建。
- 已修复：Web.src 状态变化不导航，改为显式 `controller.loadUrl`；增加 `GET_NETWORK_INFO` 以修复恢复在线后审批停滞；排除约 245 MiB 的旧 Node 动态库。
- `upstream/paseo` 接手前已有 Claude provider 源码删除和依赖修改，原样保留。当前 6769 服务仍运行；需要重启时使用报告中的固定源码快照，不要重置工作树，也不要盲删 PID 文件。
- 临时 6770 启动验证服务已停止，过期 9226 WebView 转发已移除。用户正式 6767 daemon 未改动。
- PC、平板、手机核心流程已各完成一轮验证；两小时持续运行、长期睡眠、公网 TLS/鉴权、语音及文件附件尚未验证。最新统一包已覆盖 PC/平板并验证启动；本轮未重复 PC/平板的完整横竖屏流程。

## 以下为接手前历史记录

历史记录中的“原生路线全面不可行”“ArkWeb 探针全绿”“P1 尚未开始”等描述，不作为当前验收结论。当前事实以上述报告为准。

> 日期:2026-10-22。本文档面向接手此项目的 Agent/开发者,包含全部必要上下文。
> 阅读顺序:本文件 → `docs/development-plan.md`(原始计划)→ `docs/p0-progress.md`(实测记录)。

## 项目目标

把 Paseo(AI coding agent 环境,upstream: `upstream/paseo` @ `3081b99`)交付到 HarmonyOS 设备,顺序 PC(2in1)→ 平板 → 手机。

## 当前阶段结论(最重要)

**P0 可行性门槛已完成,核心结论:路线 A(在设备上原生跑 daemon)在 HarmonyOS NEXT API 26 上不可行。** 已切换 **路径 1:远程 Paseo daemon + ArkWeb 客户端**, daemon 跑在 Mac 上,设备端只做 ArkWeb UI。

三条 P0.3 实测否决证据(详见 `docs/p0-progress.md`):

1. `fork+execv` 独立二进制 → `EPERM`/`EACCES`,SELinux 全面禁止 app exec(包括 HAP 内 libs/、filesDir、shell domain 的 /data/local/tmp)
2. 嵌入式 `libnode.so` → 过了 dlopen/SIGSYS/io_uring 三关后,死在 V8 `CHECK(errno == ENOMEM)`(release build 无行号,系统性 errno 语义冲突)
3. HNP → `/system/bin/hnp` 存在但系统内部,第三方不可用

**P0.4 ArkWeb 探针全绿**:crypto/WebCrypto、IndexedDB、WebSocket、Worker、WASM、localStorage、fetch 全部 OK。UA = Chrome/144 (ArkWeb/7.0.0.109)。

## 环境(已配好,勿重配)

### Mac 侧

- 工作目录:`/Users/USER/Workspace/DevEco/OH-Paseo`
- SDK:`~/Library/OpenHarmony/Sdk/26.0.0/`(IDE 管理,优先)与 `~/OpenHarmony/sdk/26.0.0/`(备用)
  - **注意**:IDE SDK 的 `native/build-tools/cmake/bin/ninja` 原是 x86_64-only,已用 `~/OpenHarmony/sdk` 的 arm64 版本覆盖
- hdc:`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc`
- 签名:`~/.ohos/config/default_harmonyos_zRv_rptXdDYmFhxchOhaGsjXdIZajeXXqEQ60qbFtTk=.{cer,p12,p7b}`,debug profile,UDID 白名单含测试 PC
- Node:系统 `/opt/homebrew/bin/node` v26.12.0(.tool-versions 要 22.20.0 但无 engines 约束,26 可跑)

### 设备侧

- 测试机:HUAWEI MateBook Pro,HarmonyOS NEXT API 26,arm64-v8a
- hdc TCP:`DEVICE_ADDRESS`(无线调试会掉线,掉了需用户在 **设置→无线调试** 重开,IP/端口可能变)
- Mac LAN IP:`DEVICE_ADDRESS`(同网段)
- 设备 UDID:`ECB6911177DC2447172FAF4CA40A0801B8643A877A0DE1F59BA85AA5E1A8BACF`

### App

- bundleName:`moe.kiwi.ohpaseo`(**不是** com.ohpaseo.dev,Index.ets 里有处旧文本未更新)
- deviceTypes:`["2in1","tablet"]`(API 26 无 "phone" syscap;IDE 有时会把 deviceTypes 重写为仅 tablet,需盯防)
- `module.json5` 里 EntryAbility 必须 `exported: true`(否则 `aa start` 报 10103001)
- `build-profile.json5` 的 `runtimeOS` 必须是 `"HarmonyOS"`(写 `"OpenHarmony"` 会走 os_integration 过期模板,9568257 安装失败)

## 标准操作流程

### 构建 + 安装 + 启动

```bash
cd /Users/USER/Workspace/DevEco/OH-Paseo/platform/harmonyos
./hvigorw assembleHap --mode module -p product=default -p buildMode=debug
# 产物:entry/build/default/outputs/default/entry-default-signed.hap

HDC=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc
$HDC tconn DEVICE_ADDRESS
$HDC -t DEVICE_ADDRESS install -r entry/build/default/outputs/default/entry-default-signed.hap
$HDC -t DEVICE_ADDRESS shell aa start -a EntryAbility -b moe.kiwi.ohpaseo
```

### UI 自动化(无需用户点屏)

```bash
$HDC -t <dev> shell uitest dumpLayout          # → /data/local/tmp/layout_*.json
$HDC -t <dev> file recv /data/local/tmp/layout_XXX.json /tmp/L.json
# 解析 JSON 找 Button bounds,取中心点
$HDC -t <dev> shell uitest uiInput click <x> <y>
$HDC -t <dev> shell snapshot_display -f /data/local/tmp/s.jpeg   # 截图(必须 .jpeg)
```

### 日志

```bash
$HDC -t <dev> shell "hilog -r"                  # 清 buffer
$HDC -t <dev> shell "hilog" | grep " <PID> "    # 流式,按 PID 过滤
# 应用 tag:OHPaseoUI (domain 0x0004)、OHPaseoNodeProbe (0xD003)、OHPaseo (0x0001)
# 注意 `hilog -x` 在某些版本不会自动退出,用管道+head 或后台跑再 kill
```

### Paseo daemon(Mac 侧,已验证可用)

```bash
cd /Users/USER/Workspace/DevEco/OH-Paseo/upstream/paseo
PASEO_HOME=/tmp/paseo-ohpaseo \
PASEO_WEB_UI_ENABLED=true \
PASEO_LISTEN=0.0.0.0:6769 \
PASEO_CORS_ORIGINS='*' \
PASEO_SKIP_DEV_SERVER_BUILD=1 \
nohup ./scripts/dev-daemon.sh > /tmp/paseo_daemon.log 2>&1 &
```

- 验证:`curl -s http://127.0.0.1:6769/` 返回 200 + HTML
- Web UI bundle 已构建:`packages/server/dist/server/web-ui/`(如上游代码变了重跑 `npm run build:daemon-web-ui`)
- `dev:server` npm script 写死 `127.0.0.1:6768`,要绑 0.0.0.0 必须走 `dev-daemon.sh` + env
- 用户本机另有一个正式 daemon(PID ~465,`127.0.0.1:6767`,PASEO_HOME=~/.paseo)——**不要杀**。我们的实例用 `/tmp/paseo-ohpaseo` 隔离,但 `seed_worktree_paseo_home` 会从 `~/.paseo` 拷 config.json/agents/projects 的 JSON(共享 provider 配置,这是特性)
- daemon 单实例锁:`$PASEO_HOME/paseo.pid`,启动失败先删它 + `lsof -iTCP:6769`

## 当前待办(P1 起点)

**下一步(明确)**:改 `entry/src/main/ets/pages/WebProbe.ets` 的 Web 组件,把 `loadUrl` 从 `resource://rawfile/probe/index.html` 换成 `http://DEVICE_ADDRESS/`,验证 ArkWeb 对 Paseo SPA(Expo web,22MB JS bundle)的兼容性。需要 `INTERNET` 权限(已配)+ 明文 HTTP 可能需 `networkSecurityConfig` 允许 cleartext(API 26 默认拦 http://,如被拦,在 `module.json5` 或 network security config 放行,或换 https/自签)。

P1 剩余:

- `web/host-adapters/` 实现 ArkWeb host bridge(daemon URL 配置、断线重连提示、可能的文件选择器/剪贴板适配)
- P0.2 遗留:v0.12.0 vs 3081b99 差异审计(269 文件,server/app 集中)
- P0.5 路线 ADR 正式成文(P0.3 结论已有素材,在 `docs/p0-progress.md`)
- Paseo SPA 里 RN-web 专有 API 在 ArkWeb 的兼容性逐项踩(IndexedDB 已绿,重点:WebSocket 长连、xterm.js 渲染、IME 输入、剪贴板、wake lock)

## 代码结构现状

```
OH-Paseo/
├── docs/development-plan.md     # 原计划(路线 A 已被否)
├── docs/p0-progress.md          # ★ 全部实测细节/失败证据/裁定理由
├── docs/probes/p03-runtime-sources.md
├── upstream/paseo/              # git submodule-ish clone @ 3081b99,已 npm install
├── platform/harmonyos/          # hvigor 工程
│   ├── hvigorw                  # 包装脚本,自动选 SDK
│   ├── AppScope/app.json5       # bundleName=moe.kiwi.ohpaseo
│   ├── build-profile.json5      # 签名 + runtimeOS=HarmonyOS + "26.0.0" 字符串版本
│   └── entry/src/main/
│       ├── cpp/node_probe.cpp   # 现为 libnode 嵌入探针(SIGSYS handler+io_uring stub 在里面,有参考价值但路线已弃)
│       ├── cpp/napi_init.cpp    # NAPI 注册 startNode/stopNode/status
│       ├── ets/pages/Index.ets  # 按钮:ArkWeb probe / Start embedded Node / Refresh status
│       ├── ets/pages/WebProbe.ets # ← P1 改这里,loadUrl 指向 Mac daemon
│       └── resources/rawfile/probe/index.html  # Web 能力探针页
├── web/host-adapters/           # 空,P1 目标
├── entry/libs/arm64-v8a/        # libnode.so.137(126MB,可留可删;删了要同步清 CMake/ets 引用)
└── certs/                       # 本地 keypair(签名实际走 ~/.ohos/config/)
```

## 已知的坑(避免重踩)

0. **`npm install` 后务必确认 `patch-package` 跑起来。** 上游在 `patches/` 里放了一个
   `@gorhom+bottom-sheet+5.2.14.patch`，负责把 `BottomSheetModalInternalProvider` 从
   `contexts/modal/internal` re-export 到包根。`SheetHostScope`(`_layout.tsx` 手机布局
   必走)从包根 import 这个符号；补丁丢了时它等于 `undefined`,**整个 Paseo 直接白屏
   `Minified React error #130`**。补丁丢失的常见原因:
   - `runtime/verified-paseo` 快照直接复用 `upstream/paseo/node_modules`,跳过了
     `postinstall`;上游那边的 node_modules 也必须在打补丁后状态
   - patch 文件升级后旧 node_modules 应用失败,脚本会 `rm` 掉包让你重装——重装后
     必须再跑 `postinstall`,否则又是无补丁状态
     排查信号:`grep BottomSheetModalInternalProvider node_modules/@gorhom/bottom-sheet/lib/module/index.js`
     应该有结果。没有就先 `PATH="$PWD/node_modules/.bin:$PATH" node scripts/postinstall-patches.mjs`。

1. `compileSdkVersion` API 26 必须字符串 `"26.0.0"`
2. SDK 组件布局:`<sdk>/<26.0.0>/<ets|js|native|...>`,且目录要可写
3. ArkTS:不能匿名对象字面量当类型(需 `interface`),`router.pushUrl`/`getContext` 已 deprecated(仍可用,只告警)
4. `hdc file send` 到 `/data/local/tmp` 的文件 shell 都 exec 不了(SELinux)——别再试这条
5. uitest click 坐标 = dumpLayout bounds 中心点;截图必须 `.jpeg` 后缀
6. `npm run dev:server` 的 PASEO_LISTEN 被 script 内覆盖,自定义端口要走 `dev-daemon.sh`
7. daemon "Another Paseo daemon is already running":删 `$PASEO_HOME/paseo.pid` + 确认端口没占

## 联系人/账号

- 测试机无线调试需要用户手动开(会过期)
- 签名文件由用户通过 DevEco IDE + 华为账号生成,过期/换设备需用户重新生成
