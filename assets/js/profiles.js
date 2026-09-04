/**
 * profiles.js - Named saved design profiles + JSON backup / restore.
 *
 * Pure, DOM-free logic (unit tested in Node). The UI layer in main.js supplies
 * a small storage object ({read, write}) so this module never touches
 * localStorage directly and stays testable.
 *
 * A "profile" is a named snapshot of the app configuration. To keep the browser
 * localStorage quota healthy and to avoid leaking private uploads, profiles are
 * always stored WITHOUT image data (see stripImages). The active working
 * settings keep their images; only the saved snapshots drop them.
 *
 * A "backup" is a single JSON document bundling the current settings plus all
 * saved profiles, stamped with an app id and schema version so it can be
 * validated and migrated on import.
 */

import {
  APP_ID, SETTINGS_SCHEMA_VERSION, normalizeSettings, stripImages,
} from './settings.js';

/**
 * Bounded number of saved profiles. Chosen as a privacy-preserving,
 * quota-friendly default: enough for every realistic institutional preset
 * while keeping the whole store comfortably inside the ~5 MB localStorage
 * budget even alongside uploaded images in the active settings. When the limit
 * is reached, saving a NEW name is refused with a clear error; saving over an
 * EXISTING name always succeeds (it is an update, not a new entry).
 */
export const MAX_PROFILES = 20;

/** localStorage key for the profiles collection (separate from live settings). */
export const PROFILES_KEY = 'mishna-poster-profiles-v1';

export const MAX_PROFILE_NAME_LEN = 60;

/** Result codes returned by mutating operations (mapped to i18n by the UI). */
export const PROFILE_OK = 'ok';
export const PROFILE_ERR_EMPTY_NAME = 'profileErrEmptyName';
export const PROFILE_ERR_LIMIT = 'profileErrLimit';
export const PROFILE_ERR_NOT_FOUND = 'profileErrNotFound';
export const PROFILE_ERR_DUPLICATE = 'profileErrDuplicate';

function clone(v) {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

function now() { return Date.now(); }

function cleanName(name) {
  return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, MAX_PROFILE_NAME_LEN);
}

function makeId() {
  return `p_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalize an arbitrary parsed profiles collection into a safe array.
 * Each entry: { id, name, settings (normalized, image-free), createdAt, updatedAt }.
 */
export function normalizeProfiles(raw) {
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.profiles) ? raw.profiles : []);
  const out = [];
  const seenNames = new Set();
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const name = cleanName(p.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenNames.has(key)) continue; // de-dupe by name (case-insensitive)
    seenNames.add(key);
    out.push({
      id: typeof p.id === 'string' && p.id ? p.id : makeId(),
      name,
      settings: stripImages(normalizeSettings(p.settings)),
      createdAt: Number.isFinite(Number(p.createdAt)) ? Number(p.createdAt) : now(),
      updatedAt: Number.isFinite(Number(p.updatedAt)) ? Number(p.updatedAt) : now(),
    });
    if (out.length >= MAX_PROFILES) break;
  }
  return out;
}

/** Find a profile by case-insensitive name. */
export function findByName(profiles, name) {
  const key = cleanName(name).toLowerCase();
  return profiles.find((p) => p.name.toLowerCase() === key) || null;
}

/**
 * Save (create or overwrite) a profile. Returns { status, profiles, profile }.
 * Overwriting an existing name is always allowed; creating a NEW name when at
 * the limit is refused.
 */
export function saveProfile(profiles, name, settings) {
  const list = normalizeProfiles(profiles);
  const clean = cleanName(name);
  if (!clean) return { status: PROFILE_ERR_EMPTY_NAME, profiles: list };
  const existing = findByName(list, clean);
  const snapshot = stripImages(normalizeSettings(settings));
  if (existing) {
    existing.settings = snapshot;
    existing.name = clean;
    existing.updatedAt = now();
    return { status: PROFILE_OK, profiles: list, profile: existing };
  }
  if (list.length >= MAX_PROFILES) return { status: PROFILE_ERR_LIMIT, profiles: list };
  const profile = { id: makeId(), name: clean, settings: snapshot, createdAt: now(), updatedAt: now() };
  list.push(profile);
  return { status: PROFILE_OK, profiles: list, profile };
}

/** Return the normalized settings for a profile id (or null). */
export function loadProfile(profiles, id) {
  const list = normalizeProfiles(profiles);
  const p = list.find((x) => x.id === id);
  return p ? normalizeSettings(p.settings) : null;
}

/** Rename a profile. Refuses empty names and collisions with a different profile. */
export function renameProfile(profiles, id, newName) {
  const list = normalizeProfiles(profiles);
  const p = list.find((x) => x.id === id);
  if (!p) return { status: PROFILE_ERR_NOT_FOUND, profiles: list };
  const clean = cleanName(newName);
  if (!clean) return { status: PROFILE_ERR_EMPTY_NAME, profiles: list };
  const collision = list.find((x) => x.id !== id && x.name.toLowerCase() === clean.toLowerCase());
  if (collision) return { status: PROFILE_ERR_DUPLICATE, profiles: list };
  p.name = clean;
  p.updatedAt = now();
  return { status: PROFILE_OK, profiles: list, profile: p };
}

/** Delete a profile by id. */
export function deleteProfile(profiles, id) {
  const list = normalizeProfiles(profiles);
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return { status: PROFILE_ERR_NOT_FOUND, profiles: list };
  const [removed] = list.splice(idx, 1);
  return { status: PROFILE_OK, profiles: list, profile: removed };
}

/* ===========================================================================
 * Backup / restore
 * =========================================================================*/

/**
 * Build a plain, JSON-serializable backup document. Images are always stripped
 * from both the settings and the profiles so a shared backup file can never
 * carry a private uploaded letterhead or background.
 */
export function buildBackup(settings, profiles) {
  return {
    app: APP_ID,
    kind: 'backup',
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: stripImages(normalizeSettings(settings)),
    profiles: normalizeProfiles(profiles).map((p) => ({
      name: p.name,
      settings: p.settings, // already image-free & normalized
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };
}

/** Serialize a backup to a pretty JSON string. */
export function serializeBackup(settings, profiles) {
  return JSON.stringify(buildBackup(settings, profiles), null, 2);
}

/**
 * Validate and parse a backup. Accepts either a JSON string or a parsed object.
 * Returns { ok, settings, profiles, error, warnings }.
 *
 * Validation is deliberately lenient about *content* (every field is normalized
 * and repaired) but strict about *shape*: the top-level document must be a JSON
 * object identifying this app. Missing/obsolete fields are migrated silently
 * and reported in `warnings`.
 */
export function parseBackup(input) {
  let doc;
  try {
    doc = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return { ok: false, error: 'importErrParse' };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'importErrShape' };
  }
  if (doc.app && doc.app !== APP_ID) {
    return { ok: false, error: 'importErrApp' };
  }
  const warnings = [];
  if (!doc.app) warnings.push('importWarnNoApp');
  if (doc.schemaVersion == null) warnings.push('importWarnNoVersion');
  else if (Number(doc.schemaVersion) < SETTINGS_SCHEMA_VERSION) warnings.push('importWarnMigrated');

  // A backup with neither settings nor profiles is not a usable import.
  const hasSettings = doc.settings && typeof doc.settings === 'object';
  const hasProfiles = Array.isArray(doc.profiles) && doc.profiles.length > 0;
  if (!hasSettings && !hasProfiles) {
    return { ok: false, error: 'importErrEmpty' };
  }

  return {
    ok: true,
    settings: hasSettings ? normalizeSettings(doc.settings) : null,
    profiles: normalizeProfiles(doc.profiles),
    warnings,
  };
}

/**
 * Merge imported profiles into the existing collection without exceeding
 * MAX_PROFILES. Imported names that collide with existing ones overwrite them;
 * genuinely new names are added until the cap is reached. Returns
 * { profiles, added, updated, skipped }.
 */
export function mergeProfiles(existing, imported) {
  let list = normalizeProfiles(existing);
  let added = 0; let updated = 0; let skipped = 0;
  for (const inc of normalizeProfiles(imported)) {
    const dup = findByName(list, inc.name);
    if (dup) {
      dup.settings = inc.settings;
      dup.updatedAt = now();
      updated++;
      continue;
    }
    if (list.length >= MAX_PROFILES) { skipped++; continue; }
    list.push({ ...inc, id: makeId() });
    added++;
  }
  return { profiles: list, added, updated, skipped };
}

/* ===========================================================================
 * Storage adapter helpers (used by main.js; storage = {read(key), write(key,val)})
 * =========================================================================*/

export function readProfiles(storage) {
  try {
    const raw = storage.read(PROFILES_KEY);
    return normalizeProfiles(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function writeProfiles(storage, profiles) {
  try {
    storage.write(PROFILES_KEY, JSON.stringify(normalizeProfiles(profiles)));
    return true;
  } catch {
    return false; // quota or serialization failure - caller surfaces it
  }
}

export { clone as _clone };
