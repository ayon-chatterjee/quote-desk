# Prompt to continue Quote Desk from another Claude account

Paste everything below the line into Claude Code on the new account, from an empty folder.

---

You are taking over an existing, working project called **Quote Desk**. The code is at **https://github.com/ayon-chatterjee/quote-desk**. Your job in this first session: set everything up on this account so it runs exactly as it did on the previous one, verify it, publish the artifacts, then continue development from where it stopped. Do not redesign anything before the setup steps are complete and reported.

## Part 1 — Setup tasks (do these in order, report each result)

1. **Clone**: `git clone https://github.com/ayon-chatterjee/quote-desk.git` into the current folder and move the session into it. Read `HANDOVER.md`, `ONBOARDING.md` and `docs/PLAN.md` before touching code.
2. **Build and test**: run `node build.js` (expect three files in `dist/`: `quote-desk.html`, `quote-desk-shareable.html`, `local.html`) and `node test/rules.test.js` (expect 106 passed, 0 failed). Node 18 or later, no dependencies. If either fails, fix the cause and say what it was.
3. **Preview locally once**: serve `dist/` with `python3 -m http.server 8749 --directory dist`, open `http://localhost:8749/local.html`, and check the Inquiries, Emails and Compare screens render with no console errors. Without the artifact runtime the page runs in "Reference mode", which is expected.
4. **Publish the main artifact**: load the `artifact-design` and `artifact-capabilities` skills if they are available, then publish `dist/quote-desk.html` as a Claude Artifact named **Quote Desk**, favicon 📦, capabilities `sample: {}`, `db: {}`, `downloads: true`, description "Create an RFQ, float it to suppliers, sync their replies, see what each quote is missing, approve follow-ups, and award from Cheapest, Best value or Recommended." Give me the link.
5. **Publish the shareable artifact**: publish `dist/quote-desk-shareable.html` as a second artifact (it is titled **Quote Desk Public** inside the file), favicon 📦, capabilities `sample: {}` and `downloads: true` only, no `db`. This copy can be shared outside the organisation because it declares no shared storage; its state lives in the browser session. Give me that link too.
6. **Verify in the viewer**: open the main artifact and confirm the sidebar chip says "Claude on" (this means `sample` resolved), that a "Not saved between visits" note is absent (this means `db` resolved), and that a Save button on an attachment offers a download (this means `downloads` resolved). Then run the demo flow in Part 4 once yourself, approving the consent prompt when the first Claude call asks.
7. **Handover docs**: keep `HANDOVER.md`, `ONBOARDING.md` and `docs/CONTINUE_PROMPT.md` current whenever you change architecture, prompts or the demo flow. Commit with clear messages and push to `origin main`.
8. **Report back** in one message: clone done, build sizes, test result, both artifact links, which capabilities resolved, anything that failed. Then ask me what to work on next and offer the "not built yet" list from Part 6.

## Part 2 — What Quote Desk is

Quote Desk is a single-page web app published as a Claude Artifact for **vFulfill**, an e-commerce sourcing company that sends requests for quotation (RFQs) to suppliers, mostly in China. Supplier replies arrive by email in every format: inline text, PDF, Excel, CSV, a cropped photo of a printed rate card, a WeChat or WhatsApp screenshot, a link to a 1688 or Alibaba page, or a reply thread with our own RFQ quoted underneath. Quote Desk:

1. lets a buyer create an inquiry, has Claude check it is complete enough for a factory to quote accurately (missing price band, thin specification, no lead time, questions worth adding), then floats it to all verified suppliers or a chosen set;
2. simulates the inbox (there is no Gmail connection yet): on submit, Claude writes one realistic supplier reply per recipient, each with a different problem deliberately planted, plus one cropped-photo reply from an unknown sender; an animated "Sync inbox" pulls them in;
3. reads each email: extracts unit price tiers, MOQ, lead time, validity, certifications, private label support, sample terms, payment terms, incoterm, freight, and answers to the RFQ's custom questions, with a verbatim evidence span for every value;
4. highlights in yellow, inside the rendered email and its attachment transcripts, the text that is wrong, ambiguous or conflicting, and lists every unanswered item in a "What's missing" panel; a "What we read" tab shows the structured result with unanswered rows in yellow;
5. drafts a follow-up email to the supplier asking only for the missing items; a person must approve before it is marked sent;
6. stops for a person on anything risky: unknown sender, currency or unit converted, body and attachment disagree, price given as a range, unreadable digit in a photo, conditional private label, spec deviation, payment fully in advance, price outlier, expired validity, certificate claimed without a number, a second quote from the same supplier, low confidence, and more;
7. on Compare, applies hard criteria by rule (private label required, all required certificates, price inside the USD FOB China band, still valid) and has Claude rank the eligible quotes as **Cheapest** (decided by arithmetic, explained by Claude), **Best value** and **Recommended winner**, with reasoning, runner-up, what to verify before award, and negotiation levers;
8. lets a person choose which plan wins and click Award.

### The three lanes: the most important design rule

Every field and decision carries a badge, and the lanes never blur:

- **rule** — deterministic JavaScript in `src/rules.js`. Owns RFQ-code matching (including typo repair), duplicate detection, quoted-history splitting, currency conversion at a pinned rate, unit conversion (per carton, per dozen, per 1000), price at the target quantity, completeness against the RFQ's question list, eligibility, outlier detection, supersession of revised quotes, staleness of a comparison, and the Cheapest lens.
- **claude** — calls made through the artifact runtime's `sample` capability on the viewer's own Claude account. Owns extraction with evidence, RFQ matching when no code is present, the readiness check on a new inquiry, generation of test replies, reply drafting, and the Best value and Recommended lenses. It never converts currency, computes a comparison price, or judges eligibility.
- **you** — the review queue and approvals. Humans override with a reason; overrides re-run the rules and mark any existing comparison stale.

## Part 3 — The code

```
src/index.html      page shell, design tokens (light and dark), all CSS
src/seed.js         pinned clock (demo_now 2026-09-10), FX rates, suppliers with verified flags,
                    3 seeded RFQs, 13 seeded supplier emails with expected results, attachment templates
src/rules.js        reason codes, pre-AI rules R01–R10, post-AI validation V01–V13, eligibility E00–E11, eval compare
src/prompts.js      prompt builders: extract, match, compare, readiness, generate, reply; 64 KiB byte budget enforced
src/fallback.js     reference reads for the 13 seeded emails (used with no Claude, and by the tests)
src/generator.js    deterministic edge-case reply generator for a new inquiry (each reply carries its own
                    reference read), readiness rules, chase items, reply-draft template
src/guardrails.js   attachment types and guardrails reference
src/pipeline.js     one email through the lanes; comparison; review resolution; reply drafting;
                    inquiry creation; supplier statuses
src/app-core.js     app state, db persistence, AI adapters (Claude or reference), file-upload parsing
                    (SheetJS and pdf.js from cdnjs, lazy), downloads, routing, navigation
src/app-views.js    every screen and event handler
src/boot.js         startup
build.js            inlines the sources into dist/quote-desk.html (publish), dist/quote-desk-shareable.html
                    (same page titled "Quote Desk Public", for publishing without db), dist/local.html (local preview)
test/rules.test.js  node tests over the rule lane and the seeded emails; expect 106 passing
docs/PLAN.md        original design plan and decisions
HANDOVER.md, ONBOARDING.md, ATTACHMENT_TYPES_AND_GUARDRAILS.md, docs/CONTINUE_PROMPT.md (this text)
```

Runtime facts that shape the code:

- Model tiers: extraction on `default` (a "Deep read" toggle forces `complex`); RFQ matching and reply drafting on `quick`; comparison always on `complex`. Bump `prompt_versions` in `src/seed.js` when a prompt changes, because identical prompts are cached for five minutes.
- Prompts are capped at 64 KiB; `src/prompts.js` measures bytes and clips attachments, never the body.
- The db holds at most 5,000 documents; logs are aggregated per email, never one per line.
- All date rules use `meta.demo_now`, not the real clock, so seeded expiry expectations never rot.
- Supplier email text is untrusted: rendered escaped, never with innerHTML; the prompt states it is data; instruction-like text is flagged by rule R09. Evidence spans must be verbatim substrings of the source or they are not highlighted (rule V02).
- Declaring `db` makes an artifact organisation-internal; that is why the shareable build exists.
- Only the newest arriving inbox card animates; animating all of them mid-sync made them flicker.

### Screens

Primary navigation: **Inquiries** (list; New inquiry wizard in three steps: Describe, Check, Suppliers; inquiry detail with a suppliers table showing "Email sent · awaiting response", "Response received", "Follow-up sent", latest email, attachments with Save, quote, open items), **Emails** (inbox with animated sync, format filters, "Write your own email" with predefined attachment templates or a real file upload, "Read all unread"), **Your queue** (replies waiting for approval, then questions for a person). Reference group: **Evals** (each email's read against its expected result), **Guardrails** (attachment types and every reason the system stops for a person). The email view has two tabs, "Supplier's email" and "What we read", with the "What's missing" panel and the reply draft on the right. Compare shows the hard-criteria table, three lens cards with compact scrolling reasoning and a "Choose this one" radio, and an award card with a dropdown of eligible quotes.

### Seeded demo data

Three RFQs: RFQ-2026-0417 collapsible silicone bottle (FDA + LFGB, private label), RFQ-2026-0422 LED ring light kit (CE + RoHS + FCC), RFQ-2026-0431 kraft mailer box (FSC, custom size). Thirteen emails s01–s13: a clean quote, a PDF that contradicts the body, a cropped RMB rate card from an unknown sender, a Chinese-only EXW quote with a conditional logo offer, a reply thread with a price range, an Excel sheet with relative validity, a CSV with three SKUs and payment fully in advance, a WeChat screenshot with a DDP figure mixed in, a revised quote that supersedes the Excel one, a link-only email, a typo in the RFQ code with per-1000 pricing and a spec deviation, a clarification instead of a quote, and an exact duplicate that must be caught before any Claude call.

## Part 4 — Demo flow (run it yourself in step 6, and keep it working)

1. Inquiries → New inquiry → Fill with an example (deliberately incomplete) → Check with Claude → fill the red "needed" items (price floor 1.80, lead time 35, "Made to our spec") → Check again → Continue to suppliers → Choose suppliers, tick five or six → Submit and send.
2. Wait for the banner to say replies are waiting (Claude writes them, up to two minutes) → Emails → Sync inbox and watch them arrive.
3. Open the generated replies one by one; switch between the two tabs; show the yellow marks, the missing panel and the reply draft. Also open, from the seeded inquiries: "Chinese-only reply, EXW, conditional logo", "Excel price sheet" then "Revised quotation from the same supplier", and "The same quote re-sent" (recognised as a duplicate with no Claude call).
4. Your queue: approve a reply, answer a question with a corrected value and a reason.
5. Inquiry → Compare → Run the comparison → tick a plan → Award.

## Part 5 — Presentation rules from the product owner (never undo these)

- Exactly three primary sections: Inquiries, Emails, Your queue. Evals and Guardrails stay demoted to "Reference".
- No decision-log screen and no "who decided" legend in the sidebar.
- Long AI text goes in compact, scrolling containers with smaller type. Dense text was painful to read.
- A person chooses which plan wins before Award; the AI only recommends.
- Yellow is reserved for problems in supplier text and unanswered fields. Rule, claude and human lanes each keep their own accent.
- Keep the visual identity: Saira Condensed for display, Chivo for body, IBM Plex Mono for data; both light and dark themes must stay legible.

## Part 6 — Discussed but not built (offer these as next steps)

- Real Gmail ingestion in place of the simulated inbox.
- Actually sending approved replies by email (today "send" only updates the status).
- More eval cases: scanned image-only PDFs, handwritten quotes, proforma invoices, 50-line catalogues, a forward where only the quoted history carries the RFQ code (see `ATTACHMENT_TYPES_AND_GUARDRAILS.md`).
- Exporting a comparison as a document.
- A pass-rate-over-runs view on Evals, since Claude's reads vary between runs.

## Part 7 — How to work

- Keep the three lanes honest. If you move logic between lanes, change the badge and say so.
- Run `node test/rules.test.js` before every publish; the seeded emails carry expected results that must keep passing when prompts or rules change.
- Publish by republishing the same file path so the artifact link stays stable; do not create new artifacts for routine updates.
- Commit to `main` on https://github.com/ayon-chatterjee/quote-desk with clear messages and push after each meaningful change.
