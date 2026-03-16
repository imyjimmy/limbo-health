function optionName(flag) {
  return `--${flag}`;
}

export function getCliOptionValue(args, flag) {
  const fullFlag = optionName(flag);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === fullFlag) {
      return args[index + 1] ?? null;
    }

    if (arg.startsWith(`${fullFlag}=`)) {
      return arg.slice(fullFlag.length + 1) || null;
    }
  }

  return null;
}

export function getCliIntegerOptionValue(args, flag) {
  const raw = getCliOptionValue(args, flag);
  if (raw == null) return null;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid value for --${flag}: ${raw}`);
  }

  return parsed;
}
