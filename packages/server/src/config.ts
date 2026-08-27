/**
 * All configuration comes from the environment at runtime. Secrets are never
 * read from files inside the repository — see .env.example at the repo root.
 */
export interface Config {
  port: number;
  /** Optional server-side Up token. Clients may instead send X-Up-Token. */
  upToken: string | undefined;
  /** When true, serve deterministic synthetic data (no bank access at all). */
  demoMode: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const upToken = env.UP_API_TOKEN?.trim() || undefined;
  return {
    port: Number(env.PORT) || 3001,
    upToken,
    demoMode: env.UPSIE_DEMO === '1' || env.UPSIE_DEMO === 'true',
  };
}
