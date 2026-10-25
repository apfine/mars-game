# Starship overhaul

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

Scope: Earth, Mars and Moon are landable. Other planets are visual navigation bodies.
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
