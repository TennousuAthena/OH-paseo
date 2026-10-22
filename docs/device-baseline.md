# 测试机连接与设备基线

## 2026-10-22 更新



已复核同一台 HUAWEI MateBook Pro（HAD-W32、2in1、API 26、arm64），无线 hdc 地址仍为 `DEVICE_ADDRESS`，屏幕为 3120 × 2080。
`moe.kiwi.ohpaseo` 的 debug、release 构建模式 HAP 均已签名、安装并实际启动。

## 历史连接记录

记录日期：2026-10-20。信息通过目标设备的 hdc shell 实际读取。

## 当前连接

| 项目 | 实测值 |
|---|---|
| 连接方式 | 网络 hdc（TCP）；USB 调试连接未验证 |
| 目标地址 | `DEVICE_ADDRESS` |
| hdc 状态 | `TCP Connected` |
| 产品名称 | `HUAWEI MateBook Pro` |
| 型号 | `HAD-W32` |
| 厂商 | `HUAWEI` |
| 设备类型 | `2in1` |
| 系统底层标识 | `OpenHarmony-7.0.0.105` |
| API | `26` |
| 应用 ABI | `arm64-v8a` |
| `uname -m` | `aarch64` |

系统标识来自 `const.ohos.fullname`，不将它直接替代设备设置页的商业系统版本。应用构建、签名、安装及原生运行时尚未验证。

## 本机连接方法

使用 DevEco Studio 自带的 hdc，无需修改全局 PATH：

```sh
/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc tconn DEVICE_ADDRESS
/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc list targets -v
/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc -t DEVICE_ADDRESS shell param get const.product.name
```

验证成功的关键输出为 `TCP Connected` 和 `HUAWEI MateBook Pro`；不能仅根据 `tconn` 返回 `Connect OK` 判断 shell 一直可用。网络调试端口可能在设备重新开启无线调试后变化。

## 本轮排查记录

1. 初次 USB/hdc 枚举未发现测试 PC。
2. 用户提供网络调试地址；TCP 端口可达，`tconn` 返回成功，但后续设备列表为空。
3. 检查发现本机 hdc 服务未持续存活，客户端每次重新启动服务后丢失已有 TCP 连接。
4. 在持续运行的执行会话中，以 `hdc -l3 -s 127.0.0.1:8710 -m` 保持本机 hdc 服务运行，再执行 `tconn`。
5. 设备列表显示 `Connected`；多次独立 shell 调用成功读取产品、系统、API 和架构，用户要求重试后再次确认成功。

本机 hdc 版本为 `3.2.0f`，客户端与服务端版本一致。服务仅监听本机回环地址。未修改设备设置、安装应用或启动 Paseo daemon。

## 已确认的项目约束

用户暂不接受同机 Linux 融合开发引擎，优先考虑鸿蒙原生运行。后续可行性验证应围绕原生 Electron/Node、进程与二进制签名、PTY、Git 和代理 CLI 展开；不能自动切换为 Linux 子系统执行。
