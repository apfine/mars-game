export const SAVE_VERSION = 1;
export const WORLD_VERSION = 1;

// Coordinates are relative to Starbase Ares (1400, 1150). All plots are on
// its levelled apron, east of the towers and south of the factory routes.
export const BASE_PLOTS = Object.freeze([
  { id: 'a1', x: 230, z: -215 }, { id: 'a2', x: 265, z: -215 }, { id: 'a3', x: 300, z: -215 },
  { id: 'b1', x: 230, z: -180 }, { id: 'b2', x: 265, z: -180 }, { id: 'b3', x: 300, z: -180 },
  { id: 'c1', x: 230, z: -145 }, { id: 'c2', x: 265, z: -145 }, { id: 'c3', x: 300, z: -145 }
]);

export const MODULES = Object.freeze({
  solar: { name: 'Solar array', cost: { materials: 35 }, power: 3, water: 0, purpose: '+3 power capacity', footprint: [22, 22] },
  water: { name: 'Water extractor', cost: { materials: 40 }, power: 0, water: 3, purpose: '+3 water capacity', footprint: [22, 22] },
  greenhouse: { name: 'Greenhouse', cost: { materials: 55 }, power: -1, water: -1, purpose: 'Grow one crop at a time', footprint: [22, 22], requires: ['solar', 'water'] },
  habitat: { name: 'Habitat', cost: { materials: 75 }, power: -1, water: -1, settlement: 4, purpose: '+4 settlement capacity', footprint: [22, 22], requires: ['greenhouse'] },
  lab: { name: 'Science laboratory', cost: { materials: 80, research: 20 }, power: -2, water: -1, purpose: 'Run the survey research project', footprint: [22, 22], requires: ['habitat'] },
  storage: { name: 'Storage module', cost: { materials: 35 }, power: 0, water: 0, storage: 120, purpose: '+120 inventory capacity', footprint: [22, 22] }
});

// Fictional gameplay durations and yields, not agricultural estimates.
export const CROPS = Object.freeze({
  sprout: { name: 'Ares sprout', durationMs: 2 * 60_000, yield: 5, label: 'Quick harvest' },
  tuber: { name: 'Red tuber', durationMs: 5 * 60_000, yield: 13, label: 'Balanced yield' },
  grain: { name: 'Dune grain', durationMs: 8 * 60_000, yield: 24, label: 'Long yield' }
});

export const HISTORIC_LANDMARKS = Object.freeze([
  'perseverance_jezero', 'curiosity_gale', 'opportunity_meridiani',
  'viking1_chryse', 'pathfinder_ares', 'spirit_troy'
]);

export const OBJECTIVES = Object.freeze([
  { id: 'discovery', track: 'Explorer', title: 'Find a historic landing site', description: 'Reach any historic Mars landmark on foot or by rover.', prereqs: [], reward: { materials: 25, research: 5 }, auto: true, next: ['utilities'] },
  { id: 'scout', track: 'Explorer', title: 'Survey the Ares perimeter', description: 'Drive 500 m in the rover.', prereqs: [], reward: { materials: 20, research: 5 }, auto: true, next: ['discovery'] },
  { id: 'utilities', track: 'Settlement', title: 'Power and water', description: 'Activate a solar array and a water extractor.', prereqs: ['discovery'], reward: { materials: 25, research: 5 }, auto: true, next: ['greenhouse'] },
  { id: 'greenhouse', track: 'Settlement', title: 'First greenhouse', description: 'Construct an active greenhouse on an Ares plot.', prereqs: ['utilities'], reward: { materials: 20, research: 5 }, auto: true, next: ['harvest'] },
  { id: 'harvest', track: 'Settlement', title: 'First harvest', description: 'Plant and harvest any crop.', prereqs: ['greenhouse'], reward: { materials: 25, research: 10 }, auto: true, next: ['habitat', 'provisions'] },
  { id: 'provisions', track: 'Flight Operations', title: 'Provision an expedition', description: 'Allocate 2 food, then reach a valid orbit in the same mission run.', prereqs: ['harvest'], reward: { materials: 30, research: 10 }, auto: false, next: ['orbit'] },
  { id: 'habitat', track: 'Settlement', title: 'A place to stay', description: 'Build an active habitat after the first harvest.', prereqs: ['harvest'], reward: { materials: 30, research: 15 }, auto: true, next: ['chapter'] },
  { id: 'chapter', track: 'Settlement', title: 'Ares settlement established', description: 'Complete the discovery, utilities, greenhouse, harvest, and habitat chain.', prereqs: ['habitat'], reward: { materials: 45, research: 20 }, auto: true, next: ['laboratory'] },
  { id: 'laboratory', track: 'Settlement', title: 'Build a science laboratory', description: 'Construct an active lab using research and materials.', prereqs: ['chapter'], reward: { materials: 35, research: 10 }, auto: true, next: ['science'] },
  { id: 'science', track: 'Settlement', title: 'Survey research', description: 'Complete the laboratory survey project once.', prereqs: ['laboratory'], reward: { materials: 45, research: 25 }, auto: true, next: ['orbit'] },
  { id: 'orbit', track: 'Flight Operations', title: 'Reach a valid orbit', description: 'Complete launch and orbital insertion after accepting this expedition.', prereqs: [], reward: { materials: 30, research: 15 }, auto: false, next: ['lunar'] },
  { id: 'lunar', track: 'Flight Operations', title: 'Lunar surface expedition', description: 'Land a ship safely on the Moon after accepting this expedition.', prereqs: ['orbit'], reward: { materials: 50, research: 30 }, auto: false, next: [] }
]);

export const BADGES = Object.freeze([
  { id: 'eva', name: 'First EVA', description: 'Walk outside a vehicle.' },
  { id: 'landmark', name: 'First Discovery', description: 'Discover a historic Mars landmark.' },
  { id: 'historians', name: 'Mars Historian', description: 'Discover all six historic mission sites.' },
  { id: 'orbit', name: 'Orbital Pilot', description: 'Reach a validated orbit.' },
  { id: 'landing', name: 'Safe Return', description: 'Land the ship safely.' },
  { id: 'booster', name: 'Booster Recovery', description: 'Catch the booster.' },
  { id: 'refuel', name: 'Orbital Logistics', description: 'Complete a propellant transfer.' },
  { id: 'moon', name: 'Lunar Landing', description: 'Land safely on the Moon.' },
  { id: 'builder', name: 'First Module', description: 'Construct a base module.' },
  { id: 'harvest', name: 'First Harvest', description: 'Harvest a greenhouse crop.' },
  { id: 'botanist', name: 'Ares Botanist', description: 'Harvest all three crop types.' },
  { id: 'chapter', name: 'Settlement Founder', description: 'Establish the first Ares chapter.' }
]);
