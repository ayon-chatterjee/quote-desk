/* RFQ Quote Intelligence — orchestration.
   Sequences the three lanes for one email, and runs a comparison for one RFQ.
   The AI calls are injected so the node tests and the no-AI page use the same path.
   v2 adds: quote_headers (one per email, shared terms for a multi-line quote), coalesced
   reviews (one review can name several lines instead of one row per line), supplement
   merging (a follow-up reply fills gaps without creating a new quote or superseding the
   original), and per-RFQ award suggestions. The original v1 `finish()` — used by every
   existing single-product RFQ and by all 106 pre-existing tests — is untouched. */
(function (root) {
'use strict';

var R = root.RULES, P = root.PROMPTS;

function newStore(seed, opts) {
  var blank = !!(opts && opts.blank);
  return {
    meta: JSON.parse(JSON.stringify(seed.meta)),
    rfqs: blank ? [] : JSON.parse(JSON.stringify(seed.rfqs)),
    suppliers: seed.suppliers.slice(),
    buyer: seed.buyer,
    emails: [], quotes: [], quote_headers: [], reviews: [], comparisons: [], logs: [], evals: [], replies: [],
    awards: {} /* rfqId -> { lines: { '<line>': {quote_id, lens, by, at, reason} } } */
  };
}

function sup(store, id) { return store.suppliers.filter(function (s) { return s.id === id; })[0] || null; }
function rfqById(store, id) { return store.rfqs.filter(function (r) { return r.id === id; })[0] || null; }
function headerById(store, id) { return store.quote_headers.filter(function (h) { return h.id === id; })[0] || null; }
var LOG_CAP = 600;
function log(store, subject, entry) {
  var bucket = store.logs.filter(function (l) { return l.id === subject; })[0];
  if (!bucket) { bucket = { id: subject, entries: [], count: 0 }; store.logs.push(bucket); }
  if (bucket.entries.length < LOG_CAP) bucket.entries.push(entry);
  bucket.count++;
  return entry;
}
function nowIso() { return new Date().toISOString(); }

/* Deterministic review ids: a coalesced (scope-carrying) gate always resolves to the same
   id for the same email/header + code + field, so raising it again (a second sync, a
   second pass over the same email) merges into the existing review instead of duplicating
   it. A plain v1 per-quote gate keeps a unique id per quote via `item`/`line`/quote_id. */
function reviewId(g, ctx) {
  var base = ctx.header_id || ctx.email_id || ctx.quote_id || 'x';
  var codePart = g.code.toLowerCase();
  var fieldPart = g.field ? '_' + String(g.field).replace(/[^a-z0-9]/gi, '') : '';
  var scopePart = g.scope ? '_' + g.scope
    : (g.item != null ? '_i' + g.item : (g.line != null ? '_l' + g.line : (ctx.quote_id ? '_q' : '')));
  return ('rv_' + base + '_' + codePart + fieldPart + scopePart).slice(0, 140);
}

function openReview(store, g, ctx) {
  var id = reviewId(g, ctx);
  var existing = store.reviews.filter(function (r) { return r.id === id; })[0];
  if (existing) {
    if (g.lines && g.lines.length) {
      var have = {}; (existing.lines || []).forEach(function (l) { have[l.line] = 1; });
      var addedNew = false;
      g.lines.forEach(function (l) { if (!have[l.line]) { existing.lines.push(Object.assign({}, l)); addedNew = true; } });
      if (addedNew) { if (existing.status !== 'open') existing.status = 'open'; existing.note = g.note || existing.note; existing.rev = (existing.rev || 1) + 1; }
      return existing;
    }
    return existing; /* idempotent: the same event raising the same gate twice is a no-op */
  }
  var rv = {
    id: id, code: g.code, severity: g.severity, question: g.question, note: g.note,
    field: g.field, item: g.item, line: g.line, scope: g.scope || null,
    lines: g.lines ? g.lines.map(function (l) { return Object.assign({}, l); }) : null,
    evidence: g.evidence || [], proposed: g.proposed, options: g.options, raised_by: g.raised_by || 'rule',
    email_id: ctx.email_id || null, quote_id: ctx.quote_id || null, rfq_id: ctx.rfq_id || null, header_id: ctx.header_id || null,
    status: 'open', resolution: null, created_at: nowIso(), rev: 1
  };
  store.reviews.push(rv);
  return rv;
}

/* ---- one email through the pipeline --------------------------------- */

function processEmail(email, store, opts) {
  opts = opts || {};
  var ctx = {
    meta: store.meta, rfqs: store.rfqs, suppliers: store.suppliers,
    seen: store.emails.map(function (e) { return { id: e.id, hash: e.hash }; }),
    priorQuotes: store.quotes,
    imagesSupported: opts.imagesSupported
  };
  var t0 = Date.now();
  var pre = R.preRules(email, ctx);
  pre.decisions.forEach(function (d) { log(store, email.id, { t: nowIso(), lane: 'rule', step: d.rule, decision: d.decision, detail: d.detail }); });

  var rec = {
    id: email.id, sample_id: email.sample_id || null, from: email.from, from_name: email.from_name,
    to: email.to, date: email.date, subject: email.subject, in_reply_to: email.in_reply_to || null,
    body_raw: email.body_raw, body_new: pre.body_new, body_quoted: pre.body_quoted,
    attachments: email.attachments || [], hash: pre.hash, format: email.format,
    supplier_id: pre.supplier_id, rfq_id: pre.rfq_id, match: pre.match,
    pre_rules: pre.decisions, status: 'received', kind: null, is_supplement: pre.is_supplement,
    source: null, prompt_bytes: null, model_tier: null, duration_ms: null, label: 'reading'
  };
  store.emails.push(rec);

  if (pre.skip_ai) {
    rec.status = 'duplicate'; rec.duplicate_of = pre.duplicate_of; rec.label = 'duplicate';
    log(store, email.id, { t: nowIso(), lane: 'rule', step: 'R01', decision: 'SKIP_AI', detail: 'Duplicate of ' + pre.duplicate_of + ', no reader call made' });
    return Promise.resolve({ email: rec, quotes: [], reviews: [], pre: pre });
  }

  var rfq = pre.rfq_id ? rfqById(store, pre.rfq_id) : null;
  if (rfq) R.normalizeRfq(rfq);

  var matchStep = Promise.resolve(null);
  if (!rfq && opts.match) {
    var mb = P.buildMatch(email, pre, store.rfqs, store.meta);
    matchStep = opts.match(mb, email).then(function (m) {
      if (!m) return null;
      log(store, email.id, { t: nowIso(), lane: 'ai', step: 'match', decision: m.rfqCode || 'NO_MATCH', detail: (m.why || '') + ' (confidence ' + Math.round((m.c || 0) * 100) + '%)' });
      if (m.rfqCode) {
        var r = store.rfqs.filter(function (x) { return x.code === m.rfqCode; })[0];
        if (r) {
          rec.rfq_id = r.id; rec.match = { code: r.code, how: 'inferred', c: m.c || 0, why: m.why, lane: 'ai' };
          if ((m.c || 0) < store.meta.thresholds.match_conf) {
            pre.gates.push(R.gate('RFQ_MATCH_LOW_CONF', {
              note: 'Matched to ' + r.code + ' at ' + Math.round((m.c || 0) * 100) + '% — ' + (m.why || ''),
              proposed: r.code,
              options: store.rfqs.filter(function (x) { return x.status === 'open'; }).map(function (x) { return x.code; })
            }));
          }
          return r;
        }
      }
      pre.gates.push(R.gate('RFQ_MATCH_LOW_CONF', { note: 'No open enquiry fits this email', proposed: null }));
      return null;
    });
  }

  return matchStep.then(function (matched) {
    if (matched) rfq = R.normalizeRfq(matched);
    var pb = P.buildExtract(email, rfq, pre, store.meta);
    log(store, email.id, { t: nowIso(), lane: 'rule', step: pb.decision.rule, decision: pb.decision.decision, detail: pb.decision.detail });
    if (pb.over) {
      var g = R.gate('EXTRACTION_FAILED_MANUAL_ENTRY', { note: 'The email is too large to read in one pass (' + pb.bytes + ' bytes)' });
      rec.status = 'failed'; rec.label = 'manual';
      return { email: rec, quotes: [], reviews: [openReview(store, g, { email_id: rec.id, rfq_id: rec.rfq_id })], pre: pre };
    }
    rec.prompt_bytes = pb.bytes;
    return opts.extract(pb, email, rfq, pre).then(function (out) {
      rec.source = out.source; rec.model_tier = out.tier || null; rec.duration_ms = Date.now() - t0;
      log(store, email.id, {
        t: nowIso(), lane: out.source === 'reference' ? 'rule' : 'ai', step: 'extract',
        decision: out.source === 'reference' ? 'REFERENCE_READ' : 'AI_READ',
        detail: (out.tier ? 'tier ' + out.tier + ', ' : '') + pb.bytes + ' bytes in, ' + (Date.now() - t0) + ' ms'
      });
      var isV2 = out.ai && out.ai.sv === 2;
      var doFinish = isV2 ? finishV2 : finish;
      return doFinish(out.ai, rec, rfq, pre, store, opts);
    }, function (err) {
      rec.status = 'failed'; rec.label = 'manual'; rec.error = err && (err.code || err.message) || 'unknown';
      log(store, email.id, { t: nowIso(), lane: 'ai', step: 'extract', decision: 'FAILED', detail: rec.error });
      var g = R.gate('EXTRACTION_FAILED_MANUAL_ENTRY', { note: 'The reader failed: ' + rec.error });
      return { email: rec, quotes: [], reviews: [openReview(store, g, { email_id: rec.id, rfq_id: rec.rfq_id })], pre: pre };
    });
  });
}

/* ==== V1 finish (single-product RFQs) — unchanged ====================== */

function finish(ai, rec, rfq, pre, store, opts) {
  var ctx = { meta: store.meta, rfqs: store.rfqs, suppliers: store.suppliers };
  var v = R.validate(ai, rec, rfq, pre, ctx);
  v.checks.forEach(function (c) { log(store, rec.id, { t: nowIso(), lane: 'rule', step: c.rule, decision: c.decision, detail: c.detail }); });
  rec.kind = ai && ai.kind || 'other';

  if (!v.ok) {
    rec.status = 'failed'; rec.label = 'manual';
    var rv = v.gates.map(function (g) { return openReview(store, g, { email_id: rec.id, rfq_id: rec.rfq_id }); });
    return { email: rec, quotes: [], reviews: rv, pre: pre, ai: ai };
  }

  var supplier = sup(store, rec.supplier_id);
  var madeQuotes = [], madeReviews = [];

  // gates raised before any quote exists (sender, code, duplicates, matching)
  pre.gates.forEach(function (g) { madeReviews.push(openReview(store, g, { email_id: rec.id, rfq_id: rec.rfq_id })); });

  if (rec.kind === 'clarification' || rec.kind === 'decline' || !v.quotes.length) {
    rec.status = rec.kind === 'clarification' ? 'non_quote' : (v.quotes.length ? 'extracted' : 'non_quote');
    rec.label = rec.kind === 'clarification' ? 'manual' : 'processed';
    (ai.needs_human || []).forEach(function (n) {
      if (!R.REASONS[n.code]) return;
      madeReviews.push(openReview(store, R.gate(n.code, { note: n.note, evidence: n.evs || [], raised_by: 'ai' }), { email_id: rec.id, rfq_id: rec.rfq_id }));
    });
    return withReply({ email: rec, quotes: [], reviews: madeReviews, pre: pre, ai: ai }, rec, null, store, opts);
  }

  v.quotes.forEach(function (q, i) {
    q.id = rec.id.replace('em_', 'q_') + (v.quotes.length > 1 ? '_' + (i + 1) : '');
    q.email_id = rec.id;
    q.supplier_id = rec.supplier_id;
    q.supplier_name = supplier ? supplier.name : rec.from_name;
    q.supplier_role = supplier ? supplier.role : 'unknown';
    q.supplier_city = supplier ? supplier.city : null;
    q.kind = rec.kind;
    q.date = rec.date;
    q.format = rec.format;
    q.overrides = {};
    q.humanNotes = [];
    q.updated_at = nowIso();
    q.rev = 1;
    q.prompt_bytes = rec.prompt_bytes;
    q.model_tier = rec.model_tier;
    q.source = rec.source;

    // R06 supersede
    var supersedeDec = pre.decisions.filter(function (d) { return d.rule === 'R06' && d.decision === 'AUTO_SUPERSEDE'; })[0];
    if (supersedeDec && q.rfq_id) {
      (supersedeDec.supersedes || []).forEach(function (oldId) {
        var old = store.quotes.filter(function (x) { return x.id === oldId; })[0];
        if (old && old.rfq_id === q.rfq_id) {
          old.superseded_by = q.id;
          q.supersedes = oldId;
          store.comparisons.forEach(function (c) {
            if (c.rfq_id === q.rfq_id && c.status === 'done') {
              c.status = 'stale';
              madeReviews.push(openReview(store, R.gate('COMPARISON_STALE', { note: 'A revised quote from ' + q.supplier_name + ' arrived after this comparison ran' }), { email_id: rec.id, rfq_id: q.rfq_id }));
            }
          });
        }
      });
    }

    q.gates.forEach(function (g) { madeReviews.push(openReview(store, g, { email_id: rec.id, quote_id: q.id, rfq_id: q.rfq_id })); });
    store.quotes.push(q);
    madeQuotes.push(q);
  });

  rec.status = 'extracted';
  rec.label = madeReviews.some(function (r) { return r.status === 'open' && r.severity === 'crit'; }) ? 'manual' : 'processed';
  rec.quote_ids = madeQuotes.map(function (q) { return q.id; });

  // line items that matched no enquiry are parked, not judged
  store.quotes.forEach(function (q) {
    if (!q.rfq_id && !q.eligibility) {
      q.eligibility = { status: 'parked', reasons: ['Not linked to any enquiry'], soft: [], checks: [], median: null };
    }
  });
  // eligibility pass so the dashboard has a status straight away
  store.rfqs.forEach(function (r) { refreshEligibility(store, r.id); });

  // eval against the sample's expected result
  if (rec.sample_id && opts.expected && opts.expected[rec.sample_id] && madeQuotes.length) {
    var primary = madeQuotes.filter(function (q) { return q.rfq_id === rec.rfq_id; })[0] || madeQuotes[0];
    var allGates = store.reviews.filter(function (rv) { return rv.email_id === rec.id; });
    var ev = R.evalQuote(primary, opts.expected[rec.sample_id], allGates);
    if (ev) {
      ev.sample_id = rec.sample_id; ev.at = nowIso(); ev.source = rec.source;
      ev.prompt_version = store.meta.prompt_versions.extract;
      store.evals.push(ev);
      log(store, rec.id, { t: nowIso(), lane: 'rule', step: 'V13', decision: ev.passed === ev.total ? 'EVAL_PASS' : 'EVAL_PARTIAL', detail: ev.passed + ' of ' + ev.total + ' expectations met' });
    }
  }

  var primaryQ = madeQuotes.filter(function (q) { return q.rfq_id === rec.rfq_id; })[0] || madeQuotes[0] || null;
  return withReply({ email: rec, quotes: madeQuotes, reviews: madeReviews, pre: pre, ai: ai }, rec, primaryQ, store, opts);
}

/* ==== V2 finish (multi-line RFQs) ======================================= */

function finishV2(ai, rec, rfq, pre, store, opts) {
  var ctx = { meta: store.meta, rfqs: store.rfqs, suppliers: store.suppliers };
  var v = R.validate(ai, rec, rfq, pre, ctx);
  v.checks.forEach(function (c) { log(store, rec.id, { t: nowIso(), lane: 'rule', step: c.rule, decision: c.decision, detail: c.detail }); });
  rec.kind = ai && ai.kind || 'other';

  if (!v.ok) {
    rec.status = 'failed'; rec.label = 'manual';
    var rv0 = v.gates.map(function (g) { return openReview(store, g, { email_id: rec.id, rfq_id: rec.rfq_id }); });
    return { email: rec, quotes: [], reviews: rv0, pre: pre, ai: ai };
  }

  var supplier = sup(store, rec.supplier_id);

  if (pre.is_supplement || rec.kind === 'supplement') {
    return Promise.resolve(applySupplement(store, rec, ai, rfq, supplier));
  }

  if (rec.kind === 'clarification' || rec.kind === 'decline' || !v.quotes.length) {
    rec.status = rec.kind === 'clarification' ? 'non_quote' : 'non_quote';
    rec.label = rec.kind === 'clarification' ? 'manual' : 'processed';
    var madeReviews0 = [];
    (ai.needs_human || []).forEach(function (n) {
      if (!R.REASONS[n.code]) return;
      madeReviews0.push(openReview(store, R.gate(n.code, { note: n.note, evidence: n.evs || [], raised_by: 'ai' }), { email_id: rec.id, rfq_id: rec.rfq_id }));
    });
    return withReply({ email: rec, quotes: [], reviews: madeReviews0, pre: pre, ai: ai }, rec, null, store, opts);
  }

  var hdr = {
    id: 'qh_' + rec.id.replace(/^em_/, ''), email_id: rec.id, rfq_id: rfq.id, supplier_id: rec.supplier_id,
    supplier: v.header.supplier || {}, norm: v.header.norm, overrides: {}, custom: v.header.custom || [],
    created_at: nowIso(), rev: 1
  };
  store.quote_headers.push(hdr);

  var madeQuotes = [], madeReviews = [];
  pre.gates.forEach(function (g) { madeReviews.push(openReview(store, g, { email_id: rec.id, rfq_id: rec.rfq_id })); });

  v.quotes.forEach(function (q) {
    var suffix = q.line != null ? 'L' + ('0' + q.line).slice(-2) : 'U' + (q.item_index - 900);
    q.id = rec.id.replace(/^em_/, 'q_') + '_' + suffix;
    q.header_id = hdr.id;
    q.email_id = rec.id;
    q.supplier_id = rec.supplier_id;
    q.supplier_name = supplier ? supplier.name : rec.from_name;
    q.supplier_role = supplier ? supplier.role : 'unknown';
    q.supplier_city = supplier ? supplier.city : null;
    q.kind = rec.kind;
    q.date = rec.date;
    q.format = rec.format;
    q.overrides = {};
    q.humanNotes = [];
    q.updated_at = nowIso();
    q.rev = 1;
    q.prompt_bytes = rec.prompt_bytes;
    q.model_tier = rec.model_tier;
    q.source = rec.source;
    /* only lines actually matched to an RFQ line participate in that RFQ's eligibility;
       unmatched rows are parked, exactly like the v1 CSV multi-SKU case */
    if (q.line == null && !q.not_quoted) q.rfq_id = null;
    store.quotes.push(q);
    madeQuotes.push(q);
  });

  /* patch the LINES_NOT_QUOTED coalesced gate's line entries with the quote ids just assigned,
     then open every gate — header-scoped ones once, line-scoped ones fanned per quote */
  var byLine = {}; madeQuotes.forEach(function (q) { if (q.line != null) byLine[q.line] = q; });
  v.gates.forEach(function (g) {
    if (g.lines) g.lines.forEach(function (l) { if (byLine[l.line]) l.quote_id = byLine[l.line].id; });
    madeReviews.push(openReview(store, g, { email_id: rec.id, rfq_id: rfq.id, header_id: hdr.id }));
  });
  madeQuotes.forEach(function (q) {
    (q.gates || []).forEach(function (g) { madeReviews.push(openReview(store, g, { email_id: rec.id, quote_id: q.id, rfq_id: q.rfq_id, header_id: hdr.id })); });
  });

  rec.status = 'extracted';
  var matchedCount = madeQuotes.filter(function (q) { return q.line != null && !q.not_quoted && !q.parked; }).length;
  var unmatchedCount = madeQuotes.filter(function (q) { return q.line == null; }).length;
  var notQuotedCount = madeQuotes.filter(function (q) { return q.not_quoted; }).length;
  log(store, rec.id, { t: nowIso(), lane: 'rule', step: 'R11', decision: 'LINE_MATCH_SUMMARY',
    detail: matchedCount + ' matched, ' + notQuotedCount + ' not quoted, ' + unmatchedCount + ' unmatched of ' + R.rfqItems(rfq).length + ' RFQ lines' });
  rec.label = madeReviews.some(function (r) { return r.status === 'open' && r.severity === 'crit'; }) ? 'manual' : 'processed';
  rec.line_coverage = { quoted: matchedCount, total: R.rfqItems(rfq).length, missing: R.rfqItems(rfq).filter(function (it) { return !byLine[it.line]; }).map(function (it) { return it.sku; }) };
  rec.quote_ids = madeQuotes.map(function (q) { return q.id; });

  store.rfqs.forEach(function (r) { refreshEligibility(store, r.id); });

  if (rec.sample_id && opts.expected && opts.expected[rec.sample_id] && madeQuotes.length) {
    var primary = madeQuotes.filter(function (q) { return q.rfq_id === rec.rfq_id; })[0] || madeQuotes[0];
    var allGates = store.reviews.filter(function (rv) { return rv.email_id === rec.id; });
    var ev = R.evalQuote(primary, opts.expected[rec.sample_id], allGates);
    if (ev) { ev.sample_id = rec.sample_id; ev.at = nowIso(); ev.source = rec.source; ev.prompt_version = store.meta.prompt_versions.extract; store.evals.push(ev); }
  }

  var primaryQ = madeQuotes.filter(function (q) { return q.rfq_id === rec.rfq_id; })[0] || madeQuotes[0] || null;
  return withReply({ email: rec, quotes: madeQuotes, reviews: madeReviews, pre: pre, ai: ai }, rec, primaryQ, store, opts);
}

/* ==== v2: supplement merging ============================================ */
/* A follow-up reply to our own chase email never creates a new quote and never supersedes
   the original — it can only fill gaps, and any value that conflicts with one already on
   file is flagged for a person rather than silently applied (see R.computeSupplementPatch). */
function applySupplement(store, rec, ai, rfq, supplier) {
  ai._email_date = rec.date;
  var hdr = store.quote_headers.filter(function (h) { return h.rfq_id === rfq.id && h.supplier_id === rec.supplier_id; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0];
  rec.kind = 'supplement';
  if (!hdr) {
    rec.status = 'non_quote'; rec.label = 'processed';
    return { email: rec, quotes: [], reviews: [], pre: {}, ai: ai };
  }
  var lineQuotes = {};
  store.quotes.filter(function (q) { return q.header_id === hdr.id; }).forEach(function (q) { if (q.line != null) lineQuotes[q.line] = q; });

  var patch = R.computeSupplementPatch(ai, hdr, lineQuotes, rfq, store.meta);
  var filledSummary = [];

  Object.keys(patch.header).forEach(function (field) {
    if (field === 'certs_now_verified') return;
    hdr.norm[field] = { v: patch.header[field], rule: 'rule', via: 'supplement', from_email_id: rec.id, at: nowIso() };
  });
  if (patch.header.certs_now_verified) {
    hdr.norm.certs_canon.unverified = (hdr.norm.certs_canon.unverified || []).filter(function (c) { return patch.header.certs_now_verified.indexOf(c) === -1; });
  }
  hdr.rev = (hdr.rev || 1) + 1;

  var madeReviews = [];
  Object.keys(patch.lines).forEach(function (lineKey) {
    var q = lineQuotes[lineKey]; if (!q) return;
    var lp = patch.lines[lineKey];
    q.filled = q.filled || {};
    if (lp.price_filled) {
      var item = R.rfqItems(rfq).filter(function (it) { return it.line === q.line; })[0];
      var priced = R.normalizeLinePrice(lp.ai_line, item, hdr.norm.currency.v, store.meta);
      q.norm.usd_at_target = { v: priced.usd, rule: 'V05+V06+E03', inputs: { raw: priced.priceRaw, cur: hdr.norm.currency.v, factor: priced.factor, tier: priced.tierUsed } };
      q.gaps = (q.gaps || []).filter(function (g) { return !(g.field === 'price'); });
      q.filled.price = { via: 'supplement', from_email_id: rec.id, at: nowIso() };
      filledSummary.push('price on line ' + q.line);
    }
    if (lp.moq) {
      var moq = lp.moq, moqPcs = null, mu = String(moq.u || item && item.unit || 'pc').toLowerCase();
      if (num(moq.n) != null) { if (/ctn|carton|箱/.test(mu)) moqPcs = moq.pack ? moq.n * moq.pack : null; else if (/dozen/.test(mu)) moqPcs = moq.n * 12; else moqPcs = moq.n; }
      q.norm.moq_pcs = { v: moqPcs, rule: 'V06', inputs: moq };
      q.gaps = (q.gaps || []).filter(function (g) { return g.field !== 'moq'; });
      q.filled.moq = { via: 'supplement', from_email_id: rec.id, at: nowIso() };
      filledSummary.push('MOQ on line ' + q.line);
    }
    if (lp.lt) {
      q.norm.lead_days = { v: (lp.lt.hi || lp.lt.lo), from: lp.lt.from, rule: 'V04' };
      q.gaps = (q.gaps || []).filter(function (g) { return g.field !== 'lead_time'; });
      q.filled.lead_time = { via: 'supplement', from_email_id: rec.id, at: nowIso() };
      filledSummary.push('lead time on line ' + q.line);
    }
    q.updated_at = nowIso(); q.rev = (q.rev || 1) + 1;
  });
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  patch.conflicts.forEach(function (c) {
    var q = lineQuotes[c.line];
    madeReviews.push(openReview(store, R.gate('SUPPLEMENT_CONFLICT', {
      line: c.line, field: c.field,
      note: 'The original quote said USD ' + c.original + ', the follow-up says USD ' + c.incoming + ' for this line',
      evidence: c.ev ? [{ ev: c.ev, src: 'body' }] : [], options: ['Keep the original', 'Take the new figure', 'Treat as a full revision']
    }), { email_id: rec.id, quote_id: q ? q.id : null, rfq_id: rfq.id, header_id: hdr.id }));
  });

  /* resolve any chase reviews whose asked items are now answered */
  var reply = store.replies.filter(function (r) { return r.id === rec.in_reply_to || (r.rfq_id === rfq.id && r.supplier_id === rec.supplier_id && r.status === 'sent'); })
    .sort(function (a, b) { return a.sent_at < b.sent_at ? 1 : -1; })[0];
  var answeredKeys = {};
  if (patch.header.expiry != null) answeredKeys['gap:validity'] = 1;
  if (patch.header.payment != null) answeredKeys['gap:payment'] = 1;
  if (patch.header.certs_now_verified) answeredKeys['gate:CERT_UNVERIFIED'] = 1;
  Object.keys(patch.lines).forEach(function (lineKey) {
    var lp = patch.lines[lineKey];
    if (lp.price_filled) answeredKeys['gap:price:L' + lineKey] = 1;
    if (lp.moq) answeredKeys['gap:moq:L' + lineKey] = 1;
    if (lp.lt) answeredKeys['gap:lead_time:L' + lineKey] = 1;
  });
  if (reply) {
    reply.answered = reply.answered || [];
    reply.outstanding = (reply.items || []).filter(function (k) { return !answeredKeys[k] && reply.answered.indexOf(k) === -1; });
    (reply.items || []).forEach(function (k) { if (answeredKeys[k] && reply.answered.indexOf(k) === -1) reply.answered.push(k); });
    reply.answer_status = reply.outstanding.length === 0 ? 'answered' : (reply.answered.length ? 'partial' : 'awaiting');
  }
  /* close the coalesced review(s) covering fully-answered fields */
  store.reviews.filter(function (rv) { return rv.header_id === hdr.id && rv.status === 'open'; }).forEach(function (rv) {
    var doneField = (rv.field === 'validity' && patch.header.expiry != null) || (rv.field === 'payment' && patch.header.payment != null) || (rv.code === 'CERT_UNVERIFIED' && patch.header.certs_now_verified);
    if (doneField && !rv.lines) { rv.status = 'resolved'; rv.resolution = { action: 'accept', by: 'rule', at: nowIso(), reason: 'answered by supplier' }; rv.rev = (rv.rev || 1) + 1; }
    if (rv.lines) {
      var changed = false;
      rv.lines.forEach(function (l) {
        if (l.status !== 'open') return;
        var key = rv.code === 'CRITICAL_FIELD_MISSING' && rv.field === 'moq' ? patch.lines[l.line] && patch.lines[l.line].moq
          : rv.code === 'LINES_NOT_QUOTED' ? patch.lines[l.line]
          : null;
        if (key) { l.status = 'resolved'; l.resolution = { action: 'accept', by: 'rule', at: nowIso(), reason: 'answered by supplier' }; changed = true; }
      });
      if (changed) { rv.rev = (rv.rev || 1) + 1; if (rv.lines.every(function (l) { return l.status !== 'open'; })) rv.status = 'resolved'; }
    }
  });

  rec.status = 'extracted';
  rec.label = filledSummary.length ? 'processed' : 'manual';
  rec.line_coverage = { quoted: Object.keys(patch.lines).length, total: filledSummary.length, missing: [] };
  rec.answered_summary = filledSummary;
  log(store, rec.id, { t: nowIso(), lane: 'rule', step: 'SUPPLEMENT', decision: filledSummary.length ? 'APPLIED' : 'NOTHING_NEW',
    detail: filledSummary.length ? ('filled ' + filledSummary.join(', ')) : 'The follow-up answered nothing new' });

  refreshEligibility(store, rfq.id);
  return { email: rec, quotes: Object.keys(patch.lines).map(function (k) { return lineQuotes[k]; }).filter(Boolean), reviews: madeReviews, pre: {}, ai: ai, supplement: true };
}

/* ---- reply drafting, enquiry creation, supplier status ---------------- */

function withReply(result, rec, quote, store, opts) {
  if (!opts.reply || !rec.rfq_id) return Promise.resolve(result);
  var rfq = rfqById(store, rec.rfq_id);
  if (!rfq) return Promise.resolve(result);
  var gates = store.reviews.filter(function (rv) { return rv.email_id === rec.id && rv.status === 'open'; });
  var items = root.GENERATOR ? root.GENERATOR.chaseItems(quote, gates, rfq) : [];
  var clar = rec.kind === 'clarification';
  if (!items.length && !clar) return Promise.resolve(result);
  return opts.reply(rec, quote, rfq, items).then(function (d) {
    if (!d || !d.body) return result;
    var rp = {
      id: 'rp_' + rec.id.replace(/^em_/, ''), email_id: rec.id, quote_id: quote ? quote.id : null, rfq_id: rfq.id,
      supplier_id: rec.supplier_id || null, supplier_name: quote ? quote.supplier_name : rec.from_name,
      to: rec.from, to_name: rec.from_name, subject: d.subject || ('Re: ' + rec.subject), body: d.body,
      items: items.map(function (i) { return i.key || i.ask; }), lines: uniqNums(items.map(function (i) { return i.line; }).filter(function (n) { return n != null; })),
      kind: clar ? 'answer' : 'chase', due: root.RULES.addDays(store.meta.demo_now, 3), answer_status: 'awaiting', answered: [], outstanding: [],
      status: 'draft', source: d.source || 'ai', created_at: nowIso(), sent_at: null, round: 1, rev: 1
    };
    store.replies = store.replies.filter(function (r) { return r.email_id !== rec.id; });
    store.replies.push(rp);
    log(store, rec.id, { t: nowIso(), lane: rp.source === 'rule' ? 'rule' : 'ai', step: 'reply', decision: 'DRAFTED', detail: (clar ? 'answers to their questions' : items.length + ' item(s) to chase') + ', waiting for approval' });
    result.reply = rp;
    return result;
  }, function () { return result; });
}
function uniqNums(a) { var o = {}, r = []; a.forEach(function (x) { if (!o[x]) { o[x] = 1; r.push(x); } }); return r; }

function sendReply(store, replyId, by) {
  var rp = store.replies.filter(function (r) { return r.id === replyId; })[0];
  if (!rp) return null;
  rp.status = 'sent'; rp.sent_at = nowIso(); rp.sent_by = by || 'you'; rp.rev++;
  log(store, rp.email_id, { t: nowIso(), lane: 'human', step: 'reply', decision: 'SENT', detail: 'Approved and sent to ' + rp.to });
  store.reviews.forEach(function (rv) {
    if (rv.email_id === rp.email_id && rv.code === 'CLARIFICATION_REPLY_NEEDED' && rv.status === 'open') {
      rv.status = 'resolved'; rv.resolution = { action: 'accept', by: by || 'you', at: nowIso(), reason: 'answered by email' }; rv.rev++;
    }
  });
  return rp;
}

function nextCode(store) {
  var max = 400;
  store.rfqs.forEach(function (r) { var m = /RFQ-\d{4}-(\d+)/.exec(r.code || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return max + 1;
}

function createRfq(store, draft) {
  var n = nextCode(store);
  var hasLines = Array.isArray(draft.items) && draft.items.length;
  var rfq = {
    id: 'rfq_' + ('000' + n).slice(-4), code: 'RFQ-2026-' + ('000' + n).slice(-4),
    product: String(draft.product || draft.title || '').trim(), spec_summary: String(draft.spec_summary || draft.spec || '').trim(),
    required_certs: (draft.required_certs || []).slice(), pl_required: !!draft.pl_required, custom_required: !!draft.custom_required,
    max_lead_days: Number(draft.max_lead_days) || 30, dest_port: draft.dest_port || 'Nhava Sheva, India', incoterm: 'FOB',
    custom_questions: (draft.custom_questions || []).map(function (q, i) { return { qid: 'q' + (i + 1), text: q.text, required: q.required !== false }; }),
    recipients: (draft.recipients || []).slice(), sent_at: store.meta.demo_now, deadline: root.RULES.addDays(store.meta.demo_now, 10),
    status: 'open', created_by: 'you', created_at: nowIso(), readiness: draft.check ? { score: draft.check.score, source: draft.check.source } : null,
    distribution: draft.distribution || 'chosen'
  };
  if (hasLines) {
    rfq.items = draft.items.map(function (it, i) {
      return { line: i + 1, sku: it.sku || ('L' + ('0' + (i + 1)).slice(-2)), product: it.product, spec: it.spec || '',
        qty: Number(it.qty) || 0, unit: it.unit || 'pc', target_usd_fob: { lo: Number(it.floor) || 0, hi: Number(it.ceiling) || 0 },
        tier_qtys: it.tier_qtys || [] };
    });
  } else {
    rfq.target_qty = Number(draft.target_qty) || 0; rfq.unit = draft.unit || 'pc';
    rfq.tier_qtys = (draft.tier_qtys || []).slice().sort(function (a, b) { return a - b; });
    rfq.target_usd_fob = { lo: Number(draft.target_usd_fob.lo), hi: Number(draft.target_usd_fob.hi) };
  }
  R.normalizeRfq(rfq);
  store.rfqs.push(rfq);
  log(store, rfq.id, { t: nowIso(), lane: 'human', step: 'RFQ', decision: 'SENT', detail: rfq.code + ' (' + R.rfqItems(rfq).length + ' line(s)) to ' + rfq.recipients.length + ' supplier(s)' });
  return rfq;
}

function supplierStatuses(store, rfq) {
  var rows = (rfq.recipients || []).map(function (id) {
    var s = sup(store, id) || { id: id, name: id };
    var emails = store.emails.filter(function (e) { return e.rfq_id === rfq.id && e.supplier_id === id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var quotes = store.quotes.filter(function (q) { return q.rfq_id === rfq.id && q.supplier_id === id && !q.superseded_by; });
    var replies = store.replies.filter(function (r) { return r.rfq_id === rfq.id && r.supplier_id === id; });
    var sent = replies.filter(function (r) { return r.status === 'sent'; })[0];
    var noResponse = sent && sent.answer_status === 'no_response';
    var awaitingSince = sent && sent.answer_status === 'awaiting' ? sent : null;
    var status = !emails.length ? 'awaiting' : noResponse ? 'no_response' : (awaitingSince ? 'chased' : (sent ? 'received' : 'received'));
    return { supplier: s, status: status, emails: emails, quotes: quotes, reply: replies[0] || null, chased_at: sent ? sent.sent_at : null, recipient: true };
  });
  var known = {}; (rfq.recipients || []).forEach(function (id) { known[id] = 1; });
  store.emails.filter(function (e) { return e.rfq_id === rfq.id && !known[e.supplier_id]; }).forEach(function (e) {
    var key = e.supplier_id || e.from;
    if (known[key]) return; known[key] = 1;
    var s = sup(store, e.supplier_id) || { id: key, name: e.from_name || e.from, verified: false, unknown: true };
    rows.push({ supplier: s, status: 'received', emails: [e], quotes: store.quotes.filter(function (q) { return q.email_id === e.id; }), reply: store.replies.filter(function (r) { return r.email_id === e.id; })[0] || null, recipient: false });
  });
  return rows;
}

function markNoResponse(store, replyId, by) {
  var rp = store.replies.filter(function (r) { return r.id === replyId; })[0];
  if (!rp) return null;
  rp.answer_status = 'no_response'; rp.rev = (rp.rev || 1) + 1;
  (rp.items || []).forEach(function (key) {
    store.reviews.filter(function (rv) { return rv.rfq_id === rp.rfq_id && rv.status === 'open'; }).forEach(function (rv) {
      if (rv.lines) rv.lines.forEach(function (l) { if (l.quote_id === rp.quote_id && l.status === 'open') { l.status = 'dismissed'; l.resolution = { action: 'reject', by: by || 'you', at: nowIso(), reason: 'supplier did not respond' }; } });
    });
  });
  var qs = store.quotes.filter(function (q) { return q.rfq_id === rp.rfq_id && q.supplier_id === rp.supplier_id; });
  qs.forEach(function (q) { if (q.eligibility && q.eligibility.status === 'needs_review') q.eligibility.status = 'incomplete'; });
  log(store, rp.email_id, { t: nowIso(), lane: 'human', step: 'NO_RESPONSE', decision: 'MARKED', detail: 'No reply from ' + rp.supplier_name });
  refreshEligibility(store, rp.rfq_id);
  return rp;
}

function advanceClock(store, days) {
  store.meta.demo_now = root.RULES.addDays(store.meta.demo_now, days || 3);
  store.rfqs.forEach(function (r) { refreshEligibility(store, r.id); });
  return store.meta.demo_now;
}

/* ---- eligibility refresh -------------------------------------------- */

function refreshEligibility(store, rfqId) {
  var rfq = rfqById(store, rfqId);
  if (!rfq) return null;
  var qs = store.quotes.filter(function (q) { return q.rfq_id === rfqId; });
  qs.forEach(function (q) {
    if (q.header_id) {
      var hdr = headerById(store, q.header_id);
      if (hdr) {
        ['currency', 'incoterm', 'expiry', 'certs_canon', 'private_label'].forEach(function (field) {
          var ov = hdr.overrides && hdr.overrides[field];
          q.norm[field] = ov ? { v: ov.v, rule: 'human', by: ov.by, reason: ov.reason } : hdr.norm[field];
        });
      }
    }
    q.openGates = store.reviews.filter(function (rv) {
      if (rv.status !== 'open') return false;
      if (rv.quote_id === q.id) return true;
      if (q.header_id && rv.header_id === q.header_id && !rv.lines && (rv.scope === 'terms' || rv.scope === 'email')) return true;
      if (rv.lines && rv.lines.some(function (l) { return l.quote_id === q.id && l.status === 'open'; })) return true;
      return false;
    });
    R.applyOverrides(q, q.overrides);
  });
  var res = R.eligibility(qs, rfq, { meta: store.meta, now: store.meta.demo_now });
  qs.forEach(function (q) {
    ['expiredGate', 'moqGate', 'outlierGate'].forEach(function (k) {
      if (!q[k]) return;
      var g = q[k];
      var exists = g.scope
        ? store.reviews.some(function (rv) { return rv.header_id === q.header_id && rv.code === g.code && !rv.lines; })
        : store.reviews.some(function (rv) { return rv.quote_id === q.id && rv.code === g.code; });
      if (!exists) openReview(store, g, g.scope ? { email_id: q.email_id, header_id: q.header_id, rfq_id: q.rfq_id } : { email_id: q.email_id, quote_id: q.id, rfq_id: q.rfq_id });
      q[k] = null;
    });
  });
  return res;
}

/* ---- comparison (v1 single-lens flow — unchanged, still used by existing tests) ---- */

function compare(rfqId, store, opts) {
  opts = opts || {};
  var rfq = rfqById(store, rfqId);
  var res = refreshEligibility(store, rfqId);
  var qs = store.quotes.filter(function (q) { return q.rfq_id === rfqId; });
  var eligible = qs.filter(function (q) { return q.eligibility.status === 'eligible'; });
  var excluded = qs.filter(function (q) { return q.eligibility.status !== 'eligible'; }).map(function (q) {
    return { id: q.id, supplier_name: q.supplier_name, reason: q.eligibility.reasons.join('; ') || q.eligibility.status };
  });
  var cmpId = rfqId + '_' + Date.now();
  var cmp = {
    id: cmpId, rfq_id: rfqId, created_at: nowIso(),
    input_quote_ids: qs.map(function (q) { return q.id; }),
    rules_log: res.log, eligible_ids: eligible.map(function (q) { return q.id; }),
    excluded: excluded, cheapest_id: res.cheapest ? res.cheapest.id : null,
    median: res.median, ai: null, status: 'running', approval: null,
    prompt_bytes: null, model_tier: null, duration_ms: null
  };
  store.comparisons.push(cmp);
  res.log.forEach(function (l) { log(store, cmpId, { t: nowIso(), lane: 'rule', step: l.rule, decision: l.decision, detail: (l.quote ? l.quote + ' ' : '') + (l.detail || '') }); });

  if (!eligible.length) {
    cmp.status = 'done';
    cmp.ai = null;
    cmp.no_candidates = true;
    log(store, cmpId, { t: nowIso(), lane: 'rule', step: 'E09', decision: 'NO_CANDIDATES', detail: 'No reader call made' });
    return Promise.resolve(cmp);
  }
  if (eligible.length === 1) {
    openReview(store, R.gate('SINGLE_CANDIDATE', { note: eligible[0].supplier_name + ' is the only quote that passes. There is no benchmark for the price.' }), { email_id: eligible[0].email_id, quote_id: eligible[0].id, rfq_id: rfqId });
  }

  var cb = P.buildCompare(rfq, eligible, excluded, res.log, cmp.cheapest_id, store.meta);
  cmp.prompt_bytes = cb.bytes;
  var t0 = Date.now();
  return opts.compare(cb, rfq, eligible).then(function (out) {
    cmp.duration_ms = Date.now() - t0;
    cmp.model_tier = out.tier || null;
    cmp.source = out.source;
    var ai = out.ai || {};
    var ids = eligible.map(function (q) { return q.id; });
    ['cheapest', 'best_value', 'recommended'].forEach(function (k) {
      if (ai[k] && ids.indexOf(ai[k].id) === -1) {
        log(store, cmpId, { t: nowIso(), lane: 'rule', step: 'E10', decision: 'LENS_ID_REJECTED', detail: k + ' named ' + ai[k].id + ', which is not an eligible quote' });
        ai[k].id_rejected = ai[k].id;
        ai[k].id = k === 'cheapest' ? cmp.cheapest_id : null;
      }
    });
    if (ai.cheapest && cmp.cheapest_id && ai.cheapest.id !== cmp.cheapest_id) {
      ai.cheapest.id = cmp.cheapest_id;
      log(store, cmpId, { t: nowIso(), lane: 'rule', step: 'E10', decision: 'CHEAPEST_CORRECTED', detail: 'Cheapest is decided by rule, not by the reader' });
    }
    cmp.ai = ai;
    cmp.status = 'done';
    log(store, cmpId, {
      t: nowIso(), lane: out.source === 'reference' ? 'rule' : 'ai', step: 'compare',
      decision: 'RANKED', detail: (out.tier ? 'tier ' + out.tier + ', ' : '') + cb.bytes + ' bytes in, ' + cmp.duration_ms + ' ms'
    });
    if (ai.recommended && ai.recommended.id) {
      openReview(store, R.gate('WINNER_APPROVAL', {
        note: 'The reader recommends ' + ((store.quotes.filter(function (q) { return q.id === ai.recommended.id; })[0] || {}).supplier_name || ai.recommended.id),
        proposed: ai.recommended.id, options: ids
      }), { email_id: null, quote_id: ai.recommended.id, rfq_id: rfqId });
    }
    return cmp;
  }, function (err) {
    cmp.status = 'failed'; cmp.error = (err && (err.code || err.message)) || 'unknown';
    log(store, cmpId, { t: nowIso(), lane: 'ai', step: 'compare', decision: 'FAILED', detail: cmp.error });
    return cmp;
  });
}

/* ---- v2: per-line award suggestions ------------------------------------ */
/* Cheapest is decided per line by rule alone. Best value is one Claude call covering every
   contested line (2+ eligible quotes) at once; a line with 0 or 1 eligible quote is settled
   by rule and never sent to the model. Every id the model returns is checked against that
   line's own eligible set before it is trusted. */
function suggestAwards(store, rfqId, opts) {
  opts = opts || {};
  var rfq = rfqById(store, rfqId);
  var res = refreshEligibility(store, rfqId);
  var perLine = res.perLine.filter(function (pl) { return pl.item; }).sort(function (a, b) { return a.line - b.line; });
  var byId = {}; store.quotes.forEach(function (q) { byId[q.id] = q; });

  var contested = perLine.filter(function (pl) { return pl.eligible.length >= 2; });
  var settled = {};
  perLine.forEach(function (pl) {
    settled[pl.line] = {
      line: pl.line, item: pl.item, eligible_count: pl.eligible.length,
      cheapest_id: pl.cheapest ? pl.cheapest.id : null,
      best_value_id: pl.eligible.length === 1 ? pl.eligible[0].id : (pl.eligible.length === 0 ? null : null),
      reason: pl.eligible.length === 0 ? (store.quotes.filter(function (q) { return q.line === pl.line && q.rfq_id === rfqId; }).some(function (q) { return q.not_quoted; }) ? 'not_quoted' : 'needs_review') : null,
      why: pl.eligible.length === 1 ? 'Only quote that passes the hard criteria.' : null
    };
  });

  var result = { id: 'aw_' + rfqId + '_' + Date.now(), rfq_id: rfqId, created_at: nowIso(), status: 'done', lines: settled, source: 'rule', model_tier: null, duration_ms: null, prompt_bytes: null };

  if (!contested.length || !opts.awards) {
    log(store, 'awards_' + rfqId, { t: nowIso(), lane: 'rule', step: 'AWARDS', decision: 'RULE_ONLY', detail: contested.length + ' contested line(s) of ' + perLine.length });
    return Promise.resolve(result);
  }

  var cb = P.buildAwards(rfq, contested, byId, store.meta);
  result.prompt_bytes = cb.bytes;
  var t0 = Date.now();
  return opts.awards(cb, rfq, contested).then(function (out) {
    result.duration_ms = Date.now() - t0; result.model_tier = out.tier || null; result.source = out.source;
    var ai = out.ai || {};
    (ai.lines || []).forEach(function (l) {
      var pl = contested.filter(function (x) { return x.line === l.line; })[0];
      if (!pl) return;
      var ids = pl.eligible.map(function (q) { return q.id; });
      if (ids.indexOf(l.best_value_id) === -1) {
        log(store, 'awards_' + rfqId, { t: nowIso(), lane: 'rule', step: 'LENS_ID_REJECTED', decision: 'FALLBACK_TO_CHEAPEST', detail: 'line ' + l.line + ' named ' + l.best_value_id });
        settled[l.line].best_value_id = pl.cheapest ? pl.cheapest.id : null;
        settled[l.line].why = 'The reader\'s pick was not one of this line\'s eligible quotes, so the cheapest stood in.';
      } else {
        settled[l.line].best_value_id = l.best_value_id;
        settled[l.line].why = l.why || '';
      }
    });
    result.suppliers = ai.suppliers || [];
    result.questions_for_buyer = ai.questions_for_buyer || [];
    log(store, 'awards_' + rfqId, { t: nowIso(), lane: 'ai', step: 'AWARDS', decision: 'RANKED', detail: contested.length + ' contested line(s), ' + cb.bytes + ' bytes in, ' + result.duration_ms + ' ms' });
    return result;
  }, function (err) {
    result.status = 'failed'; result.error = (err && (err.code || err.message)) || 'unknown';
    log(store, 'awards_' + rfqId, { t: nowIso(), lane: 'ai', step: 'AWARDS', decision: 'FAILED', detail: result.error });
    return result;
  });
}

/* ---- v2: chase one or more lines for one supplier, from the Quotations tab --------- */
function draftLineChase(store, rfqId, supplierId, lines, opts) {
  opts = opts || {};
  var rfq = rfqById(store, rfqId);
  var hdr = store.quote_headers.filter(function (h) { return h.rfq_id === rfqId && h.supplier_id === supplierId; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0];
  var lineQuotes = store.quotes.filter(function (q) { return q.rfq_id === rfqId && q.supplier_id === supplierId && lines.indexOf(q.line) > -1; });
  var headerGates = hdr ? store.reviews.filter(function (rv) { return rv.header_id === hdr.id && rv.status === 'open' && !rv.lines; }) : [];
  var items = root.GENERATOR.chaseItemsV2(lineQuotes, headerGates, rfq);
  var supplierName = lineQuotes[0] ? lineQuotes[0].supplier_name : ((sup(store, supplierId) || {}).name || supplierId);
  var origEmail = hdr ? store.emails.filter(function (e) { return e.id === hdr.email_id; })[0] : null;
  if (!items.length) return Promise.resolve(null);
  return opts.replyLines(rfq, supplierName, items, lines).then(function (d) {
    if (!d || !d.body) return null;
    var round = store.replies.filter(function (r) { return r.rfq_id === rfqId && r.supplier_id === supplierId; }).length + 1;
    var rp = {
      id: 'rp_' + rfqId.replace('rfq_', '') + '_' + supplierId.replace('sup_', '') + '_' + round,
      email_id: hdr ? hdr.email_id : null, quote_id: null, rfq_id: rfqId, supplier_id: supplierId, supplier_name: supplierName,
      to: origEmail ? origEmail.from : null, to_name: origEmail ? origEmail.from_name : supplierName,
      subject: d.subject, body: d.body, items: items.map(function (i) { return i.key; }), lines: lines.slice(),
      kind: 'chase', status: 'draft', source: d.source || 'rule', created_at: nowIso(), sent_at: null,
      due: root.RULES.addDays(store.meta.demo_now, 3), answer_status: 'awaiting', answered: [], outstanding: items.map(function (i) { return i.key; }), round: round, rev: 1
    };
    store.replies.push(rp);
    log(store, hdr ? hdr.email_id : (rfqId + '_chase'), { t: nowIso(), lane: rp.source === 'rule' ? 'rule' : 'ai', step: 'reply', decision: 'DRAFTED', detail: items.length + ' item(s) across line(s) ' + lines.join(', ') + ', waiting for approval' });
    return rp;
  });
}

function awardLine(store, rfqId, line, quoteId, lens, by) {
  store.awards[rfqId] = store.awards[rfqId] || { lines: {} };
  if (quoteId == null) delete store.awards[rfqId].lines[line];
  else store.awards[rfqId].lines[line] = { quote_id: quoteId, lens: lens || 'manual', by: by || 'you', at: nowIso() };
  log(store, rfqId + '_award', { t: nowIso(), lane: 'human', step: 'AWARD', decision: quoteId ? 'AWARDED' : 'CLEARED', detail: 'line ' + line + ' -> ' + (quoteId || 'none') + ' (' + (lens || 'manual') + ')' });
  return store.awards[rfqId];
}

function awardBulk(store, rfqId, lens, awardsSuggestion, by) {
  store.awards[rfqId] = store.awards[rfqId] || { lines: {} };
  var n = 0;
  Object.keys(awardsSuggestion.lines).forEach(function (lineKey) {
    var entry = awardsSuggestion.lines[lineKey];
    var qid = lens === 'cheapest' ? entry.cheapest_id : entry.best_value_id;
    if (!qid) return;
    if (store.awards[rfqId].lines[lineKey] && store.awards[rfqId].lines[lineKey].manual_override) return;
    store.awards[rfqId].lines[lineKey] = { quote_id: qid, lens: lens, by: by || 'you', at: nowIso() };
    n++;
  });
  log(store, rfqId + '_award', { t: nowIso(), lane: 'human', step: 'AWARD_BULK', decision: 'AWARDED', detail: n + ' line(s) awarded via ' + lens });
  return store.awards[rfqId];
}

/* ---- resolving a review --------------------------------------------- */

function resolveReview(store, reviewId, resolution) {
  var rv = store.reviews.filter(function (r) { return r.id === reviewId; })[0];
  if (!rv) return null;
  var mode = resolution.mode || 'all';

  if (rv.lines && rv.lines.length) {
    var targets = (mode === 'perline' && resolution.line != null)
      ? rv.lines.filter(function (l) { return l.line === resolution.line; })
      : rv.lines.filter(function (l) { return l.status === 'open'; });
    targets.forEach(function (l) {
      l.status = resolution.action === 'reject' ? 'dismissed' : 'resolved';
      l.resolution = { action: resolution.action, value: resolution.value, by: resolution.by || 'you', at: nowIso(), reason: resolution.reason || '' };
      if (l.quote_id) {
        var q = store.quotes.filter(function (x) { return x.id === l.quote_id; })[0];
        if (q) {
          if (resolution.action === 'edit' && resolution.field) q.overrides[resolution.field] = { v: resolution.value, by: l.resolution.by, at: l.resolution.at, reason: l.resolution.reason };
          else if (resolution.action === 'accept' && resolution.field && resolution.value !== undefined) q.overrides[resolution.field] = { v: resolution.value, by: l.resolution.by, at: l.resolution.at, reason: l.resolution.reason || 'accepted as read' };
          if (l.resolution.reason) { q.humanNotes = q.humanNotes || []; q.humanNotes.push(rv.code + ': ' + l.resolution.reason); }
          q.updated_at = nowIso(); q.rev = (q.rev || 1) + 1;
        }
      }
    });
    rv.status = rv.lines.every(function (l) { return l.status !== 'open'; }) ? (rv.lines.every(function (l) { return l.status === 'dismissed'; }) ? 'dismissed' : 'resolved') : 'open';
    rv.rev = (rv.rev || 1) + 1;
    if (rv.rfq_id) { store.comparisons.forEach(function (c) { if (c.rfq_id === rv.rfq_id && c.status === 'done') c.status = 'stale'; }); }
    log(store, rv.email_id || rv.header_id || 'reviews', {
      t: nowIso(), lane: 'human', step: rv.code, decision: rv.status.toUpperCase(),
      detail: (mode === 'perline' ? ('line ' + resolution.line + ' ') : 'all open lines ') + (resolution.field ? resolution.field + ' = ' + JSON.stringify(resolution.value) + '. ' : '') + (resolution.reason || '')
    });
    if (rv.rfq_id) refreshEligibility(store, rv.rfq_id);
    return rv;
  }

  if (rv.header_id && !rv.quote_id) {
    rv.status = resolution.action === 'reject' ? 'dismissed' : 'resolved';
    rv.resolution = { action: resolution.action, value: resolution.value, by: resolution.by || 'you', at: nowIso(), reason: resolution.reason || '' };
    rv.rev = (rv.rev || 1) + 1;
    var hdr = headerById(store, rv.header_id);
    if (hdr && resolution.field && (resolution.action === 'edit' || resolution.action === 'accept') && resolution.value !== undefined) {
      hdr.overrides = hdr.overrides || {};
      hdr.overrides[resolution.field] = { v: resolution.value, by: rv.resolution.by, at: rv.resolution.at, reason: rv.resolution.reason };
      hdr.rev = (hdr.rev || 1) + 1;
    }
    if (rv.rfq_id) store.comparisons.forEach(function (c) { if (c.rfq_id === rv.rfq_id && c.status === 'done') c.status = 'stale'; });
    log(store, rv.email_id || rv.header_id, {
      t: nowIso(), lane: 'human', step: rv.code, decision: rv.status.toUpperCase(),
      detail: (resolution.field ? resolution.field + ' = ' + JSON.stringify(resolution.value) + '. ' : '') + (rv.resolution.reason || '')
    });
    if (rv.rfq_id) refreshEligibility(store, rv.rfq_id);
    return rv;
  }

  /* v1 path — byte-identical to before */
  rv.status = resolution.action === 'reject' ? 'dismissed' : 'resolved';
  rv.resolution = { action: resolution.action, value: resolution.value, by: resolution.by || 'you', at: nowIso(), reason: resolution.reason || '' };
  rv.rev++;
  var q = rv.quote_id ? store.quotes.filter(function (x) { return x.id === rv.quote_id; })[0] : null;
  if (q) {
    if (resolution.action === 'edit' && resolution.field) {
      q.overrides[resolution.field] = { v: resolution.value, by: rv.resolution.by, at: rv.resolution.at, reason: rv.resolution.reason };
    } else if (resolution.action === 'accept' && resolution.field && resolution.value !== undefined) {
      q.overrides[resolution.field] = { v: resolution.value, by: rv.resolution.by, at: rv.resolution.at, reason: rv.resolution.reason || 'accepted as read' };
    }
    if (rv.resolution.reason) q.humanNotes.push(rv.code + ': ' + rv.resolution.reason);
    q.updated_at = nowIso(); q.rev++;
    store.comparisons.forEach(function (c) {
      if (c.rfq_id === q.rfq_id && c.status === 'done') c.status = 'stale';
    });
  }
  log(store, rv.email_id || rv.quote_id || 'reviews', {
    t: nowIso(), lane: 'human', step: rv.code, decision: rv.status.toUpperCase(),
    detail: (resolution.field ? resolution.field + ' = ' + JSON.stringify(resolution.value) + '. ' : '') + (rv.resolution.reason || '')
  });
  if (rv.rfq_id) refreshEligibility(store, rv.rfq_id);
  return rv;
}

function rerunEvals(store, expected) {
  if (!expected) return store.evals;
  store.rfqs.forEach(function (r) { refreshEligibility(store, r.id); });
  store.evals = [];
  store.emails.forEach(function (rec) {
    if (!rec.sample_id || !expected[rec.sample_id]) return;
    var qs = store.quotes.filter(function (q) { return q.email_id === rec.id; });
    if (!qs.length) return;
    var primary = qs.filter(function (q) { return q.rfq_id === rec.rfq_id; })[0] || qs[0];
    var gates = store.reviews.filter(function (rv) { return rv.email_id === rec.id; });
    var ev = R.evalQuote(primary, expected[rec.sample_id], gates);
    if (ev) {
      ev.sample_id = rec.sample_id; ev.at = nowIso(); ev.source = rec.source;
      ev.prompt_version = store.meta.prompt_versions.extract;
      store.evals.push(ev);
    }
  });
  return store.evals;
}

root.PIPELINE = {
  rerunEvals: rerunEvals, sendReply: sendReply, createRfq: createRfq, supplierStatuses: supplierStatuses, nextCode: nextCode,
  newStore: newStore, processEmail: processEmail, compare: compare,
  refreshEligibility: refreshEligibility, resolveReview: resolveReview,
  openReview: openReview, log: log, rfqById: rfqById, sup: sup, headerById: headerById,
  /* v2 */
  applySupplement: applySupplement, suggestAwards: suggestAwards, awardLine: awardLine, awardBulk: awardBulk,
  markNoResponse: markNoResponse, advanceClock: advanceClock, draftLineChase: draftLineChase
};

})(typeof window !== 'undefined' ? window : globalThis);
