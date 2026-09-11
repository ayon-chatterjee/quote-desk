/* RFQ Quote Intelligence — deterministic rule lane.
   Pure functions. No DOM, no network. Shared by the page and the node tests.
   v2 adds multi-line RFQs (rfq.items[]), line matching, coalesced reviews and supplement merging,
   while every v1 (single AI shape, sv !== 2) code path below is untouched byte-for-byte so the
   original 106 assertions keep passing unchanged. */
(function (root) {
'use strict';

/* ---- reason codes --------------------------------------------------- */

var REASONS = {
  RFQ_MATCH_LOW_CONF:          { sev: 'warn', q: 'Which RFQ does this email belong to?' },
  RFQ_CODE_FUZZY:              { sev: 'warn', q: 'The code was mistyped. Is this the right RFQ?' },
  LATE_QUOTE_CLOSED_RFQ:       { sev: 'warn', q: 'This RFQ is already closed. Accept the late quote?' },
  UNMATCHED_LINE_ITEM:         { sev: 'warn', q: 'This line item matches no open RFQ. What should happen to it?' },
  SENDER_NOT_IN_RECIPIENTS:    { sev: 'crit', q: 'We never sent this RFQ to this address. Trust it?' },
  DUP_QUOTE_COEXISTS:          { sev: 'warn', q: 'This supplier already quoted. Replace the earlier quote or keep both?' },
  CRITICAL_FIELD_MISSING:      { sev: 'crit', q: 'A field we need to compare on is missing. Enter it or chase the supplier?' },
  CRITICAL_FIELD_LOW_CONF:     { sev: 'warn', q: 'The reader was unsure about this value. Confirm or correct it.' },
  BODY_ATTACH_CONFLICT:        { sev: 'crit', q: 'The email and the attachment disagree. Which one counts?' },
  CURRENCY_ASSUMED:            { sev: 'warn', q: 'No currency was stated. We assumed US dollars. Correct?' },
  CURRENCY_CONVERTED:          { sev: 'info', q: 'Converted to US dollars at the pinned rate. Accept?' },
  UNIT_CONVERTED:              { sev: 'warn', q: 'The quote uses a different unit to the RFQ. Confirm the conversion.' },
  INCOTERM_MISMATCH:           { sev: 'crit', q: 'This is not a FOB China price. Normalise it or exclude the quote?' },
  TIER_INTERPOLATED:           { sev: 'warn', q: 'No tier covers our quantity. We used the nearest lower tier.' },
  PRICE_RANGE_ONLY:            { sev: 'crit', q: 'Only a price range was given. Enter a firm price or chase.' },
  MOQ_EXCEEDS_TARGET:          { sev: 'warn', q: 'Their minimum order is above our quantity. Negotiate or exclude?' },
  CONDITIONAL_PL:              { sev: 'warn', q: 'Private label is conditional. Does our order meet the condition?' },
  CERT_UNVERIFIED:             { sev: 'warn', q: 'A certificate was claimed with no number or document. Accept for now?' },
  CERT_MAPPING_UNCERTAIN:      { sev: 'warn', q: 'We could not map this certificate name confidently. Which standard is it?' },
  SPEC_DEVIATION:              { sev: 'crit', q: 'They offered something different to the specification. Accept the deviation?' },
  PAYMENT_RISK:                { sev: 'crit', q: 'These payment terms carry risk. Accept before award?' },
  PRICE_OUTLIER:               { sev: 'crit', q: 'This price is far from the others. Verify before trusting it.' },
  VALIDITY_EXPIRED:            { sev: 'warn', q: 'This quote has expired. Waive the expiry or exclude it?' },
  ATTACHMENT_TRUNCATED_CRITICAL:{ sev: 'crit', q: 'Part of the attachment is cut off where a needed value sits.' },
  OCR_AMBIGUOUS_CRITICAL:      { sev: 'crit', q: 'A digit could not be read. Enter the correct value.' },
  PRICE_EXTERNAL_ONLY:         { sev: 'crit', q: 'Prices are only on an external page. Someone has to fetch them.' },
  CLARIFICATION_REPLY_NEEDED:  { sev: 'warn', q: 'The supplier is asking us questions. Who replies?' },
  EXTRACTION_FAILED_MANUAL_ENTRY:{ sev: 'crit', q: 'The reader failed on this email. Enter the values by hand.' },
  COMPARISON_STALE:            { sev: 'warn', q: 'A quote changed after the comparison ran. Re-run it?' },
  SINGLE_CANDIDATE:            { sev: 'warn', q: 'Only one quote is eligible. Award without competition?' },
  WINNER_APPROVAL:             { sev: 'info', q: 'Approve the recommended winner?' },
  RULE_OVERRIDE_REASON:        { sev: 'info', q: 'Why are you overriding this rule?' },
  INJECTION_SUSPECT:           { sev: 'crit', q: 'This email contains text aimed at the reader. Review it.' },
  /* v2: multi-line */
  LINES_NOT_QUOTED:            { sev: 'warn', q: 'Some of our lines were not quoted. Chase them or compare on what was quoted?' },
  LINE_MATCH_LOW_CONF:         { sev: 'warn', q: 'This row was matched to one of our lines by guesswork. Is the match right?' },
  DUP_LINE:                    { sev: 'warn', q: 'Two rows in this quote claim the same line. Which one counts?' },
  LINE_COVERS_MULTIPLE:        { sev: 'warn', q: 'One row covers several of our SKUs at one price. Split it or keep combined?' },
  SUPPLEMENT_CONFLICT:         { sev: 'crit', q: 'Their follow-up gives a different value to the one already on file. Which counts?' },
  NO_RESPONSE:                 { sev: 'warn', q: 'We asked and nothing came back. Chase again, exclude, or wait?' }
};

var CRITICAL_FIELDS = ['price_tiers', 'currency', 'price_basis', 'moq', 'lead_time', 'certs', 'private_label'];

/* v2: which of the "terms" fields are asked once per RFQ rather than once per line. */
var TERM_FIELDS = ['currency', 'price_basis', 'lead_time', 'validity', 'payment', 'certs', 'private_label', 'sample', 'stock_type'];

var FIELD_LABELS = {
  price_tiers: 'Unit price', price_range: 'Price range', currency: 'Currency',
  price_basis: 'Incoterm and place', moq: 'Minimum order', lead_time: 'Lead time',
  validity: 'Quote validity', certs: 'Certifications', private_label: 'Private label',
  oem_odm: 'OEM / ODM', stock_type: 'Stock or custom', sample: 'Sample terms',
  payment: 'Payment terms', ship_sea: 'Sea freight', ship_air: 'Air freight',
  one_time_costs: 'Tooling and one-off costs', carton: 'Carton details', photos_links: 'Photos and links'
};

var CERT_CANON = {
  CE: ['ce', 'ce mark', 'ce certified', 'ce marking', 'emc', 'lvd'],
  RoHS: ['rohs', 'rohs2', 'rohs 2.0'],
  FCC: ['fcc', 'fcc id', 'fcc part 15'],
  FDA: ['fda', 'fda 21 cfr', '21cfr', 'food and drug administration'],
  LFGB: ['lfgb', 'lfbg', 'german lfgb'],
  FSC: ['fsc', 'forest stewardship', 'fsc coc', 'chain of custody'],
  BIS: ['bis', 'isi', 'bis registration'],
  ISO9001: ['iso9001', 'iso 9001'],
  BSCI: ['bsci', 'sedex', 'smeta'],
  REACH: ['reach'],
  EN71: ['en71', 'en 71'],
  UL: ['ul', 'ul listed'],
  GOTS: ['gots'],
  OEKOTEX: ['oeko-tex', 'oekotex', 'oeko tex']
};

var FACTORY_SCOPE = { ISO9001: 1, BSCI: 1 };

/* ---- small helpers -------------------------------------------------- */

function byteLen(s) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s || '').length;
  return Buffer.byteLength(s || '', 'utf8');
}
function normText(s) { return (s || '').normalize ? (s || '').normalize('NFC') : (s || ''); }
function hash(s) {
  var h = 5381, i;
  for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
function round2(v) { return v == null ? null : Math.round(v * 100) / 100; }
function round4(v) { return v == null ? null : Math.round(v * 10000) / 10000; }
function median(a) {
  var s = a.slice().sort(function (x, y) { return x - y; });
  if (!s.length) return null;
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function dayjs(d) { return new Date(d + (d.length === 10 ? 'T00:00:00Z' : '')); }
function addDays(iso, n) {
  var d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function domainOf(addr) {
  var m = /@([^\s>]+)/.exec(addr || '');
  return m ? m[1].toLowerCase() : '';
}
function uniq(a) { var o = {}, r = []; a.forEach(function (x) { if (!o[x]) { o[x] = 1; r.push(x); } }); return r; }

function dec(rule, decision, detail, extra) {
  var d = { rule: rule, decision: decision, detail: detail || '', lane: 'rule' };
  if (extra) Object.keys(extra).forEach(function (k) { d[k] = extra[k]; });
  return d;
}
function gate(code, opts) {
  opts = opts || {};
  return {
    code: code,
    severity: (REASONS[code] || {}).sev || 'warn',
    question: opts.question || (REASONS[code] || {}).q || code,
    field: opts.field || null,
    item: opts.item == null ? null : opts.item,
    /* v2: a coalesced gate carries scope + one entry per affected line instead of a single item/quote */
    scope: opts.scope || null,                 /* 'email' | 'terms' | 'lines' | null (v1 per-quote gate) */
    lines: opts.lines || null,                 /* [{line, quote_id, proposed, evidence, status, resolution}] */
    note: opts.note || '',
    evidence: opts.evidence || [],
    proposed: opts.proposed === undefined ? null : opts.proposed,
    options: opts.options || null,
    raised_by: opts.raised_by || 'rule'
  };
}

/* ==== v2: RFQ NORMALISATION ============================================ */

/* Every RFQ, however it was authored, gets an items[] array. A legacy single-product
   RFQ (rfq.product / rfq.target_qty / rfq.target_usd_fob at the top level) is given one
   item that mirrors those fields exactly, so every rule below can read (rfq, item) and
   the original single-line RFQs behave identically to before. */
function normalizeRfq(rfq) {
  if (!rfq) return rfq;
  if (!Array.isArray(rfq.items) || !rfq.items.length) {
    rfq.items = [{
      line: 1,
      sku: rfq.sku || (rfq.id ? String(rfq.id).toUpperCase() : 'L01'),
      product: rfq.product || 'Item',
      spec: rfq.spec_summary || '',
      qty: rfq.target_qty || 0,
      unit: rfq.unit || 'pc',
      target_usd_fob: rfq.target_usd_fob || { lo: 0, hi: 0 },
      tier_qtys: rfq.tier_qtys || []
    }];
  }
  rfq.items.forEach(function (it, i) {
    if (it.line == null) it.line = i + 1;
    else it.line = parseInt(it.line, 10);
    if (!it.sku) it.sku = 'L' + ('0' + it.line).slice(-2);
    if (!it.unit) it.unit = rfq.unit || 'pc';
    if (!it.target_usd_fob) it.target_usd_fob = { lo: 0, hi: 0 };
    if (!it.tier_qtys) it.tier_qtys = [];
  });
  return rfq;
}
function rfqItems(rfq) { return normalizeRfq(rfq).items; }

/* Resolve which RFQ line a quote belongs to. Single-line RFQs always resolve to items[0],
   which is exactly the legacy behaviour (there was only ever one number to compare against). */
function rfqItemFor(rfq, q) {
  var items = rfqItems(rfq);
  if (items.length <= 1) return items[0] || null;
  if (q.sku) {
    var bySku = items.filter(function (it) { return it.sku === q.sku; })[0];
    if (bySku) return bySku;
  }
  var line = q.line != null ? q.line : q.item_index;
  var byLine = items.filter(function (it) { return it.line === line; })[0];
  /* Unlike the single-line case, a multi-line RFQ never falls back to item 1 for a quote
     that matched nothing — that would silently score an unrelated line against line 1's
     price band. No match here means "not part of any of our lines". */
  return byLine || null;
}

/* ---- R02 quoted-history split --------------------------------------- */

var QUOTE_MARKERS = [
  /^On .+ wrote:\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/mi,
  /^_{5,}\s*$/m,
  /^From:\s.+$/m,
  /^发件人[:：]\s?.*$/m,
  /^在\s?.+\s?写道[:：]\s*$/m
];

function splitQuoted(body) {
  var text = normText(body || ''), idx = -1;
  QUOTE_MARKERS.forEach(function (re) {
    var m = re.exec(text);
    if (m && (idx === -1 || m.index < idx)) idx = m.index;
  });
  if (idx === -1) {
    var lines = text.split('\n'), first = -1;
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*>/.test(lines[i])) { first = i; break; }
    }
    if (first > -1) {
      return { new_: lines.slice(0, first).join('\n').replace(/\s+$/, ''), quoted: lines.slice(first).join('\n') };
    }
    return { new_: text, quoted: '' };
  }
  return { new_: text.slice(0, idx).replace(/\s+$/, ''), quoted: text.slice(idx) };
}

/* ---- R03 RFQ code --------------------------------------------------- */

var CODE_RE = /RFQ[\s_\-]?([0-9OoIl]{4})[\s_\-]?([0-9OoIl]{3,4})/g;

function unfuzz(s) {
  return s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
}
function findCodes(text) {
  var out = [], m;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(text)) !== null) {
    var raw = m[0];
    var code = 'RFQ-' + unfuzz(m[1]) + '-' + unfuzz(m[2]);
    out.push({ code: code, raw: raw, fuzzy: unfuzz(raw.toUpperCase()).replace(/[\s_]/g, '-') !== raw.toUpperCase().replace(/[\s_]/g, '-') || !/^RFQ-\d{4}-\d{3,4}$/.test(raw.toUpperCase()) });
  }
  return out;
}

/* ---- v2: SKU / line matching ----------------------------------------- */

function normSku(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/* Plain Levenshtein edit distance, small strings only (SKUs), no need for anything fancier. */
function editDistance(a, b) {
  var m = a.length, n = b.length, i, j;
  if (!m) return n; if (!n) return m;
  var row = [];
  for (j = 0; j <= n; j++) row[j] = j;
  for (i = 1; i <= m; i++) {
    var prev = row[0]; row[0] = i;
    for (j = 1; j <= n; j++) {
      var tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}

var STOPWORDS = { the: 1, a: 1, an: 1, and: 1, with: 1, for: 1, of: 1, our: 1, your: 1 };
function tokenize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (t) { return t && !STOPWORDS[t]; });
}
/* Dice coefficient over token sets; numbers and units (they usually carry the discriminating detail,
   e.g. "550ml" vs "750ml") are kept as ordinary tokens. */
function diceSimilarity(a, b) {
  var ta = tokenize(a), tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  var setB = {}; tb.forEach(function (t) { setB[t] = (setB[t] || 0) + 1; });
  var hits = 0;
  ta.forEach(function (t) { if (setB[t] > 0) { hits++; setB[t]--; } });
  return (2 * hits) / (ta.length + tb.length);
}

/* Greedy one-to-one match of AI-reported lines against this RFQ's items.
   Tries, in order: exact SKU -> unfuzzed SKU -> SKU within edit distance 1 -> the line
   number the supplier printed -> product-name similarity. First hit wins; every RFQ item
   can be claimed by at most one AI line (the higher-confidence claim wins, the loser is
   flagged DUP_LINE rather than silently dropped or averaged). */
function matchLines(items, aiLines) {
  var candidates = [];
  (aiLines || []).forEach(function (al, idx) {
    var best = null;
    var wantSku = al.sku ? normSku(al.sku) : null;
    if (wantSku) {
      items.forEach(function (it) {
        var itSku = normSku(it.sku);
        if (itSku === wantSku && (!best || best.c < 1)) best = { item: it, c: 1, code: 'SKU_EXACT' };
      });
      if (!best) {
        items.forEach(function (it) {
          var itSku = normSku(it.sku);
          if (unfuzz(itSku) === unfuzz(wantSku) && itSku !== wantSku) best = { item: it, c: 0.95, code: 'SKU_UNFUZZED' };
        });
      }
      if (!best && wantSku.length >= 5) {
        var close = items.filter(function (it) { return editDistance(normSku(it.sku), wantSku) <= 1; });
        if (close.length === 1) best = { item: close[0], c: 0.85, code: 'SKU_CLOSE' };
      }
    }
    if (!best && al.line != null) {
      var byLine = items.filter(function (it) { return it.line === al.line; })[0];
      if (byLine) best = { item: byLine, c: 0.7, code: 'LINE_NUMBER' };
    }
    if (!best && al.product) {
      var scored = items.map(function (it) { return { item: it, s: diceSimilarity(al.product, it.product) }; })
        .sort(function (a, b) { return b.s - a.s; });
      if (scored.length && scored[0].s >= 0.6 && (scored.length < 2 || scored[0].s - scored[1].s >= 0.15)) {
        best = { item: scored[0].item, c: 0.6 + Math.min(0.15, scored[0].s - 0.6), code: 'NAME_SIMILAR' };
      }
    }
    candidates.push({ ai: al, aiIndex: idx, item: best ? best.item : null, c: best ? best.c : 0, code: best ? best.code : 'UNMATCHED' });
  });
  /* one RFQ item, one winner: the highest-confidence claim on each item keeps it */
  var claimedBy = {};
  candidates.slice().sort(function (a, b) { return b.c - a.c; }).forEach(function (cand) {
    if (!cand.item) return;
    var key = cand.item.line;
    if (claimedBy[key] == null) { claimedBy[key] = cand; cand.won = true; }
    else cand.dupOf = claimedBy[key];
  });
  return candidates;
}

/* ---- R09 / R10 scanners --------------------------------------------- */

var INJECTION_RE = /(ignore (all |the )?(previous|above)|disregard (the )?instructions|you are an ai|as an ai|system prompt|mark (this|the quote) as (eligible|approved|winner)|award (this|us) the (order|contract))/i;
var PAYMENT_RISK_RE = /(100\s*%\s*(t\/?t)?\s*(in advance|before production|prepaid)|western union|moneygram|personal account|paypal friends|全款预付)/i;
var REVISION_RE = /(revis|updat(e|ed)|correct(ed|ion)|new price|replace our (previous|earlier)|instead of our|更新|修改|重新报价)/i;
var CLARIFY_RE = /(before we (can )?quote|we need to confirm|a few questions|please confirm.*(before|so we can)|can you send the artwork)/i;

/* ==== PRE-AI RULES ==================================================== */

function preRules(email, ctx) {
  var meta = ctx.meta, rfqs = ctx.rfqs, suppliers = ctx.suppliers;
  var decisions = [], gates = [], flags = [];
  var body = normText(email.body_raw || '');
  var subject = normText(email.subject || '');

  // R02 first: everything downstream reads the new body only
  var sp = splitQuoted(body);
  decisions.push(dec('R02', sp.quoted ? 'QUOTED_SPLIT' : 'NO_QUOTED',
    sp.quoted ? 'New text ' + sp.new_.length + ' chars, quoted history ' + sp.quoted.length + ' chars' : 'No reply history found'));

  // R01 dedupe
  var h = hash(domainOf(email.from) + '|' + subject.toLowerCase().replace(/^(re|fw|fwd)[:：]\s*/i, '') + '|' + sp.new_.replace(/\s+/g, ' ').trim().toLowerCase());
  var dup = (ctx.seen || []).filter(function (e) { return e.hash === h && e.id !== email.id; })[0];
  decisions.push(dec('R01', dup ? 'DUPLICATE' : 'UNIQUE', dup ? 'Identical to ' + dup.id : 'Hash ' + h, { hash: h, duplicate_of: dup ? dup.id : null }));

  // R03 code
  var subjCodes = findCodes(subject), bodyCodes = findCodes(sp.new_), quotedCodes = findCodes(sp.quoted);
  var pick = subjCodes[0] || bodyCodes[0] || quotedCodes[0] || null;
  var how = subjCodes[0] ? 'subject' : bodyCodes[0] ? 'body' : quotedCodes[0] ? 'quoted' : 'none';
  var match = { code: pick ? pick.code : null, how: how, c: 0, raw: pick ? pick.raw : null, lane: 'rule' };
  if (pick && pick.fuzzy) {
    match.c = how === 'quoted' ? 0.55 : 0.7;
    decisions.push(dec('R03', 'CODE_FUZZY', 'Read "' + pick.raw + '" as ' + pick.code));
    gates.push(gate('RFQ_CODE_FUZZY', { note: 'Subject reads "' + pick.raw + '"', proposed: pick.code, evidence: [{ ev: pick.raw, src: how === 'subject' ? 'subject' : 'body' }] }));
  } else if (pick && how === 'quoted') {
    match.c = 0.6;
    decisions.push(dec('R03', 'CODE_IN_QUOTED_ONLY', pick.code + ' appears only in the reply history'));
  } else if (pick) {
    match.c = how === 'subject' ? 1 : 0.95;
    decisions.push(dec('R03', 'CODE_EXACT', pick.code + ' found in ' + how));
  } else {
    decisions.push(dec('R03', 'CODE_NONE', 'No RFQ code anywhere in the email'));
  }

  var rfq = match.code ? rfqs.filter(function (r) { return r.code === match.code; })[0] : null;
  if (match.code && !rfq) {
    decisions.push(dec('R03', 'CODE_UNKNOWN', match.code + ' is not one of our RFQs'));
    match.code = null; match.c = 0; rfq = null;
  }

  // R04 rfq open?
  if (rfq) {
    if (rfq.status === 'open') decisions.push(dec('R04', 'RFQ_OPEN', rfq.code + ' is open'));
    else {
      decisions.push(dec('R04', 'LATE_QUOTE', rfq.code + ' is ' + rfq.status));
      gates.push(gate('LATE_QUOTE_CLOSED_RFQ', { note: rfq.code + ' is ' + rfq.status }));
    }
  }

  // R05 sender
  var dom = domainOf(email.from);
  var supByDomain = suppliers.filter(function (s) { return s.domains.indexOf(dom) > -1; })[0] || null;
  var inRecipients = rfq && supByDomain && rfq.recipients.indexOf(supByDomain.id) > -1;
  if (inRecipients) {
    decisions.push(dec('R05', 'SENDER_KNOWN', dom + ' is on the recipient list for ' + rfq.code));
  } else if (supByDomain) {
    decisions.push(dec('R05', 'SENDER_KNOWN_OTHER_RFQ', dom + ' is a known supplier but not a recipient of this RFQ'));
    gates.push(gate('SENDER_NOT_IN_RECIPIENTS', { note: dom + ' is a known supplier, but we did not send them this RFQ', evidence: [{ ev: email.from, src: 'header' }] }));
  } else {
    decisions.push(dec('R05', 'SENDER_UNKNOWN', dom + ' matches no supplier on file'));
    gates.push(gate('SENDER_NOT_IN_RECIPIENTS', { note: 'We have no supplier on file at ' + dom, evidence: [{ ev: email.from, src: 'header' }] }));
  }

  // v2: is this a supplement (a follow-up answering our own chase email) rather than a fresh quote or a real revision?
  var isSupplement = !!(email.in_reply_to) ||
    (/re:\s*rfq-\d{4}-\d{3,4}.*(details|missing|before we can compare)/i.test(subject) && (ctx.priorQuotes || []).some(function (q) { return q.supplier_id === email.supplier_id; }));

  // R06 revision / duplicate quote — a supplement never supersedes: it only fills gaps (see applySupplement).
  var priorSameSupplier = (ctx.priorQuotes || []).filter(function (q) {
    return q.supplier_id === email.supplier_id && (!rfq || q.rfq_id === rfq.id) && !q.superseded_by;
  });
  var revisionLanguage = REVISION_RE.test(sp.new_) || REVISION_RE.test(subject);
  if (isSupplement && revisionLanguage) {
    decisions.push(dec('R06', 'SUPPLEMENT_NOT_SUPERSEDE', 'Revision-like wording in a follow-up reply; treated as a supplement, not a new quote'));
  } else if (priorSameSupplier.length && revisionLanguage) {
    decisions.push(dec('R06', 'AUTO_SUPERSEDE', 'Supersedes ' + priorSameSupplier.map(function (q) { return q.id; }).join(', '), { supersedes: priorSameSupplier.map(function (q) { return q.id; }) }));
  } else if (priorSameSupplier.length && !isSupplement) {
    decisions.push(dec('R06', 'COEXIST', 'Second quote from this supplier with no revision wording'));
    gates.push(gate('DUP_QUOTE_COEXISTS', { note: 'Earlier quote ' + priorSameSupplier[0].id + ' is still active', options: ['Replace the earlier quote', 'Keep both'] }));
  } else if (!isSupplement) {
    decisions.push(dec('R06', 'FIRST_QUOTE', 'First quote from this supplier on this RFQ'));
  }

  // R09 injection
  if (INJECTION_RE.test(sp.new_)) {
    var im = INJECTION_RE.exec(sp.new_);
    decisions.push(dec('R09', 'INJECTION_SUSPECT', 'Instruction-like text in the body'));
    flags.push({ code: 'INJECTION_SUSPECT', note: 'The email contains text addressed to an automated reader', ev: im[0], src: 'body' });
    gates.push(gate('INJECTION_SUSPECT', { evidence: [{ ev: im[0], src: 'body' }] }));
  } else decisions.push(dec('R09', 'NO_INJECTION', 'No instruction-like text'));

  // R10 payment risk pre-scan
  var pr = PAYMENT_RISK_RE.exec(sp.new_) || PAYMENT_RISK_RE.exec((email.attachments || []).map(function (a) { return a.transcript; }).join('\n'));
  if (pr) decisions.push(dec('R10', 'PAYMENT_RISK_TEXT', 'Matched "' + pr[0] + '"', { ev: pr[0] }));
  else decisions.push(dec('R10', 'PAYMENT_TERMS_PLAIN', 'No high-risk payment wording'));

  // R08 attachments the prompt cannot read as text
  var imgAtt = (email.attachments || []).filter(function (a) { return a.type === 'photo' || a.type === 'screenshot'; });
  if (imgAtt.length) {
    decisions.push(dec('R08', ctx.imagesSupported === false ? 'IMAGE_UNSUPPORTED' : 'IMAGE_AS_TRANSCRIPT',
      imgAtt.length + ' image attachment(s) read from transcript'));
  }
  var truncated = (email.attachments || []).filter(function (a) { return a.truncated; });
  if (truncated.length) {
    decisions.push(dec('R07', 'ATTACHMENT_TRUNCATED', truncated.map(function (a) { return a.name; }).join(', ') + ' is cut off'));
  }

  // R07 prompt budget is measured by the prompt builder; recorded there.
  var clarify = CLARIFY_RE.test(sp.new_) && !/\d+[\.,]\d{2}\s*(usd|\$|per|\/)/i.test(sp.new_);

  return {
    hash: h, duplicate_of: dup ? dup.id : null, skip_ai: !!dup,
    body_new: sp.new_, body_quoted: sp.quoted,
    match: match, rfq_id: rfq ? rfq.id : null,
    supplier_id: supByDomain ? supByDomain.id : email.supplier_id || null,
    needs_ai_match: !match.code,
    likely_clarification: clarify,
    is_supplement: isSupplement,
    payment_risk_text: pr ? pr[0] : null,
    decisions: decisions, gates: gates, flags: flags
  };
}

/* ==== UNIT / CURRENCY PARSING ========================================= */

function parseUnit(u) {
  var s = String(u || '').toLowerCase();
  var cur = null;
  if (/rmb|cny|¥|元|人民币/.test(s)) cur = 'CNY';
  else if (/usd|us\$|美金|\$/.test(s)) cur = 'USD';
  else if (/eur|€/.test(s)) cur = 'EUR';
  else if (/hkd|hk\$/.test(s)) cur = 'HKD';
  var perN = 1;
  var mn = /per\s*([\d,]+)\s*(pcs?|pieces?)/.exec(s) || /\/\s*([\d,]+)\s*(pcs?|pieces?)/.exec(s);
  if (mn) perN = parseInt(mn[1].replace(/,/g, ''), 10) || 1;
  var per = 'pc';
  if (/ctn|carton|箱|case\b/.test(s)) per = 'ctn';
  else if (/\bset\b|sets\b|套/.test(s)) per = 'set';
  else if (/dozen|打\b/.test(s)) per = 'dozen';
  else if (/\bkg\b/.test(s)) per = 'kg';
  return { cur: cur, per: per, perN: perN };
}

function fxToUsd(amount, cur, meta) {
  if (amount == null) return null;
  if (!cur || cur === 'USD') return amount;
  var rate = meta.fx[cur];
  if (!rate) return null;
  return cur === 'EUR' ? amount / rate : amount / rate;
}

/* ==== POST-AI VALIDATION (shared) ===================================== */

function evidenceOk(ev, sources) {
  if (!ev) return { status: 'none', src: null };
  var keys = Object.keys(sources), i, hay;
  for (i = 0; i < keys.length; i++) {
    if (sources[keys[i]].indexOf(ev) > -1) return { status: 'ok', src: keys[i] };
  }
  var loose = ev.replace(/\s+/g, ' ').trim().toLowerCase();
  for (i = 0; i < keys.length; i++) {
    hay = sources[keys[i]].replace(/\s+/g, ' ').toLowerCase();
    if (hay.indexOf(loose) > -1) return { status: 'approx', src: keys[i] };
  }
  return { status: 'missing', src: null };
}

function canonCert(name) {
  var s = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  var keys = Object.keys(CERT_CANON), i, j;
  for (i = 0; i < keys.length; i++) {
    var alts = CERT_CANON[keys[i]];
    for (j = 0; j < alts.length; j++) {
      var a = alts[j];
      if (s === a || s.indexOf(a + ' ') === 0 || s.indexOf(' ' + a) > -1 || s === a.replace(/\s/g, '')) return keys[i];
    }
  }
  return null;
}

/* ==== V1 PATH: single AI shape (ai.items[], one f per item) =========== */
/* Unchanged from the original single-product build. Used whenever the reader's
   output has no sv:2 marker — every seeded sample and every existing test goes
   through exactly this code, byte-for-byte. */

function shapeErrorsV1(ai) {
  var e = [];
  if (!ai || typeof ai !== 'object') return ['output is not an object'];
  if (!ai.kind) e.push('kind missing');
  if (!Array.isArray(ai.items)) e.push('items is not an array');
  else ai.items.forEach(function (it, i) {
    if (!it || typeof it !== 'object') e.push('items[' + i + '] not an object');
    else if (!it.f || typeof it.f !== 'object') e.push('items[' + i + '].f missing');
  });
  ['gaps', 'flags', 'needs_human', 'assumed'].forEach(function (k) {
    if (ai[k] != null && !Array.isArray(ai[k])) e.push(k + ' is not an array');
  });
  return e;
}

function validateV1(ai, email, rfq, pre, ctx) {
  var meta = ctx.meta;
  var checks = [], gates = [], quotes = [];
  var sources = { body: pre.body_new };
  (email.attachments || []).forEach(function (a) { sources['att:' + a.name] = a.transcript || ''; });

  // V01 shape
  var errs = shapeErrorsV1(ai);
  if (errs.length) {
    checks.push(dec('V01', 'OUTPUT_INVALID', errs.join('; ')));
    gates.push(gate('EXTRACTION_FAILED_MANUAL_ENTRY', { note: errs.join('; ') }));
    return { ok: false, checks: checks, gates: gates, quotes: [] };
  }
  checks.push(dec('V01', 'OUTPUT_VALID', (ai.items || []).length + ' line item(s)'));

  // V02 evidence, across every field of every item
  var evStats = { ok: 0, approx: 0, missing: 0, none: 0 };
  function checkEv(f) {
    if (!f || typeof f !== 'object') return f;
    var r = evidenceOk(f.ev, sources);
    evStats[r.status]++;
    f._ev = r.status;
    if (r.src && !f.src) f.src = r.src === 'body' ? 'body' : r.src;
    if (r.status === 'approx') f.c = (f.c || 0) * 0.8;
    if (r.status === 'missing') f.c = (f.c || 0) * 0.5;
    return f;
  }
  (ai.items || []).forEach(function (it) {
    Object.keys(it.f || {}).forEach(function (k) {
      if (k === 'custom') (it.f.custom || []).forEach(checkEv);
      else checkEv(it.f[k]);
    });
    if (it.product) checkEv(it.product);
  });
  checks.push(dec('V02', evStats.missing ? 'EV_PARTIAL' : 'EV_OK',
    evStats.ok + ' verbatim, ' + evStats.approx + ' near, ' + evStats.missing + ' unverifiable'));

  // per item
  (ai.items || []).forEach(function (it, idx) {
    var f = it.f || {};
    var q = {
      item_index: it.i == null ? idx + 1 : it.i,
      product: (it.product && it.product.v) || rfq && rfq.product || 'Unnamed item',
      rfq_id: null, rfq_code: it.rfq_code || (rfq && rfq.code) || null,
      ai: it, norm: {}, gaps: [], gates: [], checks: [], highlights: []
    };
    var itemRfq = rfq;
    if (it.rfq_code) {
      var alt = ctx.rfqs.filter(function (r) { return r.code === it.rfq_code; })[0];
      if (alt) itemRfq = alt;
    }
    // V11 unmatched line item
    if (!it.rfq_code && (ai.items || []).length > 1) {
      q.gates.push(gate('UNMATCHED_LINE_ITEM', { item: q.item_index, note: q.product + ' matches no open RFQ', options: ['Park it', 'Assign to an RFQ', 'Discard'] }));
      q.checks.push(dec('V11', 'UNMATCHED_ITEM', q.product));
      itemRfq = null;
    }
    q.rfq_id = itemRfq ? itemRfq.id : null;
    q.rfq_code = itemRfq ? itemRfq.code : null;
    var rfqUnit = (itemRfq && itemRfq.unit) || 'pc';
    var targetQty = itemRfq ? itemRfq.target_qty : null;

    /* V05 currency */
    var tiers = f.price_tiers && Array.isArray(f.price_tiers.v) ? f.price_tiers.v : null;
    var tierUnit = parseUnit(f.price_tiers && f.price_tiers.u);
    var stated = (f.currency && f.currency.v) || null;
    var cur = (stated && stated !== 'unknown') ? stated : tierUnit.cur;
    var hasAnyPrice = !!(tiers && tiers.length) || !!(f.price_range && f.price_range.v);
    if (!cur && !hasAnyPrice) {
      cur = null;
      q.checks.push(dec('V05', 'CURRENCY_NA', 'No price quoted, so no currency to read'));
    } else if (!cur) {
      cur = 'USD';
      q.gates.push(gate('CURRENCY_ASSUMED', { item: q.item_index, field: 'currency', proposed: 'USD', note: 'No currency marker anywhere in the quote' }));
      q.checks.push(dec('V05', 'ASSUMED_USD', 'No currency marker'));
    } else if (cur !== 'USD') {
      q.gates.push(gate('CURRENCY_CONVERTED', { item: q.item_index, field: 'currency', proposed: cur + ' to USD at ' + meta.fx[cur], note: 'Converted at the rate pinned on ' + meta.fx.date }));
      q.checks.push(dec('V05', 'CONVERTED', cur + ' to USD at ' + meta.fx[cur] + ' (' + meta.fx.date + ')'));
    } else q.checks.push(dec('V05', 'CURRENCY_OK', 'Quoted in USD'));
    q.norm.currency = { v: cur, rule: 'V05', assumed: cur != null && (!stated || stated === 'unknown') };

    /* V06 units */
    var pack = (f.moq && f.moq.v && f.moq.v.pack) || (f.carton && f.carton.v && f.carton.v.pcs) || null;
    var priceFactor = tierUnit.perN, unitGate = null, unitNote = '';
    if (tierUnit.per === 'ctn') {
      if (pack) { priceFactor = tierUnit.perN * pack; unitGate = 'UNIT_CONVERTED'; unitNote = 'Price is per carton of ' + pack; }
      else { q.gaps.push({ field: 'carton', kind: 'missing', note: 'Price is per carton but pieces per carton is not stated' }); }
    } else if (tierUnit.per === 'dozen') {
      priceFactor = tierUnit.perN * 12; unitGate = 'UNIT_CONVERTED'; unitNote = 'Price is per dozen';
    } else if (tierUnit.perN > 1) {
      unitGate = 'UNIT_CONVERTED'; unitNote = 'Price is per ' + tierUnit.perN + ' pieces';
    } else if (tierUnit.per !== rfqUnit && tierUnit.per !== 'kg') {
      unitGate = 'UNIT_CONVERTED'; unitNote = 'Quoted per ' + tierUnit.per + ', we buy in ' + rfqUnit;
    }
    if (unitGate) {
      q.gates.push(gate(unitGate, { item: q.item_index, field: 'price_tiers', note: unitNote, proposed: 'divide by ' + priceFactor }));
      q.checks.push(dec('V06', 'UNIT_CONVERTED', unitNote + ', factor ' + priceFactor));
    } else q.checks.push(dec('V06', 'UNIT_NATIVE', 'Quoted per ' + rfqUnit));

    /* qty-unit of the tier table */
    var tierQtyUnit = tiers && tiers[0] && tiers[0].qu ? tiers[0].qu : rfqUnit;
    var targetInTierUnit = targetQty;
    if (targetQty != null && tierQtyUnit === 'ctn' && pack) targetInTierUnit = Math.ceil(targetQty / pack);
    if (tierQtyUnit === 'ctn' && !pack) targetInTierUnit = null;
    if (tierQtyUnit !== rfqUnit) {
      q.checks.push(dec('V06', 'QTY_UNIT_CONVERTED', 'Tiers are in ' + tierQtyUnit + '; our ' + targetQty + ' ' + rfqUnit + ' is ' + targetInTierUnit + ' ' + tierQtyUnit));
      if (!q.gates.some(function (g) { return g.code === 'UNIT_CONVERTED'; })) {
        q.gates.push(gate('UNIT_CONVERTED', { item: q.item_index, field: 'moq', note: 'Quantity tiers are counted in ' + tierQtyUnit, proposed: targetInTierUnit + ' ' + tierQtyUnit }));
      }
    }

    /* V04 + E03 price at our quantity */
    var priceRaw = null, tierUsed = null, interpolated = false;
    if (tiers && tiers.length && targetInTierUnit != null) {
      var monotonic = true;
      for (var i = 1; i < tiers.length; i++) if (num(tiers[i].p) > num(tiers[i - 1].p)) monotonic = false;
      if (!monotonic) q.checks.push(dec('V04', 'TIER_NON_MONOTONIC', 'Prices do not fall as quantity rises'));
      tiers.forEach(function (t) {
        var lo = num(t.qmin), hi = t.qmax == null ? Infinity : num(t.qmax);
        if (targetInTierUnit >= lo && targetInTierUnit <= hi) { priceRaw = num(t.p); tierUsed = t; }
      });
      if (priceRaw == null) {
        var lower = tiers.filter(function (t) { return num(t.qmin) <= targetInTierUnit && num(t.p) != null; })
          .sort(function (a, b) { return b.qmin - a.qmin; })[0];
        if (lower) { priceRaw = num(lower.p); tierUsed = lower; interpolated = true; }
        else {
          var lowest = tiers.filter(function (t) { return num(t.p) != null; })
            .sort(function (a, b) { return a.qmin - b.qmin; })[0];
          if (lowest) { priceRaw = num(lowest.p); tierUsed = lowest; interpolated = true; }
        }
      }
    }
    if (priceRaw == null && f.price_range && f.price_range.v) {
      q.gates.push(gate('PRICE_RANGE_ONLY', { item: q.item_index, field: 'price_tiers',
        note: 'Quoted as ' + f.price_range.v.lo + ' to ' + f.price_range.v.hi + ', no firm figure',
        evidence: f.price_range.ev ? [{ ev: f.price_range.ev, src: f.price_range.src || 'body' }] : [] }));
      q.checks.push(dec('E03', 'PRICE_UNDETERMINED', 'Range only'));
    }
    if (interpolated) {
      q.gates.push(gate('TIER_INTERPOLATED', { item: q.item_index, field: 'price_tiers',
        note: 'No tier covers ' + targetInTierUnit + ' ' + tierQtyUnit + '; used their ' + tierUsed.qmin + '+ tier of ' + tierUsed.p }));
      q.checks.push(dec('E03', 'TIER_INTERPOLATED', 'Used tier from ' + tierUsed.qmin));
    }
    var usd = priceRaw == null ? null : round4(fxToUsd(priceRaw / priceFactor, cur, meta));
    q.norm.usd_at_target = { v: round4(usd), rule: 'V05+V06+E03', inputs: { raw: priceRaw, cur: cur, factor: priceFactor, tier: tierUsed } };
    if (usd != null) q.checks.push(dec('E03', 'PRICE_AT_TARGET', 'USD ' + round4(usd) + ' per ' + rfqUnit + ' at ' + targetQty));

    /* V07 incoterm */
    var basis = (f.price_basis && f.price_basis.v) || {};
    var inc = (basis.incoterm || '').toUpperCase() || null;
    q.norm.incoterm = { v: inc, place: basis.place || null, rule: 'V07' };
    var altBases = (basis && basis.alts) || [];
    if (!inc) {
      q.gaps.push({ field: 'price_basis', kind: 'missing', note: 'No incoterm stated' });
      q.checks.push(dec('V07', 'GAP_INCOTERM', 'No incoterm'));
    } else if (inc === 'FOB' || inc === 'FCA') {
      q.checks.push(dec('V07', 'BASIS_OK', inc + ' ' + (basis.place || 'China')));
    } else {
      q.gates.push(gate('INCOTERM_MISMATCH', { item: q.item_index, field: 'price_basis',
        note: 'Quoted ' + inc + ' ' + (basis.place || '') + ', we compare on FOB China',
        options: ['Add an adjustment and compare', 'Exclude the quote'] }));
      q.checks.push(dec('V07', 'INCOTERM_MISMATCH', inc));
    }
    if (altBases.length) {
      q.gates.push(gate('INCOTERM_MISMATCH', { item: q.item_index, field: 'price_basis',
        note: 'More than one basis quoted: ' + [inc].concat(altBases.map(function (a) { return a.incoterm + ' ' + (a.place || '') + ' ' + (a.price || ''); })).join(' and ') + '. Confirm which one we compare on.',
        proposed: inc }));
    }

    /* MOQ */
    var moq = (f.moq && f.moq.v) || null;
    var moqPcs = null;
    if (moq && num(moq.n) != null) {
      var mu = String(moq.u || rfqUnit).toLowerCase();
      if (/ctn|carton|箱/.test(mu)) moqPcs = moq.pack ? moq.n * moq.pack : null;
      else if (/dozen/.test(mu)) moqPcs = moq.n * 12;
      else moqPcs = moq.n;
    }
    q.norm.moq_pcs = { v: moqPcs, rule: 'V06', inputs: moq };
    if (moqPcs == null) q.gaps.push({ field: 'moq', kind: moq ? 'ambiguous' : 'missing', note: moq ? 'Minimum given in ' + moq.u + ' with no pack quantity' : 'No minimum order stated' });

    /* lead time */
    var lt = (f.lead_time && f.lead_time.v) || null;
    q.norm.lead_days = { v: lt ? num(lt.hi) || num(lt.lo) : null, from: lt ? lt.from : null, rule: 'V04' };
    if (lt && num(lt.lo) != null && num(lt.hi) != null && lt.lo > lt.hi) q.checks.push(dec('V04', 'LEAD_RANGE_INVERTED', lt.lo + '>' + lt.hi));

    /* V08 validity */
    var val = (f.validity && f.validity.v) || null;
    var expiry = null;
    if (val && val.until) { expiry = String(val.until).slice(0, 10); q.checks.push(dec('V08', 'EXPIRY', expiry)); }
    else if (val && num(val.days) != null) {
      expiry = addDays(email.date, val.days);
      q.checks.push(dec('V08', 'EXPIRY_DERIVED', val.days + ' days from ' + email.date.slice(0, 10) + ' is ' + expiry));
    } else { q.gaps.push({ field: 'validity', kind: 'missing', note: 'No validity period stated' }); q.checks.push(dec('V08', 'GAP_VALIDITY', 'none')); }
    q.norm.expiry = { v: expiry, rule: 'V08' };

    /* V12 certificates */
    var certsIn = (f.certs && Array.isArray(f.certs.v)) ? f.certs.v : [];
    var canonList = [], unverified = [], uncertain = [];
    certsIn.forEach(function (c) {
      var canon = c.canon || canonCert(c.name);
      var scope = c.scope || (FACTORY_SCOPE[canon] ? 'factory' : 'product');
      if (!canon) { uncertain.push(c.name); return; }
      if (scope === 'product' || !FACTORY_SCOPE[canon]) canonList.push(canon);
      if (!c.doc) unverified.push(canon);
    });
    canonList = uniq(canonList);
    q.norm.certs_canon = { v: canonList, rule: 'V12', unverified: uniq(unverified), factory_only: certsIn.filter(function (c) { return (c.scope === 'factory'); }).map(function (c) { return c.canon || c.name; }) };
    if (uncertain.length) {
      q.gates.push(gate('CERT_MAPPING_UNCERTAIN', { item: q.item_index, field: 'certs', note: 'Could not map: ' + uncertain.join(', ') }));
      q.checks.push(dec('V12', 'CERT_MAPPING_UNCERTAIN', uncertain.join(', ')));
    }
    if (unverified.length) {
      q.gates.push(gate('CERT_UNVERIFIED', { item: q.item_index, field: 'certs', note: unverified.join(', ') + ' claimed with no certificate number or document' }));
      q.checks.push(dec('V12', 'CERT_UNVERIFIED', unverified.join(', ')));
    }
    if (canonList.length && !uncertain.length && !unverified.length) q.checks.push(dec('V12', 'CERTS_OK', canonList.join(', ')));

    /* private label */
    var pl = (f.private_label && f.private_label.v) || null;
    var plEff = pl ? pl.ans : null;
    if (itemRfq && !itemRfq.pl_required) plEff = 'n/a';
    else if (pl && pl.ans === 'conditional') {
      var mq = /(\d[\d,]*)/.exec(String(pl.cond || ''));
      var condQty = mq ? parseInt(mq[1].replace(/,/g, ''), 10) : null;
      var meets = condQty != null && targetQty != null && targetQty >= condQty;
      plEff = meets ? 'yes' : 'no';
      q.gates.push(gate('CONDITIONAL_PL', { item: q.item_index, field: 'private_label',
        note: 'Condition: ' + pl.cond + '. Our order of ' + targetQty + ' ' + (meets ? 'meets' : 'does not meet') + ' it.',
        proposed: meets ? 'yes' : 'no', evidence: f.private_label.ev ? [{ ev: f.private_label.ev, src: f.private_label.src || 'body' }] : [] }));
      q.checks.push(dec('E01', 'PL_CONDITIONAL', pl.cond + ' -> ' + plEff));
    }
    q.norm.private_label = { v: plEff, rule: 'E01', condition: pl ? pl.cond : null };

    /* payment risk confirmed against the extracted terms */
    var payTxt = (f.payment && f.payment.v && (f.payment.v.terms || f.payment.v)) || pre.payment_risk_text || '';
    if (PAYMENT_RISK_RE.test(String(payTxt)) || (pre.payment_risk_text && !f.payment)) {
      q.gates.push(gate('PAYMENT_RISK', { item: q.item_index, field: 'payment', note: String(payTxt) || pre.payment_risk_text,
        evidence: (f.payment && f.payment.ev) ? [{ ev: f.payment.ev, src: f.payment.src || 'body' }] : [] }));
      q.checks.push(dec('R10', 'PAYMENT_RISK', String(payTxt).slice(0, 60)));
    }

    /* V03 confidence on critical fields */
    CRITICAL_FIELDS.forEach(function (k) {
      if (k === 'private_label' && itemRfq && !itemRfq.pl_required) return;
      var fld = f[k];
      if (fld && typeof fld.c === 'number' && fld.c < meta.thresholds.conf_critical && fld.v != null) {
        q.gates.push(gate('CRITICAL_FIELD_LOW_CONF', { item: q.item_index, field: k,
          note: (FIELD_LABELS[k] || k) + ' read with confidence ' + Math.round(fld.c * 100) + '%',
          proposed: fld.v, evidence: fld.ev ? [{ ev: fld.ev, src: fld.src || 'body' }] : [] }));
        q.checks.push(dec('V03', 'LOW_CONF', k + ' ' + fld.c));
      }
    });

    /* V09 gaps against what the RFQ asked */
    if (itemRfq) {
      var wanted = ['price_tiers', 'moq', 'lead_time', 'validity', 'payment', 'price_basis', 'certs', 'sample'];
      if (itemRfq.pl_required) wanted.push('private_label');
      wanted.forEach(function (k) {
        var fld = f[k];
        var have = fld && fld.v != null && !(Array.isArray(fld.v) && !fld.v.length);
        if (k === 'price_tiers' && !have && f.price_range && f.price_range.v) return;
        if (!have && !q.gaps.some(function (g) { return g.field === k; })) {
          q.gaps.push({ field: k, kind: 'missing', note: (FIELD_LABELS[k] || k) + ' not answered' });
        }
      });
      (itemRfq.custom_questions || []).forEach(function (cq) {
        var ans = ((f.custom || []).filter(function (c) { return c.qid === cq.qid; })[0]) || null;
        if (!ans || ans.v == null || ans.v === '') {
          if (cq.required) q.gaps.push({ field: cq.qid, kind: 'missing', note: cq.text, question: true });
        } else if (ans.c != null && ans.c < 0.5) {
          q.gaps.push({ field: cq.qid, kind: 'partial', note: cq.text, question: true, ev: ans.ev, src: ans.src });
        }
      });
      var criticalMissing = q.gaps.filter(function (g) { return CRITICAL_FIELDS.indexOf(g.field) > -1 && g.kind === 'missing'; });
      if (criticalMissing.length) {
        q.gates.push(gate('CRITICAL_FIELD_MISSING', { item: q.item_index,
          note: criticalMissing.map(function (g) { return FIELD_LABELS[g.field] || g.field; }).join(', ') + ' missing' }));
        q.checks.push(dec('V09', 'CRITICAL_MISSING', criticalMissing.map(function (g) { return g.field; }).join(', ')));
      }
      q.checks.push(dec('V09', 'GAPS', q.gaps.length + ' unanswered or partial of ' + (wanted.length + (itemRfq.custom_questions || []).filter(function (c) { return c.required; }).length)));
      q.completeness = Math.max(0, Math.round(100 * (1 - q.gaps.length / (wanted.length + (itemRfq.custom_questions || []).length))));
    } else q.completeness = null;

    /* gaps and flags the reader raised, mapped to gates */
    (ai.gaps || []).filter(function (g) { return g.i == null || g.i === q.item_index; }).forEach(function (g) {
      if (!q.gaps.some(function (x) { return x.field === g.field; })) q.gaps.push(g);
      if (g.kind === 'truncated') q.gates.push(gate('ATTACHMENT_TRUNCATED_CRITICAL', { item: q.item_index, field: g.field, note: g.note, evidence: g.ev ? [{ ev: g.ev, src: g.src || 'body' }] : [] }));
      if (g.kind === 'ambiguous' && CRITICAL_FIELDS.indexOf(g.field) > -1) q.gates.push(gate('OCR_AMBIGUOUS_CRITICAL', { item: q.item_index, field: g.field, note: g.note, evidence: g.ev ? [{ ev: g.ev, src: g.src || 'body' }] : [] }));
      if (g.kind === 'external_only') q.gates.push(gate('PRICE_EXTERNAL_ONLY', { item: q.item_index, field: g.field, note: g.note }));
      if (g.kind === 'conflict') q.gates.push(gate('BODY_ATTACH_CONFLICT', { item: q.item_index, field: g.field, note: g.note, evidence: g.ev ? [{ ev: g.ev, src: g.src || 'body' }] : [] }));
    });
    (ai.needs_human || []).filter(function (n) { return n.i == null || n.i === q.item_index; }).forEach(function (n) {
      if (!REASONS[n.code]) return;
      if (q.gates.some(function (g) { return g.code === n.code && g.field === (n.field || null); })) return;
      q.gates.push(gate(n.code, { item: q.item_index, field: n.field || null, note: n.note || '', evidence: n.evs || [], raised_by: 'ai' }));
    });
    (ai.flags || []).forEach(function (fl) {
      if (fl.code === 'SPEC_DEVIATION') q.gates.push(gate('SPEC_DEVIATION', { item: q.item_index, note: fl.note, evidence: fl.ev ? [{ ev: fl.ev, src: fl.src || 'body' }] : [], raised_by: 'ai' }));
    });
    q.flags = ai.flags || [];
    q.assumed = (ai.assumed || []).filter(function (a) { return a.i == null || a.i === q.item_index; });

    /* highlights: every field or gap that carries verifiable evidence and is a problem */
    var hl = [];
    function pushHl(ev, src, why, sev) {
      if (!ev) return;
      var r = evidenceOk(ev, sources);
      if (r.status !== 'ok') return;
      hl.push({ ev: ev, src: r.src, why: why, sev: sev || 'warn' });
    }
    q.gates.forEach(function (g) {
      (g.evidence || []).forEach(function (e) { pushHl(e.ev, e.src, g.question + (g.note ? ' — ' + g.note : ''), g.severity); });
    });
    q.gaps.forEach(function (g) { if (g.ev) pushHl(g.ev, g.src, g.note, 'warn'); });
    (ai.flags || []).forEach(function (fl) { pushHl(fl.ev, fl.src, fl.note, 'crit'); });
    q.highlights = hl;

    quotes.push(q);
  });

  return { ok: true, checks: checks, gates: gates, quotes: quotes, evidence: evStats };
}

/* ==== V2 PATH: multi-line RFQs (ai.sv === 2, ai.terms + ai.lines[]) ==== */

function shapeErrorsV2(ai) {
  var e = [];
  if (!ai || typeof ai !== 'object') return ['output is not an object'];
  if (!ai.kind) e.push('kind missing');
  if (!ai.terms || typeof ai.terms !== 'object') e.push('terms missing');
  if (!Array.isArray(ai.lines)) e.push('lines is not an array');
  ['gaps', 'flags', 'needs_human', 'assumed'].forEach(function (k) {
    if (ai[k] != null && !Array.isArray(ai[k])) e.push(k + ' is not an array');
  });
  return e;
}

/* Normalise one v2 line's price to USD per unit at the RFQ item's target quantity.
   Mirrors the v1 unit/currency logic in validateV1 above, but reads the compact v2 line shape
   (one shared `p`/`range`/`moq`/`lt`, no per-field F records) instead of item.f.*. */
function normalizeLinePrice(al, item, cur, meta) {
  var tierUnit = parseUnit(al.priceUnit || '');
  var pack = (al.moq && al.moq.pack) || null;
  var priceFactor = tierUnit.perN;
  var unitNote = null;
  if (tierUnit.per === 'ctn' && pack) { priceFactor = tierUnit.perN * pack; unitNote = 'Price is per carton of ' + pack; }
  else if (tierUnit.per === 'dozen') { priceFactor = tierUnit.perN * 12; unitNote = 'Price is per dozen'; }
  else if (tierUnit.perN > 1) unitNote = 'Price is per ' + tierUnit.perN + ' pieces';

  var qty = item ? item.qty : null;
  var priceRaw = null, tierUsed = null, interpolated = false;
  var tiers = al.p && al.p.length ? al.p : null;
  if (tiers && qty != null) {
    var monotonic = true;
    for (var i = 1; i < tiers.length; i++) if (num(tiers[i].p) > num(tiers[i - 1].p)) monotonic = false;
    tiers.forEach(function (t) {
      var lo = num(t.qmin), hi = t.qmax == null ? Infinity : num(t.qmax);
      if (qty >= lo && qty <= hi) { priceRaw = num(t.p); tierUsed = t; }
    });
    if (priceRaw == null) {
      var lower = tiers.filter(function (t) { return num(t.qmin) <= qty && num(t.p) != null; }).sort(function (a, b) { return b.qmin - a.qmin; })[0];
      if (lower) { priceRaw = num(lower.p); tierUsed = lower; interpolated = true; }
      else {
        var lowest = tiers.filter(function (t) { return num(t.p) != null; }).sort(function (a, b) { return a.qmin - b.qmin; })[0];
        if (lowest) { priceRaw = num(lowest.p); tierUsed = lowest; interpolated = true; }
      }
    }
    if (!monotonic) interpolated = interpolated; // no separate flag needed at this scale
  }
  var usd = priceRaw == null ? null : round4(fxToUsd(priceRaw / priceFactor, cur, meta));
  return { usd: usd, priceRaw: priceRaw, factor: priceFactor, tierUsed: tierUsed, interpolated: interpolated, unitNote: unitNote };
}

function validateV2(ai, email, rfq, pre, ctx) {
  var meta = ctx.meta;
  var checks = [], gates = [], quotes = [];
  var sources = { body: pre.body_new };
  (email.attachments || []).forEach(function (a) { sources['att:' + a.name] = a.transcript || ''; });

  var errs = shapeErrorsV2(ai);
  if (errs.length) {
    checks.push(dec('V01', 'OUTPUT_INVALID', errs.join('; ')));
    gates.push(gate('EXTRACTION_FAILED_MANUAL_ENTRY', { note: errs.join('; ') }));
    return { ok: false, checks: checks, gates: gates, quotes: [], header: null };
  }
  checks.push(dec('V01', 'OUTPUT_VALID', (ai.lines || []).length + ' line(s) of ' + rfqItems(rfq).length + ' asked'));

  var terms = ai.terms || {};
  var evStats = { ok: 0, approx: 0, missing: 0, none: 0 };
  function checkEv(f) {
    if (!f || typeof f !== 'object') return f;
    var r = evidenceOk(f.ev, sources);
    evStats[r.status]++;
    if (r.src && !f.src) f.src = r.src;
    if (r.status === 'approx') f.c = (f.c || 0) * 0.8;
    if (r.status === 'missing') f.c = (f.c || 0) * 0.5;
    return f;
  }
  Object.keys(terms).forEach(function (k) { if (k === 'custom') (terms.custom || []).forEach(checkEv); else checkEv(terms[k]); });
  (ai.lines || []).forEach(function (al) {
    if (!al.ev) return;
    var r = evidenceOk(al.ev, sources);
    evStats[r.status]++;
    al._ev = r.status;
    if (r.src && !al.src) al.src = r.src;
    if (r.status === 'approx') al.c = (al.c || 0.8) * 0.8;
    if (r.status === 'missing') al.c = (al.c || 0.5) * 0.5;
  });
  checks.push(dec('V02', evStats.missing ? 'EV_PARTIAL' : 'EV_OK', evStats.ok + ' verbatim, ' + evStats.approx + ' near, ' + evStats.missing + ' unverifiable'));

  var headerGates = [];
  var header = { supplier: ai.supplier || {}, norm: {} };

  /* currency */
  var stated = (terms.currency && terms.currency.v) || null;
  var cur = (stated && stated !== 'unknown') ? stated : null;
  if (!cur) {
    cur = 'USD';
    if ((ai.lines || []).some(function (l) { return l.p || l.range; })) {
      headerGates.push(gate('CURRENCY_ASSUMED', { scope: 'terms', field: 'currency', proposed: 'USD', note: 'No currency marker anywhere in the quote' }));
      checks.push(dec('V05', 'ASSUMED_USD', 'No currency marker'));
    }
  } else if (cur !== 'USD') {
    headerGates.push(gate('CURRENCY_CONVERTED', { scope: 'terms', field: 'currency', proposed: cur + ' to USD at ' + meta.fx[cur], note: 'Converted at the rate pinned on ' + meta.fx.date }));
    checks.push(dec('V05', 'CONVERTED', cur + ' to USD at ' + meta.fx[cur] + ' (' + meta.fx.date + ')'));
  } else checks.push(dec('V05', 'CURRENCY_OK', 'Quoted in USD'));
  header.norm.currency = { v: cur, rule: 'V05' };

  /* incoterm */
  var basis = (terms.price_basis && terms.price_basis.v) || {};
  var inc = (basis.incoterm || '').toUpperCase() || null;
  header.norm.incoterm = { v: inc, place: basis.place || null, rule: 'V07' };
  if (!inc) checks.push(dec('V07', 'GAP_INCOTERM', 'No incoterm'));
  else if (inc === 'FOB' || inc === 'FCA') checks.push(dec('V07', 'BASIS_OK', inc + ' ' + (basis.place || 'China')));
  else {
    headerGates.push(gate('INCOTERM_MISMATCH', { scope: 'terms', field: 'price_basis', note: 'Quoted ' + inc + ' ' + (basis.place || '') + ', we compare on FOB China', options: ['Add an adjustment and compare', 'Exclude the quote'] }));
    checks.push(dec('V07', 'INCOTERM_MISMATCH', inc));
  }

  /* validity */
  var val = (terms.validity && terms.validity.v) || null;
  var expiry = null;
  if (val && val.until) expiry = String(val.until).slice(0, 10);
  else if (val && num(val.days) != null) expiry = addDays(email.date, val.days);
  header.norm.expiry = { v: expiry, rule: 'V08' };

  /* certificates */
  var certsIn = (terms.certs && Array.isArray(terms.certs.v)) ? terms.certs.v : [];
  var canonList = [], unverified = [], uncertain = [];
  certsIn.forEach(function (c) {
    var canon = c.canon || canonCert(c.name);
    var scope = c.scope || (FACTORY_SCOPE[canon] ? 'factory' : 'product');
    if (!canon) { uncertain.push(c.name); return; }
    if (scope === 'product' || !FACTORY_SCOPE[canon]) canonList.push(canon);
    if (!c.doc) unverified.push(canon);
  });
  canonList = uniq(canonList);
  header.norm.certs_canon = { v: canonList, rule: 'V12', unverified: uniq(unverified) };
  if (uncertain.length) headerGates.push(gate('CERT_MAPPING_UNCERTAIN', { scope: 'terms', field: 'certs', note: 'Could not map: ' + uncertain.join(', ') }));
  if (unverified.length) headerGates.push(gate('CERT_UNVERIFIED', { scope: 'terms', field: 'certs', note: unverified.join(', ') + ' claimed with no certificate number or document' }));

  var missingCerts = (rfq.required_certs || []).filter(function (c) { return canonList.indexOf(c) === -1; });
  if (missingCerts.length) checks.push(dec('V12', 'CERT_FAIL', 'Missing ' + missingCerts.join(', ')));

  /* private label — evaluated against the whole order (sum of this RFQ's line quantities) */
  var totalQty = rfqItems(rfq).reduce(function (a, it) { return a + (it.qty || 0); }, 0);
  var pl = (terms.private_label && terms.private_label.v) || null;
  var plEff = pl ? pl.ans : null;
  if (!rfq.pl_required) plEff = 'n/a';
  else if (pl && pl.ans === 'conditional') {
    var mq = /(\d[\d,]*)/.exec(String(pl.cond || ''));
    var condQty = mq ? parseInt(mq[1].replace(/,/g, ''), 10) : null;
    var meets = condQty != null && totalQty >= condQty;
    plEff = meets ? 'yes' : 'no';
    headerGates.push(gate('CONDITIONAL_PL', { scope: 'terms', field: 'private_label',
      note: 'Condition: ' + pl.cond + '. Our order of ' + totalQty + ' total units ' + (meets ? 'meets' : 'does not meet') + ' it.',
      proposed: meets ? 'yes' : 'no', evidence: terms.private_label && terms.private_label.ev ? [{ ev: terms.private_label.ev, src: terms.private_label.src || 'body' }] : [] }));
  }
  header.norm.private_label = { v: plEff, rule: 'E01', condition: pl ? pl.cond : null };

  /* payment risk */
  var payTxt = (terms.payment && terms.payment.v && (terms.payment.v.terms || terms.payment.v)) || pre.payment_risk_text || '';
  if (PAYMENT_RISK_RE.test(String(payTxt)) || (pre.payment_risk_text && !terms.payment)) {
    headerGates.push(gate('PAYMENT_RISK', { scope: 'terms', field: 'payment', note: String(payTxt) || pre.payment_risk_text,
      evidence: (terms.payment && terms.payment.ev) ? [{ ev: terms.payment.ev, src: terms.payment.src || 'body' }] : [] }));
  }
  header.norm.payment = terms.payment ? terms.payment.v : null;
  header.norm.sample = terms.sample ? terms.sample.v : null;
  header.norm.ship_sea = terms.ship_sea ? terms.ship_sea.v : null;
  header.norm.ship_air = terms.ship_air ? terms.ship_air.v : null;
  header.norm.stock_type = terms.stock_type ? terms.stock_type.v : null;
  header.norm.default_lead_days = terms.lead_time && terms.lead_time.v ? (num(terms.lead_time.v.hi) || num(terms.lead_time.v.lo)) : null;
  header.norm.default_lead_from = terms.lead_time && terms.lead_time.v ? terms.lead_time.v.from : null;
  header.custom = terms.custom || [];

  /* terms-level confidence on the required fields */
  ['currency', 'price_basis', 'certs', 'private_label', 'validity', 'payment'].forEach(function (k) {
    var fld = terms[k];
    if (fld && typeof fld.c === 'number' && fld.c < meta.thresholds.conf_critical && fld.v != null) {
      headerGates.push(gate('CRITICAL_FIELD_LOW_CONF', { scope: 'terms', field: k,
        note: (FIELD_LABELS[k] || k) + ' read with confidence ' + Math.round(fld.c * 100) + '%', proposed: fld.v,
        evidence: fld.ev ? [{ ev: fld.ev, src: fld.src || 'body' }] : [] }));
    }
  });
  if (!val) headerGates.push(gate('CRITICAL_FIELD_MISSING', { scope: 'terms', field: 'validity', note: 'Quote validity not answered' }));
  if (!terms.payment) headerGates.push(gate('CRITICAL_FIELD_MISSING', { scope: 'terms', field: 'payment', note: 'Payment terms not answered' }));

  /* our own custom questions, answered once for the whole RFQ */
  var missingQ = (rfq.custom_questions || []).filter(function (cq) {
    var ans = (terms.custom || []).filter(function (c) { return c.qid === cq.qid; })[0];
    return cq.required && (!ans || ans.v == null || ans.v === '');
  });
  if (missingQ.length) {
    headerGates.push(gate('CRITICAL_FIELD_MISSING', { scope: 'terms', field: 'custom_questions',
      note: missingQ.length + ' of our question(s) were not answered: ' + missingQ.map(function (q) { return q.qid; }).join(', ') }));
  }

  /* line matching */
  var items = rfqItems(rfq);
  var matched = matchLines(items, ai.lines || []);
  var claimedLines = {};
  matched.forEach(function (cand) {
    var al = cand.ai;
    if (!cand.item) {
      quotes.push({ line: null, sku: al.sku || null, product: al.product || 'Unnamed item', item_index: 900 + cand.aiIndex,
        rfq_id: null, rfq_code: rfq.code, ai_line: al, norm: {}, gaps: [{ field: 'match', kind: 'missing', note: 'Matches none of our RFQ lines' }],
        gates: [gate('UNMATCHED_LINE_ITEM', { line: null, note: (al.product || 'This row') + ' matches no line on our RFQ', options: ['Park it', 'Assign to a line', 'Discard'] })],
        checks: [dec('R11', 'UNMATCHED_ITEM', al.product || al.sku || '?')], highlights: [], completeness: null });
      return;
    }
    if (cand.dupOf) {
      quotes.push({ line: cand.item.line, sku: cand.item.sku, product: cand.item.product, item_index: cand.item.line,
        rfq_id: rfq.id, rfq_code: rfq.code, ai_line: al, norm: {}, gaps: [], parked: true,
        gates: [gate('DUP_LINE', { line: cand.item.line, note: 'Another row in the same quote already claims line ' + cand.item.line, evidence: al.ev ? [{ ev: al.ev, src: al.src || 'body' }] : [] })],
        checks: [dec('R11', 'DUP_LINE', 'line ' + cand.item.line)], highlights: [], completeness: null });
      return;
    }
    claimedLines[cand.item.line] = true;
    var item = cand.item;
    var priced = normalizeLinePrice(al, item, cur, meta);
    var q = {
      line: item.line, sku: item.sku, product: item.product, item_index: item.line,
      rfq_id: rfq.id, rfq_code: rfq.code, ai_line: al, norm: {}, gaps: [], gates: [], checks: [], highlights: []
    };
    if (cand.c < 0.9) {
      q.gates.push(gate('LINE_MATCH_LOW_CONF', { line: item.line, note: 'Matched by ' + cand.code.toLowerCase().replace(/_/g, ' ') + ' at ' + Math.round(cand.c * 100) + '% confidence',
        evidence: al.ev ? [{ ev: al.ev, src: al.src || 'body' }] : [] }));
    }
    q.norm.usd_at_target = { v: priced.usd, rule: 'V05+V06+E03', inputs: { raw: priced.priceRaw, cur: cur, factor: priced.factor, tier: priced.tierUsed } };
    if (priced.unitNote) q.gates.push(gate('UNIT_CONVERTED', { line: item.line, field: 'price', note: priced.unitNote, proposed: 'divide by ' + priced.factor }));
    if (priced.interpolated && priced.tierUsed) q.gates.push(gate('TIER_INTERPOLATED', { line: item.line, field: 'price', note: 'No tier covers ' + item.qty + '; used their ' + priced.tierUsed.qmin + '+ tier of ' + priced.tierUsed.p }));
    if (priced.usd == null && al.range) {
      q.gates.push(gate('PRICE_RANGE_ONLY', { line: item.line, field: 'price', note: 'Quoted as ' + al.range.lo + ' to ' + al.range.hi + ', no firm figure', evidence: al.ev ? [{ ev: al.ev, src: al.src || 'body' }] : [] }));
      q.gaps.push({ field: 'price', kind: 'partial', note: 'Only a price range was given', ev: al.ev, src: al.src });
    } else if (priced.usd == null) {
      q.gaps.push({ field: 'price', kind: 'missing', note: 'No price given for this line' });
    }
    var moq = al.moq || null, moqPcs = null;
    if (moq && num(moq.n) != null) {
      var mu = String(moq.u || item.unit).toLowerCase();
      if (/ctn|carton|箱/.test(mu)) moqPcs = moq.pack ? moq.n * moq.pack : null;
      else if (/dozen/.test(mu)) moqPcs = moq.n * 12;
      else moqPcs = moq.n;
    }
    q.norm.moq_pcs = { v: moqPcs, rule: 'V06', inputs: moq };
    if (moqPcs == null) q.gaps.push({ field: 'moq', kind: moq ? 'ambiguous' : 'missing', note: moq ? 'Minimum given with no usable quantity' : 'No minimum order stated for this line' });

    var lt = al.lt || null;
    q.norm.lead_days = { v: lt ? (num(lt.hi) || num(lt.lo)) : header.norm.default_lead_days, from: lt ? lt.from : header.norm.default_lead_from, rule: lt ? 'V04' : 'terms' };
    if (q.norm.lead_days.v == null) q.gaps.push({ field: 'lead_time', kind: 'missing', note: 'No lead time given for this line, and none on the general terms either' });

    q.norm.expiry = header.norm.expiry;
    q.norm.incoterm = header.norm.incoterm;
    q.norm.currency = header.norm.currency;
    q.norm.certs_canon = header.norm.certs_canon;
    q.norm.private_label = header.norm.private_label;

    if (al.note) q.gaps.push({ field: 'note', kind: 'note', note: al.note });
    if (al.ev) {
      var evOk = evidenceOk(al.ev, sources);
      if (evOk.status === 'ok') q.highlights.push({ ev: al.ev, src: evOk.src, why: 'Line ' + item.line + ' · ' + item.sku, sev: 'info' });
    }
    quotes.push(q);
  });

  /* RFQ lines nobody quoted */
  var unquotedItems = items.filter(function (it) { return !claimedLines[it.line]; });
  if (unquotedItems.length) {
    var linesEntries = unquotedItems.map(function (it) { return { line: it.line, quote_id: null, proposed: null, evidence: [], status: 'open', resolution: null }; });
    headerGates.push(gate('LINES_NOT_QUOTED', { scope: 'lines', lines: linesEntries, note: 'Skipped ' + unquotedItems.length + ' of ' + items.length + ' lines: ' + unquotedItems.slice(0, 6).map(function (it) { return it.sku; }).join(', ') + (unquotedItems.length > 6 ? '…' : '') }));
    unquotedItems.forEach(function (it) {
      quotes.push({ line: it.line, sku: it.sku, product: it.product, item_index: it.line, rfq_id: rfq.id, rfq_code: rfq.code,
        ai_line: null, norm: {}, gaps: [{ field: 'line', kind: 'not_quoted', note: 'Not quoted by this supplier' }], gates: [],
        checks: [dec('R11', 'NOT_QUOTED', it.sku)], highlights: [], not_quoted: true, completeness: 0 });
    });
  }

  (ai.needs_human || []).forEach(function (n) {
    if (!REASONS[n.code]) return;
    headerGates.push(gate(n.code, { note: n.note || '', evidence: n.evs || [], raised_by: 'ai' }));
  });
  (ai.flags || []).forEach(function (fl) {
    if (fl.code === 'SPEC_DEVIATION') {
      var target = quotes.filter(function (q) { return fl.line != null ? q.line === fl.line : false; })[0];
      var g = gate('SPEC_DEVIATION', { line: fl.line || null, note: fl.note, evidence: fl.ev ? [{ ev: fl.ev, src: fl.src || 'body' }] : [], raised_by: 'ai' });
      if (target) target.gates.push(g); else headerGates.push(g);
    }
  });

  gates = headerGates;
  return { ok: true, checks: checks, gates: gates, quotes: quotes, header: header, sv: 2 };
}

/* ---- dispatcher ------------------------------------------------------- */

function validate(ai, email, rfq, pre, ctx) {
  if (ai && ai.sv === 2) return validateV2(ai, email, rfq, pre, ctx);
  return validateV1(ai, email, rfq, pre, ctx);
}

/* ==== OVERRIDES ======================================================= */

function applyOverrides(quote, overrides) {
  var q = quote;
  Object.keys(overrides || {}).forEach(function (k) {
    var o = overrides[k];
    if (k === 'usd_at_target') q.norm.usd_at_target = { v: num(o.v), rule: 'human', by: o.by, reason: o.reason };
    else if (k === 'moq_pcs') q.norm.moq_pcs = { v: num(o.v), rule: 'human', by: o.by, reason: o.reason };
    else if (k === 'private_label') q.norm.private_label = { v: o.v, rule: 'human', by: o.by, reason: o.reason };
    else if (k === 'incoterm') q.norm.incoterm = { v: o.v, rule: 'human', by: o.by, reason: o.reason };
    else if (k === 'certs_canon') q.norm.certs_canon = { v: o.v, rule: 'human', by: o.by, reason: o.reason, unverified: [] };
    else if (k === 'expiry') q.norm.expiry = { v: o.v, rule: 'human', by: o.by, reason: o.reason };
    else q.norm[k] = { v: o.v, rule: 'human', by: o.by, reason: o.reason };
  });
  return q;
}

/* ==== ELIGIBILITY ===================================================== */
/* v2: groups quotes by RFQ line before computing the median / cheapest / outlier check, so a
   30-line RFQ scores each line against its own competing quotes rather than the whole basket.
   A legacy single-line RFQ always has exactly one group, which reproduces the original
   single-lens numbers exactly — this is the same function used before, just grouped. */

function eligibility(quotes, rfq, ctx) {
  var meta = ctx.meta, now = ctx.now || meta.demo_now;
  var log = [];

  var byLine = {};
  quotes.forEach(function (q) {
    var item = rfqItemFor(rfq, q);
    var key = item ? item.line : (q.line != null ? q.line : 'none');
    (byLine[key] = byLine[key] || { item: item, quotes: [] }).quotes.push(q);
  });

  var perLine = [];
  Object.keys(byLine).forEach(function (lineKey) {
    var group = byLine[lineKey], item = group.item;
    var prices = group.quotes.map(function (q) { return q.norm.usd_at_target && q.norm.usd_at_target.v; }).filter(function (p) { return p != null; });
    var med = median(prices);

    group.quotes.forEach(function (q) {
      var checks = [], status = 'eligible', reasons = [], soft = [];

      var NON_BLOCKING = { WINNER_APPROVAL: 1, COMPARISON_STALE: 1, SINGLE_CANDIDATE: 1 };
      var open = (q.openGates || []).filter(function (g) { return g.status !== 'resolved' && g.status !== 'dismissed' && !NON_BLOCKING[g.code]; });
      if (q.not_quoted) { status = 'not_quoted'; reasons = ['Not quoted by this supplier']; }
      else if (q.parked) { status = 'parked'; reasons = ['Duplicate row in the same quote']; }
      else if (open.length) {
        status = 'needs_review'; reasons.push(open.length + ' open question' + (open.length > 1 ? 's' : ''));
        checks.push(dec('E00', 'BLOCKED_PENDING_REVIEW', open.map(function (g) { return g.code; }).join(', ')));
      } else checks.push(dec('E00', 'NO_OPEN_GATES', 'Nothing waiting on a person'));

      if (status !== 'not_quoted' && status !== 'parked') {
        var pl = q.norm.private_label && q.norm.private_label.v;
        if (!rfq.pl_required) checks.push(dec('E01', 'PL_NOT_REQUIRED', 'This RFQ does not need private label'));
        else if (pl === 'yes') checks.push(dec('E01', 'PL_PASS', 'Private label confirmed'));
        else if (pl == null) { status = 'disqualified'; reasons.push('Private label never confirmed'); checks.push(dec('E01', 'PL_FAIL_MISSING', 'No answer')); }
        else { status = 'disqualified'; reasons.push('No private label'); checks.push(dec('E01', 'PL_FAIL', String(pl))); }

        var held = (q.norm.certs_canon && q.norm.certs_canon.v) || [];
        var missing = (rfq.required_certs || []).filter(function (c) { return held.indexOf(c) === -1; });
        if (!missing.length) checks.push(dec('E02', 'CERT_PASS', held.join(', ') || 'none required'));
        else { status = 'disqualified'; reasons.push('Missing ' + missing.join(', ')); checks.push(dec('E02', 'CERT_FAIL', 'Missing ' + missing.join(', '))); }

        var p = q.norm.usd_at_target && q.norm.usd_at_target.v;
        var band = item ? item.target_usd_fob : (rfq.target_usd_fob || { lo: 0, hi: 0 });
        var targetQty = item ? item.qty : rfq.target_qty;
        if (p == null) {
          if (status !== 'disqualified') status = 'needs_review';
          reasons.push('No comparable price'); checks.push(dec('E03', 'PRICE_UNDETERMINED', 'Nothing to compare'));
        } else if (p >= band.lo && p <= band.hi) {
          checks.push(dec('E03', 'BAND_PASS', 'USD ' + round4(p) + ' is inside ' + band.lo + '-' + band.hi));
        } else if (p > band.hi) {
          status = 'disqualified'; reasons.push('USD ' + round4(p) + ' is above our ceiling of ' + band.hi); checks.push(dec('E03', 'BAND_FAIL_HIGH', 'USD ' + round4(p)));
        } else {
          soft.push('Below our floor of ' + band.lo); checks.push(dec('E03', 'BAND_PASS_LOW', 'USD ' + round4(p) + ' is under the range'));
        }

        var inc = q.norm.incoterm && q.norm.incoterm.v;
        if (inc === 'FOB' || inc === 'FCA') checks.push(dec('E04', 'BASIS_PASS', inc));
        else if (q.norm.usd_at_target && q.norm.usd_at_target.rule === 'human') checks.push(dec('E04', 'BASIS_NORMALISED_BY_HUMAN', String(inc) + ' adjusted to FOB'));
        else if (inc == null) { soft.push('Incoterm not stated'); checks.push(dec('E04', 'BASIS_UNKNOWN', 'none')); }
        else { if (status === 'eligible') status = 'needs_review'; reasons.push(inc + ' price, not FOB'); checks.push(dec('E04', 'BASIS_FAIL', inc)); }

        var exp = q.norm.expiry && q.norm.expiry.v;
        if (!exp) { soft.push('No validity stated'); checks.push(dec('E05', 'VALIDITY_UNKNOWN', 'none')); }
        else if (dayjs(exp) >= dayjs(now)) checks.push(dec('E05', 'VALID', 'Valid to ' + exp));
        else {
          if (status === 'eligible') status = 'needs_review';
          reasons.push('Expired ' + exp); checks.push(dec('E05', 'EXPIRED', exp));
          q.expiredGate = gate('VALIDITY_EXPIRED', { scope: q.rfq_id && item && rfqItems(rfq).length > 1 ? 'terms' : null, field: 'validity', note: 'Expired on ' + exp + ', today is ' + now, options: ['Ask for a re-quote', 'Waive and keep'] });
        }

        var mo = q.norm.moq_pcs && q.norm.moq_pcs.v;
        if (mo == null) { soft.push('Minimum order unknown'); checks.push(dec('E06', 'MOQ_UNKNOWN', 'none')); }
        else if (targetQty == null || mo <= targetQty) checks.push(dec('E06', 'MOQ_PASS', mo + ' <= ' + targetQty));
        else {
          if (status === 'eligible') status = 'needs_review';
          reasons.push('Minimum order ' + mo + ' is above our ' + targetQty); checks.push(dec('E06', 'MOQ_HIGH', mo + ' > ' + targetQty));
          q.moqGate = gate('MOQ_EXCEEDS_TARGET', { line: item ? item.line : null, field: 'moq', note: 'They need ' + mo + ', we want ' + targetQty, options: ['Negotiate the minimum', 'Raise our quantity', 'Exclude'] });
        }

        if (p != null && med != null && prices.length > 2) {
          var ratio = p / med;
          if (ratio < meta.thresholds.outlier_lo || ratio > meta.thresholds.outlier_hi) {
            if (status === 'eligible') status = 'needs_review';
            reasons.push('Price is ' + Math.round(ratio * 100) + '% of the median'); checks.push(dec('E07', 'OUTLIER', round2(ratio) + 'x median of ' + round4(med)));
            q.outlierGate = gate('PRICE_OUTLIER', { line: item ? item.line : null, field: 'price', note: 'USD ' + round4(p) + ' against a median of USD ' + round4(med) + ' for this line. Usually a unit, currency or scope error.' });
          } else checks.push(dec('E07', 'PRICE_PLAUSIBLE', round2(ratio) + 'x median'));
        }

        var ld = q.norm.lead_days && q.norm.lead_days.v;
        if (ld != null && rfq.max_lead_days && ld > rfq.max_lead_days) {
          soft.push(ld + ' day lead time, we asked for ' + rfq.max_lead_days); checks.push(dec('E08', 'LEAD_FLAG', ld + ' > ' + rfq.max_lead_days));
        } else if (ld != null) checks.push(dec('E08', 'LEAD_OK', ld + ' days'));
      }

      if (q.superseded_by) { status = 'superseded'; reasons = ['Replaced by a later quote']; }
      if (q.kind === 'clarification') { status = 'awaiting'; reasons = ['Supplier asked us questions first']; }

      q.eligibility = { status: status, reasons: reasons, soft: soft, checks: checks, median: med };
      log = log.concat(checks.map(function (c) { return { quote: q.id || q.item_index, rule: c.rule, decision: c.decision, detail: c.detail }; }));
    });

    var eligibleHere = group.quotes.filter(function (q) { return q.eligibility.status === 'eligible'; });
    var cheapestHere = null;
    eligibleHere.forEach(function (q) {
      var p = q.norm.usd_at_target.v;
      if (p != null && (cheapestHere === null || p < cheapestHere.norm.usd_at_target.v)) cheapestHere = q;
    });
    perLine.push({ line: lineKey === 'none' ? null : (isNaN(lineKey) ? lineKey : Number(lineKey)), item: item, quotes: group.quotes, eligible: eligibleHere, cheapest: cheapestHere, median: med });
  });

  var eligible = quotes.filter(function (q) { return q.eligibility.status === 'eligible'; });
  var summary;
  if (!eligible.length) summary = dec('E09', 'NO_CANDIDATES', 'Nothing passes the hard criteria yet');
  else if (eligible.length === 1) summary = dec('E09', 'SINGLE_CANDIDATE', eligible[0].supplier_name || eligible[0].id);
  else summary = dec('E09', 'RUN_AI', eligible.length + ' quotes to rank');
  log.push(summary);

  var cheapest = perLine.length === 1 ? perLine[0].cheapest : null;
  var median_ = perLine.length === 1 ? perLine[0].median : null;
  if (cheapest) log.push(dec('E10', 'CHEAPEST', (cheapest.supplier_name || cheapest.id) + ' at USD ' + round4(cheapest.norm.usd_at_target.v)));

  return { quotes: quotes, eligible: eligible, cheapest: cheapest, median: median_, summary: summary, log: log, perLine: perLine };
}

/* ==== EVAL ============================================================ */

function evalQuote(quote, expected, actualGates) {
  if (!expected) return null;
  var rows = [], tol = { price_at_target_usd: 0.02 };
  var map = {
    price_at_target_usd: quote.norm.usd_at_target && quote.norm.usd_at_target.v,
    moq_pcs: quote.norm.moq_pcs && quote.norm.moq_pcs.v,
    lead_lo: quote.norm.lead_days && quote.norm.lead_days.v,
    lead_hi: quote.norm.lead_days && quote.norm.lead_days.v,
    incoterm: quote.norm.incoterm && quote.norm.incoterm.v,
    currency: quote.norm.currency && quote.norm.currency.v,
    certs_canon: quote.norm.certs_canon && quote.norm.certs_canon.v,
    pl: quote.norm.private_label && quote.norm.private_label.v
  };
  Object.keys(expected.fields || {}).forEach(function (k) {
    var want = expected.fields[k], got = map[k], pass;
    if (Array.isArray(want)) {
      var g = (got || []).slice().sort().join(','), w = want.slice().sort().join(',');
      pass = g === w;
    } else if (typeof want === 'number') pass = got != null && Math.abs(got - want) <= (tol[k] || 0.001);
    else pass = (got == null && want == null) || String(got) === String(want);
    rows.push({ kind: 'field', key: k, want: want, got: got, pass: pass });
  });
  var actual = uniq((actualGates || []).map(function (g) { return g.code; }));
  (expected.gates || []).forEach(function (code) {
    rows.push({ kind: 'gate', key: code, want: 'raised', got: actual.indexOf(code) > -1 ? 'raised' : 'not raised', pass: actual.indexOf(code) > -1 });
  });
  actual.forEach(function (code) {
    if ((expected.gates || []).indexOf(code) === -1) rows.push({ kind: 'gate', key: code, want: 'not expected', got: 'raised', pass: null });
  });
  var scored = rows.filter(function (r) { return r.pass !== null; });
  return { rows: rows, passed: scored.filter(function (r) { return r.pass; }).length, total: scored.length };
}

/* ==== v2: SUPPLEMENT MERGING (pure patch computation; pipeline.js applies it to the store) === */

/* Given a v2 AI reading of a follow-up email and the quotes already on file for that supplier's
   header, work out what may be filled automatically and what conflicts and needs a person.
   Never touches a firm value that already exists — that is the one rule this function exists
   to enforce (a supplement can fill gaps, it can never silently overwrite a stated price). */
function computeSupplementPatch(ai, header, lineQuotes, rfq, meta) {
  var patch = { header: {}, lines: {}, conflicts: [], filled: [] };
  var terms = (ai && ai.terms) || {};

  function fillHeader(field, val, from) {
    if (val == null) return;
    var have = header.norm[field] && header.norm[field].v;
    if (have == null || have === '' || (Array.isArray(have) && !have.length)) {
      patch.header[field] = val; patch.filled.push({ scope: 'terms', field: field, from: from });
    }
  }
  if (terms.validity && terms.validity.v) {
    var v = terms.validity.v, expiry = v.until ? String(v.until).slice(0, 10) : (num(v.days) != null ? addDays(ai._email_date || meta.demo_now, v.days) : null);
    fillHeader('expiry', expiry, 'supplement');
  }
  if (terms.payment && terms.payment.v) {
    var payTxt = terms.payment.v.terms || terms.payment.v;
    var already = header.norm.payment;
    if (!already) fillHeader('payment', terms.payment.v, 'supplement');
    else if (PAYMENT_RISK_RE.test(String(already.terms || already)) && !PAYMENT_RISK_RE.test(String(payTxt))) {
      patch.header.payment = terms.payment.v; patch.filled.push({ scope: 'terms', field: 'payment', from: 'supplement', note: 'Risk resolved by the follow-up' });
    }
  }
  if (terms.sample && terms.sample.v) fillHeader('sample', terms.sample.v, 'supplement');
  if (terms.ship_sea && terms.ship_sea.v) fillHeader('ship_sea', terms.ship_sea.v, 'supplement');
  if (terms.ship_air && terms.ship_air.v) fillHeader('ship_air', terms.ship_air.v, 'supplement');
  if (terms.certs && Array.isArray(terms.certs.v)) {
    terms.certs.v.forEach(function (c) {
      var canon = c.canon || canonCert(c.name);
      if (canon && c.doc && (header.norm.certs_canon.unverified || []).indexOf(canon) > -1) {
        patch.filled.push({ scope: 'terms', field: 'certs:' + canon, from: 'supplement', note: 'Now verified with a document/number' });
        (patch.header.certs_now_verified = patch.header.certs_now_verified || []).push(canon);
      }
    });
  }

  var byLine = {};
  (ai.lines || []).forEach(function (al) { if (al.line != null) byLine[al.line] = al; else if (al.sku) byLine['sku:' + normSku(al.sku)] = al; });

  Object.keys(lineQuotes).forEach(function (lineKey) {
    var q = lineQuotes[lineKey];
    var al = byLine[q.line] || (q.sku ? byLine['sku:' + normSku(q.sku)] : null);
    if (!al) return;
    var linePatch = {};

    if ((q.norm.usd_at_target.v == null || (q.gaps || []).some(function (g) { return g.field === 'price' && g.kind === 'partial'; })) && (al.p && al.p.length)) {
      linePatch.price_filled = true; patch.filled.push({ scope: 'line', line: q.line, field: 'price', from: 'supplement' });
    } else if (q.norm.usd_at_target.v != null && al.p && al.p.length) {
      var newlyPriced = normalizeLinePrice(al, rfqItems(rfq).filter(function (it) { return it.line === q.line; })[0], header.norm.currency.v, meta);
      if (newlyPriced.usd != null && Math.abs(newlyPriced.usd - q.norm.usd_at_target.v) > 0.005) {
        patch.conflicts.push({ line: q.line, field: 'price', original: q.norm.usd_at_target.v, incoming: newlyPriced.usd, ev: al.ev });
      }
    }
    if (q.norm.moq_pcs.v == null && al.moq) { linePatch.moq = al.moq; patch.filled.push({ scope: 'line', line: q.line, field: 'moq', from: 'supplement' }); }
    if (q.norm.lead_days.v == null && al.lt) { linePatch.lt = al.lt; patch.filled.push({ scope: 'line', line: q.line, field: 'lead_time', from: 'supplement' }); }
    if (Object.keys(linePatch).length) { linePatch.ai_line = al; patch.lines[q.line] = linePatch; }
  });

  return patch;
}

root.RULES = {
  REASONS: REASONS, CRITICAL_FIELDS: CRITICAL_FIELDS, FIELD_LABELS: FIELD_LABELS, CERT_CANON: CERT_CANON, TERM_FIELDS: TERM_FIELDS,
  byteLen: byteLen, normText: normText, hash: hash, splitQuoted: splitQuoted, findCodes: findCodes,
  parseUnit: parseUnit, canonCert: canonCert, fxToUsd: fxToUsd, addDays: addDays, median: median,
  round2: round2, round4: round4, domainOf: domainOf, evidenceOk: evidenceOk, gate: gate, dec: dec,
  preRules: preRules, validate: validate, applyOverrides: applyOverrides, eligibility: eligibility,
  evalQuote: evalQuote,
  /* v2 */
  normalizeRfq: normalizeRfq, rfqItems: rfqItems, rfqItemFor: rfqItemFor,
  unfuzz: unfuzz, normSku: normSku, editDistance: editDistance, diceSimilarity: diceSimilarity, matchLines: matchLines,
  normalizeLinePrice: normalizeLinePrice, computeSupplementPatch: computeSupplementPatch
};

})(typeof window !== 'undefined' ? window : globalThis);
