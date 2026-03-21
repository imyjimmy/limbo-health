import { applyLocalRuntimeDefaults } from './utils/localRuntimeDefaults.js';

await applyLocalRuntimeDefaults();
const { startServer } = await import('./server.js');
await startServer();
