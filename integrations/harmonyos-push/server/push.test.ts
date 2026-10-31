import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPairSync, constants, verify, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { HuaweiSender, createJwt } from "./huawei.ts";
import { PushService } from "./service.ts";
import type { IncomingHttpHeaders } from "node:http";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = {
  project_id: "123456",
  key_id: "test-key",
  sub_account: "test-account",
  private_key: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

test("JWT uses PS256, Huawei audience, and one-hour expiry", () => {
  const jwt = createJwt(account, 1700000000);
  const [header, payload, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), {
    kid: "test-key",
    typ: "JWT",
    alg: "PS256",
  });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url").toString()), {
    aud: "https://oauth-login.cloud.huawei.com/oauth2/v3/token",
    iss: "test-account",
    iat: 1700000000,
    exp: 1700003600,
  });
  assert.ok(
    verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: keys.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(signature, "base64url"),
    ),
  );
});

test("real HTTP transport: private payload, retry, durable dedup, renewal, revocation and token errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ohpaseo-push-"));
  const accountPath = join(directory, "account.json");
  const devicePath = join(directory, "devices.json");
  writeFileSync(accountPath, JSON.stringify(account), { mode: 0o600 });
  interface Body {
    payload: {
      notification: {
        title: string;
        foregroundShow: boolean;
        clickAction: { data: { serverId: string; agentId: string } };
      };
    };
    pushOptions: { ttl: number; testMessage: boolean };
    target: { token: string[] };
  }
  const captured: { body: Body; headers: IncomingHttpHeaders }[] = [];
  const replies: { status: number; data: unknown }[] = [];
  const http = createServer(async (req, res) => {
    let data = "";
    for await (const chunk of req) data += chunk;
    captured.push({ body: JSON.parse(data), headers: req.headers });
    const reply = replies.shift() ?? { status: 200, data: { code: "80000000" } };
    res.writeHead(reply.status, { "content-type": "application/json" });
    res.end(JSON.stringify(reply.data));
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  assert.ok(address && typeof address === "object");
  const sender = new HuaweiSender({
    accountPath,
    endpoint: `http://127.0.0.1:${address.port}/messages:send`,
    retryDelayMs: 1,
  });
  let now = Date.now();
  let service = new PushService(devicePath, sender, () => now);
  const installationId = randomUUID();
  const registration = {
    installationId,
    token: "private-device-token",
    serverId: "host-1",
    foreground: false,
  };
  try {
    assert.equal(service.register(registration).ready, true);
    assert.equal(statSync(devicePath).mode & 0o777, 0o600);
    replies.push({ status: 503, data: {} }, { status: 200, data: { code: "80000000" } });
    await service.notify("agent-1", "turn:agent-1:turn-1", "completed");
    assert.equal(captured.length, 2);
    const request = captured[1];
    assert.equal(request.headers["push-type"], "0");
    const [h, p, s] = request.headers.authorization!.slice(7).split(".");
    assert.ok(
      verify(
        "sha256",
        Buffer.from(`${h}.${p}`),
        { key: keys.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
        Buffer.from(s, "base64url"),
      ),
    );
    assert.equal(request.body.payload.notification.foregroundShow, false);
    assert.equal(request.body.pushOptions.ttl, 300);
    assert.equal(request.body.pushOptions.testMessage, false);
    assert.deepEqual(request.body.target.token, [registration.token]);
    assert.equal(request.body.payload.notification.clickAction.data.serverId, "host-1");
    assert.equal(request.body.payload.notification.clickAction.data.agentId, "agent-1");
    assert.equal(request.body.payload.notification.title, "Paseo · 任务完成");
    service.close();
    service = new PushService(devicePath, sender, () => now);
    await service.notify("agent-1", "turn:agent-1:turn-1", "completed");
    assert.equal(captured.length, 2, "dedup survives plugin reload");
    service.register({ ...registration, foreground: true });
    await service.notify("agent-1", "permission:1", "permission");
    assert.equal(captured.length, 2, "fresh foreground is suppressed");
    service.register({ ...registration, token: "rotated-token" });
    await service.notify("agent-1", "permission:1", "permission");
    assert.equal(captured[2].body.target.token[0], "rotated-token");
    assert.equal(captured[2].body.payload.notification.title, "Paseo · 需要确认");
    const testResult = await service.test(installationId);
    assert.ok(testResult.ready);
    assert.equal(captured[3].body.pushOptions.testMessage, true);
    assert.equal(captured[3].body.payload.notification.foregroundShow, true);
    assert.equal(
      (await service.test(installationId)).ready,
      false,
      "test requests are rate limited",
    );
    replies.push({
      status: 200,
      data: {
        code: "80300007",
        msg: JSON.stringify({ illegalTokens: { noRight: ["rotated-token"] } }),
      },
    });
    const result = await service.notify("agent-1", "permission:2", "permission");
    assert.equal(result[0].ready, false);
    assert.ok(!result[0].message.includes("rotated-token"));
    assert.equal(
      JSON.parse(readFileSync(devicePath, "utf8")).length,
      1,
      "rights mismatch preserves binding",
    );
    replies.push({
      status: 200,
      data: {
        code: "80300007",
        msg: JSON.stringify({ illegalTokens: { tokenFormatError: ["rotated-token"] } }),
      },
    });
    await service.notify("agent-1", "permission:3", "permission");
    assert.equal(JSON.parse(readFileSync(devicePath, "utf8")).length, 0);
    service.register(registration);
    service.revoke(installationId);
    const before = captured.length;
    await service.notify("agent-1", "permission:4", "permission");
    assert.equal(captured.length, before, "revoked device gets no later push");
    service.register(registration);
    now += 48 * 60 * 60 * 1000 + 1;
    await service.notify("agent-1", "permission:5", "permission");
    assert.equal(captured.length, before, "offline lease expires after 48 hours");
  } finally {
    service.close();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("missing or malformed credentials fail without exposing key material", () => {
  const sender = new HuaweiSender({ accountPath: "/not-present/service-account.json" });
  assert.equal(sender.status().ready, false);
  assert.ok(!sender.status().message.includes("/not-present"));
});
