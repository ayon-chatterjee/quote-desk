/* Quote Desk — state, storage, AI adapters, uploads, routing. */
(function () {
'use strict';
var S = window.SEED, R = window.RULES, P = window.PROMPTS, PL = window.PIPELINE, FB = window.FALLBACK, G = window.GENERATOR;

var A = window.APP = {
  store: null, db: null, sample: null, sampleLimits: null, downloads: null,
  aiReady: null,           // null = unknown, true = usable, false = not available
  deep: false,             // force the strongest model on extraction
  filter: null, toastT: null,
  expected: {}, composed: [], running: {},
  inbox: { seen: {}, syncing: false, autoRead: false, progress: null },
  draft: null, pick: {}
};
S.emails.forEach(function (e) { if (e.expected) A.expected[e.sample_id] = e.expected; });

/* ---- tiny helpers ---------------------------------------------------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function money(v, dp) { return v == null ? '—' : 'USD ' + Number(v).toFixed(dp == null ? 3 : dp); }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
function toast(msg) {
  var t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(A.toastT);
  A.toastT = setTimeout(function () { t.style.display = 'none'; }, 3400);
}
function laneBadge(lane) {
  var m = { rule: ['lane-rule', 'rule'], ai: ['lane-ai', 'claude'], human: ['lane-human', 'you'], reference: ['lane-rule', 'reference'] };
  var x = m[lane] || m.rule;
  return '<span class="lane ' + x[0] + '">' + x[1] + '</span>';
}
function statusChip(st) {
  var m = {
    eligible: ['chip-pass', 'Eligible'], needs_review: ['chip-warn', 'Needs a person'],
    disqualified: ['chip-crit', 'Ruled out'], superseded: ['chip-mute', 'Superseded'],
    awaiting: ['chip-info', 'Awaiting our reply'], parked: ['chip-mute', 'Parked'],
    duplicate: ['chip-mute', 'Duplicate'], failed: ['chip-crit', 'Read failed'],
    unread: ['chip-mute', 'Not read'], received: ['chip-pass', 'Response received'],
    chased: ['chip-info', 'Follow-up sent · awaiting'], awaiting_reply: ['chip-mute', 'Email sent · awaiting response']
  };
  var x = m[st] || ['chip-mute', st];
  return '<span class="chip ' + x[0] + '">' + x[1] + '</span>';
}
A.esc = esc; A.$ = $; A.$$ = $$; A.money = money; A.toast = toast;
A.laneBadge = laneBadge; A.statusChip = statusChip; A.plural = plural;

/* ---- highlight renderer ---------------------------------------------- */
/* Splits the stored source text on verified evidence spans. Never uses innerHTML on raw text. */
A.renderHighlighted = function (text, highlights) {
  text = text || '';
  if (!highlights || !highlights.length) return esc(text);
  var spans = [];
  highlights.forEach(function (h) {
    var i = text.indexOf(h.ev);
    if (i > -1) spans.push({ a: i, b: i + h.ev.length, why: h.why, sev: h.sev });
  });
  spans.sort(function (x, y) { return x.a - y.a || y.b - x.b; });
  var merged = [], last = -1;
  spans.forEach(function (s) { if (s.a >= last) { merged.push(s); last = s.b; } });
  var out = '', cur = 0;
  merged.forEach(function (s) {
    out += esc(text.slice(cur, s.a));
    out += '<mark class="' + (s.sev === 'crit' ? 'crit' : '') + '" title="' + esc(s.why) + '">' + esc(text.slice(s.a, s.b)) + '</mark>';
    cur = s.b;
  });
  return out + esc(text.slice(cur));
};

/* ---- raw email catalogue ------------------------------------------------ */
A.allRaw = function () { return S.emails.concat(A.composed); };
A.arrived = function () { return A.allRaw().filter(function (e) { return A.inbox.seen[e.id]; }); };
A.unsynced = function () { return A.allRaw().filter(function (e) { return !A.inbox.seen[e.id]; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); };
A.emailById = function (id) { return A.store.emails.filter(function (e) { return e.id === id; })[0] || null; };
A.sampleById = function (id) { return A.allRaw().filter(function (e) { return e.id === id; })[0] || null; };
A.quotesFor = function (rfqId) { return A.store.quotes.filter(function (q) { return q.rfq_id === rfqId; }); };
A.openReviews = function () { return A.store.reviews.filter(function (r) { return r.status === 'open'; }); };
A.draftReplies = function () { return A.store.replies.filter(function (r) { return r.status === 'draft'; }); };
A.rfqById = function (id) { return PL.rfqById(A.store, id); };
A.supById = function (id) { return PL.sup(A.store, id); };

/* ---- storage ---------------------------------------------------------- */
var COLLECTIONS = ['emails', 'quotes', 'reviews', 'comparisons', 'evals', 'logs', 'replies', 'samples'];
function plain(o) { return JSON.parse(JSON.stringify(o)); }
function stripBlobs(e) { var c = plain(e); (c.attachments || []).forEach(function (a) { delete a.blob; }); return c; }

A.initDb = function () {
  if (typeof claude === 'undefined' || !claude.use) return Promise.resolve(null);
  return claude.use('db').then(function (db) { A.db = db; return db; }, function () { return null; });
};
A.initDownloads = function () {
  if (typeof claude === 'undefined' || !claude.use) return Promise.resolve(null);
  return claude.use('downloads').then(function (d) { A.downloads = d; return d; }, function () { return null; });
};

A.loadFromDb = function () {
  if (!A.db) return Promise.resolve(false);
  var reads = COLLECTIONS.map(function (c) {
    return A.db.collection(c).limit(400).get().then(function (snap) {
      return { c: c, docs: snap.docs.map(function (d) { return d.data(); }) };
    }, function () { return { c: c, docs: [] }; });
  });
  reads.push(A.db.doc('meta/config').get().then(function (d) { return { c: 'meta', docs: d.exists ? [d.data()] : [] }; }, function () { return { c: 'meta', docs: [] }; }));
  reads.push(A.db.doc('state/inbox').get().then(function (d) { return { c: 'state', docs: d.exists ? [d.data()] : [] }; }, function () { return { c: 'state', docs: [] }; }));
  reads.push(A.db.collection('rfqs').limit(60).get().then(function (s) { return { c: 'rfqs', docs: s.docs.map(function (d) { return d.data(); }) }; }, function () { return { c: 'rfqs', docs: [] }; }));
  return Promise.all(reads).then(function (res) {
    var got = {}; res.forEach(function (r) { got[r.c] = r.docs; });
    var any = got.emails.length || got.samples.length || got.rfqs.length || got.state.length;
    if (!any) return false;
    var st = PL.newStore(S);
    if (got.meta[0]) st.meta = got.meta[0];
    if (got.rfqs.length) st.rfqs = got.rfqs;
    st.emails = got.emails; st.quotes = got.quotes; st.reviews = got.reviews;
    st.comparisons = got.comparisons; st.evals = got.evals; st.logs = got.logs; st.replies = got.replies || [];
    A.store = st;
    A.composed = got.samples || [];
    if (got.state[0]) { A.inbox.seen = {}; (got.state[0].seen || []).forEach(function (id) { A.inbox.seen[id] = true; }); }
    ['rfqs', 'emails', 'quotes', 'reviews', 'comparisons', 'evals', 'logs', 'replies'].forEach(function (c) {
      (st[c] || []).forEach(function (d) { if (d && d.id) saved[c + '/' + safeId(d.id)] = JSON.stringify(d); });
    });
    A.composed.forEach(function (d) { saved['samples/' + safeId(d.id)] = JSON.stringify(d); });
    saved['meta/config'] = JSON.stringify(st.meta);
    saved['state/inbox'] = JSON.stringify(inboxState());
    st.rfqs.forEach(function (r) { PL.refreshEligibility(st, r.id); });
    return true;
  }, function () { return false; });
};

function safeId(id) { return String(id).replace(/[^A-Za-z0-9_.:@+-]/g, '_'); }
function inboxState() { return { id: 'inbox', seen: Object.keys(A.inbox.seen).filter(function (k) { return A.inbox.seen[k]; }) }; }

/* Only documents whose contents actually changed are written, and writes are
   batched behind a short delay, so a burst of clicks does not spend the
   viewer's write budget rewriting the whole store each time. */
var saved = {};
A.persist = function (collection, doc) {
  if (!A.db || !doc || !doc.id) return Promise.resolve();
  var id = safeId(doc.id);
  var body = collection === 'samples' ? stripBlobs(doc) : plain(doc), json = JSON.stringify(body), key = collection + '/' + id;
  if (saved[key] === json) return Promise.resolve();
  saved[key] = json;
  return A.db.collection(collection).doc(id).set(body).catch(function (e) {
    delete saved[key];
    if (e && e.code === 'quota_exceeded') toast('Saved storage is full. Clear the session to keep going.');
    else if (e && e.code === 'resource_exhausted') toast('Saving is being throttled. Recent changes may not be kept.');
  });
};
A.persistMany = function (collection, docs) {
  return Promise.all((docs || []).map(function (d) { return A.persist(collection, d); }));
};
var saveTimer = null, savePending = null;
A.persistAll = function () {
  if (!A.db) return Promise.resolve();
  if (savePending) return savePending.promise;
  var resolve, promise = new Promise(function (r) { resolve = r; });
  savePending = { promise: promise };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    savePending = null;
    var st = A.store, metaJson = JSON.stringify(st.meta), stJson = JSON.stringify(inboxState());
    var jobs = [];
    if (saved['meta/config'] !== metaJson) {
      saved['meta/config'] = metaJson;
      jobs.push(A.db.doc('meta/config').set(plain(st.meta)).catch(function () { delete saved['meta/config']; }));
    }
    if (saved['state/inbox'] !== stJson) {
      saved['state/inbox'] = stJson;
      jobs.push(A.db.doc('state/inbox').set(inboxState()).catch(function () { delete saved['state/inbox']; }));
    }
    jobs.push(A.persistMany('rfqs', st.rfqs), A.persistMany('emails', st.emails),
      A.persistMany('quotes', st.quotes), A.persistMany('reviews', st.reviews),
      A.persistMany('comparisons', st.comparisons), A.persistMany('evals', st.evals),
      A.persistMany('logs', st.logs), A.persistMany('replies', st.replies), A.persistMany('samples', A.composed));
    Promise.all(jobs).then(resolve, resolve);
  }, 700);
  return promise;
};
A.wipeDb = function () {
  saved = {};
  if (!A.db) return Promise.resolve();
  var jobs = [];
  COLLECTIONS.concat(['rfqs']).forEach(function (c) {
    jobs.push(A.db.collection(c).limit(400).get().then(function (s) {
      return Promise.all(s.docs.map(function (d) { return A.db.collection(c).doc(d.id).delete().catch(function () {}); }));
    }, function () {}));
  });
  jobs.push(A.db.doc('state/inbox').delete().catch(function () {}));
  return Promise.all(jobs);
};

/* ---- AI adapters ------------------------------------------------------ */
A.initSample = function () {
  if (typeof claude === 'undefined' || !claude.use) { A.aiReady = false; return Promise.resolve(null); }
  return claude.use('sample').then(function (s) {
    A.sample = s;
    if (!s) { A.aiReady = false; return null; }
    return s.limits().then(function (l) { A.sampleLimits = l; A.aiReady = true; return s; },
      function () { A.aiReady = true; return s; });
  }, function () { A.aiReady = false; return null; });
};

function parseJsonLoose(t) {
  t = String(t || '').trim();
  var val = null;
  try { val = JSON.parse(t); } catch (e) {
    var fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
    if (fence) { try { val = JSON.parse(fence[1]); } catch (e2) {} }
    if (val === null) {
      var a = t.indexOf('{'), b = t.lastIndexOf('}');
      if (a > -1 && b > a) { try { val = JSON.parse(t.slice(a, b + 1)); } catch (e3) {} }
    }
  }
  return val;
}

/* One tolerant JSON ask. Uses sample() rather than sample.json() so the tier that
   actually answered and any truncation are visible in the log. */
function askJson(prompt, opts) {
  opts = opts || {};
  var o = { modelTier: opts.tier || 'default', signal: opts.signal, onText: opts.onText,
    cache: opts.cache === undefined ? { gcTime: 300000 } : opts.cache };
  if (opts.images) o.images = opts.images;
  return A.sample(prompt, o).then(function (res) {
    var val = parseJsonLoose(res.text);
    if (val === null) throw { code: 'invalid_json', message: 'The reply was not JSON', text: res.text };
    return { value: val, tier: res.modelTierApplied, truncated: res.truncated, raw: res.text };
  });
}
A.askJson = askJson;

function normalizeGenerated(e, i, rfq) {
  var recips = rfq.recipients || [];
  var fmtMap = { clarification: 'inline', inline: 'inline', pdf: 'pdf', xlsx: 'xlsx', csv: 'csv', thread: 'thread', link: 'link', photo: 'photo', screenshot: 'screenshot' };
  var fmt = fmtMap[String(e.format || '').toLowerCase()] || 'inline';
  var supId = recips.indexOf(e.supplier_id) > -1 ? e.supplier_id : null;
  if (!supId && e.from) {
    var dom = R.domainOf(e.from);
    var s = S.suppliers.filter(function (x) { return x.domains.indexOf(dom) > -1; })[0];
    if (s && recips.indexOf(s.id) > -1) supId = s.id;
  }
  var atts = (e.attachments || []).filter(function (a) { return a && a.transcript; }).map(function (a) {
    var typ = String(a.type || fmt).toLowerCase();
    if (!/^(pdf|xlsx|csv|photo|screenshot)$/.test(typ)) typ = fmt === 'inline' ? 'pdf' : fmt;
    return { name: String(a.name || ('attachment.' + (typ === 'photo' ? 'jpg' : typ === 'screenshot' ? 'png' : typ))), type: typ,
      transcript: String(a.transcript), truncated: !!a.truncated || /\[CUT OFF\]|\[ILLEGIBLE\]/.test(String(a.transcript)) };
  });
  return {
    id: 'em_g_' + rfq.id.replace('rfq_', '') + '_' + (i + 1) + 'c', sample_id: null, generated: true, generated_by: 'ai',
    supplier_id: supId, rfq_id: rfq.id, format: fmt,
    label: String(e.label || e.subject || 'Generated reply'), blurb: String(e.blurb || ''),
    tags: (Array.isArray(e.planted) ? e.planted.map(String).slice(0, 5) : []).concat(['generated', 'claude']),
    planted: Array.isArray(e.planted) ? e.planted.map(String) : [],
    from_name: String(e.from_name || 'Sales'), from: String(e.from || 'sales@example.com'), to: S.buyer.email,
    date: R.addDays(rfq.sent_at, 2 + i) + 'T0' + (3 + (i % 6)) + ':1' + (i % 10) + ':00Z',
    subject: String(e.subject || (rfq.code + ' quotation')), body_raw: String(e.body || ''), attachments: atts
  };
}

A.adapters = function (mode, hooks) {
  hooks = hooks || {};
  var useAi = mode === 'ai' && A.sample;
  var meta = A.store.meta, buyer = S.buyer;
  return {
    expected: A.expected,
    imagesSupported: !!(A.sampleLimits && A.sampleLimits.images),
    extract: function (pb, email, rfq, pre) {
      if (!useAi) {
        var ref = FB[email.sample_id] || email.ref || null;
        if (!ref) return Promise.reject({ code: 'no_reference', message: 'No reference read exists for this email. Turn Claude on to read it.' });
        return Promise.resolve({ ai: plain(ref), source: 'reference', tier: null });
      }
      var imgs = (email.attachments || []).map(function (a) { return a.blob; }).filter(Boolean);
      var o = { tier: A.deep ? 'complex' : 'default', signal: hooks.signal, onText: hooks.onText, cache: false };
      if (imgs.length && A.sampleLimits && A.sampleLimits.images) o.images = imgs.slice(0, A.sampleLimits.images.maxCount);
      return askJson(pb.prompt, o).then(function (r) { return { ai: r.value, source: 'ai', tier: r.tier }; });
    },
    match: function (mb, email) {
      if (!useAi) {
        if (email.sample_id === 's03') return Promise.resolve({ rfqCode: 'RFQ-2026-0417', c: 0.72, why: 'The rate card is for a 550 ml collapsible silicone bottle, the only open enquiry for that product.' });
        if (email.ref_match) return Promise.resolve(email.ref_match);
        return Promise.resolve({ rfqCode: null, c: 0, why: 'No reader available to match this email.' });
      }
      return askJson(mb.prompt, { tier: 'quick', signal: hooks.signal })
        .then(function (r) { return r.value; }, function () { return { rfqCode: null, c: 0, why: 'The matcher failed.' }; });
    },
    compare: function (cb, rfq, eligible) {
      if (!useAi) {
        var sorted = eligible.slice().sort(function (a, b) { return (a.norm.usd_at_target.v || 9e9) - (b.norm.usd_at_target.v || 9e9); });
        var cheap = sorted[0], other = sorted[sorted.length - 1];
        return Promise.resolve({ source: 'reference', tier: null, ai: {
          cheapest: { id: cheap.id, why: 'Lowest normalised FOB price of the quotes that passed. Claude is not available, so this is the arithmetic only.' },
          best_value: { id: other.id, why: 'Placeholder while Claude is unavailable. Turn the reader on for a real judgement.', tradeoffs: [] },
          recommended: { id: cheap.id, c: 0, why: 'No recommendation without the reader. Shown so the rest of the flow is visible.', runner_up: other === cheap ? null : other.id, verify_before_award: [], negotiate: [], risks: [] },
          per_quote: [], questions_for_buyer: [], reference: true
        } });
      }
      return askJson(cb.prompt, { tier: 'complex', signal: hooks.signal, onText: hooks.onText, cache: false })
        .then(function (r) { return { source: 'ai', tier: r.tier, ai: r.value }; });
    },
    readiness: function (draft) {
      var rules = G.readinessRules(draft);
      if (!useAi) return Promise.resolve(rules);
      var pb = P.buildReadiness(draft, meta);
      return askJson(pb.prompt, { tier: 'default', cache: false, signal: hooks.signal, onText: hooks.onText }).then(function (r) {
        var v = r.value && typeof r.value === 'object' ? r.value : {};
        v.missing = Array.isArray(v.missing) ? v.missing.filter(function (m) { return m && m.field; }) : [];
        v.suggested_questions = Array.isArray(v.suggested_questions) ? v.suggested_questions.filter(function (q) { return q && q.text; }).slice(0, 5) : [];
        v.spec_gaps = Array.isArray(v.spec_gaps) ? v.spec_gaps.map(String).slice(0, 6) : [];
        // the fixed rules keep the hard gate: anything they call a must stays a must
        rules.missing.filter(function (m) { return m.severity === 'must'; }).forEach(function (m) {
          var hit = v.missing.filter(function (x) { return x.field === m.field; })[0];
          if (hit) hit.severity = 'must'; else { m.by = 'rule'; v.missing.push(m); }
        });
        v.ready = !v.missing.some(function (m) { return m.severity === 'must'; });
        if (typeof v.score !== 'number') v.score = rules.score;
        v.score = Math.max(0, Math.min(100, Math.round(v.score)));
        v.source = 'ai'; v.tier = r.tier;
        return v;
      }, function (e) { rules.note = 'Claude could not check this (' + ((e && e.code) || 'error') + '), so the fixed rules did.'; return rules; });
    },
    generate: function (rfq) {
      var base = G.generateEdgeCases(rfq, A.store.suppliers, meta, buyer);
      if (!useAi) return Promise.resolve({ emails: base, source: 'reference' });
      var recips = (rfq.recipients || []).map(function (id) { return A.supById(id); }).filter(Boolean).slice(0, 7);
      var pb = P.buildGenerate(rfq, recips, meta, buyer);
      return askJson(pb.prompt, { tier: 'default', cache: false, signal: hooks.signal, onText: hooks.onText }).then(function (r) {
        var list = r.value && Array.isArray(r.value.emails) ? r.value.emails : [];
        if (!list.length) throw { code: 'empty' };
        return { emails: list.map(function (e, i) { return normalizeGenerated(e, i, rfq); }), source: 'ai', tier: r.tier };
      }, function () { return { emails: base, source: 'reference', fallback: true }; });
    },
    reply: function (rec, quote, rfq, items) {
      var tpl = G.draftReply(rec, quote, rfq, items, buyer, meta);
      if (!useAi) return Promise.resolve(tpl);
      var pb = P.buildReply(rec, quote, rfq, items, buyer);
      return askJson(pb.prompt, { tier: 'quick', cache: false, signal: hooks.signal }).then(function (r) {
        var v = r.value || {};
        if (!v.body) return tpl;
        return { subject: String(v.subject || tpl.subject), body: String(v.body), source: 'ai' };
      }, function () { return tpl; });
    }
  };
};

/* ---- uploads: turn a file into a transcript the reader can use --------- */
var scriptCache = {};
function loadScript(url) {
  if (scriptCache[url]) return scriptCache[url];
  scriptCache[url] = new Promise(function (resolve, reject) {
    var s = document.createElement('script'); s.src = url; s.onload = resolve;
    s.onerror = function () { delete scriptCache[url]; reject(new Error('load failed')); };
    document.head.appendChild(s);
  });
  return scriptCache[url];
}
A.readUpload = function (file) {
  var name = file.name || 'file', ext = (name.split('.').pop() || '').toLowerCase();
  if (/^image\//.test(file.type) || /^(jpe?g|png|webp|gif)$/.test(ext)) {
    var canSend = !!(A.sampleLimits && A.sampleLimits.images);
    return Promise.resolve({ type: 'photo', name: name, blob: canSend ? file : null,
      transcript: canSend ? '[IMAGE ATTACHED — ' + name + ', sent to Claude as a picture. Add a transcript below if you want the fixed checks to quote it.]'
        : '[IMAGE ATTACHED — ' + name + '. This view cannot send pictures to Claude; paste what the image says below.]' });
  }
  if (ext === 'csv' || ext === 'txt' || /^text\//.test(file.type)) {
    return file.text().then(function (t) { return { type: ext === 'csv' ? 'csv' : 'inline', name: name, transcript: '[' + ext.toUpperCase() + ' TRANSCRIPT — ' + name + ']\n\n' + t.slice(0, 20000) }; });
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js').then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = window.XLSX.read(new Uint8Array(buf), { type: 'array' });
      var parts = [];
      wb.SheetNames.forEach(function (sn) {
        var ws = wb.Sheets[sn], rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false });
        parts.push('[XLSX TRANSCRIPT — sheet "' + sn + '", ' + rows.length + ' rows]\n');
        rows.forEach(function (r, i) { parts.push('A' + (i + 1) + '  ' + r.map(function (c) { return c == null ? '' : String(c); }).join('\t')); });
      });
      return { type: 'xlsx', name: name, transcript: parts.join('\n').slice(0, 20000) };
    });
  }
  if (ext === 'pdf') {
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js').then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      return file.arrayBuffer();
    }).then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; }).then(function (doc) {
      var pages = [];
      for (var i = 1; i <= Math.min(doc.numPages, 6); i++) pages.push(doc.getPage(i).then(function (pg) { return pg.getTextContent(); }));
      return Promise.all(pages).then(function (tcs) {
        var text = tcs.map(function (tc, i) {
          var line = '', lastY = null, out = [];
          tc.items.forEach(function (it) {
            var y = Math.round(it.transform[5]);
            if (lastY !== null && Math.abs(y - lastY) > 2) { out.push(line); line = ''; }
            line += (line ? ' ' : '') + it.str; lastY = y;
          });
          if (line) out.push(line);
          return '--- page ' + (i + 1) + ' ---\n' + out.join('\n');
        }).join('\n');
        var empty = !text.replace(/--- page \d+ ---/g, '').trim();
        return { type: 'pdf', name: name, transcript: '[PDF TRANSCRIPT — ' + doc.numPages + ' page(s), text layer extracted]\n\n' + (empty ? '[NO TEXT LAYER — scanned image only; needs OCR or a typed transcript]' : text.slice(0, 20000)) };
      });
    });
  }
  return Promise.reject(new Error('This file type cannot be read here. Paste its text instead.'));
};

/* ---- downloads ---------------------------------------------------------- */
A.saveFile = function (filename, data) {
  if (!A.downloads) { toast('Downloads are not available in this view. Open the file tab to read it instead.'); return Promise.resolve(false); }
  return A.downloads.save({ filename: filename, data: data }).then(function () { toast('Saved ' + filename); return true; }, function (e) {
    var code = e && e.code;
    if (code === 'declined') return false;
    toast(code === 'rejected_extension' ? 'That file type cannot be saved from here.' : 'Could not save the file (' + (code || 'error') + ').');
    return false;
  });
};

/* ---- template filling for the composer --------------------------------- */
A.fillTemplate = function (str, rfq, supplierName) {
  rfq = rfq || A.store.rfqs[0];
  var tiers = G.tiersFor(rfq), mid = (rfq.target_usd_fob.lo + rfq.target_usd_fob.hi) / 2;
  var unit = rfq.unit || 'pc', units = unit === 'pc' ? 'pcs' : unit + 's';
  var rmb = (mid * A.store.meta.fx.CNY), rmbS = rmb.toFixed(2);
  var vars = {
    code: rfq.code, codeshort: rfq.code.replace('RFQ-', ''), product: rfq.product, qty: rfq.target_qty, unit: unit, units: units,
    tier1: tiers[0], tier2: tiers[1], tier3: tiers[2], tier2m: tiers[1] - 1, tier3m: tiers[2] - 1,
    price: (mid * 0.98).toFixed(2), price_hi: (mid * 1.06).toFixed(2), price_lo: (mid * 0.9).toFixed(2), price_ddp: (mid * 1.25).toFixed(2),
    band_lo: rfq.target_usd_fob.lo.toFixed(2), band_hi: rfq.target_usd_fob.hi.toFixed(2),
    certs: (rfq.required_certs || []).join(' and ') || 'ISO 9001', cert1: (rfq.required_certs || [])[0] || 'ISO 9001',
    date: A.store.meta.demo_now, datecompact: A.store.meta.demo_now.replace(/-/g, ''), valid: R.addDays(A.store.meta.demo_now, 30), sent: rfq.sent_at,
    buyer: S.buyer.name, buyeremail: S.buyer.email, supplier: supplierName || 'New Factory Co., Ltd', SUPPLIER: (supplierName || 'New Factory Co., Ltd').toUpperCase(),
    supplierslug: (supplierName || 'newfactory').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    rmb_hi: (rmb * 1.08).toFixed(2), rmb_cut: rmbS.slice(0, rmbS.indexOf('.') + 1) + '[?]' + rmbS.slice(-1)
  };
  return String(str).replace(/\{\{(\w+)\}\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
};

/* ---- boot ------------------------------------------------------------- */
A.seedFresh = function () { A.store = PL.newStore(S); return A.store; };

/* ---- routing ---------------------------------------------------------- */
var routes = [];
A.route = function (re, fn) { routes.push([re, fn]); };
A.go = function (hash) { window.location.hash = hash; };
A.current = function () { return (window.location.hash || '#/rfqs').replace(/^#/, ''); };

A.render = function () {
  var path = A.current(), view = $('#view');
  for (var i = 0; i < routes.length; i++) {
    var m = routes[i][0].exec(path);
    if (m) {
      view.innerHTML = routes[i][1].apply(null, m.slice(1)) || '';
      window.scrollTo(0, 0);
      A.paintNav();
      if (A.afterRender) { var f = A.afterRender; A.afterRender = null; f(path); }
      return;
    }
  }
  view.innerHTML = '<div class="empty">Nothing here. <a href="#/rfqs">Back to the inquiries</a></div>';
  A.paintNav();
};

A.paintNav = function () {
  var path = A.current();
  var openN = A.openReviews().length + A.draftReplies().length;
  var unread = A.arrived().filter(function (e) { return !A.emailById(e.id); }).length;
  var waiting = A.unsynced().length;
  var primary = [
    ['#/rfqs', 'Inquiries', A.store.rfqs.length, /^\/rfqs?(\/|$)|^\/compare\//],
    ['#/inbox', 'Emails', unread || (waiting ? '+' + waiting : 0), /^\/inbox|^\/email\//],
    ['#/reviews', 'Your queue', openN, /^\/reviews/]
  ];
  var secondary = [
    ['#/evals', 'Evals', A.store.evals.length, /^\/evals/],
    ['#/guardrails', 'Guardrails', null, /^\/guardrails/]
  ];
  function item(it, small) {
    var on = it[3].test(path);
    var hot = (it[1] === 'Your queue' && it[2] > 0) || (it[1] === 'Emails' && typeof it[2] === 'string');
    return '<a href="' + it[0] + '"' + (on ? ' aria-current="page"' : '') + (small ? ' class="small"' : '') + '>' + esc(it[1]) +
      (it[2] == null || it[2] === 0 ? '' : '<span class="n' + (hot ? ' hot' : '') + '">' + it[2] + '</span>') + '</a>';
  }
  $('#nav').innerHTML = primary.map(function (it) { return item(it, false); }).join('') +
    '<div class="nav-sec">Reference</div>' + secondary.map(function (it) { return item(it, true); }).join('');

  var st = $('#ai-status');
  if (st) {
    var label, cls;
    if (A.aiReady === null) { label = 'Checking for Claude…'; cls = 'chip-mute'; }
    else if (A.aiReady) { label = A.deep ? 'Claude on, deep read' : 'Claude on'; cls = 'chip-info'; }
    else { label = 'Reference mode'; cls = 'chip-warn'; }
    st.innerHTML = '<div class="row" style="gap:6px"><span class="chip ' + cls + '">' + esc(label) + '</span></div>' +
      (A.aiReady ? '<label class="row" style="gap:5px;font-size:11px;margin-top:6px;cursor:pointer">' +
        '<input type="checkbox" id="deep-toggle"' + (A.deep ? ' checked' : '') + ' style="width:auto"> Deep read (slower)</label>' : '') +
      '<div style="margin-top:6px;font-size:10.5px">Inbox: ' + esc(S.buyer.email) + '</div>' +
      '<div style="font-size:10.5px">Clock pinned to ' + esc(A.store.meta.demo_now) + '</div>' +
      (A.db ? '' : '<div style="margin-top:3px;font-size:10.5px">Not saved between visits</div>');
    var dt = $('#deep-toggle');
    if (dt) dt.onchange = function () { A.deep = dt.checked; A.paintNav(); };
  }
};

window.addEventListener('hashchange', function () { A.render(); });
})();
