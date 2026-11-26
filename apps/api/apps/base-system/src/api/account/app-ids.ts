export function normalizeAppIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))];
}

export function readAppIds(value: unknown, legacyAppId?: string | null): string[] {
  const appIds = normalizeAppIds(value);
  if (appIds.length) return appIds;
  const legacy = legacyAppId?.trim();
  return legacy ? [legacy] : [];
}
