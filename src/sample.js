/* Quote Desk — sample dataset engine.
   PRNG (mulberry32), product catalog, sampleRequest, draftPayload.
   Loaded after generator.js; adds to root.GENERATOR. */
(function (root) {
'use strict';
var G = root.GENERATOR;

/* ---- PRNG (mulberry32) ----------------------------------------------- */

G.rng = function (seed) {
  var s = seed >>> 0;
  function r() {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  r.seed = seed >>> 0;
  r.int = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  r.pick = function (arr) { return arr[r.int(0, arr.length - 1)]; };
  r.chance = function (p) { return r() < p; };
  r.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = r.int(0, i);
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  };
  r.take = function (arr, n) { return r.shuffle(arr).slice(0, n); };
  r.weighted = function (pairs) {
    var total = 0, i;
    for (i = 0; i < pairs.length; i++) total += pairs[i][1];
    var roll = r() * total;
    for (i = 0; i < pairs.length; i++) {
      roll -= pairs[i][1];
      if (roll <= 0) return pairs[i][0];
    }
    return pairs[pairs.length - 1][0];
  };
  return r;
};

G.newSeed = function () { return Date.now() % 1679616; };
G.seedLabel = function (seed) { return ('000' + ((seed >>> 0) % 1679616).toString(36)).slice(-4); };
G.seedFromLabel = function (label) { return parseInt(label, 36) >>> 0; };

/* ---- Product catalog -------------------------------------------------- */

var FAMILIES = [
  {
    id: 'silicone',
    names: ['Private-label silicone kitchenware range', 'Custom silicone kitchen tools collection'],
    spec: 'Food-grade silicone (BPA-free), custom colour per Pantone, 1-colour logo imprint, individual kraft sleeve or retail box.',
    certs: ['FDA', 'LFGB'],
    suppliers: ['sup_silitech', 'sup_homeware', 'sup_kaida'],
    ports: ['Nhava Sheva, India', 'Rotterdam, Netherlands', 'Los Angeles, USA'],
    usdLo: 1.2, usdHi: 6.5,
    items: [
      { p: 'Silicone spatula, 32 cm', s: 'Silicone head, stainless handle, heat-safe to 230°C, custom colour, individual poly bag.' },
      { p: 'Silicone whisk, 28 cm', s: 'Silicone-coated wires, stainless handle, heat-safe to 230°C, custom colour.' },
      { p: 'Silicone basting brush, 23 cm', s: 'Silicone bristles, stainless handle, heat-safe to 230°C, custom colour.' },
      { p: 'Silicone turner, 35 cm', s: 'Wide slotted silicone head, stainless handle, heat-safe to 230°C.' },
      { p: 'Silicone tongs, 30 cm', s: 'Silicone tips, stainless body, locking ring, heat-safe to 230°C.' },
      { p: 'Silicone oven mitt pair', s: 'Food-grade silicone, non-slip grip pattern, heat-safe to 230°C, one size fits most.' },
      { p: 'Silicone baking mat, 40×30 cm', s: 'Non-stick, oven-safe to 230°C, graduated markings, BPA-free.' },
      { p: 'Silicone ice cube tray, 15-cavity', s: 'Flexible BPA-free silicone, lid included, 4×4 cm cavities, custom colour.' },
      { p: 'Silicone steamer basket, 26 cm', s: 'Collapsible food-grade silicone, BPA-free, folding handles, for pots 26–30 cm.' },
      { p: 'Silicone colander, 24 cm', s: 'Collapsible BPA-free silicone, standing base ring, side handles.' },
      { p: 'Silicone pot lid, 26 cm', s: 'Universal fit 24–28 cm, steam-release vent, food-grade silicone, BPA-free.' },
      { p: 'Silicone measuring cups, 4-pc set', s: '1/4 / 1/2 / 3/4 / 1 cup, food-grade silicone, wide pourable spout, custom colour.' },
      { p: 'Silicone bowl scraper', s: 'Flexible curved blade, food-grade silicone, BPA-free, custom colour.' },
      { p: 'Silicone trivet, round 20 cm', s: 'Heat-resistant to 230°C, non-slip ribbed base, food-grade silicone, BPA-free.' }
    ]
  },
  {
    id: 'bamboo',
    names: ['Private-label bamboo kitchen and dining collection', 'Eco bamboo homeware range'],
    spec: 'FSC-certified bamboo, natural or food-safe lacquer finish, custom laser-engraved logo, individual kraft gift box.',
    certs: ['FSC', 'LFGB'],
    suppliers: ['sup_homeware', 'sup_everbright', 'sup_kaida'],
    ports: ['Nhava Sheva, India', 'Rotterdam, Netherlands', 'Long Beach, USA'],
    usdLo: 2.0, usdHi: 14.0,
    items: [
      { p: 'Bamboo cutting board, 40×28 cm', s: 'FSC bamboo, juice groove, rubber feet, edge-grain laminate, oiled finish.' },
      { p: 'Bamboo serving board with handle, 45×20 cm', s: 'FSC bamboo, natural oil finish, integrated hanging hole, live edge.' },
      { p: 'Bamboo salad bowl set, 3-pc', s: '25 / 20 / 15 cm nesting set, FSC bamboo, food-safe lacquer, stackable.' },
      { p: 'Bamboo chopsticks, 5 pairs', s: 'FSC bamboo, natural finish, rounded tips, individual paper sleeve, kraft-box packed.' },
      { p: 'Bamboo serving tray, 40×30 cm', s: 'FSC bamboo, cutout carry handles, natural finish, water-resistant coating.' },
      { p: 'Bamboo coaster set, 6-pc with holder', s: 'FSC bamboo, 10 cm round, cork non-slip base, upright holder, gift-box set.' },
      { p: 'Bamboo trivet set, 3-pc', s: 'FSC bamboo, 15 / 20 / 25 cm round, natural finish, silicone feet.' },
      { p: 'Bamboo rolling pin, 48 cm', s: 'FSC bamboo, fixed hardwood handles, smooth surface, custom laser logo.' },
      { p: 'Bamboo cheese board with tools, 5-pc', s: 'FSC bamboo, slide-out drawer, 4 stainless tools, ribbon, gift box.' },
      { p: 'Bamboo kitchen organiser, 4-compartment', s: 'FSC bamboo, removable dividers, natural finish, fits standard 30 cm drawer.' },
      { p: 'Bamboo paper towel holder, countertop', s: 'FSC bamboo, weighted base, removable vertical arm, natural finish.' },
      { p: 'Bamboo utensil holder, 3-slot', s: 'FSC bamboo, three compartments, natural finish, 12 cm diameter base.' },
      { p: 'Bamboo bread bin with lid', s: 'FSC bamboo, ventilation holes, slide-up bamboo lid, natural finish.' },
      { p: 'Bamboo spice rack, 6-tier', s: 'FSC bamboo, wall-mount or countertop, 6 removable shelves, natural finish.' }
    ]
  },
  {
    id: 'drinkware',
    names: ['Stainless steel drinkware and insulated bottles range', 'Private-label hydration and beverage collection'],
    spec: 'Double-wall 18/8 stainless steel, vacuum-sealed, BPA-free lid, custom powder-coat colour, 1-colour logo print.',
    certs: ['FDA', 'LFGB'],
    suppliers: ['sup_ningbo', 'sup_everbright', 'sup_kaida'],
    ports: ['Nhava Sheva, India', 'Hamburg, Germany', 'Long Beach, USA'],
    usdLo: 3.5, usdHi: 20.0,
    items: [
      { p: 'Vacuum insulated tumbler, 450 ml', s: 'Double-wall 18/8 SS, powder-coat, slide lid, BPA-free lid, stays cold 24 h / hot 12 h.' },
      { p: 'Coffee travel mug, 350 ml', s: 'Double-wall SS, push-button flip lid, drip-proof, BPA-free, powder-coat.' },
      { p: 'Stainless steel water bottle, 750 ml', s: 'Double-wall SS, loop-cap lid, powder-coat, BPA-free, wide-mouth 48 mm.' },
      { p: 'Insulated food jar, 500 ml', s: 'Double-wall SS, wide-mouth, fold-flat spoon lid, BPA-free, powder-coat.' },
      { p: 'Double-wall coffee cup, 300 ml', s: 'Double-wall SS, open-top, powder-coat, BPA-free, 8 cm base diameter.' },
      { p: 'Stainless straw set, 4-pc with cleaning brush', s: '8.5 mm SS straws, 2 bent + 2 straight, cleaning brush, cotton pouch.' },
      { p: 'Sports water bottle with straw lid, 600 ml', s: 'Single-wall 304 SS, straw lid, powder-coat, BPA-free, 74 mm base.' },
      { p: 'Protein shaker bottle, 700 ml', s: 'Double-wall SS, screw lid with loop, BPA-free, powder-coat, includes agitator.' },
      { p: 'Insulated wine tumbler, 300 ml', s: 'Double-wall SS, stemless design, powder-coat, BPA-free, 8 cm base.' },
      { p: 'Hip flask, 240 ml', s: 'Single-wall SS, funnel included, hinged cap, laser-engrave logo area on face.' },
      { p: 'Stainless steel lunch box, 1.2 L', s: 'Double-wall SS, leak-proof lid, wide-mouth 90 mm, BPA-free, powder-coat.' },
      { p: 'Bento box, 2-tier, 1.5 L total', s: 'Double-wall SS, removable divider, BPA-free lid clips, wide-mouth.' },
      { p: 'Insulated carafe, 1 L', s: 'Double-wall SS, push-button pour spout, powder-coat, BPA-free, 1000 ml.' }
    ]
  },
  {
    id: 'led',
    names: ['LED lighting and smart home range', 'Private-label LED home and office lighting collection'],
    spec: 'CE, RoHS and FCC certified; 100–240 V universal input; custom retail colour box with logo; min. 5,000 h rated life.',
    certs: ['CE', 'RoHS', 'FCC'],
    suppliers: ['sup_lumi', 'sup_optic', 'sup_bright'],
    ports: ['Nhava Sheva, India', 'Rotterdam, Netherlands', 'Los Angeles, USA'],
    usdLo: 5.0, usdHi: 38.0,
    items: [
      { p: 'LED ring light 10", with tripod and BT remote', s: '10" bi-colour LED ring, 1.6 m aluminium tripod, phone clamp, USB-C powered.' },
      { p: 'LED strip light kit, 5 m, warm + cool', s: '60 LEDs/m, 5 m reel, controller, 12 V adaptor, self-adhesive, cuttable.' },
      { p: 'Desk lamp with wireless charger base', s: 'Foldable arm, 5 colour temps, 5 brightness levels, 10 W Qi charging base.' },
      { p: 'Clip-on book light, 3 brightness levels', s: 'USB-C rechargeable, 350 lm, flexible arm, warm/cool switch, clip mount.' },
      { p: 'LED night light, motion sensor, plug-in', s: '0.5 W, auto on/off PIR, 3000 K warm white, EU/UK/US plug options.' },
      { p: 'Smart LED bulb E27, app control', s: 'RGBW 9 W, 800 lm, Wi-Fi 2.4 GHz, works with Alexa/Google Home, E27 base.' },
      { p: 'LED panel light 60×60 cm, 40W', s: 'Back-lit 40 W, 4000 K neutral white, 3200 lm, 600 mm ceiling tile size, driver included.' },
      { p: 'Solar outdoor flood light, 30W', s: '2000 lm, IP65, PIR motion sensor, 8 h runtime on full charge, warm white.' },
      { p: 'Portable camping lantern, 800 lm', s: 'USB-C rechargeable, 3 brightness modes, foldable, IPX4 splash-proof.' },
      { p: 'Fairy string lights, 10 m, 100 LEDs', s: 'Copper wire, 8 flash modes, USB powered, 2700 K warm white, memory wire.' },
      { p: 'Under-cabinet light bar, 40 cm', s: 'Plug-in, 6 W, 3000 K warm white, touch on/off switch, linkable up to 4 units.' },
      { p: 'LED bathroom mirror light, 60 cm', s: 'IP44, 3000–6000 K adjustable, USB-A shaving port, 800 lm, 60 cm bar.' },
      { p: 'Portable desk spotlight, 5 W USB-C', s: 'Eye-care 95+ CRI, 3 colour temps, foldable gooseneck, clip + flat base.' }
    ]
  },
  {
    id: 'eco',
    names: ['Eco lunch and hydration range', 'Sustainable on-the-go essentials collection'],
    spec: 'BPA-free food-grade materials (silicone, stainless steel, borosilicate glass); custom silk-print or laser-engraved logo.',
    certs: ['FDA', 'LFGB'],
    suppliers: ['sup_ningbo', 'sup_xiamen', 'sup_everbright'],
    ports: ['Nhava Sheva, India', 'Rotterdam, Netherlands', 'Felixstowe, UK'],
    usdLo: 2.0, usdHi: 16.0,
    items: [
      { p: 'Collapsible silicone water bottle, 550 ml', s: 'Food-grade silicone body, PP lid with carabiner, custom colour, individual kraft box.' },
      { p: 'Silicone insulated lunch bag, 10 L', s: 'Food-grade silicone exterior, insulated lining, carry strap, zip closure.' },
      { p: 'Bamboo-lid stainless bento box, 1 L', s: 'Stainless 304 inner, FSC bamboo lid, 2 compartments, leak-proof silicone seal.' },
      { p: 'Stainless snack box, 400 ml', s: 'Single-wall 304 SS, hinged lid, food-grade gasket, wide-mouth, BPA-free.' },
      { p: 'Borosilicate glass water bottle, 500 ml', s: 'Heat-resistant glass body, BPA-free PP lid, silicone sleeve, 500 ml capacity.' },
      { p: 'Reusable silicone zip bag set, 3-pc', s: '500 / 1000 / 1500 ml food-grade silicone, double zipper, dishwasher-safe.' },
      { p: 'Insulated lunch cooler bag, 18 L', s: 'PEVA lining, EPE foam insulation, zip closure, carry handles, custom print.' },
      { p: 'Glass meal prep container set, 5-pc', s: 'Borosilicate glass, locking PP lids, oven/microwave-safe, BPA-free lids.' },
      { p: 'Stainless straw and carry-case set', s: '2×SS straws, 1 silicone straw, cleaning brush, drawstring cotton carry pouch.' },
      { p: 'Bamboo cutlery travel set, 5-pc', s: 'FSC bamboo fork/knife/spoon/chopsticks/straw, cotton drawstring bag.' },
      { p: 'Collapsible silicone cup, 300 ml', s: 'Food-grade silicone body, folds flat to 2 cm, BPA-free PP lid, custom colour.' },
      { p: 'Reusable sandwich bag, 2-pc set', s: 'Food-grade PEVA, press-seal zip, dishwasher-safe, 2-colour custom print.' },
      { p: 'Silicone food storage bag, 500 ml', s: 'Food-grade silicone, double zipper, stand-up gusseted base, BPA-free.' }
    ]
  },
  {
    id: 'kraft',
    names: ['Kraft paper packaging range', 'Eco-friendly kraft gift packaging collection'],
    spec: 'FSC-certified kraft board, custom 1–4 colour print, food-safe coatings available on request, fully recyclable.',
    certs: ['FSC', 'ISO9001'],
    suppliers: ['sup_packpro', 'sup_qingdao', 'sup_shprint'],
    ports: ['Nhava Sheva, India', 'Felixstowe, UK', 'Rotterdam, Netherlands'],
    usdLo: 0.15, usdHi: 3.0,
    items: [
      { p: 'Kraft gift box, 20×15×8 cm, lid-and-base', s: 'Natural kraft 350 gsm, 1-colour print, ribbon pull, plain white interior.' },
      { p: 'Kraft mailer box, 25×20×5 cm', s: 'Natural kraft 350 gsm, tuck-in auto-lock lid, 1-colour inside print.' },
      { p: 'Kraft tissue paper, 50×70 cm, 24-sheet pack', s: 'Acid-free 17 gsm MF tissue, custom 1-colour print, wrapped in OPP.' },
      { p: 'Kraft tote bag, 35×30×12 cm', s: '150 gsm kraft paper, twisted-cord handles, gusset base, 1-colour print.' },
      { p: 'Kraft stand-up pouch, 14×22×4 cm', s: 'Kraft/PET laminate, zip-lock reseal, tear notch, 2-colour custom print.' },
      { p: 'Kraft hang tag, 7×4 cm, with cotton string', s: '350 gsm kraft, 2-colour both sides, eyelet, 30 cm cotton string.' },
      { p: 'Kraft packing paper, 50×75 cm, 100-sheet ream', s: 'Natural kraft 40 gsm, unprinted, acid-free, wrap-and-label packing.' },
      { p: 'Kraft corner protectors, 5 cm, 200-pack', s: 'Natural kraft 350 gsm, self-locking fold, protects edges up to 5 cm board.' },
      { p: 'Kraft pillow box, 18×10×5 cm', s: 'Natural kraft 350 gsm, ribbon slit, 1-colour print, fold-flat for shipping.' },
      { p: 'Kraft round box with lid, 15 cm dia.×8 cm', s: 'Natural kraft 350 gsm, lid-and-base, ribbon pull, 1-colour print.' },
      { p: 'Kraft wine box, single bottle', s: 'Natural kraft 350 gsm, die-cut carry handle, 1-colour print, tissue lined.' },
      { p: 'Kraft gable box, 16×10×16 cm', s: 'Natural kraft 350 gsm, integrated carry handle, 1-colour print, auto-lock base.' },
      { p: 'Kraft flat-pack shipping box, 30×20×10 cm', s: 'Double-wall kraft, RSC style, 200# burst test, unprinted or 1-colour.' }
    ]
  },
  {
    id: 'retail',
    names: ['Retail display and printed packaging range', 'Custom retail packaging and point-of-sale collection'],
    spec: 'SBS or coated duplex board, full-colour offset print, gloss or matte laminate, FSC-certified substrate available.',
    certs: ['FSC', 'ISO9001'],
    suppliers: ['sup_packpro', 'sup_shprint', 'sup_sunrise', 'sup_qingdao'],
    ports: ['Nhava Sheva, India', 'Felixstowe, UK', 'Long Beach, USA'],
    usdLo: 0.2, usdHi: 3.5,
    items: [
      { p: 'Retail colour box, 18×12×6 cm, auto-bottom', s: 'SBS 350 gsm, full-colour 4-colour offset, matte laminate, auto-bottom.' },
      { p: 'Window display box, 20×15×8 cm', s: 'SBS 350 gsm, full-colour offset, PVC window panel, tuck-top lid.' },
      { p: 'Custom shipper box, 40×30×25 cm', s: 'Corrugated B-flute, 2-colour print, regular slotted container, 32 ECT.' },
      { p: 'Blister card, 12×18 cm', s: 'SBS 350 gsm, full-colour offset, heat-seal coating for standard blister.' },
      { p: 'Folding carton, 15×10×3 cm', s: 'SBS 300 gsm, full-colour offset, gloss laminate, straight-tuck end.' },
      { p: 'Magnetic closure gift box, 25×20×10 cm', s: 'Art board 2 mm, full-colour offset, matte laminate, magnetic flap closure.' },
      { p: 'Rigid gift box, 30×20×12 cm', s: '2 mm greyboard wrapped in art paper, full-colour print, ribbon tie.' },
      { p: 'Plastic clamshell, 15×12×5 cm', s: 'RPET 0.5 mm, thermoformed, hinge, matching SBS insert card with full-colour print.' },
      { p: 'Drawer box with ribbon, 20×14×6 cm', s: 'Art board 2 mm, full-colour sleeve, ribbon pull, velvet-flocked base.' },
      { p: 'Round hat box, 30 cm dia.×15 cm', s: '2 mm greyboard, wrapped art paper, full-colour print, ribbon carry handle.' },
      { p: 'Tube packaging, 8 cm dia.×25 cm', s: 'Paperboard tube 350 gsm, full-colour wrap print, press-fit metal cap.' },
      { p: 'Sleeve packaging, 20×15×8 cm inner', s: 'SBS 350 gsm, full-colour sleeve over plain interior box, matte laminate.' },
      { p: 'Counter display unit, 6-pocket A5', s: 'Corrugated E-flute, 4-colour print, flat-pack, self-assemble, 6×A5 pockets.' }
    ]
  },
  {
    id: 'office',
    names: ['Home office accessories and organiser range', 'Private-label desk accessories and workspace collection'],
    spec: 'ABS/aluminium construction, custom colour and logo, CE and RoHS certified for electronic items, retail colour box.',
    certs: ['CE', 'RoHS'],
    suppliers: ['sup_lumi', 'sup_kaida', 'sup_bright'],
    ports: ['Nhava Sheva, India', 'Long Beach, USA', 'Rotterdam, Netherlands'],
    usdLo: 3.5, usdHi: 30.0,
    items: [
      { p: 'Wireless phone charger, 15 W Qi, slim pad', s: '15 W Qi2, USB-C input, LED charging indicator, 6 mm slim, custom logo area.' },
      { p: 'Cable organiser box, 20×15×10 cm', s: 'ABS lid, fabric inner liner, cable-exit cutouts on four sides, custom colour.' },
      { p: 'Foldable laptop stand, aluminium', s: '6-angle adjustable, anodised aluminium, non-slip silicone pads, folds flat.' },
      { p: 'Monitor stand with drawer, 2-tier', s: 'MDF + ABS, 2× USB-A 5 V pass-through ports, removable storage drawer.' },
      { p: 'Modular desk organiser, 5-piece', s: 'ABS, stackable modules: pen / card / letter / paper tray / phone, custom colour.' },
      { p: 'USB 3.0 hub, 4-port slim', s: '4× USB 3.0 Type-A, 5 Gbps, bus-powered, 25 cm cable, custom colour.' },
      { p: 'Wireless mouse pad with USB hub', s: '15 W Qi pad + 2× USB-A, 600×300 mm, stitched edge, custom full-colour print.' },
      { p: 'Adjustable document holder, A4', s: 'ABS, spring clip, 4-angle adjustable, letter-size, weighted non-slip base.' },
      { p: 'Cable management clips, 10-pc pack', s: 'Self-adhesive silicone, 5-slot channel, reusable, custom colour, mixed sizes.' },
      { p: 'Pen and pencil holder, 3-compartment', s: 'ABS, removable dividers, circular 12 cm base, non-slip pads, custom colour.' },
      { p: 'Under-desk drawer organiser, magnetic mount', s: 'ABS, magnetic clip-on to steel desk, 2 compartments, slide-open drawer.' },
      { p: 'Keyboard wrist rest, memory foam, 43 cm', s: 'Memory foam, PU leather cover, non-slip base, 43×10 cm, custom logo print.' },
      { p: 'Sticky note and memo holder', s: 'ABS, holds 76×76 mm pads, integrated pen tray, non-slip base, custom colour.' }
    ]
  }
];

var FAMILY_BY_ID = {};
FAMILIES.forEach(function (f) { FAMILY_BY_ID[f.id] = f; });

var RANGES_7 = FAMILIES.map(function (f) {
  return { name: f.names[0], spec: f.spec, certs: f.certs, ports: f.ports, families: [f.id] };
});

var RANGES_30 = [
  { name: 'Private-label kitchen and dining range',
    spec: 'Food-grade silicone and FSC bamboo items; BPA-free; custom Pantone colour and laser-engraved logo on every SKU.',
    certs: ['FDA', 'LFGB', 'FSC'], ports: ['Nhava Sheva, India', 'Rotterdam, Netherlands'],
    families: ['silicone', 'bamboo', 'eco'] },
  { name: 'Eco lunch and hydration collection',
    spec: 'Double-wall stainless steel and BPA-free silicone; custom powder-coat or silk-print; sustainable packaging.',
    certs: ['FDA', 'LFGB'], ports: ['Nhava Sheva, India', 'Long Beach, USA'],
    families: ['drinkware', 'eco', 'bamboo'] },
  { name: 'Home office lighting and accessories range',
    spec: 'CE/RoHS/FCC LED products and ABS desk accessories; custom colour and logo; retail colour box.',
    certs: ['CE', 'RoHS', 'FCC'], ports: ['Nhava Sheva, India', 'Rotterdam, Netherlands'],
    families: ['led', 'office', 'drinkware'] },
  { name: 'Retail and gift packaging collection',
    spec: 'FSC-certified kraft and SBS board; full-colour offset print; matte or gloss laminate; fully recyclable.',
    certs: ['FSC', 'ISO9001'], ports: ['Nhava Sheva, India', 'Felixstowe, UK'],
    families: ['kraft', 'retail', 'office'] },
  { name: 'Silicone kitchenware and eco storage range',
    spec: 'Food-grade silicone and borosilicate glass; BPA-free; custom Pantone colour; 1-colour logo imprint.',
    certs: ['FDA', 'LFGB'], ports: ['Nhava Sheva, India', 'Los Angeles, USA'],
    families: ['silicone', 'eco', 'bamboo'] },
  { name: 'LED lighting and sustainable hydration range',
    spec: 'CE/RoHS/FCC LED lighting plus double-wall stainless drinkware; custom colour and logo on every SKU.',
    certs: ['CE', 'RoHS', 'FDA'], ports: ['Nhava Sheva, India', 'Rotterdam, Netherlands'],
    families: ['led', 'drinkware', 'office'] }
];

var Q_POOL = [
  { t: 'Can you match a custom Pantone colour on this product?', req: true },
  { t: 'Carton dimensions, pieces per carton, and gross weight?', req: true },
  { t: 'Sample cost and lead time — is sample cost refunded on order?', req: true },
  { t: 'What payment terms do you accept for a first order?', req: false },
  { t: 'Can you confirm that our logo will appear on every unit?', req: false },
  { t: 'Can you meet the certification requirements stated above?', req: false },
  { t: 'How long is this quotation valid?', req: false },
  { t: 'Can you provide a sea freight estimate to our destination port?', req: false },
  { t: 'Minimum order quantity per SKU if we order multiple variants?', req: false },
  { t: 'Can the full range be consolidated into a single shipment?', req: false },
  { t: 'Tooling or mould charges, if any, and who retains ownership?', req: false },
  { t: 'Do you accept partial deposits to start production?', req: false }
];

/* ---- sampleRequest ----------------------------------------------------- */

G.sampleRequest = function (rng, size) {
  var isLarge = size > 10;
  var rangeSet = isLarge ? RANGES_30 : RANGES_7;
  var range = rng.pick(rangeSet);
  var fams = range.families.map(function (id) { return FAMILY_BY_ID[id]; });

  var pool = [];
  fams.forEach(function (fam) {
    fam.items.forEach(function (it) { pool.push({ fam: fam, it: it }); });
  });

  var chosen = rng.take(pool, size);

  var seen = {};
  var items = chosen.map(function (entry, i) {
    var fam = entry.fam;
    var it = entry.it;
    var lo = fam.usdLo;
    var hi = fam.usdHi;
    var spread = hi - lo;
    var floor = Math.round((lo + rng() * spread * 0.5) * 100) / 100;
    var ceiling = Math.round((floor + spread * 0.2 + rng() * spread * 0.4) * 100) / 100;
    if (ceiling <= floor) ceiling = Math.round(floor * 1.35 * 100) / 100;

    var prefix = fam.id.slice(0, 3).toUpperCase();
    var base = prefix + '-' + ('00' + (i + 1)).slice(-2);
    var sku = base;
    var suffix = 0;
    while (seen[sku]) { suffix++; sku = base + String.fromCharCode(64 + suffix); }
    seen[sku] = 1;

    var baseQty = rng.pick([500, 1000, 2000, 3000, 5000]);
    return {
      sku: sku,
      product: it.p,
      spec: it.s,
      qty: baseQty,
      unit: 'pc',
      floor: floor,
      ceiling: ceiling,
      tier_qtys: [Math.round(baseQty / 2), baseQty, baseQty * 2]
    };
  });

  var supPool = [];
  fams.forEach(function (fam) {
    fam.suppliers.forEach(function (sid) {
      if (supPool.indexOf(sid) === -1) supPool.push(sid);
    });
  });
  var numRec = rng.int(3, Math.min(4, supPool.length));
  var recipients = rng.take(supPool, numRec);

  var port = rng.pick(range.ports);
  var numQ = rng.int(3, 5);
  var questions = rng.take(Q_POOL, numQ).map(function (q) {
    return { text: q.t, required: q.req };
  });

  return {
    title: range.name,
    spec: range.spec,
    items: items,
    required_certs: range.certs.slice(),
    pl_required: rng.chance(0.7),
    custom_required: rng.chance(0.6),
    max_lead_days: rng.int(25, 45),
    dest_port: port,
    custom_questions: questions,
    recipients: recipients,
    sample_seed: rng.seed
  };
};

/* ---- draftPayload ------------------------------------------------------ */

G.draftPayload = function (draft) {
  var items = draft.items || [];
  if (items.length > 1) {
    return {
      product: draft.title || draft.product || '',
      spec_summary: draft.spec || draft.spec_summary || '',
      items: items.map(function (it) {
        return { sku: it.sku, qty: Number(it.qty) || 0, floor: Number(it.floor) || 0, ceiling: Number(it.ceiling) || 0, spec: it.spec || '' };
      }),
      required_certs: (draft.required_certs || []).slice(),
      pl_required: draft.pl_required != null ? draft.pl_required : null,
      custom_required: draft.custom_required != null ? draft.custom_required : null,
      max_lead_days: Number(draft.max_lead_days) || 0,
      dest_port: draft.dest_port || '',
      custom_questions: (draft.custom_questions || []).slice()
    };
  }
  var it = items[0] || {};
  return {
    product: it.product || draft.title || draft.product || '',
    spec_summary: draft.spec || draft.spec_summary || it.spec || '',
    target_qty: Number(it.qty) || 0,
    tier_qtys: (it.tier_qtys || []).slice(),
    target_usd_fob: { lo: Number(it.floor) || 0, hi: Number(it.ceiling) || 0 },
    required_certs: (draft.required_certs || []).slice(),
    pl_required: draft.pl_required != null ? draft.pl_required : null,
    custom_required: draft.custom_required != null ? draft.custom_required : null,
    max_lead_days: Number(draft.max_lead_days) || 0,
    dest_port: draft.dest_port || '',
    custom_questions: (draft.custom_questions || []).slice()
  };
};

})(typeof window !== 'undefined' ? window : globalThis);
