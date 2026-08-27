import { createApp } from './app.js';
import { loadConfig } from './config.js';

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
