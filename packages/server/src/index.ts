import { createApp } from './app.js';
import { loadConfig, loadDotEnv } from './config.js';

// `--demo` flag as a cross-platform alternative to UPSIE_DEMO=1 (Windows
// shells don't support the VAR=x command prefix).
if (process.argv.includes('--demo')) process.env.UPSIE_DEMO = '1';
loadDotEnv();
const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  const mode = config.demoMode
    ? 'demo mode (synthetic data)'
    : config.upToken
      ? 'Up API token from environment'
      : 'awaiting per-request X-Up-Token header';
  console.log(`UpsieDaisy API listening on http://localhost:${config.port} — ${mode}`);
});
