# 应用名称与图标

2026-10-22 按用户要求将应用显示名和 EntryAbility 窗口标题改为 **Paseo**。
包标识仍为 `moe.kiwi.ohpaseo`，因此可以直接升级现有安装并保留连接和工作区状态。

图标逐字节复制自 Paseo 官方仓库固定提交，无重绘或图像修改：

- 来源：`https://github.com/getpaseo/paseo`
- 提交：`3081b99b06aa29bf39b9a83aaed73cf854e4a89b`
- 文件：`packages/app/assets/images/icon.png`（1024 × 1024）
- 上游引用：`packages/app/app.config.js` 的 `expo.icon`
- SHA-256：`293acc7fa5530b6f48c94a2e16904269152352b5fe74031266579d0b6b2a6869`
- 本地资源：AppScope 与 entry 的 `resources/base/media/paseo_icon.png`
- 用途：应用图标、EntryAbility 图标、启动窗口图标

上游版权：Copyright (c) 2025-present Mohamed Boudra。
上游许可文本保留在 [paseo-LICENSE.txt](licenses/paseo-LICENSE.txt)。
