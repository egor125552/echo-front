# Temporary developer settings module

This module is intentionally temporary.

Purpose:
- tune runtime gameplay values during a live Battle Royale match;
- verify which values actually reach the real runtime;
- avoid changing permanent gameplay modules while experimenting.

Isolation rule:
- no developer-mode code may be added to match-room, the normal network plugin, ragdoll, parkour, parachute, or other permanent gameplay modules;
- check.mjs enforces this for the currently covered core files.

Current temporary files:
- src/plugins/developer-settings/server.js
- src/plugins/developer-settings/check.mjs
- src/plugins/developer-settings/README.md
- public/client/plugins/developer-settings-ui.js

Current permanent-file wiring:
- src/presets/battle-royale.js imports and installs developerSettings;
- public/client/presets/echo-front.js imports and installs developerSettingsUi.

To remove developer mode later:
1. Remove the developerSettings import and preset entry from src/presets/battle-royale.js.
2. Remove the developerSettingsUi import and preset entry from public/client/presets/echo-front.js.
3. Delete src/plugins/developer-settings/.
4. Delete public/client/plugins/developer-settings-ui.js.
5. Run the normal project tests and a Wrangler dry-run.

No gameplay defaults are persisted by this module. Runtime changes disappear with the match.
