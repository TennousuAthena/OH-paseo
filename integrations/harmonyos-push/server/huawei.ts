import { constants, createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";

const Account = z.object({
  project_id: z.string().regex(/^\d+$/),
  key_id: z.string().min(1),
  private_key: z.string().min(1),
  sub_account: z.string().min(1),
});
type Account = z.infer<typeof Account>;
export type PushCategory = "MARKETING" | "WORK";
export interface PushMessage {
  token: string;
  serverId: string;
  agentId: string;
  eventId: string;
  kind: "completed" | "permission" | "test";
}
export type SendResult = { accepted: boolean; invalidToken: boolean; message: string };
const CONFIG_ERROR = "主机尚未配置有效的华为推送服务账号，请配置后重试。";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function createJwt(account: Account, now = Math.floor(Date.now() / 1000)): string {
  const data = `${encode({ kid: account.key_id, typ: "JWT", alg: "PS256" })}.${encode({
    aud: "https://oauth-login.cloud.huawei.com/oauth2/v3/token",
    iss: account.sub_account,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = sign("sha256", Buffer.from(data), {
    key: createPrivateKey(account.private_key.replace(/\\n/g, "\n")),
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  });
  return `${data}.${signature.toString("base64url")}`;
}

export class HuaweiSender {
  constructor(
    private options: {
      accountPath: string;
      category?: PushCategory;
      testMode?: boolean;
      // Injectable only from server tests, never from a client RPC or settings.
      endpoint?: string;
      retryDelayMs?: number;
    },
  ) {}

  private account(): Account {
    try {
      const account = Account.parse(JSON.parse(readFileSync(this.options.accountPath, "utf8")));
      createPrivateKey(account.private_key.replace(/\\n/g, "\n"));
      return account;
    } catch {
      throw new Error(CONFIG_ERROR);
    }
  }

  status() {
    try {
      this.account();
      return { ready: true, message: "华为推送服务账号已配置。" };
    } catch {
      return { ready: false, message: CONFIG_ERROR };
    }
  }

  async send(message: PushMessage, signal: AbortSignal): Promise<SendResult> {
    const account = this.account();
    const endpoint =
      this.options.endpoint ??
      `https://push-api.cloud.huawei.com/v3/${account.project_id}/messages:send`;
    const body = JSON.stringify({
      payload: {
        notification: {
          category: this.options.category ?? "MARKETING",
          title:
            message.kind === "permission"
              ? "Paseo · 需要确认"
              : message.kind === "test"
                ? "Paseo · 测试通知"
                : "Paseo · 任务完成",
          body:
            message.kind === "permission"
              ? "有一项操作等待你的确认，点击返回会话。"
              : message.kind === "test"
                ? "华为系统推送已连接。"
                : "助手已完成本轮任务，点击查看。",
          foregroundShow: message.kind === "test",
          clickAction: {
            actionType: 1,
            action: "moe.kiwi.ohpaseo.PUSH_OPEN",
            data: {
              pushSource: "ohpaseo-push-v1",
              pushEventId: message.eventId,
              serverId: message.serverId,
              agentId: message.agentId,
            },
          },
        },
      },
      target: { token: [message.token] },
      pushOptions: {
        testMessage: message.kind === "test" || (this.options.testMode ?? false),
        ttl: 300,
      },
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "push-type": "0",
            Authorization: `Bearer ${createJwt(account)}`,
          },
          body,
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
          redirect: "error",
        });
      } catch {
        if (signal.aborted) throw new Error("推送已取消。");
        if (attempt === 2)
          return {
            accepted: false,
            invalidToken: false,
            message: "无法连接华为推送服务，请检查主机网络。",
          };
        await delay((this.options.retryDelayMs ?? 1000) * (attempt + 1), undefined, { signal });
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await response.body?.cancel();
        await delay((this.options.retryDelayMs ?? 1000) * (attempt + 1), undefined, { signal });
        continue;
      }
      // Never forward Huawei's raw response: it can include complete device tokens.
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        value = null;
      }
      const parsed = z.object({ code: z.string(), msg: z.string().optional() }).safeParse(value);
      if (response.ok && parsed.success && parsed.data.code === "80000000") {
        return { accepted: true, invalidToken: false, message: "华为已接受通知。" };
      }
      const code = parsed.success ? parsed.data.code : `HTTP ${response.status}`;
      let invalidToken = false;
      if (parsed.success && (code === "80300007" || code === "80100000")) {
        try {
          const details = z
            .object({
              illegalTokens: z.object({
                tokenFormatError: z.array(z.string()).optional(),
                tokenNotExist: z.array(z.string()).optional(),
              }),
            })
            .parse(JSON.parse(parsed.data.msg ?? "{}"));
          invalidToken = [
            ...(details.illegalTokens.tokenFormatError ?? []),
            ...(details.illegalTokens.tokenNotExist ?? []),
          ].includes(message.token);
        } catch {
          /* Rights or project mismatch must retain the device binding. */
        }
      }
      return {
        accepted: false,
        invalidToken,
        message: `华为推送未接受通知（${/^[0-9A-Z ]{1,30}$/.test(code) ? code : "响应异常"}），请检查项目、权益和服务账号配置。`,
      };
    }
    throw new Error("推送重试已结束。");
  }
}
