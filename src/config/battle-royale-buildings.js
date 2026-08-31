// Declarative buildings for Battle Royale.
//
// Most new buildings should be added here instead of writing a new plugin.
// Coordinates inside a building are local to its x/z origin.
//
// Supported building fields:
// - id, name, x, z, width, depth
// - acoustics: zone, reverbMix, wallOcclusion, doorOcclusion, floorOcclusion, stairOcclusion
// - floors: id, name, y, height, surface, acoustics, rooms, slabs
// - doors: id, name, floorId, side, offset, width, material, fromRegion, toRegion
// - stairs: id, fromFloorId, toFloorId, x, z, run, width, risesToward, material
// - walls: additional wall segments with x/z/hx/hz/y/height/material
// - crates: id, floorId, x, z, yOffset, loot
// - navigation: optional overrides for regions/transitions/targetPosition
//
// Layout convention: a building's main entrance should face the natural approach
// from the centre of the map whenever practical. This keeps navigation intuitive
// without injecting artificial front-approach waypoints into the route planner.

export const BATTLE_ROYALE_BUILDINGS = Object.freeze([
  {
    id: "forest-hut",
    name: "Домик лесника",
    x: -110,
    z: -75,
    width: 12,
    depth: 10,
    wallMaterial: "wood",
    acoustics: {
      zone: "forest-hut",
      reverbMix: 0.2,
      wallOcclusion: 0.74,
      doorOcclusion: 0.86,
      floorOcclusion: 0.82,
      stairOcclusion: 0.3,
    },
    floors: [
      {
        id: "ground",
        name: "комната",
        y: 0,
        height: 2.7,
        surface: "wood",
        acoustics: { reverbMix: 0.22 },
      },
    ],
    doors: [
      {
        id: "forest-hut-front-door",
        name: "Входная дверь домика лесника",
        floorId: "ground",
        side: "east",
        offset: 0,
        width: 3.2,
        material: "wood",
      },
    ],
    crates: [
      { id: "forest-hut-armor", floorId: "ground", x: -2.6, z: 1.6, loot: "armor" },
    ],
  },
  {
    id: "loot-house",
    name: "Дом с припасами",
    x: -175,
    z: 95,
    width: 20,
    depth: 16,
    acoustics: {
      zone: "loot-house",
      reverbMix: 0.32,
      wallOcclusion: 0.8,
      doorOcclusion: 0.9,
      floorOcclusion: 0.86,
      stairOcclusion: 0.34,
    },
    floors: [
      {
        id: "ground",
        name: "первый этаж",
        y: 0,
        height: 2.9,
        surface: "concrete",
        rooms: [
          {
            id: "west-room",
            name: "западная комната",
            minX: -9.5,
            maxX: -0.2,
            minZ: -7.5,
            maxZ: 7.5,
            acoustics: { zone: "loot-house-west", reverbMix: 0.28 },
          },
          {
            id: "east-room",
            name: "восточная комната",
            minX: -0.2,
            maxX: 9.5,
            minZ: -7.5,
            maxZ: 7.5,
            acoustics: { zone: "loot-house-east", reverbMix: 0.37 },
          },
        ],
      },
    ],
    doors: [
      {
        id: "loot-house-east-door",
        name: "Входная дверь дома с припасами",
        floorId: "ground",
        side: "east",
        offset: 0,
        width: 3.6,
        material: "metal",
      },
      {
        id: "loot-house-west-door",
        name: "Западная дверь дома с припасами",
        floorId: "ground",
        side: "west",
        offset: -3.5,
        width: 2.4,
        material: "wood",
      },
    ],
    // Two short wall pieces make two rooms but deliberately leave a broad,
    // shoulder-friendly passage through the middle.
    walls: [
      { floorId: "ground", x: 0, z: -5.25, hx: 0.22, hz: 2.25, height: 2.9, material: "concrete" },
      { floorId: "ground", x: 0, z: 5.25, hx: 0.22, hz: 2.25, height: 2.9, material: "concrete" },
    ],
    crates: [
      { id: "loot-house-rifle-a", floorId: "ground", x: -6.7, z: -4.8, loot: "rifle" },
      { id: "loot-house-armor-a", floorId: "ground", x: -6.7, z: 4.8, loot: "armor" },
      { id: "loot-house-rifle-b", floorId: "ground", x: 6.7, z: -4.8, loot: "rifle" },
      { id: "loot-house-armor-b", floorId: "ground", x: 6.7, z: 4.8, loot: "armor" },
    ],
  },
  {
    id: "two-storey-house",
    name: "Двухэтажный дом",
    x: 135,
    z: 120,
    width: 18,
    depth: 14,
    acoustics: {
      zone: "two-storey-house",
      reverbMix: 0.38,
      wallOcclusion: 0.82,
      doorOcclusion: 0.91,
      floorOcclusion: 0.9,
      stairOcclusion: 0.36,
    },
    floors: [
      {
        id: "ground",
        name: "холл первого этажа",
        y: 0,
        height: 2.9,
        surface: "wood",
        acoustics: { zone: "two-storey-ground", reverbMix: 0.31 },
      },
      {
        id: "upper",
        name: "второй этаж",
        y: 3.2,
        height: 2.9,
        surface: "wood",
        acoustics: { zone: "two-storey-upper", reverbMix: 0.48 },
        // The whole house is rotated 180 degrees compared with the old layout.
        // Enter from the west-facing front door and keep walking straight east:
        // the staircase is directly ahead instead of being around a corner.
        slabs: [
          { x: 4.5, z: 0, width: 9.0, depth: 14.0 },
          { x: -8.0, z: 0, width: 2.0, depth: 14.0 },
          { x: -3.5, z: 4.6, width: 7.0, depth: 4.8 },
          { x: -3.5, z: -4.6, width: 7.0, depth: 4.8 },
        ],
      },
    ],
    doors: [
      {
        id: "two-storey-front-door",
        name: "Входная дверь двухэтажного дома",
        floorId: "ground",
        side: "west",
        offset: 0,
        width: 3.6,
        material: "wood",
      },
    ],
    stairs: [
      {
        id: "two-storey-main-stair",
        name: "лестница на второй этаж",
        fromFloorId: "ground",
        toFloorId: "upper",
        x: -3.5,
        z: 0,
        run: 6.0,
        width: 3.2,
        risesToward: "east",
        material: "wood",
        acoustics: { zone: "two-storey-stairs", reverbMix: 0.4 },
      },
    ],
    crates: [
      { id: "two-storey-ground-armor", floorId: "ground", x: 5.5, z: 4.5, loot: "armor" },
      { id: "two-storey-ground-rifle", floorId: "ground", x: 5.5, z: -4.5, loot: "rifle" },
      { id: "two-storey-upper-rifle-a", floorId: "upper", x: 5.5, z: 4.5, loot: "rifle" },
      { id: "two-storey-upper-armor", floorId: "upper", x: 5.5, z: -4.5, loot: "armor" },
      { id: "two-storey-upper-rifle-b", floorId: "upper", x: -0.5, z: -4.7, loot: "rifle" },
    ],
  },
]);
