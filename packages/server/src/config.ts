import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
  /** Directory for durable data (bucket assignments). */
  dataDir: string;
}

/**
 * Minimal .env loader (repo root or package cwd); real environment variables
 * always take precedence. Values are never logged.
 */
export function loadDotEnv(): void {
  for (const candidate of ['.env', '../../.env']) {
    let text: string;
    try {
      text = readFileSync(resolve(process.cwd(), candidate), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (process.env[key] !== undefined && process.env[key] !== '') continue;
      process.env[key] = rawValue.replace(/^(["'])(.*)\1$/, '$2');
    }
    return;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const upToken = env.UP_API_TOKEN?.trim() || undefined;
  return {
    port: Number(env.PORT) || 3001,
    upToken,
    demoMode: env.UPSIE_DEMO === '1' || env.UPSIE_DEMO === 'true',
    dataDir: env.UPSIE_DATA_DIR || join(process.cwd(), 'data'),
  };
}
