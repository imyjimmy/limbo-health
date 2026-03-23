import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { applyLocalRuntimeDefaults } from './utils/localRuntimeDefaults.js';

const taskModulePath = process.argv[2];

if (!taskModulePath) {
  throw new Error('A local task module path is required.');
}

await applyLocalRuntimeDefaults();

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const absoluteTaskPath = path.resolve(srcDir, taskModulePath);
await import(pathToFileURL(absoluteTaskPath).href);
