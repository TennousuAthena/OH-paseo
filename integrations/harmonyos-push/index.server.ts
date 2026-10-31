import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { serviceStatus, registerDevice, revokeDevice, testDevice } from "./shared/rpc.ts";
import { HuaweiSender } from "./server/huawei.ts";
import { PushService } from "./server/service.ts";

export default function contribute(server: PluginServerContext) {
  const directory =
    process.env.OHPASEO_PUSH_DATA_DIR ??
    join(process.env.PASEO_HOME ?? join(homedir(), ".paseo"), "harmonyos-push");
  const sender = new HuaweiSender({
    accountPath:
      process.env.OHPASEO_HUAWEI_SERVICE_ACCOUNT ?? join(directory, "service-account.json"),
    category: process.env.OHPASEO_PUSH_CATEGORY === "WORK" ? "WORK" : "MARKETING",
    testMode: process.env.OHPASEO_PUSH_TEST_MODE === "1",
  });
  const service = new PushService(join(directory, "devices.json"), sender);
  server.handle(serviceStatus, () => service.status());
  server.handle(registerDevice, (input) => service.register(input));
  server.handle(revokeDevice, ({ installationId }) => service.revoke(installationId));
  server.handle(testDevice, ({ installationId }) => service.test(installationId));
  // Enqueue without holding up the agent lifecycle. Cancellation during plugin
  // teardown aborts network requests; hook errors never contain vendor payloads.
  const pending = new Set<Promise<unknown>>();
  const enqueue = (task: () => Promise<unknown>) => {
    if (pending.size >= 128) return;
    const promise = task().catch(() => {
      console.error("[HarmonyPush] Notification delivery failed.");
    });
    pending.add(promise);
    void promise.finally(() => pending.delete(promise));
  };
  const turns = new Map<string, string>();
  server.on("agent.turn_started", ({ agent, turnId }) => {
    if (!agent.parentAgentId) turns.set(agent.id, turnId ?? randomUUID());
  });
  server.on("agent.turn_ended", ({ agent, turnId, outcome }) => {
    const eventId = turnId ?? turns.get(agent.id) ?? randomUUID();
    turns.delete(agent.id);
    if (!agent.parentAgentId && outcome.kind === "completed") {
      enqueue(() => service.notify(agent.id, `turn:${agent.id}:${eventId}`, "completed"));
    }
  });
  server.on("agent.permission_requested", ({ agent, request }) => {
    if (!agent.parentAgentId)
      enqueue(() => service.notify(agent.id, `permission:${agent.id}:${request.id}`, "permission"));
  });
  return async () => {
    service.close();
    await Promise.allSettled(pending);
  };
}
