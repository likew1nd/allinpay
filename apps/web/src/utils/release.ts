export function hasReleaseUpdate(current?: string, latest?: string) {
  const version = /^\d+\.\d+\.\d+$/;
  if (!latest || !version.test(latest)) return false;
  if (!current) return true;
  if (!version.test(current)) return false;
  const installed = current.split('.').map(Number);
  const available = latest.split('.').map(Number);
  const difference = available.findIndex((part, index) => part !== installed[index]);
  return difference !== -1 && available[difference] > installed[difference];
}
