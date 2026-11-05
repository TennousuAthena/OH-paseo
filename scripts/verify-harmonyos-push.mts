// Run after preparing runtime/verified-paseo:
// node --import ./runtime/verified-paseo/node_modules/tsx/dist/loader.mjs scripts/verify-harmonyos-push.mts
// Uses an isolated daemon and real plugin subprocess/RPC/lifecycle hooks. A local
// HTTP capture endpoint replaces Huawei only in a disposable copy of the plugin.
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { createTestPaseoDaemon } from "../runtime/verified-paseo/packages/server/src/server/test-utils/paseo-daemon.ts";
import { DaemonClient } from "../runtime/verified-paseo/packages/server/src/server/test-utils/daemon-client.ts";

const directory = await mkdtemp(join(tmpdir(), "ohpaseo-plugin-runtime-"));
const source = resolve("integrations/harmonyos-push");
const appVersion: string = JSON.parse(
  await readFile(resolve("runtime/verified-paseo/packages/app/package.json"), "utf8"),
).version;
const plugin = join(directory, "plugin");
const privateDirectory = join(directory, "private");
const captured: {
  payload: { notification: { title: string; clickAction: { data: { agentId: string } } } };
}[] = [];
const http = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  captured.push(JSON.parse(body));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ code: "80000000" }));
});
http.listen(0, "127.0.0.1");
await once(http, "listening");
const address = http.address();
assert.ok(address && typeof address === "object");
let daemon: Awaited<ReturnType<typeof createTestPaseoDaemon>> | null = null;
let client: DaemonClient | null = null;
async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await delay(50);
  }
}
try {
  await cp(source, plugin, {
    recursive: true,
    filter: (path) => basename(path) !== "node_modules" && !path.endsWith(".test.ts"),
  });
  await mkdir(privateDirectory, { mode: 0o700 });
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await writeFile(
    join(privateDirectory, "service-account.json"),
    JSON.stringify({
      project_id: "123456",
      key_id: "runtime-test",
      sub_account: "runtime-test",
      private_key: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    }),
    { mode: 0o600 },
  );
  let entry = await readFile(join(plugin, "index.server.ts"), "utf8");
  entry = entry
    .replace(/const directory =[^;]+;/, `const directory = ${JSON.stringify(privateDirectory)};`)
    .replace(
      "new HuaweiSender({",
      `new HuaweiSender({ endpoint: ${JSON.stringify(`http://127.0.0.1:${address.port}/messages:send`)},`,
    );
  await writeFile(join(plugin, "index.server.ts"), entry);
  daemon = await createTestPaseoDaemon({ daemonVersion: appVersion, pluginsEnabled: true });
  client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion });
  await client.connect();
  await client.fetchAgents({ subscribe: {} });
  await client.installDirectoryPlugin(plugin);
  await until(
    async () =>
      (await client!.listPlugins()).some(
        (item) => item.id === "harmonyos-push" && item.status === "running",
      ),
    "plugin running",
  );
  const installationId = randomUUID();
  const rpc = (method: string, input: unknown) =>
    client!.invokePluginRpc("harmonyos-push", method, input);
  assert.deepEqual(await rpc("service.status", {}), {
    ready: true,
    message: "华为推送服务账号已配置。",
  });
  await rpc("device.register", {
    installationId,
    token: "runtime-token",
    serverId: "runtime-host",
    foreground: false,
  });
  const agent = await client.createAgent({
    provider: "claude",
    cwd: directory,
    title: "Push lifecycle verification",
    modeId: "default",
  });
  await client.sendMessage(agent.id, "Run rm -f permission.txt");
  await until(
    async () =>
      captured.some((message) => message.payload.notification.title === "Paseo · 需要确认"),
    "permission push",
  );
  const permissionPush = captured.find(
    (message) => message.payload.notification.title === "Paseo · 需要确认",
  )!;
  assert.equal(permissionPush.payload.notification.clickAction.data.agentId, agent.id);
  const pending = await client.fetchAgent(agent.id);
  // Resolve through the same daemon API the UI uses; no plugin SDK mock.
  assert.ok(pending && pending.agent.pendingPermissions.length > 0);
  await client.respondToPermission(agent.id, pending.agent.pendingPermissions[0].id, {
    behavior: "deny",
    message: "Runtime test decline",
  });
  await until(
    async () =>
      captured.some((message) => message.payload.notification.title === "Paseo · 任务完成"),
    "completed push",
  );
  await rpc("device.revoke", { installationId });
  const sent = captured.length;
  const previousMessageAt = (await client.fetchAgent(agent.id))?.agent.lastUserMessageAt;
  await client.sendMessage(agent.id, "Reply with a short greeting");
  await until(async () => {
    const snapshot = (await client!.fetchAgent(agent.id))?.agent;
    return snapshot?.status === "idle" && snapshot.lastUserMessageAt !== previousMessageAt;
  }, "completion after revocation");
  assert.equal(captured.length, sent, "revoked binding receives no completion");
  console.log(
    JSON.stringify({
      passed: true,
      plugin: "harmonyos-push",
      checks: [
        "subprocess startup",
        "authenticated RPC",
        "permission hook",
        "turn-ended hook",
        "revocation",
      ],
      notifications: sent,
    }),
  );
} finally {
  await client?.close();
  await daemon?.close();
  http.closeAllConnections();
  await new Promise<void>((done) => http.close(() => done()));
  await rm(directory, { recursive: true, force: true });
}
