# 鸿蒙手机和平板扫码配对

2026-10-22，Paseo 0.12.0，手机 SGT-AL10、平板 WEB-W00。

## 实现

欢迎页及添加主机菜单显示“扫描二维码”。能力由 HAP 内置资源接口提供，仅手机和平板且系统支持 ScanKit 时启用。PC 和普通浏览器不显示此入口。

扫码使用 `scanBarcode.startScanForResult`，限定 QR，开启系统图库入口。系统负责相机访问，应用只收到二维码文本；无需申请相机或整库照片权限。二维码经原有 `openPairScan` → `importConnectionLink` 路径处理，保留主机确认、密码提示、加密中继协议和校验。取消、无效二维码和连接失败后可重试。

原生只拦截指定本地导航请求，并在实际扫描前及回传时核验当前文档为 `paseo://app/pair-scan`。不向外部网页开放通用 JS 代理，不记录二维码凭据。

前端差异保存为 `web/patches/0004-harmonyos-qr-scanner.patch`，构建时自动应用。

## 结果

- 相关扫描状态测试 6 项通过，覆盖取消、重试、非配对二维码、密码和错误路径。
- 修改前端文件 lint 零错误，app typecheck 通过；完整 Web 导出及 debug/release HAP 构建通过。
- 手机和平板均实际打开系统相机扫码界面；图库入口可见，图库选图流程未单独验证。
- 用户用两台设备扫描隔离测试 daemon 的真实二维码，确认后均经 `relay.paseo.sh:443` 加密中继连接到 `REDACTED_ID`，加载真实项目列表。
- 平板实测取消系统扫码、回到页面、点击再次扫描重新打开相机。
- 两端均升级安装 release，保留配对。此次未修改正式 6767 daemon。包含扫码和内置界面的 release 已重新构建并覆盖上传到 [harmonyos-v0.12.0](https://github.com/TennousuAthena/OH-paseo/releases/tag/harmonyos-v0.12.0)，内部版本 1000002。


参考：[鸿蒙默认界面扫码](https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V14/scan-scanbarcode-V14)，并以本机 ScanKit SDK 类型声明核对参数和取消错误码。
