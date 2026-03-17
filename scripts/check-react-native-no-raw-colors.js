const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '../apps/react-native');

const includedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.html',
]);

const excludedPathFragments = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}assets${path.sep}`,
  `${path.sep}editor-web${path.sep}build${path.sep}`,
  `${path.sep}theme${path.sep}`,
  `${path.sep}components${path.sep}binder${path.sep}`,
  `${path.sep}core${path.sep}binder${path.sep}`,
  `${path.sep}app${path.sep}(tabs)${path.sep}(binders)${path.sep}`,
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}to-delete${path.sep}`,
];

const excludedFiles = new Set([
  path.join(appRoot, 'app.json'),
  path.join(appRoot, 'components', 'branding', 'GoogleLogo.tsx'),
]);

const colorPatterns = [
  /#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\b/g,
  /\b(?:rgb|rgba|hsl|hsla)\(/g,
];

function shouldSkip(filePath) {
  if (excludedFiles.has(filePath)) return true;
  return excludedPathFragments.some((fragment) => filePath.includes(fragment));
}

function collectFiles(dirPath, result = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (shouldSkip(fullPath)) continue;
    if (entry.isDirectory()) {
      collectFiles(fullPath, result);
      continue;
    }
    if (!includedExtensions.has(path.extname(entry.name))) continue;
    result.push(fullPath);
  }
  return result;
}

function findViolations(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    for (const pattern of colorPatterns) {
      pattern.lastIndex = 0;
      const matches = line.match(pattern);
      if (!matches) continue;
      for (const match of matches) {
        violations.push({
          lineNumber: index + 1,
          match,
        });
      }
    }
  });

  return violations;
}

const files = collectFiles(appRoot);
const failures = [];

for (const filePath of files) {
  const violations = findViolations(filePath);
  if (violations.length === 0) continue;
  failures.push({ filePath, violations });
}

if (failures.length > 0) {
  console.error('Found raw color literals in non-exempt React Native files:\n');
  for (const failure of failures) {
    const relativePath = path.relative(appRoot, failure.filePath);
    for (const violation of failure.violations) {
      console.error(`- ${relativePath}:${violation.lineNumber} -> ${violation.match}`);
    }
  }
  process.exit(1);
}

console.log('No raw color literals found in non-exempt React Native files.');
