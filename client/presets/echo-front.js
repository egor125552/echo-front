import * as input from "../plugins/input.js";
import * as network from "../plugins/network.js";
import * as parachuteInput from "../plugins/parachute-input.js";
import * as iphoneGestures from "../plugins/iphone-gestures.js";
import * as journal from "../plugins/play-journal.js";
import * as smoothing from "../plugins/snapshot-smoothing.js";
import * as speechSettings from "../plugins/speech-settings.js";
import * as spatialAudio from "../plugins/spatial-audio.js";
import * as navigation from "../plugins/battle-royale-navigation.js";
import * as parachuteAudioPreload from "../plugins/parachute-audio-preload.js";
import * as soundPack from "../plugins/core-sound-pack.js";
import * as eventSoundPack from "../plugins/event-sound-pack.js";
import * as armorPlatingAudio from "../plugins/armor-plating-audio.js";
import * as environmentAudio from "../plugins/environment-audio.js";
import * as buildingAcoustics from "../plugins/building-acoustics.js";
import * as battleRoyaleAudio from "../plugins/battle-royale-audio.js";
import * as battleRoyaleZoneAudio from "../plugins/battle-royale-zone-audio.js";
import * as botParachuteAudio from "../plugins/battle-royale-bot-parachute-audio.js";
import * as vehicleAudio from "../plugins/battle-royale-vehicle-audio.js";
import * as ragdollAudio from "../plugins/battle-royale-ragdoll-audio.js";
import * as parachuteAudio from "../plugins/parachute-audio.js";
import * as parachuteDynamicsAudio from "../plugins/parachute-dynamics-audio.js";
import * as lowHealthAudio from "../plugins/low-health-audio.js";
import * as hud from "../plugins/game-hud.js";
import * as announcer from "../plugins/announcer.js";
import * as parachuteAnnouncer from "../plugins/parachute-announcer.js";
import * as vehicleAnnouncer from "../plugins/battle-royale-vehicle-announcer.js";

export const echoFrontClientPreset = [
  input,
  network,
  parachuteInput,
  iphoneGestures,
  journal,
  smoothing,
  speechSettings,
  spatialAudio,
  navigation,
  parachuteAudioPreload,
  soundPack,
  eventSoundPack,
  armorPlatingAudio,
  environmentAudio,
  buildingAcoustics,
  battleRoyaleAudio,
  battleRoyaleZoneAudio,
  botParachuteAudio,
  vehicleAudio,
  ragdollAudio,
  parachuteAudio,
  parachuteDynamicsAudio,
  lowHealthAudio,
  hud,
  announcer,
  parachuteAnnouncer,
  vehicleAnnouncer,
];
