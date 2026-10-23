// Lossless JSON snapshot patches. Game state and sound events never change here.
// Wire format: [0,value] replace; [1,changed,removed] object;
// [2,changed,removed,order?] id-keyed array; [3,indexChanges] positional array.
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const keyFor = array => {
  if (!array.length || !array.every(record)) return null;
  for (const key of ["id", "vehicleId", "crateId"]) {
    const ids = array.map(item => item[key]);
    if (ids.every(value => typeof value === "string" && value.length > 0)
      && new Set(ids).size === ids.length) return key;
  }
  return null;
};
const equalOrder = (first, second) => first.length === second.length
  && first.every((value, index) => value === second[index]);

export function diffSnapshotValue(before, after, memo = null) {
  if (Object.is(before, after)) return null;
  const keyedPair = memo && record(before) && record(after)
    && typeof after.id === "string" && after.id === before.id;
  if (keyedPair && memo.get(before)?.has(after)) return memo.get(before).get(after);
  const remember = patch => {
    if (keyedPair) {
      let entries = memo.get(before);
      if (!entries) { entries = new WeakMap(); memo.set(before, entries); }
      entries.set(after, patch);
    }
    return patch;
  };
  if (Array.isArray(before) && Array.isArray(after)) {
    const key = keyFor(before);
    if (key && key === keyFor(after)) {
      const old = new Map(before.map(item => [item[key], item]));
      const next = new Map(after.map(item => [item[key], item]));
      const changed = [];
      for (const item of after) {
        const id = item[key];
        const change = old.has(id) ? diffSnapshotValue(old.get(id), item, memo) : [0, item];
        if (change !== null) changed.push([id, change]);
      }
      const removed = before.filter(item => !next.has(item[key])).map(item => item[key]);
      const natural = before.filter(item => next.has(item[key])).map(item => item[key])
        .concat(after.filter(item => !old.has(item[key])).map(item => item[key]));
      const requested = after.map(item => item[key]);
      const order = equalOrder(natural, requested) ? null : requested;
      return changed.length || removed.length || order ? [2, changed, removed, order, key] : null;
    }
    if (before.length === after.length) {
      const changes = [];
      for (let index = 0; index < after.length; index++) {
        const patch = diffSnapshotValue(before[index], after[index], memo);
        if (patch !== null) changes.push([index, patch]);
      }
      return changes.length ? [3, changes] : null;
    }
    return [0, after];
  }
  if (record(before) && record(after)) {
    const changed = Object.create(null);
    const removed = [];
    // Entities and vehicles have mostly primitive fields. Replacing a
    // changed nested value wholesale is faster than recursively comparing
    // every nested property (and remains completely lossless).
    const shallow = (typeof after.id === "string" && after.id === before.id)
      || (typeof after.vehicleId === "string" && after.vehicleId === before.vehicleId);
    for (const name of Object.keys(after)) {
      if (after[name] === undefined) continue; // JSON would omit this property.
      let patch;
      if (!has(before, name) || before[name] === undefined) patch = [0, after[name]];
      else if (shallow && after[name] !== null && typeof after[name] === "object") {
        patch = JSON.stringify(before[name]) === JSON.stringify(after[name]) ? null : [0, after[name]];
      } else patch = diffSnapshotValue(before[name], after[name], memo);
      if (patch !== null) changed[name] = patch;
    }
    for (const name of Object.keys(before)) {
      if (before[name] !== undefined && (!has(after, name) || after[name] === undefined)) removed.push(name);
    }
    return remember(Object.keys(changed).length || removed.length ? [1, changed, removed] : null);
  }
  return [0, after];
}

export function applySnapshotPatch(before, patch) {
  if (patch === null) return before;
  const [kind, arg, removed, order, key] = patch;
  if (kind === 0) return arg;
  if (kind === 1) {
    const out = { ...before };
    for (const name of removed) delete out[name];
    for (const [name, subPatch] of Object.entries(arg)) {
      // Object spread gives "__proto__" ordinary own-property semantics.
      const value = applySnapshotPatch(has(before, name) ? before[name] : undefined, subPatch);
      Object.defineProperty(out, name, { value, enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  if (kind === 2) {
    const entries = new Map(before.map(item => [item[key], item]));
    for (const id of removed) entries.delete(id);
    for (const [id, subPatch] of arg) {
      entries.set(id, applySnapshotPatch(entries.get(id), subPatch));
    }
    if (order !== null) return order.map(id => entries.get(id));
    const oldOrder = before.filter(item => entries.has(item[key])).map(item => item[key]);
    const newOrder = arg.filter(([id]) => !before.some(item => item[key] === id)).map(([id]) => id);
    return oldOrder.concat(newOrder).map(id => entries.get(id));
  }
  if (kind === 3) {
    const out = before.slice();
    for (const [index, subPatch] of arg) out[index] = applySnapshotPatch(out[index], subPatch);
    return out;
  }
  throw new Error("Unknown snapshot patch version");
}

export function encodeSnapshotMessage(snapshot, previous, sequence = 0, previousFullSize = 0, memo = null) {
  const complete = () => ({
    message: JSON.stringify({ type: "snapshot", snapshot }),
    next: snapshot,
    sequence: 0,
    full: true,
    fullSize: 0,
  });
  if (!previous) return complete();
  const patch = diffSnapshotValue(previous, snapshot, memo);
  const packet = JSON.stringify({ type: "snapshot-delta", base: sequence, seq: sequence + 1, patch });
  // When the delta is much smaller than the last full frame, avoid
  // stringifying that entire frame a second time on every server tick.
  if (previousFullSize > 0 && packet.length < previousFullSize * 0.5) {
    return { message: packet, next: snapshot, sequence: sequence + 1, full: false, fullSize: previousFullSize };
  }
  const full = JSON.stringify({ type: "snapshot", snapshot });
  if (packet.length >= full.length) return { message: full, next: snapshot, sequence: 0, full: true, fullSize: full.length };
  return { message: packet, next: snapshot, sequence: sequence + 1, full: false, fullSize: full.length };
}

export function decodeSnapshotMessage(packet, previous, sequence = 0) {
  if (packet?.type === "snapshot") {
    return { snapshot: packet.snapshot, sequence: 0 };
  }
  if (packet?.type !== "snapshot-delta" || !previous
    || packet.base !== sequence || packet.seq !== sequence + 1) {
    throw new Error("Snapshot delta sequence mismatch");
  }
  return { snapshot: applySnapshotPatch(previous, packet.patch), sequence: packet.seq };
}
