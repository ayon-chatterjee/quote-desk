/* Quote Desk — screens. */
(function () {
'use strict';
var A = window.APP, S = window.SEED, R = window.RULES, P = window.PROMPTS, PL = window.PIPELINE, G = window.GENERATOR;
var esc = A.esc, $ = A.$, money = A.money, lane = A.laneBadge, chip = A.statusChip;

function fmtLabel(k) { var f = S.formats.filter(function (x) { return x.key === k; })[0]; return f ? f.label : k; }
function shortDate(d) { return String(d || '').slice(0, 10); }
function pct(n) { return Math.round(n * 100) + '%'; }
function n0(v) { return v == null ? '—' : Number(v).toLocaleString('en-US'); }
function uniqLines(a) { var o = {}, r = []; a.forEach(function (x) { if (x != null && !o[x]) { o[x] = 1; r.push(x); } }); return r; }
function rfqMeta(rfq) {
  var items = R.rfqItems(rfq);
  var qtyBand = items.length > 1
    ? items.length + ' line item(s)'
    : n0(items[0].qty) + ' ' + esc(items[0].unit) + ' · USD ' + items[0].target_usd_fob.lo.toFixed(2) + '–' + items[0].target_usd_fob.hi.toFixed(2) + ' FOB';
  return qtyBand + ' · ' + esc((rfq.required_certs || []).join(' + ') || 'no certs required') + (rfq.pl_required ? ' · private label' : '');
}
function supStatusChip(st) { return chip(st === 'awaiting' ? 'awaiting_reply' : st); }

/* ===================== inquiries ===================== */
A.route(/^\/rfqs$/, function () {
  return '<div class="page-head"><div><h1>Inquiries</h1></div>' +
    '<div class="row"><button class="btn" data-act="new-rfq">New inquiry</button></div></div>' +
    '<p class="lede">Each request for quotation: who it went to, who has answered, and the quotes stacked underneath. ' +
    'A new inquiry is checked for gaps before it goes out, then floated to the suppliers you choose.</p>' +
    '<div class="stack">' + A.store.rfqs.slice().reverse().map(rfqCard).join('') + '</div>';
});

function rfqCard(rfq) {
  var qs = A.quotesFor(rfq.id);
  var multiLine = A.isMultiLine(rfq);
  var rows = PL.supplierStatuses(A.store, rfq);
  var replied = rows.filter(function (r) { return r.status !== 'awaiting'; }).length;
  var el = qs.filter(function (q) { return q.eligibility && q.eligibility.status === 'eligible'; }).length;
  var waiting = A.unsynced().filter(function (e) { return e.rfq_id === rfq.id; }).length;
  var compareHref = multiLine ? '#/quotations/' + rfq.id : '#/compare/' + rfq.id;
  return '<div class="card"><div class="spread" style="margin-bottom:8px">' +
    '<div><h2>' + esc(rfq.product) + '</h2>' +
    '<div class="muted" style="font-size:12.5px;margin-top:2px"><span class="tag">' + esc(rfq.code) + '</span> ' + rfqMeta(rfq) + '</div></div>' +
    '<div class="row">' + (rfq.status === 'awarded' ? '<span class="chip chip-pass">Awarded</span>' : '') +
    (multiLine ? '<a class="btn ghost sm" href="#/supplier/' + rfq.id + '/A" style="text-decoration:none">Supplier view</a>' : '') +
    '<a class="btn ghost sm" href="#/rfq/' + rfq.id + '" style="text-decoration:none">Detail</a>' +
    (qs.length ? '<a class="btn sm" href="' + compareHref + '" style="text-decoration:none">' + (multiLine ? 'Quotations' : 'Compare ' + qs.length) + '</a>' : '') +
    '</div></div>' +
    '<div class="row" style="gap:6px;margin-bottom:10px;font-size:12px">' +
      '<span class="chip chip-mute">Sent to ' + rows.filter(function (r) { return r.recipient; }).length + '</span>' +
      '<span class="chip ' + (replied ? 'chip-pass' : 'chip-mute') + '">' + replied + ' responded</span>' +
      '<span class="chip chip-mute">' + rows.filter(function (r) { return r.status === 'awaiting'; }).length + ' awaiting</span>' +
      (waiting ? '<span class="chip chip-info">' + waiting + ' in inbox, not synced</span>' : '') +
      (qs.length ? '<span class="muted">' + el + ' of ' + qs.length + ' quotes pass the hard criteria</span>' : '') +
    '</div>' +
    (!qs.length ? '<div class="empty" style="padding:16px;font-size:12.5px">No quotes read yet. ' +
      (waiting ? '<a href="#/inbox">Sync the inbox</a> to pull in ' + A.plural(waiting, 'reply', 'replies') + '.' : multiLine ? 'Compose replies in <a href="#/supplier/' + rfq.id + '/A">Supplier view</a>.' : 'Replies land in <a href="#/inbox">Emails</a>.') + '</div>'
      : multiLine ? '' : quoteTable(qs, rfq)) +
    '</div>';
}

/* ===================== new inquiry wizard ===================== */
var CERT_OPTIONS = ['CE', 'RoHS', 'FCC', 'FDA', 'LFGB', 'FSC', 'BIS', 'ISO9001', 'BSCI', 'REACH', 'EN71', 'UL', 'GOTS', 'OEKOTEX'];
var UNITS = ['pc', 'set', 'pair', 'kg', 'm'];

function newDraft() {
  return { step: 1, product: '', spec_summary: '', target_qty: '', unit: 'pc', tier_qtys: '', target_usd_fob: { lo: '', hi: '' },
    required_certs: [], pl_required: null, custom_required: null, max_lead_days: '', dest_port: 'Nhava Sheva, India',
    custom_questions: [], distribution: 'all', recipients: [], check: null, checking: false,
    multiLine: false, items: [] };
}
function exampleDraft() {
  var d = newDraft();
  d.product = 'Bamboo fibre lunch box, 1000 ml';
  d.spec_summary = 'Bamboo fibre body, PP lid with silicone seal, two compartments';
  d.target_qty = 5000; d.tier_qtys = '2000, 5000'; d.target_usd_fob = { lo: '', hi: 2.4 };
  d.required_certs = ['FDA']; d.pl_required = true; d.max_lead_days = '';
  d.custom_questions = [{ text: 'Can you match Pantone 7499 C on the lid?', required: true }];
  return d;
}
function multiLineExampleDraft() {
  var d = newDraft();
  d.multiLine = true;
  d.product = 'Private-label kitchen and dining range';
  d.spec_summary = 'Thirty-SKU private-label kitchen and dining collection: silicone tools, bamboo boards and accessories, glass storage with bamboo lids, stainless steel tools, and kraft-lined lunch boxes.';
  d.items = S.sampleLines30.map(function (it) { return Object.assign({}, it); });
  d.required_certs = ['FDA', 'LFGB']; d.pl_required = true; d.custom_required = true; d.max_lead_days = 40;
  d.custom_questions = [
    { text: 'Can every SKU carry our 1-colour logo, and is there a minimum quantity per SKU for logo printing?', required: true },
    { text: 'Which SKUs, if any, cannot be produced at the quantities we have asked for?', required: true },
    { text: 'What is the earliest production slot you can offer for an order across the whole range?', required: true }
  ];
  return d;
}
/* Tab-separated, not comma-separated: the product and spec text almost always contains a
   comma of its own ("Silicone spoon set, 2pc"), which would otherwise split mid-field. A tab
   is what a spreadsheet paste already uses, so this also doubles as "paste from Excel". */
function itemsToCsv(items) {
  return items.map(function (it) { return [it.sku, it.product, it.spec || '', it.qty, it.unit || 'pc', it.floor, it.ceiling].join('\t'); }).join('\n');
}
function csvToItems(text) {
  return String(text || '').split('\n').map(function (line) { return line.replace(/\r$/, ''); }).filter(function (l) { return l.trim(); }).map(function (line) {
    var parts = line.split('\t').map(function (p) { return p.trim(); });
    if (parts.length < 4) parts = line.split(',').map(function (p) { return p.trim(); }); /* tolerate a comma-separated paste too */
    return { sku: parts[0] || '', product: parts[1] || '', spec: parts[2] || '', qty: Number(parts[3]) || 0, unit: parts[4] || 'pc', floor: Number(parts[5]) || 0, ceiling: Number(parts[6]) || 0 };
  });
}
function normDraft(d) {
  var base = {
    product: String(d.product || '').trim(), spec_summary: String(d.spec_summary || '').trim(),
    required_certs: d.required_certs.slice(), pl_required: d.pl_required, custom_required: d.custom_required,
    max_lead_days: Number(d.max_lead_days) || null, dest_port: String(d.dest_port || '').trim(),
    custom_questions: d.custom_questions.slice(), distribution: d.distribution, recipients: d.recipients.slice(), check: d.check
  };
  if (d.multiLine) { base.items = d.items.map(function (it) { return Object.assign({}, it); }); return base; }
  var tiers = String(d.tier_qtys || '').split(/[,\s]+/).map(function (x) { return parseInt(x, 10); }).filter(function (n) { return n > 0; });
  base.target_qty = Number(d.target_qty) || 0; base.unit = d.unit || 'pc'; base.tier_qtys = tiers;
  base.target_usd_fob = { lo: d.target_usd_fob.lo === '' ? null : Number(d.target_usd_fob.lo), hi: d.target_usd_fob.hi === '' ? null : Number(d.target_usd_fob.hi) };
  return base;
}
function readDraftForm() {
  var d = A.draft; if (!d || !$('#d-product')) return d;
  d.product = $('#d-product').value; d.spec_summary = $('#d-spec').value;
  if (d.multiLine) {
    var ta = $('#d-lines-csv'); if (ta) d.items = csvToItems(ta.value);
  } else {
    d.target_qty = $('#d-qty').value; d.unit = $('#d-unit').value; d.tier_qtys = $('#d-tiers').value;
    d.target_usd_fob = { lo: $('#d-lo').value, hi: $('#d-hi').value };
  }
  var pl = $('input[name="d-pl"]:checked'); d.pl_required = pl ? pl.value === 'yes' : null;
  var cu = $('input[name="d-custom"]:checked'); d.custom_required = cu ? cu.value === 'custom' : null;
  d.max_lead_days = $('#d-lead').value; d.dest_port = $('#d-port').value;
  var other = $('#d-cert-other').value.split(/[,\s]+/).filter(Boolean);
  other.forEach(function (c) { if (d.required_certs.indexOf(c) === -1) d.required_certs.push(c); });
  $('#d-cert-other').value = '';
  return d;
}

A.route(/^\/rfq\/new$/, function () { return wizard(); });

function wizard() {
  var d = A.draft || (A.draft = newDraft());
  var steps = '<div class="steps">' + [['1', 'Describe'], ['2', 'Check'], ['3', 'Suppliers']].map(function (s, i) {
    var n = i + 1; return '<span class="' + (n === d.step ? 'on' : n < d.step ? 'done' : '') + '">' + s[0] + ' · ' + s[1] + '</span>';
  }).join('') + '</div>';
  var head = '<div class="page-head"><div><a href="#/rfqs" style="font-size:12.5px">← Inquiries</a><h1 style="margin-top:3px">New inquiry</h1></div>' +
    '<div class="row">' + (d.step === 1 ? '<button class="btn ghost sm" data-act="draft-example">Fill with an example</button><button class="btn ghost sm" data-act="draft-example-lines">Load the 30-line sample</button>' : '') +
    '<button class="btn ghost sm" data-act="draft-reset">Start over</button></div></div>' + steps;
  if (d.step === 3) return head + '<div class="wizard">' + summaryCard(d) + distributionCard(d) + '</div>';
  return head + '<div class="wizard">' + draftForm(d) + (d.step === 2 || d.checking || d.check ? readinessCard(d) : hintsCard()) + '</div>';
}

function linesEditor(d) {
  return '<label class="f wide"><span class="spread">Line items<span class="muted" style="font-weight:400;font-size:11.5px">' + d.items.length + ' line(s)</span></span>' +
    '<textarea id="d-lines-csv" rows="10" style="font-family:var(--mono);font-size:11.5px;white-space:pre" placeholder="sku[Tab]product[Tab]spec[Tab]qty[Tab]unit[Tab]floor[Tab]ceiling — one line per row">' + esc(itemsToCsv(d.items)) + '</textarea>' +
    '<span class="muted" style="font-size:11px;font-weight:400">One row per line item, fields separated by Tab: SKU, product, spec, quantity, unit, floor price, ceiling price (USD FOB) — paste straight from a spreadsheet, or edit here and reload the sample if you get stuck.</span></label>';
}

function draftForm(d) {
  var miss = {};
  if (d.check) (d.check.missing || []).forEach(function (m) { miss[m.field] = m.severity; });
  function f(field, label, inner, wide) {
    return '<label class="f' + (miss[field] ? ' miss' : '') + (wide ? ' wide' : '') + '">' + esc(label) +
      (miss[field] ? ' <span class="chip ' + (miss[field] === 'must' ? 'chip-crit' : 'chip-warn') + '" style="font-size:10px;padding:0 6px">' + (miss[field] === 'must' ? 'needed' : 'improve') + '</span>' : '') + inner + '</label>';
  }
  return '<div class="card"><div class="form">' +
    '<label class="f wide" style="flex-direction:row;align-items:center;gap:8px;font-weight:600"><input type="checkbox" id="d-multiline" data-change="multiline"' + (d.multiLine ? ' checked' : '') + ' style="width:auto"> This inquiry has multiple line items (a bill of materials, not one product)</label>' +
    f(d.multiLine ? 'title' : 'product', d.multiLine ? 'Title for the range' : 'Product name', '<input type="text" id="d-product" value="' + esc(d.product) + '" placeholder="' + (d.multiLine ? 'e.g. Private-label kitchen and dining range' : 'e.g. Collapsible silicone water bottle, 550 ml') + '">', true) +
    f('spec_summary', d.multiLine ? 'General specification' : 'Specification', '<textarea id="d-spec" rows="3" placeholder="Material, dimensions, finish, print, packaging">' + esc(d.spec_summary) + '</textarea>', true) +
    (d.multiLine ? linesEditor(d) : (
    f('target_qty', 'Quantity we intend to order', '<div class="row" style="gap:6px;flex-wrap:nowrap"><input type="number" id="d-qty" value="' + esc(d.target_qty) + '" min="1" style="flex:1">' +
      '<select id="d-unit" style="width:90px">' + UNITS.map(function (u) { return '<option' + (u === d.unit ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></div>') +
    f('tier_qtys', 'Quantities to price (comma separated)', '<input type="text" id="d-tiers" value="' + esc(d.tier_qtys) + '" placeholder="2000, 5000, 10000">') +
    f('target_usd_fob', 'Target price band, USD FOB China', '<div class="row" style="gap:6px;flex-wrap:nowrap"><input type="number" step="0.01" id="d-lo" value="' + esc(d.target_usd_fob.lo) + '" placeholder="floor"><span class="muted">to</span><input type="number" step="0.01" id="d-hi" value="' + esc(d.target_usd_fob.hi) + '" placeholder="ceiling"></div>')
    )) +
    f('max_lead_days', 'Latest acceptable lead time, days', '<input type="number" id="d-lead" value="' + esc(d.max_lead_days) + '" placeholder="30">') +
    f('required_certs', 'Required certifications', '<div class="chips">' + CERT_OPTIONS.map(function (c) {
      return '<button type="button" data-act="cert" data-c="' + c + '" aria-pressed="' + (d.required_certs.indexOf(c) > -1) + '">' + c + '</button>';
    }).join('') + d.required_certs.filter(function (c) { return CERT_OPTIONS.indexOf(c) === -1; }).map(function (c) {
      return '<button type="button" data-act="cert" data-c="' + esc(c) + '" aria-pressed="true">' + esc(c) + '</button>';
    }).join('') + '</div><input type="text" id="d-cert-other" placeholder="other, comma separated" style="margin-top:5px">', true) +
    f('pl_required', 'Private label (our logo on the product)', '<div class="row" style="gap:12px;font-weight:400"><label><input type="radio" name="d-pl" value="yes" style="width:auto"' + (d.pl_required === true ? ' checked' : '') + '> Required</label><label><input type="radio" name="d-pl" value="no" style="width:auto"' + (d.pl_required === false ? ' checked' : '') + '> Not needed</label></div>') +
    f('custom_required', 'Stock or custom', '<div class="row" style="gap:12px;font-weight:400"><label><input type="radio" name="d-custom" value="custom" style="width:auto"' + (d.custom_required === true ? ' checked' : '') + '> Made to our spec</label><label><input type="radio" name="d-custom" value="stock" style="width:auto"' + (d.custom_required === false ? ' checked' : '') + '> Off-the-shelf is fine</label></div>') +
    f('dest_port', 'Destination port', '<input type="text" id="d-port" value="' + esc(d.dest_port) + '">') +
    f('custom_questions', 'Questions to the supplier', '<div class="qlist">' + d.custom_questions.map(function (q, i) {
      return '<div><span style="flex:1">' + esc(q.text) + '</span><button type="button" class="btn ghost sm" data-act="draft-rm-q" data-i="' + i + '">Remove</button></div>';
    }).join('') + '</div><div class="row" style="gap:6px;margin-top:5px;flex-wrap:nowrap"><input type="text" id="d-newq" placeholder="Add a question"><button type="button" class="btn ghost sm" data-act="draft-add-q">Add</button></div>', true) +
    '</div><div class="row" style="margin-top:14px;justify-content:space-between">' +
    '<span class="muted" style="font-size:12px">' + (A.aiReady ? 'Claude reads the whole draft and says what a factory would still need. ' : 'Fixed rules check the draft. ') + lane(A.aiReady ? 'ai' : 'rule') + '</span>' +
    '<button class="btn" data-act="draft-check"' + (d.checking ? ' disabled' : '') + '>' + (d.check ? 'Check again' : (A.aiReady ? 'Check with Claude' : 'Check')) + '</button></div></div>';
}

function hintsCard() {
  return '<div class="card"><div class="eyebrow" style="margin-bottom:7px">What the check looks for</div>' +
    '<ul style="margin:0;padding-left:16px;font-size:12.5px;color:var(--ink-2);line-height:1.6">' +
    '<li>Can a factory quote this without asking anything back?</li><li>Can we compare the quotes that return: quantity, price band, private label, certificates?</li>' +
    '<li>Which questions decide the award and are still missing?</li><li>Specification details a supplier would otherwise assume.</li></ul>' +
    '<div class="hr"></div><p class="muted" style="font-size:12px;margin:0">Anything marked <span class="chip chip-crit" style="font-size:10px;padding:0 6px">needed</span> blocks sending. ' +
    '<span class="chip chip-warn" style="font-size:10px;padding:0 6px">improve</span> is advice you can skip.</p></div>';
}

function readinessCard(d) {
  if (d.checking) return '<div class="card"><div class="row"><span class="spin"></span><b>' + (A.aiReady ? 'Claude is reading your inquiry…' : 'Checking…') + '</b></div>' +
    '<p class="muted" style="font-size:12px;margin:8px 0 0">It looks at the draft the way a factory would: what is missing, what is vague, what it would ask back.</p>' +
    (d.checkText ? '<pre class="reply-box" style="margin-top:8px;max-height:140px">' + esc(d.checkText.slice(-800)) + '</pre>' : '') + '</div>';
  var c = d.check; if (!c) return hintsCard();
  var must = c.missing.filter(function (m) { return m.severity === 'must'; }), should = c.missing.filter(function (m) { return m.severity !== 'must'; });
  return '<div class="card"><div class="spread" style="margin-bottom:6px"><div><div class="eyebrow">Readiness</div>' +
    '<div class="row" style="gap:10px"><span class="score" style="color:' + (c.ready ? 'var(--pass)' : 'var(--warn)') + '">' + c.score + '</span>' +
    '<div><b style="display:block">' + (c.ready ? 'Ready to send' : must.length + ' thing' + (must.length > 1 ? 's' : '') + ' still needed') + '</b>' +
    '<span class="muted" style="font-size:11.5px">' + (should.length ? should.length + ' suggestion' + (should.length > 1 ? 's' : '') + ' to make quotes more accurate' : 'no further suggestions') + '</span></div></div></div>' +
    lane(c.source === 'ai' ? 'ai' : 'rule') + '</div>' +
    (c.note ? '<div class="banner" style="margin-bottom:8px">' + esc(c.note) + '</div>' : '') +
    (c.missing.length ? c.missing.map(function (m) {
      return '<div class="ready-item ' + (m.severity === 'must' ? 'must' : '') + '"><i style="font-style:normal;font-weight:700;color:' + (m.severity === 'must' ? 'var(--crit)' : 'var(--warn)') + '">' + (m.severity === 'must' ? '✕' : '!') + '</i>' +
        '<div><b>' + esc(m.label || m.field) + '</b>' + (m.by === 'rule' ? ' ' + lane('rule') : '') + '<div class="muted" style="font-size:12px">' + esc(m.why || '') + '</div>' +
        (m.suggestion ? '<div style="font-size:12px;margin-top:2px">→ ' + esc(m.suggestion) + '</div>' : '') + '</div></div>';
    }).join('') : '<div class="banner ok" style="margin-bottom:8px">Nothing missing. A factory could quote this as it stands.</div>') +
    (c.spec_gaps && c.spec_gaps.length ? '<div class="eyebrow" style="margin:12px 0 5px">Specification details to add</div><ul style="margin:0;padding-left:16px;font-size:12.5px;color:var(--ink-2)">' +
      c.spec_gaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>' : '') +
    (c.suggested_questions && c.suggested_questions.length ? '<div class="eyebrow" style="margin:12px 0 5px">Questions worth adding</div>' +
      c.suggested_questions.map(function (q, i) {
        var already = d.custom_questions.some(function (x) { return x.text === q.text; });
        return '<div class="ready-item"><i style="font-style:normal;color:var(--accent)">?</i><div><b style="font-weight:600">' + esc(q.text) + '</b><div class="muted" style="font-size:12px">' + esc(q.why || '') + '</div>' +
          (already ? '<span class="chip chip-pass" style="margin-top:4px">added</span>' : '<button class="btn ghost sm" style="margin-top:4px" data-act="draft-add-sq" data-i="' + i + '">Add this question</button>') + '</div></div>';
      }).join('') : '') +
    '<div class="row" style="margin-top:14px;justify-content:space-between">' +
    '<span class="muted" style="font-size:11.5px">' + (c.ready ? 'Fill in any suggestions you want, then continue.' : 'Fill the red items in the form, then check again.') + '</span>' +
    '<button class="btn" data-act="draft-step3"' + (c.ready ? '' : ' disabled') + '>Continue to suppliers →</button></div></div>';
}

function summaryCard(d) {
  var n = normDraft(d);
  var code = 'RFQ-2026-' + ('000' + PL.nextCode(A.store)).slice(-4);
  var qtyRow = n.items
    ? '<dt>Lines</dt><dd>' + n.items.length + ' line item(s), ' + n0(n.items.reduce(function (a, it) { return a + it.qty; }, 0)) + ' units total</dd>'
    : '<dt>Quantity</dt><dd>' + n0(n.target_qty) + ' ' + esc(n.unit) + ' · price at ' + esc(n.tier_qtys.join(', ') || n0(n.target_qty)) + '</dd>' +
      '<dt>Target</dt><dd>USD ' + (n.target_usd_fob.lo || 0).toFixed(2) + ' – ' + (n.target_usd_fob.hi || 0).toFixed(2) + ' FOB China</dd>';
  return '<div class="card"><div class="eyebrow" style="margin-bottom:7px">What will be sent</div><h2 style="margin-bottom:6px">' + esc(n.product) + '</h2>' +
    '<dl class="gcard" style="border:0;padding:0;background:none;margin:0">' +
    '<dt>Code</dt><dd class="mono">' + code + '</dd>' +
    '<dt>Spec</dt><dd>' + esc(n.spec_summary) + '</dd>' + qtyRow +
    '<dt>Certs</dt><dd>' + esc(n.required_certs.join(', ') || 'none') + '</dd>' +
    '<dt>Label</dt><dd>' + (n.pl_required ? 'Private label required' : 'Not required') + ' · ' + (n.custom_required ? 'made to our spec' : 'off-the-shelf acceptable') + '</dd>' +
    '<dt>Lead</dt><dd>up to ' + (n.max_lead_days || 30) + ' days · to ' + esc(n.dest_port) + '</dd>' +
    '<dt>Questions</dt><dd><ol style="margin:0;padding-left:16px">' + n.custom_questions.map(function (q) { return '<li>' + esc(q.text) + '</li>'; }).join('') + '</ol></dd>' +
    '</dl>' + (n.items ? '<div class="hr"></div><div class="scroll-x"><table class="matrix" style="font-size:11.5px"><thead><tr><th>Line</th><th>SKU</th><th>Product</th><th>Qty</th><th>Band</th></tr></thead><tbody>' +
      n.items.map(function (it, i) { return '<tr><td>' + (i + 1) + '</td><td class="mono">' + esc(it.sku) + '</td><td>' + esc(it.product) + '</td><td>' + n0(it.qty) + ' ' + esc(it.unit) + '</td><td>' + it.floor.toFixed(2) + '–' + it.ceiling.toFixed(2) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '') +
    '<div class="row" style="margin-top:12px"><button class="btn ghost sm" data-act="draft-back">← Back to the check</button></div></div>';
}

function distributionCard(d) {
  var sups = A.store.suppliers.slice();
  var verified = sups.filter(function (s) { return s.verified; });
  var chosen = d.distribution === 'all' ? verified.map(function (s) { return s.id; }) : d.recipients;
  return '<div class="card"><div class="eyebrow" style="margin-bottom:7px">Who receives it</div>' +
    '<div class="stack" style="gap:6px;margin-bottom:10px">' +
    '<label class="row" style="gap:8px;cursor:pointer"><input type="radio" name="d-dist" value="all" data-change="dist" style="width:auto"' + (d.distribution === 'all' ? ' checked' : '') + '> <b>Float to all verified suppliers</b> <span class="muted">(' + verified.length + ')</span></label>' +
    '<label class="row" style="gap:8px;cursor:pointer"><input type="radio" name="d-dist" value="chosen" data-change="dist" style="width:auto"' + (d.distribution === 'chosen' ? ' checked' : '') + '> <b>Choose suppliers</b></label></div>' +
    '<div class="suplist">' + sups.map(function (s) {
      var on = chosen.indexOf(s.id) > -1, dis = d.distribution === 'all';
      return '<label' + (dis ? ' style="opacity:' + (s.verified ? '.85' : '.45') + '"' : '') + '><input type="checkbox" data-change="recip" value="' + s.id + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '>' +
        '<span style="flex:1"><b>' + esc(s.name) + '</b> <span class="muted" style="font-size:11.5px">' + esc(s.city) + ' · ' + esc(s.role) + '</span></span>' +
        (s.verified ? '<span class="chip chip-pass" style="font-size:10px">verified</span>' : '<span class="chip chip-mute" style="font-size:10px">unverified</span>') + '</label>';
    }).join('') + '</div>' +
    '<div class="row" style="margin-top:14px;justify-content:space-between">' +
    '<span class="muted" style="font-size:12px">' + chosen.length + ' supplier' + (chosen.length === 1 ? '' : 's') + ' will receive the email. Their replies then arrive in <b>Emails</b>.</span>' +
    '<button class="btn" data-act="draft-submit"' + (chosen.length ? '' : ' disabled') + '>Submit and send</button></div></div>';
}

A.draftCheck = function () {
  readDraftForm();
  var d = A.draft, n = normDraft(d);
  d.checking = true; d.checkText = ''; d.step = Math.max(d.step, 1);
  A.render();
  var ad = A.adapters(A.aiReady ? 'ai' : 'reference', { onText: function (u) { d.checkText = u.text; var el = $('.reply-box'); if (el) el.textContent = u.text.slice(-800); } });
  ad.readiness(n).then(function (c) {
    d.check = c; d.checking = false; d.step = 2; A.render();
    A.toast(c.ready ? 'Ready to send.' : c.missing.filter(function (m) { return m.severity === 'must'; }).length + ' item(s) still needed before this can go out.');
  }, function () { d.checking = false; d.check = G.readinessRules(n); d.check.note = 'The check failed; fixed rules ran instead.'; d.step = 2; A.render(); });
};

A.draftSubmit = function () {
  var d = A.draft, n = normDraft(d);
  var recips = d.distribution === 'all' ? A.store.suppliers.filter(function (s) { return s.verified; }).map(function (s) { return s.id; }) : d.recipients.slice();
  if (!recips.length) { A.toast('Choose at least one supplier.'); return; }
  n.recipients = recips; n.distribution = d.distribution;
  var rfq = PL.createRfq(A.store, n);
  var multiLine = A.isMultiLine(rfq);
  A.draft = null;
  A.persistAll();
  A.go('#/rfq/' + rfq.id);
  A.toast(rfq.code + ' sent to ' + A.plural(recips.length, 'supplier') + '.');
  if (multiLine) {
    A.toast(rfq.code + ' sent. Go to Supplier view to compose each supplier\'s reply.');
    A.render();
    return;
  }
  var key = 'gen_' + rfq.id;
  A.running[key] = { phase: 'gen', text: '' };
  A.render();
  var ad = A.adapters(A.aiReady ? 'ai' : 'reference', { onText: function (u) { if (A.running[key]) { A.running[key].text = u.text; var b = $('#gen-progress'); if (b) b.textContent = u.text.length.toLocaleString() + ' characters written so far'; } } });
  ad.generate(rfq).then(function (res) {
    res.emails.forEach(function (e) { if (!A.sampleById(e.id)) A.composed.push(e); });
    rfq.generated = { count: res.emails.length, source: res.source, at: new Date().toISOString(), fallback: !!res.fallback };
    delete A.running[key];
    A.persistAll();
    A.toast(A.plural(res.emails.length, 'supplier reply', 'supplier replies') + ' written for ' + rfq.code + '. Sync the inbox to receive them.');
    A.render();
  }, function () { delete A.running[key]; A.render(); });
};

/* ===================== rfq detail ===================== */
A.route(/^\/rfq\/(.+)$/, function (id) {
  if (id === 'new') return wizard();
  var rfq = A.rfqById(id);
  if (!rfq) return '<div class="empty">No such inquiry.</div>';
  var qs = A.quotesFor(id);
  var gen = A.running['gen_' + id];
  var waiting = A.unsynced().filter(function (e) { return e.rfq_id === id; }).length;
  var banner = '';
  if (gen) banner = '<div class="banner" style="margin-bottom:14px"><span class="spin"></span> ' + (A.aiReady ? 'Claude is writing supplier replies for this inquiry, one per recipient, each with a different problem planted.' : 'Writing supplier replies for this inquiry.') +
    ' <span id="gen-progress" class="muted" style="font-weight:400">' + (gen.text ? gen.text.length.toLocaleString() + ' characters so far' : 'first words can take a minute') + '</span></div>';
  else if (waiting) banner = '<div class="banner ok" style="margin-bottom:14px">' + A.plural(waiting, 'supplier reply', 'supplier replies') + ' waiting in the inbox. <a href="#/inbox" style="margin-left:auto">Sync the inbox →</a></div>';

  var multiLine = A.isMultiLine(rfq);
  var rows = PL.supplierStatuses(A.store, rfq);
  var supTable = '<div class="scroll-x"><table class="qtable" style="min-width:760px"><thead><tr><th>Supplier</th><th>Status</th><th>Latest email</th><th>Files</th><th>' + (multiLine ? 'Lines' : 'Quote') + '</th><th>Missing</th><th></th></tr></thead><tbody>' +
    rows.map(function (r) {
      var e = r.emails[0], q = r.quotes[0];
      var files = e ? (e.attachments || []).map(function (a, i) {
        return '<span class="filechip">' + esc(a.name) + '<button data-act="download" data-em="' + esc(e.id) + '" data-i="' + i + '" title="Save this file">Save</button></span>';
      }).join(' ') : '';
      var quoteCell, missing;
      if (multiLine) {
        var priced = r.quotes.filter(function (x) { return x.norm.usd_at_target && x.norm.usd_at_target.v != null; }).length;
        quoteCell = r.quotes.length ? priced + ' of ' + r.quotes.length + ' priced' : '<span class="muted">—</span>';
        missing = r.quotes.reduce(function (a, x) { return a + (x.gaps || []).length; }, 0) + A.store.reviews.filter(function (rv) { return rv.rfq_id === rfq.id && rv.status === 'open' && (rv.header_id ? (r.quotes[0] && rv.header_id === r.quotes[0].header_id) : r.quotes.some(function (x) { return x.id === rv.quote_id; })); }).length;
      } else {
        quoteCell = q && q.norm.usd_at_target.v != null ? '<span class="price">' + Number(q.norm.usd_at_target.v).toFixed(3) + '</span><div class="muted" style="font-size:11px">min ' + n0(q.norm.moq_pcs.v) + '</div>' : q ? '<span class="muted">no comparable price</span>' : '<span class="muted">—</span>';
        missing = q ? (q.gaps || []).length + (A.store.reviews.filter(function (rv) { return rv.quote_id === q.id && rv.status === 'open'; }).length) : 0;
      }
      return '<tr>' +
        '<td class="supcell"><b>' + esc(r.supplier.name) + '</b><span>' + (r.supplier.unknown ? '<span class="chip chip-crit" style="font-size:10px">not on our list</span>' : (r.supplier.verified ? 'verified' : 'unverified') + (r.supplier.city ? ' · ' + esc(r.supplier.city) : '')) + '</span></td>' +
        '<td>' + supStatusChip(r.status) + (r.reply && r.reply.status === 'draft' ? '<div style="margin-top:3px"><span class="chip chip-warn" style="font-size:10px">reply waiting for approval</span></div>' : '') + '</td>' +
        '<td style="font-size:12px">' + (e ? '<a href="#/email/' + esc(e.id) + '">' + esc(e.subject) + '</a><div class="muted">' + shortDate(e.date) + ' · ' + esc(fmtLabel(e.format)) + '</div>' : '<span class="muted">sent ' + esc(rfq.sent_at) + '</span>') + '</td>' +
        '<td style="font-size:12px">' + (files || '<span class="muted">—</span>') + '</td>' +
        '<td>' + quoteCell + '</td>' +
        '<td>' + (q || r.quotes.length ? (missing ? '<span class="chip chip-warn">' + missing + ' open</span>' : '<span class="chip chip-pass">complete</span>') : e && e.kind === 'clarification' ? '<span class="chip chip-info">asked us questions</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td>' + (e ? '<a class="btn ghost sm" href="#/email/' + esc(e.id) + '" style="text-decoration:none;white-space:nowrap">Analyse</a>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';

  var items = R.rfqItems(rfq);
  var compareHref = multiLine ? '#/quotations/' + id : '#/compare/' + id;
  var termsBlock = multiLine
    ? '<dt>Lines</dt><dd>' + items.length + ' line item(s)</dd>'
    : '<dt>Quantity</dt><dd>' + n0(rfq.target_qty) + ' ' + esc(rfq.unit) + '</dd><dt>Target</dt><dd>USD ' + rfq.target_usd_fob.lo.toFixed(2) + ' – ' + rfq.target_usd_fob.hi.toFixed(2) + ' FOB China</dd>';
  var linesTable = multiLine ? '<div class="hr"></div><div class="scroll-x"><table class="matrix" style="font-size:11.5px"><thead><tr><th>Line</th><th>SKU</th><th>Product</th><th>Qty</th><th>Band</th></tr></thead><tbody>' +
    items.map(function (it) { return '<tr><td>' + it.line + '</td><td class="mono">' + esc(it.sku) + '</td><td>' + esc(it.product) + '</td><td>' + n0(it.qty) + ' ' + esc(it.unit) + '</td><td>' + it.target_usd_fob.lo.toFixed(2) + '–' + it.target_usd_fob.hi.toFixed(2) + '</td></tr>'; }).join('') +
    '</tbody></table></div>' : '';

  return '<div class="page-head"><div><a href="#/rfqs" style="font-size:12.5px">← Inquiries</a>' +
    '<h1 style="margin-top:3px">' + esc(rfq.product) + '</h1><div class="muted" style="font-size:12.5px"><span class="tag">' + esc(rfq.code) + '</span> ' + rfqMeta(rfq) + '</div></div>' +
    '<div class="row">' + (rfq.status === 'awarded' ? '<span class="chip chip-pass">Awarded</span>' : '') +
    (multiLine ? '<a class="btn ghost" href="#/supplier/' + id + '/A" style="text-decoration:none">Supplier view</a>' : '') +
    '<a class="btn" href="' + compareHref + '" style="text-decoration:none">' + (multiLine ? 'Quotations' : 'Compare') + '</a></div></div>' + banner +
    '<div class="card" style="margin-bottom:16px"><div class="spread" style="margin-bottom:8px"><div><div class="eyebrow">Suppliers</div><h3>Who has answered</h3></div>' +
    '<span class="muted" style="font-size:12px">sent ' + esc(rfq.sent_at) + ' · reply by ' + esc(rfq.deadline) + '</span></div>' + supTable + '</div>' +
    '<details class="more" style="margin-bottom:16px"><summary>What we asked for</summary><div class="grid2" style="margin-top:10px">' +
    '<div><dl class="gcard" style="border:0;padding:0;background:none;margin:0">' + termsBlock +
      '<dt>Certs</dt><dd>' + esc((rfq.required_certs || []).join(', ') || 'none') + '</dd>' +
      '<dt>Label</dt><dd>' + (rfq.pl_required ? 'Private label required' : 'Not required') + '</dd>' +
      '<dt>Lead</dt><dd>up to ' + rfq.max_lead_days + ' days</dd>' +
    '</dl></div><div><div class="eyebrow" style="margin-bottom:5px">Questions we asked</div>' +
      '<ol style="margin:0;padding-left:18px;font-size:12.5px">' + (rfq.custom_questions || []).map(function (q) { return '<li>' + esc(q.text) + (q.required ? '' : ' <span class="muted">(optional)</span>') + '</li>'; }).join('') + '</ol>' +
      '<div class="muted" style="font-size:12px;margin-top:7px">' + esc(rfq.spec_summary) + '</div></div></div>' + linesTable + '</details>' +
    (!multiLine && qs.length ? '<div class="card"><div class="eyebrow" style="margin-bottom:8px">Quotes</div>' + quoteTable(qs, rfq) + '</div>' : '');
});

/* ===================== inbox ===================== */
A.route(/^\/inbox$/, function () {
  var arrived = A.arrived(), waiting = A.unsynced(), processed = A.store.emails.length;
  var counts = {}, labelCounts = { manual: 0, processed: 0 };
  arrived.forEach(function (e) {
    counts[e.format] = (counts[e.format] || 0) + 1;
    var rec = A.emailById(e.id);
    if (rec && rec.label === 'manual') labelCounts.manual++;
    else if (rec) labelCounts.processed++;
  });
  var unread = arrived.filter(function (e) { return !A.emailById(e.id); }).length;
  var openItems = A.openReviews().length + A.draftReplies().length;
  return '<div class="page-head"><div><h1>Emails</h1></div>' +
    '<div class="row">' +
      (processed ? '<button class="btn ghost sm" data-act="reset">Clear everything</button>' : '') +
      '<button class="btn ghost sm" data-act="compose-open">Write your own email</button>' +
      (unread ? '<button class="btn ghost sm" data-act="runall">Read all unread (' + unread + ')</button>' : '') +
      '<button class="btn" data-act="sync"' + (A.inbox.syncing ? ' disabled' : '') + '>' + (A.inbox.syncing ? 'Syncing…' : 'Sync inbox' + (waiting.length ? ' (' + waiting.length + ' new)' : '')) + '</button>' +
    '</div></div>' +
    '<p class="lede">Supplier replies to ' + esc(S.buyer.email) + ', in the formats they actually arrive in. Every arrival is read automatically; open one to see the fixed checks, the read, and what needs you.</p>' +
    (A.inbox.syncing ? '<div class="syncbar" id="syncbar">' + syncbarInner() + '</div>' : '') +
    (A.inbox.autoReadRun ? '<div class="syncbar" id="autoreadbar">' + autoReadBarInner() + '</div>' : '') +
    (!arrived.length && !A.inbox.syncing ? '<div class="empty" style="margin-bottom:16px"><b>Inbox not synced yet.</b><br><span style="font-size:12.5px">' + A.plural(waiting.length, 'email') + ' waiting on the server. Sync to pull them in.</span><br><button class="btn" style="margin-top:12px" data-act="sync">Sync inbox</button></div>' : '') +
    (processed && !A.inbox.syncing ? '<div class="banner ' + (openItems ? 'warn' : 'ok') + '" style="margin-bottom:16px">' + A.plural(processed, 'email') + ' read · ' +
      A.plural(A.store.quotes.length, 'quote') + ' extracted · <a href="#/reviews" style="margin-left:2px">' + A.plural(openItems, 'item') + ' waiting on you →</a>' +
      '<a href="#/rfqs" style="margin-left:auto">Go to the inquiries →</a></div>' : '') +
    '<div class="lab"><div id="inbox-list">' + inboxList() + '</div>' +
    '<aside>' +
      '<div class="eyebrow" style="margin-bottom:7px">Status</div><div class="filters" style="margin-bottom:14px">' +
      '<button data-act="lfilter" data-lf="" aria-pressed="' + (!A.labelFilter) + '">All<span class="mono">' + arrived.length + '</span></button>' +
      '<button data-act="lfilter" data-lf="manual" aria-pressed="' + (A.labelFilter === 'manual') + '">Manual check required<span class="mono">' + labelCounts.manual + '</span></button>' +
      '<button data-act="lfilter" data-lf="processed" aria-pressed="' + (A.labelFilter === 'processed') + '">Processed<span class="mono">' + labelCounts.processed + '</span></button></div>' +
      '<div class="eyebrow" style="margin-bottom:7px">Attachment format</div><div class="filters">' +
      '<button data-act="filter" data-f="" aria-pressed="' + (!A.filter) + '">All formats<span class="mono">' + arrived.length + '</span></button>' +
      S.formats.map(function (f) {
        return '<button data-act="filter" data-f="' + f.key + '" aria-pressed="' + (A.filter === f.key) + '">' +
          '<span>' + esc(f.label) + '<small>' + esc(f.hint) + '</small></span>' +
          '<span class="mono">' + (counts[f.key] || 0) + '</span></button>';
      }).join('') + '</div>' +
      '<label class="row" style="gap:6px;font-size:12px;margin-top:12px;cursor:pointer"><input type="checkbox" data-change="autoread" style="width:auto"' + (A.inbox.autoRead ? ' checked' : '') + '> Read each email as it arrives</label>' +
      '<div id="compose-slot"></div></aside></div>';
});

function autoReadBarInner() {
  var p = A.inbox.autoReadRun || { done: 0, total: 0, label: '' };
  var w = p.total ? Math.round(100 * p.done / p.total) : 100;
  return '<span class="spin"></span><span>Reading ' + esc(p.label || '') + '…</span><div class="bar"><i style="width:' + w + '%"></i></div>' +
    '<span class="mono" style="font-size:11.5px">' + p.done + ' / ' + p.total + '</span>' +
    '<button class="btn ghost sm" data-act="pauseread" style="margin-left:8px">' + (A.inbox.paused ? 'Resume' : 'Pause') + '</button>';
}

function syncbarInner() {
  var p = A.inbox.progress || { done: 0, total: 0 };
  var w = p.total ? Math.round(100 * p.done / p.total) : 100;
  return '<span class="spin"></span><span>Syncing ' + esc(S.buyer.email) + '…</span><div class="bar"><i style="width:' + w + '%"></i></div>' +
    '<span class="mono" style="font-size:11.5px">' + p.done + ' / ' + p.total + '</span>';
}

function inboxList() {
  var visible = A.arrived().filter(function (e) {
    if (A.filter && e.format !== A.filter) return false;
    if (A.labelFilter) { var rec = A.emailById(e.id); if (!rec || rec.label !== A.labelFilter) return false; }
    return true;
  }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  if (!visible.length) return A.arrived().length ? '<div class="empty">No emails in this format.</div>' : '';
  var groups = A.store.rfqs.slice().reverse().map(function (rfq) {
    var mine = visible.filter(function (e) { return e.rfq_id === rfq.id; });
    if (!mine.length) return '';
    return '<section class="rfq-group"><header><h3>' + esc(rfq.product) + '</h3>' +
      '<span class="tag">' + esc(rfq.code) + '</span>' +
      '<span class="muted" style="font-size:12px">' + mine.length + ' email' + (mine.length > 1 ? 's' : '') + '</span></header>' +
      '<div class="samples">' + mine.map(sampleCard).join('') + '</div></section>';
  }).join('');
  var unassigned = visible.filter(function (e) { return !e.rfq_id || !A.rfqById(e.rfq_id); });
  if (unassigned.length) {
    groups += '<section class="rfq-group"><header><h3>No inquiry named</h3>' +
      '<span class="muted" style="font-size:12px">The system has to work out where these belong</span></header>' +
      '<div class="samples">' + unassigned.map(sampleCard).join('') + '</div></section>';
  }
  return groups;
}

var LABEL_CHIP = {
  manual: ['chip-warn', 'Manual check required'], processed: ['chip-pass', 'Processed'],
  non_quote: ['chip-info', 'Not a quote'], duplicate: ['chip-mute', 'Duplicate'], reading: ['chip-info', 'Reading…'], failed: ['chip-crit', 'Read failed']
};
function sampleCard(e) {
  var rec = A.emailById(e.id);
  var qs = rec ? A.store.quotes.filter(function (q) { return q.email_id === e.id; }) : [];
  var open = rec ? A.store.reviews.filter(function (r) { return r.email_id === e.id && r.status === 'open'; }).length : 0;
  var reply = A.store.replies.filter(function (r) { return r.email_id === e.id && r.status === 'draft'; })[0];
  var cls = '', right;
  if (!rec) right = '<span class="chip chip-mute">Not read</span>';
  else if (rec.label && LABEL_CHIP[rec.label]) {
    cls = rec.label === 'manual' ? 'attn' : rec.label === 'processed' ? 'done' : rec.label === 'failed' ? 'out' : '';
    right = '<span class="chip ' + LABEL_CHIP[rec.label][0] + '">' + LABEL_CHIP[rec.label][1] + '</span>';
    if (rec.kind === 'supplement') right = '<span class="chip chip-info">Supplement</span>';
  } else if (rec.status === 'duplicate') { cls = 'done'; right = chip('duplicate'); }
  else if (rec.status === 'failed') { cls = 'out'; right = chip('failed'); }
  else if (open) { cls = 'attn'; right = '<span class="chip chip-warn">' + open + ' question' + (open > 1 ? 's' : '') + '</span>'; }
  else if (qs.length && qs[0].eligibility) { cls = qs[0].eligibility.status === 'eligible' ? 'done' : 'out'; right = chip(qs[0].eligibility.status); }
  else { cls = 'done'; right = chip(rec.status === 'non_quote' ? 'awaiting' : 'eligible'); }
  if (rec && rec.line_coverage && rec.line_coverage.total) right += '<div class="muted" style="font-size:10.5px;margin-top:2px">' + rec.line_coverage.quoted + ' of ' + rec.line_coverage.total + ' lines</div>';
  if (reply) right += '<div style="margin-top:3px"><span class="chip chip-info" style="font-size:10px">reply drafted</span></div>';
  var arrive = A.inbox.justArrived && A.inbox.justArrived[e.id] ? ' arrive' : '';
  return '<button class="sample ' + cls + arrive + '" data-act="open" data-id="' + esc(e.id) + '">' +
    '<div><h4>' + esc(e.label || e.subject) + '</h4>' +
    '<p>' + esc(e.blurb || e.subject) + '</p>' +
    '<div class="row" style="gap:5px">' +
      '<span class="tag">' + esc(fmtLabel(e.format)) + '</span>' +
      (e.tags || []).slice(0, 5).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') +
    '</div></div><div style="text-align:right">' + right +
    '<div class="muted" style="font-size:11px;margin-top:4px">' + esc((e.from_name || '').split(' ')[0]) + ' · ' + shortDate(e.date) + '</div></div></button>';
}

A.syncInbox = function () {
  if (A.inbox.syncing) return;
  var pending = A.unsynced();
  A.inbox.syncing = true; A.inbox.progress = { done: 0, total: pending.length }; A.inbox.justArrived = {};
  if (A.current() !== '/inbox') A.go('#/inbox');
  A.render();
  var i = 0;
  function step() {
    if (i >= pending.length) { setTimeout(finish, 600); return; }
    var e = pending[i++];
    A.inbox.seen[e.id] = true; A.inbox.justArrived = {}; A.inbox.justArrived[e.id] = true; A.inbox.progress.done = i;
    var l = $('#inbox-list'); if (l) l.innerHTML = inboxList();
    var b = $('#syncbar'); if (b) b.innerHTML = syncbarInner();
    setTimeout(step, 300);
  }
  function finish() {
    A.inbox.syncing = false; A.inbox.justArrived = {};
    A.persistAll();
    A.render();
    A.toast(pending.length ? A.plural(pending.length, 'new email') + ' arrived.' : 'Inbox is up to date.');
    if (A.inbox.autoRead && pending.length) A.runAll(pending.map(function (e) { return e.id; }));
  }
  setTimeout(step, 700);
};

/* ===================== compose ===================== */
A.composeOpen = function () {
  var slot = $('#compose-slot');
  if (!slot) return;
  A.composeFile = null;
  slot.innerHTML = '<div class="card" style="margin-top:14px"><h3 style="margin-bottom:8px">Write a supplier email</h3>' +
    '<div class="stack" style="gap:9px">' +
    '<label class="f">Which inquiry is it answering?<select id="c-rfq">' +
      '<option value="">Do not say — make the system work it out</option>' +
      A.store.rfqs.map(function (r) { return '<option value="' + r.id + '">' + esc(r.code + ' ' + r.product) + '</option>'; }).join('') +
    '</select></label>' +
    '<label class="f">From<input type="text" id="c-from" value="sales@newfactory.cn" spellcheck="false"></label>' +
    '<label class="f">Subject<input type="text" id="c-subject" value="Quotation"></label>' +
    '<label class="f"><span class="spread">Body <button type="button" class="btn ghost sm" data-act="compose-tpl-body">Use a template</button></span><textarea id="c-body" rows="7" placeholder="Paste the supplier email here"></textarea></label>' +
    '<div class="hr" style="margin:4px 0"></div><div class="eyebrow">Attachment</div>' +
    '<label class="f">Type<select id="c-format">' +
      S.formats.filter(function (f) { return f.key !== 'inline' && f.key !== 'thread' && f.key !== 'link'; }).map(function (f) { return '<option value="' + f.key + '">' + esc(f.label) + '</option>'; }).join('') +
    '</select></label>' +
    '<div class="row" style="gap:6px"><button type="button" class="btn ghost sm" data-act="compose-tpl-att">Insert a predefined template</button>' +
      '<label class="btn ghost sm" style="cursor:pointer">Upload a file<input type="file" id="c-file" data-change="upload" accept=".pdf,.xlsx,.xls,.csv,.txt,image/*" style="display:none"></label></div>' +
    '<div id="c-file-note" class="muted" style="font-size:11.5px"></div>' +
    '<label class="f">Filename<input type="text" id="c-attname" placeholder="quotation.pdf"></label>' +
    '<label class="f">What the attachment says<textarea id="c-att" rows="6" placeholder="Paste the text a parser or OCR would pull out. Use [CUT OFF] or [?] where the source is unreadable. Leave blank for no attachment."></textarea></label>' +
    '<div class="row"><button class="btn" data-act="compose-save">Add and read it</button>' +
    '<button class="btn ghost sm" data-act="compose-close">Cancel</button></div></div></div>';
  $('#c-body').focus();
};

A.composeUpload = function (input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var note = $('#c-file-note');
  note.textContent = 'Reading ' + file.name + '…';
  A.readUpload(file).then(function (r) {
    A.composeFile = r.blob || null;
    $('#c-att').value = r.transcript;
    $('#c-attname').value = r.name;
    var sel = $('#c-format'); if (sel && r.type && [].some.call(sel.options, function (o) { return o.value === r.type; })) sel.value = r.type;
    note.textContent = file.name + ' · ' + Math.round(file.size / 1024) + ' KB read. Check the transcript, then add the email.';
  }, function (e) { note.textContent = (e && e.message) || 'Could not read that file. Paste its text instead.'; });
};

A.composeSave = function () {
  var body = $('#c-body').value.trim();
  if (!body) { A.toast('The email needs a body.'); return; }
  var id = 'em_own' + (A.composed.filter(function (e) { return /^em_own/.test(e.id); }).length + 1);
  var att = $('#c-att').value.trim();
  var fmt = $('#c-format').value;
  var hasAtt = !!(att || A.composeFile);
  var e = {
    id: id, sample_id: null, rfq_id: $('#c-rfq').value || null, supplier_id: null,
    format: hasAtt ? fmt : 'inline', label: $('#c-subject').value || 'Your email', blurb: 'Written by you in this session.',
    tags: ['yours'], from_name: 'You', from: $('#c-from').value || 'unknown@example.com',
    to: S.buyer.email, date: new Date().toISOString(), subject: $('#c-subject').value || 'Quotation',
    body_raw: body, attachments: []
  };
  if (hasAtt) {
    e.attachments.push({
      name: $('#c-attname').value.trim() || (A.composeFile ? A.composeFile.name : 'pasted-' + fmt + '.txt'), type: fmt,
      transcript: att || '[IMAGE ATTACHED — no transcript supplied; sent to Claude as a picture]',
      truncated: /\[CUT OFF\]|\[ILLEGIBLE\]/.test(att), blob: A.composeFile || null
    });
  }
  A.composed.push(e);
  A.inbox.seen[id] = true;
  A.processSample(id);
};

A.composeTemplate = function (what) {
  var rfq = A.rfqById($('#c-rfq').value) || A.store.rfqs[0];
  var sup = ($('#c-from').value.split('@')[1] || 'newfactory.cn').split('.')[0];
  var supName = sup.charAt(0).toUpperCase() + sup.slice(1) + ' Manufacturing Co., Ltd';
  if (what === 'body') {
    var k = $('#c-format').value; var t = S.templates.inline;
    $('#c-body').value = A.fillTemplate(t.body, rfq, supName);
    if (!$('#c-subject').value || $('#c-subject').value === 'Quotation') $('#c-subject').value = 'Re: ' + rfq.code + ' ' + rfq.product + ' — quotation';
    return;
  }
  var fmt = $('#c-format').value, tpl = S.templates[fmt];
  if (!tpl || !tpl.transcript) { A.toast('No template for that type. Paste the text instead.'); return; }
  $('#c-att').value = A.fillTemplate(tpl.transcript, rfq, supName);
  $('#c-attname').value = A.fillTemplate(tpl.name, rfq, supName);
  A.composeFile = null;
  $('#c-file-note').textContent = 'Template inserted. Edit it to plant the problems you want to test.';
  if (!$('#c-body').value.trim()) $('#c-body').value = 'Hi,\n\nPlease find our quotation for ' + rfq.code + ' attached.\n\nBest regards,\nSales Team\n' + supName;
};

/* ===================== running the pipeline ===================== */
A.processSample = function (id) {
  var raw = A.sampleById(id);
  if (!raw) { A.toast('That email is gone.'); return; }
  if (A.emailById(id)) { A.go('#/email/' + id); return; }
  var run = A.running[id] = { phase: 'rules', text: '', started: Date.now(), err: null };
  A.go('#/email/' + id);
  if (A.current() === '/email/' + id) A.render();

  var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  run.ctl = ctl;
  var ad = A.adapters(A.aiReady ? 'ai' : 'reference', {
    signal: ctl && ctl.signal,
    onText: function (u) { run.text = u.text; run.phase = 'stream'; paintRun(id); }
  });
  var origExtract = ad.extract;
  ad.extract = function () { run.phase = 'read'; paintRun(id); return origExtract.apply(null, arguments); };
  var origMatch = ad.match;
  ad.match = function () { run.phase = 'match'; paintRun(id); return origMatch.apply(null, arguments); };
  var origReply = ad.reply;
  ad.reply = function () { run.phase = 'reply'; paintRun(id); return origReply.apply(null, arguments); };

  PL.processEmail(raw, A.store, ad).then(function (res) {
    run.phase = 'done';
    PL.rerunEvals(A.store, A.expected);
    delete A.running[id];
    A.persistAll();
    A.render();
    if (res.reply) A.toast('A reply to the supplier has been drafted for your approval.');
  }, function (err) {
    run.phase = 'error';
    run.err = (err && (err.message || err.code)) || 'The read failed.';
    A.render();
  });
};

A.runAll = function (ids) {
  var pool = ids ? ids.map(A.sampleById).filter(Boolean) : A.arrived();
  var pending = pool.filter(function (e) { return !A.emailById(e.id); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (!pending.length) { A.toast('Everything has been read already.'); return; }
  A.inbox.paused = false;
  A.inbox.autoReadRun = { done: 0, total: pending.length, label: pending[0].label || pending[0].subject };
  if (A.current() === '/inbox') { var bar = $('#autoreadbar'); if (!bar) A.render(); }
  var ad = A.adapters(A.aiReady ? 'ai' : 'reference', {});
  var i = 0;
  function next() {
    if (A.inbox.paused) { setTimeout(next, 400); return; }
    if (i >= pending.length) { return finish(); }
    var e = pending[i];
    A.inbox.autoReadRun.label = e.label || e.subject;
    var b = $('#autoreadbar'); if (b) b.innerHTML = autoReadBarInner();
    PL.processEmail(e, A.store, ad).then(function () {
      i++; A.inbox.autoReadRun.done = i;
      if (A.current() === '/inbox') { var l = $('#inbox-list'); if (l) l.innerHTML = inboxList(); var bb = $('#autoreadbar'); if (bb) bb.innerHTML = autoReadBarInner(); }
      A.paintNav();
      next();
    }, function () { i++; A.inbox.autoReadRun.done = i; next(); });
  }
  function finish() {
    A.inbox.autoReadRun = null;
    PL.rerunEvals(A.store, A.expected);
    A.persistAll();
    A.toast('All read. ' + A.plural(A.openReviews().length + A.draftReplies().length, 'item') + ' waiting on you.');
    A.render();
  }
  next();
};
A.togglePauseRead = function () { A.inbox.paused = !A.inbox.paused; var b = $('#autoreadbar'); if (b) b.innerHTML = autoReadBarInner(); };

function paintRun(id) { var box = $('#run-' + id); if (box) box.innerHTML = runPanel(id); }

function runPanel(id) {
  var run = A.running[id];
  if (!run) return '';
  var steps = [
    ['rules', 'Fixed checks', 'rule', 'Duplicate, reply history, inquiry code, sender, revision'],
    ['match', 'Finding the inquiry', 'ai', 'Only when no code was found'],
    ['read', 'Reading the quote', 'ai', 'One call, the whole email and its attachments'],
    ['stream', 'Writing the answer', 'ai', run.text ? (run.text.length + ' characters so far') : ''],
    ['reply', 'Drafting a reply', 'ai', 'Only when something is missing'],
    ['done', 'Checking and normalising', 'rule', 'Evidence, units, currency, gaps, eligibility']
  ];
  var order = ['rules', 'match', 'read', 'stream', 'reply', 'done'];
  var at = order.indexOf(run.phase);
  return '<div class="card"><div class="eyebrow" style="margin-bottom:9px">Working</div><div class="stepper">' +
    steps.map(function (s) {
      var idx = order.indexOf(s[0]);
      var cls = run.phase === 'error' && idx === at ? 'err' : idx < at ? 'on' : idx === at ? 'run' : '';
      return '<div class="step ' + cls + '"><i class="pip"></i><div><b>' + esc(s[1]) + ' ' + lane(s[2]) + '</b><span>' + esc(s[3]) + '</span></div></div>';
    }).join('') + '</div>' +
    (run.err ? '<div class="banner" style="margin-top:10px">' + esc(run.err) + '</div>' : '') +
    (run.text ? '<pre class="reply-box" style="margin-top:10px;max-height:190px;font-size:11px">' + esc(run.text.slice(-1400)) + '</pre>' : '') +
    '</div>';
}

/* ===================== email view ===================== */
A.route(/^\/email\/(.+)$/, function (id) {
  var rec = A.emailById(id), raw = A.sampleById(id);
  var src = rec || raw;
  if (!src) return '<div class="empty">That email is not here. <a href="#/inbox">Back to Emails</a></div>';
  var qs = rec ? A.store.quotes.filter(function (q) { return q.email_id === id; }) : [];
  var reviews = rec ? A.store.reviews.filter(function (r) { return r.email_id === id; }) : [];
  var reply = A.store.replies.filter(function (r) { return r.email_id === id; })[0] || null;
  var rfq = rec && rec.rfq_id ? A.rfqById(rec.rfq_id) : (raw && raw.rfq_id ? A.rfqById(raw.rfq_id) : null);
  var body = rec ? rec.body_new : R.splitQuoted(src.body_raw).new_;
  var quoted = rec ? rec.body_quoted : R.splitQuoted(src.body_raw).quoted;
  var hl = [];
  qs.forEach(function (q) { hl = hl.concat(q.highlights || []); });
  var bodyHl = hl.filter(function (h) { return h.src === 'body'; });

  var atts = src.attachments || [];
  var subtabs = atts.length ? '<div class="tabs" role="tablist">' +
    '<button role="tab" aria-selected="true" data-act="tab" data-t="body">Email body</button>' +
    atts.map(function (a, i) { return '<button role="tab" aria-selected="false" data-act="tab" data-t="a' + i + '">' + esc(a.name) + '</button>'; }).join('') + '</div>' : '';
  var panels = '<div data-panel="body"><div class="bodytext">' + A.renderHighlighted(body, bodyHl) + '</div>' +
    (quoted ? '<div class="bodytext" style="padding-top:0"><div class="quoted">' + esc(quoted) + '</div></div>' : '') + '</div>' +
    atts.map(function (a, i) {
      var ahl = hl.filter(function (h) { return h.src === 'att:' + a.name; });
      return '<div data-panel="a' + i + '" hidden>' +
        '<div class="row" style="padding:10px 18px 0;font-size:12px"><span class="tag">' + esc(fmtLabel(a.type)) + '</span>' +
        '<span class="muted">The text a parser or OCR pulls out of the file.</span>' +
        '<button class="btn ghost sm" style="margin-left:auto" data-act="download" data-em="' + esc(id) + '" data-i="' + i + '">Save file</button></div>' +
        '<div class="bodytext tr">' + A.renderHighlighted(a.transcript, ahl) + '</div></div>';
    }).join('');
  var hasRead = rec && (rec.status === 'extracted' || rec.status === 'non_quote');
  var topTabs = hasRead ? '<div class="tabs top" role="tablist">' +
    '<button role="tab" aria-selected="true" data-act="etab" data-t="mail">Supplier\'s email</button>' +
    '<button role="tab" aria-selected="false" data-act="etab" data-t="read">What we read' + (hl.length ? ' <span class="n" style="background:var(--mark);color:var(--ink);border-radius:20px;padding:0 6px;font-size:10.5px;font-family:var(--mono)">' + hl.length + ' marked</span>' : '') + '</button></div>' : '';
  var envelope = '<div class="envelope"' + (topTabs ? ' style="border-radius:0 0 var(--radius-lg) var(--radius-lg);border-top:0"' : '') + '>' +
    '<header><div class="row" style="justify-content:space-between">' +
      '<b style="font-family:var(--disp);font-size:17px">' + esc(src.subject) + '</b>' +
      (rec ? chip(rec.status === 'extracted' && qs[0] ? qs[0].eligibility.status : rec.status) : '') + '</div>' +
      '<dl class="meta"><dt>From</dt><dd>' + esc(src.from_name) + ' &lt;' + esc(src.from) + '&gt;</dd>' +
      '<dt>To</dt><dd>' + esc(src.to) + '</dd>' +
      '<dt>Date</dt><dd>' + esc(shortDate(src.date)) + '</dd>' +
      (atts.length ? '<dt>Files</dt><dd>' + atts.map(function (a, i) { return '<span class="filechip">' + esc(a.name) + '<button data-act="download" data-em="' + esc(id) + '" data-i="' + i + '">Save</button></span>'; }).join(' ') + '</dd>' : '') +
      '</dl></header>' + subtabs + panels + '</div>';
  var multiLine = rfq && A.isMultiLine(rfq);
  var header = multiLine && qs.length ? A.headerById(qs[0].header_id) : null;
  var readPanel = hasRead ? '<div data-epanel="read" hidden>' + (multiLine && header ? fieldTableV2(header, qs, rfq)
    : qs.length ? qs.map(function (q) { return fieldTable(q, rfq, reviews); }).join('')
    : '<div class="card"><h3>Not a quotation</h3><p class="muted" style="font-size:12.5px;margin:6px 0 0">Read as a <b>' + esc(rec.kind) + '</b>. No prices to compare. ' + lane('ai') + '</p></div>') + '</div>' : '';

  var right;
  if (A.running[id]) right = '<div id="run-' + esc(id) + '">' + runPanel(id) + '</div>';
  else if (!rec) right = '<div class="card"><h3 style="margin-bottom:6px">Not read yet</h3>' +
    '<p class="muted" style="font-size:12.5px">Nothing has looked at this email. Read it to see the fixed checks, what Claude read, what is missing, and a reply if one is needed.</p>' +
    '<button class="btn" data-act="process" data-id="' + esc(id) + '">Read this email</button></div>';
  else if (multiLine) right = resultPanelV2(rec, header, qs, reviews, reply, rfq);
  else right = resultPanel(rec, qs, reviews, reply, rfq);

  return '<div class="page-head"><div><a href="#/inbox" style="font-size:12.5px">← Emails</a>' +
    '<h1 style="margin-top:3px">' + esc(raw && raw.label || src.subject) + '</h1></div>' +
    (rfq ? '<a class="btn ghost sm" href="#/rfq/' + esc(rfq.id) + '" style="text-decoration:none">' + esc(rfq.code) + ' · all quotes →</a>' : '') + '</div>' +
    '<div class="split"><div>' + topTabs + '<div data-epanel="mail">' + envelope + '</div>' + readPanel + '</div>' +
    '<div class="stack">' + right + '</div></div>';
});

function fieldTable(q, rfq, reviews) {
  var n = q.norm, f = (q.ai && q.ai.f) || {};
  var gapFields = {}; (q.gaps || []).forEach(function (g) { gapFields[g.field] = g; });
  function val(x) { return x == null || x === '' ? null : x; }
  var rows = [
    ['Price at our quantity', n.usd_at_target.v == null ? null : '<span class="num">' + money(n.usd_at_target.v) + '</span> per ' + esc((rfq || {}).unit || 'pc') + (n.usd_at_target.inputs && n.usd_at_target.inputs.cur && n.usd_at_target.inputs.cur !== 'USD' ? ' <span class="muted">converted from ' + esc(n.usd_at_target.inputs.cur) + '</span>' : ''), n.usd_at_target.rule === 'human' ? 'human' : 'rule', 'price_tiers'],
    ['Currency', val(n.currency.v), 'ai', 'currency'],
    ['Price basis', n.incoterm.v ? esc(n.incoterm.v) + (n.incoterm.place ? ' ' + esc(n.incoterm.place) : '') : null, n.incoterm.rule === 'human' ? 'human' : 'ai', 'price_basis'],
    ['Minimum order', n.moq_pcs.v == null ? null : '<span class="num">' + n0(n.moq_pcs.v) + '</span>', n.moq_pcs.rule === 'human' ? 'human' : 'rule', 'moq'],
    ['Lead time', n.lead_days.v == null ? null : n.lead_days.v + ' days' + (n.lead_days.from ? ' <span class="muted">after ' + esc(String(n.lead_days.from).replace('_', ' ')) + '</span>' : ''), 'ai', 'lead_time'],
    ['Valid until', val(n.expiry.v), 'rule', 'validity'],
    ['Certificates', (n.certs_canon.v || []).length ? esc(n.certs_canon.v.join(' + ')) + ((n.certs_canon.unverified || []).length ? ' <span class="chip chip-warn" style="font-size:10px">' + esc(n.certs_canon.unverified.join(', ')) + ' unverified</span>' : '') : null, 'ai', 'certs'],
    ['Private label', n.private_label.v ? esc(n.private_label.v) + (n.private_label.condition ? ' <span class="muted">if ' + esc(n.private_label.condition) + '</span>' : '') : null, n.private_label.rule === 'human' ? 'human' : 'rule', 'private_label'],
    ['Payment', f.payment && f.payment.v ? esc(f.payment.v.terms || f.payment.v) : null, 'ai', 'payment'],
    ['Sample', f.sample && f.sample.v ? esc('USD ' + (f.sample.v.cost != null ? f.sample.v.cost : '?') + (f.sample.v.days ? ', ' + f.sample.v.days + ' days' : '') + (f.sample.v.refundable ? ', refundable' : '')) : null, 'ai', 'sample'],
    ['Sea freight', f.ship_sea && f.ship_sea.v ? esc(JSON.stringify(f.ship_sea.v).replace(/[{}"]/g, '').replace(/,/g, ', ')) : null, 'ai', 'ship_sea'],
    ['Air freight', f.ship_air && f.ship_air.v ? esc(JSON.stringify(f.ship_air.v).replace(/[{}"]/g, '').replace(/,/g, ', ')) : null, 'ai', 'ship_air']
  ];
  (rfq && rfq.custom_questions || []).forEach(function (cq) {
    var ans = ((f.custom || []).filter(function (c) { return c.qid === cq.qid; })[0]) || null;
    rows.push([cq.text, ans && ans.v != null && ans.v !== '' ? esc(String(ans.v)) : null, 'ai', cq.qid, true]);
  });
  var wanted = { price_tiers: 1, moq: 1, lead_time: 1, validity: 1, payment: 1, price_basis: 1, certs: 1, sample: 1 };
  if (rfq && rfq.pl_required) wanted.private_label = 1;
  return '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px"><div class="spread" style="padding:12px 16px 8px"><div><h3>' + esc(q.supplier_name) + '</h3><div class="muted" style="font-size:12px">' + esc(q.product) + '</div></div>' +
    chip(q.eligibility ? q.eligibility.status : 'parked') + '</div>' +
    '<table class="fieldtable"><tbody>' + rows.map(function (r) {
      var missing = r[1] == null && (wanted[r[3]] || r[4] || gapFields[r[3]]);
      var gap = gapFields[r[3]];
      return '<tr class="' + (missing || (gap && gap.kind !== 'missing') ? 'miss' : '') + '"><td>' + esc(r[0]) + '</td>' +
        '<td>' + (r[1] == null ? '<span style="font-weight:600">Not answered</span>' + (gap && gap.note && !r[4] ? '<div class="muted" style="font-size:11.5px">' + esc(gap.note) + '</div>' : '') : r[1] + (gap && gap.kind !== 'missing' ? '<div class="muted" style="font-size:11.5px">' + esc(gap.note || gap.kind) + '</div>' : '')) + '</td>' +
        '<td style="text-align:right;width:70px">' + (r[1] == null ? '' : lane(r[2])) + '</td></tr>';
    }).join('') + '</tbody></table>' +
    (q.completeness != null ? '<div class="row" style="padding:10px 16px;font-size:12px"><span class="muted">Answered</span>' +
      '<div class="meter" style="flex:1;width:auto"><i style="width:' + q.completeness + '%"></i></div><span class="num">' + q.completeness + '%</span></div>' : '') + '</div>';
}

function fieldTableV2(header, qs, rfq) {
  var n = header.norm;
  var termRows = [
    ['Currency', n.currency && n.currency.v, n.currency && n.currency.rule === 'human' ? 'human' : 'ai'],
    ['Price basis', n.incoterm && n.incoterm.v ? esc(n.incoterm.v) + (n.incoterm.place ? ' ' + esc(n.incoterm.place) : '') : null, n.incoterm && n.incoterm.rule === 'human' ? 'human' : 'ai'],
    ['Valid until', n.expiry && n.expiry.v, n.expiry && n.expiry.rule === 'human' ? 'human' : 'rule'],
    ['Certificates', (n.certs_canon && n.certs_canon.v || []).length ? esc(n.certs_canon.v.join(' + ')) + ((n.certs_canon.unverified || []).length ? ' <span class="chip chip-warn" style="font-size:10px">' + esc(n.certs_canon.unverified.join(', ')) + ' unverified</span>' : '') : null, 'ai'],
    ['Private label', n.private_label && n.private_label.v ? esc(n.private_label.v) + (n.private_label.condition ? ' <span class="muted">if ' + esc(n.private_label.condition) + '</span>' : '') : null, n.private_label && n.private_label.rule === 'human' ? 'human' : 'rule'],
    ['Payment', n.payment ? esc(n.payment.terms || n.payment) : null, 'ai'],
    ['Sample', n.sample ? esc(JSON.stringify(n.sample).replace(/[{}"]/g, '').replace(/,/g, ', ')) : null, 'ai']
  ];
  (header.custom || []).forEach(function (c) {
    var cq = (rfq.custom_questions || []).filter(function (x) { return x.qid === c.qid; })[0];
    termRows.push([cq ? cq.text : c.qid, c.v, 'ai']);
  });
  (rfq.custom_questions || []).forEach(function (cq) {
    if ((header.custom || []).some(function (c) { return c.qid === cq.qid; })) return;
    termRows.push([cq.text, null, 'ai']);
  });

  var sorted = qs.slice().sort(function (a, b) { return (a.line || 0) - (b.line || 0); });
  var lineRows = sorted.map(function (q) {
    var miss = q.not_quoted || (q.gaps || []).length;
    var priceCell = q.not_quoted ? '<span class="muted">not quoted</span>' :
      q.norm.usd_at_target && q.norm.usd_at_target.v != null ? '<span class="num">' + money(q.norm.usd_at_target.v) + '</span>' : '<span class="muted">missing</span>';
    var moqCell = q.norm.moq_pcs && q.norm.moq_pcs.v != null ? n0(q.norm.moq_pcs.v) : '<span class="muted">—</span>';
    var leadCell = q.norm.lead_days && q.norm.lead_days.v != null ? q.norm.lead_days.v + 'd' : '<span class="muted">—</span>';
    var statusChipHtml = chip(q.eligibility ? q.eligibility.status : 'parked');
    return '<tr class="' + (miss ? 'miss' : '') + '"><td>' + q.line + '</td><td class="mono">' + esc(q.sku || '') + '</td><td>' + esc(q.product) + '</td>' +
      '<td>' + priceCell + '</td><td>' + moqCell + '</td><td>' + leadCell + '</td><td>' + statusChipHtml + '</td></tr>';
  }).join('');

  return '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">' +
    '<div class="spread" style="padding:12px 16px 8px"><div><h3>' + esc(qs[0].supplier_name) + '</h3><div class="muted" style="font-size:12px">' + qs.length + ' line(s)</div></div>' +
    '<a class="btn ghost sm" href="#/quotations/' + esc(rfq.id) + '" style="text-decoration:none">Open in Quotations →</a></div>' +
    '<div class="eyebrow" style="padding:0 16px 4px">Terms (apply to every line)</div>' +
    '<table class="fieldtable"><tbody>' + termRows.map(function (r) {
      return '<tr' + (r[1] == null ? ' class="miss"' : '') + '><td>' + esc(r[0]) + '</td>' +
        '<td>' + (r[1] == null ? '<span style="font-weight:600">Not answered</span>' : r[1]) + '</td>' +
        '<td style="text-align:right;width:70px">' + (r[1] == null ? '' : lane(r[2])) + '</td></tr>';
    }).join('') + '</tbody></table>' +
    '<div class="eyebrow" style="padding:12px 16px 4px">Lines</div>' +
    '<div class="scroll-x"><table class="matrix" style="font-size:12px"><thead><tr><th>Line</th><th>SKU</th><th>Product</th><th>Price</th><th>MOQ</th><th>Lead</th><th>Status</th></tr></thead><tbody>' + lineRows + '</tbody></table></div>' +
    '</div>';
}

function missingCardV2(header, qs, headerReviews) {
  var openHeader = headerReviews.filter(function (r) { return r.status === 'open' && !r.lines; });
  var openLines = headerReviews.filter(function (r) { return r.status === 'open' && r.lines; });
  var notQuoted = qs.filter(function (q) { return q.not_quoted; });
  var withGaps = qs.filter(function (q) { return !q.not_quoted && (q.gaps || []).length; });
  var total = openHeader.length + openLines.length + notQuoted.length;
  if (!total && !withGaps.length) return '<div class="card"><div class="spread"><div class="eyebrow">What\'s missing</div><span class="chip chip-pass">nothing</span></div>' +
    '<p style="font-size:12.5px;margin:6px 0 0">Every line and every term was answered and nothing needs a person. ' + lane('rule') + '</p></div>';
  return '<div class="card missing-card"><div class="spread" style="margin-bottom:8px"><div><div class="eyebrow">What\'s missing</div><h3>' + esc(qs[0].supplier_name) + '</h3></div>' +
    '<span class="chip chip-warn">' + (total || withGaps.length) + ' item' + ((total || withGaps.length) > 1 ? 's' : '') + '</span></div>' +
    openHeader.map(reviewMini).join('') +
    openLines.map(function (r) {
      var lines = r.lines.filter(function (l) { return l.status === 'open'; }).map(function (l) { return l.line; });
      return '<div class="mrow" style="background:' + (r.severity === 'crit' ? 'var(--mark-crit)' : 'var(--mark)') + '"><i style="font-style:normal;color:' + (r.severity === 'crit' ? 'var(--crit)' : 'var(--warn)') + ';font-weight:700">!</i>' +
        '<div><b style="font-weight:600">' + esc(r.question) + '</b> <span class="tag">line' + (lines.length > 1 ? 's' : '') + ' ' + lines.join(', ') + '</span> ' + lane(r.raised_by === 'ai' ? 'ai' : 'rule') +
        (r.note ? '<div class="muted" style="font-size:12px">' + esc(r.note) + '</div>' : '') + '</div></div>';
    }).join('') +
    (notQuoted.length ? '<div class="mrow"><i style="font-style:normal;color:var(--warn);font-weight:700">○</i><div><b style="font-weight:600">Lines not quoted</b>' +
      '<div class="muted" style="font-size:12px">' + notQuoted.map(function (q) { return q.sku; }).join(', ') + '</div></div></div>' : '') +
    (openHeader.length || openLines.length ? '<a class="btn ghost sm" style="margin-top:6px;display:inline-block;text-decoration:none" href="#/reviews">Answer these →</a>' : '') +
    '</div>';
}

function resultPanelV2(rec, header, qs, reviews, reply, rfq) {
  var out = [];
  if (rec.status === 'failed') out.push('<div class="card"><h3>The read failed</h3><p class="muted" style="font-size:12.5px">' + esc(rec.error || '') + '</p></div>');
  if (header) out.push(missingCardV2(header, qs, reviews));
  else if (rec.kind === 'clarification' || rec.status === 'non_quote') {
    out.push('<div class="card missing-card"><div class="spread" style="margin-bottom:6px"><div class="eyebrow">What\'s missing</div><span class="chip chip-info">not a quote</span></div>' +
      '<p style="font-size:12.5px;margin:0 0 6px">The supplier sent a <b>' + esc(rec.kind) + '</b>, not prices.</p>' +
      reviews.filter(function (r) { return r.status === 'open'; }).map(reviewMini).join('') + '</div>');
  } else if (rec.supplement !== undefined || rec.kind === 'supplement') {
    out.push('<div class="card"><div class="eyebrow" style="margin-bottom:6px">Follow-up answer</div>' +
      '<p style="font-size:12.5px;margin:0">' + (rec.answered_summary && rec.answered_summary.length ? 'Filled ' + rec.answered_summary.join(', ') + '.' : 'Nothing new was answered.') + ' ' + lane('rule') + '</p></div>');
  }
  out.push(replyCard(reply, rec, qs));
  var codeDec = rec.match || {};
  out.push('<div class="card"><div class="eyebrow" style="margin-bottom:8px">How it was routed</div><div class="checklist">' +
    row('Inquiry', codeDec.code ? esc(codeDec.code) + ' <span class="muted">(' + esc(codeDec.how) + ', ' + pct(codeDec.c || 0) + ')</span>' : 'none found',
      codeDec.c >= 0.9 ? 'pass' : codeDec.code ? 'warn' : 'crit', codeDec.lane || 'rule') +
    row('Read by', rec.source === 'ai' ? 'Claude' + (rec.model_tier ? ', ' + rec.model_tier + ' model' : '') : 'stored reference read', rec.source === 'ai' ? 'pass' : 'warn', rec.source === 'ai' ? 'ai' : 'rule') +
    (rec.line_coverage ? row('Lines quoted', rec.line_coverage.quoted + ' of ' + (rec.line_coverage.total || rec.line_coverage.quoted), 'pass', 'rule') : '') +
    (rec.prompt_bytes ? row('Sent to the reader', rec.prompt_bytes.toLocaleString() + ' bytes of 60,000' + (rec.duration_ms ? ' · ' + (rec.duration_ms / 1000).toFixed(1) + ' s' : ''), 'pass', 'rule') : '') +
    '</div></div>');
  return out.join('');
}

function resultPanel(rec, qs, reviews, reply, rfq) {
  var out = [];
  if (rec.status === 'duplicate') {
    out.push('<div class="card"><h3>Already seen</h3><p class="muted" style="font-size:12.5px;margin:6px 0 0">' +
      'Identical to an email read earlier, so no reader call was made. ' + lane('rule') + '</p>' +
      '<a class="btn ghost sm" style="margin-top:9px;display:inline-block;text-decoration:none" href="#/email/' + esc(rec.duplicate_of) + '">See the original</a></div>');
    return out.join('');
  }
  if (rec.status === 'failed') out.push('<div class="card"><h3>The read failed</h3><p class="muted" style="font-size:12.5px">' + esc(rec.error || '') + '</p></div>');

  var open = reviews.filter(function (r) { return r.status === 'open'; });
  qs.forEach(function (q) { out.push(missingCard(q, open.filter(function (r) { return r.quote_id === q.id; }))); });
  var noQuote = open.filter(function (r) { return !r.quote_id; });
  if (!qs.length && rec.status === 'non_quote') {
    out.push('<div class="card missing-card"><div class="spread" style="margin-bottom:6px"><div class="eyebrow">What\'s missing</div><span class="chip chip-info">not a quote</span></div>' +
      '<p style="font-size:12.5px;margin:0 0 6px">The supplier sent a <b>' + esc(rec.kind) + '</b>, not prices. Nothing can be compared until we answer.</p>' + noQuote.map(reviewMini).join('') + '</div>');
  } else if (noQuote.length) {
    out.push('<div class="card missing-card"><div class="eyebrow" style="margin-bottom:8px">Before any quote could be made</div>' + noQuote.map(reviewMini).join('') +
      '<a class="btn ghost sm" style="margin-top:8px;display:inline-block;text-decoration:none" href="#/reviews">Answer in your queue →</a></div>');
  }
  out.push(replyCard(reply, rec, qs));

  var codeDec = rec.match || {};
  out.push('<div class="card"><div class="eyebrow" style="margin-bottom:8px">How it was routed</div><div class="checklist">' +
    row('Inquiry', codeDec.code ? esc(codeDec.code) + ' <span class="muted">(' + esc(codeDec.how) + ', ' + pct(codeDec.c || 0) + ')</span>' : 'none found',
      codeDec.c >= 0.9 ? 'pass' : codeDec.code ? 'warn' : 'crit', codeDec.lane || 'rule') +
    row('Read by', rec.source === 'ai' ? 'Claude' + (rec.model_tier ? ', ' + rec.model_tier + ' model' : '') : 'stored reference read', rec.source === 'ai' ? 'pass' : 'warn', rec.source === 'ai' ? 'ai' : 'rule') +
    (rec.prompt_bytes ? row('Sent to the reader', rec.prompt_bytes.toLocaleString() + ' bytes of 60,000' + (rec.duration_ms ? ' · ' + (rec.duration_ms / 1000).toFixed(1) + ' s' : ''), 'pass', 'rule') : '') +
    '</div></div>');
  var ev = A.store.evals.filter(function (e) { return e.sample_id === rec.sample_id; })[0];
  if (ev) out.push(evalCard(ev));
  return out.join('');
}

function missingCard(q, revs) {
  var gaps = q.gaps || [];
  var total = gaps.length + revs.length;
  if (!total) return '<div class="card"><div class="spread"><div class="eyebrow">What\'s missing</div><span class="chip chip-pass">nothing</span></div>' +
    '<p style="font-size:12.5px;margin:6px 0 0">Every question we asked was answered and nothing needs a person. ' + lane('rule') + '</p></div>';
  return '<div class="card missing-card"><div class="spread" style="margin-bottom:8px"><div><div class="eyebrow">What\'s missing</div><h3>' + esc(q.supplier_name) + '</h3></div>' +
    '<span class="chip chip-warn">' + total + ' item' + (total > 1 ? 's' : '') + '</span></div>' +
    gaps.map(function (g) {
      return '<div class="mrow"><i style="font-style:normal;color:var(--warn);font-weight:700">○</i><div><b style="font-weight:600">' + esc(R.FIELD_LABELS[g.field] || (g.question ? 'Our question' : g.field)) + '</b>' +
        (g.kind && g.kind !== 'missing' ? ' <span class="tag">' + esc(g.kind) + '</span>' : '') +
        '<div class="muted" style="font-size:12px">' + esc(g.note || 'not answered') + '</div></div></div>';
    }).join('') +
    revs.map(function (r) {
      return '<div class="mrow" style="background:' + (r.severity === 'crit' ? 'var(--mark-crit)' : 'var(--mark)') + '"><i style="font-style:normal;color:' + (r.severity === 'crit' ? 'var(--crit)' : 'var(--warn)') + ';font-weight:700">!</i><div><b style="font-weight:600">' + esc(r.question) + '</b> ' + lane(r.raised_by === 'ai' ? 'ai' : 'rule') +
        (r.note ? '<div class="muted" style="font-size:12px">' + esc(r.note) + '</div>' : '') + '</div></div>';
    }).join('') +
    (revs.length ? '<a class="btn ghost sm" style="margin-top:6px;display:inline-block;text-decoration:none" href="#/reviews">Answer the ' + revs.length + ' question' + (revs.length > 1 ? 's' : '') + ' →</a>' : '') +
    (q.eligibility && q.eligibility.reasons.length ? '<div class="hr" style="margin:10px 0"></div><div class="eyebrow" style="margin-bottom:4px">Why it is ' + esc(q.eligibility.status.replace('_', ' ')) + '</div>' +
      '<ul style="margin:0;padding-left:17px;font-size:12.5px;color:var(--ink-2)">' + q.eligibility.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' : '') +
    '</div>';
}

function replyCard(reply, rec, qs) {
  if (!reply) {
    if (rec.status === 'extracted' || rec.status === 'non_quote') {
      var anyGap = qs.some(function (q) { return (q.gaps || []).length; }) || rec.kind === 'clarification';
      if (!anyGap) return '';
      return '<div class="card"><div class="eyebrow" style="margin-bottom:6px">Reply to supplier</div><p class="muted" style="font-size:12.5px;margin:0 0 8px">Nothing drafted yet.</p>' +
        '<button class="btn ghost sm" data-act="reply-draft" data-id="' + esc(rec.id) + '">Draft a reply</button></div>';
    }
    return '';
  }
  var sent = reply.status === 'sent';
  return '<div class="card" id="reply-' + esc(reply.id) + '"><div class="spread" style="margin-bottom:6px"><div><div class="eyebrow">Reply to supplier</div>' +
    '<h3>' + (sent ? 'Sent' : 'Waiting for your approval') + '</h3></div>' + lane(reply.source === 'ai' ? 'ai' : 'rule') + '→' + lane('human') + '</div>' +
    '<div style="font-size:12px" class="muted">To ' + esc(reply.to_name || '') + ' &lt;' + esc(reply.to) + '&gt;' + (sent ? ' · sent ' + esc(shortDate(reply.sent_at)) : '') + '</div>' +
    '<div style="font-size:12.5px;font-weight:600;margin:4px 0 6px">' + esc(reply.subject) + '</div>' +
    (sent ? '<div class="reply-box">' + esc(reply.body) + '</div>' :
      '<textarea id="rp-body-' + esc(reply.id) + '" rows="9" style="font-family:var(--sans);font-size:12.5px">' + esc(reply.body) + '</textarea>' +
      '<div class="acts" style="margin-top:8px"><button class="btn sm" data-act="reply-send" data-rp="' + esc(reply.id) + '">Approve and send</button>' +
      '<button class="btn ghost sm danger" data-act="reply-discard" data-rp="' + esc(reply.id) + '">Discard</button>' +
      '<span class="muted" style="font-size:11.5px">Nothing is sent until you approve. Edit the text first if you like.</span></div>') + '</div>';
}

A.draftReplyFor = function (emailId) {
  var rec = A.emailById(emailId); if (!rec) return;
  var rfq = A.rfqById(rec.rfq_id); if (!rfq) { A.toast('This email is not linked to an inquiry yet.'); return; }
  var multiLine = A.isMultiLine(rfq);
  var qsAll = A.store.quotes.filter(function (x) { return x.email_id === emailId && x.rfq_id === rfq.id; });
  var q = qsAll[0] || null;
  var gates = A.store.reviews.filter(function (rv) { return rv.email_id === emailId && rv.status === 'open'; });
  var items = multiLine ? G.chaseItemsV2(qsAll, gates.filter(function (g) { return !g.lines; }), rfq) : G.chaseItems(q, gates, rfq);
  if (!items.length && rec.kind !== 'clarification') { A.toast('Nothing to chase on this quote.'); return; }
  A.toast('Drafting…');
  A.adapters(A.aiReady ? 'ai' : 'reference', {}).reply(rec, q, rfq, items).then(function (d) {
    var rp = { id: 'rp_' + rec.id.replace(/^em_/, ''), email_id: rec.id, quote_id: q ? q.id : null, rfq_id: rfq.id, supplier_id: rec.supplier_id || null,
      supplier_name: q ? q.supplier_name : rec.from_name, to: rec.from, to_name: rec.from_name, subject: d.subject, body: d.body,
      items: items.map(function (i) { return i.ask; }), kind: rec.kind === 'clarification' ? 'answer' : 'chase', status: 'draft', source: d.source || 'ai', created_at: new Date().toISOString(), sent_at: null, rev: 1 };
    A.store.replies = A.store.replies.filter(function (r) { return r.email_id !== rec.id; });
    A.store.replies.push(rp);
    A.persistAll(); A.render();
  });
};

function reviewMini(r) {
  return '<div class="mrow" style="background:' + (r.severity === 'crit' ? 'var(--mark-crit)' : 'var(--mark)') + '"><i style="font-style:normal;font-weight:700;color:' + (r.severity === 'crit' ? 'var(--crit)' : 'var(--warn)') + '">!</i>' +
    '<div><b style="font-weight:600">' + esc(r.question) + '</b> ' + lane(r.raised_by === 'ai' ? 'ai' : 'rule') +
    '<div class="muted" style="font-size:12px">' + esc(r.note || '') + '</div></div></div>';
}

function row(label, value, sev, laneName) {
  var mark = { pass: ['✓', 'var(--pass)'], warn: ['!', 'var(--warn)'], crit: ['✕', 'var(--crit)'], mute: ['·', 'var(--ink-3)'] }[sev] || ['·', 'var(--ink-3)'];
  return '<div class="checkitem"><i style="color:' + mark[1] + '">' + mark[0] + '</i>' +
    '<div><b style="font-weight:600">' + esc(label) + '</b> ' + (laneName ? lane(laneName) : '') +
    '<div class="muted" style="font-size:12px">' + value + '</div></div></div>';
}

function evalCard(ev) {
  return '<div class="card"><div class="spread" style="margin-bottom:8px"><div class="eyebrow">Against the expected read</div>' +
    '<span class="chip ' + (ev.passed === ev.total ? 'chip-pass' : 'chip-warn') + '">' + ev.passed + ' of ' + ev.total + '</span></div>' +
    '<div class="evalstrip">' + ev.rows.map(function (r) {
      var cls = r.pass === true ? 'p' : r.pass === false ? 'f' : 'i';
      var title = r.kind + ' ' + r.key + ' — expected ' + JSON.stringify(r.want) + ', got ' + JSON.stringify(r.got);
      return '<span class="evalcell ' + cls + '" title="' + esc(title) + '">' + esc(r.key) + '</span>';
    }).join('') + '</div>' +
    '<p class="muted" style="font-size:11.5px;margin:8px 0 0">Hover a cell to see what was expected. <a href="#/evals">All evals →</a></p></div>';
}

/* ===================== quote table ===================== */
function quoteTable(qs, rfq) {
  var sorted = qs.slice().sort(function (a, b) {
    var rank = { eligible: 0, needs_review: 1, awaiting: 2, parked: 3, superseded: 4, disqualified: 5 };
    var d = (rank[a.eligibility.status] || 9) - (rank[b.eligibility.status] || 9);
    if (d) return d;
    return (a.norm.usd_at_target.v || 9e9) - (b.norm.usd_at_target.v || 9e9);
  });
  return '<div class="scroll-x"><table class="qtable"><thead><tr>' +
    '<th>Supplier</th><th>Price at ' + n0(rfq.target_qty) + '</th><th>Min order</th><th>Lead</th>' +
    '<th>Certs</th><th>Label</th><th>Answered</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>' +
    sorted.map(function (q) {
      var n = q.norm;
      var out = q.eligibility.status === 'disqualified' || q.eligibility.status === 'superseded';
      var missing = (rfq.required_certs || []).filter(function (c) { return (n.certs_canon.v || []).indexOf(c) === -1; });
      return '<tr class="' + (out ? 'out' : '') + '">' +
        '<td class="supcell"><b>' + esc(q.supplier_name) + '</b><span>' + esc(q.supplier_role) + (q.supplier_city ? ' · ' + esc(q.supplier_city) : '') + '</span></td>' +
        '<td class="price">' + (n.usd_at_target.v == null ? '<span class="muted" style="font-family:var(--sans);font-weight:400">—</span>' : Number(n.usd_at_target.v).toFixed(3)) +
          (n.usd_at_target.rule === 'human' ? ' ' + lane('human') : n.currency.v && n.currency.v !== 'USD' ? ' ' + lane('rule') : '') + '</td>' +
        '<td class="num">' + n0(n.moq_pcs.v) + '</td>' +
        '<td class="num">' + (n.lead_days.v == null ? '—' : n.lead_days.v + 'd') + '</td>' +
        '<td style="font-size:12px">' + (missing.length ? '<span class="chip chip-crit">missing ' + esc(missing.join(', ')) + '</span>' : esc((n.certs_canon.v || []).join(' ') || '—')) + '</td>' +
        '<td style="font-size:12px">' + esc(n.private_label.v || '—') + '</td>' +
        '<td>' + (q.completeness == null ? '—' : '<span class="num">' + q.completeness + '%</span><div class="meter"><i style="width:' + q.completeness + '%"></i></div>') + '</td>' +
        '<td style="font-size:11.5px"><span class="tag">' + esc(fmtLabel(q.format)) + '</span></td>' +
        '<td>' + chip(q.eligibility.status) + '</td>' +
        '<td><a class="btn ghost sm" href="#/email/' + esc(q.email_id) + '" style="text-decoration:none;white-space:nowrap">Open</a></td>' +
        '</tr>';
    }).join('') + '</tbody></table></div>';
}

/* ===================== compare ===================== */
A.route(/^\/compare\/(.+)$/, function (id) {
  var rfq = A.rfqById(id);
  if (!rfq) return '<div class="empty">No such inquiry.</div>';
  var qs = A.quotesFor(id);
  var cmp = A.store.comparisons.filter(function (c) { return c.rfq_id === id; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0];
  var running = A.running['cmp_' + id];

  var head = '<div class="page-head"><div><a href="#/rfq/' + esc(id) + '" style="font-size:12.5px">← ' + esc(rfq.code) + '</a>' +
    '<h1 style="margin-top:3px">Compare · ' + esc(rfq.product) + '</h1></div><div class="row">' +
    (cmp && cmp.status === 'stale' ? '<span class="chip chip-warn">Out of date</span>' : '') +
    '<button class="btn" data-act="runcompare" data-rfq="' + esc(id) + '"' + (running ? ' disabled' : '') + '>' +
    (running ? 'Working…' : cmp ? 'Run again' : 'Run the comparison') + '</button></div></div>';

  var crit = criteriaMatrix(qs, rfq);

  if (running) return head + crit + '<div class="card"><div class="row"><span class="spin"></span><span class="chip chip-info">Claude is thinking</span>' +
    '<span class="muted" style="font-size:12.5px">The strongest model is used here. The first words can take up to a minute.</span></div>' +
    (running.text ? '<pre class="reply-box" style="margin-top:10px;max-height:220px;font-size:11px">' + esc(running.text.slice(-2200)) + '</pre>' : '') +
    '<button class="btn ghost sm" style="margin-top:9px" data-act="cancelcompare" data-rfq="' + esc(id) + '">Stop</button></div>';

  if (!cmp) return head + crit + '<div class="empty">Nothing has been ranked yet. Run the comparison to see the cheapest, the best value and a recommendation.</div>';

  if (cmp.no_candidates) {
    return head + crit + '<div class="card"><h2>No quote passes yet</h2>' +
      '<p class="muted" style="font-size:13px">' + esc(cmp.excluded.length ? 'Every quote is held back by the rules or by a question waiting on you.' : 'No quotes have been read for this inquiry.') +
      ' No reader call was made, because there is nothing to rank. ' + lane('rule') + '</p>' +
      (A.openReviews().length ? '<a class="btn" href="#/reviews" style="text-decoration:none;display:inline-block;margin-top:6px">Clear your queue →</a>' : '') + '</div>';
  }
  if (cmp.status === 'failed') return head + crit + '<div class="card"><h2>The ranking failed</h2><p class="muted">' + esc(cmp.error) + '</p></div>';

  var byId = {}; qs.forEach(function (q) { byId[q.id] = q; });
  var ai = cmp.ai || {};
  var eligible = qs.filter(function (q) { return cmp.eligible_ids.indexOf(q.id) > -1; });
  var picked = A.pick[id] || (ai.recommended && ai.recommended.id) || (ai.cheapest && ai.cheapest.id) || (eligible[0] && eligible[0].id);
  A.pick[id] = picked;
  var won = rfq.winner_quote_id;

  function lensCard(key, title, blurb) {
    var l = ai[key];
    if (!l || !l.id) return '';
    var q = byId[l.id];
    if (!q) return '';
    var extras = key === 'recommended' ? recommendedExtras(l, byId) : '';
    return '<div class="lens' + (picked === q.id ? ' picked' : '') + '">' +
      '<div class="spread"><h3>' + esc(title) + '</h3>' + lane(key === 'cheapest' ? 'rule' : 'ai') + '</div>' +
      '<div class="muted" style="font-size:11px;margin-top:-4px">' + esc(blurb) + '</div>' +
      '<div class="who">' + esc(q.supplier_name) + '</div>' +
      '<div class="amt">' + money(q.norm.usd_at_target.v) + ' · min ' + n0(q.norm.moq_pcs.v) + ' · ' + (q.norm.lead_days.v || '?') + ' days</div>' +
      '<div class="lens-scroll"><p>' + esc(l.why || '') + '</p>' +
      (l.tradeoffs && l.tradeoffs.length ? '<div class="eyebrow" style="margin:4px 0 2px">What you give up</div><ul>' + l.tradeoffs.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      extras + '</div>' +
      (won ? '' : '<label class="pick"><input type="radio" name="pick-' + esc(id) + '" value="' + esc(q.id) + '" data-change="pick" data-rfq="' + esc(id) + '"' + (picked === q.id ? ' checked' : '') + '> Choose this one</label>') +
      '</div>';
  }

  var lenses = '<div class="lenses">' +
    lensCard('cheapest', 'Cheapest', 'Lowest normalised FOB price. Decided by arithmetic, explained by Claude.') +
    lensCard('best_value', 'Best value', 'Price weighed against minimum order, lead time, terms and completeness.') +
    lensCard('recommended', 'Recommended winner', 'What Claude would award, and what to check first.') +
    '</div>';

  var perQuote = (ai.per_quote || []).filter(function (p) { return byId[p.id]; });
  var details = '<details class="more" style="margin-top:14px"><summary>More detail: for and against each quote, what was excluded, the call itself</summary>' +
    '<div style="margin-top:12px" class="stack">' +
    (perQuote.length ? '<div class="grid2">' + perQuote.map(function (p) {
      return '<div class="gcard"><h4>' + esc(byId[p.id].supplier_name) + '</h4><div class="lens-scroll" style="max-height:160px">' +
        (p.strengths && p.strengths.length ? '<div class="eyebrow" style="margin-top:4px">For</div><ul>' + p.strengths.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '') +
        (p.weaknesses && p.weaknesses.length ? '<div class="eyebrow" style="margin-top:4px">Against</div><ul>' + p.weaknesses.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '') +
        '</div></div>';
    }).join('') + '</div>' : '') +
    (ai.questions_for_buyer && ai.questions_for_buyer.length ? '<div class="card"><div class="eyebrow" style="margin-bottom:5px">Questions back to us</div><ul style="margin:0;padding-left:17px;font-size:12px">' +
      ai.questions_for_buyer.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>' : '') +
    '<div class="card"><div class="eyebrow" style="margin-bottom:6px">Excluded before ranking</div>' +
      (cmp.excluded.length ? '<div class="checklist">' + cmp.excluded.map(function (e) {
        return '<div class="checkitem"><i style="color:var(--crit)">✕</i><div><b style="font-weight:600">' + esc(e.supplier_name || e.id) + '</b> ' + lane('rule') +
          '<div class="muted" style="font-size:12px">' + esc(e.reason) + '</div></div></div>';
      }).join('') + '</div>' : '<span class="muted">none</span>') + '</div>' +
    '<div class="card"><div class="eyebrow" style="margin-bottom:6px">The call</div>' +
      '<div class="mono" style="font-size:11.5px;color:var(--ink-2)">' +
      'source ' + esc(cmp.source || 'reference') + (cmp.model_tier ? ' · model ' + esc(cmp.model_tier) : '') +
      ' · ' + (cmp.prompt_bytes || 0).toLocaleString() + ' bytes in · ' + ((cmp.duration_ms || 0) / 1000).toFixed(1) + ' s' +
      ' · median USD ' + (cmp.median == null ? '—' : Number(cmp.median).toFixed(3)) + '</div></div>' +
    '</div></details>';

  var award = '<div class="card" style="margin-top:14px"><div class="spread" style="flex-wrap:wrap;gap:12px"><div>' +
    '<div class="eyebrow">Final step</div>' +
    '<h3>' + (won ? 'Awarded to ' + esc((byId[won] || {}).supplier_name || won) : 'Choose the plan you want, then award') + '</h3>' +
    '<p class="muted" style="font-size:12.5px;margin:4px 0 0">' + (won ? 'Recorded on ' + esc(shortDate(rfq.awarded_at || '')) + (rfq.awarded_via ? ' via the ' + esc(rfq.awarded_via.replace('_', ' ')) + ' plan' : '') + '.' :
      'Tick a plan above or pick any eligible quote here. Nothing is awarded until you say so. ' + lane('human')) + '</p></div>' +
    (won ? '' : '<div class="row" style="gap:8px"><select id="award-sel-' + esc(id) + '" data-change="pick-sel" data-rfq="' + esc(id) + '" style="width:auto;min-width:220px">' +
      eligible.map(function (q) {
        var tags = [];
        if (ai.cheapest && ai.cheapest.id === q.id) tags.push('cheapest');
        if (ai.best_value && ai.best_value.id === q.id) tags.push('best value');
        if (ai.recommended && ai.recommended.id === q.id) tags.push('recommended');
        return '<option value="' + esc(q.id) + '"' + (picked === q.id ? ' selected' : '') + '>' + esc(q.supplier_name) + ' — ' + money(q.norm.usd_at_target.v) + (tags.length ? ' (' + tags.join(', ') + ')' : '') + '</option>';
      }).join('') + '</select>' +
      '<button class="btn" data-act="award" data-rfq="' + esc(rfq.id) + '"' + (picked ? '' : ' disabled') + '>Award</button></div>') +
    '</div></div>';

  return head +
    (cmp.status === 'stale' ? '<div class="banner" style="margin-bottom:14px">A quote changed after this ranking ran. Run it again before acting on it.</div>' : '') +
    (ai.reference ? '<div class="banner" style="margin-bottom:14px">Claude is not available in this view, so the ranking below is arithmetic only, not a judgement.</div>' : '') +
    crit + lenses + award + details;
});

function criteriaMatrix(qs, rfq) {
  if (!qs.length) return '';
  var rows = [
    ['Waiting on a person', function (q) { var n = (q.openGates || []).filter(function (g) { return ['WINNER_APPROVAL', 'COMPARISON_STALE', 'SINGLE_CANDIDATE'].indexOf(g.code) === -1; }).length; return n ? ['warn', n + ' open'] : ['pass', 'none']; }],
    ['Private label', function (q) { return !rfq.pl_required ? ['pass', 'not required'] : q.norm.private_label.v === 'yes' ? ['pass', 'yes'] : ['crit', String(q.norm.private_label.v || 'not answered')]; }],
    ['Certificates', function (q) {
      var miss = (rfq.required_certs || []).filter(function (c) { return (q.norm.certs_canon.v || []).indexOf(c) === -1; });
      return miss.length ? ['crit', 'missing ' + miss.join(', ')] : ['pass', 'all present'];
    }],
    ['Inside the price band', function (q) {
      var p = q.norm.usd_at_target.v;
      if (p == null) return ['crit', 'no price'];
      if (p > rfq.target_usd_fob.hi) return ['crit', 'USD ' + p.toFixed(3) + ' too high'];
      if (p < rfq.target_usd_fob.lo) return ['warn', 'USD ' + p.toFixed(3) + ' below floor'];
      return ['pass', 'USD ' + p.toFixed(3)];
    }],
    ['FOB China', function (q) { var i = q.norm.incoterm.v; return (i === 'FOB' || i === 'FCA') ? ['pass', i] : q.norm.usd_at_target.rule === 'human' ? ['pass', 'normalised'] : ['warn', String(i || 'not stated')]; }],
    ['Still valid', function (q) { var e = q.norm.expiry.v; return !e ? ['warn', 'not stated'] : (e >= A.store.meta.demo_now ? ['pass', e] : ['crit', 'expired ' + e]); }],
    ['Minimum order fits', function (q) { var m = q.norm.moq_pcs.v; return m == null ? ['warn', 'unknown'] : m <= rfq.target_qty ? ['pass', n0(m)] : ['warn', n0(m) + ' > ' + n0(rfq.target_qty)]; }]
  ];
  return '<details class="card" style="margin-bottom:14px;padding:10px 16px" open><summary style="cursor:pointer;font-weight:700;font-size:13px;display:flex;justify-content:space-between;align-items:center">' +
    '<span>Hard criteria · who is in the running</span>' + lane('rule') + '</summary>' +
    '<div class="scroll-x" style="margin-top:8px"><table class="matrix" style="font-size:12px"><thead><tr><th>Criterion</th>' +
    qs.map(function (q) { return '<th>' + esc(q.supplier_name.split(' ').slice(0, 2).join(' ')) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td>' + qs.map(function (q) {
        var res = r[1](q);
        var col = res[0] === 'pass' ? 'var(--pass)' : res[0] === 'warn' ? 'var(--warn)' : 'var(--crit)';
        var glyph = res[0] === 'pass' ? '✓' : res[0] === 'warn' ? '!' : '✕';
        return '<td class="v" style="color:' + col + '">' + glyph + ' <span style="color:var(--ink-2);font-weight:400">' + esc(res[1]) + '</span></td>';
      }).join('') + '</tr>';
    }).join('') +
    '<tr><td><b>Verdict</b></td>' + qs.map(function (q) { return '<td>' + chip(q.eligibility.status) + '</td>'; }).join('') + '</tr>' +
    '</tbody></table></div></details>';
}

function recommendedExtras(l, byId) {
  var out = '';
  if (l.c != null) out += '<div class="row" style="gap:6px;margin:2px 0 6px"><span class="chip chip-info">confidence ' + pct(l.c) + '</span>' +
    (l.runner_up && byId[l.runner_up] ? '<span class="muted" style="font-size:11.5px">runner-up ' + esc(byId[l.runner_up].supplier_name) + '</span>' : '') + '</div>';
  if (l.verify_before_award && l.verify_before_award.length) out += '<div class="eyebrow" style="margin:4px 0 2px">Check before awarding</div><ul>' + l.verify_before_award.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  if (l.negotiate && l.negotiate.length) out += '<div class="eyebrow" style="margin:4px 0 2px">Where to push</div><ul>' + l.negotiate.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  if (l.risks && l.risks.length) out += '<div class="eyebrow" style="margin:4px 0 2px">Risks</div><ul>' + l.risks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  return out;
}

A.runCompare = function (rfqId) {
  var key = 'cmp_' + rfqId;
  var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  A.running[key] = { text: '', ctl: ctl };
  A.render();
  var ad = A.adapters(A.aiReady ? 'ai' : 'reference', {
    signal: ctl && ctl.signal,
    onText: function (u) { A.running[key].text = u.text; var b = $('#view pre'); if (b) { b.textContent = u.text.slice(-2200); b.scrollTop = b.scrollHeight; } }
  });
  PL.compare(rfqId, A.store, ad).then(function () {
    delete A.running[key]; delete A.pick[rfqId];
    A.persistAll(); A.render();
  }, function (e) {
    delete A.running[key];
    A.toast('The ranking failed: ' + ((e && (e.message || e.code)) || 'unknown'));
    A.render();
  });
};

/* ===================== your queue ===================== */
A.route(/^\/reviews$/, function () {
  var open = A.store.reviews.filter(function (r) { return r.status === 'open'; });
  var done = A.store.reviews.filter(function (r) { return r.status !== 'open'; });
  var drafts = A.draftReplies();
  var order = { crit: 0, warn: 1, info: 2 };
  open.sort(function (a, b) { return (order[a.severity] || 3) - (order[b.severity] || 3); });
  var total = open.length + drafts.length;
  return '<div class="page-head"><h1>Your queue</h1>' +
    (total ? '<span class="chip chip-warn">' + A.plural(total, 'item') + '</span>' : '<span class="chip chip-pass">Clear</span>') + '</div>' +
    '<p class="lede">The system stops here rather than guessing. Replies to suppliers wait for your approval; questions name what was seen, what it would do, and what changes if you disagree.</p>' +
    (drafts.length ? '<h2 style="margin:0 0 10px">Replies waiting for approval <span class="chip chip-info">' + drafts.length + '</span></h2><div class="stack" style="margin-bottom:26px">' + drafts.map(replyQueueCard).join('') + '</div>' : '') +
    '<h2 style="margin:0 0 10px">Questions for you' + (open.length ? ' <span class="chip chip-warn">' + open.length + '</span>' : '') + '</h2>' +
    (open.length ? '<div class="stack">' + open.map(reviewCard).join('') + '</div>' : '<div class="empty">Nothing is waiting on you.</div>') +
    (done.length ? '<h2 style="margin:26px 0 10px">Answered</h2><div class="stack">' + done.slice(-14).reverse().map(reviewCard).join('') + '</div>' : '');
});

function replyQueueCard(rp) {
  var rfq = A.rfqById(rp.rfq_id);
  return '<div class="review" style="border-left-color:var(--accent)">' +
    '<div class="row" style="justify-content:space-between"><div class="row" style="gap:6px">' +
      '<span class="chip chip-info">' + (rp.kind === 'answer' ? 'answer their questions' : 'chase missing details') + '</span>' +
      (rfq ? '<span class="tag">' + esc(rfq.code) + '</span>' : '') + '<span class="muted" style="font-size:12px">' + esc(rp.supplier_name || rp.to) + '</span></div>' +
      '<div class="row" style="gap:5px">' + lane(rp.source === 'ai' ? 'ai' : 'rule') + '→' + lane('human') + '</div></div>' +
    '<div class="q">' + esc(rp.subject) + '</div>' +
    '<textarea id="rp-body-' + esc(rp.id) + '" rows="8" style="font-family:var(--sans);font-size:12.5px">' + esc(rp.body) + '</textarea>' +
    '<div class="acts"><button class="btn sm" data-act="reply-send" data-rp="' + esc(rp.id) + '">Approve and send</button>' +
    '<a class="btn ghost sm" href="#/email/' + esc(rp.email_id) + '" style="text-decoration:none">Open the email</a>' +
    '<button class="btn ghost sm danger" data-act="reply-discard" data-rp="' + esc(rp.id) + '">Discard</button></div></div>';
}

function reviewCard(r) {
  var q = r.quote_id ? A.store.quotes.filter(function (x) { return x.id === r.quote_id; })[0] : null;
  var rfq = r.rfq_id ? A.rfqById(r.rfq_id) : null;
  var reason = R.REASONS[r.code] || {};
  var headerOnly = !!(r.header_id && !r.quote_id && !r.lines); /* v2 term-level review: no single price/value to correct */
  var editable = headerOnly ? null : { CURRENCY_CONVERTED: 'usd_at_target', INCOTERM_MISMATCH: 'usd_at_target', UNIT_CONVERTED: 'usd_at_target',
    TIER_INTERPOLATED: 'usd_at_target', PRICE_RANGE_ONLY: 'usd_at_target', OCR_AMBIGUOUS_CRITICAL: 'usd_at_target',
    CRITICAL_FIELD_LOW_CONF: 'usd_at_target', PRICE_OUTLIER: 'usd_at_target', MOQ_EXCEEDS_TARGET: 'moq_pcs',
    CONDITIONAL_PL: 'private_label', CERT_UNVERIFIED: 'certs_canon', VALIDITY_EXPIRED: 'expiry' }[r.code];
  var open = r.status === 'open';
  var affectedLines = r.lines ? uniqLines(r.lines.map(function (l) { return l.line; })) : null;
  return '<div class="review ' + (r.severity === 'crit' ? 'crit' : '') + (open ? '' : ' done') + '">' +
    '<div class="row" style="justify-content:space-between">' +
      '<div class="row" style="gap:6px">' +
        '<span class="chip chip-' + (r.severity === 'crit' ? 'crit' : r.severity === 'info' ? 'info' : 'warn') + '">' + esc(r.code.replace(/_/g, ' ').toLowerCase()) + '</span>' +
        (rfq ? '<span class="tag">' + esc(rfq.code) + '</span>' : '') +
        (affectedLines ? '<span class="tag">line' + (affectedLines.length > 1 ? 's' : '') + ' ' + affectedLines.join(', ') + '</span>' : '') +
        (q ? '<span class="muted" style="font-size:12px">' + esc(q.supplier_name) + '</span>' : '') +
        (r.email_id ? '<a href="#/email/' + esc(r.email_id) + '" style="font-size:12px">open email</a>' : '') +
      '</div><div class="row" style="gap:5px">' + lane(r.raised_by === 'ai' ? 'ai' : 'rule') + '→' + lane('human') + '</div></div>' +
    '<div class="q">' + esc(r.question || reason.q || '') + '</div>' +
    (r.note ? '<div style="font-size:12.5px;color:var(--ink-2)">' + esc(r.note) + '</div>' : '') +
    (r.evidence && r.evidence.length ? r.evidence.map(function (e) {
      return '<div class="evbox">' + esc(e.ev) + '<div class="muted" style="font-family:var(--sans);font-size:10.5px;margin-top:3px">from ' + esc(e.src) + '</div></div>';
    }).join('') : '') +
    (r.proposed != null ? '<div style="font-size:12.5px"><span class="eyebrow">Proposed</span> <span class="mono">' + esc(typeof r.proposed === 'object' ? JSON.stringify(r.proposed) : r.proposed) + '</span></div>' : '') +
    (open ? '<div class="acts">' +
        '<button class="btn sm" data-act="resolve" data-rv="' + esc(r.id) + '" data-mode="accept">Accept</button>' +
        (editable ? '<input type="text" id="rvv-' + esc(r.id) + '" placeholder="' + esc(editable === 'usd_at_target' ? 'corrected USD price' : editable === 'moq_pcs' ? 'corrected minimum' : 'corrected value') + '" style="width:172px">' +
          '<button class="btn ghost sm" data-act="resolve" data-rv="' + esc(r.id) + '" data-mode="edit" data-field="' + esc(editable) + '">Use this instead</button>' : '') +
        '<input type="text" id="rvr-' + esc(r.id) + '" placeholder="why (recorded on the quote)" style="width:210px">' +
        '<button class="btn ghost sm danger" data-act="resolve" data-rv="' + esc(r.id) + '" data-mode="reject">Not a problem</button>' +
      '</div>'
      : '<div class="row" style="font-size:12px;color:var(--ink-3)">' +
        '<b>' + esc(r.status) + '</b> by ' + esc(r.resolution ? r.resolution.by : '?') +
        (r.resolution && r.resolution.value !== undefined && r.resolution.value !== null ? ' · set to <span class="mono">' + esc(typeof r.resolution.value === 'object' ? JSON.stringify(r.resolution.value) : r.resolution.value) + '</span>' : '') +
        (r.resolution && r.resolution.reason ? ' · ' + esc(r.resolution.reason) : '') + '</div>') +
    '</div>';
}

/* ===================== evals ===================== */
A.route(/^\/evals$/, function () {
  var evs = A.store.evals;
  var intro = '<div class="page-head"><h1>Evals</h1>' + (evs.length ? (function () { var t = 0, p = 0; evs.forEach(function (e) { t += e.total; p += e.passed; }); return '<span class="chip ' + (p === t ? 'chip-pass' : 'chip-warn') + '">' + p + ' of ' + t + ' met</span>'; })() : '') + '</div>' +
    '<p class="lede">Each seeded or generated email carries an expected read: the price at our quantity, the minimum, the certificates, and which questions should stop for a person. ' +
    'What was read is compared against it. A cell that is raised but not expected is worth reading before assuming it is wrong.</p>';
  if (!evs.length) return intro + '<div class="empty">Read some emails first.</div>';
  return intro + '<div class="stack">' + evs.map(function (e) {
    var em = A.store.emails.filter(function (x) { return x.sample_id === e.sample_id; })[0] || {};
    var raw = S.emails.filter(function (x) { return x.sample_id === e.sample_id; })[0] || {};
    return '<div class="card"><div class="spread" style="margin-bottom:7px"><div>' +
      '<h3>' + esc(raw.label || e.sample_id) + '</h3>' +
      '<div class="muted" style="font-size:12px"><span class="tag">' + esc(e.sample_id) + '</span> ' + esc(fmtLabel(raw.format || '')) +
      ' · read by ' + esc(e.source === 'ai' ? 'Claude' : 'reference') + ' · prompt ' + esc(e.prompt_version) + '</div></div>' +
      '<span class="chip ' + (e.passed === e.total ? 'chip-pass' : 'chip-warn') + '">' + e.passed + '/' + e.total + '</span></div>' +
      '<div class="scroll-x"><table class="matrix"><thead><tr><th>What</th><th>Expected</th><th>Got</th><th></th></tr></thead><tbody>' +
      e.rows.map(function (r) {
        var col = r.pass === true ? 'var(--pass)' : r.pass === false ? 'var(--crit)' : 'var(--ink-3)';
        var g = r.pass === true ? '✓' : r.pass === false ? '✕' : '·';
        return '<tr><td>' + esc(r.kind === 'gate' ? 'stops for a person: ' + r.key.replace(/_/g, ' ').toLowerCase() : R.FIELD_LABELS[r.key] || r.key) + '</td>' +
          '<td class="mono" style="font-size:11.5px">' + esc(JSON.stringify(r.want)) + '</td>' +
          '<td class="mono" style="font-size:11.5px">' + esc(JSON.stringify(r.got)) + '</td>' +
          '<td style="color:' + col + ';font-weight:700">' + g + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (em.id ? '<a href="#/email/' + esc(em.id) + '" style="font-size:12px">Open the email →</a>' : '') + '</div>';
  }).join('') + '</div>';
});

/* ===================== guardrails ===================== */
A.route(/^\/guardrails$/, function () {
  var Gd = window.GUARDRAILS;
  var v1 = Gd.filter(function (g) { return /handled/.test(g.v1); }).length;
  return '<div class="page-head"><h1>Attachment types and guardrails</h1></div>' +
    '<p class="lede">The formats a supplier quote actually arrives in, what the reader has to get out of each, and the guardrail that stops it guessing. ' +
    v1 + ' of ' + Gd.length + ' are exercised by the current emails. The rest are the next eval cases to write.</p>' +
    '<div class="grid2">' + Gd.map(function (g) {
      var cls = /always to a person/.test(g.v1) ? 'chip-crit' : /handled/.test(g.v1) ? 'chip-pass' : 'chip-warn';
      return '<div class="gcard"><div class="spread"><h4>' + esc(g.type) + '</h4>' +
        '<span class="chip ' + cls + '">' + esc(g.v1) + '</span></div>' +
        '<dl><dt>Read</dt><dd>' + esc(g.read) + '</dd>' +
        '<dt>Guard</dt><dd>' + esc(g.guard) + '</dd>' +
        '<dt>Eval</dt><dd>' + esc(g.evalCase) + '</dd></dl></div>';
    }).join('') + '</div>' +
    '<h2 style="margin:28px 0 10px">Where the system stops for a person</h2>' +
    '<div class="scroll-x"><table class="matrix"><thead><tr><th>Reason</th><th>Severity</th><th>What you are asked</th></tr></thead><tbody>' +
    Object.keys(R.REASONS).map(function (k) {
      var r = R.REASONS[k];
      var col = r.sev === 'crit' ? 'var(--crit)' : r.sev === 'info' ? 'var(--accent)' : 'var(--warn)';
      return '<tr><td class="mono" style="font-size:11.5px">' + esc(k.toLowerCase()) + '</td>' +
        '<td style="color:' + col + ';font-weight:600">' + esc(r.sev) + '</td><td>' + esc(r.q) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
});

/* ===================== supplier view ===================== */
A.route(/^\/supplier$/, function () {
  return '<div class="page-head"><h1>Supplier view</h1></div>' +
    '<p class="lede">The simulated supplier side. Pick an inquiry, then compose a reply as each recipient — complete, partial, contradictory, or from an address we never sent to. Nothing here calls Claude; every reply is written instantly so the demo never waits.</p>' +
    '<div class="stack">' + A.store.rfqs.slice().reverse().map(function (rfq) {
      var tabs = A.supplierTabs(rfq);
      return '<div class="card"><div class="spread" style="margin-bottom:6px"><div><h3>' + esc(rfq.product) + '</h3><div class="muted" style="font-size:12px"><span class="tag">' + esc(rfq.code) + '</span> ' + rfqMeta(rfq) + '</div></div>' +
        '<button class="btn ghost sm" data-act="sv-loadall" data-rfq="' + rfq.id + '">Load all four</button></div>' +
        '<div class="row" style="gap:6px">' + tabs.map(function (t) {
          return '<a class="btn ghost sm" href="#/supplier/' + rfq.id + '/' + t.key + '" style="text-decoration:none">' + t.key + ' · ' + esc(t.supplier.name) + '</a>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';
});

A.route(/^\/supplier\/([^/]+)\/([^/]+)$/, function (rfqId, tabKey) {
  var rfq = A.rfqById(rfqId);
  if (!rfq) return '<div class="empty">No such inquiry.</div>';
  var tabs = A.supplierTabs(rfq);
  var current = tabs.filter(function (t) { return t.key === tabKey; })[0] || tabs[0];
  var supplier = current.supplier;
  var sv = A.svGet(rfqId, supplier.id, current.key);
  var pvKey = A.svKey(rfqId, supplier.id);
  var pv = A.svPreview[pvKey];

  var head = '<div class="page-head"><div><a href="#/supplier" style="font-size:12.5px">← Supplier view</a>' +
    '<h1 style="margin-top:3px">' + esc(rfq.product) + '</h1><div class="muted" style="font-size:12.5px"><span class="tag">' + esc(rfq.code) + '</span></div></div>' +
    '<button class="btn ghost sm" data-act="sv-loadall" data-rfq="' + rfqId + '">Load all four</button></div>' +
    '<div class="svtabs">' + tabs.map(function (t) {
      return '<a class="' + (t.key === current.key ? 'on' : '') + '" href="#/supplier/' + rfqId + '/' + t.key + '">' + t.key + ' · ' + esc(t.supplier.name) + '</a>';
    }).join('') + '</div>';

  var left = svInbound(rfq, supplier);
  var right = svComposer(rfq, supplier, current, sv, pv);
  return head + '<div class="wizard">' + left + right + '</div>';
});

function svInbound(rfq, supplier) {
  var items = R.rfqItems(rfq);
  var chases = A.store.replies.filter(function (r) { return r.rfq_id === rfq.id && r.supplier_id === supplier.id; });
  return '<div class="card"><div class="eyebrow" style="margin-bottom:6px">Inbound request, as ' + esc(supplier.unknown ? 'an outside supplier' : supplier.name) + ' would see it</div>' +
    '<div class="envelope" style="margin-bottom:12px"><header><b style="font-family:var(--disp);font-size:15px">Re: ' + esc(rfq.code) + ' — ' + esc(rfq.product) + '</b>' +
    '<dl class="meta"><dt>From</dt><dd>' + esc(S.buyer.name) + ' &lt;' + esc(S.buyer.email) + '&gt;</dd><dt>Deadline</dt><dd>' + esc(rfq.deadline) + '</dd></dl></header>' +
    '<div class="bodytext" style="font-size:12.5px">' + esc(rfq.spec_summary) + '\n\nCertifications required: ' + esc((rfq.required_certs || []).join(', ') || 'none') +
    '\nPrivate label: ' + (rfq.pl_required ? 'required' : 'not required') + '\nLead time: up to ' + rfq.max_lead_days + ' days\nDestination: ' + esc(rfq.dest_port) + '</div></div>' +
    '<div class="scroll-x" style="max-height:260px;overflow-y:auto"><table class="matrix" style="font-size:11.5px"><thead><tr><th>Line</th><th>SKU</th><th>Product</th><th>Qty</th><th>Band</th></tr></thead><tbody>' +
    items.map(function (it) { return '<tr><td>' + it.line + '</td><td class="mono">' + esc(it.sku) + '</td><td>' + esc(it.product) + '</td><td>' + n0(it.qty) + ' ' + esc(it.unit) + '</td><td>' + it.target_usd_fob.lo.toFixed(2) + '–' + it.target_usd_fob.hi.toFixed(2) + '</td></tr>'; }).join('') +
    '</tbody></table></div>' +
    '<div class="eyebrow" style="margin:12px 0 5px">Questions asked</div><ol style="margin:0;padding-left:18px;font-size:12.5px">' +
    (rfq.custom_questions || []).map(function (q) { return '<li>' + esc(q.text) + '</li>'; }).join('') + '</ol>' +
    (chases.length ? '<div class="hr"></div><div class="eyebrow" style="margin-bottom:5px">Follow-ups from the buyer</div>' + chases.map(function (rp) {
      return '<div class="mrow" style="background:var(--sunk)"><i style="font-style:normal">✉</i><div><b style="font-weight:600">' + esc(rp.subject) + '</b> <span class="chip ' + (rp.status === 'sent' ? 'chip-info' : 'chip-mute') + '" style="font-size:10px">' + esc(rp.status) + '</span>' +
        (rp.status === 'sent' ? '<div style="margin-top:5px"><button class="btn ghost sm" data-act="sv-answer" data-rp="' + esc(rp.id) + '">Reply as ' + esc(current_persona_label(A.svGet(rfq.id, supplier.id).persona)) + '</button></div>' : '') +
        '</div></div>';
    }).join('') : '') +
    '</div>';
}
function current_persona_label(k) { return (G.PERSONAS[k] || G.PERSONAS.A).label; }

function svComposer(rfq, supplier, current, sv, pv) {
  var personaBtns = Object.keys(G.PERSONAS).map(function (k) {
    return '<button type="button" data-act="sv-persona" data-p="' + k + '" aria-pressed="' + (sv.persona === k) + '">' + k + ' · ' + esc(G.PERSONAS[k].label) + '</button>';
  }).join('');
  var toggles = G.TOGGLE_LIST.map(function (t) {
    return '<label class="row" style="gap:6px;font-size:12px;font-weight:400"><input type="checkbox" data-change="sv-toggle" data-k="' + t.key + '"' + (sv.toggles[t.key] ? ' checked' : '') + ' style="width:auto"> ' + esc(t.label) + '</label>';
  }).join('');
  var formatSel = '<select id="sv-format">' + G.FORMATS_V2.map(function (f) { return '<option value="' + f + '"' + (sv.format === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select>';

  var preview = '';
  if (pv) {
    preview = '<div class="hr"></div><div class="eyebrow" style="margin-bottom:6px">Preview — edit before sending</div>' +
      '<label class="f">Subject<input type="text" id="sv-subject" value="' + esc(pv.email.subject) + '"></label>' +
      '<label class="f">From<input type="text" id="sv-from" value="' + esc(pv.email.from) + '"></label>' +
      '<label class="f">Body<textarea id="sv-body" rows="8" style="font-family:var(--sans);font-size:12.5px">' + esc(pv.email.body_raw) + '</textarea></label>' +
      (pv.email.attachments.length ? '<label class="f">Attachment (' + esc(pv.email.attachments[0].name) + ')<textarea id="sv-att" rows="8" style="font-family:var(--mono);font-size:11.5px">' + esc(pv.email.attachments[0].transcript) + '</textarea></label>' : '') +
      '<div class="muted" style="font-size:11px">' + pv.ref.lines.length + ' line(s) quoted of ' + R.rfqItems(rfq).length + '. Edits are kept, but changed text may read as lower confidence in reference mode.</div>' +
      '<div class="row" style="margin-top:8px"><button class="btn" data-act="sv-send">Send to buyer</button><button class="btn ghost sm" data-act="sv-discard">Discard</button></div>';
  }

  return '<div class="card"><div class="eyebrow" style="margin-bottom:6px">Compose a quotation, as ' + esc(supplier.unknown ? 'an outside supplier' : supplier.name) + '</div>' +
    '<div class="eyebrow" style="margin:6px 0 4px">Persona</div><div class="chips">' + personaBtns + '</div>' +
    '<div class="eyebrow" style="margin:10px 0 4px">Edge cases to plant</div><div class="stack" style="gap:3px">' + toggles + '</div>' +
    '<div class="row" style="margin-top:10px;gap:10px"><label class="f" style="flex:none"><span style="font-size:11px">Format</span>' + formatSel + '</label>' +
    '<button class="btn" data-act="sv-generate" style="align-self:flex-end">Generate</button></div>' +
    preview + '</div>';
}

A.svGenerate = function () {
  var m = /\/supplier\/([^/]+)\/([^/]+)/.exec(A.current()); if (!m) return;
  var rfq = A.rfqById(m[1]); var tabs = A.supplierTabs(rfq); var current = tabs.filter(function (t) { return t.key === m[2]; })[0] || tabs[0];
  var sv = A.svGet(rfq.id, current.supplier.id, current.key);
  var fmt = $('#sv-format') ? $('#sv-format').value : sv.format;
  var out = G.compose(rfq, current.supplier, sv.persona, sv.toggles, fmt, A.store.meta, S.buyer);
  A.svPreview[A.svKey(rfq.id, current.supplier.id)] = out;
  A.render();
};
A.svSend = function () {
  var m = /\/supplier\/([^/]+)\/([^/]+)/.exec(A.current()); if (!m) return;
  var rfq = A.rfqById(m[1]); var tabs = A.supplierTabs(rfq); var current = tabs.filter(function (t) { return t.key === m[2]; })[0] || tabs[0];
  var key = A.svKey(rfq.id, current.supplier.id);
  var pv = A.svPreview[key]; if (!pv) return;
  pv.email.subject = $('#sv-subject') ? $('#sv-subject').value : pv.email.subject;
  pv.email.from = $('#sv-from') ? $('#sv-from').value : pv.email.from;
  pv.email.body_raw = $('#sv-body') ? $('#sv-body').value : pv.email.body_raw;
  if (pv.email.attachments.length && $('#sv-att')) pv.email.attachments[0].transcript = $('#sv-att').value;
  pv.email.ref = pv.ref; pv.email.date = new Date().toISOString();
  A.composed.push(pv.email);
  delete A.svPreview[key];
  A.persistAll();
  A.toast('Sent to ' + S.buyer.name + '. Sync the inbox to receive it.');
  A.render();
};
A.svDiscard = function () {
  var m = /\/supplier\/([^/]+)\/([^/]+)/.exec(A.current()); if (!m) return;
  var rfq = A.rfqById(m[1]); var tabs = A.supplierTabs(rfq); var current = tabs.filter(function (t) { return t.key === m[2]; })[0] || tabs[0];
  delete A.svPreview[A.svKey(rfq.id, current.supplier.id)];
  A.render();
};
A.svLoadAll = function (rfqId) {
  var rfq = A.rfqById(rfqId); if (!rfq) return;
  var tabs = A.supplierTabs(rfq);
  tabs.forEach(function (t) {
    var sv = A.svGet(rfqId, t.supplier.id, t.key);
    var out = G.compose(rfq, t.supplier, sv.persona, sv.toggles, sv.format, A.store.meta, S.buyer);
    out.email.ref = out.ref;
    A.composed.push(out.email);
  });
  A.persistAll();
  A.toast('Four supplier replies written for ' + rfq.code + '. Sync the inbox to receive them.');
  A.render();
};
A.svAnswerFollowUp = function (replyId) {
  var rp = A.store.replies.filter(function (r) { return r.id === replyId; })[0]; if (!rp) return;
  var rfq = A.rfqById(rp.rfq_id); if (!rfq) return;
  var sv = A.svGet(rfq.id, rp.supplier_id);
  var supplier = A.supById(rp.supplier_id) || { id: rp.supplier_id, name: rp.supplier_name };
  var out = G.answerFollowUp(rfq, supplier, sv.persona, rp, A.store.meta, S.buyer);
  if (!out) { A.toast(current_persona_label(sv.persona) + ' does not reply to this follow-up.'); return; }
  out.email.ref = out.ref;
  A.composed.push(out.email);
  A.persistAll();
  A.toast('Follow-up written. Sync the inbox to receive it.');
  A.render();
};

/* ===================== quotations ===================== */
A.route(/^\/quotations$/, function () {
  var multi = A.store.rfqs.filter(function (r) { return A.isMultiLine(r); });
  return '<div class="page-head"><h1>Quotations</h1></div>' +
    '<p class="lede">Every line against every supplier. Chase what is missing, get the AI\'s best-value pick alongside the cheapest, and award per line.</p>' +
    (multi.length ? '<div class="stack">' + multi.map(function (rfq) {
      return '<div class="card"><div class="spread"><div><h3>' + esc(rfq.product) + '</h3><div class="muted" style="font-size:12px"><span class="tag">' + esc(rfq.code) + '</span> ' + rfqMeta(rfq) + '</div></div>' +
        '<a class="btn" href="#/quotations/' + rfq.id + '" style="text-decoration:none">Open</a></div></div>';
    }).join('') + '</div>' : '<div class="empty">No multi-line inquiries yet.</div>');
});

A.route(/^\/quotations\/(.+)$/, function (rfqId) {
  var rfq = A.rfqById(rfqId);
  if (!rfq) return '<div class="empty">No such inquiry.</div>';
  var res = PL.refreshEligibility(A.store, rfqId);
  var perLine = (res.perLine || []).filter(function (pl) { return pl.item; }).sort(function (a, b) { return a.item.line - b.item.line; });
  var headers = A.store.quote_headers.filter(function (h) { return h.rfq_id === rfqId; });
  var supplierIds = []; headers.forEach(function (h) { if (supplierIds.indexOf(h.supplier_id) === -1) supplierIds.push(h.supplier_id); });
  var supplierOf = function (id) { return A.supById(id) || { id: id, name: id || 'Unknown sender', unknown: !id }; };
  var awardsSug = A.awardsCache && A.awardsCache[rfqId];
  var awarded = A.store.awards[rfqId] || { lines: {} };

  var totalLines = R.rfqItems(rfq).length;
  var linesWithData = perLine.filter(function (pl) { return pl.quotes.some(function (q) { return !q.not_quoted; }); }).length;
  var eligibleLines = perLine.filter(function (pl) { return pl.eligible.length > 0; }).length;
  var awardedLines = Object.keys(awarded.lines).length;

  var head = '<div class="page-head"><div><a href="#/rfq/' + esc(rfqId) + '" style="font-size:12.5px">← ' + esc(rfq.code) + '</a>' +
    '<h1 style="margin-top:3px">Quotations · ' + esc(rfq.product) + '</h1></div>' +
    '<div class="row"><button class="btn" data-act="suggest-awards" data-rfq="' + esc(rfqId) + '"' + (A.running['aw_' + rfqId] ? ' disabled' : '') + '>' + (A.running['aw_' + rfqId] ? 'Working…' : awardsSug ? 'Run again' : 'Suggest awards') + '</button></div></div>' +
    '<div class="row" style="gap:6px;margin-bottom:14px;font-size:12px">' +
      '<span class="chip chip-mute">' + totalLines + ' lines</span>' +
      '<span class="chip chip-mute">' + linesWithData + ' with a reply</span>' +
      '<span class="chip ' + (eligibleLines ? 'chip-pass' : 'chip-mute') + '">' + eligibleLines + ' with an eligible quote</span>' +
      '<span class="chip ' + (awardedLines ? 'chip-info' : 'chip-mute') + '">' + awardedLines + ' of ' + totalLines + ' awarded</span></div>';

  if (A.running['aw_' + rfqId]) {
    var run = A.running['aw_' + rfqId];
    return head + '<div class="card"><div class="row"><span class="spin"></span><span class="chip chip-info">Claude is ranking the contested lines</span></div>' +
      (run.text ? '<pre class="reply-box" style="margin-top:10px;max-height:220px;font-size:11px">' + esc(run.text.slice(-2000)) + '</pre>' : '') + '</div>';
  }

  var matrix = quotationsMatrix(rfq, perLine, headers, supplierIds, supplierOf, awardsSug, awarded);
  var summary = awardsSug ? awardsSummary(rfq, perLine, awardsSug, supplierOf) : '';
  return head + matrix + summary;
});

function quotationsMatrix(rfq, perLine, headers, supplierIds, supplierOf, awardsSug, awarded) {
  if (!supplierIds.length) return '<div class="empty">No supplier replies yet. <a href="#/supplier/' + esc(rfq.id) + '/A">Compose one in Supplier view</a>.</div>';
  var cols = supplierIds.map(supplierOf);
  var byLineSupplier = {};
  perLine.forEach(function (pl) {
    pl.quotes.forEach(function (q) { byLineSupplier[pl.item.line + ':' + q.supplier_id] = q; });
  });
  function cell(q) {
    if (!q) return '<td><span class="muted">—</span></td>';
    if (q.not_quoted) return '<td><span class="muted" title="Not quoted by this supplier">not quoted</span></td>';
    var n = q.norm;
    var price = n.usd_at_target && n.usd_at_target.v != null ? money(n.usd_at_target.v) : '<span class="muted">no price</span>';
    var badges = [];
    if ((q.gaps || []).some(function (g) { return g.field === 'price' && g.kind === 'partial'; })) badges.push('range');
    if (n.moq_pcs && n.moq_pcs.v == null) badges.push('MOQ?');
    var st = q.eligibility ? q.eligibility.status : 'parked';
    if (st === 'needs_review') badges.push('review');
    else if (st === 'disqualified') badges.push('disqualified');
    var filled = q.filled && (q.filled.price || q.filled.moq) ? ' title="Filled from a follow-up"' : '';
    return '<td' + filled + ' class="' + (st === 'disqualified' ? 'muted' : '') + '"><span class="num">' + price + '</span>' +
      (badges.length ? '<div class="row" style="gap:3px;margin-top:2px">' + badges.map(function (b) { return '<span class="tag" style="font-size:9.5px">' + b + '</span>'; }).join('') + '</div>' : '') +
      (st !== 'disqualified' && st !== 'not_quoted' ? '<button class="btn ghost sm" style="margin-top:3px;padding:1px 6px;font-size:10px" data-act="ask-line" data-rfq="' + esc(rfq.id) + '" data-sup="' + esc(q.supplier_id) + '" data-line="' + q.line + '">Ask</button>' : '') + '</td>';
  }
  return '<div class="card scroll-x"><table class="qtable" style="min-width:' + (280 + cols.length * 170) + 'px"><thead><tr><th style="position:sticky;left:0;background:var(--surface)">Line</th>' +
    cols.map(function (s) { return '<th>' + esc(s.name.split(' ').slice(0, 2).join(' ')) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    perLine.map(function (pl) {
      var it = pl.item;
      var awardEntry = awarded.lines[it.line];
      var sug = awardsSug && awardsSug.lines[it.line];
      return '<tr><td style="position:sticky;left:0;background:var(--surface)"><b>' + it.line + '</b> <span class="mono muted" style="font-size:10.5px">' + esc(it.sku) + '</span>' +
        '<div class="muted" style="font-size:11px">' + esc(it.product) + '</div><div class="muted" style="font-size:10.5px">' + n0(it.qty) + ' ' + esc(it.unit) + ' · ' + it.target_usd_fob.lo.toFixed(2) + '–' + it.target_usd_fob.hi.toFixed(2) + '</div>' +
        (pl.cheapest ? '<div style="font-size:10.5px;margin-top:3px">cheapest: ' + esc((supplierOf(pl.cheapest.supplier_id) || {}).name || '').split(' ')[0] + '</div>' : '') +
        (awardEntry ? '<div class="chip chip-pass" style="font-size:9.5px;margin-top:3px">awarded</div>' : sug ? '<select data-change="award-pick" data-rfq="' + esc(rfq.id) + '" data-line="' + it.line + '" style="margin-top:4px;font-size:10.5px;padding:1px 4px">' +
          '<option value="">choose…</option>' + pl.eligible.map(function (q) { return '<option value="' + q.id + '">' + esc((supplierOf(q.supplier_id) || {}).name || '').split(' ')[0] + '</option>'; }).join('') + '</select>' : '') + '</td>' +
        cols.map(function (s) { return cell(byLineSupplier[it.line + ':' + s.id]); }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
}

function awardsSummary(rfq, perLine, awardsSug, supplierOf) {
  var bySupplier = {};
  perLine.forEach(function (pl) {
    var s = awardsSug.lines[pl.item.line];
    if (!s) return;
    [['cheapest_id', 'cheapest'], ['best_value_id', 'best_value']].forEach(function (pair) {
      var qid = s[pair[0]]; if (!qid) return;
      var q = pl.quotes.filter(function (x) { return x.id === qid; })[0]; if (!q) return;
      var key = q.supplier_id + ':' + pair[1];
      bySupplier[key] = bySupplier[key] || { supplier: supplierOf(q.supplier_id), lens: pair[1], lines: 0, total: 0 };
      bySupplier[key].lines++; bySupplier[key].total += (q.norm.usd_at_target.v || 0) * pl.item.qty;
    });
  });
  var rows = Object.keys(bySupplier).map(function (k) { return bySupplier[k]; });
  return '<div class="card" style="margin-top:14px"><div class="spread" style="margin-bottom:8px"><div><div class="eyebrow">Award summary</div><h3>Lines and total per supplier, by lens</h3></div>' +
    '<div class="row"><button class="btn ghost sm" data-act="award-bulk" data-rfq="' + esc(rfq.id) + '" data-lens="cheapest">Award all Cheapest</button>' +
    '<button class="btn" data-act="award-bulk" data-rfq="' + esc(rfq.id) + '" data-lens="best_value">Award all Best value</button></div></div>' +
    '<div class="scroll-x"><table class="matrix"><thead><tr><th>Supplier</th><th>Lens</th><th>Lines</th><th>Total (covered lines)</th></tr></thead><tbody>' +
    rows.map(function (r) { return '<tr><td>' + esc(r.supplier.name) + '</td><td>' + lane(r.lens === 'cheapest' ? 'rule' : 'ai') + ' ' + (r.lens === 'cheapest' ? 'Cheapest' : 'Best value') + '</td><td>' + r.lines + '</td><td class="num">USD ' + r.total.toLocaleString(undefined, { maximumFractionDigits: 0 }) + '</td></tr>'; }).join('') +
    '</tbody></table></div>' +
    (awardsSug.questions_for_buyer && awardsSug.questions_for_buyer.length ? '<div class="hr"></div><div class="eyebrow" style="margin-bottom:4px">Questions back to us</div><ul style="margin:0;padding-left:16px;font-size:12.5px">' + awardsSug.questions_for_buyer.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' : '') +
    '</div>';
}

A.suggestAwards = function (rfqId) {
  A.running['aw_' + rfqId] = { text: '' };
  A.render();
  var ad = A.adapters(A.aiReady ? 'ai' : 'reference', { onText: function (u) { A.running['aw_' + rfqId].text = u.text; var b = $('#view pre'); if (b) b.textContent = u.text.slice(-2000); } });
  PL.suggestAwards(A.store, rfqId, ad).then(function (res) {
    delete A.running['aw_' + rfqId];
    A.awardsCache = A.awardsCache || {}; A.awardsCache[rfqId] = res;
    A.persistAll(); A.render();
  }, function () { delete A.running['aw_' + rfqId]; A.render(); });
};
A.askLine = function (rfqId, supplierId, line) {
  var ad = A.adapters(A.aiReady ? 'ai' : 'reference', {});
  PL.draftLineChase(A.store, rfqId, supplierId, [line], ad).then(function (rp) {
    if (!rp) { A.toast('Nothing to chase on this line.'); return; }
    A.persistAll();
    A.toast('Chase drafted for line ' + line + '. Approve it in Your queue → #/reviews.');
    A.render();
  });
};

/* ===================== events ===================== */
document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-act]');
  if (!t) return;
  var act = t.getAttribute('data-act');

  if (act === 'open' || act === 'process') { ev.preventDefault(); A.processSample(t.getAttribute('data-id')); return; }
  if (act === 'filter') { A.filter = t.getAttribute('data-f') || null; A.render(); return; }
  if (act === 'sync') { A.syncInbox(); return; }
  if (act === 'compose-open') { A.composeOpen(); return; }
  if (act === 'compose-close') { $('#compose-slot').innerHTML = ''; return; }
  if (act === 'compose-save') { A.composeSave(); return; }
  if (act === 'compose-tpl-body') { A.composeTemplate('body'); return; }
  if (act === 'compose-tpl-att') { A.composeTemplate('att'); return; }
  if (act === 'runall') { A.runAll(); return; }
  if (act === 'runcompare') { A.runCompare(t.getAttribute('data-rfq')); return; }
  if (act === 'cancelcompare') {
    var k = 'cmp_' + t.getAttribute('data-rfq');
    if (A.running[k] && A.running[k].ctl) A.running[k].ctl.abort();
    delete A.running[k]; A.render(); return;
  }
  if (act === 'tab') {
    var want = t.getAttribute('data-t');
    A.$$('.tabs:not(.top) button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-t') === want)); });
    A.$$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== want; });
    return;
  }
  if (act === 'etab') {
    var w = t.getAttribute('data-t');
    A.$$('.tabs.top button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-t') === w)); });
    A.$$('[data-epanel]').forEach(function (p) { p.hidden = p.getAttribute('data-epanel') !== w; });
    return;
  }
  if (act === 'download') {
    var em = A.emailById(t.getAttribute('data-em')) || A.sampleById(t.getAttribute('data-em'));
    var a = em && em.attachments && em.attachments[parseInt(t.getAttribute('data-i'), 10)];
    if (!a) return;
    var nm = a.name, data = a.blob || a.transcript || '';
    if (!a.blob) nm = nm.replace(/\.[^.]+$/, '') + '.txt';
    A.saveFile(nm, data);
    return;
  }
  if (act === 'new-rfq') { A.draft = null; A.go('#/rfq/new'); return; }
  if (act === 'draft-example') { A.draft = exampleDraft(); A.render(); return; }
  if (act === 'draft-reset') { A.draft = newDraft(); A.render(); return; }
  if (act === 'cert') {
    readDraftForm();
    var c = t.getAttribute('data-c'), list = A.draft.required_certs, i = list.indexOf(c);
    if (i > -1) list.splice(i, 1); else list.push(c);
    t.setAttribute('aria-pressed', String(i === -1)); return;
  }
  if (act === 'draft-add-q') {
    readDraftForm();
    var v = $('#d-newq').value.trim(); if (!v) { A.toast('Type the question first.'); return; }
    A.draft.custom_questions.push({ text: v, required: true }); A.render(); return;
  }
  if (act === 'draft-rm-q') { readDraftForm(); A.draft.custom_questions.splice(parseInt(t.getAttribute('data-i'), 10), 1); A.render(); return; }
  if (act === 'draft-add-sq') {
    readDraftForm();
    var sq = A.draft.check.suggested_questions[parseInt(t.getAttribute('data-i'), 10)];
    if (sq && !A.draft.custom_questions.some(function (x) { return x.text === sq.text; })) A.draft.custom_questions.push({ text: sq.text, required: true });
    A.render(); return;
  }
  if (act === 'draft-check') { A.draftCheck(); return; }
  if (act === 'draft-step3') { readDraftForm(); A.draft.step = 3; A.render(); return; }
  if (act === 'draft-back') { A.draft.step = 2; A.render(); return; }
  if (act === 'draft-submit') { A.draftSubmit(); return; }
  if (act === 'reply-draft') { A.draftReplyFor(t.getAttribute('data-id')); return; }
  if (act === 'reply-send') {
    var rid = t.getAttribute('data-rp'), rp = A.store.replies.filter(function (r) { return r.id === rid; })[0];
    if (!rp) return;
    var ta = $('#rp-body-' + rid); if (ta && ta.value.trim()) rp.body = ta.value.trim();
    PL.sendReply(A.store, rid, 'you');
    if (rp.rfq_id) PL.refreshEligibility(A.store, rp.rfq_id);
    A.persistAll(); A.toast('Sent to ' + rp.to + '.'); A.render(); return;
  }
  if (act === 'reply-discard') {
    var did = t.getAttribute('data-rp');
    A.store.replies = A.store.replies.filter(function (r) { return r.id !== did; });
    if (A.db) A.db.collection('replies').doc(did).delete().catch(function () {});
    A.persistAll(); A.toast('Draft discarded.'); A.render(); return;
  }
  if (act === 'resolve') {
    var id = t.getAttribute('data-rv'), mode = t.getAttribute('data-mode');
    var reasonEl = $('#rvr-' + id), valEl = $('#rvv-' + id);
    var field = t.getAttribute('data-field') || null;
    var value;
    if (mode === 'edit') {
      if (!valEl || !valEl.value.trim()) { A.toast('Type the corrected value first.'); return; }
      value = valEl.value.trim();
      if (field === 'usd_at_target' || field === 'moq_pcs') {
        var nv = parseFloat(value.replace(/[^\d.]/g, ''));
        if (isNaN(nv)) { A.toast('That is not a number.'); return; }
        value = nv;
      } else if (field === 'certs_canon') value = value.split(/[,\s]+/).filter(Boolean);
    }
    var rv = PL.resolveReview(A.store, id, {
      action: mode, field: field, value: value,
      reason: (reasonEl && reasonEl.value.trim()) || (mode === 'reject' ? 'not a problem here' : 'confirmed as read')
    });
    if (rv && field === 'usd_at_target' && mode === 'edit') {
      var qq = A.store.quotes.filter(function (x) { return x.id === rv.quote_id; })[0];
      if (qq && rv.code === 'INCOTERM_MISMATCH') qq.overrides.incoterm = { v: 'FOB', by: 'you', at: new Date().toISOString(), reason: 'normalised with the price' };
      if (qq) PL.refreshEligibility(A.store, qq.rfq_id);
    }
    PL.rerunEvals(A.store, A.expected);
    A.persistAll();
    A.toast('Answered. The fixed checks ran again.');
    A.render();
    return;
  }
  if (act === 'award') {
    var rfq = A.rfqById(t.getAttribute('data-rfq'));
    var sel = $('#award-sel-' + rfq.id);
    var qid = (sel && sel.value) || A.pick[rfq.id];
    if (!qid) { A.toast('Choose a quote first.'); return; }
    var cmp = A.store.comparisons.filter(function (c) { return c.rfq_id === rfq.id && c.status !== 'failed'; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0];
    var via = 'manual';
    if (cmp && cmp.ai) ['recommended', 'best_value', 'cheapest'].forEach(function (k) { if (via === 'manual' && cmp.ai[k] && cmp.ai[k].id === qid) via = k; });
    rfq.status = 'awarded'; rfq.winner_quote_id = qid; rfq.awarded_at = new Date().toISOString(); rfq.awarded_via = via;
    A.store.reviews.forEach(function (r) {
      if (r.rfq_id === rfq.id && r.code === 'WINNER_APPROVAL' && r.status === 'open') PL.resolveReview(A.store, r.id, { action: 'accept', reason: 'awarded via ' + via });
    });
    PL.log(A.store, rfq.id + '_award', { t: new Date().toISOString(), lane: 'human', step: 'WINNER_APPROVAL', decision: 'AWARDED', detail: qid + ' via ' + via });
    A.persistAll();
    A.toast('Awarded.');
    A.render();
    return;
  }
  if (act === 'reset') {
    if (!window.confirm('Clear every read, quote, question, reply and ranking from this session, and remove inquiries you created? The seeded inquiries and emails stay.')) return;
    A.wipeDb().then(function () {
      A.seedFresh(); A.composed = []; A.filter = null; A.inbox.seen = {}; A.pick = {}; A.sv = {}; A.svPreview = {}; A.awardsCache = {};
      A.toast('Cleared.'); A.go('#/inbox'); A.render();
    });
    return;
  }
  if (act === 'lfilter') { A.labelFilter = t.getAttribute('data-lf') || null; A.render(); return; }
  if (act === 'pauseread') { A.togglePauseRead(); return; }
  if (act === 'draft-example-lines') { A.draft = multiLineExampleDraft(); A.render(); return; }
  /* supplier view */
  if (act === 'sv-persona') {
    var m1 = /\/supplier\/([^/]+)\/([^/]+)/.exec(A.current()); if (!m1) return;
    var pKey = t.getAttribute('data-p');
    A.sv[A.svKey(m1[1], svCurrentSupplierId(m1[1], m1[2]))] = { persona: pKey, toggles: Object.assign({}, G.PERSONAS[pKey].toggles), format: G.PERSONAS[pKey].format };
    A.render(); return;
  }
  if (act === 'sv-generate') { A.svGenerate(); return; }
  if (act === 'sv-send') { A.svSend(); return; }
  if (act === 'sv-discard') { A.svDiscard(); return; }
  if (act === 'sv-loadall') { A.svLoadAll(t.getAttribute('data-rfq')); return; }
  if (act === 'sv-answer') { A.svAnswerFollowUp(t.getAttribute('data-rp')); return; }
  /* quotations */
  if (act === 'suggest-awards') { A.suggestAwards(t.getAttribute('data-rfq')); return; }
  if (act === 'ask-line') { A.askLine(t.getAttribute('data-rfq'), t.getAttribute('data-sup'), parseInt(t.getAttribute('data-line'), 10)); return; }
  if (act === 'award-bulk') {
    var brfq = t.getAttribute('data-rfq'), blens = t.getAttribute('data-lens');
    var bsug = A.awardsCache && A.awardsCache[brfq];
    if (!bsug) { A.toast('Run Suggest awards first.'); return; }
    if (!window.confirm('Award every eligible line to its ' + (blens === 'cheapest' ? 'cheapest' : 'best-value') + ' quote? Lines you already awarded by hand are kept.')) return;
    PL.awardBulk(A.store, brfq, blens, bsug, 'you');
    A.persistAll(); A.toast('Bulk award applied.'); A.render(); return;
  }
});

function svCurrentSupplierId(rfqId, tabKey) {
  var rfq = A.rfqById(rfqId); if (!rfq) return null;
  var t = A.supplierTabs(rfq).filter(function (x) { return x.key === tabKey; })[0];
  return t ? t.supplier.id : null;
}

document.addEventListener('change', function (ev) {
  var t = ev.target.closest('[data-change]');
  if (!t) return;
  var what = t.getAttribute('data-change');
  if (what === 'upload') { A.composeUpload(t); return; }
  if (what === 'autoread') { A.inbox.autoRead = t.checked; return; }
  if (what === 'dist') { A.draft.distribution = t.value; if (t.value === 'chosen' && !A.draft.recipients.length) A.draft.recipients = A.store.suppliers.filter(function (s) { return s.verified; }).map(function (s) { return s.id; }); A.render(); return; }
  if (what === 'recip') {
    var list = A.draft.recipients, i = list.indexOf(t.value);
    if (t.checked && i === -1) list.push(t.value); else if (!t.checked && i > -1) list.splice(i, 1);
    var btn = $('[data-act="draft-submit"]'); if (btn) btn.disabled = !list.length;
    var note = btn && btn.parentNode.querySelector('.muted'); if (note) note.innerHTML = list.length + ' supplier' + (list.length === 1 ? '' : 's') + ' will receive the email. Their replies then arrive in <b>Emails</b>.';
    return;
  }
  if (what === 'pick' || what === 'pick-sel') {
    var rid = t.getAttribute('data-rfq'); A.pick[rid] = t.value;
    var sel = $('#award-sel-' + rid); if (sel) sel.value = t.value;
    A.$$('input[name="pick-' + rid + '"]').forEach(function (r) { r.checked = r.value === t.value; r.closest('.lens').classList.toggle('picked', r.checked); });
    var ab = $('[data-act="award"]'); if (ab) ab.disabled = false;
    return;
  }
  if (what === 'multiline') { readDraftForm(); A.draft.multiLine = t.checked; if (t.checked && !A.draft.items.length) A.draft.items = S.sampleLines30.map(function (it) { return Object.assign({}, it); }); A.render(); return; }
  if (what === 'sv-toggle') {
    var m2 = /\/supplier\/([^/]+)\/([^/]+)/.exec(A.current()); if (!m2) return;
    var sv2 = A.svGet(m2[1], svCurrentSupplierId(m2[1], m2[2]), m2[2]);
    sv2.toggles[t.getAttribute('data-k')] = t.checked;
    return;
  }
  if (what === 'award-pick') {
    var arfq = t.getAttribute('data-rfq'), aline = parseInt(t.getAttribute('data-line'), 10);
    if (!t.value) return;
    PL.awardLine(A.store, arfq, aline, t.value, 'manual', 'you');
    A.persistAll(); A.toast('Line ' + aline + ' awarded.'); A.render();
    return;
  }
});
})();
