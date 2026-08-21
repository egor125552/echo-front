import * as input from "../plugins/input.js";
import * as network from "../plugins/network.js";
import * as spatialAudio from "../plugins/spatial-audio.js";
import * as soundPack from "../plugins/core-sound-pack.js";
import * as hud from "../plugins/game-hud.js";
import * as announcer from "../plugins/announcer.js";

export const echoFrontClientPreset = [
  input,
  network,
  spatialAudio,
  soundPack,
  hud,
  announcer,
];
