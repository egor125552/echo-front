# Echo Front browser client architecture

The browser client is plugin-composed. `public/client/bootstrap.js` loads the Echo Front client preset from `public/client/presets/echo-front.js`.

Input, Cloudflare session transport, spatial audio, sound mapping, HUD, accessibility announcements, gamepad support, and other browser behavior live in independent client plugins. Plugins communicate through shared services and events instead of importing one another directly. The client preset is the composition root and must include every file under `public/client/plugins/` exactly once.

The served browser tree lives only under `public/`. Documentation belongs outside `public/` so Wrangler does not publish it as a runtime asset.
