# Prompt to continue Quote Desk from another Claude account

Paste everything below the line into Claude Code on the new account, from an empty folder.

---

You are taking over an existing project called **Quote Desk**. Everything below is the full context. Start by cloning the repository, then confirm the build and tests pass, then publish your own copy of the artifact, then tell me it is ready. Do not redesign anything before you have done those four things.

## What Quote Desk is

Quote Desk is a single-page web app published as a Claude Artifact for **vFulfill**, an e-commerce sourcing company that sends requests for quotation (RFQs) to suppliers, mostly in China. Supplier replies arrive by email in every format: inline text, PDF, Excel, CSV, a cropped photo of a printed rate card, a WeChat or WhatsApp screenshot, a link to a 1688 or Alibaba page, or a reply thread with our own RFQ quoted underneath. Quote Desk:

1. lets a buyer create an inquiry, has Claude check it is complete enough for a factory to quote accurately (missing price band, thin specification, no lead time, questions worth adding), then floats it to all verified suppliers or a chosen set;
2. simulates the inbox (there is no Gmail connection yet): on submit, Claude writes one realistic supplier reply per recipient, each with a different problem deliberately planted, plus one cropped-photo reply from an unknown sender; an animated "Sync inbox" pulls them in;
3. reads each email: extracts unit price tiers, MOQ, lead time, validity, certifications, private label support, sample terms, payment terms, incoterm, freight, and answers to the RFQ's custom questions, with a verbatim evidence span for every value;
4. highlights in yellow, inside the rendered email and its attachment transcripts, the text that is wrong, ambiguous or conflicting, and lists every unanswered item in a "What's missing" panel; a "What we read" tab shows the structured result with unanswered rows in yellow;
5. drafts a follow-up email to the supplier asking only for the missing items; a person must approve before it is marked sent;
6. stops for a person on anything risky: unknown sender, currency or unit converted, body and attachment disagree, price given as a range, unreadable digit in a photo, conditional private label, spec deviation, payment fully in advance, price outlier, expired validity, certificate claimed without a number, a second quote from the same supplier, low confidence, and more;
7. on Compare, applies hard criteria by rule (private label required, all required certificates, price inside the USD FOB China band, still valid) and has Claude rank the eligible quotes as **Cheapest** (decided by arithmetic, explained by Claude), **Best value** and **Recommended winner**, with reasoning, runner-up, what to verify before award, and negotiation levers;
8. lets a person choose which plan wins and click Award.

## The three lanes: the most important design rule

Every field and decision carries a badge, and the lanes never blur:

- **rule** — deterministic JavaScript in `src/rules.js`. Owns RFQ-code matching (including typo repair), duplicate detection, quoted-history splitting, currency conversion at a pinned rate, unit conversion (per carton, per dozen, per 1000), price at the target quantity, completeness against the RFQ's question list, eligibility, outlier detection, supersession of revised quotes, staleness of a comparison, and the Cheapest lens.
- **claude** — calls made through the artifact runtime's `sample` capability on the viewer's own Claude account. Owns extraction with evidence, RFQ matching when no code is present, the readiness check on a new inquiry, generation of test replies, reply drafting, and the Best value and Recommended lenses. It never converts currency, computes a comparison price, or judges eligibility.
- **you** — the review queue and approvals. Humans override with a reason; overrides re-run the rules and mark any existing comparison stale.

## Repository

`https://github.com/ayon-chatterjee/quote-desk`

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
docs/PLAN.md        the original design plan and decisions
HANDOVER.md         human-facing handover; ONBOARDING.md, the Claude-facing guide
ATTACHMENT_TYPES_AND_GUARDRAILS.md
```

No dependencies, no bundler. Node 18 or later.

## Commands

```bash
git clone https://github.com/ayon-chatterjee/quote-desk.git && cd quote-desk
node build.js
node test/rules.test.js
python3 -m http.server 8749 --directory dist   # open http://localhost:8749/local.html
```

Without the artifact runtime the page runs in **Reference mode**: seeded and generated emails read from stored reference results, labelled as such, so every screen can be seen locally.

## Publishing

Publish `dist/quote-desk.html` as a Claude Artifact named **Quote Desk**, favicon 📦, with capabilities `sample: {}`, `db: {}`, `downloads: true`. Load the `artifact-design` and `artifact-capabilities` skills first if they are available.

- `sample` lets the page call Claude on the viewer's account; the first call asks the viewer for consent.
- `db` is shared saved state for the organisation; declaring it makes the artifact organisation-internal.
- `downloads` powers the Save buttons on attachments.
- For a link that can be shared **outside** the organisation, publish `dist/quote-desk-shareable.html` with `sample: {}` and `downloads: true` only. State then lives in the browser session and is not saved between visits. Anyone without a Claude account sees Reference mode.

Model tiers: extraction on `default` (a "Deep read" toggle forces `complex`), RFQ matching and reply drafting on `quick`, comparison always on `complex`. Cached prompts are avoided by embedding changing data; `prompt_versions` in `src/seed.js` should be bumped when a prompt changes.

## Runtime facts that shape the code

- Prompts are capped at 64 KiB; `src/prompts.js` measures bytes and clips attachments, never the body.
- The db holds at most 5,000 documents; logs are aggregated per email, never one per line.
- All date rules use `meta.demo_now`, not the real clock, so seeded expiry expectations never rot.
- Supplier email text is untrusted: rendered escaped, never with innerHTML; the prompt states it is data; instruction-like text is flagged by rule R09. Evidence spans must be verbatim substrings of the source or they are not highlighted (rule V02).
- Only the newest arriving inbox card animates; re-rendering all of them mid-sync made them flicker.

## Screens and navigation

Primary: **Inquiries** (list, New inquiry wizard in three steps: Describe, Check, Suppliers; inquiry detail with a suppliers table showing "Email sent · awaiting response", "Response received", "Follow-up sent", latest email, attachments with Save, quote, open items), **Emails** (inbox with animated sync, format filters, "Write your own email" with predefined attachment templates or a real file upload, "Read all unread"), **Your queue** (replies waiting for approval, then questions for a person). Reference group: **Evals** (each email's read against its expected result), **Guardrails** (attachment types and every reason the system stops for a person). Email view has two tabs, "Supplier's email" and "What we read", with the "What's missing" panel and the reply draft on the right. Compare shows the hard-criteria table, three lens cards with compact scrolling reasoning and a "Choose this one" radio, and an award card with a dropdown of eligible quotes.

## Presentation rules from the product owner (do not undo)

- Exactly three primary sections; Evals and Guardrails demoted to "Reference".
- No decision-log screen and no "who decided" legend in the sidebar.
- Long AI text goes in compact, scrolling containers with smaller type. The product owner found dense text painful to read.
- A person chooses which plan wins before Award; the AI only recommends.
- Yellow is reserved for problems in supplier text and unanswered fields. Rule, claude and human lanes each have their own accent.

## Seeded demo data

Three RFQs: RFQ-2026-0417 collapsible silicone bottle (FDA + LFGB, private label), RFQ-2026-0422 LED ring light kit (CE + RoHS + FCC), RFQ-2026-0431 kraft mailer box (FSC, custom size). Thirteen emails s01–s13 cover: a clean quote, a PDF that contradicts the body, a cropped RMB rate card from an unknown sender, a Chinese-only EXW quote with a conditional logo offer, a reply thread with a price range, an Excel sheet with relative validity, a CSV with three SKUs and payment fully in advance, a WeChat screenshot with a DDP figure mixed in, a revised quote that supersedes the Excel one, a link-only email, a typo in the RFQ code with per-1000 pricing and a spec deviation, a clarification instead of a quote, and an exact duplicate that must be caught before any Claude call.

## Demo flow

1. Inquiries → New inquiry → Fill with an example (deliberately incomplete) → Check with Claude → fill the red items → Check again → Continue to suppliers → choose suppliers → Submit and send.
2. Wait for the banner to say replies are waiting → Emails → Sync inbox.
3. Open the generated replies one by one; switch between the two tabs; show the missing panel and the reply draft.
4. Your queue: approve a reply, answer a question with a corrected value and a reason.
5. Inquiry → Compare → Run the comparison → tick a plan → Award.

## What was discussed but not built

Real Gmail ingestion; actually sending approved replies (today "send" only updates status); more eval cases (scanned image-only PDFs, handwritten quotes, proforma invoices, 50-line catalogues); exporting the comparison.

## Your first message back to me

Report: clone done, build size, test result, the new artifact link, and whether `sample`, `db` and `downloads` resolved in the viewer. Then ask what to work on next.
