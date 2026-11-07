import { BASE_PLOTS, CROPS, MODULES, OBJECTIVES, SAVE_VERSION, WORLD_VERSION } from './content.js';
import { baseCapacity, initialCareer, inventoryCapacity, inventoryUsed } from './model.js';
import { PLANET_PROFILES } from '../flight/planetProfiles.js';

const DB_NAME = 'dunes-career';
const STORE_NAME = 'records';
export const MAX_IMPORT_BYTES = 1_000_000;
const request = operation => new Promise((resolve, reject) => {
  operation.onsuccess = () => resolve(operation.result);
  operation.onerror = () => reject(operation.error);
});
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finiteNonnegative = value => Number.isFinite(value) && value >= 0;

export class FutureSaveError extends Error {}

export function validateSave(value) {
  if (!isRecord(value)) throw new Error('Save is not an object.');
  if (value.version > SAVE_VERSION) throw new FutureSaveError(`Save version ${value.version} is newer than this game.`);
  if (value.version !== SAVE_VERSION || value.worldVersion !== WORLD_VERSION) throw new Error('Unsupported save version.');
  if (typeof value.generation !== 'string' || !value.generation || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid save identity.');
  if (!isRecord(value.profile) || typeof value.profile.name !== 'string' || value.profile.name.length > 40) throw new Error('Invalid profile.');
  if (!isRecord(value.resources) || !['materials', 'research', 'food'].every(key => finiteNonnegative(value.resources[key]))) throw new Error('Invalid resources.');
  if (!Array.isArray(value.buildings) || value.buildings.length > BASE_PLOTS.length) throw new Error('Invalid buildings.');
  const occupied = new Set(), ids = new Set();
  for (const building of value.buildings) {
    if (!isRecord(building) || typeof building.id !== 'string' || !MODULES[building.type] ||
        !BASE_PLOTS.some(plot => plot.id === building.plotId && plot.x === building.x && plot.z === building.z) ||
        ![0, 1, 2, 3].includes(building.rotation) || typeof building.active !== 'boolean') throw new Error('Invalid building entry.');
    if (occupied.has(building.plotId) || ids.has(building.id)) throw new Error('Duplicate building or plot.');
    occupied.add(building.plotId); ids.add(building.id);
    if (building.crop !== null) {
      const cycle = building.crop;
      if (building.type !== 'greenhouse' || !isRecord(cycle) || typeof cycle.id !== 'string' || !CROPS[cycle.cropId] ||
          !finiteNonnegative(cycle.elapsedMs) || cycle.durationMs !== CROPS[cycle.cropId].durationMs ||
          cycle.elapsedMs > cycle.durationMs || !Number.isFinite(cycle.lastUpdateMs) || typeof cycle.ready !== 'boolean') throw new Error('Invalid crop cycle.');
    }
  }
  for (const key of ['discoveries', 'badges', 'harvestedCrops', 'eventKeys', 'actionKeys', 'history', 'pendingRewards']) {
    if (!Array.isArray(value[key]) || value[key].length > (key === 'eventKeys' || key === 'actionKeys' ? 5000 : 1000)) throw new Error(`Invalid ${key}.`);
  }
  for (const key of ['discoveries', 'badges', 'harvestedCrops', 'eventKeys', 'actionKeys']) {
    if (!value[key].every(item => typeof item === 'string' && item.length <= 160)) throw new Error(`Invalid ${key} entry.`);
  }
  const objectiveIds = new Set(OBJECTIVES.map(item => item.id));
  if (!value.pendingRewards.every(item => isRecord(item) && objectiveIds.has(item.id) && isRecord(item.reward) &&
      Object.values(item.reward).every(finiteNonnegative))) throw new Error('Invalid pending reward.');
  if (inventoryUsed(value) > inventoryCapacity(value)) throw new Error('Inventory exceeds capacity.');
  const capacity = baseCapacity(value);
  if (capacity.power < 0 || capacity.water < 0) throw new Error('Base allocation exceeds capacity.');
  if (!isRecord(value.objectives) || !isRecord(value.evidence) || !isRecord(value.settings) || !isRecord(value.mission) ||
      typeof value.mission.runId !== 'string') throw new Error('Invalid mission or objective state.');
  if (!Number.isSafeInteger(value.nextSerial) || value.nextSerial < 1) throw new Error('Invalid serial counter.');
  if (value.mission.checkpoint !== null) validateCheckpoint(value.mission.checkpoint);
  return value;
}

export function validateCheckpoint(checkpoint) {
  if (!isRecord(checkpoint) || checkpoint.worldVersion !== WORLD_VERSION || !['surface', 'orbit'].includes(checkpoint.frame) ||
      !['mars', 'earth', 'moon'].includes(checkpoint.planet) || !['ON_PAD', 'LANDED', 'ORBIT'].includes(checkpoint.phase) ||
      !PLANET_PROFILES[checkpoint.destination] || !isRecord(checkpoint.ship) ||
      !['x', 'y', 'z'].every(key => Number.isFinite(checkpoint.ship.position?.[key]) && Math.abs(checkpoint.ship.position[key]) < 1e9 && Number.isFinite(checkpoint.ship.velocity?.[key]) && Math.abs(checkpoint.ship.velocity[key]) < 1e6) ||
      !finiteNonnegative(checkpoint.ship.fuel) || checkpoint.ship.fuel > 100 ||
      !isRecord(checkpoint.rover) || !['x', 'y', 'z'].every(key => Number.isFinite(checkpoint.rover.position?.[key]) && Math.abs(checkpoint.rover.position[key]) < 1e9))
    throw new Error('Unsupported mission checkpoint.');
  return checkpoint;
}

export function migrateSave(value) {
  if (value?.version === SAVE_VERSION) return validateSave(value);
  if (value?.version > SAVE_VERSION) throw new FutureSaveError(`Save version ${value.version} is newer than this game.`);
  if (value?.version === 0 && isRecord(value.resources)) {
    const next = initialCareer();
    for (const key of ['materials', 'research', 'food']) {
      if (finiteNonnegative(value.resources[key])) next.resources[key] = value.resources[key];
    }
    if (Array.isArray(value.discoveries)) next.discoveries = value.discoveries.filter(item => typeof item === 'string').slice(0, 100);
    return validateSave(next);
  }
  throw new Error('Unrecognized save format.');
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE_NAME);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
}

export class CareerRepository {
  constructor(namespace = 'guest') {
    this.namespace = namespace;
    this.dbPromise = openDatabase().catch(error => { this.storageError = error; return null; });
    this.channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`dunes-career:${namespace}`) : null;
    this.memory = null;
    this.readOnly = false;
  }

  async load() {
    const db = await this.dbPromise;
    if (!db) {
      this.memory ||= initialCareer();
      return { state: structuredClone(this.memory), warning: 'Storage unavailable; progress will last only until this tab closes.' };
    }
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const [primary, backup] = await Promise.all([request(store.get(this.namespace)), request(store.get(`backup:${this.namespace}`))]);
    if (!primary) return { state: await this.replace(initialCareer()), warning: null };
    try { return { state: migrateSave(primary), warning: null }; }
    catch (error) {
      if (error instanceof FutureSaveError) { this.readOnly = true; return { state: null, warning: error.message }; }
      try { return { state: await this.replace(migrateSave(backup)), warning: 'Primary save was corrupt; restored the last-known-good backup.' }; }
      catch { this.readOnly = true; return { state: null, warning: 'Saved data is corrupt. Export or reset progress before playing.' }; }
    }
  }

  async transact(mutator) {
    if (this.readOnly) throw new Error('Save is read-only.');
    const db = await this.dbPromise;
    if (!db) {
      const current = this.memory || initialCareer();
      const result = mutator(structuredClone(current));
      if (result.changed) this.memory = validateSave(result.state);
      return result;
    }
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      let result;
      let failure;
      const reading = store.get(this.namespace);
      reading.onsuccess = () => {
        try {
          const current = reading.result ? migrateSave(reading.result) : initialCareer();
          result = mutator(structuredClone(current));
          if (result.changed) {
            validateSave(result.state);
            if (reading.result) store.put(current, `backup:${this.namespace}`);
            store.put(result.state, this.namespace);
            if (this.namespace.startsWith('account:')) store.put({ accountId: this.namespace.slice(8), generation: result.state.generation, revision: result.state.revision }, `sync:${this.namespace}`);
          }
        } catch (error) { failure = error; transaction.abort(); }
      };
      reading.onerror = () => { failure = reading.error; transaction.abort(); };
      transaction.oncomplete = () => { if (result?.changed) this.channel?.postMessage({ revision: result.state.revision, generation: result.state.generation }); resolve(result); };
      transaction.onabort = () => reject(failure || transaction.error || new Error('Save transaction aborted.'));
      transaction.onerror = () => reject(transaction.error || new Error('Save transaction failed.'));
    });
  }

  async replace(next) {
    if (this.readOnly) throw new Error('Save is read-only.');
    const fresh = structuredClone(validateSave(next));
    fresh.generation = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    fresh.revision = 0;
    fresh.mission.runId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-mission`;
    fresh.mission.provisionsRunId = null;
    const db = await this.dbPromise;
    if (!db) { this.memory = fresh; return fresh; }
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const reading = store.get(this.namespace);
      reading.onsuccess = () => {
        if (reading.result) store.put(reading.result, `backup:${this.namespace}`);
        store.put(fresh, this.namespace);
        if (this.namespace.startsWith('account:')) store.put({ accountId: this.namespace.slice(8), generation: fresh.generation, revision: fresh.revision }, `sync:${this.namespace}`);
      };
      transaction.oncomplete = () => { this.channel?.postMessage({ generation: fresh.generation, revision: 0 }); resolve(fresh); };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  exportJson(state) { return JSON.stringify(validateSave(structuredClone(state)), null, 2); }
  async importJson(text) {
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new Error('Import exceeds the 1 MB limit.');
    const parsed = JSON.parse(text);
    return this.replace(migrateSave(parsed));
  }
  async loadPendingSync() {
    const db = await this.dbPromise;
    if (!db) return null;
    return request(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(`sync:${this.namespace}`));
  }
  async clearPendingSync(generation, revision) {
    const db = await this.dbPromise;
    if (!db) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const reading = store.get(`sync:${this.namespace}`);
      reading.onsuccess = () => {
        if (reading.result?.generation === generation && reading.result?.revision === revision) store.delete(`sync:${this.namespace}`);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
  async saveExternalBackup(tag, state) {
    validateSave(state);
    const db = await this.dbPromise;
    if (!db) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(structuredClone(state), `backup:${tag}:${this.namespace}`);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
  close() { this.channel?.close(); this.dbPromise.then(db => db?.close()); }
}
