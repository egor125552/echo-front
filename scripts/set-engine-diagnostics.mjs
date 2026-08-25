import fs from "node:fs";

const file = new URL("../src/config/engine-diagnostics.js", import.meta.url);
const mode = String(process.argv[2] ?? "status").trim().toLowerCase();
const source = fs.readFileSync(file, "utf8");
const enabledMatch = source.match(/enabled:\s*(true|false)/);
const revisionMatch = source.match(/revision:\s*(\d+)/);
if (!enabledMatch || !revisionMatch) throw new Error("Invalid engine diagnostics control file");

const current = enabledMatch[1] === "true";
const revision = Number(revisionMatch[1]);

if (mode === "status") {
  console.log(JSON.stringify({ enabled: current, revision }));
  process.exit(0);
}
if (mode !== "on" && mode !== "off") throw new Error("Usage: node scripts/set-engine-diagnostics.mjs on|off|status");

const wanted = mode === "on";
if (wanted === current) {
  console.log(JSON.stringify({ changed: false, enabled: current, revision }));
  process.exit(0);
}

const updated = source
  .replace(/enabled:\s*(true|false)/, `enabled: ${wanted}`)
  .replace(/revision:\s*\d+/, `revision: ${revision + 1}`);
fs.writeFileSync(file, updated);
console.log(JSON.stringify({ changed: true, enabled: wanted, revision: revision + 1 }));
