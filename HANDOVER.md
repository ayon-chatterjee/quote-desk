# Quote Desk — handover

Quote Desk is a single-page web app, published as a Claude Artifact, that reads supplier
quotations arriving by email in any format (inline text, PDF, Excel, CSV, cropped photo of a
rate card, chat screenshot, link-only, reply thread), extracts a structured quote, shows what
each supplier failed to answer, drafts follow-up emails for a person to approve, and ranks the
eligible quotes as Cheapest, Best value and Recommended winner. A person always awards.

It was built for vFulfill's sourcing team as a demo of the data layer and winner
recommendation before a real Gmail connection exists.

## v2: multi-line RFQs (read this first if you know v1)

An RFQ can now carry many line items (`rfq.items[]`: sku, product, spec, qty, unit, its own
price band) instead of one product. Terms (certifications, private label, incoterm, lead time,
payment, validity, custom questions) live once on the RFQ; each line has its own price, MOQ and
optional lead-time override. `R.normalizeRfq` synthesises a one-line `items[]` from every
legacy RFQ, so nothing about the original single-product flow changed — `src/rules.js`'s
`validateV1`/v1 `eligibility` grouping and all 106 original tests are untouched. A second AI
output shape (`ai.sv === 2`: `terms` once + one compact row per `lines[]`) is used only for
multi-line RFQs, dispatched in `R.validate`.

New surfaces: **Supplier view** (`#/supplier`) is a simulated supplier side — pick a persona
(complete / partial / contradictory attachment / unknown sender) and a checklist of edge cases,
and `G.compose` writes a full quotation instantly, no AI, with its own reference read so the
demo works with Claude off. **Quotations** (`#/quotations/:rfqId`) is a line-by-line matrix
across suppliers with Cheapest (rule) and Best value (one Claude call over contested lines
only) side by side, a chase-and-simulated-reply loop per line, and per-line or bulk award.
Reviews can now name several lines at once ("MOQ missing on 12 lines") instead of one row per
line; resolving one closes all of them. See `docs/PLAN.md`'s second entry (or `git log`) for
the full design rationale, matching, coalescing and supplement-merge rules, and the review that
shaped them.

Known simplifications, deliberate: line matching is SKU-first with a name-similarity fallback,
not a formal trust-scored heuristic; the Supplier view composer is deterministic template logic,
not a seeded PRNG; per-line review resolution supports "accept/edit all open lines" but not a
full per-row expansion; a v2 quote's evidence can go stale if the presenter edits the generated
text by hand before sending (reference-mode confidence drops gracefully, Claude just re-reads
whatever text is there). None of these affect the demo flow below.

## Three lanes, always visible

Every field and decision carries a badge:

- **rule** — deterministic JavaScript in `src/rules.js`. Owns RFQ-code matching, duplicate
  detection, currency and unit conversion, price at target quantity, completeness against the
  RFQ's question list, eligibility (private label, certificates, price band, validity, MOQ,
  outliers) and the Cheapest lens.
- **claude** — calls made through the artifact runtime's `sample` capability on the viewer's
  own account. Owns extraction with evidence spans, RFQ matching when no code is present,
  the readiness check on a new inquiry, generation of test replies, reply drafting, and the
  Best value / Recommended lenses.
- **you** — the review queue. Anything ambiguous, converted, conflicting or risky stops for a
  person. Replies to suppliers are never sent without approval. Awarding is a human click.

The AI never converts currency, computes a comparison price or judges eligibility. The rules
never guess. Humans override with a reason.

## Files

| Path | What it is |
|---|---|
| `src/index.html` | Page shell, design tokens (light and dark), all CSS |
| `src/seed.js` | Pinned clock, FX rates, suppliers, 3 seeded RFQs, 13 seeded supplier emails with expected results, attachment templates |
| `src/rules.js` | Reason codes, pre-AI rules R01–R10, post-AI validation V01–V13, eligibility E00–E11, eval compare |
| `src/prompts.js` | Prompt builders: extract, match, compare, readiness, generate, reply. Byte budget enforced |
| `src/fallback.js` | Reference reads for the 13 seeded emails, used when Claude is unavailable and by the tests |
| `src/generator.js` | Deterministic edge-case reply generator for a new inquiry (with reference reads), readiness rules, chase items, reply-draft template |
| `src/guardrails.js` | Attachment types and guardrails reference |
| `src/pipeline.js` | Orchestration: one email through the lanes, comparison, review resolution, reply drafting, inquiry creation, supplier statuses |
| `src/app-core.js` | App state, db persistence, AI adapters (Claude or reference), file upload parsing, downloads, routing, nav |
| `src/app-views.js` | Every screen and event handler |
| `src/boot.js` | Startup |
| `build.js` | Inlines the sources into `dist/quote-desk.html` (publishable) and `dist/local.html` (local preview with charset) |
| `test/rules.test.js` | Node tests over the rule lane and the seeded emails |
| `docs/PLAN.md` | The original design plan and decisions |
| `ATTACHMENT_TYPES_AND_GUARDRAILS.md` | The attachment-type and guardrail list as a document |

## Build, test, preview

```bash
node build.js
node test/rules.test.js
python3 -m http.server 8749 --directory dist   # then open http://localhost:8749/local.html
```

Node 18 or later. No dependencies, no bundler.

## Publish as a Claude Artifact

From Claude Code on the owning account, after `node build.js`:

- publish `dist/quote-desk.html` with capabilities `sample: {}`, `db: {}`, `downloads: true`
- `sample` = calls to Claude on the viewer's account; `db` = shared saved state for the
  organisation; `downloads` = the Save buttons on attachments
- declaring `db` makes the artifact organisation-internal; for a link that works outside the
  organisation publish with `sample: {}` and `downloads: true` only (state then lives in the
  browser session and is not saved between visits)
- a page that resolves no `sample` runs in "Reference mode": the 13 seeded emails and any
  generated replies still read from stored reference results, labelled as such

Prompt to give Claude Code on the new account:

> Read HANDOVER.md. Run `node build.js` and `node test/rules.test.js`. Then publish
> `dist/quote-desk.html` as a Claude Artifact named "Quote Desk" with favicon 📦 and
> capabilities sample {}, db {}, downloads true. Give me the link.

## Runtime facts that shape the code

- Prompts are capped at 64 KiB; the extraction prompt measures bytes and clips attachments.
- Extraction runs on the default model tier (a "Deep read" toggle forces the strongest);
  RFQ matching and reply drafting on the quick tier; comparison always on the strongest.
- The store holds at most 5,000 documents; logs are aggregated per email, never one per line.
- Every date rule uses `meta.demo_now` (2026-09-10), not the real clock, so expiry
  expectations in the seed never rot.
- Supplier email text is untrusted: rendered escaped, never innerHTML; the prompt states it is
  data; instruction-like text is flagged (rule R09).

## Demo flow

1. Inquiries → New inquiry → Fill with an example (deliberately incomplete) → Check with Claude
   → fill the red items → Check again → Continue to suppliers → choose suppliers → Submit.
2. Claude writes one test reply per recipient with a different problem planted, plus a cropped
   photo from an unknown sender. Emails → Sync inbox animates their arrival.
3. Open each email: yellow marks on the problem text, "What we read" tab with unanswered rows
   in yellow, "What's missing" panel, drafted reply.
4. Your queue: approve replies, answer questions; eligibility re-runs.
5. Compare → Run the comparison → pick a plan → Award.

## Presentation rules from the product owner

- Three primary sections only: Inquiries, Emails, Your queue. Evals and Guardrails sit under a
  small "Reference" group.
- No decision-log screen and no "who decided" legend.
- Long AI text goes in compact, scrolling containers with smaller type.
- A person chooses which plan wins before Award.

## Next steps that were discussed but not built

- Real Gmail ingestion in place of the simulated inbox.
- Sending approved replies through email (today "send" only updates status).
- More eval cases: scanned PDFs, handwritten quotes, proformas, 50-line catalogues (see
  `ATTACHMENT_TYPES_AND_GUARDRAILS.md`).
