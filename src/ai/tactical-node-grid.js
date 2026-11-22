// GTA San Andreas-Style Two-Layer Navigation Cubes (Car Nodes + Ped Nodes)
// manually placed across the entire Battle Royale map in config/battle-royale-navigation-cubes.js,
// plus a Smart Blueprint & Map-Expansion Auto-Compiler that automatically generates exact door, room,
// stair, cover, and road cubes whenever new buildings or expanded map zones are added.

import {
  MANUAL_BUILDING_BOUNDS,
  MANUAL_CAR_CUBES,
  MANUAL_PED_CUBES,
} from "../config/battle-royale-navigation-cubes.js";
import { BATTLE_ROYALE_BUILDINGS } from "../config/battle-royale-buildings.js";

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function dist2(a, b) {
  return Math.hypot((Number(a?.x) || 0) - (Number(b?.x) || 0), (Number(a?.z) || 0) - (Number(b?.z) || 0));
}

function dist3(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.y) || 0) - (Number(b?.y) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function normalizeAngle(angle) {
  let a = Number(angle) || 0;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class TacticalNodeGrid {
  constructor(map = null) {
    this.map = map;
    this.halfSize = Math.max(160, Number(map?.halfSize) || 400);
    this.sectorCols = 8;
    this.sectorRows = 8;
    this.carNodes = [];
    this.pedNodes = [];
    this.carNodeById = new Map();
    this.pedNodeById = new Map();
    this.carSectors = new Map();
    this.pedSectors = new Map();
    this.customBlueprints = [];

    // Living Tactical Field state
    this.reservations = new Map(); // nodeId -> { botId, until }
    this.botReservedNode = new Map(); // botId -> nodeId
    this.dangerEvents = []; // [{ x, z, dirX, dirZ, intensity, expiresAt }]
    this.motionTracker = new Map(); // entityId -> { x, z, vx, vz, angle, at }

    this.stats = {
      carPathQueries: 0,
      pedPathQueries: 0,
      tacticalNodeSelections: 0,
      squadmateEscortSelections: 0,
      ramVectorsApproved: 0,
      dangerUpdates: 0,
      autoCompiledBuildingCubes: 0,
      autoCompiledExpansionCubes: 0,
    };

    this._syncedNavCount = -1;
    this._syncedHalfSize = -1;
    this._syncedMapRef = null;
    this._buildingBounds = null;
    this._buildingBoundsMapRef = null;
    this._buildingBoundsNavCount = -1;
    this._buildingBoundsCustomCount = -1;
    this.buildGraphs();
  }

  ensureSynced() {
    const navCount = Array.isArray(this.map?.navigationBuildings) ? this.map.navigationBuildings.length : 0;
    const currentHalfSize = Math.max(160, Number(this.map?.halfSize) || 400);
    if (
      this._syncedMapRef !== this.map
      || this._syncedNavCount !== navCount
      || this._syncedHalfSize !== currentHalfSize
    ) {
      this.halfSize = currentHalfSize;
      this.buildGraphs();
    }
  }

  sectorKeyFor(x, z) {
    const span = this.halfSize * 2;
    const gx = clamp(Math.floor(((Number(x) || 0) + this.halfSize) / (span / this.sectorCols)), 0, this.sectorCols - 1);
    const gz = clamp(Math.floor(((Number(z) || 0) + this.halfSize) / (span / this.sectorRows)), 0, this.sectorRows - 1);
    return `${gx}:${gz}`;
  }

  rebuildBuildingBounds() {
    const list = [];
    const seen = new Set();
    if (this.map?.building && Number.isFinite(this.map.building.minX)) {
      const id = String(this.map.building.id ?? "warehouse");
      seen.add(id);
      list.push({ id, ...this.map.building });
    }
    const navBuildings = this.map?.navigationBuildings;
    if (Array.isArray(navBuildings)) {
      for (const nb of navBuildings) {
        const bounds = nb?.bounds ?? nb;
        const id = String(nb?.id ?? bounds?.id ?? "");
        if (!id || seen.has(id) || !Number.isFinite(bounds?.minX)) continue;
        seen.add(id);
        list.push({ id, ...bounds });
      }
    }
    for (const bp of BATTLE_ROYALE_BUILDINGS) {
      if (!bp?.id || seen.has(bp.id)) continue;
      const hw = Math.abs(Number(bp.width) || 12) * 0.5;
      const hd = Math.abs(Number(bp.depth) || 10) * 0.5;
      seen.add(bp.id);
      list.push({
        id: bp.id,
        minX: (Number(bp.x) || 0) - hw,
        maxX: (Number(bp.x) || 0) + hw,
        minZ: (Number(bp.z) || 0) - hd,
        maxZ: (Number(bp.z) || 0) + hd,
      });
    }
    for (const bp of this.customBlueprints) {
      if (!bp?.id || seen.has(bp.id)) continue;
      const hw = Math.abs(Number(bp.width) || 12) * 0.5;
      const hd = Math.abs(Number(bp.depth) || 10) * 0.5;
      seen.add(bp.id);
      list.push({
        id: bp.id,
        minX: (Number(bp.x) || 0) - hw,
        maxX: (Number(bp.x) || 0) + hw,
        minZ: (Number(bp.z) || 0) - hd,
        maxZ: (Number(bp.z) || 0) + hd,
      });
    }
    for (const manualBuilding of MANUAL_BUILDING_BOUNDS) {
      if (!seen.has(manualBuilding.id)) {
        seen.add(manualBuilding.id);
        list.push({ ...manualBuilding });
      }
    }
    if (!seen.has("warehouse-east")) {
      seen.add("warehouse-east");
      list.push({ id: "warehouse-east", minX: 122, maxX: 158, minZ: -34, maxZ: -10 });
    }
    this._buildingBounds = list;
    this._buildingBoundsMapRef = this.map;
    this._buildingBoundsNavCount = Array.isArray(navBuildings) ? navBuildings.length : 0;
    this._buildingBoundsCustomCount = this.customBlueprints.length;
    return list;
  }

  buildingBoundsList() {
    const navCount = Array.isArray(this.map?.navigationBuildings) ? this.map.navigationBuildings.length : 0;
    if (
      this._buildingBounds
      && this._buildingBoundsMapRef === this.map
      && this._buildingBoundsNavCount === navCount
      && this._buildingBoundsCustomCount === this.customBlueprints.length
    ) {
      return this._buildingBounds;
    }
    return this.rebuildBuildingBounds();
  }

  pointInsideAnyBuilding(x, z, margin = 0) {
    const bounds = this.buildingBoundsList();
    for (let i = 0; i < bounds.length; i += 1) {
      const b = bounds[i];
      if (
        x >= b.minX - margin
        && x <= b.maxX + margin
        && z >= b.minZ - margin
        && z <= b.maxZ + margin
      ) {
        return b;
      }
    }
    return null;
  }

  segmentHitsBuilding(a, b, margin = 4.5) {
    const ax = Number(a?.x) || 0;
    const az = Number(a?.z) || 0;
    const bx = Number(b?.x) || 0;
    const bz = Number(b?.z) || 0;
    const dx = bx - ax;
    const dz = bz - az;
    const segMinX = ax < bx ? ax : bx;
    const segMaxX = ax > bx ? ax : bx;
    const segMinZ = az < bz ? az : bz;
    const segMaxZ = az > bz ? az : bz;
    const bounds = this.buildingBoundsList();
    let steps = 0;

    for (let j = 0; j < bounds.length; j += 1) {
      const bnd = bounds[j];
      const minX = bnd.minX - margin;
      const maxX = bnd.maxX + margin;
      if (segMaxX < minX || segMinX > maxX) continue;
      const minZ = bnd.minZ - margin;
      const maxZ = bnd.maxZ + margin;
      if (segMaxZ < minZ || segMinZ > maxZ) continue;

      // Exact 2D slab reject before sampling the discrete interior points.
      let tMin = 0;
      let tMax = 1;
      if (Math.abs(dx) < 1e-12) {
        if (ax < minX || ax > maxX) continue;
      } else {
        let tx1 = (minX - ax) / dx;
        let tx2 = (maxX - ax) / dx;
        if (tx1 > tx2) { const tmp = tx1; tx1 = tx2; tx2 = tmp; }
        if (tx1 > tMin) tMin = tx1;
        if (tx2 < tMax) tMax = tx2;
        if (tMin > tMax) continue;
      }
      if (Math.abs(dz) < 1e-12) {
        if (az < minZ || az > maxZ) continue;
      } else {
        let tz1 = (minZ - az) / dz;
        let tz2 = (maxZ - az) / dz;
        if (tz1 > tz2) { const tmp = tz1; tz1 = tz2; tz2 = tmp; }
        if (tz1 > tMin) tMin = tz1;
        if (tz2 < tMax) tMax = tz2;
        if (tMin > tMax) continue;
      }

      if (steps === 0) steps = Math.max(4, Math.ceil(Math.hypot(dx, dz) / 4));
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        const x = ax + dx * t;
        const z = az + dz * t;
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true;
      }
    }
    return false;
  }

  hasNearbyCarNode(x, z, minSeparation = 9.5) {
    const limitSq = minSeparation * minSeparation;
    for (let i = 0; i < this.carNodes.length; i += 1) {
      const node = this.carNodes[i];
      const dx = node.x - x;
      const dz = node.z - z;
      if (dx * dx + dz * dz <= limitSq) return true;
    }
    return false;
  }

  hasNearbyPedNode(x, y, z, minSeparation = 2.4) {
    const limitSq = minSeparation * minSeparation;
    const ny = y || 0;
    for (let i = 0; i < this.pedNodes.length; i += 1) {
      const node = this.pedNodes[i];
      if (Math.abs((node.y || 0) - ny) > 0.8) continue;
      const dx = node.x - x;
      const dz = node.z - z;
      if (dx * dx + dz * dz <= limitSq) return true;
    }
    return false;
  }

  addCarNode({
    id = null,
    x,
    z,
    kind = "highway",
    targetSpeed = 20,
    halfExtent = 4.5,
    buildingId = null,
    zone = "map",
    manual = null,
  }) {
    const nodeId = id && !this.carNodeById.has(id) ? String(id) : `car-node-${this.carNodes.length}`;
    const node = {
      id: nodeId,
      layer: "car",
      x: Number(Number(x).toFixed(2)),
      y: 0,
      z: Number(Number(z).toFixed(2)),
      halfExtent,
      kind,
      targetSpeed,
      laneOffset: 3.6,
      buildingId,
      zone,
      manual: manual !== null ? Boolean(manual) : Boolean(id),
      sectorKey: this.sectorKeyFor(x, z),
      neighbors: [],
    };
    this.carNodes.push(node);
    this.carNodeById.set(nodeId, node);
    if (!this.carSectors.has(node.sectorKey)) this.carSectors.set(node.sectorKey, []);
    this.carSectors.get(node.sectorKey).push(node);
    return node;
  }

  addPedNode({
    id = null,
    x,
    y = 0,
    z,
    kind = "roam",
    halfExtent = 2.2,
    buildingId = null,
    coverNormal = null,
    zone = "map",
    manual = null,
  }) {
    const nodeId = id && !this.pedNodeById.has(id) ? String(id) : `ped-node-${this.pedNodes.length}`;
    const node = {
      id: nodeId,
      layer: "ped",
      x: Number(Number(x).toFixed(2)),
      y: Number(Number(y).toFixed(2)),
      z: Number(Number(z).toFixed(2)),
      halfExtent,
      kind,
      buildingId,
      coverNormal,
      zone,
      manual: manual !== null ? Boolean(manual) : Boolean(id),
      sectorKey: this.sectorKeyFor(x, z),
      neighbors: [],
    };
    this.pedNodes.push(node);
    this.pedNodeById.set(nodeId, node);
    if (!this.pedSectors.has(node.sectorKey)) this.pedSectors.set(node.sectorKey, []);
    this.pedSectors.get(node.sectorKey).push(node);
    return node;
  }

  /**
   * Smart Building Blueprint Compiler:
   * Automatically reads a building blueprint (doors, rooms, stairs, crates, floors, walls)
   * and places exact doorway, room interior, stair, corner cover, and vehicle perimeter cubes
   * whenever a new building is added to the map (skipping any cube that already has a manual cube).
   */
  compileBlueprintCubesForBuilding(blueprint) {
    if (!blueprint || !blueprint.id) return { addedCar: 0, addedPed: 0 };
    const bId = String(blueprint.id);
    const bx = Number(blueprint.x) || 0;
    const bz = Number(blueprint.z) || 0;
    const hw = Math.abs(Number(blueprint.width) || 14) * 0.5;
    const hd = Math.abs(Number(blueprint.depth) || 12) * 0.5;
    const minX = bx - hw;
    const maxX = bx + hw;
    const minZ = bz - hd;
    const maxZ = bz + hd;

    let addedCar = 0;
    let addedPed = 0;

    const tryAddPed = (spec) => {
      if (this.hasNearbyPedNode(spec.x, spec.y ?? 0, spec.z, 2.2)) return;
      this.addPedNode({ ...spec, buildingId: bId, zone: bId, manual: false });
      addedPed += 1;
      this.stats.autoCompiledBuildingCubes += 1;
    };

    const tryAddCar = (spec) => {
      if (this.hasNearbyCarNode(spec.x, spec.z, 9.0)) return;
      if (this.pointInsideAnyBuilding(spec.x, spec.z, 8.5)) return;
      this.addCarNode({ ...spec, buildingId: bId, zone: bId, manual: false });
      addedCar += 1;
      this.stats.autoCompiledBuildingCubes += 1;
    };

    const floorsById = new Map();
    for (const fl of blueprint.floors ?? [{ id: "ground", y: 0 }]) {
      floorsById.set(String(fl.id), fl);
    }

    // 1. Real Doors: place paired outside & inside threshold cubes ONLY where real doors exist
    for (const door of blueprint.doors ?? []) {
      const fl = floorsById.get(String(door.floorId ?? "ground")) ?? { y: 0 };
      const y = Number(fl.y) || 0;
      const offset = Number(door.offset) || 0;
      const side = String(door.side ?? "east");
      let outPt = { x: maxX + 2.4, z: bz + offset };
      let inPt = { x: maxX - 2.4, z: bz + offset };
      let dropPt = { x: maxX + 15, z: bz + offset };
      if (side === "west") {
        outPt = { x: minX - 2.4, z: bz + offset };
        inPt = { x: minX + 2.4, z: bz + offset };
        dropPt = { x: minX - 15, z: bz + offset };
      } else if (side === "north") {
        outPt = { x: bx + offset, z: minZ - 2.4 };
        inPt = { x: bx + offset, z: minZ + 2.4 };
        dropPt = { x: bx + offset, z: minZ - 15 };
      } else if (side === "south") {
        outPt = { x: bx + offset, z: maxZ + 2.4 };
        inPt = { x: bx + offset, z: maxZ - 2.4 };
        dropPt = { x: bx + offset, z: maxZ + 15 };
      }
      tryAddPed({ x: outPt.x, y, z: outPt.z, kind: "doorway" });
      tryAddPed({ x: inPt.x, y, z: inPt.z, kind: "doorway" });
      tryAddCar({ x: dropPt.x, z: dropPt.z, kind: "dropoff", targetSpeed: 11 });
    }

    // 2. Real Rooms, Upper Slabs, and Loot Crates
    for (const fl of blueprint.floors ?? []) {
      const y = Number(fl.y) || 0;
      if (Array.isArray(fl.rooms) && fl.rooms.length > 0) {
        for (const room of fl.rooms) {
          const rx = bx + ((Number(room.minX) || 0) + (Number(room.maxX) || 0)) * 0.5;
          const rz = bz + ((Number(room.minZ) || 0) + (Number(room.maxZ) || 0)) * 0.5;
          tryAddPed({ x: rx, y, z: rz, kind: "interior" });
        }
      } else if (y === 0) {
        tryAddPed({ x: bx, y: 0, z: bz, kind: "interior" });
      }
    }

    for (const crate of blueprint.crates ?? []) {
      const fl = floorsById.get(String(crate.floorId ?? "ground")) ?? { y: 0 };
      const y = Number(fl.y) || 0;
      tryAddPed({
        x: bx + (Number(crate.x) || 0),
        y,
        z: bz + (Number(crate.z) || 0),
        kind: "interior",
      });
    }

    // 3. Real Stairs (bottom and top cubes)
    for (const stair of blueprint.stairs ?? []) {
      const fromFl = floorsById.get(String(stair.fromFloorId ?? "ground")) ?? { y: 0 };
      const toFl = floorsById.get(String(stair.toFloorId ?? "upper")) ?? { y: 3.2 };
      const sx = bx + (Number(stair.x) || 0);
      const sz = bz + (Number(stair.z) || 0);
      const halfRun = Math.abs(Number(stair.run) || 6) * 0.5;
      const dir = String(stair.risesToward ?? "east");
      let dx = halfRun;
      let dz = 0;
      if (dir === "west") { dx = -halfRun; dz = 0; }
      else if (dir === "north") { dx = 0; dz = -halfRun; }
      else if (dir === "south") { dx = 0; dz = halfRun; }

      tryAddPed({ x: sx - dx, y: Number(fromFl.y) || 0, z: sz - dz, kind: "stair" });
      tryAddPed({ x: sx + dx, y: Number(toFl.y) || 3.2, z: sz + dz, kind: "stair" });
    }

    // 4. Exterior Cover Corners, Flanking Cubes & Vehicle Bypass Perimeter
    const coverOffset = 3.4;
    const cornerSpecs = [
      { x: minX - coverOffset, z: minZ - coverOffset, nx: -0.7, nz: -0.7 },
      { x: maxX + coverOffset, z: minZ - coverOffset, nx: 0.7, nz: -0.7 },
      { x: maxX + coverOffset, z: maxZ + coverOffset, nx: 0.7, nz: 0.7 },
      { x: minX - coverOffset, z: maxZ + coverOffset, nx: -0.7, nz: 0.7 },
    ];
    for (const c of cornerSpecs) {
      tryAddPed({ x: c.x, y: 0, z: c.z, kind: "cover", coverNormal: { x: c.nx, z: c.nz } });
    }

    const flankOffset = 10.5;
    const flankSpecs = [
      { x: minX - flankOffset, z: minZ - flankOffset },
      { x: maxX + flankOffset, z: minZ - flankOffset },
      { x: maxX + flankOffset, z: maxZ + flankOffset },
      { x: minX - flankOffset, z: maxZ + flankOffset },
    ];
    for (const f of flankSpecs) {
      tryAddPed({ x: f.x, y: 0, z: f.z, kind: "flank" });
    }

    const carStandoff = 15;
    const carCorners = [
      { x: minX - carStandoff, z: minZ - carStandoff, kind: "perimeter", targetSpeed: 14 },
      { x: maxX + carStandoff, z: minZ - carStandoff, kind: "perimeter", targetSpeed: 14 },
      { x: maxX + carStandoff, z: maxZ + carStandoff, kind: "perimeter", targetSpeed: 14 },
      { x: minX - carStandoff, z: maxZ + carStandoff, kind: "perimeter", targetSpeed: 14 },
    ];
    for (const cc of carCorners) {
      tryAddCar(cc);
    }

    return { addedCar, addedPed };
  }

  /**
   * Registers a new building blueprint at runtime (e.g. when expanding the map or adding a custom structure)
   * and automatically compiles its door, interior, stair, cover, and road cubes.
   */
  registerBuildingBlueprint(blueprint) {
    if (!blueprint || !blueprint.id) return { addedCar: 0, addedPed: 0 };
    const exists = this.customBlueprints.findIndex((b) => b.id === blueprint.id);
    if (exists >= 0) this.customBlueprints[exists] = blueprint;
    else this.customBlueprints.push(blueprint);
    this.rebuildBuildingBounds();
    const res = this.compileBlueprintCubesForBuilding(blueprint);
    this.reconnectAllNodes();
    return res;
  }

  /**
   * Automatically fills any newly expanded map territory beyond the manual 400m core
   * (e.g., when world-expansion expands halfSize to 1000m or more) so you never have to place
   * outer-territory cubes manually when expanding the map.
   */
  compileExpandedTerritoryCubes() {
    if (this.halfSize <= 420) return;
    const maxRadius = Math.min(this.halfSize - 80, 920);
    for (let r = 440; r <= maxRadius; r += 160) {
      const carCount = Math.max(12, Math.round((2 * Math.PI * r) / 150));
      for (let i = 0; i < carCount; i += 1) {
        const ang = (i / carCount) * Math.PI * 2;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        if (this.pointInsideAnyBuilding(x, z, 14) || this.hasNearbyCarNode(x, z, 40)) continue;
        this.addCarNode({
          x,
          z,
          kind: i % 2 === 0 ? "intersection" : "highway",
          targetSpeed: 26,
          zone: `expanded-ring-${r}`,
          manual: false,
        });
        this.stats.autoCompiledExpansionCubes += 1;
      }

      const pedCount = Math.max(16, Math.round((2 * Math.PI * r) / 115));
      for (let i = 0; i < pedCount; i += 1) {
        const ang = (i / pedCount) * Math.PI * 2 + 0.08;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        if (this.pointInsideAnyBuilding(x, z, 4) || this.hasNearbyPedNode(x, 0, z, 24)) continue;
        this.addPedNode({
          x,
          y: 0,
          z,
          kind: i % 3 === 0 ? "cover" : i % 2 === 0 ? "flank" : "roam",
          zone: `expanded-ring-${r}`,
          manual: false,
        });
        this.stats.autoCompiledExpansionCubes += 1;
      }
    }
  }

  canConnectPedNodes(a, b) {
    const d = dist2(a, b);
    if (d > 75) return false;
    const aIndoor = a.kind === "interior" || a.kind === "stair";
    const bIndoor = b.kind === "interior" || b.kind === "stair";
    const aDoor = a.kind === "doorway";
    const bDoor = b.kind === "doorway";

    // Interior and doorway connections within the same building
    if (a.buildingId && a.buildingId === b.buildingId) {
      if (aDoor && bDoor && d <= 8) return true;
      if ((aDoor && bIndoor) || (bDoor && aIndoor)) {
        return Math.abs((a.y || 0) - (b.y || 0)) <= 0.6 && d <= 16;
      }
      if (a.kind === "stair" && b.kind === "stair" && d <= 12) return true;
      if (aIndoor && bIndoor) {
        if (Math.abs((a.y || 0) - (b.y || 0)) <= 0.6 && d <= 18) return true;
        if ((a.kind === "stair" || b.kind === "stair") && d <= 14) return true;
        return false;
      }
    }

    // Never connect an indoor node directly through a wall to an outdoor non-door node
    if (aIndoor || bIndoor) return false;

    return !this.segmentHitsBuilding(a, b, 1.35);
  }

  reconnectAllNodes() {
    // Connect adjacent Car Nodes that do not intersect any building safety margin
    for (let i = 0; i < this.carNodes.length; i += 1) {
      const a = this.carNodes[i];
      const candidates = [];
      for (let j = 0; j < this.carNodes.length; j += 1) {
        if (i === j) continue;
        const b = this.carNodes[j];
        const d = dist2(a, b);
        if (d <= 190 && !this.segmentHitsBuilding(a, b, 9.5)) {
          candidates.push({ id: b.id, dist: d });
        }
      }
      candidates.sort((u, v) => u.dist - v.dist);
      a.neighbors = candidates.slice(0, 6).map((c) => c.id);
    }

    // Connect adjacent Ped Nodes (including doorway <-> interior <-> stair transitions)
    for (let i = 0; i < this.pedNodes.length; i += 1) {
      const a = this.pedNodes[i];
      const candidates = [];
      for (let j = 0; j < this.pedNodes.length; j += 1) {
        if (i === j) continue;
        const b = this.pedNodes[j];
        if (this.canConnectPedNodes(a, b)) {
          candidates.push({ id: b.id, dist: dist3(a, b) });
        }
      }
      candidates.sort((u, v) => u.dist - v.dist);
      a.neighbors = candidates.slice(0, 7).map((c) => c.id);
    }
  }

  buildGraphs() {
    this._syncedMapRef = this.map;
    this._syncedNavCount = Array.isArray(this.map?.navigationBuildings) ? this.map.navigationBuildings.length : 0;
    this._syncedHalfSize = this.halfSize;
    this.carNodes = [];
    this.pedNodes = [];
    this.carNodeById.clear();
    this.pedNodeById.clear();
    this.carSectors.clear();
    this.pedSectors.clear();
    this.rebuildBuildingBounds();

    // 1. Load all hand-placed Car Cubes from MANUAL_CAR_CUBES
    for (const cube of MANUAL_CAR_CUBES) {
      this.addCarNode({ ...cube, manual: true });
    }

    // 2. Load all hand-placed Ped Cubes from MANUAL_PED_CUBES
    for (const cube of MANUAL_PED_CUBES) {
      this.addPedNode({ ...cube, manual: true });
    }

    // 3. Smart Auto-Compiler for any new buildings in BATTLE_ROYALE_BUILDINGS, map.navigationBuildings, or customBlueprints
    for (const bp of [...BATTLE_ROYALE_BUILDINGS, ...this.customBlueprints]) {
      this.compileBlueprintCubesForBuilding(bp);
    }
    for (const nb of this.map?.navigationBuildings ?? []) {
      const b = nb?.bounds ?? nb;
      if (nb?.id && Number.isFinite(b?.minX)) {
        this.compileBlueprintCubesForBuilding({
          id: nb.id,
          x: (b.minX + b.maxX) * 0.5,
          z: (b.minZ + b.maxZ) * 0.5,
          width: b.maxX - b.minX,
          depth: b.maxZ - b.minZ,
          doors: nb.doors ?? [],
          floors: nb.floors ?? [{ id: "ground", y: 0 }],
          stairs: nb.stairs ?? [],
        });
      }
    }

    // 4. Smart Auto-Compiler for expanded map territory (when map expands beyond core 400m)
    this.compileExpandedTerritoryCubes();

    // 5. Connect the graph
    this.reconnectAllNodes();
  }

  nearestCarNode(pos, { kind = null, maxDist = Infinity } = {}) {
    const px = Number(pos?.x) || 0;
    const pz = Number(pos?.z) || 0;
    let best = null;
    let bestDistSq = maxDist === Infinity ? Infinity : maxDist * maxDist;
    for (let i = 0; i < this.carNodes.length; i += 1) {
      const node = this.carNodes[i];
      if (kind && node.kind !== kind) continue;
      const dx = px - node.x;
      const dz = pz - node.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = node;
      }
    }
    return best;
  }

  nearestPedNode(pos, { kind = null, maxDist = Infinity, excludeReservedByOther = null, now = Date.now() } = {}) {
    const px = Number(pos?.x) || 0;
    const pz = Number(pos?.z) || 0;
    let best = null;
    let bestDistSq = maxDist === Infinity ? Infinity : maxDist * maxDist;
    for (let i = 0; i < this.pedNodes.length; i += 1) {
      const node = this.pedNodes[i];
      if (kind && node.kind !== kind) continue;
      const dx = px - node.x;
      const dz = pz - node.z;
      const dSq = dx * dx + dz * dz;
      if (dSq >= bestDistSq) continue;
      if (excludeReservedByOther && this.isNodeReservedByOther(node.id, excludeReservedByOther, now)) continue;
      bestDistSq = dSq;
      best = node;
    }
    return best;
  }

  /**
   * Reserves a navigation cube for a specific bot so bots never clump onto the exact same point.
   */
  reserveNode(botId, nodeId, now = Date.now(), ttlMs = 2600) {
    if (!botId || !nodeId) return false;
    const prevNodeId = this.botReservedNode.get(botId);
    if (prevNodeId && prevNodeId !== nodeId) {
      const prevEntry = this.reservations.get(prevNodeId);
      if (prevEntry?.botId === botId) this.reservations.delete(prevNodeId);
    }
    this.reservations.set(nodeId, { botId, until: now + ttlMs });
    this.botReservedNode.set(botId, nodeId);
    return true;
  }

  isNodeReservedByOther(nodeId, botId, now = Date.now()) {
    const entry = this.reservations.get(nodeId);
    if (!entry) return false;
    if (now >= entry.until) {
      this.reservations.delete(nodeId);
      return false;
    }
    return entry.botId !== botId;
  }

  /**
   * Records a firing line or damage event into our custom Living Tactical Field
   * so bots know which cubes are currently hot/dangerous under enemy fire.
   */
  recordFireDanger(origin, target, intensity = 1.0, now = Date.now()) {
    if (!origin || !target) return;
    const dx = (Number(target.x) || 0) - (Number(origin.x) || 0);
    const dz = (Number(target.z) || 0) - (Number(origin.z) || 0);
    const len = Math.max(0.01, Math.hypot(dx, dz));
    this.dangerEvents.push({
      x: Number(target.x) || 0,
      z: Number(target.z) || 0,
      originX: Number(origin.x) || 0,
      originZ: Number(origin.z) || 0,
      dirX: dx / len,
      dirZ: dz / len,
      intensity: clamp(intensity, 0.2, 2.5),
      expiresAt: now + 3800,
    });
    if (this.dangerEvents.length > 64) {
      this.dangerEvents.splice(0, this.dangerEvents.length - 64);
    }
    this.stats.dangerUpdates += 1;
  }

  pruneDangerEvents(now = Date.now()) {
    const events = this.dangerEvents;
    let write = 0;
    for (let read = 0; read < events.length; read += 1) {
      const ev = events[read];
      if (now < ev.expiresAt) {
        if (write !== read) events[write] = ev;
        write += 1;
      }
    }
    if (write !== events.length) events.length = write;
  }

  dangerScoreAt(point, now = Date.now(), pruned = false) {
    const events = this.dangerEvents;
    if (events.length === 0) return 0;
    if (!pruned) this.pruneDangerEvents(now);
    const px = Number(point.x) || 0;
    const pz = Number(point.z) || 0;
    let score = 0;
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      const dx = px - ev.x;
      const dz = pz - ev.z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= 196) {
        score += ev.intensity * (1 - Math.sqrt(dSq) / 14);
      }
    }
    return score;
  }

  /**
   * Tracks and predicts an entity's movement (especially the live human player)
   * so squadmates and enemies anticipate where the player will be in 1.5 - 2.2 seconds.
   */
  updateEntityMotion(entityId, transform, now = Date.now()) {
    if (!entityId || !transform) return { vx: 0, vz: 0, speed: 0 };
    const x = Number(transform.x) || 0;
    const z = Number(transform.z) || 0;
    const angle = Number(transform.angle) || 0;
    const prev = this.motionTracker.get(entityId);
    let vx = 0;
    let vz = 0;
    if (prev && now > prev.at && now - prev.at <= 900) {
      const dt = (now - prev.at) / 1000;
      vx = clamp((x - prev.x) / dt, -28, 28);
      vz = clamp((z - prev.z) / dt, -28, 28);
      if (Number.isFinite(prev.vx)) {
        vx = prev.vx * 0.4 + vx * 0.6;
        vz = prev.vz * 0.4 + vz * 0.6;
      }
    }
    this.motionTracker.set(entityId, { x, z, vx, vz, angle, at: now });
    return { vx, vz, speed: Math.hypot(vx, vz) };
  }

  predictEntityPosition(entityId, transform, horizonSec = 1.6, now = Date.now()) {
    if (!transform) return { x: 0, y: 0, z: 0 };
    const motion = this.updateEntityMotion(entityId, transform, now);
    const lookahead = clamp(horizonSec, 0.2, 2.8);
    const predX = clamp((Number(transform.x) || 0) + motion.vx * lookahead, -this.halfSize + 15, this.halfSize - 15);
    const predZ = clamp((Number(transform.z) || 0) + motion.vz * lookahead, -this.halfSize + 15, this.halfSize - 15);
    if (this.pointInsideAnyBuilding(predX, predZ, 1.5)) {
      return { x: Number(transform.x) || 0, y: Number(transform.y) || 0, z: Number(transform.z) || 0 };
    }
    return {
      x: predX,
      y: Number(transform.y) || 0,
      z: predZ,
    };
  }

  /**
   * Checks whether a bot vehicle has a clean ramming corridor directly to the target (including the live player).
   * Unlike walls/buildings (which are forbidden), ramming an exposed enemy or the player on open ground is allowed!
   */
  canRamTarget(vehiclePos, targetPos, maxRamDistance = 95) {
    if (!vehiclePos || !targetPos) return false;
    const d = dist2(vehiclePos, targetPos);
    if (d < 4 || d > maxRamDistance) return false;
    if (this.pointInsideAnyBuilding(targetPos.x, targetPos.z, 3.5)) return false;
    if (this.segmentHitsBuilding(vehiclePos, targetPos, 5.5)) return false;
    this.stats.ramVectorsApproved += 1;
    return true;
  }

  /**
   * A* pathfinding over Car Nodes or Ped Nodes.
   */
  findGraphPath(startPos, goalPos, layer = "car", now = Date.now()) {
    const nodes = layer === "car" ? this.carNodes : this.pedNodes;
    const byId = layer === "car" ? this.carNodeById : this.pedNodeById;
    if (layer === "car") this.stats.carPathQueries += 1;
    else this.stats.pedPathQueries += 1;

    if (!nodes.length || !startPos || !goalPos) return [];
    const startNode = layer === "car"
      ? this.nearestCarNode(startPos)
      : this.nearestPedNode(startPos);
    const goalNode = layer === "car"
      ? this.nearestCarNode(goalPos)
      : this.nearestPedNode(goalPos);
    if (!startNode || !goalNode) return [];
    if (startNode.id === goalNode.id) return [goalNode];

    if (layer === "ped") this.pruneDangerEvents(now);
    const open = [startNode.id];
    const openSet = new Set([startNode.id]);
    const cameFrom = new Map();
    const gScore = new Map([[startNode.id, 0]]);
    const fScore = new Map([[startNode.id, dist2(startNode, goalNode)]]);
    let iterations = 0;

    while (open.length > 0 && iterations < 180) {
      iterations += 1;
      let bestIdx = 0;
      let bestF = fScore.get(open[0]) ?? Infinity;
      for (let i = 1; i < open.length; i += 1) {
        const f = fScore.get(open[i]) ?? Infinity;
        if (f < bestF) {
          bestF = f;
          bestIdx = i;
        }
      }
      const currentId = open[bestIdx];
      open.splice(bestIdx, 1);
      openSet.delete(currentId);
      if (currentId === goalNode.id) {
        const path = [];
        let curr = currentId;
        while (curr) {
          const n = byId.get(curr);
          if (n) path.push(n);
          curr = cameFrom.get(curr);
        }
        path.reverse();
        return path;
      }

      const current = byId.get(currentId);
      if (!current) continue;
      for (const neighborId of current.neighbors) {
        const neighbor = byId.get(neighborId);
        if (!neighbor) continue;
        const stepCost = dist2(current, neighbor)
          + (layer === "ped" ? this.dangerScoreAt(neighbor, now, true) * 14 : 0);
        const tentativeG = (gScore.get(currentId) ?? Infinity) + stepCost;
        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, currentId);
          gScore.set(neighborId, tentativeG);
          fScore.set(neighborId, tentativeG + dist2(neighbor, goalNode));
          if (!openSet.has(neighborId)) {
            open.push(neighborId);
            openSet.add(neighborId);
          }
        }
      }
    }
    return [startNode, goalNode];
  }

  /**
   * Builds a clean vehicle route using GTA-style Car Nodes so bot drivers never cut corners through walls.
   */
  findVehiclePath(startPos, goalPos, now = Date.now()) {
    if (!startPos || !goalPos) return [];
    if (!this.segmentHitsBuilding(startPos, goalPos, 11) && dist2(startPos, goalPos) <= 65) {
      const drop = this.nearestCarNode(goalPos, { kind: "dropoff", maxDist: 28 });
      return drop ? [drop] : [{ x: goalPos.x, y: 0, z: goalPos.z, kind: "direct", targetSpeed: 20 }];
    }
    const nodes = this.findGraphPath(startPos, goalPos, "car", now);
    return nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: 0,
      z: n.z,
      kind: n.kind,
      targetSpeed: n.targetSpeed,
    }));
  }

  /**
   * Selects the best tactical Ped Node for a bot in combat, directly driven by the 20-parameter
   * TacticalCombatNet action (press_aggressive, flank_wide, hold_precision, kite_space, tactical_reset, squad_focus_push).
   */
  selectCombatNodeForTactic(botId, botPos, targetEntityId, targetPos, neuralAction, {
    desiredRange = 14,
    now = Date.now(),
  } = {}) {
    if (!botPos || !targetPos) return null;
    this.stats.tacticalNodeSelections += 1;

    const predictedTarget = targetEntityId
      ? this.predictEntityPosition(targetEntityId, targetPos, 1.35, now)
      : targetPos;
    const targetToBotAngle = Math.atan2(
      (Number(botPos.x) || 0) - (Number(predictedTarget.x) || 0),
      (Number(botPos.z) || 0) - (Number(predictedTarget.z) || 0),
    );
    const botSeed = Number.parseInt(String(botId).replace(/\D/g, ""), 10) || 1;
    const flankSign = botSeed % 2 === 0 ? 1 : -1;

    let preferredRadius = clamp(desiredRange, 6, 42);
    let preferredAngle = targetToBotAngle;
    let wantCover = false;

    if (neuralAction === "press_aggressive") {
      preferredRadius = clamp(desiredRange * 0.78, 6.5, 16);
      preferredAngle = targetToBotAngle + flankSign * 0.25;
    } else if (neuralAction === "squad_focus_push") {
      preferredRadius = clamp(desiredRange * 0.85, 7.5, 19);
      preferredAngle = targetToBotAngle + flankSign * 0.52;
    } else if (neuralAction === "flank_wide") {
      preferredRadius = clamp(desiredRange, 11, 28);
      preferredAngle = targetToBotAngle + flankSign * 1.15;
    } else if (neuralAction === "hold_precision") {
      preferredRadius = clamp(desiredRange, 18, 44);
      wantCover = true;
    } else if (neuralAction === "kite_space" || neuralAction === "tactical_reset") {
      preferredRadius = clamp(Math.max(desiredRange + 8, 20), 18, 46);
      wantCover = true;
    }

    const idealPoint = {
      x: (Number(predictedTarget.x) || 0) + Math.cos(preferredAngle) * preferredRadius,
      z: (Number(predictedTarget.z) || 0) + Math.sin(preferredAngle) * preferredRadius,
    };

    let bestNode = null;
    let bestScore = -Infinity;
    this.pruneDangerEvents(now);
    const tx = Number(predictedTarget.x) || 0;
    const tz = Number(predictedTarget.z) || 0;
    const bx = Number(botPos.x) || 0;
    const bz = Number(botPos.z) || 0;

    for (let i = 0; i < this.pedNodes.length; i += 1) {
      const node = this.pedNodes[i];
      const tdx = node.x - tx;
      const tdz = node.z - tz;
      const distFromTargetSq = tdx * tdx + tdz * tdz;
      if (distFromTargetSq < 20.25 || distFromTargetSq > 5184) continue;
      const bdx = node.x - bx;
      const bdz = node.z - bz;
      const distFromBotSq = bdx * bdx + bdz * bdz;
      if (distFromBotSq > 3025) continue;
      if (this.isNodeReservedByOther(node.id, botId, now)) continue;

      const distFromBot = Math.sqrt(distFromBotSq);
      const distToIdeal = dist2(node, idealPoint);
      const danger = this.dangerScoreAt(node, now, true);
      let score = -distToIdeal * 1.35 - distFromBot * 0.35 - danger * 18;

      if (wantCover && (node.kind === "cover" || node.kind === "doorway")) {
        score += 9.5;
      } else if (neuralAction === "flank_wide" && node.kind === "flank") {
        score += 7.5;
      }
      if (this.segmentHitsBuilding(botPos, node, 1.4)) {
        score -= 16;
      }

      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    if (bestNode) {
      this.reserveNode(botId, bestNode.id, now, 2400);
      return {
        ...bestNode,
        tacticalAction: neuralAction,
        predictedTarget,
      };
    }
    return null;
  }

  /**
   * Selects a smart wingman/escort Ped Node for human squadmates so they:
   * - Never stand in front of the player's line of sight or clump onto one coordinate
   * - Take left/right wingman cover cubes around the player's predicted movement
   * - Use doorway/perimeter cubes to exit or enter buildings cleanly without getting stuck on walls
   */
  selectSquadmateEscortNode(botId, botPos, humanId, humanTransform, {
    squadSlot = 1,
    underFire = false,
    now = Date.now(),
  } = {}) {
    if (!botPos || !humanTransform) return null;
    this.stats.squadmateEscortSelections += 1;

    const predictedHuman = this.predictEntityPosition(humanId, humanTransform, 1.25, now);
    const humanAngle = Number(humanTransform.angle) || 0;
    const forwardX = Math.sin(humanAngle);
    const forwardZ = -Math.cos(humanAngle);
    const rightX = Math.cos(humanAngle);
    const rightZ = Math.sin(humanAngle);

    // Slot 1 flanks left (-1), Slot 2 flanks right (+1), Slot 3 covers rear-side
    const sideSign = squadSlot % 2 === 0 ? 1 : -1;
    const lateralOffset = (squadSlot >= 3 ? 3.8 : 5.4) * sideSign;
    const longitudinalOffset = underFire ? -1.5 : -2.8;

    const desiredEscortPoint = {
      x: (Number(predictedHuman.x) || 0) + rightX * lateralOffset + forwardX * longitudinalOffset,
      y: Number(humanTransform.y) || 0,
      z: (Number(predictedHuman.z) || 0) + rightZ * lateralOffset + forwardZ * longitudinalOffset,
    };

    // If a wall blocks the squadmate from the human player, follow the Ped Node A* path around the building
    if (this.segmentHitsBuilding(botPos, humanTransform, 1.2)) {
      const path = this.findGraphPath(botPos, desiredEscortPoint, "ped", now);
      const stepNode = path[1] ?? path[0] ?? null;
      if (stepNode) {
        this.reserveNode(botId, stepNode.id, now, 1800);
        return {
          ...stepNode,
          wingmanRole: "building-bypass",
        };
      }
    }

    // Find best nearby unreserved Ped Node or snap to tactical wingman offset
    let bestNode = null;
    let bestScore = -Infinity;
    this.pruneDangerEvents(now);
    const hx = Number(predictedHuman.x) || 0;
    const hz = Number(predictedHuman.z) || 0;
    for (let i = 0; i < this.pedNodes.length; i += 1) {
      const node = this.pedNodes[i];
      const ddx = node.x - desiredEscortPoint.x;
      const ddz = node.z - desiredEscortPoint.z;
      const dToDesiredSq = ddx * ddx + ddz * ddz;
      if (dToDesiredSq > 256) continue;
      const hdx = node.x - hx;
      const hdz = node.z - hz;
      const dToHumanSq = hdx * hdx + hdz * hdz;
      if (dToHumanSq < 7.84 || dToHumanSq > 324) continue;
      if (this.isNodeReservedByOther(node.id, botId, now)) continue;

      const dToDesired = Math.sqrt(dToDesiredSq);
      const danger = this.dangerScoreAt(node, now, true);
      let score = -dToDesired * 1.6 - danger * 16;
      if (underFire && node.kind === "cover") score += 7.5;
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    if (bestNode) {
      this.reserveNode(botId, bestNode.id, now, 2000);
      return {
        ...bestNode,
        wingmanRole: underFire ? "wingman-cover" : "wingman-escort",
      };
    }

    return {
      id: `wingman-dynamic-${botId}`,
      layer: "ped",
      x: desiredEscortPoint.x,
      y: desiredEscortPoint.y,
      z: desiredEscortPoint.z,
      kind: underFire ? "cover" : "escort",
      wingmanRole: "wingman-formation",
    };
  }

  summary() {
    return {
      carNodesCount: this.carNodes.length,
      pedNodesCount: this.pedNodes.length,
      sectorsCount: this.sectorCols * this.sectorRows,
      activeReservations: this.reservations.size,
      activeDangerZones: this.dangerEvents.length,
      trackedEntities: this.motionTracker.size,
      stats: { ...this.stats },
    };
  }
}

let sharedTacticalNodeGrid = null;

export function getSharedTacticalNodeGrid(map = null) {
  if (!sharedTacticalNodeGrid) {
    sharedTacticalNodeGrid = new TacticalNodeGrid(map);
  } else if (map && sharedTacticalNodeGrid.map !== map) {
    sharedTacticalNodeGrid.map = map;
    sharedTacticalNodeGrid.ensureSynced();
  } else {
    sharedTacticalNodeGrid.ensureSynced();
  }
  return sharedTacticalNodeGrid;
}
