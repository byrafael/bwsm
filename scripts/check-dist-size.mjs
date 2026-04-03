import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const DIST_DIR = "dist";
const JS_BUDGET_BYTES = 48 * 1024;

const jsFiles = await collectJsFiles(DIST_DIR);
const sizes = await Promise.all(
  jsFiles.map(async (filePath) => ({ filePath, size: (await stat(filePath)).size })),
);
const totalBytes = sizes.reduce((sum, entry) => sum + entry.size, 0);

if (totalBytes > JS_BUDGET_BYTES) {
  console.error(
    [
      `dist JS size budget exceeded: ${totalBytes} bytes > ${JS_BUDGET_BYTES} bytes`,
      ...sizes
        .sort((left, right) => right.size - left.size)
        .map((entry) => `- ${entry.filePath}: ${entry.size} bytes`),
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  `dist JS size check passed: ${totalBytes} / ${JS_BUDGET_BYTES} bytes across ${jsFiles.length} file(s)`,
);

async function collectJsFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}
