export const manifest = {
  id: "battle-royale-ragdoll-stability",
  version: "1.3.0",
  requires: ["rapier-physics"],
  capabilities: ["services.consume", "services.provide", "events.emit"],
};

const FIRST_RAGDOLL_GROUP = 1;
const LAST_RAGDOLL_GROUP = 15;
const MAX_RAGDOLL_PART_MASS = 12;
const EXPECTED_RAGDOLL_BODIES = 16;

// Preserve violent, funny ragdoll launches while preventing solver explosions
// from turning a person into a spacecraft. The centre-of-mass limits are high
// enough for a dramatic throw, while relative limits stop limbs from feeding
// unbounded energy back through joints and self-collision.
const MAX_COM_SPEED = 70;
const MAX_COM_UPWARD_SPEED = 30;
const MAX_RELATIVE_PART_SPEED = 42;
const MAX_PART_SPEED = 85;
const MAX_PART_UPWARD_SPEED = 45;
const MAX_PART_ANGULAR_SPEED = 45;

function finite(value) {
  return Number.isFinite(Number(value));
}

function magnitude(v) {
  return Math.hypot(Number(v?.x) || 0, Number(v?.y) || 0, Number(v?.z) || 0);
}

function scaleToMagnitude(v, maximum) {
  const speed = magnitude(v);
  if (!(speed > maximum) || speed <= 0) return { ...v };
  const scale = maximum / speed;
  return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
}

function packedCollisionGroups(groupId, selfCollisionEnabled = false) {
  const membership = (1 << groupId) & 0xffff;
  const filter = selfCollisionEnabled ? 0xffff : (0xffff ^ membership) & 0xffff;
  return (((membership << 16) | filter) >>> 0);
}

export async function setup(ctx) {
  const physics = ctx.services.get("physics");
  const world = physics.world;
  const bodyToGroup = new Map();
  const groups = new Map();
  const freeGroups = [];
  for (let id = FIRST_RAGDOLL_GROUP; id <= LAST_RAGDOLL_GROUP; id += 1) freeGroups.push(id);

  let sequence = 0;
  let latestGroupId = null;
  // Realism mode: non-adjacent parts of the same ragdoll may physically contact.
  // Connected parts still rely on the ragdoll joint descriptors to suppress
  // contacts where the joint itself would otherwise fight the solver.
  let selfCollisionEnabled = true;
  const history = [];

  function allocateGroup() {
    const id = freeGroups.shift();
    if (id == null) throw new Error("No collision group available for ragdoll");
    const group = {
      id,
      sequence: ++sequence,
      mask: packedCollisionGroups(id, selfCollisionEnabled),
      bodies: new Map(),
      peakSpread: 0,
      peakSpeed: 0,
      peakRawSpeed: 0,
      peakRawUpwardSpeed: 0,
      energyClamps: 0,
      nonFinite: false,
    };
    groups.set(id, group);
    latestGroupId = id;
    return group;
  }

  function bodyHandle(body) {
    return Number(body?.handle);
  }

  function validRagdollBody(body) {
    if (!body || typeof body.mass !== "function" || typeof body.numColliders !== "function") return false;
    const mass = Number(body.mass());
    return finite(mass) && mass > 0 && mass <= MAX_RAGDOLL_PART_MASS && body.numColliders() === 1;
  }

  function applyGroupToBody(body, group) {
    const handle = bodyHandle(body);
    if (!finite(handle)) return false;
    bodyToGroup.set(handle, group.id);
    group.bodies.set(handle, body);
    for (let i = 0; i < body.numColliders(); i += 1) {
      body.collider(i)?.setCollisionGroups(group.mask);
    }
    return true;
  }

  function refreshGroupMask(group) {
    group.mask = packedCollisionGroups(group.id, selfCollisionEnabled);
    for (const body of group.bodies.values()) {
      for (let i = 0; i < body.numColliders(); i += 1) {
        body.collider(i)?.setCollisionGroups(group.mask);
      }
    }
  }

  function setSelfCollisionEnabled(enabled) {
    const next = Boolean(enabled);
    if (selfCollisionEnabled === next) return false;
    selfCollisionEnabled = next;
    for (const group of groups.values()) refreshGroupMask(group);
    ctx.events.emit("ragdoll:self-collision-changed", { enabled: selfCollisionEnabled });
    return true;
  }

  function mergeGroups(target, source) {
    if (!target || !source || target.id === source.id) return target;
    for (const body of source.bodies.values()) applyGroupToBody(body, target);
    target.peakSpread = Math.max(target.peakSpread, source.peakSpread);
    target.peakSpeed = Math.max(target.peakSpeed, source.peakSpeed);
    target.peakRawSpeed = Math.max(target.peakRawSpeed, source.peakRawSpeed);
    target.peakRawUpwardSpeed = Math.max(target.peakRawUpwardSpeed, source.peakRawUpwardSpeed);
    target.energyClamps += source.energyClamps;
    target.nonFinite ||= source.nonFinite;
    source.bodies.clear();
    groups.delete(source.id);
    freeGroups.push(source.id);
    freeGroups.sort((a, b) => a - b);
    return target;
  }

  function groupForBody(body) {
    return groups.get(bodyToGroup.get(bodyHandle(body))) ?? null;
  }

  function connectBodies(body1, body2) {
    if (!validRagdollBody(body1) || !validRagdollBody(body2)) return;
    let group1 = groupForBody(body1);
    let group2 = groupForBody(body2);
    if (!group1 && !group2) {
      group1 = allocateGroup();
      applyGroupToBody(body1, group1);
      applyGroupToBody(body2, group1);
      return;
    }
    if (group1 && !group2) {
      applyGroupToBody(body2, group1);
      latestGroupId = group1.id;
      return;
    }
    if (!group1 && group2) {
      applyGroupToBody(body1, group2);
      latestGroupId = group2.id;
      return;
    }
    if (group1.id !== group2.id) group1 = mergeGroups(group1, group2);
    latestGroupId = group1.id;
  }

  function limitGroupEnergy(group) {
    const bodies = [...group.bodies.values()].filter(body => body?.isValid?.() !== false);
    if (!bodies.length) return;

    let totalMass = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    const samples = [];

    for (const body of bodies) {
      const mass = Number(body.mass()) || 0;
      const velocity = body.linvel();
      const angular = body.angvel();
      if (!(mass > 0) || ![velocity.x, velocity.y, velocity.z, angular.x, angular.y, angular.z].every(finite)) {
        group.nonFinite = true;
        continue;
      }
      const speed = magnitude(velocity);
      group.peakRawSpeed = Math.max(group.peakRawSpeed, speed);
      group.peakRawUpwardSpeed = Math.max(group.peakRawUpwardSpeed, Number(velocity.y) || 0);
      totalMass += mass;
      vx += velocity.x * mass;
      vy += velocity.y * mass;
      vz += velocity.z * mass;
      samples.push({ body, mass, velocity: { x: velocity.x, y: velocity.y, z: velocity.z }, angular });
    }

    if (!(totalMass > 0) || !samples.length) return;

    const rawCom = { x: vx / totalMass, y: vy / totalMass, z: vz / totalMass };
    let limitedCom = scaleToMagnitude(rawCom, MAX_COM_SPEED);
    if (limitedCom.y > MAX_COM_UPWARD_SPEED) limitedCom.y = MAX_COM_UPWARD_SPEED;

    let changed = false;
    for (const sample of samples) {
      const relative = {
        x: sample.velocity.x - rawCom.x,
        y: sample.velocity.y - rawCom.y,
        z: sample.velocity.z - rawCom.z,
      };
      const limitedRelative = scaleToMagnitude(relative, MAX_RELATIVE_PART_SPEED);
      let nextVelocity = {
        x: limitedCom.x + limitedRelative.x,
        y: limitedCom.y + limitedRelative.y,
        z: limitedCom.z + limitedRelative.z,
      };
      nextVelocity = scaleToMagnitude(nextVelocity, MAX_PART_SPEED);
      if (nextVelocity.y > MAX_PART_UPWARD_SPEED) nextVelocity.y = MAX_PART_UPWARD_SPEED;

      const velocityChanged = Math.abs(nextVelocity.x - sample.velocity.x) > 1e-6
        || Math.abs(nextVelocity.y - sample.velocity.y) > 1e-6
        || Math.abs(nextVelocity.z - sample.velocity.z) > 1e-6;
      if (velocityChanged) {
        sample.body.setLinvel(nextVelocity, true);
        changed = true;
      }

      const angularSpeed = magnitude(sample.angular);
      if (angularSpeed > MAX_PART_ANGULAR_SPEED) {
        sample.body.setAngvel(scaleToMagnitude(sample.angular, MAX_PART_ANGULAR_SPEED), true);
        changed = true;
      }
    }

    if (changed) group.energyClamps += 1;
  }

  function limitAllEnergy() {
    for (const group of groups.values()) limitGroupEnergy(group);
  }

  function sampleGroup(group) {
    const bodies = [...group.bodies.values()].filter(body => body?.isValid?.() !== false);
    if (!bodies.length) return;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let count = 0;
    for (const body of bodies) {
      const p = body.translation();
      const v = body.linvel();
      if (![p.x, p.y, p.z, v.x, v.y, v.z].every(finite)) {
        group.nonFinite = true;
        continue;
      }
      cx += p.x;
      cy += p.y;
      cz += p.z;
      count += 1;
      group.peakSpeed = Math.max(group.peakSpeed, magnitude(v));
    }
    if (!count) return;
    cx /= count;
    cy /= count;
    cz /= count;
    for (const body of bodies) {
      const p = body.translation();
      if (![p.x, p.y, p.z].every(finite)) continue;
      group.peakSpread = Math.max(group.peakSpread, Math.hypot(p.x - cx, p.y - cy, p.z - cz));
    }
  }

  function sampleAll() {
    for (const group of groups.values()) sampleGroup(group);
  }

  function currentGroupSummary(group) {
    sampleGroup(group);
    const bodies = [...group.bodies.values()].filter(body => body?.isValid?.() !== false);
    let intraGroupContacts = 0;
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i].collider(0);
      if (!a) continue;
      for (let j = i + 1; j < bodies.length; j += 1) {
        const b = bodies[j].collider(0);
        if (!b) continue;
        world.contactPair(a, b, manifold => {
          if (manifold.numContacts() > 0 || manifold.numSolverContacts() > 0) intraGroupContacts += 1;
        });
      }
    }
    return {
      id: group.id,
      sequence: group.sequence,
      bodies: bodies.length,
      mask: group.mask,
      peakSpread: group.peakSpread,
      peakSpeed: group.peakSpeed,
      peakRawSpeed: group.peakRawSpeed,
      peakRawUpwardSpeed: group.peakRawUpwardSpeed,
      energyClamps: group.energyClamps,
      nonFinite: group.nonFinite,
      intraGroupContacts,
    };
  }

  const originalCreateImpulseJoint = world.createImpulseJoint.bind(world);
  world.createImpulseJoint = (descriptor, body1, body2, wakeUp) => {
    const joint = originalCreateImpulseJoint(descriptor, body1, body2, wakeUp);
    connectBodies(body1, body2);
    return joint;
  };

  const originalRemoveRigidBody = world.removeRigidBody.bind(world);
  world.removeRigidBody = (body) => {
    const handle = bodyHandle(body);
    const groupId = bodyToGroup.get(handle);
    if (groupId != null) {
      const group = groups.get(groupId);
      if (group) {
        sampleGroup(group);
        group.bodies.delete(handle);
        bodyToGroup.delete(handle);
        if (group.bodies.size === 0) {
          history.push({
            id: group.id,
            sequence: group.sequence,
            peakSpread: group.peakSpread,
            peakSpeed: group.peakSpeed,
            peakRawSpeed: group.peakRawSpeed,
            peakRawUpwardSpeed: group.peakRawUpwardSpeed,
            energyClamps: group.energyClamps,
            nonFinite: group.nonFinite,
          });
          groups.delete(group.id);
          freeGroups.push(group.id);
          freeGroups.sort((a, b) => a - b);
          if (latestGroupId === group.id) latestGroupId = null;
        }
      }
    }
    return originalRemoveRigidBody(body);
  };

  const originalPhysicsStep = physics.step.bind(physics);
  physics.step = (dt) => {
    const result = originalPhysicsStep(dt);
    limitAllEnergy();
    sampleAll();
    return result;
  };

  function latestCompleteGroup(expectedBodies = EXPECTED_RAGDOLL_BODIES) {
    const ordered = [...groups.values()].sort((a, b) => b.sequence - a.sequence);
    return ordered.find(group => group.bodies.size >= expectedBodies) ?? groups.get(latestGroupId) ?? null;
  }

  function applyVelocityDeltaToLatest(delta = {}, expectedBodies = EXPECTED_RAGDOLL_BODIES) {
    const group = latestCompleteGroup(expectedBodies);
    if (!group || group.bodies.size < expectedBodies) return false;
    const velocityDelta = {
      x: Number(delta.x) || 0,
      y: Number(delta.y) || 0,
      z: Number(delta.z) || 0,
    };
    for (const body of group.bodies.values()) {
      const mass = Number(body.mass()) || 0;
      body.applyImpulse({
        x: velocityDelta.x * mass,
        y: velocityDelta.y * mass,
        z: velocityDelta.z * mass,
      }, true);
    }
    sampleGroup(group);
    return true;
  }

  function resetDiagnostics() {
    history.length = 0;
    for (const group of groups.values()) {
      group.peakSpread = 0;
      group.peakSpeed = 0;
      group.peakRawSpeed = 0;
      group.peakRawUpwardSpeed = 0;
      group.energyClamps = 0;
      group.nonFinite = false;
    }
    return true;
  }

  function summary() {
    const active = [...groups.values()].map(currentGroupSummary);
    return {
      selfCollisionEnabled,
      energyLimits: {
        maxComSpeed: MAX_COM_SPEED,
        maxComUpwardSpeed: MAX_COM_UPWARD_SPEED,
        maxRelativePartSpeed: MAX_RELATIVE_PART_SPEED,
        maxPartSpeed: MAX_PART_SPEED,
        maxPartUpwardSpeed: MAX_PART_UPWARD_SPEED,
        maxPartAngularSpeed: MAX_PART_ANGULAR_SPEED,
      },
      activeGroups: active.length,
      groupedBodies: active.reduce((sum, group) => sum + group.bodies, 0),
      active,
      history: history.slice(-16),
    };
  }

  function assertStable(options = {}) {
    const maxSpread = Math.max(2, Number(options.maxSpread) || 8);
    const maxSpeed = Math.max(20, Number(options.maxSpeed) || 180);
    const snapshots = [...groups.values()].map(currentGroupSummary);
    const records = [
      ...history,
      ...snapshots,
    ];
    for (const record of records) {
      if (record.nonFinite) throw new Error(`Ragdoll group ${record.id} produced non-finite physics`);
      if (record.peakSpread > maxSpread) {
        throw new Error(`Ragdoll group ${record.id} spread ${record.peakSpread.toFixed(3)}m exceeds ${maxSpread}m`);
      }
      if (record.peakSpeed > maxSpeed) {
        throw new Error(`Ragdoll group ${record.id} speed ${record.peakSpeed.toFixed(3)}m/s exceeds ${maxSpeed}m/s`);
      }
      if (!selfCollisionEnabled && Number(record.intraGroupContacts) > 0) {
        throw new Error(`Ragdoll group ${record.id} still has ${record.intraGroupContacts} self contacts`);
      }
    }
    return {
      ok: true,
      groups: snapshots.length,
      records: records.length,
      maxSpread,
      maxSpeed,
      selfCollisionEnabled,
    };
  }

  ctx.services.provide("ragdoll-stability", {
    applyVelocityDeltaToLatest,
    resetDiagnostics,
    summary,
    assertStable,
    setSelfCollisionEnabled,
    isSelfCollisionEnabled() { return selfCollisionEnabled; },
  });
}
