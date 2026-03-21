import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { resolvePythonExecutable } from './utils/pythonRuntime.js';

const execFile = promisify(execFileCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const requirementsPath = path.resolve(__dirname, '..', 'python-requirements.txt');
const pythonBin = resolvePythonExecutable();

const { stdout, stderr } = await execFile(
  pythonBin,
  ['-m', 'pip', 'install', '-r', requirementsPath],
  {
    maxBuffer: 20 * 1024 * 1024
  }
);

if (stdout) {
  process.stdout.write(stdout);
}

if (stderr) {
  process.stderr.write(stderr);
}
