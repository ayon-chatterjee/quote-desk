# Attachment types and guardrails

The formats a supplier quotation actually arrives in, what the reader has to get out of each,
the guardrail that stops it guessing, and the eval case that proves it.
Status is what the current build does: **handled** means a sample exercises it end to end,
**to a person** means it always opens a question rather than producing a comparable quote.

| Format | Status | What must be read | Guardrail | Eval case |
|---|---|---|---|---|
| Inline text in the email body | handled | Tiers, minimum order, lead time and answers written as prose or a loose list. | Split the reply history off first, so our own earlier RFQ text is never read as the supplier's answer. | s01 clean quote, s05 reply thread with our RFQ quoted underneath. |
| Typed PDF quotation with a table | handled via transcript | Column headers, one row per quantity break, footer terms. | When the body and the document disagree, record both and stop for a person. Never silently prefer one. | s02 body says 2.45, PDF says 2.65. |
| Scanned image-only PDF | needs OCR, always to a person | Nothing without OCR. Text layer is absent. | Detect the empty text layer and route to manual entry rather than returning an empty quote. | To add: a PDF whose transcript is only [NO TEXT LAYER]. |
| Excel workbook, several sheets | handled via transcript | The quote sheet among others; merged cells and a header block above the table. | Name the sheet and cell in the evidence so a person can find the number again. | s06 single-sheet price list. |
| CSV price list | handled via transcript | One row per product, our item among several. | Split into one quote per line item and park anything that matches no open enquiry. | s07 three products in one file. |
| Photo of a printed rate card | handled via transcript | Angled shot, glare, part of the sheet outside the frame. | Keep the [CUT OFF] and [?] markers. Any value next to one drops below 0.6 confidence and opens a question. | s03 right column missing, one digit unreadable. |
| Handwritten quote on paper | always to a person | Digits that OCR confuses: 1/7, 0/6, decimal points. | Never accept a handwritten price without confirmation, whatever the confidence looks like. | To add: handwritten card with an ambiguous decimal. |
| WeChat or WhatsApp screenshot | handled via transcript | Interleaved messages from both sides, prices revised mid-conversation. | Only the supplier's own lines count as evidence. An unclear speaker caps confidence at 0.5. | s08 two speakers, a later message corrects an earlier one. |
| Product photos with prices overlaid | to a person | Price stickers or captions burned into a product image. | Treat as a photo transcript. Do not pair a price with a product unless the layout makes the pairing certain. | To add: three products, three prices, ambiguous pairing. |
| Alibaba, 1688 or Drive links | always to a person | Nothing. The page cannot be opened from here. | Record the link, mark the price as external only, and never treat the quote as comparable. | s10 prices only on a shop page. |
| ZIP or RAR archive | always to a person | Nothing until unpacked. | List the archive and ask for the contents. Do not guess from the filename. | To add: quote.zip with no body text. |
| Forwarded or replied thread | handled | Several rounds, our RFQ at the bottom, sometimes a code only in the history. | A code found only in the quoted history matches at reduced confidence and is confirmed by the product. | s05 thread; to add: a forward where only the history has the code. |
| Chinese or mixed-language email | handled | Terms of trade in Chinese, numbers in either script. | Evidence stays in the original script with an English gloss beside it, so a reviewer can check the source. | s04 Chinese-only quote with EXW terms and a conditional logo offer. |
| Proforma invoice sent instead of a quote | to a person | Looks like a quote but commits to quantities and bank details. | Classify separately. A proforma is not an offer to compare, and bank details must never be auto-extracted. | To add: a proforma with a bank account block. |
| Certificate copies attached | partly handled | Certificate name, number, issuing body, scope and expiry. | A certificate claimed in text without a number or document stays unverified and blocks award, not comparison. | s02 FDA on request only, s07 CE with no number. |
| Full catalogue, dozens of SKUs | to a person | One of fifty products may be ours, or none. | Return the best guess with its confidence and the alternatives, never a silent pick. | To add: a 50-line catalogue with two plausible matches. |

## Where the system stops for a person

Every one of these is a reason code shared by the rule lane, the reader and the review queue,
so a decision can always be traced to the check that raised it.

| Reason code | Severity | What you are asked |
|---|---|---|
| `RFQ_MATCH_LOW_CONF` | warn | Which RFQ does this email belong to? |
| `RFQ_CODE_FUZZY` | warn | The code was mistyped. Is this the right RFQ? |
| `LATE_QUOTE_CLOSED_RFQ` | warn | This RFQ is already closed. Accept the late quote? |
| `UNMATCHED_LINE_ITEM` | warn | This line item matches no open RFQ. What should happen to it? |
| `SENDER_NOT_IN_RECIPIENTS` | crit | We never sent this RFQ to this address. Trust it? |
| `DUP_QUOTE_COEXISTS` | warn | This supplier already quoted. Replace the earlier quote or keep both? |
| `CRITICAL_FIELD_MISSING` | crit | A field we need to compare on is missing. Enter it or chase the supplier? |
| `CRITICAL_FIELD_LOW_CONF` | warn | The reader was unsure about this value. Confirm or correct it. |
| `BODY_ATTACH_CONFLICT` | crit | The email and the attachment disagree. Which one counts? |
| `CURRENCY_ASSUMED` | warn | No currency was stated. We assumed US dollars. Correct? |
| `CURRENCY_CONVERTED` | info | Converted to US dollars at the pinned rate. Accept? |
| `UNIT_CONVERTED` | warn | The quote uses a different unit to the RFQ. Confirm the conversion. |
| `INCOTERM_MISMATCH` | crit | This is not a FOB China price. Normalise it or exclude the quote? |
| `TIER_INTERPOLATED` | warn | No tier covers our quantity. We used the nearest lower tier. |
| `PRICE_RANGE_ONLY` | crit | Only a price range was given. Enter a firm price or chase. |
| `MOQ_EXCEEDS_TARGET` | warn | Their minimum order is above our quantity. Negotiate or exclude? |
| `CONDITIONAL_PL` | warn | Private label is conditional. Does our order meet the condition? |
| `CERT_UNVERIFIED` | warn | A certificate was claimed with no number or document. Accept for now? |
| `CERT_MAPPING_UNCERTAIN` | warn | We could not map this certificate name confidently. Which standard is it? |
| `SPEC_DEVIATION` | crit | They offered something different to the specification. Accept the deviation? |
| `PAYMENT_RISK` | crit | These payment terms carry risk. Accept before award? |
| `PRICE_OUTLIER` | crit | This price is far from the others. Verify before trusting it. |
| `VALIDITY_EXPIRED` | warn | This quote has expired. Waive the expiry or exclude it? |
| `ATTACHMENT_TRUNCATED_CRITICAL` | crit | Part of the attachment is cut off where a needed value sits. |
| `OCR_AMBIGUOUS_CRITICAL` | crit | A digit could not be read. Enter the correct value. |
| `PRICE_EXTERNAL_ONLY` | crit | Prices are only on an external page. Someone has to fetch them. |
| `CLARIFICATION_REPLY_NEEDED` | warn | The supplier is asking us questions. Who replies? |
| `EXTRACTION_FAILED_MANUAL_ENTRY` | crit | The reader failed on this email. Enter the values by hand. |
| `COMPARISON_STALE` | warn | A quote changed after the comparison ran. Re-run it? |
| `SINGLE_CANDIDATE` | warn | Only one quote is eligible. Award without competition? |
| `WINNER_APPROVAL` | info | Approve the recommended winner? |
| `RULE_OVERRIDE_REASON` | info | Why are you overriding this rule? |
| `INJECTION_SUSPECT` | crit | This email contains text aimed at the reader. Review it. |

## Rule identifiers

Rule ids appear verbatim in the decision log, so a line in the log points at one function.

- **R01–R10** run before the reader: duplicate detection, reply-history split, enquiry code, enquiry still open,
  sender against the recipient list, revision detection, prompt byte budget, image support, injection scan, payment-risk scan.
- **V01–V13** run after the reader: output shape, evidence verification, confidence on critical fields, numeric sanity,
  currency, units, incoterm, validity, unanswered questions, cross-source conflict, unmatched line items, certificate mapping, eval scoring.
- **E00–E11** decide eligibility at comparison time: open questions, private label, certificates, price at our quantity,
  price basis, validity, minimum order, outlier, lead time, candidate count, cheapest, staleness.
