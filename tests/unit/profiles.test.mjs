import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PROFILES, PROFILE_OK, PROFILE_ERR_EMPTY_NAME, PROFILE_ERR_LIMIT,
  PROFILE_ERR_NOT_FOUND, PROFILE_ERR_DUPLICATE,
  normalizeProfiles, saveProfile, loadProfile, renameProfile, deleteProfile,
  findByName, buildBackup, serializeBackup, parseBackup, mergeProfiles,
} from '../../assets/js/profiles.js';
import { makeDefaults, APP_ID, SETTINGS_SCHEMA_VERSION } from '../../assets/js/settings.js';

function baseSettings(overrides = {}) {
  const s = makeDefaults();
  return { ...s, ...overrides };
}

/* ---------------------------------------------------------------- CRUD */

test('saveProfile creates a new, image-free, normalized profile', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA';
  const settings = baseSettings();
  settings.design = { ...settings.design, logoDataUrl: png, template: 'night' };
  const res = saveProfile([], 'Main Shul', settings);
  assert.equal(res.status, PROFILE_OK);
  assert.equal(res.profiles.length, 1);
  assert.equal(res.profile.name, 'Main Shul');
  assert.equal(res.profile.settings.design.template, 'night');
  assert.equal(res.profile.settings.design.logoDataUrl, null, 'images must never be stored in profiles');
});

test('saveProfile rejects empty / whitespace names', () => {
  assert.equal(saveProfile([], '', baseSettings()).status, PROFILE_ERR_EMPTY_NAME);
  assert.equal(saveProfile([], '   ', baseSettings()).status, PROFILE_ERR_EMPTY_NAME);
});

test('saveProfile overwrites an existing same-name profile (case-insensitive)', () => {
  let list = saveProfile([], 'Shul', baseSettings({ count: 7 })).profiles;
  const res = saveProfile(list, 'shul', baseSettings({ count: 15 }));
  assert.equal(res.status, PROFILE_OK);
  assert.equal(res.profiles.length, 1, 'overwrite, not add');
  assert.equal(res.profiles[0].settings.count, 15);
});

test('profile limit: new names refused at MAX, overwrite still allowed', () => {
  let list = [];
  for (let i = 0; i < MAX_PROFILES; i++) list = saveProfile(list, `P${i}`, baseSettings()).profiles;
  assert.equal(list.length, MAX_PROFILES);
  const over = saveProfile(list, 'OneMore', baseSettings());
  assert.equal(over.status, PROFILE_ERR_LIMIT);
  assert.equal(over.profiles.length, MAX_PROFILES);
  // overwriting an existing name at the limit is fine
  const ow = saveProfile(list, 'P0', baseSettings({ count: 3 }));
  assert.equal(ow.status, PROFILE_OK);
  assert.equal(ow.profiles.length, MAX_PROFILES);
});

test('loadProfile returns normalized settings by id, or null', () => {
  const res = saveProfile([], 'X', baseSettings({ count: 9 }));
  const id = res.profile.id;
  const loaded = loadProfile(res.profiles, id);
  assert.equal(loaded.count, 9);
  assert.equal(loadProfile(res.profiles, 'nope'), null);
});

test('renameProfile: success, empty-name and duplicate handling', () => {
  let list = saveProfile([], 'A', baseSettings()).profiles;
  list = saveProfile(list, 'B', baseSettings()).profiles;
  const idA = list[0].id;
  assert.equal(renameProfile(list, idA, '').status, PROFILE_ERR_EMPTY_NAME);
  assert.equal(renameProfile(list, idA, 'B').status, PROFILE_ERR_DUPLICATE);
  assert.equal(renameProfile(list, 'ghost', 'C').status, PROFILE_ERR_NOT_FOUND);
  const ok = renameProfile(list, idA, 'Renamed');
  assert.equal(ok.status, PROFILE_OK);
  assert.equal(findByName(ok.profiles, 'Renamed').id, idA);
});

test('deleteProfile removes by id', () => {
  let list = saveProfile([], 'A', baseSettings()).profiles;
  const id = list[0].id;
  const res = deleteProfile(list, id);
  assert.equal(res.status, PROFILE_OK);
  assert.equal(res.profiles.length, 0);
  assert.equal(deleteProfile(list, 'ghost').status, PROFILE_ERR_NOT_FOUND);
});

/* ------------------------------------------------- normalizeProfiles */

test('normalizeProfiles repairs a hostile / malformed collection', () => {
  const list = normalizeProfiles([
    null,
    { name: '', settings: {} },
    { name: 'Good', settings: { count: 5 } },
    { name: 'Good', settings: { count: 6 } }, // duplicate name -> dropped
    'garbage',
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Good');
  assert.equal(list[0].settings.count, 5);
  assert.ok(list[0].id && list[0].createdAt && list[0].updatedAt);
});

test('normalizeProfiles caps the collection at MAX_PROFILES', () => {
  const raw = Array.from({ length: MAX_PROFILES + 10 }, (_, i) => ({ name: `P${i}`, settings: {} }));
  assert.equal(normalizeProfiles(raw).length, MAX_PROFILES);
});

/* ---------------------------------------------------------------- backup */

test('buildBackup produces a valid, image-free, identifiable document', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA';
  const settings = baseSettings();
  settings.design = { ...settings.design, bgDataUrl: png };
  const profiles = saveProfile([], 'P', baseSettings()).profiles;
  const doc = buildBackup(settings, profiles);
  assert.equal(doc.app, APP_ID);
  assert.equal(doc.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(doc.settings.design.bgDataUrl, null, 'export must strip images');
  assert.equal(doc.profiles.length, 1);
  assert.ok(doc.exportedAt);
});

test('serializeBackup + parseBackup round-trips settings and profiles', () => {
  let profiles = saveProfile([], 'Alpha', baseSettings({ count: 11 })).profiles;
  profiles = saveProfile(profiles, 'Beta', baseSettings({ count: 4 })).profiles;
  const json = serializeBackup(baseSettings({ count: 22 }), profiles);
  const parsed = parseBackup(json);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.settings.count, 22);
  assert.equal(parsed.profiles.length, 2);
  assert.deepEqual(parsed.profiles.map((p) => p.name).sort(), ['Alpha', 'Beta']);
});

test('parseBackup rejects invalid input with typed error codes', () => {
  assert.deepEqual(parseBackup('{not json').error, 'importErrParse');
  assert.deepEqual(parseBackup('[]').error, 'importErrShape');
  assert.deepEqual(parseBackup(JSON.stringify({ app: 'some-other-app', settings: {} })).error, 'importErrApp');
  assert.deepEqual(parseBackup(JSON.stringify({ app: 'mishna-poster-generator' })).error, 'importErrEmpty');
});

test('parseBackup migrates version-less / app-less documents with warnings', () => {
  const legacy = { settings: { count: 8, design: { font: 'heebo' } } }; // no app, no schemaVersion
  const parsed = parseBackup(legacy);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.settings.count, 8);
  assert.equal(parsed.settings.design.commentaryFont, 'heebo'); // migrated
  assert.ok(parsed.warnings.includes('importWarnNoApp'));
  assert.ok(parsed.warnings.includes('importWarnNoVersion'));
});

test('parseBackup flags an older schema version as migrated', () => {
  const old = { app: 'mishna-poster-generator', schemaVersion: 1, settings: { count: 3 } };
  const parsed = parseBackup(old);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.warnings.includes('importWarnMigrated'));
});

test('parseBackup neutralizes executable image payloads on import', () => {
  const doc = {
    app: 'mishna-poster-generator',
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    settings: { design: { logoDataUrl: 'javascript:alert(1)', bgDataUrl: 'data:text/html,<b>x</b>' } },
  };
  const parsed = parseBackup(doc);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.settings.design.logoDataUrl, null);
  assert.equal(parsed.settings.design.bgDataUrl, null);
});

/* ---------------------------------------------------------------- merge */

test('mergeProfiles adds new, updates duplicates, and respects the cap', () => {
  let existing = saveProfile([], 'Shared', baseSettings({ count: 1 })).profiles;
  const imported = [
    { name: 'Shared', settings: makeDefaults() }, // update
    { name: 'Fresh', settings: makeDefaults() },  // add
  ];
  const res = mergeProfiles(existing, imported);
  assert.equal(res.added, 1);
  assert.equal(res.updated, 1);
  assert.equal(res.skipped, 0);
  assert.equal(res.profiles.length, 2);

  // Cap enforcement: fill to MAX, then import extra new names -> skipped.
  let full = [];
  for (let i = 0; i < MAX_PROFILES; i++) full = saveProfile(full, `Q${i}`, baseSettings()).profiles;
  const extra = [{ name: 'ZZZ', settings: makeDefaults() }];
  const capped = mergeProfiles(full, extra);
  assert.equal(capped.added, 0);
  assert.equal(capped.skipped, 1);
  assert.equal(capped.profiles.length, MAX_PROFILES);
});
