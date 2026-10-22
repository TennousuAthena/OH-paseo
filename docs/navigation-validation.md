# 鸿蒙外链与系统返回验证

2026-10-22，仅在 MatePad Pro（WEB-W00）调试。手机按用户要求未连接或安装。

## 行为

- 本地 `paseo://app/` 链接留在应用中；用户点击的外部 HTTP/HTTPS 页面通过系统浏览器打开。
- 同时处理普通导航和 `window.open`/`target=_blank`，拒绝创建内嵌新 WebView，并保留 Paseo 原页面。
- 资源请求和被动嵌入预览不会触发浏览器。扫码请求沿用原有校验路径。
- 原生 `onBackPress` 消费系统返回，转给 Web 路由。优先关闭最上层弹窗、菜单、紧凑布局侧栏，再返回上一页；主页停留。未将系统返回模拟为全局 Escape，避免触发 Agent 中断快捷键。
- 页面尚未就绪时只尝试 Web 历史返回，不退出应用。冷启动的设置或扫码页无历史时回到主界面。

## 实测

- 真实点击主页 Star：系统浏览器新标签显示 `github.com/getpaseo/paseo`，Paseo 仍在 `/open-project`。
- 普通同窗口链接打开 `https://paseo.sh`：同样跳到系统浏览器新标签，返回 Paseo 后原页保留。
- 真实进入设置页，按系统 Back 回到主页。
- 主机菜单打开时 Back 仅关闭菜单；“添加连接”弹层打开时 Back 仅关闭弹层，再按才返回主页。
- 主页连续 Back 两次仍在 Paseo。
- 5 项针对性测试通过，覆盖路由、主页、模态层、紧凑侧栏及监听器生命周期；app 类型检查与修改文件 lint 通过。
- 五个上游补丁能在固定干净基线依次应用，并可重复应用；完整 Web 导出、debug/release HAP 构建通过。
- 最终仅在平板升级安装 `OH-Paseo-0.12.0-tablet-release.hap`，内部版本 **1000003**，再按系统 Back 后仍可见“添加 project”。保留主机配对。


## 设备及交付状态

用户明确要求平板插电期间保持常亮，本次保留 PowerManager 常亮锁及 24 小时息屏覆盖，没有恢复为原超时。可用 `hidumper -s PowerManagerService -a '-f'` 与 `power-shell timeout -r` 恢复；设备重启后需重新核对。

平板验证后按用户要求将同一 HAP 覆盖安装到手机，保留数据，由用户自行体验后确认发布；GitHub Release 已覆盖为内部版本 1000003，上传字节与手机安装包一致。电脑尚未安装本轮更新。前端修复在 `web/patches/0005-harmonyos-external-links-and-back.patch`，原生处理在 `Paseo.ets`。
