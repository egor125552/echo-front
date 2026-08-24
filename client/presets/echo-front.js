import * as input from "../plugins/input.js";
import * as network from "../plugins/network.js";
import * as journal from "../plugins/play-journal.js";
import * as smoothing from "../plugins/snapshot-smoothing.js";
import * as speechSettings from "../plugins/speech-settings.js";
import * as spatialAudio from "../plugins/spatial-audio.js";
import * as soundPack from "../plugins/core-sound-pack.js";
import * as eventSoundPack from "../plugins/event-sound-pack.js";
import * as armorPlatingAudio from "../plugins/armor-plating-audio.js";
import * as environmentAudio from "../plugins/environment-audio.js";
import * as lowHealthAudio from "../plugins/low-health-audio.js";
import * as hud from "../plugins/game-hud.js";
import * as announcer from "../plugins/announcer.js";

export const echoFrontClientPreset = [
  input,
  network,
  journal,
  smoothing,
  speechSettings,
  spatialAudio,
  soundPack,
  eventSoundPack,
  armorPlatingAudio,
  environmentAudio,
  lowHealthAudio,
  hud,
  announcer,
];
