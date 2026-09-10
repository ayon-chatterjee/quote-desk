/* Node test for the rule lane, using the reference extractions.
   Run: node test/rules.test.js  */
require('../src/seed.js'); require('../src/rules.js'); require('../src/prompts.js');
require('../src/fallback.js'); require('../src/pipeline.js');

var S = globalThis.SEED, R = globalThis.RULES, FB = globalThis.FALLBACK, PL = globalThis.PIPELINE;
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
