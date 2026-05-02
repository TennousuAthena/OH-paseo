export const CLIENT_CAPS = {
  reasoningMergeEnum: "reasoning_merge_enum",
} as const;

export type ClientCapability = (typeof CLIENT_CAPS)[keyof typeof CLIENT_CAPS];

const CLIENT_CAPABILITY_SET = new Set<string>(Object.values(CLIENT_CAPS));

export function isClientCapability(value: string): value is ClientCapability {
  return CLIENT_CAPABILITY_SET.has(value);
}

export function readDeclaredClientCapabilities(
  capabilities: Record<string, unknown> | null | undefined,
): ClientCapability[] {
  if (!capabilities) {
    return [];
  }

  return Object.entries(capabilities).flatMap(([key, value]) =>
    value === true && isClientCapability(key) ? [key] : [],
  );
}
