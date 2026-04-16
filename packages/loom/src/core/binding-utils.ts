export function makeBindingFileName(sourceId: string, targetId: string): string {
  const safeSource = sourceId.replace(/[\\/]/g, '_');
  const safeTarget = targetId.replace(/[\\/]/g, '_');
  return `bind-${safeSource}-${safeTarget}.yml`;
}
