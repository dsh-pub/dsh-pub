const CLIENT_ID_PATTERN = /^ca-pub-\d{10,20}$/;
const SLOT_ID_PATTERN = /^\d{6,20}$/;

export function normalizeAdSenseClientId(raw?: string | null): string | undefined {
  const value = raw?.trim();
  if (!value || !CLIENT_ID_PATTERN.test(value)) return undefined;
  return value;
}

export function isAdSenseClientId(raw?: string | null): boolean {
  return Boolean(normalizeAdSenseClientId(raw));
}

export function normalizeAdSenseSlotId(raw?: string | null): string | undefined {
  const value = raw?.trim();
  if (!value || !SLOT_ID_PATTERN.test(value)) return undefined;
  return value;
}

export function adsTxtBody(clientId: string): string {
  const normalized = normalizeAdSenseClientId(clientId);
  if (!normalized) {
    throw new Error(`Invalid AdSense client id: ${clientId}`);
  }
  const publisherId = normalized.replace(/^ca-/, '');
  return `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`;
}
