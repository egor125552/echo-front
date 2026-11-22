// Lossless JSON snapshot patches. Game state and sound events never change here.
// Wire format: [0,value] replace; [1,changed,removed] object;
// [2,changed,removed,order?] id-keyed array; [3,indexChanges] positional array.
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const keyFor = array => {
  const len = array.length;
  if (!len) return null;
  for (let i = 0; i < len; i += 1) {
    if (!record(array[i])) return null;
  }
  for (const key of ["id", "vehicleId", "crateId"]) {
    let valid = true;
    const seen = new Set();
    for (let i = 0; i < len; i += 1) {
      const value = array[i][key];
      if (typeof value !== "string" || !value.length || seen.has(value)) {
        valid = false;
        break;
      }
      seen.add(value);
    }
    if (valid) return key;
  }
  return null;
};
const equalOrder = (first, second) => {
  const len = first.length;
  if (len !== second.length) return false;
  for (let i = 0; i < len; i += 1) {
    if (first[i] !== second[i]) return false;
  }
  return true;
};

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
      const old = new Map();
      for (let i = 0; i < before.length; i += 1) old.set(before[i][key], before[i]);
      const next = new Map();
      const changed = [];
      const requested = [];
      const addedIds = [];
      for (let i = 0; i < after.length; i += 1) {
        const item = after[i];
        const id = item[key];
        next.set(id, item);
        requested.push(id);
        const prevItem = old.get(id);
        if (prevItem !== undefined) {
          const change = diffSnapshotValue(prevItem, item, memo);
          if (change !== null) changed.push([id, change]);
        } else {
          changed.push([id, [0, item]]);
          addedIds.push(id);
        }
      }
      const removed = [];
      const natural = [];
      for (let i = 0; i < before.length; i += 1) {
        const id = before[i][key];
        if (next.has(id)) natural.push(id);
        else removed.push(id);
      }
      for (let i = 0; i < addedIds.length; i += 1) natural.push(addedIds[i]);
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
    let changedCount = 0;
    const afterKeys = Object.keys(after);
    for (let i = 0; i < afterKeys.length; i += 1) {
      const name = afterKeys[i];
      const nextVal = after[name];
      if (nextVal === undefined) continue; // JSON would omit this property.
      const prevVal = has(before, name) ? before[name] : undefined;
      if (Object.is(prevVal, nextVal)) continue;
      const patch = prevVal === undefined
        ? [0, nextVal]
        : diffSnapshotValue(prevVal, nextVal, memo);
      if (patch !== null) {
        changed[name] = patch;
        changedCount += 1;
      }
    }
    const beforeKeys = Object.keys(before);
    for (let i = 0; i < beforeKeys.length; i += 1) {
      const name = beforeKeys[i];
      if (before[name] !== undefined && (!has(after, name) || after[name] === undefined)) {
        removed.push(name);
      }
    }
    return remember(changedCount || removed.length ? [1, changed, removed] : null);
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
