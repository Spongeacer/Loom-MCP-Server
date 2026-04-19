import type { StoreAdapter } from '@spongeacer/loom-core';
import { runDoctor, formatDoctorReport } from '@spongeacer/loom-core';

export function runDoctorCommand(_args: string[] = [], store: StoreAdapter): string {
  const report = runDoctor(store);
  return formatDoctorReport(report);
}
