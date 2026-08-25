import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/config/engine-control.js");
const source = fs.readFileSync(filePath, "utf8");
const enabledMatch = source.match(/enabled:\s*(true|false)/);
const revisionMatch = source.match(/revision:\s*(\d+)/);
if (!enabledMatch || !revisionMatch) throw new Error("Could not parse engine-control.js");

const currentEnabled = enabledMatch[1] === "true";
const currentRevision = Number(revisionMatch[1]);
const mode = String(process.argv[2] || "status").toLowerCase();

if (mode === "status") {
  process.stdout.write(JSON.stringify({ enabled: currentEnabled, revision: currentRevision }));
  process.exit(0);
}
if (mode !== "on" && mode !== "off") throw new Error("Usage: set-engine-control.mjs on|off|status");

const nextEnabled = mode === "on";
if (nextEnabled === currentEnabled) {
  process.stdout.write(JSON.stringify({ enabled: currentEnabled, revision: currentRevision, changed: false }));
  process.exit(0);
}

const nextRevision = currentRevision + 1;
const nextSource = source
  .replace(/enabled:\s*(true|false)/, `enabled: ${nextEnabled}`)
  .replace(/revision:\s*\d+/, `revision: ${nextRevision}`);
fs.writeFileSync(filePath, nextSource);
process.stdout.write(JSON.stringify({ enabled: nextEnabled, revision: nextRevision, changed: true }));
