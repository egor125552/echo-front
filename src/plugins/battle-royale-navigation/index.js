import * as navigation from "./server.js";

export const manifest = {
  ...navigation.manifest,
  version: "1.0.1",
  capabilities: [...new Set([
    ...(navigation.manifest.capabilities ?? []),
    "events.on",
  ])],
};

export const setup = navigation.setup;
