// Shared Starbase master plan.
//
// All coordinates are local to the Launch Complex origin (the centre of the
// Orbital Launch Mount). Keeping the layout in one place lets the flight
// physics, the vehicle art and the automated yard operations agree on exactly
// where a vehicle is caught, inspected, rebuilt and stacked.
//
// The terrain under the whole complex is levelled in terrain/noise.js, so every
// structure and crawler can share y = 0 as its datum.

export const STARBASE_LAYOUT = {
  olmTop: 22.0,
  boosterHeight: 70.0,
  shipHeight: 50.0,
  stackShipOffset: 75.0,

  launchTower: {
    x: 18.0,
    z: 0.0,
    height: 145.0,
    // The ship's forward catch pins sit 31.8 m above its base. With the ship
    // base at 97 m on a completed stack (22 m OLM + 75 m booster), the launch
    // tower's stacking arms belong at 128.8 m.
    armY: 128.8
  },

  boosterTower: {
    x: -118.0,
    z: 86.0,
    height: 132.0,
    armY: 85.0
  },
  boosterCatch: {
    // The carriage sits 4.5 m inboard of the tower centreline and the arms are
    // 22 m long, so the arm tips (and the catch pads) are 26.5 m out. The
    // vehicle centreline must be exactly on that tip plane.
    x: -144.5,
    z: 86.0,
    baseY: 19.5
  },

  shipTower: {
    x: 156.0,
    z: -92.0,
    height: 132.0,
    armY: 83.8
  },
  shipCatch: {
    x: 129.5,
    z: -92.0,
    baseY: 52.0
  },

  factory: {
    x: 170.0,
    z: 240.0,
    width: 120.0,
    depth: 80.0,
    conveyorDoorX: 110.0,
    conveyorDoorZ: 230.0,
    recoveryDoorX: 170.0,
    recoveryDoorZ: 280.0
  },

  conveyor: {
    beltY: 8.0,
    // Elevated line: factory -> west -> north -> east to the erector.
    path: [
      { x: 110.0, z: 230.0 },
      { x: -150.0, z: 230.0 },
      { x: -150.0, z: 65.0 },
      { x: 0.0, z: 65.0 }
    ]
  },

  erector: {
    x: 0.0,
    z: 65.0,
    baseY: 1.8
  },

  review: {
    booster: { x: -60.0, z: 190.0 },
    ship: { x: 60.0, z: 190.0 }
  },

  boosterRolloutStop: {
    x: 35.0,
    z: 0.0
  },

  routes: {
    // Booster road: from Booster Tower, south along West industrial road into Mega Bay West Door
    boosterToReview: [
      { x: -144.5, z: 86.0 },
      { x: -136.0, z: 160.0 },
      { x: -80.0, z: 190.0 }
    ],
    boosterToFactory: [
      { x: -80.0, z: 190.0 },
      { x: -20.0, z: 230.0 },
      { x: 60.0, z: 230.0 },
      { x: 110.0, z: 230.0 }
    ],
    boosterRollout: [
      { x: 110.0, z: 230.0 },
      { x: 35.0, z: 160.0 },
      { x: 35.0, z: 0.0 }
    ],
    // Starship road: from Ship Tower, south along East perimeter road into Mega Bay South Door
    shipToReview: [
      { x: 129.5, z: -92.0 },
      { x: 145.0, z: 50.0 },
      { x: 155.0, z: 160.0 }
    ],
    shipToFactory: [
      { x: 155.0, z: 160.0 },
      { x: 165.0, z: 220.0 },
      { x: 170.0, z: 280.0 }
    ]
  }
};

// Catch-arm contact height for each vehicle, measured from that vehicle's base.
export const CATCH_PIN_HEIGHTS = {
  booster: 65.5,
  ship: 31.8
};

// Local pin offsets used by both art and capture checks.
export const CATCH_PIN_RADIUS = 4.5;
