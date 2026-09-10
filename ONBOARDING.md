# Onboarding: Quote Desk

You are picking up Quote Desk, a Claude Artifact for vFulfill's sourcing team. It reads supplier
quotations from emails in any format, shows what each quote is missing, drafts follow-ups for a
person to approve, and ranks eligible quotes as Cheapest, Best value and Recommended winner. A
person always awards.

## First hour

1. Read `HANDOVER.md` in the repository root. It has the file map, the three-lane design
   (rule / claude / you), runtime limits and the demo flow.
2. Run `node build.js` then `node test/rules.test.js`. Expect 106 passing.
3. Preview locally: `python3 -m http.server 8749 --directory dist` and open
   `http://localhost:8749/local.html`. Without the artifact runtime the page runs in
   "Reference mode" using stored reads, which is enough to see every screen.
4. Publish your own copy: `dist/quote-desk.html` as an Artifact named "Quote Desk", favicon 📦,
   capabilities `sample {}`, `db {}`, `downloads true`. Read `docs/PLAN.md` if you want the
   reasoning behind the architecture.

## Rules to keep

- The AI extracts and explains; the rules convert, compute and judge eligibility; humans
  override with a reason. Do not move logic between lanes without saying so in the UI.
- Never render supplier text with innerHTML. Evidence spans must be verbatim substrings of the
  source, or they are not highlighted.
- Keep the navigation to three primary sections. No decision-log screen. Long AI text goes in
  compact scrolling containers.
- Seeded emails carry `expected` results; keep them passing when you change prompts or rules.

## Where things live

- `src/rules.js` reason codes and every deterministic check
- `src/prompts.js` every prompt; bump `prompt_versions` in `src/seed.js` when you change one
- `src/generator.js` the test-reply generator for new inquiries
- `src/app-views.js` all screens; `src/app-core.js` state, storage, AI adapters, uploads
