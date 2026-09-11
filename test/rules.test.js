/* Node test for the rule lane, using the reference extractions.
   Run: node test/rules.test.js  */
require('../src/seed.js'); require('../src/rules.js'); require('../src/prompts.js');
require('../src/fallback.js'); require('../src/generator.js'); require('../src/sample.js');
require('../src/pipeline.js');

var S = globalThis.SEED, R = globalThis.RULES, FB = globalThis.FALLBACK, PL = globalThis.PIPELINE;
var G = globalThis.GENERATOR;
var pass = 0, fail = 0, notes = [];
function ok(cond, label, detail) {
  if (cond) { pass++; } else { fail++; notes.push('FAIL  ' + label + (detail ? '  ->  ' + detail : '')); }
}

/* --- unit level ------------------------------------------------------ */
ok(R.findCodes('Re: RFQ-2026-0417 quote')[0].code === 'RFQ-2026-0417', 'code in subject');
ok(R.findCodes('RFQ 2026-O431 mailer')[0].code === 'RFQ-2026-0431', 'letter O read as zero');
ok(R.findCodes('RFQ 2026-O431')[0].fuzzy === true, 'typo flagged as fuzzy');
ok(R.findCodes('no code here').length === 0, 'no false positive code');
ok(R.splitQuoted('new text\n\nOn Mon wrote:\n> old').new_ === 'new text', 'quoted history split on "On ... wrote:"');
ok(R.splitQuoted('hi\n> quoted').quoted === '> quoted', 'quoted history split on angle brackets');
ok(R.parseUnit('USD per 1000 pcs').perN === 1000, 'per-1000 unit parsed');
ok(R.parseUnit('CNY/ctn').per === 'ctn' && R.parseUnit('CNY/ctn').cur === 'CNY', 'per-carton CNY parsed');
ok(R.parseUnit('¥16.80/个').cur === 'CNY', 'yuan symbol read as CNY');
ok(R.canonCert('CE (EMC/LVD)') === 'CE', 'cert name mapped');
ok(R.canonCert('FDA 21 CFR 177.2600') === 'FDA', 'cert name with standard mapped');
ok(R.canonCert('Grade A quality') === null, 'unknown cert not guessed');
ok(R.addDays('2026-08-30T06:15:00Z', 15) === '2026-09-14', 'relative validity derived');
ok(R.round4(R.fxToUsd(15.60, 'CNY', S.meta)) === 2.1818, 'CNY converted at the pinned rate');
ok(R.median([1, 5, 3]) === 3, 'median');

/* --- PRNG --------------------------------------------------------------- */
(function () {
  var r1 = G.rng(12345);
  var seq1 = [r1(), r1(), r1(), r1(), r1()];
  var r2 = G.rng(12345);
  var seq2 = [r2(), r2(), r2(), r2(), r2()];
  ok(JSON.stringify(seq1) === JSON.stringify(seq2), 'rng same seed → same sequence');

  var r3 = G.rng(99999);
  var seq3 = [r3(), r3(), r3()];
  ok(JSON.stringify(seq1.slice(0, 3)) !== JSON.stringify(seq3), 'rng different seed → different sequence');

  var rInt = G.rng(7);
  var inRange = true;
  for (var i = 0; i < 5000; i++) {
    var v = rInt.int(3, 17);
    if (v < 3 || v > 17) { inRange = false; break; }
  }
  ok(inRange, 'rng.int stays in [lo, hi]');

  var rPick = G.rng(42);
  var arr = ['a', 'b', 'c', 'd'];
  var pickOk = true;
  for (var j = 0; j < 200; j++) {
    if (arr.indexOf(rPick.pick(arr)) === -1) { pickOk = false; break; }
  }
  ok(pickOk, 'rng.pick always returns a member');

  var rW = G.rng(55);
  var counts = { x: 0, y: 0 };
  for (var k = 0; k < 10000; k++) {
    var w = rW.weighted([['x', 1], ['y', 3]]);
    counts[w]++;
  }
  var ratio = counts.y / counts.x;
  ok(ratio > 2.5 && ratio < 3.5, 'rng.weighted distributes ~3:1', ratio.toFixed(2));

  ok(G.seedLabel(0) === '0000', 'seedLabel(0) is 0000');
  ok(G.seedLabel(1679615) === 'zzzz', 'seedLabel(max) is zzzz');
  ok(G.seedFromLabel(G.seedLabel(54321)) === 54321, 'seedLabel/seedFromLabel round-trip');
})();

/* --- blank store -------------------------------------------------------- */
ok(PL.newStore(S).rfqs.length === 4, 'default store has 4 RFQs');
ok(PL.newStore(S, { blank: true }).rfqs.length === 0, 'blank store has 0 RFQs');

/* --- sampleRequest ------------------------------------------------------ */
(function () {
  var seed = 98765;

  var r7a = G.rng(seed);
  var req7a = G.sampleRequest(r7a, 7);
  ok(req7a.items.length === 7, 'sampleRequest returns 7 items');

  var skus7 = {};
  req7a.items.forEach(function (it) { skus7[it.sku] = (skus7[it.sku] || 0) + 1; });
  ok(Object.keys(skus7).length === 7, 'sampleRequest 7-line: unique SKUs');

  var floorOk7 = req7a.items.every(function (it) { return it.floor > 0 && it.ceiling > it.floor; });
  ok(floorOk7, 'sampleRequest 7-line: floor > 0 and ceiling > floor on every item');

  ok(req7a.custom_questions.length >= 3 && req7a.custom_questions.length <= 5, '7-line: 3–5 questions', req7a.custom_questions.length);

  var p7 = G.draftPayload(req7a);
  var r7check = G.readinessRules(p7);
  ok(r7check.ready === true, 'sampleRequest 7-line draftPayload passes readiness', r7check.missing.filter(function(m){return m.severity==='must';}).map(function(m){return m.field;}).join(','));

  var r30a = G.rng(seed);
  var req30a = G.sampleRequest(r30a, 30);
  ok(req30a.items.length === 30, 'sampleRequest returns 30 items');

  var skus30 = {};
  req30a.items.forEach(function (it) { skus30[it.sku] = (skus30[it.sku] || 0) + 1; });
  ok(Object.keys(skus30).length === 30, 'sampleRequest 30-line: unique SKUs');

  var floorOk30 = req30a.items.every(function (it) { return it.floor > 0 && it.ceiling > it.floor; });
  ok(floorOk30, 'sampleRequest 30-line: floor > 0 and ceiling > floor on every item');

  var prefixes30 = {};
  req30a.items.forEach(function (it) { prefixes30[it.sku.split('-')[0]] = 1; });
  ok(Object.keys(prefixes30).length >= 2, 'sampleRequest 30-line spans ≥ 2 families', Object.keys(prefixes30).join(','));

  var p30 = G.draftPayload(req30a);
  var r30check = G.readinessRules(p30);
  ok(r30check.ready === true, 'sampleRequest 30-line draftPayload passes readiness', r30check.missing.filter(function(m){return m.severity==='must';}).map(function(m){return m.field;}).join(','));

  var r7b = G.rng(seed);
  var req7b = G.sampleRequest(r7b, 7);
  ok(JSON.stringify(req7a) === JSON.stringify(req7b), 'sampleRequest same seed → byte-identical output');

  var r7c = G.rng(seed + 1);
  var req7c = G.sampleRequest(r7c, 7);
  ok(JSON.stringify(req7a) !== JSON.stringify(req7c), 'sampleRequest different seed → different output');
})();

/* --- createRfq from sample --------------------------------------------- */
(function () {
  var blankStore = PL.newStore(S, { blank: true });
  var req = G.sampleRequest(G.rng(11111), 30);
  var rfq = PL.createRfq(blankStore, req);
  ok(rfq.code === 'RFQ-2026-0401', 'createRfq on blank store: first code is RFQ-2026-0401', rfq.code);
  ok(rfq.items && rfq.items.length === 30, 'createRfq: 30 items on multi-line request', rfq.items && rfq.items.length);
  ok(rfq.items.every(function (it) { return it.tier_qtys && it.tier_qtys.length > 0; }), 'createRfq: tiers present on every line');
})();

/* --- full pipeline over the sample set -------------------------------- */
var store = PL.newStore(S);
var expected = {};
S.emails.forEach(function (e) { if (e.expected) expected[e.sample_id] = e.expected; });

var opts = {
  expected: expected,
  extract: function (pb, email) {
    var ref = FB[email.sample_id];
    if (!ref) return Promise.reject({ code: 'no_reference' });
    return Promise.resolve({ ai: JSON.parse(JSON.stringify(ref)), source: 'reference', tier: null });
  },
  match: function (mb, email) {
    var ref = FB[email.sample_id];
    if (email.sample_id === 's03') return Promise.resolve({ rfqCode: 'RFQ-2026-0417', c: 0.72, why: 'The rate card is for a 550ml collapsible silicone bottle, the only open enquiry for that product.' });
    return Promise.resolve(ref ? { rfqCode: null, c: 0 } : null);
  },
  compare: function (cb, rfq, eligible) {
    var cheapest = eligible.slice().sort(function (a, b) { return a.norm.usd_at_target.v - b.norm.usd_at_target.v; })[0];
    return Promise.resolve({
      source: 'reference', tier: null,
      ai: {
        cheapest: { id: cheapest.id, why: 'Lowest normalised FOB price.' },
        best_value: { id: eligible[eligible.length - 1].id, why: 'reference stub', tradeoffs: [] },
        recommended: { id: cheapest.id, c: 0.7, why: 'reference stub', runner_up: null, verify_before_award: [], negotiate: [], risks: [] },
        per_quote: [], questions_for_buyer: []
      }
    });
  }
};

var chain = Promise.resolve();
S.emails.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (e) {
  chain = chain.then(function () { return PL.processEmail(e, store, opts); });
});

chain.then(function () {
  var bySample = {};
  store.emails.forEach(function (e) { if (e.sample_id) bySample[e.sample_id] = e; });

  ok(bySample.s13.status === 'duplicate', 's13 recognised as a duplicate', bySample.s13.status);
  ok(bySample.s13.duplicate_of === 'em_s01', 's13 points at the original', bySample.s13.duplicate_of);
  ok(bySample.s03.rfq_id === 'rfq_0417', 's03 matched to the bottle enquiry without a code', bySample.s03.rfq_id);
  ok(bySample.s11.match.code === 'RFQ-2026-0431', 's11 typo-code resolved', bySample.s11.match.code);
  ok(bySample.s12.kind === 'clarification', 's12 read as a clarification, not a quote', bySample.s12.kind);

  /* per-sample expectations */
  S.emails.forEach(function (e) {
    if (!e.expected || !FB[e.sample_id]) return;
    var qs = store.quotes.filter(function (q) { return q.email_id === e.id; });
    var primary = qs.filter(function (q) { return q.rfq_id === e.rfq_id; })[0] || qs[0];
    var gates = store.reviews.filter(function (rv) { return rv.email_id === e.id; }).map(function (rv) { return rv.code; });
    var exp = e.expected;

    if (exp.fields && exp.fields.price_at_target_usd !== undefined && primary) {
      var got = primary.norm.usd_at_target.v;
      var want = exp.fields.price_at_target_usd;
      var good = want == null ? got == null : (got != null && Math.abs(got - want) <= 0.02);
      ok(good, e.sample_id + ' price at our quantity', 'want ' + want + ', got ' + got);
    }
    if (exp.fields && exp.fields.moq_pcs !== undefined && primary) {
      ok(primary.norm.moq_pcs.v === exp.fields.moq_pcs, e.sample_id + ' minimum order',
        'want ' + exp.fields.moq_pcs + ', got ' + primary.norm.moq_pcs.v);
    }
    if (exp.fields && exp.fields.certs_canon && primary) {
      ok(primary.norm.certs_canon.v.slice().sort().join(',') === exp.fields.certs_canon.slice().sort().join(','),
        e.sample_id + ' certificates', 'want ' + exp.fields.certs_canon + ', got ' + primary.norm.certs_canon.v);
    }
    (exp.gates || []).forEach(function (code) {
      ok(gates.indexOf(code) > -1, e.sample_id + ' raises ' + code, 'raised: ' + (gates.join(',') || 'none'));
    });
  });

  /* s01 is the clean baseline */
  var q1 = store.quotes.filter(function (q) { return q.email_id === 'em_s01'; })[0];
  ok(q1.gaps.length === 0, 's01 has no unanswered items', JSON.stringify(q1.gaps.map(function (g) { return g.field; })));
  ok(q1.highlights.length === 0, 's01 has nothing to highlight', q1.highlights.length + '');
  ok(store.reviews.filter(function (r) { return r.email_id === 'em_s01'; }).length === 0, 's01 needs no human');
  ok(q1.completeness === 100, 's01 completeness', q1.completeness + '');

  /* highlights land on real text */
  var hlTotal = 0, hlBad = 0;
  store.quotes.forEach(function (q) {
    var email = store.emails.filter(function (e) { return e.id === q.email_id; })[0];
    var sources = { body: email.body_new };
    (email.attachments || []).forEach(function (a) { sources['att:' + a.name] = a.transcript || ''; });
    q.highlights.forEach(function (h) {
      hlTotal++;
      if (!sources[h.src] || sources[h.src].indexOf(h.ev) === -1) hlBad++;
    });
  });
  ok(hlBad === 0, 'every highlight anchors to real source text', hlBad + ' of ' + hlTotal + ' do not');
  ok(hlTotal > 0, 'highlights were produced at all', hlTotal + '');

  /* supersede */
  var s06q = store.quotes.filter(function (q) { return q.email_id === 'em_s06'; })[0];
  var s09q = store.quotes.filter(function (q) { return q.email_id === 'em_s09'; })[0];
  ok(s06q.superseded_by === s09q.id, 's09 supersedes the earlier Excel quote', String(s06q.superseded_by));
  ok(s06q.eligibility.status === 'superseded', 'superseded quote drops out', s06q.eligibility.status);

  /* multi-SKU split */
  var brightQs = store.quotes.filter(function (q) { return q.email_id === 'em_s07'; });
  ok(brightQs.length === 3, 's07 split into three line items', brightQs.length + '');
  ok(brightQs.filter(function (q) { return q.rfq_id === null; }).length === 2, 's07 parks the two extra products');

  /* outlier needs the others to exist */
  PL.refreshEligibility(store, 'rfq_0422');
  var s07q = brightQs[0];
  ok(store.reviews.some(function (r) { return r.quote_id === s07q.id && r.code === 'PRICE_OUTLIER'; }),
    's07 flagged as a price outlier', JSON.stringify(store.reviews.filter(function (r) { return r.quote_id === s07q.id; }).map(function (r) { return r.code; })));

  /* eligibility snapshot */
  var statuses = {};
  store.quotes.forEach(function (q) { statuses[q.id] = q.eligibility.status; });

  /* human resolution re-runs the rules */
  var s04q = store.quotes.filter(function (q) { return q.email_id === 'em_s04'; })[0];
  ok(s04q.eligibility.status === 'needs_review', 's04 waits on a person before comparison', s04q.eligibility.status);
  store.reviews.filter(function (r) { return r.quote_id === s04q.id && r.status === 'open'; }).forEach(function (r) {
    if (r.code === 'INCOTERM_MISMATCH') {
      PL.resolveReview(store, r.id, { action: 'edit', field: 'usd_at_target', value: 2.26, reason: 'EXW Ningbo plus USD 0.08 inland to Shanghai port' });
      PL.resolveReview(store, r.id, { action: 'edit', field: 'incoterm', value: 'FOB', reason: 'normalised' });
    } else {
      PL.resolveReview(store, r.id, { action: 'accept', reason: 'confirmed' });
    }
  });
  PL.refreshEligibility(store, 'rfq_0417');
  ok(s04q.eligibility.status === 'eligible', 's04 becomes eligible once the incoterm is normalised',
    s04q.eligibility.status + ' / ' + s04q.eligibility.reasons.join('; '));
  ok(s04q.norm.usd_at_target.rule === 'human', 's04 price is now marked as a human value', s04q.norm.usd_at_target.rule);

  /* comparison */
  return PL.compare('rfq_0417', store, opts).then(function (c1) {
    ok(c1.status === 'done', '0417 comparison ran', c1.status);
    ok(c1.eligible_ids.length === 2, '0417 has two eligible quotes after review', c1.eligible_ids.join(','));
    ok(c1.cheapest_id === s04q.id, '0417 cheapest is the normalised EXW quote', String(c1.cheapest_id));
    return PL.compare('rfq_0431', store, opts);
  }).then(function (c3) {
    ok(c3.no_candidates === true, '0431 has nothing eligible and makes no reader call', JSON.stringify(c3.eligible_ids));
    /* staleness */
    var s01q = store.quotes.filter(function (q) { return q.email_id === 'em_s01'; })[0];
    var rvId = PL.openReview(store, R.gate('CRITICAL_FIELD_LOW_CONF', { field: 'moq' }), { email_id: 'em_s01', quote_id: s01q.id, rfq_id: 'rfq_0417' }).id;
    PL.resolveReview(store, rvId, { action: 'edit', field: 'moq_pcs', value: 1200, reason: 'confirmed by phone' });
    var stale = store.comparisons.filter(function (c) { return c.rfq_id === 'rfq_0417'; }).every(function (c) { return c.status === 'stale'; });
    ok(stale, 'editing a quote makes the earlier comparison stale');

    /* logs are aggregated, not one document per line */
    ok(store.logs.length <= store.emails.length + store.comparisons.length + 2, 'logs stay aggregated per subject', store.logs.length + ' buckets');
    ok(store.logs.every(function (l) { return l.entries.length <= 200; }), 'no log bucket exceeds its cap');

    /* eval coverage, re-scored now that every quote exists */
    PL.rerunEvals(store, expected);
    var evTot = store.evals.reduce(function (a, e) { return a + e.total; }, 0);
    var evPass = store.evals.reduce(function (a, e) { return a + e.passed; }, 0);
    console.log('\nEval rows: ' + evPass + ' of ' + evTot + ' expectations met across ' + store.evals.length + ' samples');
    console.log('Quotes: ' + store.quotes.length + '  Reviews: ' + store.reviews.length + '  Log buckets: ' + store.logs.length);
    console.log('\nEligibility after the review pass:');
    store.rfqs.forEach(function (r) {
      var qs = store.quotes.filter(function (q) { return q.rfq_id === r.id; });
      console.log('  ' + r.code + ': ' + (qs.map(function (q) {
        return q.supplier_name.split(' ')[0] + '=' + q.eligibility.status + (q.norm.usd_at_target.v != null ? ' $' + q.norm.usd_at_target.v : '');
      }).join(', ') || 'none'));
    });

    console.log('\n' + notes.join('\n'));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  });
}).catch(function (e) {
  console.error('THREW', e && e.stack || e);
  process.exit(1);
});
