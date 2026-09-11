/* Quote Desk — deterministic generator lane.
   Readiness rules for a new enquiry, edge-case supplier replies for it (with a
   reference read of each so the demo works without Claude), and reply drafts. */
(function (root) {
'use strict';
var R = root.RULES;

function F(v, u, c, ev, src) { return { v: v, u: u || null, c: c == null ? 0.94 : c, ev: ev || null, src: src || 'body' }; }
function m2(v) { return Number(v).toFixed(2); }
function r2(v) { return Math.round(v * 100) / 100; }
function fmtQty(n) { return Number(n).toLocaleString('en-US'); }
function plural(u) { return u === 'pc' ? 'pcs' : u + 's'; }

/* ---- readiness ------------------------------------------------------- */

var Q_SUGGEST = [
  { key: 'carton', text: 'Carton dimensions, pieces per carton and gross weight?', why: 'Needed to estimate freight and warehouse handling.' },
  { key: 'sample', text: 'Sample cost and sample lead time, and is it refunded on order?', why: 'Samples gate the decision; unpriced samples stall the timeline.' },
  { key: 'tooling', text: 'Any tooling, mould or plate charges, and who owns the tooling?', why: 'One-off costs change the real unit price at your quantity.' },
  { key: 'freight', text: 'Sea and air freight estimate to the destination port for the target quantity?', why: 'Lets the team compare landed cost, not just FOB.' },
  { key: 'valid', text: 'How long is the quotation valid?', why: 'Without validity a quote can be withdrawn before award.' },
  { key: 'stock', text: 'Is this an off-the-shelf item or custom manufactured to our specification?', why: 'Stock items usually cannot carry your specification changes.' },
  { key: 'payment', text: 'Payment terms you accept for a first order?', why: 'Deposit size and timing affect cash flow and risk.' },
  { key: 'certificate', text: 'Which certificates do you hold for this product, with certificate numbers?', why: 'A number lets us verify; a name alone does not.' }
];

function readinessRules(d) {
  var items = [], score = 100;
  function miss(field, label, sev, why, suggestion) {
    items.push({ field: field, label: label, severity: sev, why: why, suggestion: suggestion || '' });
    score -= sev === 'must' ? 18 : 7;
  }
  var hasLines = Array.isArray(d.items) && d.items.length > 1;
  if (!d.product || d.product.trim().length < 4) miss(hasLines ? 'title' : 'product', hasLines ? 'Title' : 'Product name', 'must',
    hasLines ? 'A name for the whole range helps suppliers and you tell inquiries apart.' : 'Suppliers cannot quote an unnamed item.',
    hasLines ? 'Name the range, e.g. "Private-label kitchen and dining range".' : 'Name the product the way a factory would list it.');
  if (!d.spec_summary || d.spec_summary.trim().length < 40) miss('spec_summary', 'Specification', 'must', 'A one-line spec gets a one-line quote. Material, size, finish and packaging decide the price.', 'Add material, dimensions, finish, print and packaging.');

  if (hasLines) {
    var lines = d.items;
    var badLines = lines.filter(function (it) { return !(it.qty > 0) || !(it.floor > 0 && it.ceiling >= it.floor); });
    if (badLines.length) miss('lines', 'Line list', 'must', badLines.length + ' of ' + lines.length + ' line(s) are missing a quantity or a price band.', 'Fill in a quantity and a floor/ceiling price for every line.');
    var skus = lines.map(function (it) { return (it.sku || '').toUpperCase(); }).filter(Boolean);
    var dupSkus = skus.filter(function (s, i) { return skus.indexOf(s) !== i; });
    if (dupSkus.length) miss('lines', 'Duplicate SKUs', 'must', 'Two or more lines share the same SKU (' + uniq2(dupSkus).join(', ') + '), so a supplier quote could not tell them apart.', 'Give every line a unique SKU.');
    var thinSpec = lines.filter(function (it) { return !it.spec || it.spec.trim().length < 8; });
    if (thinSpec.length > lines.length / 3) miss('lines', 'Line specifications', 'should', thinSpec.length + ' of ' + lines.length + ' lines have little or no spec of their own.', 'Add a short spec to each line: material, size, finish.');
  } else {
    if (!(d.target_qty > 0)) miss('target_qty', 'Quantity', 'must', 'Price depends on quantity more than anything else.', 'State the quantity you actually intend to order.');
    if (!d.tier_qtys || d.tier_qtys.length < 2) miss('tier_qtys', 'Price tiers', 'should', 'Asking for two or three quantities shows where the price breaks are.', 'Ask for prices at half, target and double quantity.');
    var b = d.target_usd_fob || {};
    if (!(b.lo > 0 && b.hi >= b.lo)) miss('target_usd_fob', 'Target price band', 'must', 'The comparison filters on this band. Without it nothing can be ruled in or out.', 'Set a floor and a ceiling in USD FOB China.');
  }

  if (!d.required_certs || !d.required_certs.length) miss('required_certs', 'Required certifications', 'should', 'With no certificate named, every quote passes that check by default.', 'Name the certificates your destination market requires.');
  if (d.pl_required == null) miss('pl_required', 'Private label', 'must', 'Whether your logo goes on the product changes the minimum order and the price.', 'Say yes or no.');
  if (d.custom_required == null) miss('custom_required', 'Stock or custom', 'should', 'Stock items cannot carry specification changes; suppliers need to know which you want.', 'Say whether an off-the-shelf item is acceptable.');
  if (!(d.max_lead_days > 0)) miss('max_lead_days', 'Latest acceptable lead time', 'should', 'Suppliers quote faster when they know the deadline.', 'Give the maximum production days you can accept.');
  if (!d.dest_port) miss('dest_port', 'Destination port', 'should', 'Freight questions cannot be answered without a destination.', 'Name the port or city.');
  if (!d.custom_questions || !d.custom_questions.length) miss('custom_questions', 'Questions to the supplier', 'should', 'The unanswered-question check has nothing to check against.', 'Add the questions whose answers decide the award.');
  var have = (d.custom_questions || []).map(function (q) { return String(q.text || '').toLowerCase(); }).join(' ');
  var suggested = Q_SUGGEST.filter(function (s) { return have.indexOf(s.key) === -1; }).slice(0, 4)
    .map(function (s) { return { text: s.text, why: s.why }; });
  return { score: Math.max(0, score), ready: !items.some(function (i) { return i.severity === 'must'; }), missing: items, suggested_questions: suggested, spec_gaps: [], source: 'rule' };
}
function uniq2(a) { var o = {}, r = []; a.forEach(function (x) { if (!o[x]) { o[x] = 1; r.push(x); } }); return r; }

/* ---- edge-case supplier replies -------------------------------------- */

function tiersFor(rfq) {
  var t = (rfq.tier_qtys || []).slice().sort(function (a, b) { return a - b; });
  if (t.length >= 3) return t.slice(0, 3);
  var q = rfq.target_qty;
  return [Math.round(q / 2), q, q * 2];
}
function personFor(sup, i) {
  var names = ['Lily Zhang', 'Jason Wu', 'Cindy Huang', 'Michael Lin', 'Vicky Chen', 'Kevin Zhou', 'Nancy Liu', 'Peter Yang'];
  return names[(sup.name.length + i) % names.length];
}
function addrFor(sup, person) {
  return person.split(' ')[0].toLowerCase() + '@' + (sup.domains && sup.domains[0] || 'example.com');
}
function answerFor(q, i) {
  var t = q.text.toLowerCase();
  if (/carton|pack/.test(t)) return '40 pcs per carton, 60 x 40 x 35 cm, 12 kg gross';
  if (/sample/.test(t)) return 'sample USD 30, 7 days, refunded on your first order';
  if (/tool|mould|mold|plate/.test(t)) return 'no tooling charge for the standard item; custom shapes USD 800 one time';
  if (/freight|sea|air/.test(t)) return 'sea about USD 900 per 20GP, air about USD 5.00 per kg, for reference only';
  if (/valid/.test(t)) return '30 days';
  if (/stock|shelf|custom/.test(t)) return 'custom made to your drawing, not a stock item';
  if (/pay/.test(t)) return '30% deposit, 70% before shipment';
  if (/cert/.test(t)) return 'yes, copies of the reports can be sent on request';
  if (/colou?r|pantone/.test(t)) return 'yes, colour matching is possible, small matching fee applies';
  if (/battery|usb|power/.test(t)) return 'USB powered only, no internal battery';
  if (/artwork|file|format/.test(t)) return 'PDF or AI with 3 mm bleed';
  return 'yes, confirmed, details to follow with the sample';
}

function generateEdgeCases(rfq, suppliers, meta, buyer) {
  var recips = (rfq.recipients || []).map(function (id) { return suppliers.filter(function (s) { return s.id === id; })[0]; }).filter(Boolean);
  var lo = rfq.target_usd_fob.lo, hi = rfq.target_usd_fob.hi, mid = (lo + hi) / 2;
  var unit = rfq.unit || 'pc', U = plural(unit), qty = rfq.target_qty, tiers = tiersFor(rfq);
  var certs = rfq.required_certs || [];
  var certLine = certs.length ? certs.join(' and ') : 'ISO 9001';
  var day0 = rfq.sent_at || meta.demo_now;
  var qs = rfq.custom_questions || [];
  var code = rfq.code, prod = rfq.product;
  var out = [];
  var seq = 0;
  function id() { seq++; return 'em_g_' + rfq.id.replace('rfq_', '') + '_' + seq; }
  function custom(prefix) {
    return qs.map(function (q, i) { return { qid: q.qid, v: answerFor(q, i), c: 0.92, ev: prefix + (i + 1) + ': ' + answerFor(q, i), src: 'body' }; });
  }
  function qLines(prefix) { return qs.map(function (q, i) { return prefix + (i + 1) + ': ' + answerFor(q, i); }).join('\n'); }

  /* 1 clean inline */
  if (recips[0]) {
    var s = recips[0], p = personFor(s, 1), a = addrFor(s, p);
    var p1 = m2(mid * 1.04), p2 = m2(mid * 0.97), p3 = m2(mid * 0.90);
    var t1 = fmtQty(tiers[0]) + ' - ' + fmtQty(tiers[1] - 1) + ' ' + U + ': USD ' + p1 + ' / ' + unit;
    var t2 = fmtQty(tiers[1]) + ' - ' + fmtQty(tiers[2] - 1) + ' ' + U + ': USD ' + p2 + ' / ' + unit;
    var t3 = fmtQty(tiers[2]) + ' ' + U + ' and above: USD ' + p3 + ' / ' + unit;
    var moqL = 'MOQ: ' + fmtQty(tiers[0]) + ' ' + U;
    var leadL = 'Production lead time: 25 days after deposit';
    var validDate = R.addDays(day0, 40);
    var validL = 'Quotation valid until ' + validDate;
    var payL = 'Payment: 30% T/T deposit, 70% before shipment';
    var certL = 'Certification: ' + certs.map(function (c, i) { return c + ' report no. ' + c.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase() + '-2025-' + (4100 + i * 37); }).join(', ') + ', issued by SGS';
    var plL = 'Private label: yes, we do OEM, your logo on the product and on the box, no tooling charge';
    var stockL = 'Product: custom made to your specification, not a stock item';
    var sampleL = 'Sample: USD 30 per ' + unit + ', 7 days, refunded on your first bulk order';
    var body = 'Dear ' + buyer.name + ',\n\nThank you for your enquiry ' + code + '. Our quotation for the ' + prod + ' follows.\n\nUnit price, FOB Shenzhen, USD:\n' + t1 + '\n' + t2 + '\n' + t3 + '\n\n' + moqL + '\n' + leadL + '\n' + validL + '\n' + payL + '\n\n' + certL + '\n' + plL + '\n' + stockL + '\n' + sampleL + '\n\n' + qLines('Q') + '\n\nBest regards,\n' + p + ' | Sales Manager\n' + s.name;
    out.push({
      id: id(), sample_id: null, generated: true, supplier_id: s.id, rfq_id: rfq.id, format: 'inline',
      label: 'Complete inline quote', blurb: 'Every question answered, code in subject. Should produce no highlights and no questions.',
      tags: ['clean', 'generated'], planted: [], from_name: p, from: a, to: buyer.email, date: R.addDays(day0, 3) + 'T03:10:00Z',
      subject: 'Re: ' + code + ' ' + prod + ' — quotation', body_raw: body, attachments: [],
      expected: { kind: 'quote', rfq_code: code, fields: { price_at_target_usd: Number(p2), moq_pcs: tiers[0], certs_canon: certs.slice(), pl: rfq.pl_required ? 'yes' : 'n/a' }, gaps: [], gates: [], eligibility_before_review: 'eligible' },
      ref: { sv: 1, kind: 'quote', lang: ['en'], supplier: { name: F(s.name, null, 0.97, s.name), person: F(p, null, 0.96, p + ' | Sales Manager'), role: s.role },
        items: [{ i: 1, rfq_code: code, c: 0.98, product: F(prod, null, 0.95, 'quotation for the ' + prod), f: {
          price_tiers: F([{ qmin: tiers[0], qmax: tiers[1] - 1, p: Number(p1), qu: unit }, { qmin: tiers[1], qmax: tiers[2] - 1, p: Number(p2), qu: unit }, { qmin: tiers[2], qmax: null, p: Number(p3), qu: unit }], 'USD/' + unit, 0.96, t2),
          currency: F('USD', null, 0.97, 'Unit price, FOB Shenzhen, USD:'),
          price_basis: F({ incoterm: 'FOB', place: 'Shenzhen', incl_freight: false }, null, 0.96, 'FOB Shenzhen'),
          moq: F({ n: tiers[0], u: U, pack: 40 }, U, 0.96, moqL),
          lead_time: F({ lo: 25, hi: 25, u: 'days', from: 'deposit' }, 'days', 0.95, leadL),
          validity: F({ until: validDate }, null, 0.95, validL),
          certs: F(certs.map(function (c) { return { name: c, canon: R.canonCert(c) || c, scope: 'product', doc: true }; }), null, 0.94, certL.slice(0, 118)),
          private_label: F({ ans: 'yes', cond: null }, null, 0.96, plL.slice(0, 118)),
          stock_type: F('custom', null, 0.93, stockL),
          sample: F({ cost: 30, cur: 'USD', days: 7, refundable: true }, null, 0.94, sampleL),
          payment: F({ terms: '30% T/T deposit, 70% before shipment' }, null, 0.95, payL),
          carton: F({ pcs: 40, l_cm: 60, w_cm: 40, h_cm: 35, gw_kg: 12 }, null, 0.8, null),
          custom: custom('Q')
        } }], gaps: [], flags: [], needs_human: [], assumed: [] }
    });
  }

  /* 2 pdf conflict */
  if (recips[1]) {
    var s2 = recips[1], p2n = personFor(s2, 2), a2 = addrFor(s2, p2n);
    var bodyPrice = m2(mid * 0.99), pdfPrice = m2(Math.min(hi * 1.06, mid * 1.12));
    var pdfCerts = certs.length > 1 ? certs.slice(0, 1) : certs;
    var bodyL = 'In short: we can do USD ' + bodyPrice + ' per ' + unit + ' at ' + fmtQty(qty) + ' ' + U + ', FOB Ningbo, MOQ ' + fmtQty(tiers[0]) + ' ' + U + ', 30 days production.';
    var pdfRow = '  ' + fmtQty(tiers[1]) + ' - ' + fmtQty(tiers[2] - 1) + '    ' + pdfPrice + '                  FOB Ningbo';
    var pdfCertL = 'Certification       ' + (pdfCerts.join(', ') || 'ISO 9001') + ' — report available on request';
    var transcript = '[PDF TRANSCRIPT — 1 page, text layer extracted]\n\n' + s2.name.toUpperCase() + '\nQUOTATION       No. QT-2026-' + (2000 + seq) + '      Date: ' + R.addDays(day0, 4) + '\n\nTo: ' + buyer.name + '            Ref: ' + code + '\n\nItem: ' + prod + '\n\n  QTY (' + U + ')        UNIT PRICE (USD)      TERM\n  ' + fmtQty(tiers[0]) + ' - ' + fmtQty(tiers[1] - 1) + '    ' + m2(mid * 1.18) + '                  FOB Ningbo\n' + pdfRow + '\n  ' + fmtQty(tiers[2]) + ' +          ' + m2(mid * 1.02) + '                  FOB Ningbo\n\nMOQ                 ' + fmtQty(tiers[0]) + ' ' + U + '\nLead time           30 days after receipt of deposit\nValidity            30 days from date of quotation\nPayment             40% T/T deposit, balance before shipment\nSample              USD 45, 10 days, not refundable\n' + pdfCertL + '\nOEM / private label Accepted';
    var pdfName = 'Quotation-' + code.replace('RFQ-', '') + '.pdf';
    var body2 = 'Hi,\n\nPlease find our formal quotation attached as PDF.\n\n' + bodyL + ' Logo printing is no problem, we do OEM for many overseas brands.\n\n' + qLines('Q') + '\n\nLooking forward to your reply.\n\n' + p2n + '\n' + s2.name;
    out.push({
      id: id(), sample_id: null, generated: true, supplier_id: s2.id, rfq_id: rfq.id, format: 'pdf',
      label: 'PDF quotation that contradicts the email', blurb: 'Body says one price, the PDF another. The PDF drops a required certificate.',
      tags: ['conflict', 'pdf', 'generated'], planted: ['BODY_ATTACH_CONFLICT', 'CERT'], from_name: p2n, from: a2, to: buyer.email, date: R.addDays(day0, 4) + 'T07:40:00Z',
      subject: code + ' — our offer (PDF attached)', body_raw: body2,
      attachments: [{ name: pdfName, type: 'pdf', truncated: false, transcript: transcript }],
      expected: { kind: 'quote', rfq_code: code, fields: { price_at_target_usd: Number(pdfPrice), moq_pcs: tiers[0] }, gaps: [], gates: ['BODY_ATTACH_CONFLICT', 'CERT_UNVERIFIED'], eligibility_before_review: 'needs_review' },
      ref: { sv: 1, kind: 'quote', lang: ['en'], supplier: { name: F(s2.name, null, 0.96, s2.name), person: F(p2n, null, 0.95, p2n), role: s2.role },
        items: [{ i: 1, rfq_code: code, c: 0.97, product: F(prod, null, 0.94, 'Item: ' + prod, 'att:' + pdfName), f: {
          price_tiers: F([{ qmin: tiers[0], qmax: tiers[1] - 1, p: Number(m2(mid * 1.18)), qu: unit }, { qmin: tiers[1], qmax: tiers[2] - 1, p: Number(pdfPrice), qu: unit }, { qmin: tiers[2], qmax: null, p: Number(m2(mid * 1.02)), qu: unit }], 'USD/' + unit, 0.7, pdfRow, 'att:' + pdfName),
          currency: F('USD', null, 0.95, 'UNIT PRICE (USD)', 'att:' + pdfName),
          price_basis: F({ incoterm: 'FOB', place: 'Ningbo', incl_freight: false }, null, 0.95, 'FOB Ningbo', 'att:' + pdfName),
          moq: F({ n: tiers[0], u: U, pack: null }, U, 0.95, 'MOQ                 ' + fmtQty(tiers[0]) + ' ' + U, 'att:' + pdfName),
          lead_time: F({ lo: 30, hi: 30, u: 'days', from: 'deposit' }, 'days', 0.94, 'Lead time           30 days after receipt of deposit', 'att:' + pdfName),
          validity: F({ days: 30 }, null, 0.93, 'Validity            30 days from date of quotation', 'att:' + pdfName),
          certs: F(pdfCerts.map(function (c) { return { name: c, canon: R.canonCert(c) || c, scope: 'product', doc: false }; }), null, 0.9, pdfCertL, 'att:' + pdfName),
          private_label: F({ ans: 'yes', cond: null }, null, 0.94, 'OEM / private label Accepted', 'att:' + pdfName),
          sample: F({ cost: 45, cur: 'USD', days: 10, refundable: false }, null, 0.93, 'Sample              USD 45, 10 days, not refundable', 'att:' + pdfName),
          payment: F({ terms: '40% T/T deposit, balance before shipment' }, null, 0.94, 'Payment             40% T/T deposit, balance before shipment', 'att:' + pdfName),
          custom: custom('Q')
        } }],
        gaps: [{ i: 1, field: 'price_tiers', kind: 'conflict', note: 'The email says USD ' + bodyPrice + ' at our quantity, the attached quotation says USD ' + pdfPrice, ev: bodyL, src: 'body' }],
        flags: [], needs_human: [{ code: 'BODY_ATTACH_CONFLICT', i: 1, field: 'price_tiers', note: 'Email body USD ' + bodyPrice + ' vs PDF USD ' + pdfPrice + ' at our quantity', evs: [{ ev: bodyL, src: 'body' }, { ev: pdfRow, src: 'att:' + pdfName }] }], assumed: [] }
    });
  }

  /* 3 xlsx clean, relative validity */
  if (recips[2]) {
    var s3 = recips[2], p3n = personFor(s3, 3), a3 = addrFor(s3, p3n);
    var xName = 'pricing_' + code.replace('RFQ-', '') + '.xlsx';
    var xp1 = m2(mid * 1.02), xp2 = m2(mid * 0.95), xp3 = m2(mid * 0.88);
    var rowT = 'A9  ' + fmtQty(tiers[1]) + '\t' + xp2 + '\tFOB Shenzhen\t-';
    var certCells = certs.map(function (c, i) { return c + ' cert no. ' + c.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4) + '-2025-' + (7700 + i * 11); }).join('; ') || 'ISO 9001 cert no. ISO-2025-7700';
    var xt = '[XLSX TRANSCRIPT — sheet "Quote", 20 rows x 4 cols]\n\nA1  ' + s3.name.toUpperCase() + '\nA2  Quotation for\t' + code + '\nA3  Date\t' + R.addDays(day0, 5) + '\nA5  Item\t' + prod + '\n\nA7  QTY (' + U + ')\tUNIT PRICE USD\tTERM\tNOTE\nA8  ' + fmtQty(tiers[0]) + '\t' + xp1 + '\tFOB Shenzhen\t-\n' + rowT + '\nA10 ' + fmtQty(tiers[2]) + '\t' + xp3 + '\tFOB Shenzhen\tbox free\n\nA12 MOQ\t' + fmtQty(tiers[0]) + ' ' + U + '\nA13 Lead time\t25 days after deposit\nA14 Validity\t15 days\nA15 Payment\t30% T/T deposit, 70% before shipment\nA16 Sample\tUSD 25, 5 days, refundable on order\nA17 Certification\t' + certCells + '\nA18 Sea freight\tUSD 1,250 per 20GP to ' + (rfq.dest_port || 'destination') + '\nA19 Air freight\tUSD 4.80 per kg\nA20 Private label\tYes, your logo on unit and box, no tooling fee';
    var body3 = 'Dear Sir/Madam,\n\nPlease see the attached price sheet for the ' + prod + '. All details are in the file.\n\n' + qLines('Q') + '\n\nBest regards,\n' + p3n + '\n' + s3.name;
    out.push({
      id: id(), sample_id: null, generated: true, supplier_id: s3.id, rfq_id: rfq.id, format: 'xlsx',
      label: 'Excel price sheet', blurb: 'Clean spreadsheet quote. Validity is relative, so the expiry must be derived from the send date.',
      tags: ['xlsx', 'relative-validity', 'generated'], planted: ['RELATIVE_VALIDITY'], from_name: p3n, from: a3, to: buyer.email, date: R.addDays(day0, 5) + 'T06:15:00Z',
      subject: code + ' — price sheet attached', body_raw: body3,
      attachments: [{ name: xName, type: 'xlsx', truncated: false, transcript: xt }],
      expected: { kind: 'quote', rfq_code: code, fields: { price_at_target_usd: Number(xp2), moq_pcs: tiers[0], certs_canon: certs.slice() }, gaps: [], gates: [], eligibility_before_review: 'eligible' },
      ref: { sv: 1, kind: 'quote', lang: ['en'], supplier: { name: F(s3.name, null, 0.96, s3.name), person: F(p3n, null, 0.95, p3n), role: s3.role },
        items: [{ i: 1, rfq_code: code, c: 0.98, product: F(prod, null, 0.95, 'A5  Item\t' + prod, 'att:' + xName), f: {
          price_tiers: F([{ qmin: tiers[0], qmax: tiers[1] - 1, p: Number(xp1), qu: unit }, { qmin: tiers[1], qmax: tiers[2] - 1, p: Number(xp2), qu: unit }, { qmin: tiers[2], qmax: null, p: Number(xp3), qu: unit }], 'USD/' + unit, 0.96, rowT, 'att:' + xName),
          currency: F('USD', null, 0.97, 'UNIT PRICE USD', 'att:' + xName),
          price_basis: F({ incoterm: 'FOB', place: 'Shenzhen', incl_freight: false }, null, 0.96, 'FOB Shenzhen', 'att:' + xName),
          moq: F({ n: tiers[0], u: U, pack: null }, U, 0.96, 'A12 MOQ\t' + fmtQty(tiers[0]) + ' ' + U, 'att:' + xName),
          lead_time: F({ lo: 25, hi: 25, u: 'days', from: 'deposit' }, 'days', 0.95, 'A13 Lead time\t25 days after deposit', 'att:' + xName),
          validity: F({ days: 15 }, null, 0.94, 'A14 Validity\t15 days', 'att:' + xName),
          certs: F(certs.map(function (c) { return { name: c, canon: R.canonCert(c) || c, scope: 'product', doc: true }; }), null, 0.95, certCells.slice(0, 118), 'att:' + xName),
          private_label: F({ ans: 'yes', cond: null }, null, 0.95, 'A20 Private label\tYes, your logo on unit and box, no tooling fee', 'att:' + xName),
          sample: F({ cost: 25, cur: 'USD', days: 5, refundable: true }, null, 0.94, 'A16 Sample\tUSD 25, 5 days, refundable on order', 'att:' + xName),
          payment: F({ terms: '30% T/T deposit, 70% before shipment' }, null, 0.95, 'A15 Payment\t30% T/T deposit, 70% before shipment', 'att:' + xName),
          ship_sea: F({ price: 1250, cur: 'USD', per: '20GP', to: rfq.dest_port }, null, 0.93, 'A18 Sea freight\tUSD 1,250 per 20GP', 'att:' + xName),
          ship_air: F({ price: 4.8, cur: 'USD', per: 'kg', to: rfq.dest_port }, null, 0.92, 'A19 Air freight\tUSD 4.80 per kg', 'att:' + xName),
          custom: custom('Q')
        } }], gaps: [], flags: [], needs_human: [], assumed: [] }
    });
  }

  /* 4 csv multi-SKU, outlier, payment risk */
  if (recips[3]) {
    var s4 = recips[3], p4n = personFor(s4, 4), a4 = addrFor(s4, p4n);
    var cName = 'pricelist.csv', cheap = m2(mid * 0.52);
    var line1 = prod + ',' + qty + ',' + cheap + ',FOB Guangzhou,' + tiers[0] + ',22,' + (certs[0] || 'ISO9001') + ',yes';
    var line2 = 'Gift box for ' + prod + ',' + qty + ',0.45,FOB Guangzhou,' + tiers[0] * 2 + ',20,none,yes';
    var line3 = 'Polybag with header card,' + qty + ',0.08,FOB Guangzhou,' + tiers[0] * 5 + ',18,none,yes';
    var ct = '[CSV TRANSCRIPT — pricelist.csv, 4 rows]\n\nitem,qty,unit_price_usd,term,moq,lead_days,cert,private_label\n' + line1 + '\n' + line2 + '\n' + line3;
    var payL4 = 'Payment must be 100% T/T before production, our factory does not accept deposit terms for new customers.';
    var body4 = 'Hi ' + buyer.name + ',\n\nWe quote the ' + prod + ' you asked and also two packaging items you may need. See the CSV.\n\n' + payL4 + '\n\n' + (qs[0] ? 'Q1: ' + answerFor(qs[0], 0) : '') + '\n\n' + p4n + '\n' + s4.name;
    out.push({
      id: id(), sample_id: null, generated: true, supplier_id: s4.id, rfq_id: rfq.id, format: 'csv',
      label: 'CSV covering three products at once', blurb: 'One code, three SKUs. Suspiciously cheap, one certificate only, payment fully in advance.',
      tags: ['csv', 'multi-sku', 'outlier', 'payment-risk', 'generated'], planted: ['UNMATCHED_LINE_ITEM', 'PAYMENT_RISK', 'PRICE_OUTLIER'], from_name: p4n, from: a4, to: buyer.email, date: R.addDays(day0, 6) + 'T04:30:00Z',
      subject: 'Re: ' + code + ' — price list for 3 items', body_raw: body4,
      attachments: [{ name: cName, type: 'csv', truncated: false, transcript: ct }],
      expected: { kind: 'quote', rfq_code: code, fields: { price_at_target_usd: Number(cheap), moq_pcs: tiers[0] }, gaps: ['validity', 'sample'], gates: ['UNMATCHED_LINE_ITEM', 'PAYMENT_RISK', 'CERT_UNVERIFIED'], eligibility_before_review: 'needs_review' },
      ref: { sv: 1, kind: 'quote', lang: ['en'], supplier: { name: F(s4.name, null, 0.96, s4.name), person: F(p4n, null, 0.95, p4n), role: s4.role },
        items: [
          { i: 1, rfq_code: code, c: 0.94, product: F(prod, null, 0.95, line1.slice(0, 118), 'att:' + cName), f: {
            price_tiers: F([{ qmin: qty, qmax: null, p: Number(cheap), qu: unit }], 'USD/' + unit, 0.9, line1.slice(0, 118), 'att:' + cName),
            currency: F('USD', null, 0.93, 'unit_price_usd', 'att:' + cName),
            price_basis: F({ incoterm: 'FOB', place: 'Guangzhou', incl_freight: false }, null, 0.93, 'FOB Guangzhou', 'att:' + cName),
            moq: F({ n: tiers[0], u: U, pack: null }, U, 0.9, line1.slice(0, 118), 'att:' + cName),
            lead_time: F({ lo: 22, hi: 22, u: 'days', from: null }, 'days', 0.9, line1.slice(0, 118), 'att:' + cName),
            certs: F([{ name: certs[0] || 'ISO9001', canon: R.canonCert(certs[0] || 'ISO9001') || certs[0], scope: 'product', doc: false }], null, 0.9, line1.slice(0, 118), 'att:' + cName),
            private_label: F({ ans: 'yes', cond: null }, null, 0.9, 'private_label', 'att:' + cName),
            payment: F({ terms: '100% T/T before production' }, null, 0.95, payL4),
            custom: qs[0] ? [{ qid: qs[0].qid, v: answerFor(qs[0], 0), c: 0.9, ev: 'Q1: ' + answerFor(qs[0], 0), src: 'body' }] : []
          } },
          { i: 2, rfq_code: null, c: 0.9, product: F('Gift box for ' + prod, null, 0.95, 'Gift box for ' + prod, 'att:' + cName), f: {
            price_tiers: F([{ qmin: qty, qmax: null, p: 0.45, qu: 'pc' }], 'USD/pc', 0.9, line2.slice(0, 118), 'att:' + cName), currency: F('USD', null, 0.9, 'unit_price_usd', 'att:' + cName),
            moq: F({ n: tiers[0] * 2, u: 'pcs', pack: null }, 'pcs', 0.88, line2.slice(0, 118), 'att:' + cName) } },
          { i: 3, rfq_code: null, c: 0.9, product: F('Polybag with header card', null, 0.95, 'Polybag with header card', 'att:' + cName), f: {
            price_tiers: F([{ qmin: qty, qmax: null, p: 0.08, qu: 'pc' }], 'USD/pc', 0.9, line3.slice(0, 118), 'att:' + cName), currency: F('USD', null, 0.9, 'unit_price_usd', 'att:' + cName),
            moq: F({ n: tiers[0] * 5, u: 'pcs', pack: null }, 'pcs', 0.88, line3.slice(0, 118), 'att:' + cName) } }
        ],
        gaps: [{ i: 1, field: 'validity', kind: 'missing', note: 'No validity period given' }, { i: 1, field: 'sample', kind: 'missing', note: 'No sample cost or time given' }],
        flags: [], needs_human: [
          { code: 'UNMATCHED_LINE_ITEM', i: 2, field: null, note: 'Gift box was not requested in any open enquiry', evs: [{ ev: 'Gift box for ' + prod, src: 'att:' + cName }] },
          { code: 'UNMATCHED_LINE_ITEM', i: 3, field: null, note: 'Polybag was not requested in any open enquiry', evs: [{ ev: 'Polybag with header card', src: 'att:' + cName }] }
        ], assumed: [] }
    });
  }

  /* 5 thread with a range and gaps */
  if (recips[4]) {
    var s5 = recips[4], p5n = personFor(s5, 5), a5 = addrFor(s5, p5n);
    var rangeL = 'Price will be USD ' + m2(mid * 0.96) + '-' + m2(mid * 1.08) + ' depending on colour and packing.';
    var moqL5 = 'MOQ ' + fmtQty(Math.round(tiers[0] * 1.5)) + ' ' + U + '.';
    var body5 = 'Hi team,\n\nThanks for including us. ' + rangeL + ' ' + moqL5 + ' We do OEM, logo print is fine.\n\n' + (qs[0] ? 'Q1: ' + answerFor(qs[0], 0) : '') + '\n\nLet me know the final colour and we will confirm exactly.\n\n' + p5n + '\n\nOn ' + day0 + ', ' + buyer.name + ' <' + buyer.email + '> wrote:\n> Dear supplier,\n>\n> Please quote ' + code + ', ' + prod + '.\n> Target quantity ' + fmtQty(qty) + ' ' + U + '. Our target price is USD ' + m2(lo) + ' - ' + m2(hi) + ' FOB.\n> Required: ' + certLine + (rfq.pl_required ? ', private label' : '') + '.\n>\n> Please answer:\n' + qs.map(function (q) { return '> ' + q.qid + ' ' + q.text; }).join('\n') + '\n>\n> Please include MOQ, lead time, validity, payment terms and sample cost.\n>\n> ' + buyer.name;
    out.push({
      id: id(), sample_id: null, generated: true, supplier_id: s5.id, rfq_id: rfq.id, format: 'thread',
      label: 'Reply thread, price given as a range', blurb: 'Our own RFQ is quoted underneath. The supplier answers with a range and skips most questions.',
      tags: ['thread', 'range', 'gaps', 'generated'], planted: ['PRICE_RANGE_ONLY', 'GAPS'], from_name: p5n, from: a5, to: buyer.email, date: R.addDays(day0, 4) + 'T09:55:00Z',
      subject: 'Re: ' + code + ' ' + prod, body_raw: body5, attachments: [],
      expected: { kind: 'quote', rfq_code: code, fields: { price_at_target_usd: null }, gaps: ['lead_time', 'validity', 'payment', 'certs'], gates: ['PRICE_RANGE_ONLY', 'CRITICAL_FIELD_MISSING'], eligibility_before_review: 'needs_review' },
      ref: { sv: 1, kind: 'quote', lang: ['en'], supplier: { name: F(s5.name, null, 0.8, p5n), person: F(p5n, null, 0.85, p5n), role: s5.role },
        items: [{ i: 1, rfq_code: code, c: 0.95, product: F(prod, null, 0.7, null), f: {
          price_range: F({ lo: Number(m2(mid * 0.96)), hi: Number(m2(mid * 1.08)) }, 'USD/' + unit, 0.9, rangeL),
          currency: F('USD', null, 0.93, 'USD ' + m2(mid * 0.96) + '-' + m2(mid * 1.08)),
          moq: F({ n: Math.round(tiers[0] * 1.5), u: U, pack: null }, U, 0.94, moqL5),
          private_label: F({ ans: 'yes', cond: null }, null, 0.9, 'We do OEM, logo print is fine.'),
          custom: qs[0] ? [{ qid: qs[0].qid, v: answerFor(qs[0], 0), c: 0.9, ev: 'Q1: ' + answerFor(qs[0], 0), src: 'body' }] : []
        } }],
        gaps: [{ i: 1, field: 'price_tiers', kind: 'partial', note: 'Only a span was given, no firm price at any quantity', ev: rangeL, src: 'body' },
          { i: 1, field: 'lead_time', kind: 'missing', note: 'No production lead time given' }, { i: 1, field: 'validity', kind: 'missing', note: 'No validity given' },
          { i: 1, field: 'payment', kind: 'missing', note: 'No payment terms given' }, { i: 1, field: 'certs', kind: 'missing', note: certLine + ' were asked for and are not mentioned' }],
        flags: [], needs_human: [{ code: 'PRICE_RANGE_ONLY', i: 1, field: 'price_tiers', note: 'Cannot compare on a span; a firm price is needed', evs: [{ ev: rangeL, src: 'body' }] }], assumed: [] }
    });
  }

  /* 6 link only */
  if (recips[5]) {
    var s6 = recips[5], p6n = personFor(s6, 6), a6 = addrFor(s6, p6n);
    var linkL = 'All our prices are on our 1688 shop, please check there and tell me which model you want:';
    var url = 'https://shop1688.example.com/' + (s6.domains[0] || 'shop').split('.')[0] + '/catalogue';
    var body6 = 'Hello,\n\n' + linkL + '\n\n' + url + '\n\nWe are ' + certLine + ' certified. Logo printing available.\n\n' + p6n + '\n' + s6.name;
    out.push({
      id: id(), sample_id: null, generated: true, supplier_id: s6.id, rfq_id: rfq.id, format: 'link',
      label: 'Prices behind a marketplace link', blurb: 'No numbers in the email at all. Nothing can be compared until someone opens the link.',
      tags: ['link-only', 'no-price', 'generated'], planted: ['PRICE_EXTERNAL_ONLY'], from_name: p6n, from: a6, to: buyer.email, date: R.addDays(day0, 3) + 'T10:12:00Z',
      subject: 'Re: ' + code + ' ' + prod, body_raw: body6, attachments: [],
      expected: { kind: 'quote', rfq_code: code, fields: { price_at_target_usd: null }, gaps: ['price_tiers', 'moq', 'lead_time'], gates: ['PRICE_EXTERNAL_ONLY', 'CRITICAL_FIELD_MISSING'], eligibility_before_review: 'needs_review' },
      ref: { sv: 1, kind: 'quote', lang: ['en'], supplier: { name: F(s6.name, null, 0.95, s6.name), person: F(p6n, null, 0.94, p6n), role: s6.role },
        items: [{ i: 1, rfq_code: code, c: 0.9, product: F(prod, null, 0.8, null), f: {
          certs: F(certs.map(function (c) { return { name: c, canon: R.canonCert(c) || c, scope: 'product', doc: false }; }), null, 0.85, 'We are ' + certLine + ' certified.'),
          private_label: F({ ans: 'yes', cond: null }, null, 0.8, 'Logo printing available.'),
          photos_links: F([url], null, 0.95, url)
        } }],
        gaps: [{ i: 1, field: 'price_tiers', kind: 'external_only', note: 'No prices in the email; they are on a shop page we cannot open', ev: linkL, src: 'body' },
          { i: 1, field: 'moq', kind: 'missing', note: 'No minimum order stated' }, { i: 1, field: 'lead_time', kind: 'missing', note: 'No lead time stated' },
          { i: 1, field: 'validity', kind: 'missing', note: 'No validity stated' }, { i: 1, field: 'payment', kind: 'missing', note: 'No payment terms stated' }],
        flags: [], needs_human: [{ code: 'PRICE_EXTERNAL_ONLY', i: 1, field: 'price_tiers', note: 'Someone has to open the shop page before this can be compared', evs: [{ ev: url, src: 'body' }] }], assumed: [] }
    });
  }

  /* 7 clarification */
  if (recips[6]) {
    var s7 = recips[6], p7n = personFor(s7, 7), a7 = addrFor(s7, p7n);
    var body7 = 'Hi,\n\nBefore we quote we need to confirm three things:\n\n1. Are the dimensions in your specification internal or external?\n2. Do you need the print on the outside only, or inside as well?\n3. Can you send the artwork so we can check the print area?\n\nOnce we have these we can send the price within one working day.\n\n' + p7n + '\n' + s7.name;
    out.push({
      id: id(), sample_id: null, generated: true, supplier_id: s7.id, rfq_id: rfq.id, format: 'inline',
      label: 'Questions instead of a quote', blurb: 'Not a quotation. Someone has to answer before this supplier can bid.',
      tags: ['clarification', 'not-a-quote', 'generated'], planted: ['CLARIFICATION_REPLY_NEEDED'], from_name: p7n, from: a7, to: buyer.email, date: R.addDays(day0, 2) + 'T07:20:00Z',
      subject: 'Re: ' + code + ' — a few questions before quoting', body_raw: body7, attachments: [],
      expected: { kind: 'clarification', rfq_code: code, fields: {}, gaps: [], gates: ['CLARIFICATION_REPLY_NEEDED'], eligibility_before_review: 'awaiting' },
      ref: { sv: 1, kind: 'clarification', lang: ['en'], supplier: { name: F(s7.name, null, 0.95, s7.name), person: F(p7n, null, 0.95, p7n), role: s7.role }, items: [], gaps: [], flags: [],
        needs_human: [{ code: 'CLARIFICATION_REPLY_NEEDED', i: null, field: null, note: 'They will not quote until we confirm internal vs external dimensions, print sides, and send artwork', evs: [{ ev: 'Before we quote we need to confirm three things:', src: 'body' }] }], assumed: [] }
    });
  }

  /* always: cropped photo from an unknown sender, RMB, no code */
  var rmb = r2(mid * meta.fx.CNY), rmbS = rmb.toFixed(2), rmbCut = rmbS.slice(0, rmbS.indexOf('.') + 1) + '[?]' + rmbS.slice(-1);
  var pName = 'IMG_' + day0.replace(/-/g, '') + '_1904.jpg';
  var row1 = '50 - 99             ¥' + (rmb * 1.08).toFixed(2) + '           25天        [CUT OFF]';
  var row2 = '100 - 199           ¥' + rmbCut + '          25天        [CUT OFF]';
  var row3 = '200 以上            ¥1[ILLEGIBLE]      30天        [CUT OFF]';
  var moqP = '起订量 MOQ: 50 箱 (40 pcs/箱)';
  var pt = '[PHOTO TRANSCRIPT — printed rate card shot at an angle, right edge of the sheet is outside the frame]\n\n宏达贸易有限公司  HONGDA TRADING CO., LTD\n报价单 / QUOTATION            日期 ' + R.addDays(day0, 2) + '\n\n品名 Item: ' + prod + '\n\n数量 QTY (箱/ctn)   单价 RMB/pcs      交期        [CUT OFF]\n' + row1 + '\n' + row2 + '\n' + row3 + '\n\n' + moqP + '\n包装 40 pcs/ctn   60 x 40 x 35 cm   12 kg\n认证 Certification: ' + (certs[0] || 'CE') + '\n备注: 价格不含运费 (price excludes freight)  [CUT OFF]';
  out.push({
    id: id(), sample_id: null, generated: true, supplier_id: null, rfq_id: rfq.id, format: 'photo',
    label: 'Cropped photo of a printed rate card', blurb: 'No RFQ code, unknown sender, RMB prices, MOQ in cartons, right column cut off, one digit unreadable.',
    tags: ['photo', 'cropped', 'no-code', 'rmb', 'unknown-sender', 'generated'], planted: ['SENDER_NOT_IN_RECIPIENTS', 'RFQ_MATCH_LOW_CONF', 'CURRENCY_CONVERTED', 'UNIT_CONVERTED', 'OCR_AMBIGUOUS_CRITICAL'],
    from_name: 'Hongda Sales', from: 'hongdatrade' + (2000 + seq) + '@163.com', to: buyer.email, date: R.addDays(day0, 2) + 'T11:05:00Z',
    subject: prod.toLowerCase() + ' quotation', body_raw: 'hello friend\n\nthis is our price list, please see photo. we make many ' + prod.toLowerCase() + ' for europe customer.\n\nany question tell me. we can print your logo.\n\nHongda',
    attachments: [{ name: pName, type: 'photo', truncated: true, transcript: pt }],
    expected: { kind: 'quote', rfq_code: code, fields: { moq_pcs: 2000 }, gaps: ['price_basis', 'validity', 'payment'], gates: ['SENDER_NOT_IN_RECIPIENTS', 'CURRENCY_CONVERTED', 'UNIT_CONVERTED', 'OCR_AMBIGUOUS_CRITICAL', 'ATTACHMENT_TRUNCATED_CRITICAL'], eligibility_before_review: 'needs_review' },
    ref: { sv: 1, kind: 'quote', lang: ['zh', 'en'], supplier: { name: F('HONGDA TRADING CO., LTD', null, 0.9, 'HONGDA TRADING CO., LTD', 'att:' + pName), person: F('Hongda', null, 0.7, 'Hongda'), role: 'trading' },
      items: [{ i: 1, rfq_code: null, c: 0.6, product: F(prod, null, 0.9, '品名 Item: ' + prod, 'att:' + pName), f: {
        price_tiers: F([{ qmin: 50, qmax: 99, p: Number((rmb * 1.08).toFixed(2)), qu: 'ctn' }, { qmin: 100, qmax: 199, p: null, qu: 'ctn' }], 'CNY/pc', 0.55, row1, 'att:' + pName),
        currency: F('CNY', null, 0.95, '单价 RMB/pcs', 'att:' + pName),
        moq: F({ n: 50, u: 'ctn', pack: 40 }, 'ctn', 0.9, moqP, 'att:' + pName),
        lead_time: F({ lo: 25, hi: 25, u: 'days', from: null }, 'days', 0.85, '25天', 'att:' + pName),
        certs: F([{ name: certs[0] || 'CE', canon: R.canonCert(certs[0] || 'CE') || certs[0], scope: 'product', doc: false }], null, 0.85, '认证 Certification: ' + (certs[0] || 'CE'), 'att:' + pName),
        private_label: F({ ans: 'yes', cond: null }, null, 0.75, 'we can print your logo'),
        carton: F({ pcs: 40, l_cm: 60, w_cm: 40, h_cm: 35, gw_kg: 12 }, null, 0.9, '包装 40 pcs/ctn   60 x 40 x 35 cm   12 kg', 'att:' + pName)
      } }],
      gaps: [{ i: 1, field: 'price_tiers', kind: 'ambiguous', note: 'Second tier price has an unreadable digit', ev: row2, src: 'att:' + pName },
        { i: 1, field: 'price_tiers', kind: 'truncated', note: 'The third tier and the whole right-hand column are outside the photo', ev: row3, src: 'att:' + pName },
        { i: 1, field: 'price_basis', kind: 'missing', note: 'No incoterm anywhere; the card only says freight is excluded' },
        { i: 1, field: 'validity', kind: 'missing', note: 'No validity period on the card' }, { i: 1, field: 'payment', kind: 'missing', note: 'No payment terms given' }],
      flags: [], needs_human: [{ code: 'RFQ_MATCH_LOW_CONF', i: 1, field: null, note: 'No reference code anywhere. The product matches the enquiry but the sender is not on its recipient list.', evs: [] }], assumed: [] },
    ref_match: { rfqCode: code, c: 0.74, why: 'The rate card names the same product as the only matching open enquiry, but the sender is not on its list.' }
  });

  return out;
}

/* ---- what to chase, and a reply draft -------------------------------- */

var ASK = {
  price_tiers: function (rfq) { return 'Your unit price in USD, FOB China, at ' + tiersFor(rfq).map(fmtQty).join(', ') + ' ' + plural(rfq.unit || 'pc') + '.'; },
  moq: function () { return 'Your minimum order quantity.'; },
  lead_time: function () { return 'Production lead time in days, and from which point it counts (deposit, artwork approval).'; },
  validity: function () { return 'How long the quotation stays valid.'; },
  payment: function () { return 'Your payment terms for a first order.'; },
  price_basis: function () { return 'Confirmation of the price basis. We compare on FOB China; please name the port.'; },
  certs: function (rfq) { return 'Which of ' + ((rfq.required_certs || []).join(', ') || 'the required certificates') + ' you hold, with certificate or report numbers.'; },
  sample: function () { return 'Sample cost and sample lead time.'; },
  private_label: function (rfq) { return 'Confirmation that you can apply our logo (private label) at ' + fmtQty(rfq.target_qty) + ' ' + plural(rfq.unit || 'pc') + '.'; }
};
var ASK_GATE = {
  PRICE_RANGE_ONLY: function () { return 'A firm unit price rather than a range, so we can compare like with like.'; },
  CERT_UNVERIFIED: function (rfq, g) { return 'Certificate numbers or copies for the certificates you mention' + (g.note ? ' (' + g.note.split(' claimed')[0] + ')' : '') + '.'; },
  PRICE_EXTERNAL_ONLY: function () { return 'The prices written in the email itself. We cannot open external shop links from our system.'; },
  ATTACHMENT_TRUNCATED_CRITICAL: function () { return 'A clear, complete copy of your price list; part of the image was cut off.'; },
  OCR_AMBIGUOUS_CRITICAL: function () { return 'The prices typed out in the email; one figure in the photo cannot be read.'; },
  BODY_ATTACH_CONFLICT: function (rfq, g) { return 'Your email and your attachment show different figures' + (g.field ? ' for ' + (R.FIELD_LABELS[g.field] || g.field).toLowerCase() : '') + '. Which one applies?'; },
  INCOTERM_MISMATCH: function () { return 'Your FOB China price. The quote is on a different basis and cannot be compared as it stands.'; },
  SPEC_DEVIATION: function () { return 'A price for our exact specification rather than the alternative you offered.'; },
  CONDITIONAL_PL: function (rfq) { return 'Confirmation that the private label condition is met at our quantity of ' + fmtQty(rfq.target_qty) + '.'; },
  MOQ_EXCEEDS_TARGET: function (rfq) { return 'Whether you can accept an order of ' + fmtQty(rfq.target_qty) + ', below your stated minimum, and at what price.'; },
  CURRENCY_ASSUMED: function () { return 'Confirmation of the currency; no currency was stated.'; }
};

function chaseItems(quote, gates, rfq) {
  var items = [], seen = {};
  (quote && quote.gaps || []).forEach(function (g) {
    if (g.kind !== 'missing' && g.kind !== 'partial') return;
    var key = 'gap:' + g.field;
    if (seen[key]) return; seen[key] = 1;
    if (ASK[g.field]) items.push({ key: key, ask: ASK[g.field](rfq, g) });
    else if (g.question) items.push({ key: key, ask: 'Our question: ' + g.note });
  });
  (gates || []).forEach(function (g) {
    if (g.status && g.status !== 'open') return;
    if (!ASK_GATE[g.code] || seen['gate:' + g.code]) return;
    seen['gate:' + g.code] = 1;
    items.push({ key: 'gate:' + g.code, ask: ASK_GATE[g.code](rfq, g) });
  });
  return items;
}

function draftReply(rec, quote, rfq, items, buyer, meta) {
  var first = String(rec.from_name || 'Supplier').split(/[\s|,\/]+/)[0] || 'Supplier';
  var due = R.addDays(meta.demo_now, 3);
  var subject = 'Re: ' + rfq.code + ' — a few details before we can compare your offer';
  var lines;
  if (rec.kind === 'clarification') {
    subject = 'Re: ' + rfq.code + ' — answers to your questions';
    lines = ['Dear ' + first + ',', '', 'Thank you for coming back to us on ' + rfq.code + ' (' + rfq.product + '). Our answers:', '',
      '[Answer 1]', '[Answer 2]', '[Answer 3]', '',
      'Specification for reference: ' + rfq.spec_summary, '',
      'Please send your quotation in USD, FOB China, per ' + (rfq.unit || 'pc') + ', for ' + fmtQty(rfq.target_qty) + ' ' + plural(rfq.unit || 'pc') + ', by ' + due + '.', '',
      'Best regards,', buyer.name, buyer.email];
  } else {
    lines = ['Dear ' + first + ',', '', 'Thank you for your quotation for ' + rfq.code + ' (' + rfq.product + '). Before we can compare it with the other offers we need a few more details:', ''];
    items.forEach(function (it, i) { lines.push((i + 1) + '. ' + it.ask); });
    lines.push('', 'Could you reply by ' + due + '? Prices should be in USD, FOB China, per ' + (rfq.unit || 'pc') + ', for ' + fmtQty(rfq.target_qty) + ' ' + plural(rfq.unit || 'pc') + '.', '', 'Best regards,', buyer.name, buyer.email);
  }
  return { subject: subject, body: lines.join('\n'), source: 'rule' };
}

/* ==== v2: the Supplier view composer ==================================
   Deterministic and instant — no AI involved in writing these emails, so the demo never
   waits on a model to show an edge case. Every generated email carries a `ref` (the exact
   shape a real reader would produce) and an `expected` block, and every evidence string in
   `ref` is built from the very same text placed in the body or the attachment, so it always
   verifies. */

var PERSONAS = {
  A: { label: 'Complete quote', format: 'xlsx', toggles: { partialLines: false, missingMoqSome: false, rangePricesSome: false, attachContradicts: false, certOnRequest: false, validityMissing: false, paymentRisky: false, specDeviationSome: false, skipQuestions: false, rmbCurrency: false, cutOffImage: false, noRfqCode: false, unknownSender: false } },
  B: { label: 'Partial quote', format: 'inline', toggles: { partialLines: true, missingMoqSome: true, rangePricesSome: true, attachContradicts: false, certOnRequest: false, validityMissing: true, paymentRisky: false, specDeviationSome: false, skipQuestions: true, rmbCurrency: false, cutOffImage: false, noRfqCode: false, unknownSender: false } },
  C: { label: 'Contradictory attachment', format: 'pdf', toggles: { partialLines: false, missingMoqSome: false, rangePricesSome: false, attachContradicts: true, certOnRequest: true, validityMissing: false, paymentRisky: false, specDeviationSome: true, skipQuestions: false, rmbCurrency: false, cutOffImage: false, noRfqCode: false, unknownSender: false } },
  D: { label: 'Unknown sender, cropped photo', format: 'photo', toggles: { partialLines: true, missingMoqSome: false, rangePricesSome: false, attachContradicts: false, certOnRequest: true, validityMissing: true, paymentRisky: true, specDeviationSome: false, skipQuestions: true, rmbCurrency: true, cutOffImage: true, noRfqCode: true, unknownSender: true } }
};
var TOGGLE_LIST = [
  { key: 'partialLines', label: 'Quote only some of the lines' },
  { key: 'missingMoqSome', label: 'MOQ missing on some lines' },
  { key: 'rangePricesSome', label: 'Some prices given as a range' },
  { key: 'attachContradicts', label: 'Attachment contradicts the body' },
  { key: 'certOnRequest', label: 'A certificate "on request" (unverified)' },
  { key: 'validityMissing', label: 'No quote validity given' },
  { key: 'paymentRisky', label: 'Payment 100% in advance' },
  { key: 'specDeviationSome', label: 'A spec deviation on some lines' },
  { key: 'skipQuestions', label: 'Skip one or two of our questions' },
  { key: 'rmbCurrency', label: 'Prices in RMB, not USD' },
  { key: 'cutOffImage', label: 'Cropped photo, rows cut off' },
  { key: 'noRfqCode', label: 'No RFQ code anywhere' },
  { key: 'unknownSender', label: 'Sender not on our recipient list' }
];
var FORMATS_V2 = ['inline', 'xlsx', 'pdf', 'csv', 'photo', 'screenshot'];

function personaFor(key) { return PERSONAS[key] || PERSONAS.A; }

function selectLines(items, toggles) {
  if (toggles.cutOffImage) return items.slice(0, Math.max(8, Math.ceil(items.length * 0.4)));
  if (toggles.partialLines) return items.filter(function (it, i) { return (i % 4) !== 3; });
  return items.slice();
}

function personaFactor(personaKey) { return { A: 0.95, B: 1.08, C: 1.02, D: 0.85 }[personaKey] || 1; }

function fakeAddress(supplierRec, personaKey) {
  if (supplierRec && !supplierRec.unknown) {
    var dom = (supplierRec.domains && supplierRec.domains[0]) || 'example.com';
    var names = ['Alice', 'Kevin', 'Cindy', 'Michael', 'Vicky', 'Jason', 'Nancy', 'Peter'];
    var person = names[(supplierRec.name.length + personaKey.charCodeAt(0)) % names.length];
    return { name: person + ' — ' + supplierRec.name, from_name: person, from: person.toLowerCase() + '@' + dom };
  }
  return { name: 'Kitchenware Direct Co.', from_name: 'Sales', from: 'kitchenwaredirect2018@163.com' };
}

function fmtRow(item, priceStr, moqStr, curSymbol) {
  return item.sku + '  ' + item.product + '  qty ' + fmtQty(item.qty) + '  ' + curSymbol + priceStr + '/' + item.unit + (moqStr ? '  MOQ ' + moqStr : '');
}

function compose(rfq, supplierRec, personaKey, toggles, format, meta, buyer) {
  toggles = Object.assign({}, personaFor(personaKey).toggles, toggles || {});
  format = format || personaFor(personaKey).format;
  var items = R.rfqItems(rfq);
  var quoted = selectLines(items, toggles);
  var addr = fakeAddress(supplierRec, personaKey);
  var cur = toggles.rmbCurrency ? 'CNY' : 'USD';
  var curSym = toggles.rmbCurrency ? '¥' : '$';
  var rate = toggles.rmbCurrency ? (meta.fx.CNY || 7.15) : 1;

  var lineData = quoted.map(function (item, i) {
    var mid = (item.target_usd_fob.lo + item.target_usd_fob.hi) / 2;
    var bodyPrice = r2(mid * personaFactor(personaKey) * rate);
    var attPrice = toggles.attachContradicts ? r2(mid * 0.90 * rate) : bodyPrice;
    var moq = item.tier_qtys[0] || Math.max(50, Math.round(item.qty / 3));
    var hasMoq = !(toggles.missingMoqSome && i % 5 === 4);
    var isRange = toggles.rangePricesSome && i % 6 === 5;
    var hasDeviation = toggles.specDeviationSome && i % 7 === 6;
    return {
      item: item, bodyPrice: bodyPrice, attPrice: attPrice, moq: hasMoq ? moq : null,
      isRange: isRange, hasDeviation: hasDeviation
    };
  });

  var certs = (rfq.required_certs || []).map(function (c, i) {
    var last = i === (rfq.required_certs.length - 1);
    return { name: c, canon: c, doc: !(toggles.certOnRequest && last), number: c + '-2025-' + (4000 + i * 37) };
  });

  var custom = (rfq.custom_questions || []).slice(0, toggles.skipQuestions ? Math.max(1, rfq.custom_questions.length - 2) : rfq.custom_questions.length)
    .map(function (cq) { return { qid: cq.qid, text: answerForQuestion(cq) }; });

  /* ---- build the row strings once, reuse verbatim in the transcript/body and in ref.ev --- */
  var rows = lineData.map(function (ld) {
    var priceTxt = ld.isRange ? (curSym + m2(ld.attPrice * 0.92) + '-' + curSym + m2(ld.attPrice * 1.08)) : (curSym + m2(ld.attPrice));
    var row = ld.item.sku + '\t' + ld.item.product + '\t' + fmtQty(ld.item.qty) + ' ' + ld.item.unit + '\t' + priceTxt + (ld.moq ? '\tMOQ ' + fmtQty(ld.moq) + ' ' + ld.item.unit : '\tMOQ —') + (ld.hasDeviation ? '\t(offered in clear finish, not frosted)' : '');
    return { ld: ld, row: row, priceTxt: priceTxt };
  });

  var attName, attType, transcript;
  if (format === 'xlsx') {
    attType = 'xlsx'; attName = 'pricing_' + rfq.code.replace('RFQ-', '') + '.xlsx';
    transcript = '[XLSX TRANSCRIPT — sheet "Quote", ' + (rows.length + 8) + ' rows]\n\nA1  ' + (supplierRec && !supplierRec.unknown ? supplierRec.name.toUpperCase() : addr.name.toUpperCase()) +
      '\nA2  Quotation for\t' + rfq.code + '\nA3  Date\t' + rfq.sent_at + '\n\nA5  SKU\tProduct\tQty\tPrice\tMOQ\n' +
      rows.map(function (r, i) { return 'A' + (6 + i) + '  ' + r.row; }).join('\n');
  } else if (format === 'pdf') {
    attType = 'pdf'; attName = rfq.code.replace('RFQ-', 'Quotation-') + '.pdf';
    transcript = '[PDF TRANSCRIPT — 1 page, text layer extracted]\n\n' + (supplierRec && !supplierRec.unknown ? supplierRec.name.toUpperCase() : addr.name.toUpperCase()) +
      '\nQUOTATION            Ref: ' + rfq.code + '\n\nSKU        Product                              Qty        Price       MOQ\n' +
      rows.map(function (r) { return r.row.replace(/\t/g, '   '); }).join('\n');
  } else if (format === 'csv') {
    attType = 'csv'; attName = 'pricelist_' + rfq.code.replace('RFQ-', '') + '.csv';
    transcript = '[CSV TRANSCRIPT — ' + attName + ', ' + (rows.length + 1) + ' rows]\n\nsku,product,qty,price,moq\n' +
      rows.map(function (r) { return r.ld.item.sku + ',' + r.ld.item.product + ',' + fmtQty(r.ld.item.qty) + ',' + r.priceTxt.replace(/[¥$]/g, '') + ',' + (r.ld.moq || ''); }).join('\n');
  } else if (format === 'photo') {
    attType = 'photo'; attName = 'IMG_' + rfq.sent_at.replace(/-/g, '') + '_' + (2000 + (rfq.id.length * 7) % 900) + '.jpg';
    var shown = rows.slice(0, toggles.cutOffImage ? Math.max(4, rows.length - 3) : rows.length);
    transcript = '[PHOTO TRANSCRIPT — printed rate card, angled shot' + (toggles.cutOffImage ? ', right/bottom edge outside the frame' : '') + ']\n\n报价单 / QUOTATION\n\n' +
      shown.map(function (r) { return r.row.replace(/\t/g, '   '); }).join('\n') +
      (toggles.cutOffImage ? '\n' + rows.slice(shown.length).map(function () { return '[CUT OFF]'; }).join('\n') : '');
  } else if (format === 'screenshot') {
    attType = 'screenshot'; attName = 'chat_' + rfq.sent_at.replace(/-/g, '') + '.png';
    transcript = '[SCREENSHOT TRANSCRIPT — chat conversation]\n\n' + rows.map(function (r) { return addr.from_name + ': ' + r.row.replace(/\t/g, ', '); }).join('\n');
  } else { attType = null; attName = null; transcript = null; }

  var bodyLines = [];
  bodyLines.push(toggles.unknownSender ? 'Hello,' : 'Dear ' + buyer.name + ',');
  if (attType) {
    bodyLines.push('', (toggles.unknownSender ? 'This is our price list, please see attached.' : 'Thank you for your enquiry ' + (toggles.noRfqCode ? '' : rfq.code) + '. Please find our quotation attached for the range.'));
    if (toggles.attachContradicts) {
      var sample = rows.slice(0, 3);
      bodyLines.push('', 'For quick reference, our best prices are: ' + sample.map(function (r) { return r.ld.item.sku + ' at ' + curSym + m2(r.ld.bodyPrice); }).join(', ') + '.');
    }
  } else {
    bodyLines.push('', (toggles.noRfqCode ? 'Thank you for the enquiry. Our prices:' : 'Thank you for your enquiry ' + rfq.code + '. Our prices:'));
    bodyLines.push('', rows.map(function (r) { return r.row.replace(/\t/g, '  '); }).join('\n'));
  }
  bodyLines.push('', 'Terms: FOB ' + (supplierRec && !supplierRec.unknown ? (supplierRec.city || 'China') : 'China') + ', ' +
    (toggles.paymentRisky ? '100% T/T before production' : '30% deposit, 70% before shipment') +
    (toggles.validityMissing ? '' : ', valid ' + 30 + ' days') + '.');
  bodyLines.push('Lead time ' + (30 + (personaKey === 'B' ? 5 : 0)) + ' days after deposit.');
  bodyLines.push('Certification: ' + certs.map(function (c) { return c.name + (c.doc ? ' (report ' + c.number + ')' : ' (report on request)'); }).join(', ') + '.');
  bodyLines.push('Private label: yes' + (toggles.unknownSender ? ', we can print your logo.' : ', your logo across the range.'));
  if (custom.length) { bodyLines.push(''); custom.forEach(function (c, i) { bodyLines.push((i + 1) + '. ' + c.text); }); }
  bodyLines.push('', 'Best regards,', addr.from_name, supplierRec && !supplierRec.unknown ? supplierRec.name : '');
  var body = bodyLines.join('\n');

  var subject = toggles.noRfqCode ? 'Kitchen range quotation' : 'Re: ' + rfq.code + ' — quotation';
  var email = {
    id: 'em_sv_' + rfq.id.replace('rfq_', '') + '_' + (supplierRec && supplierRec.id ? supplierRec.id.replace('sup_', '') : 'd') + '_' + Date.now().toString(36),
    sample_id: null, generated: true, generated_by: 'rule', supplier_id: supplierRec && supplierRec.id || null, rfq_id: toggles.noRfqCode ? null : rfq.id,
    format: format, label: personaFor(personaKey).label + ' — ' + (supplierRec && !supplierRec.unknown ? supplierRec.name : 'unknown sender'),
    blurb: 'Composed from the Supplier view: ' + Object.keys(toggles).filter(function (k) { return toggles[k]; }).length + ' edge case(s) planted.',
    tags: ['generated', 'persona-' + personaKey], from_name: addr.from_name, from: addr.from, to: buyer.email,
    date: new Date(Date.parse(rfq.sent_at + 'T02:00:00Z') + 1000 * 60 * 60 * 24 * (2 + (personaKey.charCodeAt(0) % 4))).toISOString(),
    subject: subject, body_raw: body, attachments: attType ? [{ name: attName, type: attType, transcript: transcript, truncated: !!toggles.cutOffImage }] : []
  };

  var termsF = {
    currency: F(cur, null, 0.9, curSym, 'body'),
    price_basis: F({ incoterm: 'FOB', place: (supplierRec && !supplierRec.unknown ? (supplierRec.city || 'China') : 'China') }, null, 0.9, 'FOB ' + (supplierRec && !supplierRec.unknown ? (supplierRec.city || 'China') : 'China'), 'body'),
    lead_time: F({ lo: 30 + (personaKey === 'B' ? 5 : 0), hi: 30 + (personaKey === 'B' ? 5 : 0), from: 'deposit' }, null, 0.9, 'Lead time ' + (30 + (personaKey === 'B' ? 5 : 0)) + ' days after deposit.', 'body'),
    payment: F({ terms: toggles.paymentRisky ? '100% T/T before production' : '30% deposit, 70% before shipment' }, null, 0.9, toggles.paymentRisky ? '100% T/T before production' : '30% deposit, 70% before shipment', 'body'),
    certs: F(certs.map(function (c) { return { name: c.name, canon: c.canon, scope: 'product', doc: c.doc }; }), null, 0.9, 'Certification: ' + certs.map(function (c) { return c.name + (c.doc ? ' (report ' + c.number + ')' : ' (report on request)'); }).join(', ') + '.', 'body'),
    private_label: F({ ans: 'yes', cond: null }, null, 0.9, 'Private label: yes', 'body'),
    custom: custom.map(function (c, i) { return { qid: c.qid, v: c.text, c: 0.85, ev: (i + 1) + '. ' + c.text, src: 'body' }; })
  };
  if (!toggles.validityMissing) termsF.validity = F({ days: 30 }, null, 0.9, 'valid 30 days', 'body');

  var refLines = rows.map(function (r) {
    var ld = r.ld;
    var entry = { line: ld.item.line, sku: ld.item.sku, product: ld.item.product, c: 0.92, ev: r.row.replace(/\t/g, attType ? '\t' : '  '), src: attType ? 'att:' + attName : 'body' };
    if (ld.isRange) entry.range = { lo: r2(ld.attPrice * 0.92), hi: r2(ld.attPrice * 1.08) };
    else entry.p = [{ qmin: ld.item.tier_qtys[0], qmax: null, p: ld.attPrice }];
    if (ld.moq) entry.moq = { n: ld.moq, u: ld.item.unit, pack: null };
    if (ld.hasDeviation) entry.note = 'Offered in clear finish, not the frosted finish we asked for';
    return entry;
  });
  /* the attachment transcript uses two-space separators for photo/screenshot rendering above;
     keep ev consistent with whichever text actually holds it */
  if (format === 'photo' || format === 'screenshot' || format === 'pdf') {
    refLines.forEach(function (rl) { rl.ev = rl.ev.replace(/\t/g, format === 'pdf' ? '   ' : (format === 'screenshot' ? ', ' : '   ')); if (format === 'screenshot') rl.ev = addr.from_name + ': ' + rl.ev; });
  }

  var flags = [];
  rows.forEach(function (r) { if (r.ld.hasDeviation) flags.push({ code: 'SPEC_DEVIATION', line: r.ld.item.line, note: 'Offered in clear finish, not the frosted finish we asked for', ev: r.ld.hasDeviation ? refLines.filter(function (x) { return x.line === r.ld.item.line; })[0].ev : null, src: attType ? 'att:' + attName : 'body' }); });

  var gaps = [];
  if (toggles.attachContradicts) {
    rows.slice(0, 3).forEach(function (r) {
      gaps.push({ field: 'price', kind: 'conflict', note: 'Body quotes ' + curSym + m2(r.ld.bodyPrice) + ', attachment quotes ' + curSym + m2(r.ld.attPrice) + ' for ' + r.ld.item.sku, ev: r.ld.item.sku + ' at ' + curSym + m2(r.ld.bodyPrice), src: 'body' });
    });
  }

  var ref = { sv: 2, kind: 'quote', lang: ['en'], supplier: { name: F(supplierRec && !supplierRec.unknown ? supplierRec.name : addr.name, null, 0.9, null), person: F(addr.from_name, null, 0.9, null), role: supplierRec && !supplierRec.unknown ? (supplierRec.role || 'factory') : 'trading' },
    terms: termsF, lines: refLines, gaps: gaps, flags: flags, needs_human: [], assumed: [] };

  var expected = {
    kind: 'quote', rfq_code: toggles.noRfqCode ? null : rfq.code,
    lines_quoted: refLines.length, lines_total: items.length,
    gates: [].concat(
      toggles.partialLines || toggles.cutOffImage ? ['LINES_NOT_QUOTED'] : [],
      toggles.attachContradicts ? ['BODY_ATTACH_CONFLICT'] : [],
      toggles.certOnRequest ? ['CERT_UNVERIFIED'] : [],
      toggles.validityMissing ? ['CRITICAL_FIELD_MISSING'] : [],
      toggles.paymentRisky ? ['PAYMENT_RISK'] : [],
      toggles.specDeviationSome ? ['SPEC_DEVIATION'] : [],
      toggles.rmbCurrency ? ['CURRENCY_CONVERTED'] : [],
      toggles.noRfqCode ? ['RFQ_MATCH_LOW_CONF'] : [],
      toggles.unknownSender ? ['SENDER_NOT_IN_RECIPIENTS'] : []
    )
  };

  if (toggles.noRfqCode) email.ref_match = { rfqCode: rfq.code, c: 0.82, why: 'The product range and line count match this open RFQ closely.' };

  return { email: email, ref: ref, expected: expected };
}

/* ---- v2: a simulated follow-up answering our chase email -------------- */
/* Persona A and C answer everything asked; B answers about half; D never replies (the
   caller should simply not create an email when this returns null). */
function answerFollowUp(rfq, supplierRec, personaKey, reply, meta, buyer) {
  if (personaKey === 'D') return null;
  var fraction = personaKey === 'B' ? 0.5 : 1;
  var items = (reply.items || []);
  var toAnswer = items.filter(function (_, i) { return i < Math.ceil(items.length * fraction); });
  if (!toAnswer.length) return null;

  var lineFills = {}, termFills = {};
  toAnswer.forEach(function (key) {
    var m = /^gap:(price|moq|lead_time):L(\d+)$/.exec(key);
    if (m) { lineFills[m[2]] = lineFills[m[2]] || {}; lineFills[m[2]][m[1]] = true; return; }
    var m2v = /^gate:CRITICAL_FIELD_MISSING:(validity|payment|custom_questions)$/.exec(key) || /^gate:(CERT_UNVERIFIED|CURRENCY_ASSUMED|INCOTERM_MISMATCH|PAYMENT_RISK)$/.exec(key);
    if (m2v) termFills[m2v[1] || m2v[0]] = true;
  });

  var addr = fakeAddress(supplierRec, personaKey);
  var lines = [];
  var bodyLines = ['Dear ' + buyer.name + ',', '', 'Thank you, here are the details you asked for:'];
  var items_ = R.rfqItems(rfq);
  Object.keys(lineFills).forEach(function (lineNo) {
    var item = items_.filter(function (it) { return it.line === Number(lineNo); })[0];
    if (!item) return;
    var mid = (item.target_usd_fob.lo + item.target_usd_fob.hi) / 2;
    var fills = lineFills[lineNo];
    var entry = { line: item.line, sku: item.sku, product: item.product, c: 0.9, src: 'body' };
    var rowBits = [item.sku];
    if (fills.price) { var price = r2(mid * personaFactor(personaKey)); entry.p = [{ qmin: item.tier_qtys[0], qmax: null, p: price }]; rowBits.push('USD ' + m2(price)); }
    if (fills.moq) { entry.moq = { n: item.tier_qtys[0], u: item.unit, pack: null }; rowBits.push('MOQ ' + fmtQty(item.tier_qtys[0])); }
    if (fills.lead_time) { entry.lt = { lo: 30, hi: 30, from: 'deposit' }; rowBits.push('30 days lead time'); }
    var row = rowBits.join(' — ');
    entry.ev = row;
    lines.push(entry);
    bodyLines.push('Line ' + item.line + ': ' + row + '.');
  });
  if (termFills.validity) bodyLines.push('This quotation is valid 20 days.');
  if (termFills.payment) bodyLines.push('Payment: 30% deposit, 70% before shipment.');
  if (termFills.custom_questions) bodyLines.push('To answer your remaining question: yes, this is confirmed.');
  bodyLines.push('', 'Best regards,', addr.from_name);
  var body = bodyLines.join('\n');

  var terms = {};
  if (termFills.validity) terms.validity = F({ days: 20 }, null, 0.9, 'valid 20 days', 'body');
  if (termFills.payment) terms.payment = F({ terms: '30% deposit, 70% before shipment' }, null, 0.9, 'Payment: 30% deposit, 70% before shipment.', 'body');
  if (termFills.custom_questions) terms.custom = (rfq.custom_questions || []).map(function (cq) { return { qid: cq.qid, v: 'confirmed', c: 0.8, ev: 'yes, this is confirmed', src: 'body' }; });

  var email = {
    id: 'em_sv_' + rfq.id.replace('rfq_', '') + '_' + (supplierRec && supplierRec.id ? supplierRec.id.replace('sup_', '') : 'd') + '_r' + Date.now().toString(36),
    sample_id: null, generated: true, generated_by: 'rule', supplier_id: supplierRec && supplierRec.id || null, rfq_id: rfq.id, in_reply_to: reply.id,
    format: 'inline', label: 'Follow-up from ' + (supplierRec && !supplierRec.unknown ? supplierRec.name : 'unknown sender'),
    blurb: (fraction === 1 ? 'Answers everything asked.' : 'Answers about half of what was asked.'),
    tags: ['generated', 'supplement'], from_name: addr.from_name, from: addr.from, to: buyer.email,
    date: R.addDays(reply.due || meta.demo_now, -1) + 'T04:00:00Z',
    subject: 'Re: ' + reply.subject, body_raw: body, attachments: []
  };
  var ref = { sv: 2, kind: 'supplement', lang: ['en'], supplier: { name: F(supplierRec && !supplierRec.unknown ? supplierRec.name : addr.name), person: F(addr.from_name), role: 'factory' }, terms: terms, lines: lines, gaps: [], flags: [], needs_human: [], assumed: [] };
  return { email: email, ref: ref, expected: { kind: 'supplement', answered: toAnswer.length, asked: items.length } };
}

/* ---- v2: chase items across one or more lines for one supplier -------- */
var ASK_TERMS_V2 = {
  'validity': function () { return 'How long this quotation stays valid.'; },
  'payment': function () { return 'Your payment terms for this order.'; },
  'custom_questions': function () { return 'The question(s) from our first email that were not answered yet.'; },
  'CERT_UNVERIFIED': function () { return 'Certificate numbers or copies for the certificates marked "on request".'; },
  'CURRENCY_ASSUMED': function () { return 'Confirmation of the currency; none was stated.'; },
  'INCOTERM_MISMATCH': function () { return 'Your FOB China price; we cannot compare on another basis.'; },
  'PAYMENT_RISK': function () { return 'Payment terms with a deposit rather than 100% in advance, if possible.'; }
};
function chaseItemsV2(lineQuotes, headerGates, rfq) {
  var items = [];
  (lineQuotes || []).forEach(function (q) {
    (q.gaps || []).forEach(function (g) {
      if (g.kind !== 'missing' && g.kind !== 'partial') return;
      var label = g.field === 'price' ? 'unit price' : g.field === 'moq' ? 'minimum order quantity' : g.field === 'lead_time' ? 'lead time' : null;
      if (!label) return;
      items.push({ key: 'gap:' + g.field + ':L' + q.line, line: q.line, ask: 'Line ' + q.line + ' (' + q.sku + '): your ' + label + '.' });
    });
  });
  (headerGates || []).forEach(function (g) {
    if (g.status && g.status !== 'open') return;
    var fn = ASK_TERMS_V2[g.field] || ASK_TERMS_V2[g.code];
    if (!fn) return;
    items.push({ key: 'gate:' + g.code + ':' + (g.field || ''), line: null, ask: fn(rfq, g) });
  });
  return items;
}
function draftLineReply(rfq, supplierName, items, lines, buyer, meta) {
  var due = R.addDays(meta.demo_now, 3);
  var subject = 'Re: ' + rfq.code + ' — details on ' + lines.length + ' line' + (lines.length > 1 ? 's' : '');
  var bodyLines = ['Dear ' + (supplierName || 'Supplier') + ',', '', 'Thank you for your quotation for ' + rfq.code + '. Before we can compare it we need:', ''];
  items.forEach(function (it, i) { bodyLines.push((i + 1) + '. ' + it.ask); });
  bodyLines.push('', 'Could you reply by ' + due + '?', '', 'Best regards,', buyer.name, buyer.email);
  return { subject: subject, body: bodyLines.join('\n'), source: 'rule' };
}
function answerForQuestion(cq) {
  var t = cq.text.toLowerCase();
  if (/logo|print/.test(t)) return 'Yes, every SKU can carry your logo; minimum 1,000 pcs per SKU for printing.';
  if (/cannot|produce/.test(t)) return 'All SKUs can be produced at the quantities requested.';
  if (/earliest|slot|production/.test(t)) return 'We can start production within 10 days of deposit.';
  if (/consolidate|shipment|container/.test(t)) return 'We can consolidate the full range into one 40ft container.';
  return 'Confirmed, no issues on our side.';
}

root.GENERATOR = {
  readinessRules: readinessRules, generateEdgeCases: generateEdgeCases, chaseItems: chaseItems, draftReply: draftReply, tiersFor: tiersFor, Q_SUGGEST: Q_SUGGEST,
  /* v2 */
  PERSONAS: PERSONAS, TOGGLE_LIST: TOGGLE_LIST, FORMATS_V2: FORMATS_V2,
  compose: compose, answerFollowUp: answerFollowUp, chaseItemsV2: chaseItemsV2, draftLineReply: draftLineReply
};

})(typeof window !== 'undefined' ? window : globalThis);
