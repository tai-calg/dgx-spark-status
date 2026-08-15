import { handler } from './build/handler.js';
import express from 'express';
import {
  assertSecureRemoteConfig,
  getServerHost,
  getServerPort,
  remoteAccessEnabled
} from './src/lib/server/security.js';

assertSecureRemoteConfig();

const app = express();
app.disable('x-powered-by');
app.use(handler);

const HOST = getServerHost();
const PORT = getServerPort();

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Remote access: ${remoteAccessEnabled() ? 'enabled (authentication required)' : 'disabled'}`);
});
