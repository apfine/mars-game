# Starship overhaul

- [x] Consistent solar distances, eight planets and Sun; detailed Earth/Mars.
- [x] Kepler transfer in both directions, truthful distance/time/speed.
- [x] Planet-specific air, bounded launch/entry integration and hypersonic arrival.
- [x] Windward reentry glow driven by atmospheric heating; refined ship materials.
- [x] Continuous day/night lighting, sky and fog.
- [x] Minimal responsive phone controls with secondary actions in menus.
- [x] Physics regression checks and production build.

Scope: Earth and Mars are landable. Other planets are visual navigation bodies.
Circular coplanar orbits and automatic launch-window alignment are gameplay
approximations. Navigation distances share one AU scale; globe radii are enlarged
for visibility. Local flight uses metres; the transfer uses compressed time.

Validation: nine Node regression tests cover both launches, both tower recoveries,
atmospheric continuity and transfer conservation. Headless Chrome checks phone
layout and shader/runtime errors. Software rendering does not validate phone GPU FPS.

Reference: https://www.jpl.nasa.gov/edu/resources/lesson-plan/lets-go-to-mars-calculating-launch-windows/
