import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { RegisterInput } from "../shared/rpc.ts";
import { HuaweiSender, type PushMessage } from "./huawei.ts";

const LEASE = 48 * 60 * 60 * 1000;
const Binding = RegisterInput.extend({
  expiresAt: z.number(),
  seenAt: z.number(),
  delivered: z.array(z.string()).max(128),
  lastError: z.string().optional(),
});
type Binding = z.infer<typeof Binding>;
export class PushService {
  private bindings = new Map<string, Binding>();
  private active = new Map<string, Set<AbortController>>();
  private inFlight = new Set<string>();
  private tests = new Map<string, number>();
  private stopped = false;
  constructor(
    private file: string,
    private sender: HuaweiSender,
    private now = Date.now,
  ) {
    try {
      const records = z
        .array(Binding)
        .max(1000)
        .parse(JSON.parse(readFileSync(file, "utf8")));
      for (const record of records)
        if (record.expiresAt > this.now()) this.bindings.set(record.installationId, record);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("无法读取推送设备存储，请检查主机私有配置目录。", { cause: error });
    }
  }
  private save() {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(
      `${this.file}.tmp`,
      JSON.stringify([...this.bindings.values()].filter((value) => value.expiresAt > this.now())),
      { mode: 0o600 },
    );
    renameSync(`${this.file}.tmp`, this.file);
  }
  status() {
    return this.sender.status();
  }
  register(input: z.infer<typeof RegisterInput>) {
    for (const [id, record] of this.bindings) {
      if (record.expiresAt <= this.now()) {
        this.abort(id);
        this.bindings.delete(id);
      }
    }
    const value = RegisterInput.parse(input);
    const previous = this.bindings.get(value.installationId);
    if (this.bindings.size >= 1000 && !previous)
      return { ready: false, message: "主机已达到推送设备数量上限。" };
    if (previous && previous.token !== value.token) this.abort(value.installationId);
    this.bindings.set(value.installationId, {
      ...value,
      expiresAt: this.now() + LEASE,
      seenAt: this.now(),
      delivered: previous?.delivered ?? [],
      lastError: previous?.lastError,
    });
    this.save();
    const status = this.status();
    return {
      ready: status.ready,
      message: status.ready
        ? previous?.lastError || "已连接。任务完成或需要确认时会发送系统通知。"
        : status.message,
    };
  }
  private abort(id: string) {
    this.active.get(id)?.forEach((controller) => controller.abort());
  }
  revoke(id: string) {
    this.abort(id);
    this.bindings.delete(id);
    this.save();
    return { ready: true, message: "此设备已注销，其他设备不受影响。" };
  }
  async test(id: string) {
    if (this.now() - (this.tests.get(id) ?? 0) < 30_000)
      return { ready: false, message: "请等待 30 秒后再发送测试通知。" };
    this.tests.set(id, this.now());
    const binding = this.bindings.get(id);
    if (!binding || binding.expiresAt <= this.now())
      return { ready: false, message: "请先为此主机开启消息推送。" };
    return this.deliver(binding, "", `test:${randomUUID()}`, "test");
  }
  async notify(agentId: string, eventKey: string, kind: "completed" | "permission") {
    const eventId = createHash("sha256").update(eventKey).digest("hex");
    const results = [];
    for (const binding of this.bindings.values()) {
      if (
        binding.expiresAt <= this.now() ||
        (binding.foreground && this.now() - binding.seenAt < 60_000)
      )
        continue;
      results.push(await this.deliver(binding, agentId, eventId, kind));
    }
    return results;
  }
  private async deliver(
    binding: Binding,
    agentId: string,
    eventId: string,
    kind: PushMessage["kind"],
  ) {
    const id = binding.installationId;
    const key = `${id}:${eventId}`;
    if (this.stopped || binding.delivered.includes(eventId) || this.inFlight.has(key))
      return { ready: true, message: "通知已处理。" };
    this.inFlight.add(key);
    const controller = new AbortController();
    const controllers = this.active.get(id) ?? new Set<AbortController>();
    controllers.add(controller);
    this.active.set(id, controllers);
    try {
      const result = await this.sender.send(
        { token: binding.token, serverId: binding.serverId, agentId, eventId, kind },
        controller.signal,
      );
      const current = this.bindings.get(id);
      if (current?.token === binding.token) {
        if (result.invalidToken) this.revoke(id);
        else if (result.accepted) {
          current.delivered = [...current.delivered, eventId].slice(-128);
          current.lastError = undefined;
          this.save();
        } else {
          current.lastError = result.message;
          this.save();
        }
      }
      return { ready: result.accepted, message: result.message };
    } catch {
      return { ready: false, message: "推送未完成，请检查服务账号和网络后重试。" };
    } finally {
      this.inFlight.delete(key);
      controllers.delete(controller);
      if (controllers.size === 0) this.active.delete(id);
    }
  }
  close() {
    this.stopped = true;
    for (const id of this.active.keys()) this.abort(id);
  }
}
