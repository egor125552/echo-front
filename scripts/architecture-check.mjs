import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];

async function filesUnder(directory) {
  const result = [];
  async function walk(current) {
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) result.push(full);
    }
  }
  await walk(path.join(root, directory));
  return result;
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

for (const directory of ["src/core", "client/core"]) {
  for (const file of await filesUnder(directory)) {
    const source = await readFile(file, "utf8");
    if (/plugins\//.test(source)) {
      failures.push(`${relative(file)}: core must not import or reference gameplay plugins`);
    }
  }
}

for (const file of await filesUnder("src/plugins")) {
  const source = await readFile(file, "utf8");
  if (!/export\s+const\s+manifest\s*=/.test(source)) {
    failures.push(`${relative(file)}: server plugin must export manifest`);
  }
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  for (const specifier of imports) {
    if (specifier.startsWith(".") && specifier.includes("plugins")) {
      failures.push(`${relative(file)}: plugins may not import another plugin directly (${specifier})`);
    }
    if (specifier.startsWith("../") || specifier.startsWith("./")) {
      failures.push(`${relative(file)}: server plugins must communicate through services/events, not relative imports (${specifier})`);
    }
  }
}

for (const file of await filesUnder("client/plugins")) {
  const source = await readFile(file, "utf8");
  if (!/export\s+const\s+manifest\s*=/.test(source)) {
    failures.push(`${relative(file)}: client plugin must export manifest`);
  }
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  for (const specifier of imports) {
    if (specifier.startsWith(".")) {
      failures.push(`${relative(file)}: client plugins may not import each other directly (${specifier})`);
    }
  }
}

if (failures.length) {
  console.error("Echo Front architecture violations:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Architecture check passed: gameplay remains plugin-only.");
