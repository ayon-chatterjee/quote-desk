/* RFQ Quote Intelligence — seed fixtures.
   Static demo data. Pinned clock so date rules never rot. */
(function (root) {
'use strict';

var META = {
  demo_now: '2026-09-10',
  fx: { CNY: 7.15, HKD: 7.82, EUR: 0.92, date: '2026-09-08' },
  prompt_versions: { extract: 'x7', extract_v2: 'x2v', match: 'm3', compare: 'c5', awards: 'aw1' },
  thresholds: {
    conf_critical: 0.7,
    outlier_lo: 0.6,
    outlier_hi: 2.0,
    match_conf: 0.8,
    validity_warn_days: 7
  },
  schema_v: 1
};

var SUPPLIERS = [
  { id: 'sup_silitech',  name: 'Shenzhen SiliTech Housewares',  domains: ['silitech-sz.com'],      city: 'Shenzhen',   role: 'factory', verified: true },
  { id: 'sup_homeware',  name: 'Dongguan Homeware Industrial',  domains: ['dg-homeware.cn'],       city: 'Dongguan',   role: 'factory', verified: true },
  { id: 'sup_yiwu',      name: 'Yiwu Hongda Trading',           domains: ['yiwuhongda.com'],       city: 'Yiwu',       role: 'trading', verified: false },
  { id: 'sup_ningbo',    name: 'Ningbo Bottleworks',            domains: ['nbbottleworks.com'],    city: 'Ningbo',     role: 'factory', verified: true },
  { id: 'sup_xiamen',    name: 'Xiamen Outdoor Gear',           domains: ['xm-outdoorgear.com'],   city: 'Xiamen',     role: 'factory', verified: true },
  { id: 'sup_lumi',      name: 'Shenzhen Lumi Electronics',     domains: ['lumi-electronics.com'], city: 'Shenzhen',   role: 'factory', verified: true },
  { id: 'sup_bright',    name: 'Guangzhou Bright Trading',      domains: ['gzbright-trade.com'],   city: 'Guangzhou',  role: 'trading', verified: true },
  { id: 'sup_optic',     name: 'Huizhou Optic Technology',      domains: ['hz-optic.cn'],          city: 'Huizhou',    role: 'factory', verified: true },
  { id: 'sup_packpro',   name: 'Dongguan PackPro',              domains: ['packpro-dg.com'],       city: 'Dongguan',   role: 'factory', verified: true },
  { id: 'sup_qingdao',   name: 'Qingdao Paper Converting',      domains: ['qdpaperco.com'],        city: 'Qingdao',    role: 'factory', verified: true },
  { id: 'sup_shprint',   name: 'Shanghai Print Pack',           domains: ['sh-printpack.com'],     city: 'Shanghai',   role: 'factory', verified: true },
  { id: 'sup_everbright', name: 'Ningbo Everbright Manufacturing', domains: ['nb-everbright.com'],   city: 'Ningbo',     role: 'factory', verified: true },
  { id: 'sup_kaida',     name: 'Shenzhen Kaida Industrial',     domains: ['kaida-sz.com'],         city: 'Shenzhen',   role: 'factory', verified: true },
  { id: 'sup_sunrise',   name: 'Guangzhou Sunrise Packaging',   domains: ['sunrise-pack.cn'],      city: 'Guangzhou',  role: 'factory', verified: true },
  { id: 'sup_hefei',     name: 'Hefei Unity Trading',           domains: ['hefeiunity.com'],       city: 'Hefei',      role: 'trading', verified: false }
];

var BUYER = { name: 'Vfulfill Sourcing', email: 'sourcing@vfulfill.io' };

var RFQS = [
  {
    id: 'rfq_0417',
    code: 'RFQ-2026-0417',
    product: 'Collapsible silicone water bottle, 550 ml',
    spec_summary: 'Food-grade silicone body, PP lid with carabiner, custom body colour, 1-colour logo print, individual kraft box.',
    target_qty: 3000,
    unit: 'pc',
    tier_qtys: [1000, 3000, 5000],
    target_usd_fob: { lo: 2.10, hi: 2.60 },
    required_certs: ['FDA', 'LFGB'],
    pl_required: true,
    custom_required: true,
    max_lead_days: 35,
    dest_port: 'Nhava Sheva, India',
    incoterm: 'FOB',
    custom_questions: [
      { qid: 'q1', text: 'Can you match Pantone 2211 C on the bottle body?', required: true },
      { qid: 'q2', text: 'Carton dimensions and pcs per carton?', required: true },
      { qid: 'q3', text: 'How many body colours can we run in one order?', required: false }
    ],
    recipients: ['sup_silitech', 'sup_homeware', 'sup_ningbo', 'sup_xiamen'],
    sent_at: '2026-08-24',
    deadline: '2026-09-05',
    status: 'open'
  },
  {
    id: 'rfq_0422',
    code: 'RFQ-2026-0422',
    product: 'LED ring light 10 inch, with tripod and Bluetooth remote',
    spec_summary: '10" bi-colour LED ring, 1.6 m aluminium tripod, phone clamp, BT remote, USB-C powered, retail colour box with our logo.',
    target_qty: 1000,
    unit: 'set',
    tier_qtys: [500, 1000, 3000],
    target_usd_fob: { lo: 6.50, hi: 8.00 },
    required_certs: ['CE', 'RoHS', 'FCC'],
    pl_required: true,
    custom_required: false,
    max_lead_days: 30,
    dest_port: 'Nhava Sheva, India',
    incoterm: 'FOB',
    custom_questions: [
      { qid: 'q1', text: 'Is the unit battery powered or USB only?', required: true },
      { qid: 'q2', text: 'Sea and air freight cost to Nhava Sheva for 1000 sets?', required: true }
    ],
    recipients: ['sup_lumi', 'sup_bright', 'sup_optic'],
    sent_at: '2026-08-26',
    deadline: '2026-09-08',
    status: 'open'
  },
  {
    id: 'rfq_0431',
    code: 'RFQ-2026-0431',
    product: 'Kraft mailer box, custom size, 1-colour print',
    spec_summary: '250 gsm kraft e-flute mailer, 240 x 180 x 70 mm, 1-colour outside print, tuck-front closure, flat packed.',
    target_qty: 10000,
    unit: 'pc',
    tier_qtys: [5000, 10000, 20000],
    target_usd_fob: { lo: 0.28, hi: 0.36 },
    required_certs: ['FSC'],
    pl_required: false,
    custom_required: true,
    max_lead_days: 30,
    dest_port: 'Nhava Sheva, India',
    incoterm: 'FOB',
    custom_questions: [
      { qid: 'q1', text: 'How many pcs per bundle and per carton?', required: true },
      { qid: 'q2', text: 'What artwork format do you need from us?', required: true }
    ],
    recipients: ['sup_packpro', 'sup_qingdao', 'sup_shprint'],
    sent_at: '2026-08-27',
    deadline: '2026-09-09',
    status: 'open'
  }
,
  {
    id: 'rfq_0440',
    code: 'RFQ-2026-0440',
    product: 'Private-label kitchen and dining range',
    title: 'Private-label kitchen and dining range',
    spec_summary: 'Thirty-SKU private-label kitchen and dining collection: silicone tools, bamboo boards and accessories, glass storage with bamboo lids, stainless steel tools, and kraft-lined lunch boxes. One consistent logo treatment across the range.',
    items: [
      { line: 1, sku: 'VF-KD-001', product: 'Silicone spatula 28cm', spec: 'Food-grade silicone, 1-colour logo', qty: 4000, unit: 'pc', target_usd_fob: { lo: 0.62, hi: 0.95 }, tier_qtys: [2000, 4000, 8000] },
      { line: 2, sku: 'VF-KD-002', product: 'Silicone spoon set, 2pc', spec: 'Food-grade silicone, 1-colour logo', qty: 3000, unit: 'set', target_usd_fob: { lo: 0.85, hi: 1.25 }, tier_qtys: [1500, 3000, 6000] },
      { line: 3, sku: 'VF-KD-003', product: 'Silicone basting brush', spec: 'Food-grade silicone, 1-colour logo', qty: 5000, unit: 'pc', target_usd_fob: { lo: 0.35, hi: 0.55 }, tier_qtys: [2500, 5000, 10000] },
      { line: 4, sku: 'VF-KD-004', product: 'Silicone oven mitt, pair', spec: 'Food-grade silicone, 1-colour logo', qty: 2500, unit: 'pair', target_usd_fob: { lo: 1.10, hi: 1.60 }, tier_qtys: [1250, 2500, 5000] },
      { line: 5, sku: 'VF-KD-005', product: 'Silicone trivet, round 20cm', spec: 'Food-grade silicone, 1-colour logo', qty: 2000, unit: 'pc', target_usd_fob: { lo: 0.70, hi: 1.05 }, tier_qtys: [1000, 2000, 4000] },
      { line: 6, sku: 'VF-KD-006', product: 'Silicone ice cube tray, 12-cavity', spec: 'Food-grade silicone, 1-colour logo', qty: 3500, unit: 'pc', target_usd_fob: { lo: 0.55, hi: 0.85 }, tier_qtys: [1750, 3500, 7000] },
      { line: 7, sku: 'VF-KD-007', product: 'Silicone baking mat 40x30cm', spec: 'Food-grade silicone, 1-colour logo', qty: 1800, unit: 'pc', target_usd_fob: { lo: 1.20, hi: 1.70 }, tier_qtys: [900, 1800, 3600] },
      { line: 8, sku: 'VF-KD-008', product: 'Silicone stretch lids, set of 3', spec: 'Food-grade silicone, 1-colour logo', qty: 3000, unit: 'set', target_usd_fob: { lo: 1.40, hi: 2.00 }, tier_qtys: [1500, 3000, 6000] },
      { line: 9, sku: 'VF-KD-009', product: 'Silicone garlic peeler', spec: 'Food-grade silicone, 1-colour logo', qty: 6000, unit: 'pc', target_usd_fob: { lo: 0.22, hi: 0.38 }, tier_qtys: [3000, 6000, 12000] },
      { line: 10, sku: 'VF-KD-010', product: 'Silicone whisk', spec: 'Food-grade silicone, 1-colour logo', qty: 2500, unit: 'pc', target_usd_fob: { lo: 0.65, hi: 0.98 }, tier_qtys: [1250, 2500, 5000] },
      { line: 11, sku: 'VF-KD-011', product: 'Bamboo cutting board 35x25cm', spec: 'Natural bamboo, oil-finished, laser-engraved logo', qty: 1500, unit: 'pc', target_usd_fob: { lo: 2.20, hi: 3.10 }, tier_qtys: [750, 1500, 3000] },
      { line: 12, sku: 'VF-KD-012', product: 'Bamboo cutting board, small 25x18cm', spec: 'Natural bamboo, oil-finished, laser-engraved logo', qty: 2000, unit: 'pc', target_usd_fob: { lo: 1.40, hi: 2.00 }, tier_qtys: [1000, 2000, 4000] },
      { line: 13, sku: 'VF-KD-013', product: 'Bamboo utensil holder', spec: 'Natural bamboo, oil-finished, laser-engraved logo', qty: 1200, unit: 'pc', target_usd_fob: { lo: 1.60, hi: 2.30 }, tier_qtys: [600, 1200, 2400] },
      { line: 14, sku: 'VF-KD-014', product: 'Bamboo dish rack', spec: 'Natural bamboo, oil-finished, laser-engraved logo', qty: 800, unit: 'pc', target_usd_fob: { lo: 3.80, hi: 5.20 }, tier_qtys: [500, 800, 1600] },
      { line: 15, sku: 'VF-KD-015', product: 'Bamboo trivet, set of 2', spec: 'Natural bamboo, oil-finished, laser-engraved logo', qty: 1500, unit: 'set', target_usd_fob: { lo: 1.10, hi: 1.60 }, tier_qtys: [750, 1500, 3000] },
      { line: 16, sku: 'VF-KD-016', product: 'Bamboo salad servers, set of 2', spec: 'Natural bamboo, oil-finished, laser-engraved logo', qty: 1800, unit: 'set', target_usd_fob: { lo: 0.90, hi: 1.35 }, tier_qtys: [900, 1800, 3600] },
      { line: 17, sku: 'VF-KD-017', product: 'Glass storage jar 500ml with bamboo lid', spec: 'Borosilicate glass, silicone seal', qty: 3000, unit: 'pc', target_usd_fob: { lo: 1.15, hi: 1.65 }, tier_qtys: [1500, 3000, 6000] },
      { line: 18, sku: 'VF-KD-018', product: 'Glass storage jar 1000ml with bamboo lid', spec: 'Borosilicate glass, silicone seal', qty: 2200, unit: 'pc', target_usd_fob: { lo: 1.55, hi: 2.15 }, tier_qtys: [1100, 2200, 4400] },
      { line: 19, sku: 'VF-KD-019', product: 'Glass spice jar set, 6pc with rack', spec: 'Borosilicate glass, silicone seal', qty: 900, unit: 'set', target_usd_fob: { lo: 4.20, hi: 5.80 }, tier_qtys: [500, 900, 1800] },
      { line: 20, sku: 'VF-KD-020', product: 'Glass measuring cup 500ml', spec: 'Borosilicate glass, silicone seal', qty: 1600, unit: 'pc', target_usd_fob: { lo: 1.05, hi: 1.55 }, tier_qtys: [800, 1600, 3200] },
      { line: 21, sku: 'VF-KD-021', product: 'Stainless steel straws, set of 4 + brush', spec: '304 stainless steel, 1-colour logo print', qty: 4000, unit: 'set', target_usd_fob: { lo: 0.70, hi: 1.05 }, tier_qtys: [2000, 4000, 8000] },
      { line: 22, sku: 'VF-KD-022', product: 'Stainless steel ice cubes, set of 4', spec: '304 stainless steel, 1-colour logo print', qty: 2000, unit: 'set', target_usd_fob: { lo: 0.95, hi: 1.40 }, tier_qtys: [1000, 2000, 4000] },
      { line: 23, sku: 'VF-KD-023', product: 'Stainless steel garlic press', spec: '304 stainless steel, 1-colour logo print', qty: 2500, unit: 'pc', target_usd_fob: { lo: 1.25, hi: 1.75 }, tier_qtys: [1250, 2500, 5000] },
      { line: 24, sku: 'VF-KD-024', product: 'Stainless steel citrus juicer', spec: '304 stainless steel, 1-colour logo print', qty: 1400, unit: 'pc', target_usd_fob: { lo: 1.80, hi: 2.50 }, tier_qtys: [700, 1400, 2800] },
      { line: 25, sku: 'VF-KD-025', product: 'Kraft-lined lunch box 900ml', spec: 'Kraft-fibre composite, PP lid, 1-colour logo', qty: 2600, unit: 'pc', target_usd_fob: { lo: 1.60, hi: 2.30 }, tier_qtys: [1300, 2600, 5200] },
      { line: 26, sku: 'VF-KD-026', product: 'Kraft-lined lunch box 1400ml with divider', spec: 'Kraft-fibre composite, PP lid, 1-colour logo', qty: 1900, unit: 'pc', target_usd_fob: { lo: 2.10, hi: 2.90 }, tier_qtys: [950, 1900, 3800] },
      { line: 27, sku: 'VF-KD-027', product: 'Insulated lunch bag', spec: 'Kraft-fibre composite, PP lid, 1-colour logo', qty: 1500, unit: 'pc', target_usd_fob: { lo: 2.40, hi: 3.30 }, tier_qtys: [750, 1500, 3000] },
      { line: 28, sku: 'VF-KD-028', product: 'Bamboo fibre storage canister, set of 3', spec: 'Natural bamboo, oil-finished, laser-engraved logo', qty: 1100, unit: 'set', target_usd_fob: { lo: 3.10, hi: 4.30 }, tier_qtys: [550, 1100, 2200] },
      { line: 29, sku: 'VF-KD-029', product: 'Silicone dish scrubber, set of 3', spec: 'Food-grade silicone, 1-colour logo', qty: 3500, unit: 'set', target_usd_fob: { lo: 0.45, hi: 0.70 }, tier_qtys: [1750, 3500, 7000] },
      { line: 30, sku: 'VF-KD-030', product: 'Bamboo dish brush, replaceable head', spec: 'Natural bamboo, oil-finished, laser-engraved logo', qty: 4200, unit: 'pc', target_usd_fob: { lo: 0.60, hi: 0.90 }, tier_qtys: [2100, 4200, 8400] }
    ],
    required_certs: ['FDA', 'LFGB'],
    pl_required: true,
    custom_required: true,
    max_lead_days: 40,
    dest_port: 'Nhava Sheva, India',
    incoterm: 'FOB',
    custom_questions: [
      { qid: 'q1', text: 'Can every SKU carry our 1-colour logo, and is there a minimum quantity per SKU for logo printing?', required: true },
      { qid: 'q2', text: 'Which SKUs, if any, cannot be produced at the quantities we have asked for?', required: true },
      { qid: 'q3', text: 'What is the earliest production slot you can offer for an order across the whole range?', required: true },
      { qid: 'q4', text: 'Can you consolidate all 30 SKUs into one shipment, or would this ship in more than one container?', required: false }
    ],
    recipients: ['sup_silitech', 'sup_homeware', 'sup_everbright'],
    sent_at: '2026-09-01',
    deadline: '2026-09-15',
    status: 'open'
  }
];

/* ---- sample emails -------------------------------------------------- */

var EMAILS = [

{
  id: 'em_s01', sample_id: 's01', supplier_id: 'sup_silitech', rfq_id: 'rfq_0417',
  format: 'inline', label: 'Complete inline quote',
  blurb: 'Everything answered, code in subject. The baseline: no highlights, no gates.',
  tags: ['clean', 'code-in-subject'],
  from_name: 'Alice Chen', from: 'alice.chen@silitech-sz.com', to: BUYER.email,
  date: '2026-08-28T03:12:00Z',
  subject: 'Re: RFQ-2026-0417 collapsible silicone bottle 550ml — quotation',
  body_raw: 'Dear Vfulfill team,\n\nThank you for the enquiry. Our quotation for the 550ml collapsible silicone bottle follows.\n\nUnit price, FOB Shenzhen, USD:\n1,000 - 2,999 pcs: USD 2.55 / pc\n3,000 - 4,999 pcs: USD 2.42 / pc\n5,000 pcs and above: USD 2.28 / pc\n\nMOQ: 1,000 pcs\nProduction lead time: 28 days after deposit\nQuotation valid until 30 September 2026\nPayment: 30% T/T deposit, 70% against copy of B/L\n\nCertification: FDA 21 CFR 177.2600 test report no. SHF-2025-11842 and LFGB report no. LFG-2025-0663, both issued by SGS. Copies attached in our next mail if you need them.\nPrivate label: yes, we do OEM. Your logo 1-colour pad print on the body, and your artwork on the kraft box, both free of tooling charge.\nProduct: custom moulded to your drawing, not a stock item.\n\nSample: USD 30 per set, 7 days, refunded on your first bulk order.\n\nQ1 Pantone: yes, we can match Pantone 2211 C, silicone colour matching fee USD 60 one time.\nQ2 Carton: 40 pcs per carton, 60 x 40 x 35 cm, 12 kg gross.\nQ3 Colours: up to 3 body colours in one order, 1,000 pcs minimum per colour.\n\nSea freight to Nhava Sheva is around USD 780 per 20GP, air around USD 5.20 per kg, both for your reference only.\n\nBest regards,\nAlice Chen | Sales Manager\nShenzhen SiliTech Housewares Co., Ltd\nTel +86 755 8812 4471',
  attachments: [],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0417', match_how: 'subject',
    fields: { price_at_target_usd: 2.42, moq_pcs: 1000, lead_lo: 28, lead_hi: 28, incoterm: 'FOB', currency: 'USD', certs_canon: ['FDA', 'LFGB'], pl: 'yes' },
    gaps: [], gates: [], highlights: 0,
    eligibility_before_review: 'eligible', eligibility_after_review: 'eligible'
  }
},

{
  id: 'em_s02', sample_id: 's02', supplier_id: 'sup_homeware', rfq_id: 'rfq_0417',
  format: 'pdf', label: 'PDF quotation, conflicts with body',
  blurb: 'Body says one price, the attached PDF says another. PDF also drops a required certificate.',
  tags: ['conflict', 'pdf', 'cert-fail'],
  from_name: 'Kevin Luo', from: 'kevin@dg-homeware.cn', to: BUYER.email,
  date: '2026-08-29T07:40:00Z',
  subject: 'RFQ-2026-0417 — our offer (PDF attached)',
  body_raw: 'Hi,\n\nPlease find our formal quotation attached as PDF.\n\nIn short: we can do USD 2.45 per pc at 3000 pcs, FOB Shenzhen, MOQ 2000 pcs, 30 days production. Logo printing is no problem, we do OEM for many EU brands.\n\nQ1 Pantone 2211 C: yes.\nQ2 Carton: 50 pcs / carton, 62 x 42 x 38 cm.\nQ3: 2 colours per order.\n\nLooking forward to your reply.\n\nKevin Luo\nDongguan Homeware Industrial Co., Ltd',
  attachments: [{
    name: 'DGH-Quotation-0417.pdf', type: 'pdf', truncated: false,
    transcript: '[PDF TRANSCRIPT — 1 page, text layer extracted]\n\nDONGGUAN HOMEWARE INDUSTRIAL CO., LTD\nQUOTATION       No. DGH-2026-0871      Date: 29 Aug 2026\n\nTo: Vfulfill Sourcing            Ref: RFQ-2026-0417\n\nItem: Collapsible silicone bottle 550ml, custom colour, 1C logo\n\n  QTY (pcs)        UNIT PRICE (USD)      TERM\n  2,000 - 2,999    2.78                  FOB Shenzhen\n  3,000 - 4,999    2.65                  FOB Shenzhen\n  5,000 +          2.51                  FOB Shenzhen\n\nMOQ                 2,000 pcs\nLead time           30 days after receipt of deposit\nValidity            30 days from date of quotation\nPayment             40% T/T deposit, balance before shipment\nSample              USD 45 / set, 10 days, not refundable\nCertification       FDA (food contact) — report available on request\nOEM / private label Accepted\n\nRemark: price excludes any Pantone matching fee.'
  }],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0417', match_how: 'subject',
    fields: { price_at_target_usd: 2.65, moq_pcs: 2000, lead_lo: 30, lead_hi: 30, incoterm: 'FOB', currency: 'USD', certs_canon: ['FDA'], pl: 'yes' },
    gaps: ['certs'], gates: ['BODY_ATTACH_CONFLICT', 'CERT_UNVERIFIED'],
    eligibility_before_review: 'needs_review', eligibility_after_review: 'disqualified'
  }
},

{
  id: 'em_s03', sample_id: 's03', supplier_id: 'sup_yiwu', rfq_id: 'rfq_0417',
  format: 'photo', label: 'Cropped photo of a printed rate card',
  blurb: 'No RFQ code, unknown sender domain, RMB prices, MOQ in cartons, right column cut off, one digit unreadable.',
  tags: ['photo', 'cropped', 'no-code', 'rmb', 'unknown-sender'],
  from_name: 'Hongda Sales', from: 'yiwuhongda2019@163.com', to: BUYER.email,
  date: '2026-08-28T11:05:00Z',
  subject: 'silicone bottle quotation',
  body_raw: 'hello friend\n\nthis is our price list, please see photo. we make many silicone bottle for europe customer.\n\nany question tell me. we can print your logo.\n\nHongda',
  attachments: [{
    name: 'IMG_20260828_1904.jpg', type: 'photo', truncated: true,
    transcript: '[PHOTO TRANSCRIPT — printed rate card shot at an angle, right edge of the sheet is outside the frame]\n\n义乌市宏达贸易有限公司  YIWU HONGDA TRADING CO., LTD\n报价单 / QUOTATION            日期 2026-08-27\n\n品名 Item: 折叠硅胶水杯 550ml  Collapsible silicone bottle 550ml\n\n数量 QTY (箱/ctn)   单价 RMB/pcs      交期        [CUT OFF]\n50 - 99             ¥16.80           25天        [CUT OFF]\n100 - 199           ¥15.[?]0          25天        [CUT OFF]\n200 以上            ¥1[ILLEGIBLE]      30天        [CUT OFF]\n\n起订量 MOQ: 50 箱 (40 pcs/箱)\n包装 40 pcs/ctn   60 x 40 x 35 cm   12 kg\n认证 Certification: FDA\n备注: 价格不含运费 (price excludes freight)  [CUT OFF]'
  }],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0417', match_how: 'inferred',
    fields: { price_at_target_usd: 2.35, moq_pcs: 2000, lead_lo: 25, lead_hi: 25, incoterm: null, currency: 'CNY', certs_canon: ['FDA'], pl: 'yes' },
    gaps: ['price_basis', 'validity', 'payment', 'q1', 'q3'],
    gates: ['SENDER_NOT_IN_RECIPIENTS', 'RFQ_MATCH_LOW_CONF', 'CURRENCY_CONVERTED', 'UNIT_CONVERTED', 'OCR_AMBIGUOUS_CRITICAL', 'ATTACHMENT_TRUNCATED_CRITICAL', 'CERT_UNVERIFIED', 'CRITICAL_FIELD_LOW_CONF', 'CRITICAL_FIELD_MISSING'],
    eligibility_before_review: 'needs_review', eligibility_after_review: 'disqualified'
  }
},

{
  id: 'em_s04', sample_id: 's04', supplier_id: 'sup_ningbo', rfq_id: 'rfq_0417',
  format: 'inline', label: 'Chinese-only reply, EXW, conditional logo',
  blurb: 'Code only in the body. Price is EXW including VAT, logo printing conditional on 3000 pcs, lead time counted from deposit.',
  tags: ['chinese', 'exw', 'conditional-pl'],
  from_name: '王丽 / Wang Li', from: 'wangli@nbbottleworks.com', to: BUYER.email,
  date: '2026-09-01T02:20:00Z',
  subject: '报价 quotation 550ml',
  body_raw: '您好，\n\n关于 RFQ-2026-0417 折叠硅胶水杯 550ml，我们的报价如下：\n\n1000-2999 个：¥16.50/个\n3000 个以上：¥15.60/个\n以上价格为 EXW宁波 含税，不含运费。\n\n起订量 1000 个。\n交期：定金后 25 天。\n报价有效期 30 天。\n付款：30% 定金，70% 发货前付清。\n\n认证：FDA 和 LFGB 都有，报告号 NB-FD-2451 / NB-LG-2452。\n3000个以上可以印logo，低于3000个我们不接受定制印刷。\n产品为定制开模，不是现货。\n样品：¥200/个，7天，下单后退还。\n\nQ1 Pantone 2211 C 可以匹配。\nQ2 包装：40 pcs/箱，58 x 40 x 34 cm，11.5 kg。\nQ3 一个订单最多 2 种颜色。\n\n谢谢！\n王丽\n宁波瑞器制品有限公司',
  attachments: [],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0417', match_how: 'body',
    fields: { price_at_target_usd: 2.18, moq_pcs: 1000, lead_lo: 25, lead_hi: 25, incoterm: 'EXW', currency: 'CNY', certs_canon: ['FDA', 'LFGB'], pl: 'yes' },
    gaps: [], gates: ['CURRENCY_CONVERTED', 'INCOTERM_MISMATCH', 'CONDITIONAL_PL'],
    eligibility_before_review: 'needs_review', eligibility_after_review: 'eligible'
  }
},

{
  id: 'em_s05', sample_id: 's05', supplier_id: 'sup_xiamen', rfq_id: 'rfq_0417',
  format: 'thread', label: 'Reply thread, price given as a range',
  blurb: 'Our own RFQ is quoted underneath. The supplier answers with a price range and skips several questions.',
  tags: ['thread', 'range', 'gaps'],
  from_name: 'Tony Xu', from: 'tony.xu@xm-outdoorgear.com', to: BUYER.email,
  date: '2026-08-30T09:55:00Z',
  subject: 'Re: RFQ-2026-0417 collapsible silicone bottle 550ml',
  body_raw: 'Hi team,\n\nThanks for including us. Price will be USD 2.3-2.6 depending on colour and print area. MOQ 1500 pcs. We do OEM, logo print is fine.\n\nQ1: Pantone matching is possible.\n\nLet me know the final colour and we will confirm exactly.\n\nTony\n\nOn Mon, 24 Aug 2026 at 18:02, Vfulfill Sourcing <sourcing@vfulfill.io> wrote:\n> Dear supplier,\n>\n> Please quote RFQ-2026-0417, collapsible silicone water bottle 550 ml.\n> Target quantity 3,000 pcs. Our target landed price is USD 2.10 - 2.60 FOB.\n> Required: FDA and LFGB, private label, custom moulding.\n>\n> Please answer:\n> q1 Can you match Pantone 2211 C on the bottle body?\n> q2 Carton dimensions and pcs per carton?\n> q3 How many body colours can we run in one order?\n>\n> Please include MOQ, lead time, validity, payment terms and sample cost.\n>\n> Vfulfill Sourcing',
  attachments: [],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0417', match_how: 'subject',
    fields: { price_at_target_usd: null, moq_pcs: 1500, lead_lo: null, lead_hi: null, incoterm: null, currency: 'USD', certs_canon: [], pl: 'yes' },
    gaps: ['price_tiers', 'lead_time', 'validity', 'payment', 'certs', 'price_basis', 'sample', 'q2', 'q3'],
    gates: ['PRICE_RANGE_ONLY', 'CRITICAL_FIELD_MISSING'],
    eligibility_before_review: 'needs_review', eligibility_after_review: 'disqualified'
  }
},

{
  id: 'em_s06', sample_id: 's06', supplier_id: 'sup_lumi', rfq_id: 'rfq_0422',
  format: 'xlsx', label: 'Excel price sheet',
  blurb: 'Clean spreadsheet quote. Validity is relative, so the expiry has to be derived from the send date.',
  tags: ['xlsx', 'clean', 'relative-validity'],
  from_name: 'Grace Tan', from: 'grace.tan@lumi-electronics.com', to: BUYER.email,
  date: '2026-08-30T06:15:00Z',
  subject: 'RFQ-2026-0422 ring light — price sheet attached',
  body_raw: 'Dear Sir/Madam,\n\nPlease see the attached price sheet for the 10 inch ring light kit. All details are in the file.\n\nQ1: USB-C powered only, no internal battery.\nQ2: freight figures are in the sheet, row 18 and 19.\n\nBest regards,\nGrace Tan\nShenzhen Lumi Electronics Co., Ltd',
  attachments: [{
    name: 'Lumi_RFQ0422_pricing.xlsx', type: 'xlsx', truncated: false,
    transcript: '[XLSX TRANSCRIPT — sheet "Quote", 21 rows x 4 cols]\n\nA1  SHENZHEN LUMI ELECTRONICS CO LTD\nA2  Quotation for\tRFQ-2026-0422\nA3  Date\t2026-08-30\nA5  Item\t10" bi-colour LED ring light + 1.6m tripod + BT remote + retail box\n\nA7  QTY (sets)\tUNIT PRICE USD\tTERM\tNOTE\nA8  500\t7.60\tFOB Shenzhen\t-\nA9  1000\t7.20\tFOB Shenzhen\t-\nA10 3000\t6.85\tFOB Shenzhen\tcolour box free\n\nA12 MOQ\t500 sets\nA13 Lead time\t25 days after deposit\nA14 Validity\t15 days\nA15 Payment\t30% T/T deposit, 70% before shipment\nA16 Sample\tUSD 25 per set, 5 days, refundable on order\nA17 Certification\tCE (EMC/LVD) cert no. CE-2025-88410; RoHS SGS no. RH-25-7712; FCC ID 2AXYZ-LM10\nA18 Sea freight\tUSD 1,250 per 20GP to Nhava Sheva\nA19 Air freight\tUSD 4.80 per kg to Delhi\nA20 Private label\tYes, your logo on unit and colour box, no tooling fee\nA21 Tooling\tUSD 0 (existing mould, custom colour box only)'
  }],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0422', match_how: 'subject',
    fields: { price_at_target_usd: 7.20, moq_pcs: 500, lead_lo: 25, lead_hi: 25, incoterm: 'FOB', currency: 'USD', certs_canon: ['CE', 'RoHS', 'FCC'], pl: 'yes' },
    gaps: [], gates: [],
    eligibility_before_review: 'eligible', eligibility_after_review: 'superseded'
  }
},

{
  id: 'em_s07', sample_id: 's07', supplier_id: 'sup_bright', rfq_id: 'rfq_0422',
  format: 'csv', label: 'CSV covering three products at once',
  blurb: 'One code, three SKUs. Suspiciously cheap, only one certificate, and payment fully in advance.',
  tags: ['csv', 'multi-sku', 'outlier', 'payment-risk', 'cert-fail'],
  from_name: 'Sunny Ho', from: 'sunny@gzbright-trade.com', to: BUYER.email,
  date: '2026-09-02T04:30:00Z',
  subject: 'Re: RFQ-2026-0422 — price list for 3 items',
  body_raw: 'Hi Vfulfill,\n\nWe quote the ring light you asked and also two related items you may need. See the CSV.\n\nPayment must be 100% T/T before production, our factory does not accept deposit terms for new customers.\n\nQ1: USB powered.\n\nSunny Ho\nGuangzhou Bright Trading Co., Ltd',
  attachments: [{
    name: 'bright_pricelist.csv', type: 'csv', truncated: false,
    transcript: '[CSV TRANSCRIPT — bright_pricelist.csv, 4 rows]\n\nitem,qty,unit_price_usd,term,moq,lead_days,cert,private_label\n10 inch LED ring light with tripod and remote,1000,3.90,FOB Guangzhou,500,22,CE,yes\nSelfie stick tripod 1.1m,1000,2.40,FOB Guangzhou,1000,20,CE,yes\nPhone clamp holder metal,1000,0.85,FOB Guangzhou,2000,18,none,yes'
  }],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0422', match_how: 'subject',
    fields: { price_at_target_usd: 3.90, moq_pcs: 500, lead_lo: 22, lead_hi: 22, incoterm: 'FOB', currency: 'USD', certs_canon: ['CE'], pl: 'yes' },
    gaps: ['validity', 'sample', 'ship_sea', 'ship_air', 'q2'],
    gates: ['UNMATCHED_LINE_ITEM', 'PAYMENT_RISK', 'PRICE_OUTLIER', 'CERT_UNVERIFIED'],
    eligibility_before_review: 'needs_review', eligibility_after_review: 'disqualified'
  }
},

{
  id: 'em_s08', sample_id: 's08', supplier_id: 'sup_optic', rfq_id: 'rfq_0422',
  format: 'screenshot', label: 'WeChat screenshot, two speakers',
  blurb: 'Prices sit in a chat between our buyer and the supplier. A second DDP figure is mixed in and validity is never given.',
  tags: ['screenshot', 'chat', 'ddp', 'per-set'],
  from_name: 'Leo Fang', from: 'leo.fang@hz-optic.cn', to: BUYER.email,
  date: '2026-09-03T13:44:00Z',
  subject: 'RFQ-2026-0422 as discussed on WeChat',
  body_raw: 'Hi Rohan,\n\nAs promised, screenshot of our chat with the prices. Everything we agreed is there.\n\nLeo\nHuizhou Optic Technology',
  attachments: [{
    name: 'wechat_20260903.png', type: 'screenshot', truncated: false,
    transcript: '[SCREENSHOT TRANSCRIPT — WeChat conversation, 2 participants: "Rohan (Vfulfill)" and "Leo Fang — Huizhou Optic"]\n\nRohan (Vfulfill), 13:02\n  Leo, can you quote RFQ-2026-0422? 1000 sets, ring light + tripod + remote, our logo.\n\nLeo Fang — Huizhou Optic, 13:05\n  yes we can. $7.8/set incl tripod+remote, FOB Shenzhen\n\nLeo Fang — Huizhou Optic, 13:05\n  MOQ 300 sets only, we are flexible for new client\n\nRohan (Vfulfill), 13:07\n  lead time?\n\nLeo Fang — Huizhou Optic, 13:08\n  看情况 depends on the colour box artwork\n\nLeo Fang — Huizhou Optic, 13:11\n  ok checked with production, 15 days after artwork approve\n\nRohan (Vfulfill), 13:12\n  certs?\n\nLeo Fang — Huizhou Optic, 13:14\n  CE, RoHS, FCC all have. cert numbers HZ-CE-3391, HZ-RH-3392, FCC ID 2BKLM-RL10\n\nLeo Fang — Huizhou Optic, 13:15\n  if you want door to door we can do DDP Delhi $9.40/set\n\nRohan (Vfulfill), 13:16\n  payment?\n\nLeo Fang — Huizhou Optic, 13:17\n  30/70, deposit and balance before shipment. sample $28 free freight collect'
  }],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0422', match_how: 'subject',
    fields: { price_at_target_usd: 7.80, moq_pcs: 300, lead_lo: 15, lead_hi: 15, incoterm: 'FOB', currency: 'USD', certs_canon: ['CE', 'RoHS', 'FCC'], pl: 'yes' },
    gaps: ['validity', 'ship_sea', 'ship_air', 'q1', 'q2'],
    gates: ['INCOTERM_MISMATCH', 'BODY_ATTACH_CONFLICT'],
    eligibility_before_review: 'needs_review', eligibility_after_review: 'eligible'
  }
},

{
  id: 'em_s09', sample_id: 's09', supplier_id: 'sup_lumi', rfq_id: 'rfq_0422',
  format: 'inline', label: 'Revised quotation from the same supplier',
  blurb: 'Supersedes the Excel quote and makes any existing comparison stale.',
  tags: ['revision', 'supersede'],
  from_name: 'Grace Tan', from: 'grace.tan@lumi-electronics.com', to: BUYER.email,
  date: '2026-09-06T08:05:00Z',
  subject: 'RFQ-2026-0422 — revised quotation',
  body_raw: 'Dear Sir/Madam,\n\nRevised quotation, please use this one instead of our sheet of 30 August. Our LED driver supplier reduced the price.\n\n500 sets: USD 7.30 / set\n1000 sets: USD 6.95 / set\n3000 sets: USD 6.60 / set\nFOB Shenzhen. All other terms unchanged: MOQ 500 sets, 25 days after deposit, 30/70 T/T, sample USD 25 refundable, CE / RoHS / FCC as before, private label included, no tooling fee.\n\nThis revised price is valid 10 days.\n\nQ1 USB-C only, no battery. Q2 sea USD 1,250 per 20GP, air USD 4.80 per kg.\n\nBest regards,\nGrace Tan\nShenzhen Lumi Electronics Co., Ltd',
  attachments: [],
  expected: {
    kind: 'revision', rfq_code: 'RFQ-2026-0422', match_how: 'subject',
    fields: { price_at_target_usd: 6.95, moq_pcs: 500, lead_lo: 25, lead_hi: 25, incoterm: 'FOB', currency: 'USD', certs_canon: ['CE', 'RoHS', 'FCC'], pl: 'yes' },
    gaps: [], gates: [],
    eligibility_before_review: 'eligible', eligibility_after_review: 'eligible'
  }
},

{
  id: 'em_s10', sample_id: 's10', supplier_id: 'sup_packpro', rfq_id: 'rfq_0431',
  format: 'link', label: 'Prices behind a marketplace link',
  blurb: 'No numbers in the email at all. Nothing can be compared until someone opens the link.',
  tags: ['link-only', 'no-price'],
  from_name: 'Vivian Zhou', from: 'vivian@packpro-dg.com', to: BUYER.email,
  date: '2026-09-01T10:12:00Z',
  subject: 'Re: RFQ-2026-0431 kraft mailer box',
  body_raw: 'Hello,\n\nAll our mailer box prices are on our 1688 shop, please check there and tell me which model you want:\n\nhttps://shop1688.example.com/packpro/mailer-boxes\nhttps://drive.example.com/folder/packpro-catalogue-2026\n\nWe are FSC certified. Artwork in AI or PDF with 3mm bleed.\n\nVivian\nDongguan PackPro',
  attachments: [],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0431', match_how: 'subject',
    fields: { price_at_target_usd: null, moq_pcs: null, lead_lo: null, lead_hi: null, incoterm: null, currency: null, certs_canon: ['FSC'], pl: 'n/a' },
    gaps: ['price_tiers', 'moq', 'lead_time', 'validity', 'payment', 'sample', 'price_basis', 'q1'],
    gates: ['PRICE_EXTERNAL_ONLY', 'CRITICAL_FIELD_MISSING', 'CERT_UNVERIFIED'],
    eligibility_before_review: 'needs_review', eligibility_after_review: 'disqualified'
  }
},

{
  id: 'em_s11', sample_id: 's11', supplier_id: 'sup_qingdao', rfq_id: 'rfq_0431',
  format: 'inline', label: 'Typo in the code, priced per thousand',
  blurb: 'Subject has a letter O instead of zero. Price is per 1,000 pcs, MOQ is double our order, and only stock sizes are offered.',
  tags: ['fuzzy-code', 'per-1000', 'moq-high', 'spec-deviation'],
  from_name: 'Sophie Wang', from: 'sophie.wang@qdpaperco.com', to: BUYER.email,
  date: '2026-09-04T01:30:00Z',
  subject: 'Quotation for RFQ 2026-O431 mailer box',
  body_raw: 'Dear buyer,\n\nOur price for kraft mailer box, 250gsm e-flute, 1 colour print:\n\nUSD 310 per 1000 pcs for our stock size 240 x 180 x 60 mm.\nMOQ 20,000 pcs.\nLead time 35 days after artwork approval.\nValidity 20 days.\nPayment 30% deposit 70% before shipment.\nFSC certified, chain of custody no. SGSCH-COC-004821.\n\nPlease note we can only offer stock sizes at this price. Your size 240 x 180 x 70 mm is custom, it needs a new cutting die: add USD 0.04 per pc and 45 days lead time.\n\nQ1: 50 pcs per bundle, 500 pcs per carton.\nQ2: PDF with 3 mm bleed, outlined fonts.\n\nBest regards,\nSophie Wang\nQingdao Paper Converting Co., Ltd',
  attachments: [],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0431', match_how: 'subject',
    fields: { price_at_target_usd: 0.31, moq_pcs: 20000, lead_lo: 35, lead_hi: 35, incoterm: null, currency: 'USD', certs_canon: ['FSC'], pl: 'n/a' },
    gaps: ['price_basis'],
    gates: ['RFQ_CODE_FUZZY', 'UNIT_CONVERTED', 'MOQ_EXCEEDS_TARGET', 'SPEC_DEVIATION', 'TIER_INTERPOLATED', 'CRITICAL_FIELD_MISSING'],
    eligibility_before_review: 'needs_review', eligibility_after_review: 'disqualified'
  }
},

{
  id: 'em_s12', sample_id: 's12', supplier_id: 'sup_shprint', rfq_id: 'rfq_0431',
  format: 'inline', label: 'Questions instead of a quote',
  blurb: 'Not a quotation at all. Someone has to answer before this supplier can bid.',
  tags: ['clarification', 'not-a-quote'],
  from_name: 'Daniel Shen', from: 'daniel@sh-printpack.com', to: BUYER.email,
  date: '2026-09-05T07:20:00Z',
  subject: 'Re: RFQ-2026-0431 — a few questions before quoting',
  body_raw: 'Hi,\n\nBefore we quote we need to confirm three things:\n\n1. Is 240 x 180 x 70 mm the internal or external dimension?\n2. Do you need the print on the outside only, or inside as well?\n3. Can you send the artwork so we can check the print area?\n\nOnce we have these we can send the price within one working day.\n\nDaniel Shen\nShanghai Print Pack',
  attachments: [],
  expected: {
    kind: 'clarification', rfq_code: 'RFQ-2026-0431', match_how: 'subject',
    fields: {}, gaps: [], gates: ['CLARIFICATION_REPLY_NEEDED'],
    eligibility_before_review: 'awaiting', eligibility_after_review: 'awaiting'
  }
},

{
  id: 'em_s13', sample_id: 's13', supplier_id: 'sup_silitech', rfq_id: 'rfq_0417',
  format: 'inline', label: 'The same quote re-sent',
  blurb: 'A chase-up that repeats an earlier quote. Should be recognised before any AI call is made.',
  tags: ['duplicate'],
  from_name: 'Alice Chen', from: 'alice.chen@silitech-sz.com', to: BUYER.email,
  date: '2026-09-04T02:00:00Z',
  subject: 'Re: RFQ-2026-0417 collapsible silicone bottle 550ml — quotation',
  body_raw: 'Dear Vfulfill team,\n\nThank you for the enquiry. Our quotation for the 550ml collapsible silicone bottle follows.\n\nUnit price, FOB Shenzhen, USD:\n1,000 - 2,999 pcs: USD 2.55 / pc\n3,000 - 4,999 pcs: USD 2.42 / pc\n5,000 pcs and above: USD 2.28 / pc\n\nMOQ: 1,000 pcs\nProduction lead time: 28 days after deposit\nQuotation valid until 30 September 2026\nPayment: 30% T/T deposit, 70% against copy of B/L\n\nCertification: FDA 21 CFR 177.2600 test report no. SHF-2025-11842 and LFGB report no. LFG-2025-0663, both issued by SGS. Copies attached in our next mail if you need them.\nPrivate label: yes, we do OEM. Your logo 1-colour pad print on the body, and your artwork on the kraft box, both free of tooling charge.\nProduct: custom moulded to your drawing, not a stock item.\n\nSample: USD 30 per set, 7 days, refunded on your first bulk order.\n\nQ1 Pantone: yes, we can match Pantone 2211 C, silicone colour matching fee USD 60 one time.\nQ2 Carton: 40 pcs per carton, 60 x 40 x 35 cm, 12 kg gross.\nQ3 Colours: up to 3 body colours in one order, 1,000 pcs minimum per colour.\n\nSea freight to Nhava Sheva is around USD 780 per 20GP, air around USD 5.20 per kg, both for your reference only.\n\nBest regards,\nAlice Chen | Sales Manager\nShenzhen SiliTech Housewares Co., Ltd\nTel +86 755 8812 4471',
  attachments: [],
  expected: {
    kind: 'quote', rfq_code: 'RFQ-2026-0417', match_how: 'subject',
    fields: {}, gaps: [], gates: [],
    eligibility_before_review: 'duplicate', eligibility_after_review: 'duplicate'
  }
}

];

var FORMATS = [
  { key: 'inline',     label: 'Inline text',       hint: 'Quote written in the email body' },
  { key: 'pdf',        label: 'PDF',               hint: 'Formal quotation document' },
  { key: 'xlsx',       label: 'Excel',             hint: 'Price sheet workbook' },
  { key: 'csv',        label: 'CSV',               hint: 'Exported price list' },
  { key: 'photo',      label: 'Cropped photo',     hint: 'Camera shot of a printed rate card' },
  { key: 'screenshot', label: 'Chat screenshot',   hint: 'WeChat or WhatsApp conversation' },
  { key: 'link',       label: 'Link only',         hint: 'Prices live on a marketplace page' },
  { key: 'thread',     label: 'Reply thread',      hint: 'Our RFQ quoted underneath' }
];


/* Predefined attachment transcripts for the composer. {{placeholders}} are filled from the chosen enquiry. */
var ATT_TEMPLATES = {
  inline: { body: 'Dear {{buyer}},\n\nThank you for your enquiry {{code}}. Our quotation for the {{product}}:\n\nUnit price, FOB Shenzhen, USD:\n{{tier1}} {{units}}: USD {{price_hi}} / {{unit}}\n{{tier2}} {{units}}: USD {{price}} / {{unit}}\n{{tier3}} {{units}} and above: USD {{price_lo}} / {{unit}}\n\nMOQ: {{tier1}} {{units}}\nLead time: 25 days after deposit\nValid until {{valid}}\nPayment: 30% T/T deposit, 70% before shipment\nCertification: {{certs}}, report copies on request\nPrivate label: yes, your logo on product and box\nSample: USD 30, 7 days, refunded on order\n\nBest regards,\nSales Team\n{{supplier}}' },
  pdf: { name: 'Quotation-{{codeshort}}.pdf', transcript: '[PDF TRANSCRIPT — 1 page, text layer extracted]\n\n{{SUPPLIER}}\nQUOTATION       No. QT-{{codeshort}}      Date: {{date}}\n\nTo: {{buyer}}            Ref: {{code}}\n\nItem: {{product}}\n\n  QTY ({{units}})        UNIT PRICE (USD)      TERM\n  {{tier1}} - {{tier2m}}    {{price_hi}}                  FOB Shenzhen\n  {{tier2}} - {{tier3m}}    {{price}}                  FOB Shenzhen\n  {{tier3}} +          {{price_lo}}                  FOB Shenzhen\n\nMOQ                 {{tier1}} {{units}}\nLead time           30 days after receipt of deposit\nValidity            30 days from date of quotation\nPayment             40% T/T deposit, balance before shipment\nSample              USD 45, 10 days, not refundable\nCertification       {{certs}} — report available on request\nOEM / private label Accepted' },
  xlsx: { name: 'pricing_{{codeshort}}.xlsx', transcript: '[XLSX TRANSCRIPT — sheet "Quote", 18 rows x 4 cols]\n\nA1  {{SUPPLIER}}\nA2  Quotation for\t{{code}}\nA3  Date\t{{date}}\nA5  Item\t{{product}}\n\nA7  QTY ({{units}})\tUNIT PRICE USD\tTERM\tNOTE\nA8  {{tier1}}\t{{price_hi}}\tFOB Shenzhen\t-\nA9  {{tier2}}\t{{price}}\tFOB Shenzhen\t-\nA10 {{tier3}}\t{{price_lo}}\tFOB Shenzhen\tbox free\n\nA12 MOQ\t{{tier1}} {{units}}\nA13 Lead time\t25 days after deposit\nA14 Validity\t15 days\nA15 Payment\t30% T/T deposit, 70% before shipment\nA16 Sample\tUSD 25, 5 days, refundable on order\nA17 Certification\t{{certs}} cert numbers on request\nA18 Private label\tYes, your logo on unit and box' },
  csv: { name: 'pricelist.csv', transcript: '[CSV TRANSCRIPT — pricelist.csv, 3 rows]\n\nitem,qty,unit_price_usd,term,moq,lead_days,cert,private_label\n{{product}},{{qty}},{{price}},FOB Guangzhou,{{tier1}},22,{{cert1}},yes\nGift box for {{product}},{{qty}},0.45,FOB Guangzhou,{{tier2}},20,none,yes' },
  photo: { name: 'IMG_{{datecompact}}_1904.jpg', transcript: '[PHOTO TRANSCRIPT — printed rate card shot at an angle, right edge of the sheet is outside the frame]\n\n报价单 / QUOTATION            日期 {{date}}\n\n品名 Item: {{product}}\n\n数量 QTY (箱/ctn)   单价 RMB/pcs      交期        [CUT OFF]\n50 - 99             ¥{{rmb_hi}}           25天        [CUT OFF]\n100 - 199           ¥{{rmb_cut}}          25天        [CUT OFF]\n200 以上            ¥1[ILLEGIBLE]      30天        [CUT OFF]\n\n起订量 MOQ: 50 箱 (40 pcs/箱)\n包装 40 pcs/ctn   60 x 40 x 35 cm   12 kg\n认证 Certification: {{cert1}}\n备注: 价格不含运费 (price excludes freight)  [CUT OFF]' },
  screenshot: { name: 'wechat_{{datecompact}}.png', transcript: '[SCREENSHOT TRANSCRIPT — WeChat conversation, 2 participants: "Rohan ({{buyer}})" and "Sales — {{supplier}}"]\n\nRohan ({{buyer}}), 13:02\n  can you quote {{code}}? {{qty}} {{units}}, {{product}}, our logo.\n\nSales — {{supplier}}, 13:05\n  yes we can. ${{price}}/{{unit}}, FOB Shenzhen\n\nSales — {{supplier}}, 13:05\n  MOQ {{tier1}} {{units}} only\n\nRohan ({{buyer}}), 13:07\n  lead time?\n\nSales — {{supplier}}, 13:11\n  15 days after artwork approve\n\nRohan ({{buyer}}), 13:12\n  certs?\n\nSales — {{supplier}}, 13:14\n  {{certs}} all have\n\nSales — {{supplier}}, 13:15\n  if you want door to door we can do DDP Delhi ${{price_ddp}}/{{unit}}\n\nRohan ({{buyer}}), 13:16\n  payment?\n\nSales — {{supplier}}, 13:17\n  30/70, deposit and balance before shipment. sample $28 free freight collect' },
  link: { body: 'Hello,\n\nAll our prices are on our 1688 shop, please check there and tell me which model you want:\n\nhttps://shop1688.example.com/{{supplierslug}}/catalogue\n\nWe are {{certs}} certified. Logo printing available.\n\nSales Team\n{{supplier}}' },
  thread: { body: 'Hi team,\n\nThanks for including us. Price will be USD {{price_lo}}-{{price_hi}} depending on colour and packing. MOQ {{tier2}} {{units}}. We do OEM, logo print is fine.\n\nLet me know the final colour and we will confirm exactly.\n\nSales Team\n\nOn {{sent}}, {{buyer}} <{{buyeremail}}> wrote:\n> Dear supplier,\n>\n> Please quote {{code}}, {{product}}.\n> Target quantity {{qty}} {{units}}. Our target price is USD {{band_lo}} - {{band_hi}} FOB.\n> Required: {{certs}}, private label.\n>\n> Please include MOQ, lead time, validity, payment terms and sample cost.\n>\n> {{buyer}}' }
};

var SAMPLE_LINES_30 = RFQS.filter(function (r) { return r.id === 'rfq_0440'; })[0].items.map(function (it) {
  return { sku: it.sku, product: it.product, spec: it.spec, qty: it.qty, unit: it.unit, floor: it.target_usd_fob.lo, ceiling: it.target_usd_fob.hi };
});

root.SEED = {
  meta: META, suppliers: SUPPLIERS, rfqs: RFQS, emails: EMAILS,
  formats: FORMATS, buyer: BUYER, templates: ATT_TEMPLATES, sampleLines30: SAMPLE_LINES_30
};

})(typeof window !== 'undefined' ? window : globalThis);
