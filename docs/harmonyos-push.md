# HarmonyOS Push Kit

OH-Paseo 的系统通知由 HarmonyOS Push Kit 接收。Mac/Linux 上的 `harmonyos-push` Paseo 插件直接调用华为 V3 推送接口，不需要额外网关。应用前台的提醒仍由 Paseo 原有界面负责。

## 实现范围

- 设置 → 通知中按主机启用，显式请求系统通知权限。
- 完成的顶层会话和待确认操作发送系统通知；取消、失败、子代理默认不发送。
- 锁屏内容仅包含通用提示，不包含任务标题、路径、提示词或回答。
- 通知携带不透明主机/会话 ID，经应用原有通知路由打开；冷启动等待主机与导航恢复，成功处理后确认，原生保留未确认点击。
- Push Token 在启动、回前台、系统 tokenUpdate、主机重连时更新；设备租约 48 小时。关闭或移除主机时注销，离线注销留待重连，永不重连的记录到期失效。
- 每个设备独立绑定；令牌只发给用户已配对并启用通知的主机。默认应用前台不展示远程通知，测试按钮可前台展示。
- 服务端 PS256 JWT、10 秒请求超时、有限重试、事件去重、无效令牌清理；华为受理成功与实际设备送达分别展示。

## 云端与签名

1. 在华为开发者中心创建同包名 `moe.kiwi.ohpaseo` 的 HarmonyOS 应用，项目数据处理地区须与 Push Kit 支持范围一致。
2. APP ID → 开放能力管理中开通“推送服务”。
3. 更新签名 Profile：加入实际调试设备、使用与现有包相同的签名密钥，并生成含 Push Kit 权益的新 Profile。升级前核对 APP ID / app-identifier / 证书，避免通过卸载清空已有主机和会话数据。
4. 凭证 → 项目级凭证 → 服务账号凭证，选择应用所在项目，并下载 JSON 密钥。当前控制台仅提供固定角色，无法单独授予 Push Kit；本项目使用“开发”角色。
5. 将 JSON 放在发送主机的 `~/.paseo/harmonyos-push/service-account.json`，目录权限 `700`、文件 `600`。不要放进 HAP、前端、仓库或日志。
6. 配置推送消息自分类权益。默认 `MARKETING` 受华为默认日限额限制；`WORK` 只用于对应业务提醒分类权益获批后。开发验证可使用测试消息，不能把测试额度当作普通用户正式推送额度。

本次创建的云端应用：APP ID `6917620548967175892`，项目 ID `101653523865516193`，项目名称 `OH-Paseo`。Push Kit 开关已开启，调试 Profile `OH-Paseo-Push-Debug` 已生成并下载，绑定当前 MatePad Pro。旧安装包的签名身份与该 Profile 不一致；原位升级被 Bundle Manager 拒绝（`9568332 install sign info inconsistent`）。用户选择保留旧包，暂不迁移；未导出或备份平板私密数据，也未清除数据或卸载应用。后续迁移须先获得备份与重装授权，再核验备份并恢复主机配对和设置。

AGC 签名 HAP 单独保留为 `artifacts/OH-Paseo-0.14.0-push-agc-debug.hap`，未发布。默认本机构建配置已恢复为现有平板签名；AGC 构建配置私密保留在已忽略的 `certs/build-profile.push-agc.json`。

## 主机安装

插件依赖 Paseo 0.13–0.14 的公开 RPC 与生命周期 API。源码位于 `integrations/harmonyos-push`，只运行服务器入口；设置页随 OH-Paseo HAP 打包。

先检查主机的全局插件开关。只有在用户明确同意后才启用全局插件，因为 Paseo 插件是受信任的本机代码，具有 daemon 用户的系统权限。安装此插件不要求重启 daemon：

```sh
paseo plugin install /absolute/path/to/OH-Paseo/integrations/harmonyos-push
paseo plugin ls
paseo plugin reload harmonyos-push
paseo plugin logs harmonyos-push
```

服务账号文件会在调用时重新读取，替换密钥不要求重启。可选环境变量：

| 变量                             | 用途                                             |
| -------------------------------- | ------------------------------------------------ |
| `OHPASEO_HUAWEI_SERVICE_ACCOUNT` | 服务账号 JSON 的绝对路径                         |
| `OHPASEO_PUSH_DATA_DIR`          | 插件私有状态目录，隔离多个 daemon 时必须分别配置 |
| `OHPASEO_PUSH_CATEGORY`          | `MARKETING`（默认）或获批后的 `WORK`             |
| `OHPASEO_PUSH_TEST_MODE=1`       | 开发环境将自动通知也标记为测试消息               |

每台实际运行任务的主机均需安装插件并配置相应项目的服务账号。只给 Mac 配置不会自动覆盖另一台 Linux 主机。

当前 Mac 已获授权启用全局插件并安装 `harmonyos-push`，状态为 `running`。配置热加载未重启主 daemon，原有停用插件仍保持停用。项目级服务账号 `OH-Paseo Push` 已创建并启用，仅选择“开发”角色；私钥仅保存在本机 `~/.paseo/harmonyos-push/service-account.json`，目录 `700`、文件 `600`，下载目录副本已移除。真实插件 `service.status` 返回 `ready: true`，PS256 JWT 本机签名验证通过。这些检查不证明华为服务端鉴权或设备送达，后续仍需有效设备令牌进行联调。

## 验证

在准备好 `runtime/verified-paseo` 后，插件开发依赖可使用该快照的 `node_modules`，或在插件目录安装开发依赖。

```sh
npm run typecheck --prefix integrations/harmonyos-push
npm run lint --prefix integrations/harmonyos-push
npm run test --prefix integrations/harmonyos-push
node --import ./runtime/verified-paseo/node_modules/tsx/dist/loader.mjs scripts/verify-harmonyos-push.mts
```

单元/HTTP 集成测试验证真实签名和本地 HTTP 请求。运行时脚本启动隔离 daemon，使用真实插件子进程、认证 RPC、受控代理和 HTTP 接收端验证权限/完成事件及注销。它们不证明华为云实际送达。

真机验收还须完成：允许通知并获取真实令牌、测试按钮收到通知、前台无重复通知、后台/锁屏完成与确认提醒、冷/热启动跳转、关闭通知后不再发送。不得用本地通知或注入测试 Want 代替云端送达结论。

2026-10-31 开发验证：20 个前端用例、3 个签名/HTTP 用例、隔离 daemon 的插件加载/RPC/权限/完成/注销检查均通过，类型检查及 lint 通过。全部 8 个补丁可应用至干净 Paseo v0.14.0，结果与测试快照一致。MatePad Pro 保留功能预览包 `0.14.0 (1000008)` 并已允许系统通知；旧签名下真实 `getToken` 返回 `1000900010`（应用身份无效），尚无有效令牌。新 AGC Profile 的调试 HAP 已构建成功，主机服务账号已配置。真机签名迁移按用户选择暂缓，云端送达验收尚未完成。

官方参考：[Push Token](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/push-pushservice)、[服务账号鉴权](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/push-jwt-token)、[场景化消息请求](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/push-scenariozed-api-request-struct)。
