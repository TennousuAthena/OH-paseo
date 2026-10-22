# ADR 001：远程 Paseo daemon + HarmonyOS ArkWeb 客户端

日期：2026-10-22。状态：用户已在接手会话中确认本轮验收采用此路线。

## 范围

先在 HUAWEI MateBook Pro（HAD-W32、API 26）验证真实的远程开发链：
客户端连接 Mac daemon，创建真实代理任务、显示流式输出与权限请求、
编辑远程项目、使用终端和 Git diff，并验证连接与进程重启后的恢复。

本轮不将 Mac 上的代理进程、Git、PTY 或文件操作记为鸿蒙本机执行。
平板和手机仍需要各自的真机验证。`development-plan.md` 保留为历史原计划，
其中“PC 必须原生运行 daemon”的路线约束已被本次明确确认的范围更新。

## 依据

P0 记录了独立 Node 的 exec 拒绝、嵌入 Node 的 V8 fatal check 和 HNP 访问失败。
这些是当前测试环境与探针的失败证据；它们不构成对所有签名、系统版本、
官方合作渠道或未来原生运行方案的全面否定。继续攻克本机运行时是独立工作。

ArkWeb 能运行冻结提交 `3081b99b06aa29bf39b9a83aaed73cf854e4a89b` 的 Paseo Web UI。
本轮已在真机通过真实 Codex 修复任务、终端测试、中文输出和 CodeMirror 保存，

## 实现

- HAP 内置固定版本 Paseo Web UI，从安全的 `paseo://app/` origin 加载；首次显示 Paseo 欢迎界面，由应用内添加主机。
- ArkTS 负责本地资源响应、加载失败、超时和网页进程退出提示。主机配置由 Paseo Web UI 持久化。
- `tcp://` 和 `relay://` 连接字符串在 ArkWeb 上通过标准 URL 解析 authority，保留显式端口、TLS 和密码查询参数，协议格式不变。
- 不注入 Electron 身份，不开放文件/凭据特权桥。
- 声明 `INTERNET` 和 `GET_NETWORK_INFO`。后一权限确保 ArkWeb 的在线状态
  可在断网恢复后更新，避免依赖在线事件的审批提交一直暂停。
- 保留 P0 探针源码，客户端 HAP 排除两份旧 `libnode` 动态库。
- Hvigor 固定优先使用 DevEco 自带 Node，避免系统 Node 26 移除旧文件 API
  造成 release/native 构建失败。

## 限制

当前连接验证使用隔离局域网 ws 服务。内置 origin 的 secure context 和 WebCrypto 可用性已在手机确认；语音、剪贴板完整流程及公网 TLS/鉴权仍须单独验证。
旧版远程网页 origin 的配置不会自动迁移，新 origin 需要重新添加主机；daemon 上的项目和任务不受影响。
测试签名基于已登记设备的 debug profile；release 构建模式不等于应用市场发布签名。
