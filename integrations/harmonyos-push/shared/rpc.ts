import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const installationId = z.string().uuid();
export const RegisterInput = z.object({
  installationId,
  serverId: z.string().trim().min(1).max(200),
  token: z.string().trim().min(1).max(4096),
  foreground: z.boolean(),
});
export const Result = z.object({ ready: z.boolean(), message: z.string() });
export const serviceStatus = defineRpc({
  name: "service.status",
  input: z.object({}),
  output: Result,
});
export const registerDevice = defineRpc({
  name: "device.register",
  input: RegisterInput,
  output: Result,
});
export const revokeDevice = defineRpc({
  name: "device.revoke",
  input: z.object({ installationId }),
  output: Result,
});
export const testDevice = defineRpc({
  name: "device.test",
  input: z.object({ installationId }),
  output: Result,
});
