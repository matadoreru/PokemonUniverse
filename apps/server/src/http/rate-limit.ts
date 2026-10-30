export function rateLimitDisabled(env: { NODE_ENV: string; RATE_LIMIT_DISABLED: boolean }): boolean {
  return env.RATE_LIMIT_DISABLED && env.NODE_ENV !== 'production';
}
