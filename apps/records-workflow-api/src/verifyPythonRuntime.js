import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { resolvePythonExecutable } from './utils/pythonRuntime.js';

const execFile = promisify(execFileCallback);
const pythonBin = resolvePythonExecutable();
const fetchPythonBin = resolvePythonExecutable({ overrideEnvVar: 'RECORDS_FETCH_PYTHON_BIN' });

const verificationScript = `
import importlib.metadata as metadata
import json
import sys

import fitz
import scrapling

payload = {
    "python": sys.executable,
    "scrapling": metadata.version("scrapling"),
    "pymupdf": metadata.version("PyMuPDF"),
    "fitz_module": getattr(fitz, "__file__", None),
    "scrapling_module": getattr(scrapling, "__file__", None),
}

print(json.dumps(payload))
`;

const { stdout } = await execFile(pythonBin, ['-c', verificationScript], {
  maxBuffer: 2 * 1024 * 1024,
});

const runtimeInfo = JSON.parse(stdout || '{}');
runtimeInfo.fetch_backend = process.env.RECORDS_FETCH_BACKEND || 'scrapling';
runtimeInfo.fetch_python = fetchPythonBin;

process.stdout.write(JSON.stringify(runtimeInfo));
process.stdout.write('\n');
