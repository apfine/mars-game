import { BADGES, BASE_PLOTS, CROPS, HISTORIC_LANDMARKS, MODULES, OBJECTIVES, SAVE_VERSION, WORLD_VERSION } from './content.js';

const objectiveById = new Map(OBJECTIVES.map(item => [item.id, item]));
const plotIds = new Set(BASE_PLOTS.map(plot => plot.id));
const bounded = (items, max) => items.length > max ? items.slice(-max) : items;
const clone = value => structuredClone(value);
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function initialCareer(now = Date.now()) {
  return {
    version: SAVE_VERSION, worldVersion: WORLD_VERSION, generation: id(), revision: 0,
    profile: { name: 'Ares Expedition' },
    resources: { materials: 170, research: 0, food: 0 },
    buildings: [], discoveries: [], badges: [], harvestedCrops: [],
    objectives: {}, pendingRewards: [], evidence: { eva: false, roverMeters: 0, harvests: 0, science: false, orbit: false, lunar: false, provisionFlight: false },
    eventKeys: [], actionKeys: [], history: [], nextSerial: 1,
    mission: { runId: id(), provisionsRunId: null, checkpoint: null },
    settings: { pinned: 'discovery' }, updatedAt: now
  };
}

export function inventoryCapacity(state) {
  return 240 + state.buildings.filter(b => b.type === 'storage' && b.active).length * MODULES.storage.storage;
}

export function inventoryUsed(state) {
  return state.resources.materials + state.resources.food;
}

export function baseCapacity(state) {
  const totals = { power: 0, water: 0, settlement: 0 };
  for (const building of state.buildings) {
    if (!building.active) continue;
    const definition = MODULES[building.type];
    if (!definition) continue;
    totals.power += definition.power || 0;
    totals.water += definition.water || 0;
    totals.settlement += definition.settlement || 0;
  }
  return totals;
}

export function placementReason(state, type, plotId, terrainValid = true) {
  const definition = MODULES[type];
  if (!definition) return 'Unknown module.';
  if (!plotIds.has(plotId)) return 'Choose a marked Ares expansion plot.';
  if (!terrainValid) return 'Terrain or a protected Starbase route blocks this plot.';
  if (state.buildings.some(b => b.plotId === plotId)) return 'This plot is occupied.';
  if (state.buildings.length >= BASE_PLOTS.length) return 'All expansion plots are occupied.';
  for (const required of definition.requires || []) {
    if (!state.buildings.some(b => b.type === required && b.active)) return `Build an active ${MODULES[required].name} first.`;
  }
  for (const [resource, cost] of Object.entries(definition.cost)) {
    if (state.resources[resource] < cost) return `Need ${cost - state.resources[resource]} more ${resource}.`;
  }
  const capacity = baseCapacity(state);
  if (capacity.power + (definition.power || 0) < 0) return `Power deficit: ${-(capacity.power + definition.power)}. Add a solar array.`;
  if (capacity.water + (definition.water || 0) < 0) return `Water deficit: ${-(capacity.water + definition.water)}. Add a water extractor.`;
  return null;
}

function meets(state, objective) {
  const has = type => state.buildings.some(b => b.type === type && b.active);
  switch (objective.id) {
    case 'discovery': return state.discoveries.some(item => HISTORIC_LANDMARKS.includes(item));
    case 'scout': return state.evidence.roverMeters >= 500;
    case 'utilities': return has('solar') && has('water');
    case 'greenhouse': return has('greenhouse');
    case 'harvest': return state.evidence.harvests > 0;
    case 'provisions': return state.evidence.provisionFlight;
    case 'habitat': return has('habitat');
    case 'chapter': return Boolean(state.objectives.habitat?.complete);
    case 'laboratory': return has('lab');
    case 'science': return state.evidence.science;
    case 'orbit': return Boolean(state.evidence.orbitAt && state.objectives.orbit?.acceptedAt && state.evidence.orbitAt > state.objectives.orbit.acceptedAt);
    case 'lunar': return Boolean(state.evidence.lunarAt && state.objectives.lunar?.acceptedAt && state.evidence.lunarAt > state.objectives.lunar.acceptedAt);
    default: return false;
  }
}

function addHistory(state, kind, title, detail, now) {
  state.history = bounded([...state.history, { id: `${state.generation}:${state.nextSerial++}`, kind, title, detail, at: now }], 100);
}

function canReceive(state, reward) {
  return inventoryUsed(state) + (reward.materials || 0) + (reward.food || 0) <= inventoryCapacity(state);
}

function applyReward(state, reward) {
  for (const key of ['materials', 'research', 'food']) state.resources[key] += reward[key] || 0;
}

function evaluate(state, now, notices) {
  let again = true;
  while (again) {
    again = false;
    for (const objective of OBJECTIVES) {
      if (state.objectives[objective.id]?.complete) continue;
      if (!objective.prereqs.every(key => state.objectives[key]?.complete)) continue;
      if (!objective.auto && !state.objectives[objective.id]?.acceptedAt) continue;
      if (!meets(state, objective)) continue;
      const entry = state.objectives[objective.id] || {};
      entry.complete = true;
      entry.completedAt = now;
      entry.claimed = canReceive(state, objective.reward);
      state.objectives[objective.id] = entry;
      if (entry.claimed) applyReward(state, objective.reward);
      else state.pendingRewards.push({ id: objective.id, reward: objective.reward });
      addHistory(state, 'objective', objective.title, entry.claimed ? `Reward: ${formatReward(objective.reward)}` : 'Reward held until inventory has room', now);
      notices.push(`Objective complete: ${objective.title}${entry.claimed ? '' : ' · reward pending'}`);
      again = true;
    }
  }
  const has = badgeId => state.badges.includes(badgeId);
  const badgeChecks = {
    eva: state.evidence.eva,
    landmark: state.discoveries.some(item => HISTORIC_LANDMARKS.includes(item)),
    historians: HISTORIC_LANDMARKS.every(item => state.discoveries.includes(item)),
    orbit: state.evidence.orbit,
    landing: state.eventKeys.some(key => key.includes(':landing:')),
    booster: state.eventKeys.some(key => key.includes(':booster:')),
    refuel: state.eventKeys.some(key => key.includes(':refuel:')),
    moon: state.eventKeys.some(key => key.includes(':landing:moon')),
    builder: state.buildings.length > 0,
    harvest: state.evidence.harvests > 0,
    botanist: Object.keys(CROPS).every(crop => state.harvestedCrops.includes(crop)),
    chapter: Boolean(state.objectives.chapter?.complete)
  };
  const unlocked = BADGES.filter(badge => badgeChecks[badge.id] && !has(badge.id));
  if (unlocked.length) {
    state.badges.push(...unlocked.map(badge => badge.id));
    addHistory(state, 'badges', 'Badges earned', unlocked.map(badge => badge.name).join(', '), now);
    notices.push(`Badges: ${unlocked.map(badge => badge.name).join(', ')}`);
  }
}

export function formatReward(reward) {
  return Object.entries(reward).map(([key, value]) => `${value} ${key}`).join(' · ');
}

export function nextObjectives(state) {
  return OBJECTIVES.filter(objective => !state.objectives[objective.id]?.complete &&
    objective.prereqs.every(key => state.objectives[key]?.complete)).slice(0, 3);
}

export function advanceProduction(state, now) {
  const next = clone(state);
  let changed = false;
  for (const building of next.buildings) {
    const cycle = building.crop;
    if (!cycle || cycle.ready) continue;
    const delta = Math.max(0, Math.min(7 * 24 * 60 * 60_000, now - cycle.lastUpdateMs));
    if (building.active) cycle.elapsedMs = Math.min(cycle.durationMs, cycle.elapsedMs + delta);
    cycle.lastUpdateMs = Math.max(cycle.lastUpdateMs, now);
    cycle.ready = cycle.elapsedMs >= cycle.durationMs;
    changed ||= delta > 0;
  }
  if (changed) next.updatedAt = now;
  return { state: next, changed };
}

export function reduceCareer(current, action, now = Date.now()) {
  const state = clone(current);
  const notices = [];
  const fail = error => ({ state: current, changed: false, error, notices: [] });
  if (!action || typeof action.type !== 'string') return fail('Invalid action.');
  if (action.commandId && state.actionKeys.includes(action.commandId)) return { state: current, changed: false, duplicate: true, notices: [] };
  const building = state.buildings.find(item => item.id === action.buildingId);
  switch (action.type) {
    case 'event': {
      const event = action.event;
      if (!event || typeof event.kind !== 'string' || typeof event.key !== 'string') return fail('Invalid event.');
      if (state.eventKeys.includes(event.key)) return { state: current, changed: false, duplicate: true, notices: [] };
      state.eventKeys = bounded([...state.eventKeys, event.key], 5000);
      if (event.kind === 'eva') state.evidence.eva = true;
      if (event.kind === 'landmark' && HISTORIC_LANDMARKS.includes(event.landmarkId) && !state.discoveries.includes(event.landmarkId)) {
        state.discoveries.push(event.landmarkId);
        addHistory(state, 'discovery', 'Historic site discovered', event.name || event.landmarkId, now);
      }
      if (event.kind === 'rover_scout') state.evidence.roverMeters = Math.max(state.evidence.roverMeters, Math.floor(event.meters || 0));
      if (event.kind === 'orbit') {
        state.evidence.orbit = true;
        state.evidence.orbitAt = now;
        if (state.mission.provisionsRunId === event.runId) state.evidence.provisionFlight = true;
      }
      if (event.kind === 'landing' && event.planet === 'moon') { state.evidence.lunar = true; state.evidence.lunarAt = now; }
      if (['orbit', 'landing', 'booster', 'refuel'].includes(event.kind))
        addHistory(state, 'flight', `${event.kind[0].toUpperCase()}${event.kind.slice(1)} · ${event.planet || 'mission'}`, `Run ${event.runId || 'unknown'}${event.assisted ? ' · assisted' : ''}`, now);
      break;
    }
    case 'accept': {
      const objective = objectiveById.get(action.objectiveId);
      if (!objective) return fail('Unknown objective.');
      if (!objective.prereqs.every(key => state.objectives[key]?.complete)) return fail('Complete prerequisite objectives first.');
      const record = state.objectives[objective.id] || {};
      if (record.acceptedAt || record.complete) return fail('Already accepted or completed.');
      record.acceptedAt = now;
      state.objectives[objective.id] = record;
      break;
    }
    case 'build': {
      const reason = placementReason(state, action.moduleType, action.plotId, action.terrainValid !== false);
      if (reason) return fail(reason);
      const definition = MODULES[action.moduleType];
      for (const [resource, cost] of Object.entries(definition.cost)) state.resources[resource] -= cost;
      const plot = BASE_PLOTS.find(item => item.id === action.plotId);
      const built = { id: `${state.generation}:${state.nextSerial++}`, type: action.moduleType, plotId: plot.id,
        x: plot.x, z: plot.z, rotation: ((Math.trunc(action.rotation || 0) % 4) + 4) % 4, active: true, crop: null, builtAt: now };
      state.buildings.push(built);
      addHistory(state, 'build', `${definition.name} constructed`, `Plot ${plot.id.toUpperCase()}`, now);
      notices.push(`${definition.name} ready`);
      break;
    }
    case 'relocate': {
      if (!building) return fail('Module not found.');
      if (!plotIds.has(action.plotId) || state.buildings.some(item => item.plotId === action.plotId)) return fail('Choose an empty expansion plot.');
      const plot = BASE_PLOTS.find(item => item.id === action.plotId);
      Object.assign(building, { plotId: plot.id, x: plot.x, z: plot.z, rotation: ((Math.trunc(action.rotation || 0) % 4) + 4) % 4 });
      break;
    }
    case 'remove':
    case 'toggle': {
      if (!building) return fail('Module not found.');
      if (action.type === 'remove' && building.crop) return fail('Harvest the current crop before removing this greenhouse.');
      if (action.type === 'toggle' && building.crop) {
        const cycle = building.crop;
        if (building.active && !cycle.ready) {
          cycle.elapsedMs = Math.min(cycle.durationMs, cycle.elapsedMs + Math.max(0, now - cycle.lastUpdateMs));
          cycle.ready = cycle.elapsedMs >= cycle.durationMs;
        }
        cycle.lastUpdateMs = Math.max(cycle.lastUpdateMs, now);
      }
      if (action.type === 'toggle' && !building.active) {
        const definition = MODULES[building.type];
        for (const required of definition.requires || []) {
          if (!state.buildings.some(item => item.type === required && item.active)) return fail(`Activate ${MODULES[required].name} first.`);
        }
        const capacity = baseCapacity(state);
        if (capacity.power + (definition.power || 0) < 0 || capacity.water + (definition.water || 0) < 0)
          return fail('Insufficient power or water capacity to activate this module.');
        building.active = true;
        break;
      }
      const without = state.buildings.filter(item => item.id !== building.id);
      const remaining = baseCapacity({ ...state, buildings: without });
      if (remaining.power < 0 || remaining.water < 0) return fail(`This supplier supports active modules; deficit: ${Math.max(0, -remaining.power)} power, ${Math.max(0, -remaining.water)} water.`);
      if (action.type === 'remove') {
        if (building.type === 'storage' && inventoryUsed(state) > inventoryCapacity({ ...state, buildings: without })) return fail('Move inventory below the reduced storage capacity first.');
        state.buildings = without;
      } else building.active = false;
      break;
    }
    case 'plant': {
      if (!building || building.type !== 'greenhouse') return fail('Choose a greenhouse.');
      if (!building.active) return fail('Greenhouse is inactive; restore power and water capacity.');
      if (building.crop) return fail('Harvest the current crop first.');
      const crop = CROPS[action.cropId];
      if (!crop) return fail('Unknown crop.');
      building.crop = { id: `${state.generation}:crop:${state.nextSerial++}`, cropId: action.cropId, elapsedMs: 0,
        durationMs: crop.durationMs, lastUpdateMs: now, ready: false };
      addHistory(state, 'farm', `${crop.name} planted`, MODULES.greenhouse.name, now);
      break;
    }
    case 'harvest': {
      if (!building?.crop || building.crop.id !== action.cycleId || !building.crop.ready) return fail('This crop cycle is not ready or was already harvested.');
      const crop = CROPS[building.crop.cropId];
      if (inventoryUsed(state) + crop.yield > inventoryCapacity(state)) return fail(`Inventory full. Free ${inventoryUsed(state) + crop.yield - inventoryCapacity(state)} capacity; harvest remains ready.`);
      state.resources.food += crop.yield;
      state.evidence.harvests++;
      if (!state.harvestedCrops.includes(building.crop.cropId)) state.harvestedCrops.push(building.crop.cropId);
      building.crop = null;
      addHistory(state, 'farm', `${crop.name} harvested`, `+${crop.yield} food`, now);
      notices.push(`Harvest: +${crop.yield} food`);
      break;
    }
    case 'provision': {
      if (!state.objectives.provisions?.acceptedAt) return fail('Accept the provisions objective first.');
      if (state.mission.provisionsRunId === state.mission.runId) return fail('This mission is already provisioned.');
      if (state.resources.food < 2) return fail('Need 2 food.');
      state.resources.food -= 2;
      state.mission.provisionsRunId = state.mission.runId;
      addHistory(state, 'flight', 'Expedition provisioned', '2 food allocated to this mission run', now);
      break;
    }
    case 'science': {
      if (!state.buildings.some(item => item.type === 'lab' && item.active)) return fail('Build and activate a science laboratory first.');
      if (state.evidence.science) return fail('Survey research already completed.');
      if (state.resources.research < 20) return fail('Need 20 research.');
      state.resources.research -= 20;
      state.evidence.science = true;
      addHistory(state, 'science', 'Ares survey research complete', '20 research allocated', now);
      break;
    }
    case 'claim': {
      const pending = state.pendingRewards.find(item => item.id === action.objectiveId);
      if (!pending) return fail('No pending reward.');
      if (!canReceive(state, pending.reward)) return fail('Free inventory capacity before claiming.');
      applyReward(state, pending.reward);
      state.pendingRewards = state.pendingRewards.filter(item => item.id !== pending.id);
      state.objectives[pending.id].claimed = true;
      break;
    }
    case 'name': {
      const name = String(action.name || '').trim().slice(0, 40);
      if (!name) return fail('Enter a program name.');
      state.profile.name = name;
      break;
    }
    case 'pin': {
      if (!objectiveById.has(action.objectiveId)) return fail('Unknown objective.');
      state.settings.pinned = action.objectiveId;
      break;
    }
    case 'checkpoint': state.mission.checkpoint = action.checkpoint; break;
    case 'new_mission': {
      state.mission = { runId: id(), provisionsRunId: null, checkpoint: null };
      addHistory(state, 'mission', 'New mission started', 'Settlement progress retained', now);
      break;
    }
    default: return fail('Unknown action.');
  }
  if (action.commandId) state.actionKeys = bounded([...state.actionKeys, action.commandId], 5000);
  evaluate(state, now, notices);
  state.updatedAt = now;
  state.revision = current.revision + 1;
  return { state, changed: true, notices };
}
