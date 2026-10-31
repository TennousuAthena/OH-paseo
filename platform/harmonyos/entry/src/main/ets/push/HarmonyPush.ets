import { common, UIAbility, Want } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { util } from '@kit.ArkTS';
import { deviceInfo, BusinessError } from '@kit.BasicServicesKit';
import { notificationManager } from '@kit.NotificationKit';
import { pushService } from '@kit.PushKit';

export const PUSH_ACTION: string = 'moe.kiwi.ohpaseo.PUSH_OPEN';

export interface PushTapData {
  serverId: string;
  agentId: string;
}

export interface PushTap {
  id: string;
  data: PushTapData;
}

export interface PushStatus {
  supported: boolean;
  enabled: boolean;
  permission: boolean;
  installationId: string;
  token: string;
  foreground: boolean;
  error: string;
}

// The token stays in the trusted bundled document and its authenticated daemon RPC.
// Service-account keys and push API credentials never belong on the device.
class HarmonyPush {
  private context: common.UIAbilityContext | null = null;
  private store: preferences.Preferences | null = null;
  private enabled: boolean = false;
  private permission: boolean = false;
  private installationId: string = '';
  private token: string = '';
  private foreground: boolean = false;
  private error: string = '';
  private refreshing: Promise<PushStatus> | null = null;
  private pendingTap: PushTap | null = null;
  private listeners: Array<() => void> = [];
  private tokenListener: (token: string) => void = (token: string) => {
    this.token = token;
    this.error = '';
    this.notify();
  };
  readonly supported: boolean = canIUse('SystemCapability.Push.PushService');

  initialize(ability: UIAbility, want: Want): void {
    this.context = ability.context;
    try {
      this.store = preferences.getPreferencesSync(ability.context, { name: 'harmony-push' });
      this.enabled = this.store.getSync('enabled', false) as boolean;
      this.installationId = this.store.getSync('installationId', '') as string;
      if (!this.installationId) {
        this.installationId = util.generateRandomUUID(true);
        this.store.putSync('installationId', this.installationId);
        this.store.flushSync();
      }
      const saved = this.store.getSync('pendingTap', '') as string;
      if (saved) this.pendingTap = JSON.parse(saved) as PushTap;
    } catch (_) {
      this.error = '无法读取通知设置，请重新启动应用。';
    }
    if (this.supported && deviceInfo.sdkApiVersion >= 23) {
      try { pushService.on('tokenUpdate', ability, this.tokenListener); } catch (_) { /* Retry on foreground. */ }
    }
    this.receiveWant(want);
  }

  destroy(): void {
    if (this.supported && deviceInfo.sdkApiVersion >= 23) {
      try { pushService.off('tokenUpdate', this.tokenListener); } catch (_) {}
    }
    this.listeners = [];
    this.context = null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((item: () => void) => item !== listener); };
  }

  private notify(): void {
    this.listeners.forEach((listener: () => void) => listener());
  }

  setForeground(value: boolean): void {
    this.foreground = value;
    this.notify();
    if (value) this.refresh().catch(() => {});
  }

  snapshot(): PushStatus {
    return {
      supported: this.supported, enabled: this.enabled, permission: this.permission,
      installationId: this.installationId, token: this.token,
      foreground: this.foreground, error: this.error
    };
  }

  async enable(): Promise<PushStatus> {
    if (!this.context || !this.supported) {
      this.error = '此设备不支持华为系统推送。';
      return this.snapshot();
    }
    if (!this.foreground) {
      this.error = '请先返回 Paseo 前台，再开启消息通知。';
      return this.snapshot();
    }
    try {
      if (!await notificationManager.isNotificationEnabled()) {
        await notificationManager.requestEnableNotification(this.context);
      }
      this.permission = await notificationManager.isNotificationEnabled();
      if (!this.permission) {
        this.error = '通知权限未开启，请在系统通知设置中允许 Paseo 发送通知。';
        return this.snapshot();
      }
      this.enabled = true;
      this.store?.putSync('enabled', true);
      this.store?.flushSync();
    } catch (_) {
      this.error = '无法开启通知，请在系统通知设置中允许 Paseo 后重试。';
      return this.snapshot();
    }
    return this.refresh();
  }

  async refresh(): Promise<PushStatus> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refreshInner();
    try { return await this.refreshing; } finally { this.refreshing = null; }
  }

  private async refreshInner(): Promise<PushStatus> {
    try {
      this.permission = await notificationManager.isNotificationEnabled();
      if (this.enabled && this.permission && this.supported) {
        this.token = await pushService.getToken();
        this.error = '';
      } else {
        this.token = '';
      }
    } catch (cause) {
      this.token = '';
      const code = (cause as BusinessError).code;
      if (code === 1000900010 || code === 1000900012) {
        this.error = `Push Kit 应用身份或权益尚未生效，请检查云端开通和签名 Profile（${code}）。`;
      } else if (code === 1000900013) {
        this.error = `设备与推送服务的数据处理地区不匹配（${code}）。`;
      } else {
        this.error = `获取华为推送令牌失败，请检查网络后重试（${code}）。`;
      }
    }
    return this.snapshot();
  }

  receiveWant(want: Want): void {
    const values = want.parameters;
    if (!values || values['pushSource'] !== 'ohpaseo-push-v1') return;
    const id = values['pushEventId'];
    const serverId = values['serverId'];
    const agentId = values['agentId'];
    if (typeof id !== 'string' || !/^[a-zA-Z0-9:_-]{1,200}$/.test(id) ||
      typeof serverId !== 'string' || !serverId || serverId.length > 200 ||
      typeof agentId !== 'string' || agentId.length > 200) return;
    try {
      const acknowledged = this.store?.getSync('acknowledgedTaps', []) as string[] || [];
      if (acknowledged.includes(id)) return;
    } catch (_) { /* In-memory routing remains available if preferences fail. */ }
    this.pendingTap = { id: `harmony:${id}`, data: { serverId, agentId } };
    try {
      this.store?.putSync('pendingTap', JSON.stringify(this.pendingTap));
      this.store?.flushSync();
    } catch (_) { this.error = '通知跳转暂未保存，请保持应用打开。'; }
    this.notify();
  }

  takeTap(): PushTap | null { return this.pendingTap; }

  acknowledge(id: string): void {
    if (this.pendingTap?.id !== id) return;
    try {
      const acknowledged = this.store?.getSync('acknowledgedTaps', []) as string[] || [];
      acknowledged.push(id.replace(/^harmony:/, ''));
      this.store?.putSync('acknowledgedTaps', acknowledged.slice(-32));
      this.store?.putSync('pendingTap', '');
      this.store?.flushSync();
    } catch (_) { this.error = '无法保存通知已读状态，请重新启动应用。'; }
    this.pendingTap = null;
  }
}

export const harmonyPush: HarmonyPush = new HarmonyPush();
