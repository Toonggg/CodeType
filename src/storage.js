/**
 * Safe wrappers around localStorage (Q13, R2). Every call tolerates a missing or
 * throwing storage (private mode, blocked cookies, quota exceeded).
 */

function getStorage() {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readString(key, fallback = null) {
  try {
    const value = getStorage()?.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

/** Returns true when the value was stored. */
export function writeString(key, value) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  try {
    getStorage()?.removeItem(key);
  } catch {
    // Nothing to do: storage is unavailable.
  }
}

/** Parses a JSON value; a corrupt entry is removed and the fallback returned. */
export function readJSON(key, fallback = null) {
  const raw = readString(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    removeKey(key);
    return fallback;
  }
}

export function writeJSON(key, value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  return writeString(key, serialized);
}

/** Flags are stored as "on" / "off" for compatibility with earlier versions. */
export function readFlag(key, fallback = false) {
  const value = readString(key);
  return value === null ? fallback : value === "on";
}

export function writeFlag(key, enabled) {
  return writeString(key, enabled ? "on" : "off");
}
