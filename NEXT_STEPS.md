# DUNES handoff: next work session

The Ares career update is on `main` at `b9de00b`. The guest settlement loop, 61 automated tests, production build, and Chrome viewport checks passed. See [CAREER_SETUP.md](CAREER_SETUP.md) for gameplay and setup details.

## Do next

1. **Provision and test Supabase sync.** Apply `supabase/migrations/202611070001_career_saves.sql`, set the two public values from `.env.example` in `.env.local`, then test sign-up/sign-in, guest vs. device vs. cloud choice, a real two-device revision conflict, logout/account switching, offline retry, and Row Level Security with two different accounts. Cloud code currently has mock tests only; no project credentials were available.
2. **Test on physical phones.** The guest chapter passed Chrome emulation at 390×844 and 844×390, including placement, harvest, scrolling, dismissal, and reload. Test actual touch gestures, safe areas, WebGL performance, and controls on at least one mid-range Android phone and one iPhone. Record device, browser, frame rate, and any overlap before making performance claims.
3. **Exercise mission checkpoints and progression in the running game.** Unit tests cover supported surface/orbit checkpoint data and restoration, but a browser session should verify restoring a real Earth/Mars/Moon orbit and surface checkpoint, rebuilding transient visuals, and earning orbit, refuel, landing, booster, and lunar badges from genuine flight outcomes. Confirm that Reset Mission keeps the base and crops.
4. **Finish the earlier seamless-physics request.** The transfer has a visible capture burn and deorbit no longer teleports, but the AU-scaled transfer scene still rebases into local planet coordinates at arrival. This is not yet one continuous physics frame and may still show a visual jump. Review the transfer/local-scene seam before describing it as fully seamless.
5. **Review dependency advisories.** `npm install` reported two advisories (one high, one critical), but `npm audit --json` could not reach the registry audit endpoint in this environment. Rerun the audit with registry access, identify affected packages, and apply a tested fix.

## Current design limits

- Career progress is local-first. Missing Supabase configuration leaves the full guest game available.
- Mid-launch, transfer, entry, and active recovery are intentionally not exact-resume checkpoints; Continue Mission uses the last stable surface or orbit checkpoint.
- Browser-generated badges are personal progress, not server-verified achievements.
- Crop times are fictional gameplay values; production uses elapsed wall time and does not follow flight time acceleration.

## Useful checks

```sh
npm test
npm run build
node tests/careerBrowser.mjs
```

The browser script requires the app running on `http://localhost:3000` and Chrome CDP on port 9222. It advances the crop clock in the test so the full chapter can be checked without waiting two real minutes.
