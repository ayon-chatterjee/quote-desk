/* Reference extractions: what a correct read of each sample looks like.
   Used by the node tests, and by the page when the viewer has no AI available.
   Always labelled in the UI as a reference read, never passed off as an AI result. */
(function (root) {
'use strict';

function F(v, u, c, ev, src) { return { v: v, u: u || null, c: c == null ? 0.95 : c, ev: ev || null, src: src || 'body' }; }

var REF = {

s01: {
  sv: 1, kind: 'quote', lang: ['en'],
  supplier: { name: F('Shenzhen SiliTech Housewares Co., Ltd', null, 0.98, 'Shenzhen SiliTech Housewares Co., Ltd'), person: F('Alice Chen', null, 0.98, 'Alice Chen | Sales Manager'), role: 'factory' },
  items: [{ i: 1, rfq_code: 'RFQ-2026-0417', c: 0.99, product: F('Collapsible silicone bottle 550ml', null, 0.97, '550ml collapsible silicone bottle'),
    f: {
      price_tiers: F([{ qmin: 1000, qmax: 2999, p: 2.55, qu: 'pc' }, { qmin: 3000, qmax: 4999, p: 2.42, qu: 'pc' }, { qmin: 5000, qmax: null, p: 2.28, qu: 'pc' }], 'USD/pc', 0.97, '1,000 - 2,999 pcs: USD 2.55 / pc'),
      currency: F('USD', null, 0.98, 'Unit price, FOB Shenzhen, USD:'),
      price_basis: F({ incoterm: 'FOB', place: 'Shenzhen', incl_tax: null, incl_freight: false }, null, 0.97, 'FOB Shenzhen'),
      moq: F({ n: 1000, u: 'pcs', pack: 40 }, 'pcs', 0.98, 'MOQ: 1,000 pcs'),
      lead_time: F({ lo: 28, hi: 28, u: 'days', from: 'deposit' }, 'days', 0.97, 'Production lead time: 28 days after deposit'),
      validity: F({ until: '2026-09-30' }, null, 0.96, 'Quotation valid until 30 September 2026'),
      certs: F([{ name: 'FDA 21 CFR 177.2600', canon: 'FDA', scope: 'product', doc: true }, { name: 'LFGB', canon: 'LFGB', scope: 'product', doc: true }], null, 0.95, 'FDA 21 CFR 177.2600 test report no. SHF-2025-11842'),
      private_label: F({ ans: 'yes', cond: null }, null, 0.97, 'Private label: yes, we do OEM.'),
      oem_odm: F('oem', null, 0.9, 'we do OEM'),
      stock_type: F('custom', null, 0.93, 'custom moulded to your drawing, not a stock item'),
      sample: F({ cost: 30, cur: 'USD', days: 7, refundable: true }, null, 0.95, 'Sample: USD 30 per set, 7 days, refunded on your first bulk order.'),
      payment: F({ terms: '30% T/T deposit, 70% against copy of B/L' }, null, 0.96, 'Payment: 30% T/T deposit, 70% against copy of B/L'),
      ship_sea: F({ price: 780, cur: 'USD', per: '20GP', to: 'Nhava Sheva' }, null, 0.9, 'Sea freight to Nhava Sheva is around USD 780 per 20GP'),
      ship_air: F({ price: 5.20, cur: 'USD', per: 'kg', to: 'Nhava Sheva' }, null, 0.88, 'air around USD 5.20 per kg'),
      one_time_costs: F([{ what: 'silicone colour matching', amt: 60, cur: 'USD' }], null, 0.9, 'silicone colour matching fee USD 60 one time'),
      carton: F({ pcs: 40, l_cm: 60, w_cm: 40, h_cm: 35, gw_kg: 12 }, null, 0.95, 'Q2 Carton: 40 pcs per carton, 60 x 40 x 35 cm, 12 kg gross.'),
      custom: [
        { qid: 'q1', v: 'Yes, Pantone 2211 C can be matched, USD 60 one-off fee', c: 0.95, ev: 'yes, we can match Pantone 2211 C', src: 'body' },
        { qid: 'q2', v: '40 pcs/carton, 60 x 40 x 35 cm, 12 kg', c: 0.96, ev: 'Q2 Carton: 40 pcs per carton, 60 x 40 x 35 cm, 12 kg gross.', src: 'body' },
        { qid: 'q3', v: 'Up to 3 body colours, 1000 pcs minimum per colour', c: 0.94, ev: 'up to 3 body colours in one order', src: 'body' }
      ]
    } }],
  gaps: [], flags: [], needs_human: [], assumed: []
},

s02: {
  sv: 1, kind: 'quote', lang: ['en'],
  supplier: { name: F('Dongguan Homeware Industrial Co., Ltd', null, 0.97, 'Dongguan Homeware Industrial Co., Ltd'), person: F('Kevin Luo', null, 0.96, 'Kevin Luo'), role: 'factory' },
  items: [{ i: 1, rfq_code: 'RFQ-2026-0417', c: 0.98, product: F('Collapsible silicone bottle 550ml, custom colour, 1C logo', null, 0.95, 'Collapsible silicone bottle 550ml, custom colour, 1C logo', 'att:DGH-Quotation-0417.pdf'),
    f: {
      price_tiers: F([{ qmin: 2000, qmax: 2999, p: 2.78, qu: 'pc' }, { qmin: 3000, qmax: 4999, p: 2.65, qu: 'pc' }, { qmin: 5000, qmax: null, p: 2.51, qu: 'pc' }], 'USD/pc', 0.72, '3,000 - 4,999    2.65                  FOB Shenzhen', 'att:DGH-Quotation-0417.pdf'),
      currency: F('USD', null, 0.96, 'UNIT PRICE (USD)', 'att:DGH-Quotation-0417.pdf'),
      price_basis: F({ incoterm: 'FOB', place: 'Shenzhen', incl_tax: null, incl_freight: false }, null, 0.95, 'FOB Shenzhen', 'att:DGH-Quotation-0417.pdf'),
      moq: F({ n: 2000, u: 'pcs', pack: 50 }, 'pcs', 0.96, 'MOQ                 2,000 pcs', 'att:DGH-Quotation-0417.pdf'),
      lead_time: F({ lo: 30, hi: 30, u: 'days', from: 'deposit' }, 'days', 0.95, 'Lead time           30 days after receipt of deposit', 'att:DGH-Quotation-0417.pdf'),
      validity: F({ days: 30 }, null, 0.93, 'Validity            30 days from date of quotation', 'att:DGH-Quotation-0417.pdf'),
      certs: F([{ name: 'FDA (food contact)', canon: 'FDA', scope: 'product', doc: false }], null, 0.9, 'Certification       FDA (food contact) — report available on request', 'att:DGH-Quotation-0417.pdf'),
      private_label: F({ ans: 'yes', cond: null }, null, 0.94, 'OEM / private label Accepted', 'att:DGH-Quotation-0417.pdf'),
      stock_type: F('custom', null, 0.8, 'custom colour, 1C logo', 'att:DGH-Quotation-0417.pdf'),
      sample: F({ cost: 45, cur: 'USD', days: 10, refundable: false }, null, 0.94, 'Sample              USD 45 / set, 10 days, not refundable', 'att:DGH-Quotation-0417.pdf'),
      payment: F({ terms: '40% T/T deposit, balance before shipment' }, null, 0.95, 'Payment             40% T/T deposit, balance before shipment', 'att:DGH-Quotation-0417.pdf'),
      carton: F({ pcs: 50, l_cm: 62, w_cm: 42, h_cm: 38 }, null, 0.93, 'Q2 Carton: 50 pcs / carton, 62 x 42 x 38 cm.'),
      custom: [
        { qid: 'q1', v: 'Yes', c: 0.93, ev: 'Q1 Pantone 2211 C: yes.', src: 'body' },
        { qid: 'q2', v: '50 pcs per carton, 62 x 42 x 38 cm', c: 0.94, ev: 'Q2 Carton: 50 pcs / carton, 62 x 42 x 38 cm.', src: 'body' },
        { qid: 'q3', v: '2 colours per order', c: 0.92, ev: 'Q3: 2 colours per order.', src: 'body' }
      ]
    } }],
  gaps: [{ i: 1, field: 'price_tiers', kind: 'conflict', note: 'The email says USD 2.45 at 3000 pcs, the attached quotation says USD 2.65', ev: 'USD 2.45 per pc at 3000 pcs', src: 'body' }],
  flags: [],
  needs_human: [{ code: 'BODY_ATTACH_CONFLICT', i: 1, field: 'price_tiers', note: 'Email body USD 2.45 vs PDF USD 2.65 at our quantity, and MOQ 2000 in both',
    evs: [{ ev: 'USD 2.45 per pc at 3000 pcs', src: 'body' }, { ev: '3,000 - 4,999    2.65                  FOB Shenzhen', src: 'att:DGH-Quotation-0417.pdf' }] }],
  assumed: []
},

s03: {
  sv: 1, kind: 'quote', lang: ['zh', 'en'],
  supplier: { name: F('YIWU HONGDA TRADING CO., LTD', null, 0.9, 'YIWU HONGDA TRADING CO., LTD', 'att:IMG_20260828_1904.jpg'), person: F('Hongda', null, 0.7, 'Hongda'), role: 'trading' },
  items: [{ i: 1, rfq_code: null, c: 0.6, product: F('折叠硅胶水杯 550ml / Collapsible silicone bottle 550ml', null, 0.9, '折叠硅胶水杯 550ml  Collapsible silicone bottle 550ml', 'att:IMG_20260828_1904.jpg'),
    f: {
      price_tiers: F([{ qmin: 50, qmax: 99, p: 16.80, qu: 'ctn' }, { qmin: 100, qmax: 199, p: null, qu: 'ctn' }], 'CNY/pc', 0.55, '50 - 99             ¥16.80           25天', 'att:IMG_20260828_1904.jpg'),
      currency: F('CNY', null, 0.95, '单价 RMB/pcs', 'att:IMG_20260828_1904.jpg'),
      moq: F({ n: 50, u: 'ctn', pack: 40 }, 'ctn', 0.9, '起订量 MOQ: 50 箱 (40 pcs/箱)', 'att:IMG_20260828_1904.jpg'),
      lead_time: F({ lo: 25, hi: 25, u: 'days', from: null }, 'days', 0.85, '25天', 'att:IMG_20260828_1904.jpg'),
      certs: F([{ name: 'FDA', canon: 'FDA', scope: 'product', doc: false }], null, 0.85, '认证 Certification: FDA', 'att:IMG_20260828_1904.jpg'),
      private_label: F({ ans: 'yes', cond: null }, null, 0.75, 'we can print your logo'),
      carton: F({ pcs: 40, l_cm: 60, w_cm: 40, h_cm: 35, gw_kg: 12 }, null, 0.9, '包装 40 pcs/ctn   60 x 40 x 35 cm   12 kg', 'att:IMG_20260828_1904.jpg')
    } }],
  gaps: [
    { i: 1, field: 'price_tiers', kind: 'ambiguous', note: 'Second tier price reads ¥15.[?]0, one digit is unreadable', ev: '100 - 199           ¥15.[?]0          25天', src: 'att:IMG_20260828_1904.jpg' },
    { i: 1, field: 'price_tiers', kind: 'truncated', note: 'The third tier price and the whole right-hand column are outside the photo', ev: '200 以上            ¥1[ILLEGIBLE]      30天        [CUT OFF]', src: 'att:IMG_20260828_1904.jpg' },
    { i: 1, field: 'price_basis', kind: 'missing', note: 'No incoterm anywhere; the card only says freight is excluded' },
    { i: 1, field: 'validity', kind: 'missing', note: 'No validity period on the card' },
    { i: 1, field: 'payment', kind: 'missing', note: 'No payment terms given' }
  ],
  flags: [],
  needs_human: [{ code: 'RFQ_MATCH_LOW_CONF', i: 1, field: null, note: 'No reference code anywhere. The product matches the 550ml bottle enquiry but the sender is not on its recipient list.', evs: [] }],
  assumed: []
},

s04: {
  sv: 1, kind: 'quote', lang: ['zh'],
  supplier: { name: F('宁波瑞器制品有限公司', null, 0.93, '宁波瑞器制品有限公司'), person: F('王丽', null, 0.95, '王丽'), role: 'factory' },
  items: [{ i: 1, rfq_code: 'RFQ-2026-0417', c: 0.96, product: F('折叠硅胶水杯 550ml (collapsible silicone bottle 550ml)', null, 0.94, '折叠硅胶水杯 550ml'),
    f: {
      price_tiers: F([{ qmin: 1000, qmax: 2999, p: 16.50, qu: 'pc' }, { qmin: 3000, qmax: null, p: 15.60, qu: 'pc' }], 'CNY/pc', 0.94, '3000 个以上：¥15.60/个'),
      currency: F('CNY', null, 0.97, '¥15.60/个'),
      price_basis: F({ incoterm: 'EXW', place: '宁波 / Ningbo', incl_tax: true, incl_freight: false }, null, 0.95, '以上价格为 EXW宁波 含税，不含运费。'),
      moq: F({ n: 1000, u: 'pcs', pack: 40 }, 'pcs', 0.95, '起订量 1000 个。'),
      lead_time: F({ lo: 25, hi: 25, u: 'days', from: 'deposit' }, 'days', 0.94, '交期：定金后 25 天。'),
      validity: F({ days: 30 }, null, 0.93, '报价有效期 30 天。'),
      certs: F([{ name: 'FDA', canon: 'FDA', scope: 'product', doc: true }, { name: 'LFGB', canon: 'LFGB', scope: 'product', doc: true }], null, 0.93, '认证：FDA 和 LFGB 都有，报告号 NB-FD-2451 / NB-LG-2452。'),
      private_label: F({ ans: 'conditional', cond: '3000个以上可以印logo (logo printing only at 3000 pcs and above)' }, null, 0.92, '3000个以上可以印logo，低于3000个我们不接受定制印刷。'),
      stock_type: F('custom', null, 0.9, '产品为定制开模，不是现货。'),
      sample: F({ cost: 200, cur: 'CNY', days: 7, refundable: true }, null, 0.9, '样品：¥200/个，7天，下单后退还。'),
      payment: F({ terms: '30% 定金，70% 发货前付清 (30% deposit, 70% before shipment)' }, null, 0.93, '付款：30% 定金，70% 发货前付清。'),
      carton: F({ pcs: 40, l_cm: 58, w_cm: 40, h_cm: 34, gw_kg: 11.5 }, null, 0.92, 'Q2 包装：40 pcs/箱，58 x 40 x 34 cm，11.5 kg。'),
      custom: [
        { qid: 'q1', v: '可以匹配 / yes, Pantone 2211 C can be matched', c: 0.93, ev: 'Q1 Pantone 2211 C 可以匹配。', src: 'body' },
        { qid: 'q2', v: '40 pcs/箱, 58 x 40 x 34 cm, 11.5 kg', c: 0.93, ev: 'Q2 包装：40 pcs/箱，58 x 40 x 34 cm，11.5 kg。', src: 'body' },
        { qid: 'q3', v: '一个订单最多 2 种颜色 / at most 2 colours per order', c: 0.92, ev: 'Q3 一个订单最多 2 种颜色。', src: 'body' }
      ]
    } }],
  gaps: [], flags: [],
  needs_human: [{ code: 'CONDITIONAL_PL', i: 1, field: 'private_label', note: 'Logo printing is offered only at 3000 pcs and above', evs: [{ ev: '3000个以上可以印logo，低于3000个我们不接受定制印刷。', src: 'body' }] }],
  assumed: []
},

s05: {
  sv: 1, kind: 'quote', lang: ['en'],
  supplier: { name: F('Xiamen Outdoor Gear', null, 0.8, 'Tony'), person: F('Tony Xu', null, 0.85, 'Tony'), role: 'factory' },
  items: [{ i: 1, rfq_code: 'RFQ-2026-0417', c: 0.95, product: F('Collapsible silicone bottle 550ml', null, 0.7, null),
    f: {
      price_range: F({ lo: 2.3, hi: 2.6 }, 'USD/pc', 0.9, 'Price will be USD 2.3-2.6 depending on colour and print area.'),
      currency: F('USD', null, 0.93, 'USD 2.3-2.6'),
      moq: F({ n: 1500, u: 'pcs', pack: null }, 'pcs', 0.94, 'MOQ 1500 pcs.'),
      private_label: F({ ans: 'yes', cond: null }, null, 0.9, 'We do OEM, logo print is fine.'),
      oem_odm: F('oem', null, 0.9, 'We do OEM'),
      custom: [{ qid: 'q1', v: 'Pantone matching is possible', c: 0.9, ev: 'Q1: Pantone matching is possible.', src: 'body' }]
    } }],
  gaps: [
    { i: 1, field: 'price_tiers', kind: 'partial', note: 'Only a span was given, no firm price at any quantity', ev: 'Price will be USD 2.3-2.6 depending on colour and print area.', src: 'body' },
    { i: 1, field: 'lead_time', kind: 'missing', note: 'No production lead time given' },
    { i: 1, field: 'validity', kind: 'missing', note: 'No validity period given' },
    { i: 1, field: 'payment', kind: 'missing', note: 'No payment terms given' },
    { i: 1, field: 'certs', kind: 'missing', note: 'FDA and LFGB were asked for and are not mentioned' },
    { i: 1, field: 'price_basis', kind: 'missing', note: 'No incoterm given' },
    { i: 1, field: 'sample', kind: 'missing', note: 'No sample cost or time given' }
  ],
  flags: [],
  needs_human: [{ code: 'PRICE_RANGE_ONLY', i: 1, field: 'price_tiers', note: 'Cannot compare on a span; a firm price is needed', evs: [{ ev: 'Price will be USD 2.3-2.6 depending on colour and print area.', src: 'body' }] }],
  assumed: []
},

s06: {
  sv: 1, kind: 'quote', lang: ['en'],
  supplier: { name: F('SHENZHEN LUMI ELECTRONICS CO LTD', null, 0.97, 'SHENZHEN LUMI ELECTRONICS CO LTD', 'att:Lumi_RFQ0422_pricing.xlsx'), person: F('Grace Tan', null, 0.96, 'Grace Tan'), role: 'factory' },
  items: [{ i: 1, rfq_code: 'RFQ-2026-0422', c: 0.98, product: F('10" bi-colour LED ring light + 1.6m tripod + BT remote + retail box', null, 0.96, '10" bi-colour LED ring light + 1.6m tripod + BT remote + retail box', 'att:Lumi_RFQ0422_pricing.xlsx'),
    f: {
      price_tiers: F([{ qmin: 500, qmax: 999, p: 7.60, qu: 'set' }, { qmin: 1000, qmax: 2999, p: 7.20, qu: 'set' }, { qmin: 3000, qmax: null, p: 6.85, qu: 'set' }], 'USD/set', 0.96, 'A9  1000\t7.20\tFOB Shenzhen\t-', 'att:Lumi_RFQ0422_pricing.xlsx'),
      currency: F('USD', null, 0.97, 'UNIT PRICE USD', 'att:Lumi_RFQ0422_pricing.xlsx'),
      price_basis: F({ incoterm: 'FOB', place: 'Shenzhen', incl_freight: false }, null, 0.96, 'FOB Shenzhen', 'att:Lumi_RFQ0422_pricing.xlsx'),
      moq: F({ n: 500, u: 'sets', pack: null }, 'sets', 0.96, 'A12 MOQ\t500 sets', 'att:Lumi_RFQ0422_pricing.xlsx'),
      lead_time: F({ lo: 25, hi: 25, u: 'days', from: 'deposit' }, 'days', 0.95, 'A13 Lead time\t25 days after deposit', 'att:Lumi_RFQ0422_pricing.xlsx'),
      validity: F({ days: 15 }, null, 0.94, 'A14 Validity\t15 days', 'att:Lumi_RFQ0422_pricing.xlsx'),
      certs: F([{ name: 'CE (EMC/LVD)', canon: 'CE', scope: 'product', doc: true }, { name: 'RoHS', canon: 'RoHS', scope: 'product', doc: true }, { name: 'FCC', canon: 'FCC', scope: 'product', doc: true }], null, 0.95, 'CE (EMC/LVD) cert no. CE-2025-88410; RoHS SGS no. RH-25-7712; FCC ID 2AXYZ-LM10', 'att:Lumi_RFQ0422_pricing.xlsx'),
      private_label: F({ ans: 'yes', cond: null }, null, 0.95, 'A20 Private label\tYes, your logo on unit and colour box, no tooling fee', 'att:Lumi_RFQ0422_pricing.xlsx'),
      stock_type: F('mixed', null, 0.85, 'existing mould, custom colour box only', 'att:Lumi_RFQ0422_pricing.xlsx'),
      sample: F({ cost: 25, cur: 'USD', days: 5, refundable: true }, null, 0.94, 'A16 Sample\tUSD 25 per set, 5 days, refundable on order', 'att:Lumi_RFQ0422_pricing.xlsx'),
      payment: F({ terms: '30% T/T deposit, 70% before shipment' }, null, 0.95, 'A15 Payment\t30% T/T deposit, 70% before shipment', 'att:Lumi_RFQ0422_pricing.xlsx'),
      ship_sea: F({ price: 1250, cur: 'USD', per: '20GP', to: 'Nhava Sheva' }, null, 0.93, 'A18 Sea freight\tUSD 1,250 per 20GP to Nhava Sheva', 'att:Lumi_RFQ0422_pricing.xlsx'),
      ship_air: F({ price: 4.80, cur: 'USD', per: 'kg', to: 'Delhi' }, null, 0.92, 'A19 Air freight\tUSD 4.80 per kg to Delhi', 'att:Lumi_RFQ0422_pricing.xlsx'),
      one_time_costs: F([], null, 0.9, 'A21 Tooling\tUSD 0 (existing mould, custom colour box only)', 'att:Lumi_RFQ0422_pricing.xlsx'),
      custom: [
        { qid: 'q1', v: 'USB-C powered only, no internal battery', c: 0.96, ev: 'Q1: USB-C powered only, no internal battery.', src: 'body' },
        { qid: 'q2', v: 'Sea USD 1,250 per 20GP to Nhava Sheva; air USD 4.80 per kg to Delhi', c: 0.93, ev: 'A18 Sea freight\tUSD 1,250 per 20GP to Nhava Sheva', src: 'att:Lumi_RFQ0422_pricing.xlsx' }
      ]
    } }],
  gaps: [], flags: [], needs_human: [], assumed: []
},

s07: {
  sv: 1, kind: 'quote', lang: ['en'],
  supplier: { name: F('Guangzhou Bright Trading Co., Ltd', null, 0.96, 'Guangzhou Bright Trading Co., Ltd'), person: F('Sunny Ho', null, 0.95, 'Sunny Ho'), role: 'trading' },
  items: [
    { i: 1, rfq_code: 'RFQ-2026-0422', c: 0.94, product: F('10 inch LED ring light with tripod and remote', null, 0.95, '10 inch LED ring light with tripod and remote', 'att:bright_pricelist.csv'),
      f: {
        price_tiers: F([{ qmin: 1000, qmax: null, p: 3.90, qu: 'set' }], 'USD/set', 0.9, '10 inch LED ring light with tripod and remote,1000,3.90,FOB Guangzhou,500,22,CE,yes', 'att:bright_pricelist.csv'),
        currency: F('USD', null, 0.93, 'unit_price_usd', 'att:bright_pricelist.csv'),
        price_basis: F({ incoterm: 'FOB', place: 'Guangzhou', incl_freight: false }, null, 0.93, 'FOB Guangzhou', 'att:bright_pricelist.csv'),
        moq: F({ n: 500, u: 'sets', pack: null }, 'sets', 0.92, '500,22,CE,yes', 'att:bright_pricelist.csv'),
        lead_time: F({ lo: 22, hi: 22, u: 'days', from: null }, 'days', 0.9, '500,22,CE,yes', 'att:bright_pricelist.csv'),
        certs: F([{ name: 'CE', canon: 'CE', scope: 'product', doc: false }], null, 0.9, 'CE,yes', 'att:bright_pricelist.csv'),
        private_label: F({ ans: 'yes', cond: null }, null, 0.9, 'private_label', 'att:bright_pricelist.csv'),
        payment: F({ terms: '100% T/T before production' }, null, 0.95, 'Payment must be 100% T/T before production, our factory does not accept deposit terms for new customers.'),
        custom: [{ qid: 'q1', v: 'USB powered', c: 0.9, ev: 'Q1: USB powered.', src: 'body' }]
      } },
    { i: 2, rfq_code: null, c: 0.9, product: F('Selfie stick tripod 1.1m', null, 0.95, 'Selfie stick tripod 1.1m', 'att:bright_pricelist.csv'),
      f: {
        price_tiers: F([{ qmin: 1000, qmax: null, p: 2.40, qu: 'pc' }], 'USD/pc', 0.9, 'Selfie stick tripod 1.1m,1000,2.40,FOB Guangzhou,1000,20,CE,yes', 'att:bright_pricelist.csv'),
        currency: F('USD', null, 0.9, 'unit_price_usd', 'att:bright_pricelist.csv'),
        moq: F({ n: 1000, u: 'pcs', pack: null }, 'pcs', 0.88, 'Selfie stick tripod 1.1m,1000,2.40,FOB Guangzhou,1000,20,CE,yes', 'att:bright_pricelist.csv')
      } },
    { i: 3, rfq_code: null, c: 0.9, product: F('Phone clamp holder metal', null, 0.95, 'Phone clamp holder metal', 'att:bright_pricelist.csv'),
      f: {
        price_tiers: F([{ qmin: 1000, qmax: null, p: 0.85, qu: 'pc' }], 'USD/pc', 0.9, 'Phone clamp holder metal,1000,0.85,FOB Guangzhou,2000,18,none,yes', 'att:bright_pricelist.csv'),
        currency: F('USD', null, 0.9, 'unit_price_usd', 'att:bright_pricelist.csv'),
        moq: F({ n: 2000, u: 'pcs', pack: null }, 'pcs', 0.88, 'Phone clamp holder metal,1000,0.85,FOB Guangzhou,2000,18,none,yes', 'att:bright_pricelist.csv')
      } }
  ],
  gaps: [
    { i: 1, field: 'validity', kind: 'missing', note: 'No validity period given' },
    { i: 1, field: 'sample', kind: 'missing', note: 'No sample cost or time given' }
  ],
  flags: [],
  needs_human: [
    { code: 'UNMATCHED_LINE_ITEM', i: 2, field: null, note: 'Selfie stick tripod was not requested in any open enquiry', evs: [{ ev: 'Selfie stick tripod 1.1m', src: 'att:bright_pricelist.csv' }] },
    { code: 'UNMATCHED_LINE_ITEM', i: 3, field: null, note: 'Phone clamp holder was not requested in any open enquiry', evs: [{ ev: 'Phone clamp holder metal', src: 'att:bright_pricelist.csv' }] }
  ],
  assumed: []
},

s08: {
  sv: 1, kind: 'quote', lang: ['en', 'zh'],
  supplier: { name: F('Huizhou Optic Technology', null, 0.95, 'Huizhou Optic Technology'), person: F('Leo Fang', null, 0.95, 'Leo Fang'), role: 'factory' },
  items: [{ i: 1, rfq_code: 'RFQ-2026-0422', c: 0.95, product: F('LED ring light set including tripod and remote', null, 0.9, '$7.8/set incl tripod+remote, FOB Shenzhen', 'att:wechat_20260903.png'),
    f: {
      price_tiers: F([{ qmin: 300, qmax: null, p: 7.80, qu: 'set' }], 'USD/set', 0.88, '$7.8/set incl tripod+remote, FOB Shenzhen', 'att:wechat_20260903.png'),
      currency: F('USD', null, 0.9, '$7.8/set', 'att:wechat_20260903.png'),
      price_basis: F({ incoterm: 'FOB', place: 'Shenzhen', incl_freight: false, alts: [{ incoterm: 'DDP', place: 'Delhi', price: 9.40 }] }, null, 0.85, 'if you want door to door we can do DDP Delhi $9.40/set', 'att:wechat_20260903.png'),
      moq: F({ n: 300, u: 'sets', pack: null }, 'sets', 0.92, 'MOQ 300 sets only, we are flexible for new client', 'att:wechat_20260903.png'),
      lead_time: F({ lo: 15, hi: 15, u: 'days', from: 'artwork_approval' }, 'days', 0.85, 'ok checked with production, 15 days after artwork approve', 'att:wechat_20260903.png'),
      certs: F([{ name: 'CE', canon: 'CE', scope: 'product', doc: true }, { name: 'RoHS', canon: 'RoHS', scope: 'product', doc: true }, { name: 'FCC', canon: 'FCC', scope: 'product', doc: true }], null, 0.9, 'CE, RoHS, FCC all have. cert numbers HZ-CE-3391, HZ-RH-3392, FCC ID 2BKLM-RL10', 'att:wechat_20260903.png'),
      private_label: F({ ans: 'yes', cond: null }, null, 0.72, 'ring light + tripod + remote, our logo', 'att:wechat_20260903.png'),
      sample: F({ cost: 28, cur: 'USD', days: null, refundable: null }, null, 0.85, 'sample $28 free freight collect', 'att:wechat_20260903.png'),
      payment: F({ terms: '30/70, deposit and balance before shipment' }, null, 0.9, '30/70, deposit and balance before shipment', 'att:wechat_20260903.png')
    } }],
  gaps: [
    { i: 1, field: 'validity', kind: 'missing', note: 'Validity was never discussed in the chat' },
    { i: 1, field: 'private_label', kind: 'partial', note: 'Logo was named by our own buyer, not confirmed in the supplier\'s own words', ev: 'ring light + tripod + remote, our logo', src: 'att:wechat_20260903.png' }
  ],
  flags: [],
  needs_human: [{ code: 'BODY_ATTACH_CONFLICT', i: 1, field: 'price_basis', note: 'Two bases quoted in the same chat: FOB Shenzhen $7.80 and DDP Delhi $9.40',
    evs: [{ ev: '$7.8/set incl tripod+remote, FOB Shenzhen', src: 'att:wechat_20260903.png' }, { ev: 'if you want door to door we can do DDP Delhi $9.40/set', src: 'att:wechat_20260903.png' }] }],
  assumed: []
},

s09: {
  sv: 1, kind: 'revision', lang: ['en'],
  supplier: { name: F('Shenzhen Lumi Electronics Co., Ltd', null, 0.97, 'Shenzhen Lumi Electronics Co., Ltd'), person: F('Grace Tan', null, 0.96, 'Grace Tan'), role: 'factory' },
  items: [{ i: 1, rfq_code: 'RFQ-2026-0422', c: 0.98, product: F('10 inch LED ring light kit', null, 0.9, 'Revised quotation, please use this one instead of our sheet of 30 August.'),
    f: {
      price_tiers: F([{ qmin: 500, qmax: 999, p: 7.30, qu: 'set' }, { qmin: 1000, qmax: 2999, p: 6.95, qu: 'set' }, { qmin: 3000, qmax: null, p: 6.60, qu: 'set' }], 'USD/set', 0.96, '1000 sets: USD 6.95 / set'),
      currency: F('USD', null, 0.97, 'USD 6.95 / set'),
      price_basis: F({ incoterm: 'FOB', place: 'Shenzhen', incl_freight: false }, null, 0.96, 'FOB Shenzhen.'),
      moq: F({ n: 500, u: 'sets', pack: null }, 'sets', 0.95, 'MOQ 500 sets'),
      lead_time: F({ lo: 25, hi: 25, u: 'days', from: 'deposit' }, 'days', 0.95, '25 days after deposit'),
      validity: F({ days: 10 }, null, 0.95, 'This revised price is valid 10 days.'),
      certs: F([{ name: 'CE', canon: 'CE', scope: 'product', doc: true }, { name: 'RoHS', canon: 'RoHS', scope: 'product', doc: true }, { name: 'FCC', canon: 'FCC', scope: 'product', doc: true }], null, 0.9, 'CE / RoHS / FCC as before'),
      private_label: F({ ans: 'yes', cond: null }, null, 0.94, 'private label included, no tooling fee'),
      sample: F({ cost: 25, cur: 'USD', days: 5, refundable: true }, null, 0.9, 'sample USD 25 refundable'),
      payment: F({ terms: '30/70 T/T' }, null, 0.93, '30/70 T/T'),
      ship_sea: F({ price: 1250, cur: 'USD', per: '20GP', to: 'Nhava Sheva' }, null, 0.92, 'Q2 sea USD 1,250 per 20GP'),
      ship_air: F({ price: 4.80, cur: 'USD', per: 'kg', to: 'Delhi' }, null, 0.9, 'air USD 4.80 per kg'),
      one_time_costs: F([], null, 0.9, 'no tooling fee'),
      custom: [
        { qid: 'q1', v: 'USB-C only, no battery', c: 0.95, ev: 'Q1 USB-C only, no battery.', src: 'body' },
        { qid: 'q2', v: 'Sea USD 1,250 per 20GP, air USD 4.80 per kg', c: 0.92, ev: 'Q2 sea USD 1,250 per 20GP, air USD 4.80 per kg.', src: 'body' }
      ]
    } }],
  gaps: [], flags: [], needs_human: [], assumed: []
},

s10: {
  sv: 1, kind: 'quote', lang: ['en'],
  supplier: { name: F('Dongguan PackPro', null, 0.95, 'Dongguan PackPro'), person: F('Vivian Zhou', null, 0.94, 'Vivian'), role: 'factory' },
  items: [{ i: 1, rfq_code: 'RFQ-2026-0431', c: 0.9, product: F('Kraft mailer box', null, 0.85, 'All our mailer box prices are on our 1688 shop'),
    f: {
      certs: F([{ name: 'FSC', canon: 'FSC', scope: 'product', doc: false }], null, 0.88, 'We are FSC certified.'),
      photos_links: F(['https://shop1688.example.com/packpro/mailer-boxes', 'https://drive.example.com/folder/packpro-catalogue-2026'], null, 0.95, 'https://shop1688.example.com/packpro/mailer-boxes'),
      custom: [{ qid: 'q2', v: 'AI or PDF with 3mm bleed', c: 0.93, ev: 'Artwork in AI or PDF with 3mm bleed.', src: 'body' }]
    } }],
  gaps: [
    { i: 1, field: 'price_tiers', kind: 'external_only', note: 'No prices in the email; they are on a 1688 shop page we cannot open', ev: 'All our mailer box prices are on our 1688 shop, please check there and tell me which model you want:', src: 'body' },
    { i: 1, field: 'moq', kind: 'missing', note: 'No minimum order stated' },
    { i: 1, field: 'lead_time', kind: 'missing', note: 'No lead time stated' },
    { i: 1, field: 'validity', kind: 'missing', note: 'No validity stated' },
    { i: 1, field: 'payment', kind: 'missing', note: 'No payment terms stated' }
  ],
  flags: [],
  needs_human: [{ code: 'PRICE_EXTERNAL_ONLY', i: 1, field: 'price_tiers', note: 'Someone has to open the 1688 shop and pick a model before this can be compared', evs: [{ ev: 'https://shop1688.example.com/packpro/mailer-boxes', src: 'body' }] }],
  assumed: []
},

s11: {
  sv: 1, kind: 'quote', lang: ['en'],
  supplier: { name: F('Qingdao Paper Converting Co., Ltd', null, 0.96, 'Qingdao Paper Converting Co., Ltd'), person: F('Sophie Wang', null, 0.95, 'Sophie Wang'), role: 'factory' },
  items: [{ i: 1, rfq_code: 'RFQ-2026-0431', c: 0.95, product: F('Kraft mailer box 250gsm e-flute, 1 colour print, stock size 240 x 180 x 60 mm', null, 0.93, 'our stock size 240 x 180 x 60 mm'),
    f: {
      price_tiers: F([{ qmin: 20000, qmax: null, p: 310, qu: 'pc' }], 'USD per 1000 pcs', 0.93, 'USD 310 per 1000 pcs for our stock size 240 x 180 x 60 mm.'),
      currency: F('USD', null, 0.96, 'USD 310 per 1000 pcs'),
      moq: F({ n: 20000, u: 'pcs', pack: 500 }, 'pcs', 0.95, 'MOQ 20,000 pcs.'),
      lead_time: F({ lo: 35, hi: 35, u: 'days', from: 'artwork_approval' }, 'days', 0.94, 'Lead time 35 days after artwork approval.'),
      validity: F({ days: 20 }, null, 0.94, 'Validity 20 days.'),
      certs: F([{ name: 'FSC chain of custody', canon: 'FSC', scope: 'product', doc: true }], null, 0.93, 'FSC certified, chain of custody no. SGSCH-COC-004821.'),
      private_label: F({ ans: 'n/a', cond: null }, null, 0.6, null),
      stock_type: F('off_shelf', null, 0.92, 'we can only offer stock sizes at this price'),
      payment: F({ terms: '30% deposit 70% before shipment' }, null, 0.94, 'Payment 30% deposit 70% before shipment.'),
      one_time_costs: F([{ what: 'new cutting die for our custom size', amt: null, cur: 'USD' }], null, 0.85, 'it needs a new cutting die: add USD 0.04 per pc and 45 days lead time'),
      carton: F({ pcs: 500 }, null, 0.9, 'Q1: 50 pcs per bundle, 500 pcs per carton.'),
      custom: [
        { qid: 'q1', v: '50 pcs per bundle, 500 pcs per carton', c: 0.95, ev: 'Q1: 50 pcs per bundle, 500 pcs per carton.', src: 'body' },
        { qid: 'q2', v: 'PDF with 3 mm bleed, outlined fonts', c: 0.95, ev: 'Q2: PDF with 3 mm bleed, outlined fonts.', src: 'body' }
      ]
    } }],
  gaps: [{ i: 1, field: 'price_basis', kind: 'missing', note: 'No incoterm or port given' }],
  flags: [{ code: 'SPEC_DEVIATION', note: 'Priced for their stock 240 x 180 x 60 mm, not our 240 x 180 x 70 mm. Our size adds USD 0.04 per pc and 45 days.', ev: 'Your size 240 x 180 x 70 mm is custom, it needs a new cutting die: add USD 0.04 per pc and 45 days lead time.', src: 'body' }],
  needs_human: [],
  assumed: []
},

s12: {
  sv: 1, kind: 'clarification', lang: ['en'],
  supplier: { name: F('Shanghai Print Pack', null, 0.95, 'Shanghai Print Pack'), person: F('Daniel Shen', null, 0.95, 'Daniel Shen'), role: 'factory' },
  items: [],
  gaps: [], flags: [],
  needs_human: [{ code: 'CLARIFICATION_REPLY_NEEDED', i: null, field: null,
    note: 'They will not quote until we confirm internal vs external dimensions, print on inside or outside only, and send artwork',
    evs: [{ ev: 'Before we quote we need to confirm three things:', src: 'body' }] }],
  assumed: []
},

s13: null

};

root.FALLBACK = REF;

})(typeof window !== 'undefined' ? window : globalThis);
