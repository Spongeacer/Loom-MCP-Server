export class LoomError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly exitCode = 1
  ) {
    super(message);
    this.name = 'LoomError';
  }
}

export interface CommandResult<T = string> {
  success: boolean;
  data?: T;
  error?: { message: string; code: string };
}

export function ok<T>(data: T): CommandResult<T> {
  return { success: true, data };
}

export function fail(message: string, code = 'UNKNOWN'): CommandResult<never> {
  return { success: false, error: { message, code } };
}
