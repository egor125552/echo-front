export const manifest = {
  id: "social-profile-client",
  requires: ["cloudflare-session", "speech-settings", "keyboard-input"],
};

const DB_NAME = "echo-front-private-profile-v1";
const DB_VERSION = 1;
const KEY_STORE = "keys";
const DATA_STORE = "data";
const PROFILE_KEY = "profile-key";
const PROFILE_RECORD = "profile";
const MAX_NAME_LENGTH = 24;
const MAX_FRIENDS = 128;

function normalizeName(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

function normalizeFriends(value, selfId) {
  const friends = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const id = String(raw?.id ?? raw ?? "").trim();
    if (!id || id === selfId || id.length > 80 || seen.has(id)) continue;
    seen.add(id);
    friends.push({ id, name: normalizeName(raw?.name) || "Игрок" });
    if (friends.length >= MAX_FRIENDS) break;
  }
  return friends;
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
      if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open encrypted profile storage"));
  });
}

async function profileCryptoKey(db) {
  const read = db.transaction(KEY_STORE, "readonly");
  const existing = await requestValue(read.objectStore(KEY_STORE).get(PROFILE_KEY));
  if (existing) return existing;

  const created = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const write = db.transaction(KEY_STORE, "readwrite");
  write.objectStore(KEY_STORE).put(created, PROFILE_KEY);
  await transactionDone(write);
  return created;
}

async function readEncryptedProfile(selfId) {
  if (!globalThis.indexedDB || !crypto?.subtle) return null;
  const db = await openDatabase();
  try {
    const key = await profileCryptoKey(db);
    const tx = db.transaction(DATA_STORE, "readonly");
    const record = await requestValue(tx.objectStore(DATA_STORE).get(PROFILE_RECORD));
    if (!record?.iv || !record?.ciphertext) return null;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(record.iv) },
      key,
      new Uint8Array(record.ciphertext),
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain));
    const name = normalizeName(parsed?.name);
    if (!name) return null;
    return {
      version: 1,
      name,
      friends: normalizeFriends(parsed?.friends, selfId),
    };
  } finally {
    db.close();
  }
}

async function writeEncryptedProfile(profile) {
  if (!globalThis.indexedDB || !crypto?.subtle) return false;
  const db = await openDatabase();
  try {
    const key = await profileCryptoKey(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(profile));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const tx = db.transaction(DATA_STORE, "readwrite");
    tx.objectStore(DATA_STORE).put({
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext)),
      updatedAt: Date.now(),
    }, PROFILE_RECORD);
    await transactionDone(tx);
    return true;
  } finally {
    db.close();
  }
}

function createNameDialog() {
  const wrap = document.createElement("section");
  wrap.id = "player-name-dialog";
  wrap.hidden = true;
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-labelledby", "player-name-title");
  wrap.innerHTML = `
    <h2 id="player-name-title">Как вас зовут?</h2>
    <p>Имя будет слышно другим игрокам и будет использоваться в списке друзей.</p>
    <label for="player-name-input">Имя игрока</label>
    <input id="player-name-input" type="text" maxlength="24" autocomplete="nickname">
    <button id="player-name-save" type="button">Сохранить имя и играть</button>
    <p id="player-name-error" role="alert"></p>
  `;
  document.body.append(wrap);
  return {
    wrap,
    input: wrap.querySelector("#player-name-input"),
    save: wrap.querySelector("#player-name-save"),
    error: wrap.querySelector("#player-name-error"),
  };
}

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const speech = ctx.services.get("speech");
  const input = ctx.services.get("input");
  const dialog = createNameDialog();
  const originalSample = input.sample.bind(input);
  let profile = null;
  let loading = null;
  let prompting = null;

  function publicProfile() {
    if (!profile) return null;
    return {
      name: profile.name,
      friendIds: profile.friends.map((friend) => friend.id),
    };
  }

  input.sample = () => ({
    ...originalSample(),
    socialProfile: publicProfile(),
  });

  async function load() {
    if (profile) return profile;
    if (!loading) {
      loading = readEncryptedProfile(network.sessionId)
        .catch((error) => {
          console.warn("Encrypted player profile unavailable", error);
          return null;
        })
        .then((value) => {
          profile = value;
          return value;
        });
    }
    return loading;
  }

  async function save(next) {
    profile = {
      version: 1,
      name: normalizeName(next?.name) || profile?.name || "Игрок",
      friends: normalizeFriends(next?.friends, network.sessionId),
    };
    try {
      await writeEncryptedProfile(profile);
    } catch (error) {
      console.warn("Could not persist encrypted player profile", error);
    }
    ctx.events.emit("social:local-profile", { profile: structuredClone(profile) });
    if (network.connected) ctx.events.emit("input:changed", { reason: "social:profile" });
    return profile;
  }

  async function ensureProfile() {
    const existing = await load();
    if (existing?.name) return existing;
    if (prompting) return prompting;

    prompting = new Promise((resolve) => {
      dialog.wrap.hidden = false;
      dialog.error.textContent = "";
      dialog.input.value = "";
      requestAnimationFrame(() => dialog.input.focus());
      speech.say("Введите имя игрока. Оно сохранится на этом устройстве.", { interrupt: true });

      const commit = async () => {
        const name = normalizeName(dialog.input.value);
        if (!name) {
          dialog.error.textContent = "Введите имя.";
          speech.say("Введите имя.", { interrupt: true });
          dialog.input.focus();
          return;
        }
        dialog.save.disabled = true;
        const saved = await save({ name, friends: [] });
        dialog.wrap.hidden = true;
        dialog.save.disabled = false;
        prompting = null;
        resolve(saved);
      };

      dialog.save.onclick = () => void commit();
      dialog.input.onkeydown = (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void commit();
      };
    });
    return prompting;
  }

  async function addFriend(player) {
    await ensureProfile();
    const id = String(player?.id ?? "").trim();
    if (!id || id === network.sessionId) return false;
    if (profile.friends.some((friend) => friend.id === id)) return false;
    profile.friends.push({ id, name: normalizeName(player?.name) || "Игрок" });
    profile.friends = normalizeFriends(profile.friends, network.sessionId);
    await save(profile);
    return true;
  }

  async function removeFriend(playerId) {
    await ensureProfile();
    const before = profile.friends.length;
    profile.friends = profile.friends.filter((friend) => friend.id !== String(playerId));
    if (profile.friends.length === before) return false;
    await save(profile);
    return true;
  }

  function isFriend(playerId) {
    return Boolean(profile?.friends?.some((friend) => friend.id === String(playerId)));
  }

  const originalConnect = network.connect.bind(network);
  network.connect = (...args) => ensureProfile().then(() => originalConnect(...args));

  ctx.events.on("network:connected", () => {
    if (profile) ctx.events.emit("input:changed", { reason: "social:connected" });
  });

  ctx.services.provide("social-profile", {
    ensureProfile,
    addFriend,
    removeFriend,
    isFriend,
    get profile() { return profile ? structuredClone(profile) : null; },
    get name() { return profile?.name ?? null; },
    get friends() { return profile?.friends ? structuredClone(profile.friends) : []; },
  });

  void load();
}
