# Starship overhaul

## Current correction pass

- [x] Replace placeholder Gargantua with a black-hole shadow, accretion disk, and lensing approximation grounded in published rendering work.
- [x] Replace the blue-striped wormhole with a spherical view of the destination sky and rim lensing; visibly cross its mouth near Saturn.
- [x] Give Miller's planet its own ocean, atmosphere, lighting, terrain collision, tide hazards, and local/distant clocks throughout arrival and surface play.
- [x] Make transfers proceed through alignment, a fuel-consuming injection burn, computed coast, and destination encounter without an instant transfer jump.
- [x] Show docking stages and conserved ship/tanker tank quantities; verify routes to every destination.
- [x] Make navigation, vehicle controls, and stage timeline relevant to rover, EVA, roadster, booster/Starship, transfer, and flyby states.
- [x] Check rendered browser scenes, regressions, and production build; document what the physics model still approximates.

- [x] Consistent solar distances, eight planets and Sun; detailed Earth/Mars.
- [x] Kepler transfer in both directions, truthful distance/time/speed.
- [x] Planet-specific air, bounded launch/entry integration and hypersonic arrival.
- [x] Windward reentry glow driven by atmospheric heating; refined ship materials.
- [x] Continuous day/night lighting, sky and fog.
- [x] Minimal responsive phone controls with secondary actions in menus.
- [x] Physics regression checks and production build.

Follow-up fixes:

- [x] Physical angular sizes for distant planets and Moon; real local globe radii.
- [x] NASA Earth albedo, continuous atmosphere fade, shared coastal surface/collision heights.
- [x] Moon vacuum landing and one Transfer destination menu; repeat departures fixed.
- [x] Crane lifting lugs, controlled hoist, steering movers, north gates and solid bay geometry.
- [x] Four/six compact touch controls, desktop suppression and neutral steel reflections.
- [x] Booster RCS/boostback sequence, refined Roadster body and expedition rover hardware.

Scope: Earth, Mars, the Moon and Miller are landable. Mercury, Venus, Jupiter, Saturn, Uranus and Neptune are flyby waypoints without capture or surface landing. Gargantua is a non-Newtonian waypoint through the Saturn wormhole.
Circular coplanar orbits and automatic launch-window alignment are gameplay
approximations. Navigation distances and globe radii share one AU scale; local
backgrounds preserve angular size. Local flight uses metres; cruise time is compressed.
Assisted orbit hold, preset arrival corridors and landing reserves are gameplay
guidance rather than a full n-body mission simulator. Recovered craft stay in the
bay; Reset Mission prepares the next launch stack.

Validation: Node regression tests cover launch/recovery, lunar landing, bay lanes,
atmospheric continuity and transfer conservation. Headless Chrome checks responsive
controls, repeated Earth/Mars and lunar transfers, and shader/runtime errors.
Software rendering does not validate phone GPU FPS. NASA imagery credits are in
public/textures/CREDITS.md.

Reference: https://www.jpl.nasa.gov/edu/resources/lesson-plan/lets-go-to-mars-calculating-launch-windows/
