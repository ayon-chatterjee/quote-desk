/* RFQ Quote Intelligence — orchestration.
   Sequences the three lanes for one email, and runs a comparison for one RFQ.
   The AI calls are injected so the node tests and the no-AI page use the same path. */
(function (root) {
'use strict';

var R = root.RULES, P = root.PROMPTS;

function newStore(seed) {
  return {
    meta: JSON.parse(JSON.stringify(seed.meta)),
    rfqs: JSON.parse(JSON.stringify(seed.rfqs)),
    suppliers: seed.suppliers.slice(),
    buyer: seed.buyer,
    emails: [], quotes: [], reviews: [], comparisons: [], logs: [], evals: [], replies: []
  };
}

function sup(store, id) { return store.suppliers.filter(function (s) { return s.id === id; })[0] || null; }
function rfqById(store, id) { return store.rfqs.filter(function (r) { return r.id === id; })[0] || null; }
function log(store, subject, entry) {
  var bucket = store.logs.filter(function (l) { return l.id === subject; })[0];
  if (!bucket) { bucket = { id: subject, entries: [], count: 0 }; store.logs.push(bucket); }
  if (bucket.entries.length < 200) bucket.entries.push(entry);
  bucket.count++;
  return entry;
}
function nowIso() { return new Date().toISOString(); }

function openReview(store, g, ctx) {
  var id = 'rv_' + (store.reviews.length + 1) + '_' + g.code.toLowerCase().slice(0, 12);
  var rv = {
    id: id, code: g.code, severity: g.severity, question: g.question, note: g.note,
    field: g.field, item: g.item, evidence: g.evidence || [], proposed: g.proposed,
    options: g.options, raised_by: g.raised_by || 'rule',
    email_id: ctx.email_id, quote_id: ctx.quote_id || null, rfq_id: ctx.rfq_id || null,
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
    to: email.to, date: email.date, subject: email.subject,
    body_raw: email.body_raw, body_new: pre.body_new, body_quoted: pre.body_quoted,
    attachments: email.attachments || [], hash: pre.hash, format: email.format,
    supplier_id: pre.supplier_id, rfq_id: pre.rfq_id, match: pre.match,
    pre_rules: pre.decisions, status: 'received', kind: null,
    source: null, prompt_bytes: null, model_tier: null, duration_ms: null
  };
  store.emails.push(rec);

  if (pre.skip_ai) {
    rec.status = 'duplicate'; rec.duplicate_of = pre.duplicate_of;
    log(store, email.id, { t: nowIso(), lane: 'rule', step: 'R01', decision: 'SKIP_AI', detail: 'Duplicate of ' + pre.duplicate_of + ', no reader call made' });
    return Promise.resolve({ email: rec, quotes: [], reviews: [], pre: pre });
  }

  var rfq = pre.rfq_id ? rfqById(store, pre.rfq_id) : null;

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
    if (matched) rfq = matched;
    var pb = P.buildExtract(email, rfq, pre, store.meta);
    log(store, email.id, { t: nowIso(), lane: 'rule', step: pb.decision.rule, decision: pb.decision.decision, detail: pb.decision.detail });
    if (pb.over) {
      var g = R.gate('EXTRACTION_FAILED_MANUAL_ENTRY', { note: 'The email is too large to read in one pass (' + pb.bytes + ' bytes)' });
      rec.status = 'failed';
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
      return finish(out.ai, rec, rfq, pre, store, opts);
    }, function (err) {
      rec.status = 'failed'; rec.error = err && (err.code || err.message) || 'unknown';
      log(store, email.id, { t: nowIso(), lane: 'ai', step: 'extract', decision: 'FAILED', detail: rec.error });
      var g = R.gate('EXTRACTION_FAILED_MANUAL_ENTRY', { note: 'The reader failed: ' + rec.error });
      return { email: rec, quotes: [], reviews: [openReview(store, g, { email_id: rec.id, rfq_id: rec.rfq_id })], pre: pre };
    });
  });
}

function finish(ai, rec, rfq, pre, store, opts) {
  var ctx = { meta: store.meta, rfqs: store.rfqs, suppliers: store.suppliers };
  var v = R.validate(ai, rec, rfq, pre, ctx);
  v.checks.forEach(function (c) { log(store, rec.id, { t: nowIso(), lane: 'rule', step: c.rule, decision: c.decision, detail: c.detail }); });
  rec.kind = ai && ai.kind || 'other';

  if (!v.ok) {
    rec.status = 'failed';
    var rv = v.gates.map(function (g) { return openReview(store, g, { email_id: rec.id, rfq_id: rec.rfq_id }); });
    return { email: rec, quotes: [], reviews: rv, pre: pre, ai: ai };
  }

  var supplier = sup(store, rec.supplier_id);
  var madeQuotes = [], madeReviews = [];

  // gates raised before any quote exists (sender, code, duplicates, matching)
  pre.gates.forEach(function (g) { madeReviews.push(openReview(store, g, { email_id: rec.id, rfq_id: rec.rfq_id })); });

  if (rec.kind === 'clarification' || rec.kind === 'decline' || !v.quotes.length) {
    rec.status = rec.kind === 'clarification' ? 'non_quote' : (v.quotes.length ? 'extracted' : 'non_quote');
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
      items: items.map(function (i) { return i.ask; }), kind: clar ? 'answer' : 'chase',
      status: 'draft', source: d.source || 'ai', created_at: nowIso(), sent_at: null, rev: 1
    };
    store.replies = store.replies.filter(function (r) { return r.email_id !== rec.id; });
    store.replies.push(rp);
    log(store, rec.id, { t: nowIso(), lane: rp.source === 'rule' ? 'rule' : 'ai', step: 'reply', decision: 'DRAFTED', detail: (clar ? 'answers to their questions' : items.length + ' item(s) to chase') + ', waiting for approval' });
    result.reply = rp;
    return result;
  }, function () { return result; });
}

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
  var rfq = {
    id: 'rfq_' + ('000' + n).slice(-4), code: 'RFQ-2026-' + ('000' + n).slice(-4),
    product: String(draft.product || '').trim(), spec_summary: String(draft.spec_summary || '').trim(),
    target_qty: Number(draft.target_qty) || 0, unit: draft.unit || 'pc',
    tier_qtys: (draft.tier_qtys || []).slice().sort(function (a, b) { return a - b; }),
    target_usd_fob: { lo: Number(draft.target_usd_fob.lo), hi: Number(draft.target_usd_fob.hi) },
    required_certs: (draft.required_certs || []).slice(), pl_required: !!draft.pl_required, custom_required: !!draft.custom_required,
    max_lead_days: Number(draft.max_lead_days) || 30, dest_port: draft.dest_port || 'Nhava Sheva, India', incoterm: 'FOB',
    custom_questions: (draft.custom_questions || []).map(function (q, i) { return { qid: 'q' + (i + 1), text: q.text, required: q.required !== false }; }),
    recipients: (draft.recipients || []).slice(), sent_at: store.meta.demo_now, deadline: root.RULES.addDays(store.meta.demo_now, 10),
    status: 'open', created_by: 'you', created_at: nowIso(), readiness: draft.check ? { score: draft.check.score, source: draft.check.source } : null,
    distribution: draft.distribution || 'chosen'
  };
  store.rfqs.push(rfq);
  log(store, rfq.id, { t: nowIso(), lane: 'human', step: 'RFQ', decision: 'SENT', detail: rfq.code + ' to ' + rfq.recipients.length + ' supplier(s)' });
  return rfq;
}

function supplierStatuses(store, rfq) {
  var rows = (rfq.recipients || []).map(function (id) {
    var s = sup(store, id) || { id: id, name: id };
    var emails = store.emails.filter(function (e) { return e.rfq_id === rfq.id && e.supplier_id === id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var quotes = store.quotes.filter(function (q) { return q.rfq_id === rfq.id && q.supplier_id === id && !q.superseded_by; });
    var replies = store.replies.filter(function (r) { return r.rfq_id === rfq.id && r.supplier_id === id; });
    var sent = replies.filter(function (r) { return r.status === 'sent'; })[0];
    var status = !emails.length ? 'awaiting' : (sent && (!emails[0] || sent.sent_at > emails[0].date)) ? 'chased' : 'received';
    return { supplier: s, status: status, emails: emails, quotes: quotes, reply: replies[0] || null, recipient: true };
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

/* ---- eligibility refresh -------------------------------------------- */

function refreshEligibility(store, rfqId) {
  var rfq = rfqById(store, rfqId);
  if (!rfq) return null;
  var qs = store.quotes.filter(function (q) { return q.rfq_id === rfqId; });
  qs.forEach(function (q) {
    q.openGates = store.reviews.filter(function (rv) { return rv.quote_id === q.id && rv.status === 'open'; });
    R.applyOverrides(q, q.overrides);
  });
  var res = R.eligibility(qs, rfq, { meta: store.meta, now: store.meta.demo_now });
  // late gates the eligibility pass discovered
  qs.forEach(function (q) {
    ['expiredGate', 'moqGate', 'outlierGate'].forEach(function (k) {
      if (!q[k]) return;
      var g = q[k];
      var exists = store.reviews.some(function (rv) { return rv.quote_id === q.id && rv.code === g.code; });
      if (!exists) openReview(store, g, { email_id: q.email_id, quote_id: q.id, rfq_id: q.rfq_id });
      q[k] = null;
    });
  });
  return res;
}

/* ---- comparison ------------------------------------------------------ */

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

/* ---- resolving a review --------------------------------------------- */

function resolveReview(store, reviewId, resolution) {
  var rv = store.reviews.filter(function (r) { return r.id === reviewId; })[0];
  if (!rv) return null;
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
  openReview: openReview, log: log, rfqById: rfqById, sup: sup
};

})(typeof window !== 'undefined' ? window : globalThis);
