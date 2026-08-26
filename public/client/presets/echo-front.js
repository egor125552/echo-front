import * as input from "../plugins/input.js";
import * as network from "../plugins/network.js";
import * as parachuteInput from "../plugins/parachute-input.js";
import * as journal from "../plugins/play-journal.js";
import * as smoothing from "../plugins/snapshot-smoothing.js";
import * as speechSettings from "../plugins/speech-settings.js";
import * as spatialAudio from "../plugins/spatial-audio.js";
import * as parachuteAudioPreload from "../plugins/parachute-audio-preload.js";
import * as soundPack from "../plugins/core-sound-pack.js";
import * as eventSoundPack from "../plugins/event-sound-pack.js";
import * as armorPlatingAudio from "../plugins/armor-plating-audio.js";
import * as environmentAudio from "../plugins/environment-audio.js";
import * as buildingAcoustics from "../plugins/building-acoustics.js";
import * as battleRoyaleAudio from "../plugins/battle-royale-audio.js";
import * as parachuteAudio from "../plugins/parachute-audio.js";
import * as parachuteDynamicsAudio from "../plugins/parachute-dynamics-audio.js";
import * as lowHealthAudio from "../plugins/low-health-audio.js";
import * as hud from "../plugins/game-hud.js";
import * as announcer from "../plugins/announcer.js";

export const echoFrontClientPreset = [
  input,
  network,
  parachuteInput,
  journal,
  smoothing,
  speechSettings,
  spatialAudio,
  parachuteAudioPreload,
  soundPack,
  eventSoundPack,
  armorPlatingAudio,
  environmentAudio,
  buildingAcoustics,
  battleRoyaleAudio,
  parachuteAudio,
  parachuteDynamicsAudio,
  lowHealthAudio,
  hud,
  announcer,
];