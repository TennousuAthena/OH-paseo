# OH-Paseo

将 Paseo 适配到 HarmonyOS PC、平板和手机。本轮按用户确认的路线，先交付 **远程 Paseo daemon + HarmonyOS ArkWeb 客户端**。

当前阶段：**持续开发中**。MateBook Pro、MatePad Pro 和 Mate 80 Pro Max 的远程开发核心流程已于 2026-10-22 完成一轮真机验证。平板软键盘换行误发送、摄像头旁白边，以及手机安装和旋转问题已修复；界面和产品功能仍在迭代，尚未完成整体验收。代理、终端和项目文件运行在 Mac，鸿蒙设备运行客户端。

当前适配基线为 **Paseo v0.15.4**（`1c00b365c9e0b74c1580eba33d905d693125ae21`），HAP 版本为 `0.15.4 / 1000010`。平板和 MateBook Pro 已覆盖安装并通过核心端到端验证；手机最后确认安装的仍为 `0.15.2 / 1000009`。详见 [验证范围与设备状态](docs/paseo-0.15-validation.md)。构建和版本号统一读取 `runtime/verified-paseo`，不读取有本地改动的参考工作树。

- [路线决策 ADR 001](docs/adr-001-remote-arkweb-client.md)
- [交接状态](docs/handoff.md)
- [Paseo 0.15 系列适配与验证](docs/paseo-0.15-validation.md)
- [Paseo 0.14 平板验证](docs/paseo-0.14-tablet-validation.md)
- [历史开发计划](docs/development-plan.md)
- [资料阅读与验证记录](docs/research-notes.md)
- [测试机连接与设备基线](docs/device-baseline.md)
- [P0 进度](docs/p0-progress.md)
- [可视化审阅页](docs/plan-review.html)

## 目录

```
docs/                计划、调研、ADR、验收记录
upstream/paseo/      上游 Git 引用（保留已有本地改动，不入库）
web/patches/         针对固定上游的触控、安全区及 URI 兼容补丁
platform/harmonyos/  鸿蒙 Stage 工程（bundleName: moe.kiwi.ohpaseo）
web/host-adapters/   Web 业务层的宿主能力适配
runtime/             运行时探针与本地验证用上游源码快照（忽略入库）
scripts/             构建、签名、安装、日志采集
tests/               本项目集成与设备测试
certs/               本地签名材料（不入库）
```

## 构建和安装客户端

本仓库保留 Paseo monorepo；鸿蒙构建使用官方稳定版的独立源码快照。首次准备基线：

```sh
mkdir -p upstream
git clone https://github.com/getpaseo/paseo.git upstream/paseo
git -C upstream/paseo fetch https://github.com/getpaseo/paseo.git refs/tags/v0.15.4:refs/tags/v0.15.4
bash scripts/prepare-paseo-snapshot.sh
npm --prefix runtime/verified-paseo ci
cp platform/harmonyos/build-profile.example.json5 platform/harmonyos/build-profile.json5
```

已有 `upstream/paseo` 工作目录时跳过克隆，不要重置。已有旧版 `runtime/verified-paseo` 时先移至 `runtime/verified-paseo-旧版本` 保存，再准备新快照。各版本使用各自的锁文件安装依赖，不复用旧版 `node_modules` 或 `dist`；`npm ci` 会执行上游 `postinstall` 依赖补丁。

```sh
bash scripts/build-hap.sh debug
bash scripts/build-hap.sh release
HDC_TARGET=平板调试地址 HDC_EXPECTED_MODEL=WEB-W00 bash scripts/matebook-device.sh install artifacts/OH-Paseo-0.15.4-universal-debug.hap
HDC_TARGET=平板调试地址 HDC_EXPECTED_MODEL=WEB-W00 bash scripts/matebook-device.sh launch
```

产物位于 `artifacts/`，默认命名为 `universal`；可用 `bash scripts/build-hap.sh debug phone` 输出独立手机产物。清单支持 2in1/tablet/phone。默认输出使用本机设备调试签名，供已登记设备安装；release 构建模式不等于市场发布签名。Hvigor 默认使用 DevEco 自带 Node，避免系统 Node 26 的文件 API 兼容问题。

上传 GitHub Release 时使用未签名产物：

```sh
bash scripts/build-hap.sh release universal unsigned
```

输出为 `artifacts/OH-Paseo-0.15.4-universal-release-unsigned.hap`，配套发布 SHA-256 校验文件。未签名 HAP 需自行配置签名后安装，公开发布不上传本机开发签名包。`release` 分支保存鸿蒙发布源码，GitHub Release 标签指向对应提交。

首次打开直接显示 HAP 内置的 Paseo 欢迎界面，手机和平板可在欢迎页或“添加主机”中选择“扫描二维码”，调用鸿蒙系统扫码（含图库入口）添加加密中继主机；也可通过“直接连接”或“粘贴配对链接”添加主机。局域网验证填写 Host `DEVICE_ADDRESS`、端口 `6769`；主机配置由 Paseo 自身持久化。界面从 `paseo://app/` 加载，不依赖 daemon 提供网页。旧版远程网页 origin 的本地配置不会自动迁移，升级后需重新添加主机；远程任务数据仍在 daemon。公网、TLS、语音尚未验证。

构建脚本先应用 `web/patches/`、构建固定上游 Web UI，再将导出内容打入 rawfile。生成目录不入库。导出附带 `ohpaseo-build.json`，记录版本、上游提交和补丁摘要；`OHPASEO_SKIP_WEB_BUILD=1` 只接受与当前基线、补丁一致的已验证导出。

鸿蒙系统返回优先关闭弹层和侧栏，再返回上一页，主页不直接退出。用户点击外部网页链接会交给系统浏览器；本次导航修复先在平板完成验证，详见 [导航验证](docs/navigation-validation.md)。

当前 `upstream/paseo` 有接手前遗留的删除及依赖修改，不要直接重置，也不要按旧交接命令重启它。已验证的固定源码快照启动方式见验收报告。

## 设备连接

```sh
HDC=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc
$HDC tconn DEVICE_ADDRESS
$HDC -t DEVICE_ADDRESS shell "param get const.product.name"
```

应用版本跟随实际打包的 `runtime/verified-paseo/packages/app/package.json`。`scripts/build-hap.sh` 构建前校验固定提交并同步 `versionName`，用该版本命名 HAP；版本变化时 `versionCode` 在当前值上递增，重复构建同一版本保持不变。使用 DevEco 直接构建前先运行 `python3 scripts/sync-app-version.py`。这不会自动拉取或升级上游源码。

首次克隆后，将 `platform/harmonyos/build-profile.example.json5` 复制为同目录 `build-profile.json5`，再通过 DevEco 配置本机签名。签名配置、证书、旧原生探针动态库和 IDE 数据库不纳入 Git；当前远程 daemon 客户端不依赖旧 Node 动态库。
