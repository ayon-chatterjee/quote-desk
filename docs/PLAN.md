# RFQ Quote Intelligence — prototype plan

## Context

Vfulfill sends RFQs (Request for Quotation) to suppliers, mostly in China. Replies arrive by email in every format: inline text, PDF, Excel, CSV, a cropped photo of a printed rate card, chat screenshots, links. Today someone reads each one by hand, re-keys prices/MOQ/certs, chases missing answers, and picks a winner.

This prototype gets the **data layer and the winner recommendation right**, with every edge case surfaced, before the real Gmail integration exists. It is a demo the product team opens from a link and shows to others. It must make obvious which decisions are made by **deterministic rules**, which by **AI**, and which need a **human**, and it must double as the seed of an eval suite.

Out of scope: real Gmail connection, sending emails to suppliers, order placement, user management.

## Your thoughts, summarized

- **Inputs**: supplier emails whose quote lives in the body or in an attachment (PDF, Excel, CSV, cropped photo of a rate card, chat screenshot, links). One email may cover several SKUs.
- **What to extract**: unit price at quantity tiers, MOQ, lead time, price validity, certifications, private label / OEM support, sample cost and time, payment terms, incoterm + port, sea vs air shipping price, off-the-shelf vs custom manufactured, photos/links supplied, and answers to any custom questions asked in that RFQ.
- **Matching**: RFQ code in the subject is the primary key. When a supplier starts a fresh thread with no code, the system must still find the right RFQ (product + which suppliers the RFQ went to) or ask a human.
- **Highlighting**: yellow marks in the rendered email show exactly what is wrong or unanswered. A perfect quote has no yellow.
- **Dashboard**: per RFQ/product, quotes stacked by supplier with price, MOQ, certs, attachments (viewable), completeness.
- **Compare**: hard filters first (private label required, target price range in USD FOB China, all required certs), then AI lenses: Cheapest, Best Value, Recommended Winner. "More details" shows full reasoning. Everything is logged.
- **Three lanes, always visible**: RULE / AI / HUMAN on every field and decision.
- **Human gates**: uncertain RFQ match, missing or conflicting critical fields, converted or assumed values, final winner approval, plus more (proposed below).
- **Demo data**: 3 RFQs, ~12 sample emails, one sample set per attachment type. No generated attachment files; attachments are represented by a transcript of what a parser/OCR would read (cut-off parts marked). Users can also compose their own supplier email and attach their own file.
- **Evals**: samples carry expected results; a separate list of attachment types and guardrails is wanted.
- **Delivery**: a Claude Artifact (hosted page), real AI calls through the viewer's Claude account, bigger models for the hard steps, shareable link. The earlier FastAPI/SQLite answers are superseded; the artifact runtime supplies both AI calls (`sample`) and storage (`db`).

## Decisions taken in this plan (flag if you disagree)

1. **Lane purity.** AI only extracts and classifies. It never converts currency, computes price-at-target-quantity, or judges eligibility. Rules do all of that. Humans override with a reason. "Cheapest" is therefore a RULE result (lowest normalized USD FOB price) that the AI only explains; Best Value and Recommended Winner are AI lenses.
2. **Model tiers.** Extraction runs on the `default` tier (12 emails at 5-60 s each on `complex` kills the demo), with a per-run "Deep extract" toggle to force `complex`. RFQ fallback matching runs on `quick`. Compare always runs on `complex`.
3. **Highlights vs. missing.** Yellow is only for text that exists but is wrong, partial, ambiguous, or conflicting (it has an evidence substring). Missing answers have no location, so they appear in a "Missing" checklist beside the body. A perfect quote has neither.
4. **Static vs. stored.** The 12 samples, the guardrails reference, and the RFQ fixtures live in the HTML. Only runtime records (loaded emails, quotes, reviews, comparisons, logs, eval runs) go to `db`. "Reset demo" wipes only seeded ids.
5. **Pinned clock.** All date rules use `meta.demo_now` (2026-09-10) so expiry expectations do not rot; a toggle switches to real time.
6. **Untrusted input.** Email text is escaped on render (never raw innerHTML) and the prompt states that everything after the email delimiter is data. Eligibility is rule-owned, so prompt injection cannot change an outcome; instruction-like text is flagged.

## Architecture

**One self-contained HTML page**, vanilla JS, no build framework. Authored as a few source files and inlined into one HTML by a tiny node script. Published with the Artifact tool declaring `capabilities: {sample: {}, db: {}}`. Declaring `db` makes the artifact org-internal: the link works for signed-in members of vfulfill's Claude org.

| Concern | How |
|---|---|
| AI calls | `sample.json(prompt, {modelTier, onText, signal})`. One email per call. Each call logs prompt bytes, tier requested, `modelTierApplied`, duration, raw text, parse result, prompt version. Consent prompt appears on the first call; calls happen only on a click, never on load. |
| Storage | `db` collections listed below; one doc per quote/review (never one big queue doc); `rev` + `updated_at` on every mutable doc; re-read before write. |
| Attachments (v1) | Transcript text embedded in the sample, rendered with `white-space: pre-wrap`; `[CUT OFF]`, `[ILLEGIBLE]`, `[?]` markers preserved. Custom composer: image → `images` option when `sample.limits()` allows it; XLSX/CSV via SheetJS and PDF text via pdf.js from cdnjs, lazy-loaded, with "paste transcript" fallback (phase 2). |
| Design | Load `artifact-design` before writing the page. Light/dark tokens; one accent each for RULE, AI, HUMAN; yellow reserved for problems in the email body. |

### Source files (workspace)

- `src/index.html` — shell, hash router, screens, lane badges, highlight renderer, AI call state machine, db access.
- `src/rules.js` — R01–R10 (pre-AI), V01–V13 (post-AI validation/normalization), E00–E11 (eligibility). Pure functions, node-testable.
- `src/prompts.js` — extraction, match, compare prompt builders with byte budgeting (`TextEncoder`, CJK is 3 bytes/char), `prompt_version`.
- `src/seed.js` — `meta`, 3 RFQs, suppliers, 12(+1) emails with transcripts and `expected` blocks.
- `src/guardrails.js` — attachment-types & guardrails reference (rendered as a page; also exported as `ATTACHMENT_TYPES_AND_GUARDRAILS.md`).
- `build.js` — inlines `src/*.js` into `dist/rfq-quote-intel.html`.
- `test/rules.test.js` — node assertions running the rules over the seed fixtures.

### Extraction schema (AI output)

Field record `F = {v, u, c, ev, src}`: value, unit as written, confidence 0–1, verbatim evidence substring (≤120 chars, from new body or a named attachment, never from quoted history), source `"body"` or `"att:<file>"`. The page stamps `lane: "ai"`; rule-derived values go in a sibling `norm` object; human edits in `overrides`.

```
{ sv, kind: quote|revision|clarification|decline|ack|other, lang[],
  rfq: {code|null, how: subject|body|quoted|inferred|none, c, ev, alts[]},
  supplier: {name F, person F, role: factory|trading|unknown},
  items: [{ i, product F, rfq_code|null, c,
    f: { price_tiers F([{qmin,qmax,p}]), price_range F, currency F, price_basis F({incoterm,place,incl_tax,incl_pack,incl_freight}),
         moq F({n,u,pack}), lead_time F({lo,hi,u,from}), validity F({until}|{days}),
         certs F([{name,canon,scope,doc}]), private_label F({ans: yes|no|conditional, cond}), oem_odm F, stock_type F,
         sample F({cost,cur,days,refundable}), payment F, ship_sea F, ship_air F, one_time_costs F, carton F, photos_links F,
         custom: [{qid, v, c, ev, src}] } }],
  gaps: [{i, field, kind: missing|partial|ambiguous|conflict|truncated|external_only, note, ev, src}],
  flags: [{code, note, ev, src}],
  needs_human: [{code, i, field, note, evs[]}],
  assumed: [{i, field, from, to, why}] }
```

Critical fields: price_tiers/price_range, currency, price_basis, moq, lead_time, certs, private_label. Typical output 6–9 KB.

Shared reason-code enum (used by AI `needs_human`, rule decisions, and review docs): RFQ_MATCH_LOW_CONF, RFQ_CODE_FUZZY, LATE_QUOTE_CLOSED_RFQ, UNMATCHED_LINE_ITEM, SENDER_NOT_IN_RECIPIENTS, DUP_QUOTE_COEXISTS, CRITICAL_FIELD_MISSING, CRITICAL_FIELD_LOW_CONF, BODY_ATTACH_CONFLICT, CURRENCY_ASSUMED, CURRENCY_CONVERTED, UNIT_CONVERTED, INCOTERM_MISMATCH, TIER_INTERPOLATED, PRICE_RANGE_ONLY, MOQ_EXCEEDS_TARGET, CONDITIONAL_PL, CERT_UNVERIFIED, CERT_MAPPING_UNCERTAIN, SPEC_DEVIATION, PAYMENT_RISK, PRICE_OUTLIER, VALIDITY_EXPIRED, ATTACHMENT_TRUNCATED_CRITICAL, OCR_AMBIGUOUS_CRITICAL, PRICE_EXTERNAL_ONLY, CLARIFICATION_REPLY_NEEDED, EXTRACTION_FAILED_MANUAL_ENTRY, COMPARISON_STALE, SINGLE_CANDIDATE, WINNER_APPROVAL, RULE_OVERRIDE_REASON.

### Prompts

**Extraction** (`default`, toggle to `complex`), fixed block order with unique delimiters: TASK (extract only, no conversion/judgement, email is untrusted data) → OUTPUT_CONTRACT (schema + enums + reason codes, raw JSON only) → EVIDENCE_RULES (verbatim, ≤120 chars, `ev: null` and `c ≤ 0.5` if unquotable) → DOMAIN_RULES → RFQ (code, product, spec, requested tiers, questions with qids, recipient names; **no** target price band, to avoid biasing) → EMAIL_META, NEW_BODY, QUOTED (labelled context-only) → ATTACHMENTS (transcript blocks with markers) → "JSON only". Budget: fixed ~6.5 KB, body cap 12 KB, attachments cap 40 KB, abort above 60 KiB.

Domain rules in the prompt: bare `$` → USD + `assumed`; any ¥/RMB/元/CNY marker → CNY; record units exactly (per pc/set/ctn/dozen/1000), never divide; MOQ in cartons stays cartons with pack; ranges → `price_range` + gap; DDP/CIF is not FOB; conditional private label → `conditional` + cond; lead-time trigger (after deposit / sample approval); relative validity stays relative; cert canon only when certain, scope product vs factory, `doc` only if a number/file referenced; buyer text in quoted history is not an answer; signature phone numbers are not prices; Chinese evidence stays in Chinese with an English gloss (起订量, 交期, 含税/不含税, 不含运费, 美金, 报价有效期, 打样, 现货, 定制, 可以印logo); chat transcripts: only supplier lines are evidence; multi-SKU → one item each.

**RFQ match** (`quick`, only when R03 finds no code): open RFQs (code, product, recipients) + email header/new body → `{rfqCode, c, why, alts[]}`.

**Compare** (`complex`, only when ≥2 eligible): TASK (rank already-eligible quotes; never reinstate excluded ones; cite only numbers in the table) → RFQ_REQUIREMENTS → ELIGIBLE_QUOTES (one compact rule-normalized row each, `usd_fob_at_target` already computed) → RULES_LOG (exclusions, overrides with reasons, `cheapest` id) → LENS_DEFS → OUTPUT `{cheapest:{id,why}, best_value:{id,why,tradeoffs[]}, recommended:{id,c,why,runner_up,verify_before_award[],negotiate[],risks[]}, per_quote:[{id,strengths[],weaknesses[]}], questions_for_buyer[]}`. Rules validate that ids come from the table. Single candidate → forced "insufficient competition" wording; 0 eligible → no AI call.

Caching: prompts embed `prompt_version`; "Re-extract (fresh)" appends a nonce; otherwise the platform's 5-minute cache makes demo re-runs free.

### RULE lane (ids used in logs and UI)

Pre-AI: R01 dedupe (hash of from+subject+new body) · R02 quoted-history split (`On … wrote:`, `-----Original Message-----`, `发件人:`, `>` lines) · R03 RFQ code regex with O→0 and separator tolerance → CODE_EXACT / CODE_FUZZY (gate) / CODE_IN_QUOTED_ONLY / CODE_NONE · R04 RFQ open vs closed (LATE_QUOTE gate) · R05 sender domain vs recipients → KNOWN / KNOWN_OTHER_RFQ / UNKNOWN (gate) · R06 revision detection (`revis|updat|correct|new price|更新|修改`) → AUTO_SUPERSEDE / COEXIST (gate) / FIRST_QUOTE · R07 prompt byte budget · R08 image support check · R09 injection scan · R10 payment-risk regex (100% advance, Western Union, personal account).

Post-AI: V01 shape validation (fail → EXTRACTION_FAILED_MANUAL_ENTRY, no auto retry) · V02 evidence check (`indexOf` → EV_OK; whitespace-insensitive → EV_APPROX, c×0.8, no highlight; else EV_MISSING, c×0.5) · V03 critical-field confidence < 0.7 → gate · V04 numeric sanity (tiers monotonic, MOQ ≤ first tier, lead lo ≤ hi) · V05 currency: CNY → USD at pinned rate (gate CURRENCY_CONVERTED), bare `$` → ASSUMED_USD badge · V06 unit conversion to per-piece when pack known (gate), else GAP_PACK_QTY · V07 incoterm: FOB/FCA China ok, else INCOTERM_MISMATCH gate · V08 validity: absolute / derived from email date / missing · V09 gaps vs RFQ question list (rules own the final gap list; AI gaps are advisory) · V10 conflict across sources → gate · V11 items with null rfq_code → UNMATCHED_LINE_ITEM · V12 cert canon uncertain → gate; `doc:false` → CERT_UNVERIFIED badge · V13 eval compare against `expected` with tolerance (price ±0.01, cert sets as sets) requiring value match **and** verified evidence.

Eligibility on Compare: E00 open gates → BLOCKED_PENDING_REVIEW · E01 private label pass / pass-conditional / fail · E02 required certs ⊆ product-scope canon certs · E03 price at target qty from bracketing tier (else TIER_INTERPOLATED gate; range → PRICE_UNDETERMINED) vs band → BAND_PASS / FAIL_HIGH / PASS_LOW · E04 basis FOB China unless human-normalized · E05 validity vs demo_now · E06 MOQ ≤ target (soft gate) · E07 outlier < 0.6× or > 2× median (gate) · E08 lead time > RFQ max (soft flag) · E09 count: 0 → NO_CANDIDATES, 1 → SINGLE_CANDIDATE gate, ≥2 → run AI · E10 CHEAPEST = argmin · E11 staleness: any quote updated after comparison → STALE.

### Human-in-the-loop gates

Agreed: uncertain RFQ match · critical field missing or conflicting · converted or assumed value · final winner approval.

Added: fuzzy/typo'd RFQ code · quote for a closed RFQ · sender domain not in recipient list · second quote from same supplier without revision language · OCR digit ambiguity on a critical field · attachment truncated where a critical field sits · price behind an external link only · MOQ far above target (negotiate vs exclude) · validity expired (waive vs exclude) · cert claimed without document · cert name mapping uncertain · conditional private label · spec deviation offered · risky payment terms · price outlier · clarification request needing a reply · extraction failed → manual entry · comparison stale after a human edit · single eligible candidate · any rule override requires a reason.

Every review doc shows evidence, the AI proposal, and Accept / Edit / Reject. Resolving writes an `override` on the quote, re-runs V05–V12 and eligibility, and marks any existing comparison stale.

### db layout (~90 docs for the demo, cap is 5,000)

- `meta/config`: `{demo_now, fx:{CNY:7.15,date}, prompt_versions, thresholds, seeded_at, schema_v}`.
- `rfqs/{id}`: code, product, spec_summary, target_qty, target_usd_fob{lo,hi}, required_certs[], pl_required, custom_required, max_lead_days, dest_port, custom_questions[{qid,text,required}], recipients[{supplier_id,name,domains[]}], status, winner_quote_id.
- `suppliers/{id}`: name, domains[], city, role.
- `emails/{id}`: sample_id|null, from, to, date, subject, body_raw, body_new, body_quoted, attachments[{name,type,transcript,truncated}], hash, thread_id, status, pre_rules[], rfq_match, kind. Raw text kept here, not in quotes.
- `quotes/{id}` (one per item): email_id, rfq_id, supplier_id, item_index, ai{…}, norm{…each with {v, rule, inputs}}, overrides{field:{v,by,at,reason}}, gaps_final[], eligibility{status, checks[]}, supersedes/superseded_by, prompt_version, prompt_bytes, model_tier, duration_ms, updated_at, rev, eval{}.
- `reviews/{id}`: quote_id|email_id, rfq_id, code, field, proposed, options[], status, resolution{value,by,at,reason}, rev. One doc per gate.
- `comparisons/{rfq_id}_{ts}`: input_quote_ids[], input_hash, rules_log[], eligible[], excluded[{id,reason}], cheapest_rule, ai{lenses, raw}, prompt_bytes, model_tier, duration_ms, status running|done|failed|stale, approval{}.
- `logs/{email_id}`, `logs/{comparison_id}`: `{entries[{t,lane,step,decision,detail}] (cap 200), count}`; `logs/_daily_{date}` counters. Never one doc per log line.
- `evals/{sample_id}`: `{runs[{at, prompt_version, fields{pass|fail}, gates{}, pass_rate}]}` cap 20; UI shows pass rate over runs.

### Screens (hash-routed)

1. **Sample Lab** (landing). Left: samples grouped by RFQ, each tagged with attachment type and edge cases. Right: attachment-type filter (Inline text, PDF, Excel, CSV, Cropped photo, Chat screenshot, Link only, Reply thread, Chinese-only). Buttons: **Add sample**, **Compose own supplier email** (from, subject, body, optional file). Settings: Deep extract toggle, demo clock, Reset demo.
2. **Email preview**: From/To/Subject/date, body, attachment chips (open transcript or image). **Next**.
3. **Processing**: stepper with lane badges: RULE pre-checks → AI match (if needed) → AI extract (Thinking… with elapsed timer and Stop; collapsible raw stream) → RULE validate/normalize → RULE gaps → gates opened. Result: body re-rendered with yellow marks (hover shows reason and lane), attachment transcript view with its own marks, "Missing" checklist, eval strip (expected vs actual, per field). No yellow when perfect.
4. **RFQ dashboard**: cards per RFQ; quotes stacked per supplier with tiers, MOQ, lead, certs (verified/unverified), private label, attachments, completeness bar, status chip (eligible / needs review / disqualified / awaiting / superseded), lane badge per field. **Compare**.
5. **Compare**: criteria panel with per-quote pass/fail per rule → eligible set → Cheapest (RULE) + Best Value + Recommended Winner (AI) with reasoning → **More details** (per-quote strengths/weaknesses, verify-before-award, negotiation levers, rules log, tier applied, timings) → **Award** (writes approval, sets RFQ winner).
6. **Review queue**: open gates across RFQs; Accept / Edit / Reject with reason.
7. **Logs**: every AI call and rule decision, filter by email/RFQ/lane.
8. **Attachment types & guardrails**: the reference list (also `ATTACHMENT_TYPES_AND_GUARDRAILS.md`).

### Seed matrix (demo_now = 2026-09-10)

RFQs (USD FOB China): **RFQ-2026-0417** collapsible silicone bottle 550 ml, PL required, 3,000 pcs, $2.10–2.60, FDA + LFGB, ≤35 d, Qs: Pantone match, carton dims, colors per order. **RFQ-2026-0422** LED ring light 10" + tripod + remote, PL required, 1,000 sets, $6.50–8.00, CE + RoHS + FCC, ≤30 d, Qs: battery vs USB, sea and air freight to Nhava Sheva. **RFQ-2026-0431** kraft mailer box custom size 1-color, custom required, 10,000 pcs, $0.28–0.36, FSC, ≤30 d, Qs: pcs per bundle, artwork format.

| # | RFQ | Supplier | Format | Edge cases | Expected |
|---|---|---|---|---|---|
| s01 | 0417 | Shenzhen SiliTech | inline | perfect quote, code in subject | eligible, 0 gaps, 0 yellow, 0 gates |
| s02 | 0417 | Dongguan Homeware | PDF transcript | body $2.45 vs PDF $2.65; PDF lists FDA only | BODY_ATTACH_CONFLICT → CERT_FAIL(LFGB) → disqualified |
| s03 | 0417 | Yiwu Trading (163.com) | cropped rate-card photo | no code, RMB, `¥15.[?]0`, MOQ 50 ctn×40, right column cut off, unknown sender | RFQ match c≈0.85, SENDER_NOT_IN_RECIPIENTS, CURRENCY_CONVERTED, UNIT_CONVERTED, OCR_AMBIGUOUS; LFGB missing → disqualified |
| s04 | 0417 | Ningbo Bottleworks | inline, Chinese only | code in body, 3000个以上可以印logo, EXW宁波 含税, 定金后25天 | CONDITIONAL_PL (passes), INCOTERM_MISMATCH; human adds inland freight → eligible $2.28 |
| s05 | 0417 | Xiamen Outdoor | reply thread w/ quoted RFQ | "$2.3–2.6 depending on color", no lead time/sample/validity, q2 unanswered | PRICE_RANGE_ONLY; gaps; yellow on range sentence only |
| s06 | 0422 | Shenzhen Lumi | XLSX transcript | clean, "valid 15 days" relative, sea+air given | eligible; later superseded by s09 |
| s07 | 0422 | Guangzhou Bright Trading | CSV, multi-SKU | 3 SKUs, one code; $6.10 below band; CE only; 100% TT before production | 1 quote + 2 UNMATCHED_LINE_ITEM; PAYMENT_RISK, PRICE_OUTLIER; CERT_FAIL |
| s08 | 0422 | Huizhou Optic | WeChat screenshot | two speakers, "$7.8/set incl tripod", DDP Delhi second figure, no validity, MOQ 300 | UNIT_CONVERTED (set = unit), INCOTERM_MISMATCH on DDP only; eligible after review |
| s09 | 0422 | Shenzhen Lumi | inline | "Revised quotation $6.95, valid 10 days" | AUTO_SUPERSEDE(s06); COMPARISON_STALE if compared already |
| s10 | 0431 | Dongguan PackPro | link only | "see prices on our 1688 page" | PRICE_EXTERNAL_ONLY; not eligible |
| s11 | 0431 | Qingdao Paper | inline | subject "RFQ 2026-O431", "$310 per 1000 pcs", MOQ 20,000, 35 d, stock sizes only | RFQ_CODE_FUZZY, UNIT_CONVERTED ($0.31), MOQ_EXCEEDS_TARGET, SPEC_DEVIATION, LEAD_FLAG |
| s12 | 0431 | Shanghai Print Pack | inline | asks for artwork before quoting | kind = clarification; CLARIFICATION_REPLY_NEEDED; RFQ shows "awaiting" |
| s13 | 0417 | SiliTech re-send | inline | exact duplicate of s01 | DUPLICATE(s01), no AI call |

Compare expectations: 0417 → 1 eligible before reviews (SINGLE_CANDIDATE), 2 after (s01, s04). 0422 → 2 eligible (s09, s08): Cheapest s09 by rule; Best Value / Recommended may diverge (s08 lower MOQ, faster lead). 0431 → 0 eligible → NO_CANDIDATES, no AI call.

Each sample's `expected`: `{rfq_code, kind, fields{price_at_target_usd, moq_pcs, lead_lo, lead_hi, incoterm, currency, certs_canon[], pl}, gaps[], gates[], eligibility_before_review, eligibility_after_review}`.

### Attachment types & guardrails reference (page + markdown)

Inline text · typed PDF with tables · scanned image-only PDF (OCR) · XLSX (multi-sheet, merged cells) · CSV · DOCX · photo of printed rate card (cropped, skewed, glare) · handwritten quote photo · WhatsApp/WeChat screenshot (speaker attribution) · product photos with prices overlaid · Alibaba/1688/Drive links (unfetchable) · zip · forward/reply thread with quoted history · Chinese/English mixed · proforma invoice instead of quote · certificate copies (verify names vs claims) · catalogue with 50 SKUs. For each: what the AI must understand, the guardrail, the eval case, and whether v1 handles it (transcript), phase 2 handles it (upload), or it always goes to a human.

## Build order (each step demoable)

1. Load `artifact-design`. Shell, router, tokens, lane badges, nav, settings. `build.js`. Publish with `{sample:{}, db:{}}`; confirm `claude.use("sample")` and `use("db")` resolve in the viewer.
2. `seed.js`: meta, 3 RFQs, suppliers, 13 emails with transcripts and `expected`. Sample Lab + Email preview + Compose (text only).
3. `rules.js` R01–R10, V01–V13, E00–E11 + `test/rules.test.js` over the fixtures.
4. `prompts.js` + AI call state machine (permission → thinking → streaming → validating → done/failed/cancelled) + highlight renderer + Missing checklist + eval strip. Processing screen. db writes for emails, quotes, logs, evals.
5. RFQ dashboard with stacked quotes, supersede handling.
6. Compare: eligibility panel, Cheapest rule, AI lenses, More details, Award; comparisons doc; staleness.
7. Review queue with re-run on resolve; Logs screen.
8. Guardrails page + `ATTACHMENT_TYPES_AND_GUARDRAILS.md`.
9. Phase 2 if time: own-file attachments (image via `images`, SheetJS, pdf.js with paste-transcript fallback); follow-up email draft for gaps.

## Verification

- In the viewer: `sample` and `db` resolve; first AI call shows the consent prompt once; denying it leaves the page usable in RULE-only mode with a visible "not AI-extracted" badge.
- `node test/rules.test.js` passes on all fixtures (dedupe, code regex incl. fuzzy, quoted split, currency/unit conversion, gaps, eligibility, outlier, staleness).
- Run all 13 samples end to end; each lands in its expected status and gates; eval strip green on key fields; s01 shows zero yellow; s13 makes no AI call.
- Compare on each RFQ behaves per the expectations above; Award writes approval and RFQ winner; editing a quote afterwards marks the comparison stale.
- Resolve one review (s04 inland freight) and confirm eligibility re-runs and the quote becomes eligible.
- Reload: data persists; open as a second org member and see the same state.
- Logs show one entry per AI call with `modelTierApplied`, bytes, and duration.
- Cancel a long call: partial state discarded, no orphan docs. Oversized prompt (paste 70 KB body) is refused with a clear message.
