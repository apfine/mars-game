# Ares Expedition Program

The guest game works without an account or network connection after the page has loaded. Career progress is saved in IndexedDB. The **Expedition** and **Build** buttons open the program and base panel. Historic Mars sites are discovered by approaching within 28 metres on foot or in a vehicle.

## First settlement chapter

1. Visit a historic Mars mission landmark. The discovery and its reward count even if the program panel was closed.
2. Build a solar array and water extractor on the nine surveyed plots east of Starbase Ares. Starter materials cover both and a greenhouse.
3. Build a greenhouse, plant a crop, and harvest it. Fictional gameplay growth times are 2, 5, and 8 real minutes; flight time acceleration does not affect them.
4. Build a habitat to complete the chapter. The laboratory and storage module remain optional expansions. A laboratory can run the one-time Ares survey research project.

Buildings are immediate, use snap plots, and have explicit confirmation. Power and water are base-wide capacity indicators, not spendable resources. Disabling a supplier is blocked if it would leave active consumers without capacity. Harvests and objectives wait if inventory is full.

**Reset Mission** and **Start New Mission** keep settlement progress. **Continue Mission** resumes the latest supported surface or stable orbit checkpoint on Mars, Earth, or the Moon. Mid-launch, transfer, entry, and active recovery resume from the previous stable checkpoint. **Reset All Progress** creates a new save generation and keeps a backup of the old active save.

The 12 badges are local accomplishments based on simulation events. They are not server-verified achievements.

## Optional Supabase sync

1. Create a Supabase project and apply [`supabase/migrations/202611070001_career_saves.sql`](supabase/migrations/202611070001_career_saves.sql) in its SQL editor or migration workflow. The table has owner-only Row Level Security and a compare-and-swap RPC.
2. Copy [`.env.example`](.env.example) to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and the project's publishable or anon key. Never put a service-role key in a public environment variable.
3. Restart the development or deployment build. The Save tab offers account sign-in or sign-up. The player explicitly chooses the guest, account-device, or cloud base branch and can choose a checkpoint separately. Cloud and device branches are backed up locally before replacement.

Local progress remains the immediate source during play. Account saves are posted with ordinary debounced requests and server revisions. If two devices edit the same account branch, the Save tab asks which branch to keep. Discoveries, badges, and deduplicated event milestones can be combined; resources, buildings, crop cycles, and spending stay on the selected branch. A queued upload is scoped to the account ID and save generation, so a reset or account switch does not reuse the old queue entry.

If cloud settings are absent, the Save tab shows **Local Only** and all guest features remain available. Auth and Postgres have not been provisioned by this repository; live account sync requires the project setup above.

## Verification

`npm test` covers the career reducer, transaction and reload behavior, clock rollback, duplicate actions, recovery, flight physics, and cloud coordinator conflict handling. `npm run build` checks the app bundle. With a local Chrome CDP session on port 9222, `node tests/careerBrowser.mjs` exercises the guest chapter, phone and desktop panels, reload persistence, and a landscape flight HUD. Physical-device performance remains unmeasured.
