import { applyLocalRuntimeDefaults } from './utils/localRuntimeDefaults.js';
import { startServer } from './server.js';

await applyLocalRuntimeDefaults();
await startServer();
