# 内置 Paseo 首次启动验证

2026-10-22，Mate 80 Pro Max（SGT-AL10），固定上游 0.12.0。

## 改动

HAP 包含 Paseo Web 导出，ArkWeb 从 `paseo://app/` 加载本地资源。移除原生开发主机地址表单。首次进入官方欢迎界面，用户在应用内选择直接连接或配对链接。主机配置由 Paseo 持久化，不再依赖远程 daemon 提供网页。

ArkWeb 对 `tcp://` 和 `relay://` 的 URL authority 解析有差异；补丁通过标准 scheme 解析并恢复原有字符串格式，保留 80/443 等显式端口与密码查询参数。无消息 schema 或 daemon 协议变更。

## 验证

- 相关 protocol 测试 24 项通过，含无自定义 scheme 支持、80/443/6769、IPv6、relay、密码编码回归；两份修改文件 lint 零错误。
- 完整 Web 构建、debug/release HAP 构建通过。
- 手机从欢迎页“直接连接”添加 `DEVICE_ADDRESS` 成功，显示真实项目和手机验证任务历史。
- 强制停止应用后重新启动，主机及任务恢复；secure context、WebCrypto 可用，系统深色偏好为 true。
- 清除本地 origin 数据，CDP 模拟离线再加载 `paseo://app/`，进入 `/welcome`，`navigator.onLine=false`，欢迎页完整可用。
- 最后卸载 debug 并全新安装 release，手机保留无主机的欢迎界面。此操作只清除手机客户端数据，未删除 daemon 项目。


## 范围

此次首次启动回归原先只覆盖手机；后续手机和平板均已安装扫码版 release，并通过公网中继配对实连，见 [扫码验证](qr-scan-validation.md)。PC 尚未安装新包；直连 TLS、语音未验证。Release `harmonyos-v0.12.0` 已覆盖为包含内置界面和扫码的通用包，内部版本 1000002。旧远程 origin 配置不自动迁移，需要重新添加主机。
