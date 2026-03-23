export function resolvePythonExecutable({ overrideEnvVar = null } = {}) {
  if (overrideEnvVar && process.env[overrideEnvVar]) {
    return process.env[overrideEnvVar];
  }

  return (
    process.env.RECORDS_PYTHON_BIN ||
    process.env.PYTHON3 ||
    process.env.PYTHON ||
    'python3'
  );
}
