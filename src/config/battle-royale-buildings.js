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

export const BATTLE_ROYALE_BUILDINGS = Object.freeze([
  {
    id: "forest-hut",
    name: "Домик лесника",
    x: -110,
    z: -75,
    width: 12,
    depth: 10,
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
        surface: "stone",
        acoustics: { reverbMix: 0.22 },
      },
    ],
    doors: [
      {
        id: "forest-hut-front-door",
        name: "Дверь домика лесника",
        floorId: "ground",
        side: "south",
        offset: 0,
        width: 2.1,
        material: "wood",
      },
    ],
    crates: [
      { id: "forest-hut-armor", floorId: "ground", x: -2.5, z: 1.8, loot: "armor" },
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
        name: "Восточная дверь дома с припасами",
        floorId: "ground",
        side: "east",
        offset: 0,
        width: 2.4,
        material: "metal",
      },
      {
        id: "loot-house-west-door",
        name: "Западная дверь дома с припасами",
        floorId: "ground",
        side: "west",
        offset: -3.5,
        width: 2.2,
        material: "wood",
      },
    ],
    // A partial divider creates two acoustically different halves while leaving
    // a wide passage in the middle. More complex layouts can be expressed as
    // as many explicit wall segments as needed.
    walls: [
      { floorId: "ground", x: 0, z: -5.4, hx: 0.22, hz: 2.1, height: 2.9, material: "concrete" },
      { floorId: "ground", x: 0, z: 5.4, hx: 0.22, hz: 2.1, height: 2.9, material: "concrete" },
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
        name: "первый этаж",
        y: 0,
        height: 2.9,
        surface: "concrete",
        acoustics: { zone: "two-storey-ground", reverbMix: 0.34 },
      },
      {
        id: "upper",
        name: "второй этаж",
        y: 3.2,
        height: 2.9,
        surface: "concrete",
        acoustics: { zone: "two-storey-upper", reverbMix: 0.5 },
        // Four slabs leave a real physical opening over the staircase.
        slabs: [
          { x: -4, z: 0, width: 10, depth: 14 },
          { x: 8, z: 0, width: 2, depth: 14 },
          { x: 4, z: -4.5, width: 6, depth: 5 },
          { x: 4, z: 4.5, width: 6, depth: 5 },
        ],
      },
    ],
    doors: [
      {
        id: "two-storey-front-door",
        name: "Входная дверь двухэтажного дома",
        floorId: "ground",
        side: "east",
        offset: 0,
        width: 2.4,
        material: "wood",
      },
    ],
    stairs: [
      {
        id: "two-storey-main-stair",
        fromFloorId: "ground",
        toFloorId: "upper",
        x: 4,
        z: 0,
        run: 6,
        width: 3.6,
        risesToward: "west",
        material: "wood",
      },
    ],
    crates: [
      { id: "two-storey-ground-armor", floorId: "ground", x: -5.5, z: -4.5, loot: "armor" },
      { id: "two-storey-ground-rifle", floorId: "ground", x: -5.5, z: 4.5, loot: "rifle" },
      { id: "two-storey-upper-rifle-a", floorId: "upper", x: -5.5, z: -4.5, loot: "rifle" },
      { id: "two-storey-upper-armor", floorId: "upper", x: -5.5, z: 4.5, loot: "armor" },
      { id: "two-storey-upper-rifle-b", floorId: "upper", x: 7.2, z: 4.7, loot: "rifle" },
    ],
  },
  {
    id: "north-stair-house",
    name: "Дом с северной лестницей",
    x: 265,
    z: -185,
    width: 16,
    depth: 18,
    acoustics: {
      zone: "north-stair-house",
      reverbMix: 0.4,
      wallOcclusion: 0.83,
      doorOcclusion: 0.9,
      floorOcclusion: 0.89,
      stairOcclusion: 0.35,
    },
    floors: [
      {
        id: "ground",
        name: "первый этаж",
        y: 0,
        height: 2.9,
        surface: "wood",
        acoustics: { zone: "north-stair-ground", reverbMix: 0.31 },
      },
      {
        id: "upper",
        name: "второй этаж",
        y: 3.2,
        height: 2.9,
        surface: "wood",
        acoustics: { zone: "north-stair-upper", reverbMix: 0.47 },
        // Leave a compact opening around the north/south staircase.
        slabs: [
          { x: -4.9, z: 0, width: 6.2, depth: 18 },
          { x: 4.9, z: 0, width: 6.2, depth: 18 },
          { x: 0, z: -6.2, width: 3.6, depth: 5.6 },
          { x: 0, z: 6.2, width: 3.6, depth: 5.6 },
        ],
      },
    ],
    doors: [
      {
        id: "north-stair-front-door",
        name: "Входная дверь дома с северной лестницей",
        floorId: "ground",
        side: "south",
        offset: 0,
        width: 2.4,
        material: "wood",
      },
    ],
    stairs: [
      {
        id: "north-stair-main",
        name: "северная лестница",
        fromFloorId: "ground",
        toFloorId: "upper",
        x: 0,
        z: 0,
        run: 6,
        width: 3.4,
        risesToward: "north",
        material: "wood",
        acoustics: { zone: "north-stair-steps", reverbMix: 0.41 },
      },
    ],
    crates: [
      { id: "north-stair-ground-crate", floorId: "ground", x: -5.2, z: -5.8, loot: "armor" },
      { id: "north-stair-upper-crate", floorId: "upper", x: 5.2, z: 5.8, loot: "rifle" },
    ],
  },
]);
