/* Final accounts from a trial balance file (profit-loss.niveshsahayak.in, byof2-final 28 Nov 2026): the screen part of engine/tbcore.js.
   Step 1 drop this year's trial balance (Tally / Busy / Marg Excel, CSV or Tally XML) and, if you like, last year's; step 2 check what was
   read and choose a head for every ledger it could not place (the choice is remembered on this device); step 3 the balance sheet and the
   statement of profit and loss in the Schedule III format (company) or the T format (others), notes by heads, last year beside this
   year, key ratios; Print, PDF, Excel. No business or saved record is needed; files are read in this browser only and nothing is saved
   anywhere except the head choices, column layouts and the business name (localStorage, this device). Statements are documents and stay
   in English like every printed paper; screen words: tbp.*. */
(function () {
  'use strict';
  var anchor = NS.$('#plreport'); if (!anchor || !window.NSTB) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, t = NS.t, r2 = NS.r2, B = window.NSTB, P = window.NSPL;
  var XLJS = '/assets/vendor/xlsx-0.20.3.full.min.js';
  var CY = [], PY = [], ST = null, tab = 'bs', busy = false;
  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function heads() { return ls('ns-tb-map') || {}; }
  function lays() { return ls('ns-tb-lay') || {}; }
  function set() { return Object.assign({ name: '', kind: 'auto', fmt: '' }, ls('ns-tb-set') || {}); }
  function m(v) { return v == null || v === '' ? '' : NS.money(v, false); }
  function key(s) { return B.key(s); }
  /* Excel out: extras.js NS.xlsx(file, [{ name, rows }]) where it is on the page, else xlsx.js NS.xlsx.write */
  function xl(file, sheets) {
    if (typeof NS.xlsx === 'function') return NS.xlsx(file, sheets);
    var blob = NS.xlsx.write(sheets.map(function (x) { return [x.name, x.rows]; })), a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }

  /* heads a ledger can be given: Schedule III order; ':d' = a direct expense (T format trading account) */
  var HEADS = ['cap', 'drw', 'res', 'ltb', 'stb', 'tpay', 'ocl', 'ppe', 'ninv', 'trec', 'cash', 'oca', 'osk', 'cs', 'rev', 'oinc', 'mat', 'pur', 'emp', 'emp:d', 'fin', 'dep', 'oth', 'oth:d', 'tax', 'skip'];
  var CRH = { cap: 1, res: 1, ltb: 1, stb: 1, tpay: 1, ocl: 1, rev: 1, oinc: 1 };
  function hv(x, py) { var d = py ? x.pdr : x.dr, c = py ? x.pcr : x.cr; return CRH[x.g] ? r2(c - d) : r2(d - c); }
  function headSel(id, cur, attr) {
    return '<select id="' + id + '" ' + (attr || '') + '><option value="">' + esc(t('tbp.choose')) + '</option>' + HEADS.map(function (h) { return '<option value="' + h + '"' + (h === cur ? ' selected' : '') + '>' + esc(t('tbp.g_' + h.replace(':', '_'))) + '</option>'; }).join('') + '</select>';
  }
  function curHead(x) { return x.g && /^(emp|oth)$/.test(x.g) && x.dx ? x.g + ':d' : x.g; }

  /* ---------- the panel ---------- */
  function panel() {
    var box = document.createElement('section'); box.className = 'wrap tbf'; box.id = 'tbfile'; box.setAttribute('aria-labelledby', 'tbf-h');
    box.innerHTML = '<h2 id="tbf-h" data-i18n="tbp.h">' + esc(t('tbp.h')) + '</h2><p class="soft" data-i18n="tbp.intro">' + esc(t('tbp.intro')) + '</p>' +
      '<ol class="tbf-steps"><li data-i18n="tbp.s1">' + esc(t('tbp.s1')) + '</li><li data-i18n="tbp.s2">' + esc(t('tbp.s2')) + '</li><li data-i18n="tbp.s3">' + esc(t('tbp.s3')) + '</li></ol>' +
      '<div class="tbf-drops">' +
        '<label class="tbf-drop" for="tbf-in" data-drop="cy" tabindex="0"><input id="tbf-in" type="file" multiple accept=".xlsx,.xls,.xlsm,.csv,.txt,.xml"><b data-i18n="tbp.drop">' + esc(t('tbp.drop')) + '</b><span class="soft" data-i18n="tbp.droph">' + esc(t('tbp.droph')) + '</span><span class="tbf-fn" data-fn="cy"></span></label>' +
        '<label class="tbf-drop" for="tbf-py" data-drop="py" tabindex="0"><input id="tbf-py" type="file" multiple accept=".xlsx,.xls,.xlsm,.csv,.txt,.xml"><b data-i18n="tbp.droppy">' + esc(t('tbp.droppy')) + '</b><span class="soft" data-i18n="tbp.droppyh">' + esc(t('tbp.droppyh')) + '</span><span class="tbf-fn" data-fn="py"></span></label>' +
      '</div>' +
      '<div class="row tbf-row"><button type="button" class="btn" data-f="sample" data-i18n="tbp.sample">' + esc(t('tbp.sample')) + '</button><button type="button" class="btn sm" data-f="dlsample" data-i18n="tbp.dlsample">' + esc(t('tbp.dlsample')) + '</button>' +
        '<button type="button" class="btn sm" data-f="clear" data-i18n="tbp.clear" hidden>' + esc(t('tbp.clear')) + '</button></div>' +
      '<p class="soft tbf-busy" aria-live="polite" data-busy></p><div data-tbf-out></div>';
    anchor.parentNode.insertBefore(box, anchor.previousElementSibling && anchor.previousElementSibling.matches('[data-mode]') ? anchor.previousElementSibling : anchor);
    box.addEventListener('change', onChange);
    box.addEventListener('click', onClick);
    $$('.tbf-drop', box).forEach(function (z) {
      z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('on'); });
      z.addEventListener('dragleave', function () { z.classList.remove('on'); });
      z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('on'); var fs = e.dataTransfer && e.dataTransfer.files; if (fs && fs.length) load(fs, z.getAttribute('data-drop')); });
      z.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('input', z).click(); } });
    });
    return box;
  }
  var BOX = null;
  function say(s) { var b = $('[data-busy]', BOX); if (b) b.textContent = s || ''; }

  /* ---------- reading files ---------- */
  function sheets(f) {
    if (/\.xml$/i.test(f.name)) return f.arrayBuffer().then(function (b) { var txt = window.NSTallyIn ? NSTallyIn.decode(b) : new TextDecoder().decode(b); return [{ name: f.name, xml: txt }]; });
    if (/\.(csv|txt)$/i.test(f.name)) return f.text().then(function (txt) { return [{ name: f.name, rows: B.csvRows(txt) }]; });
    return NS.loadJs(XLJS, '').then(function () { return f.arrayBuffer(); }).then(function (buf) {
      var wb = window.XLSX.read(buf, { type: 'array', cellDates: false });
      return wb.SheetNames.map(function (n) { return { name: wb.SheetNames.length > 1 ? f.name + ': ' + n : f.name, rows: window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }; });
    });
  }
  function load(files, which) {
    files = Array.prototype.slice.call(files || []); if (!files.length || busy) return;
    busy = true; say(t('tbp.reading', { f: files.map(function (x) { return x.name; }).join(', ') }));
    var all = [];
    files.reduce(function (p, f) { return p.then(function () { return sheets(f).then(function (S) { all = all.concat(S); }); }); }, Promise.resolve()).then(function () {
      if (which === 'py') PY = all; else { CY = all; ST = null; }
      busy = false; say(''); $('[data-fn="' + which + '"]', BOX).textContent = files.map(function (x) { return x.name; }).join(', ');
      run(true);
    }).catch(function (e) { busy = false; say(''); NS.toast(t('tbp.readfail', { f: files.map(function (x) { return x.name; }).join(', ') }) + (e && e.message === 'xls' ? ' ' + t('tbp.xls') : ''), 'bad'); });
  }
  function sample() {
    var S = B.sample();
    CY = [{ name: S.name, rows: S.rows }]; PY = [];
    var s = set(); if (!s.name) { s.name = 'Sharma Traders (sample)'; ls('ns-tb-set', s); }
    ST = { cs: S.cs, pcs: S.pcs, sample: 1 };
    $('[data-fn="cy"]', BOX).textContent = S.name; $('[data-fn="py"]', BOX).textContent = '';
    run(true);
  }
  function dlSample() {
    var S = B.sample(); xl(S.name, [{ name: 'Trial Balance', rows: S.rows }]);
  }

  /* ---------- working it out ---------- */
  var RES = null;
  function work() {
    var R = B.read(CY, { layouts: lays(), force: ST && ST.force });
    if (PY.length) { var Q = B.read(PY, { layouts: lays(), force: ST && ST.forcePy }); B.joinPY(R, Q); R.pyRead = Q; }
    var Pl = B.place(R, heads()), s = set(), cs = ST && ST.cs != null ? +ST.cs : Pl.csFrom ? Pl.cs : null, pcs = ST && ST.pcs != null ? +ST.pcs : Pl.csFrom && R.hasPY ? Pl.pcs : null;
    var end = ST && ST.end || R.end || defEnd(), pend = yearBack(end);
    var osk = Pl.tb.filter(function (x) { return x.g === 'osk'; }).reduce(function (a, x) { return a + x.dr - x.cr; }, 0);
    if (pcs == null && R.hasPY && osk) pcs = r2(osk);   /* last year's closing stock is this year's opening stock */
    var co = s.kind === 'co' || s.kind === 'auto' && B.looksCompany(R, Pl, s.name);
    var fmt = s.fmt === 't' || s.fmt === 'v' ? s.fmt : co ? 'v' : 't';
    var rows = B.yearRows(Pl), F = P.statements(rows, cs || 0), FP = null, prow = null;
    if (R.hasPY) { prow = B.yearRows(Pl, true); FP = P.statements(prow, pcs || 0); }
    RES = { R: R, Pl: Pl, rows: rows, prow: prow, F: F, FP: FP, cs: cs || 0, pcs: pcs || 0, csKnown: cs != null, pcsKnown: pcs != null, end: end, pend: pend, co: co, fmt: fmt, name: s.name || R.company || '', kind: s.kind };
    return RES;
  }
  function defEnd() { var d = new Date(), y = d.getFullYear() - (d.getMonth() < 3 ? 1 : 0); return y + '-03-31'; }
  function yearBack(iso) { return (+iso.slice(0, 4) - 1) + iso.slice(4).replace('-02-29', '-02-28'); }
  function fd(iso) { return NS.fmtDate ? NS.fmtDate(iso) : iso; }

  function run(scroll) {
    var out = $('[data-tbf-out]', BOX); $('[data-f="clear"]', BOX).hidden = !CY.length;
    if (!CY.length) { out.innerHTML = ''; return; }
    var X = work();
    out.innerHTML = readHtml(X) + (X.R.lines.length ? setupHtml(X) + askHtml(X) + resultHtml(X) : '');
    if (scroll) { var h = $('h3', out); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); h.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }
  }

  /* step 2: what was read */
  function readHtml(X) {
    var R = X.R, Pl = X.Pl, h = '<h3 data-i18n="tbp.read">' + esc(t('tbp.read')) + '</h3><ul class="tbf-files">';
    R.found.concat(R.pyRead ? R.pyRead.found.map(function (f) { return Object.assign({ py: 1 }, f); }) : []).forEach(function (f, i) {
      h += '<li>' + (f.kind ? '<b>' + esc(f.name) + '</b> ' + esc(t(f.py ? 'tbp.fpy' : 'tbp.fcy', { n: f.n, r: f.row + 1 })) + (f.remembered ? ' <span class="pill">' + esc(t('tbp.remembered')) + '</span>' : '') :
        '<b>' + esc(f.name) + '</b> <span class="bad">' + esc(t('tbp.nohead')) + '</span>') + ' <button type="button" class="btn sm" data-cols="' + i + '" data-py="' + (f.py ? 1 : 0) + '">' + esc(t('tbp.cols')) + '</button></li>';
    });
    h += '</ul>';
    var w = R.warn.concat(R.pyRead ? R.pyRead.warn : []), msg = [];
    w.forEach(function (x) {
      if (x.w === 'grpsum') msg.push(t('tbp.w_grpsum', { g: x.g, a: m(Math.abs(x.file)), b: m(Math.abs(x.led)) }));
      else if (x.w === 'openonly') msg.push(t('tbp.w_openonly', { f: x.f }));
      else if (x.w === 'busyxml') msg.push(t('tbp.w_busyxml', { f: x.f }));
      else msg.push(t('tbp.w_xml', { f: x.f }));
    });
    var sk = R.skipped.concat(R.pyRead ? R.pyRead.skipped : []);
    if (sk.length) {
      h += '<details class="tbf-skip"><summary>' + esc(t('tbp.skipped', { n: sk.length })) + '</summary><ul>' + sk.slice(0, 200).map(function (s) {
        return '<li>' + esc(t('tbp.skiprow', { f: s.f, r: s.row })) + ': ' + esc(s.why === 'amount' ? t('tbp.why_amt', { x: s.text, n: s.name }) : t('tbp.why_noname')) + '</li>'; }).join('') + '</ul></details>';
    }
    if (!R.lines.length && R.found.some(function (f) { return f.kind; })) msg.push(t('tbp.nolines'));
    if (R.lines.length) {
      var ok = Math.abs(Pl.dr - Pl.cr) < 0.5;
      msg.unshift(t(ok ? 'tbp.tbok' : 'tbp.tbbad', { n: R.lines.length, d: m(Pl.dr), c: m(Pl.cr), x: m(Math.abs(r2(Pl.dr - Pl.cr))) }));
      if (R.file && R.file.dr && (Math.abs(R.file.dr - Pl.dr) > 1 || Math.abs(R.file.cr - Pl.cr) > 1)) msg.push(t('tbp.w_total', { d: m(R.file.dr), c: m(R.file.cr) }));
      if (R.hasPY && Math.abs(Pl.pdr - Pl.pcr) >= 0.5) msg.push(t('tbp.pybad', { x: m(Math.abs(r2(Pl.pdr - Pl.pcr))) }));
      if (Pl.skip.length) msg.push(t('tbp.left', { n: Pl.skip.length }));
    }
    return h + msg.map(function (s, i) { return '<p class="sb-note' + (i === 0 && R.lines.length && Math.abs(Pl.dr - Pl.cr) < 0.5 ? ' ok' : /does not|did not|could not|not agree|do not/i.test(s) ? ' bad' : '') + '">' + esc(s) + '</p>'; }).join('');
  }
  function setupHtml(X) {
    var s = set();
    return '<div class="sb-period tbf-set">' +
      '<div class="f"><label for="tbf-name" data-i18n="tbp.name">' + esc(t('tbp.name')) + '</label><input id="tbf-name" dir="auto" value="' + esc(X.name) + '" autocomplete="organization"></div>' +
      '<div class="f"><label for="tbf-end" data-i18n="tbp.end">' + esc(t('tbp.end')) + '</label><input id="tbf-end" type="date" value="' + esc(X.end) + '"></div>' +
      '<div class="f"><label for="tbf-kind" data-i18n="tbp.kind">' + esc(t('tbp.kind')) + '</label><select id="tbf-kind">' + ['auto', 'co', 'prop', 'firm', 'llp', 'other'].map(function (k) { return '<option value="' + k + '"' + (s.kind === k ? ' selected' : '') + '>' + esc(t('tbp.k_' + k)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label for="tbf-cs">' + esc(t('tbp.cs', { d: fd(X.end) })) + '</label><input id="tbf-cs" inputmode="decimal" value="' + esc(X.csKnown ? X.cs : '') + '" placeholder="0"></div>' +
      (X.R.hasPY ? '<div class="f"><label for="tbf-pcs">' + esc(t('tbp.cs', { d: fd(X.pend) })) + '</label><input id="tbf-pcs" inputmode="decimal" value="' + esc(X.pcsKnown ? X.pcs : '') + '" placeholder="0"></div>' : '') +
      '</div>' + (!X.csKnown ? '<p class="sb-note bad">' + esc(t('tbp.nocs')) + '</p>' : X.Pl.csFrom && !(ST && ST.cs != null) ? '<p class="sb-note">' + esc(t('tbp.csfrom')) + '</p>' : '');
  }
  /* ledgers it could not place: the user picks a head once */
  function askHtml(X) {
    var A = X.Pl.ask; if (!A.length) return '';
    return '<div class="tbf-ask"><h3>' + esc(t('tbp.ask', { n: A.length })) + '</h3><p class="soft">' + esc(t('tbp.askh')) + '</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">' + esc(t('tbp.ledger')) + '</th><th class="l">' + esc(t('tbp.group')) + '</th><th class="n">' + esc(t('tbp.dr')) + '</th><th class="n">' + esc(t('tbp.cr')) + '</th><th class="l">' + esc(t('tbp.head')) + '</th></tr></thead><tbody>' +
      A.slice(0, 300).map(function (x) { var id = 'tbf-a' + x.i; return '<tr><th scope="row" class="l">' + esc(x.name) + '</th><td class="l">' + esc(x.group) + '</td><td class="n">' + m(x.dr || '') + '</td><td class="n">' + m(x.cr || '') + '</td><td class="l"><label class="sr" for="' + id + '">' + esc(t('tbp.head')) + '</label>' + headSel(id, '', 'data-map="' + esc(x.name) + '"') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + (A.length > 300 ? '<p class="soft">' + esc(t('tbp.askmore', { n: A.length - 300 })) + '</p>' : '') + '</div>';
  }

  /* ---------- the statements: one model, drawn as HTML and as spreadsheet rows ----------
     a row: { l (label), n (note no.), a (this year), b (last year), c ('h' heading | 'b' bold | 't' total | 's' sub) } */
  function model(X) {
    var F = X.F, FP = X.FP, L = F.pl, S = F.bs, LP = FP && FP.pl, SP = FP && FP.bs, notes = [], no = 0;
    function pv(o, k) { return o ? o[k] : null; }
    /* a note of one head: its ledgers, both years */
    function note(title, gs, extra, neg) {
      var lines = X.Pl.tb.filter(function (x) { return gs.indexOf(x.g) >= 0 && (x.dr || x.cr || x.pdr || x.pcr); });
      if (!lines.length && !extra) return '';
      var R = lines.map(function (x) { var s = neg && neg(x) ? -1 : 1; return { l: x.name, a: s * hv(x), b: X.R.hasPY ? s * hv(x, 1) : null, c: 's' }; });
      if (extra) R = extra(R);
      var tot = R.filter(function (r) { return r.c === 's' || r.c === 'm'; });
      R.push({ l: 'Total', a: r2(tot.reduce(function (s, r) { return s + (r.a || 0); }, 0)), b: X.R.hasPY ? r2(tot.reduce(function (s, r) { return s + (r.b || 0); }, 0)) : null, c: 't' });
      no++; notes.push({ no: no, title: title, rows: R });
      return no;
    }
    var bs = [], pl = [];
    var lt = 0;   /* (a), (b) ... counted again under every bold line, so a missing line leaves no gap */
    function line(arr, l, n, a, b, c) {
      if (c === 'b' || c === 'h' || c === 't') lt = 0;
      if (c === 's' && /^\([a-z]\) /.test(l)) l = '(' + String.fromCharCode(97 + lt++) + ') ' + l.slice(4);
      arr.push({ l: l, n: n || '', a: a, b: FP ? b : null, c: c || '' });
    }
    var co = X.co;
    /* balance sheet */
    line(bs, 'I. EQUITY AND LIABILITIES', '', null, null, 'h');
    line(bs, co ? "(1) Shareholders' funds" : "(1) Owners' funds", '', S.own, pv(SP, 'own'), 'b');
    var nCap = note(co ? 'Share capital' : X.kind === 'firm' || X.kind === 'llp' ? "Partners' capital accounts" : "Owner's capital account", ['cap', 'drw'], null, function (x) { return x.g === 'drw'; });
    line(bs, co ? '(a) Share capital' : '(a) Capital account', nCap, r2(S.cap - S.drw), SP ? r2(SP.cap - SP.drw) : null, 's');
    var nRes = note('Reserves and surplus', ['res'], function (R) {
      var ra = r2(S.res - L.profit), rb = SP ? r2(SP.res - LP.profit) : null;
      return [{ l: 'Opening balance (profit of earlier years, reserves)', a: ra, b: rb, c: 'm' }, { l: 'Add: profit (or less: loss) for the year', a: L.profit, b: LP ? LP.profit : null, c: 'm' }];
    });
    line(bs, '(b) Reserves and surplus', nRes, S.res, pv(SP, 'res'), 's');
    if (S.ltb || SP && SP.ltb) { line(bs, '(2) Non-current liabilities', '', S.ncl, pv(SP, 'ncl'), 'b'); line(bs, '(a) Long-term borrowings', note('Long-term borrowings', ['ltb']), S.ltb, pv(SP, 'ltb'), 's'); }
    line(bs, (S.ltb || SP && SP.ltb ? '(3)' : '(2)') + ' Current liabilities', '', S.cl, pv(SP, 'cl'), 'b');
    if (S.stb || SP && SP.stb) line(bs, '(a) Short-term borrowings', note('Short-term borrowings', ['stb']), S.stb, pv(SP, 'stb'), 's');
    line(bs, '(b) Trade payables', note('Trade payables', ['tpay']), S.tpay, pv(SP, 'tpay'), 's');
    line(bs, '(c) Other current liabilities', note('Other current liabilities', ['ocl']), S.ocl, pv(SP, 'ocl'), 's');
    line(bs, 'TOTAL', '', S.el, pv(SP, 'el'), 't');
    line(bs, 'II. ASSETS', '', null, null, 'h');
    if (S.nca || SP && SP.nca) {
      line(bs, '(1) Non-current assets', '', S.nca, pv(SP, 'nca'), 'b');
      if (S.ppe || SP && SP.ppe) line(bs, '(a) Property, plant and equipment', note('Property, plant and equipment (written down value)', ['ppe']), S.ppe, pv(SP, 'ppe'), 's');
      if (S.ninv || SP && SP.ninv) line(bs, '(b) Investments', note('Investments', ['ninv']), S.ninv, pv(SP, 'ninv'), 's');
    }
    line(bs, (S.nca || SP && SP.nca ? '(2)' : '(1)') + ' Current assets', '', S.ca, pv(SP, 'ca'), 'b');
    var nInv = note('Inventories', [], function () { return [{ l: 'Closing stock (as valued and certified by the management)', a: X.cs, b: FP ? X.pcs : null, c: 'm' }]; });
    line(bs, '(a) Inventories', nInv, S.inv, pv(SP, 'inv'), 's');
    line(bs, '(b) Trade receivables', note('Trade receivables', ['trec']), S.trec, pv(SP, 'trec'), 's');
    line(bs, '(c) Cash and cash equivalents', note('Cash and cash equivalents', ['cash']), S.cash, pv(SP, 'cash'), 's');
    line(bs, '(d) Short-term loans and advances, other current assets', note('Short-term loans and advances, other current assets', ['oca']), S.oca, pv(SP, 'oca'), 's');
    line(bs, 'TOTAL', '', S.assets, pv(SP, 'assets'), 't');
    if (Math.abs(S.diff) >= 0.5 || SP && Math.abs(SP.diff) >= 0.5) line(bs, 'Difference (the trial balance does not agree)', '', S.diff, pv(SP, 'diff'), 'bad');
    /* statement of profit and loss */
    line(pl, 'I. Revenue from operations', note('Revenue from operations', ['rev'], null, function () { return false; }), L.rev, pv(LP, 'rev'), 'b');
    line(pl, 'II. Other income', note('Other income', ['oinc']), L.oinc, pv(LP, 'oinc'), 'b');
    line(pl, 'III. Total income (I + II)', '', L.income, pv(LP, 'income'), 't');
    line(pl, 'IV. Expenses', '', null, null, 'h');
    if (L.mat || LP && LP.mat) line(pl, 'Cost of materials consumed', note('Cost of materials consumed', ['mat']), L.mat, pv(LP, 'mat'), 's');
    line(pl, 'Purchases of stock-in-trade', note('Purchases of stock-in-trade', ['pur']), L.pur, pv(LP, 'pur'), 's');
    var nChg = note('Changes in inventories of stock-in-trade', [], function () {
      var os = X.rows.filter(function (x) { return x.g === 'osk'; }).reduce(function (a, x) { return a + x.dr - x.cr; }, 0), pos = X.prow ? X.prow.filter(function (x) { return x.g === 'osk'; }).reduce(function (a, x) { return a + x.dr - x.cr; }, 0) : null;
      return [{ l: 'Opening stock', a: r2(os), b: FP ? r2(pos) : null, c: 'm' }, { l: 'Less: closing stock', a: -X.cs, b: FP ? -X.pcs : null, c: 'm' }];
    });
    line(pl, 'Changes in inventories of stock-in-trade', nChg, L.chg, pv(LP, 'chg'), 's');
    line(pl, 'Employee benefits expense', note('Employee benefits expense', ['emp']), L.emp, pv(LP, 'emp'), 's');
    line(pl, 'Finance costs', note('Finance costs', ['fin']), L.fin, pv(LP, 'fin'), 's');
    line(pl, 'Depreciation and amortisation expense', note('Depreciation and amortisation expense', ['dep']), L.dep, pv(LP, 'dep'), 's');
    line(pl, 'Other expenses', note('Other expenses', ['oth']), L.oth, pv(LP, 'oth'), 's');
    line(pl, 'Total expenses (IV)', '', L.exp, pv(LP, 'exp'), 't');
    line(pl, 'V. Profit before tax (III - IV)', '', L.pbt, pv(LP, 'pbt'), 'b');
    if (L.tax || LP && LP.tax) line(pl, 'VI. Tax expense', note('Tax expense', ['tax']), L.tax, pv(LP, 'tax'), 's');
    line(pl, L.profit < 0 ? 'VII. Loss for the year' : 'VII. Profit for the year', '', L.profit, pv(LP, 'profit'), 't');
    return { bs: bs, pl: pl, notes: notes };
  }
  /* key ratios (Schedule III Division I list; auditcore.js NSAudit.ratios). Two need figures a trial balance does not have. */
  function ratios(X) {
    if (!window.NSAudit) return [];
    return NSAudit.ratios(B.ratioInput(X.F), X.FP ? B.ratioInput(X.FP) : null).filter(function (r) { return r.k !== 'dscr' && r.k !== 'roi'; });
  }
  function rv(v, k) { return v == null || !isFinite(v) ? '—' : /roe|npr|roce/.test(k) ? (Math.round(v * 100) / 100).toFixed(2) + '%' : (Math.round(v * 100) / 100).toFixed(2); }

  function heads2(X) { return ['Particulars', 'Note', 'As at ' + fd(X.end) + ' (₹)'].concat(X.FP ? ['As at ' + fd(X.pend) + ' (₹)'] : []); }
  function pheads(X) { return ['Particulars', 'Note', 'Year ended ' + fd(X.end) + ' (₹)'].concat(X.FP ? ['Year ended ' + fd(X.pend) + ' (₹)'] : []); }
  function table(rows, hd, cls) {
    return '<table class="tbl tbf-st ' + (cls || '') + '"><thead><tr>' + hd.map(function (h, i) { return '<th class="' + (i < 1 ? 'l' : i === 1 ? 'nt' : 'n') + '">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        if (r.c === 'h') return '<tr class="sec"><th class="l" colspan="' + hd.length + '">' + esc(r.l) + '</th></tr>';
        return '<tr class="' + (r.c === 't' ? 'tot' : r.c === 'b' ? 'b' : r.c === 'bad' ? 'bad' : '') + '"><th scope="row" class="l' + (r.c === 's' || r.c === 'm' ? ' sub' : '') + '">' + esc(r.l) + '</th>' + (hd.length > 3 || hd[1] === 'Note' ? '<td class="nt">' + esc(r.n || '') + '</td>' : '') + '<td class="n">' + m(r.a) + '</td>' + (hd.length > 3 ? '<td class="n">' + (r.b == null ? '' : m(r.b)) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  function notesHtml(X, M) {
    var hd = ['Particulars', '', fd(X.end) + ' (₹)'].concat(X.FP ? [fd(X.pend) + ' (₹)'] : []);
    return M.notes.map(function (n) {
      return '<h4>Note ' + n.no + ': ' + esc(n.title) + '</h4>' + '<table class="tbl tbf-st"><thead><tr><th class="l">Particulars</th><th class="n">' + esc(hd[2]) + '</th>' + (X.FP ? '<th class="n">' + esc(hd[3]) + '</th>' : '') + '</tr></thead><tbody>' +
        n.rows.map(function (r) { return '<tr class="' + (r.c === 't' ? 'tot' : '') + '"><th scope="row" class="l' + (r.c === 't' ? '' : ' sub') + '">' + esc(r.l) + '</th><td class="n">' + m(r.a) + '</td>' + (X.FP ? '<td class="n">' + (r.b == null ? '' : m(r.b)) + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>';
    }).join('');
  }
  function ratiosHtml(X, RT) {
    if (!RT.length) return '';
    return '<table class="tbl tbf-st"><thead><tr><th class="l">Ratio</th><th class="l">How it is worked out</th><th class="n">' + esc(fd(X.end)) + '</th>' + (X.FP ? '<th class="n">' + esc(fd(X.pend)) + '</th><th class="n">Change</th>' : '') + '</tr></thead><tbody>' +
      RT.map(function (r) { return '<tr' + (r.explain ? ' class="low"' : '') + '><th scope="row" class="l">' + esc(r.name) + '</th><td class="l soft">' + esc(r.formula) + '</td><td class="n">' + rv(r.cy, r.k) + '</td>' + (X.FP ? '<td class="n">' + rv(r.py, r.k) + '</td><td class="n">' + (r.ch == null ? '—' : (Math.round(r.ch * 10) / 10) + '%') + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>' +
      '<p class="soft">Averages use last year\'s and this year\'s figures when last year is given. Debt service coverage and return on investment are left out: they need the loan principal repaid and income from investments, which a trial balance does not show. A change over 25% is marked: Schedule III asks for the reason in the notes.</p>';
  }
  /* T format (NSTF / NSTFV): this year, then last year */
  function tf(X, py) {
    var rows = py ? X.prow : X.rows, cs = py ? X.pcs : X.cs, R = NSTF.tradingPL(rows, cs, {}), open = {};
    rows.forEach(function (x) { if (x.g === 'cap') open[x.k] = r2((open[x.k] || 0) + x.cr - x.dr); });
    return { R: R, BS: NSTF.balanceSheet(rows, cs, R.net, { capOpen: open }) };
  }
  function capName(n) { var s = String(n).replace(/\b(capital|a\/c|account)\b/gi, ' ').replace(/['’]s\b/g, '').replace(/\s+/g, ' ').trim(); return s || n; }
  function tfHtml(X, what, en) {
    var o = { name: function (r) { return r.g === 'cap' ? capName(r.name) : r.name; } }; if (en) o.en = true;
    var A = tf(X), h = NSTFV.html(what === 'bs' ? A.BS : A.R, what === 'bs' ? 'bs' : 'tpl', o);
    if (X.FP) { var Bp = tf(X, true); h += '<h4>' + esc('Previous year: ' + (what === 'bs' ? 'as at ' + fd(X.pend) : 'year ended ' + fd(X.pend))) + '</h4>' + NSTFV.html(what === 'bs' ? Bp.BS : Bp.R, what === 'bs' ? 'bs' : 'tpl', o); }
    return h;
  }

  function resultHtml(X) {
    var M = model(X), RT = ratios(X), L = X.F.pl, ok = Math.abs(X.F.bs.diff) < 0.5;
    var tiles = '<div class="tiles"><div class="tile"><span>' + esc(t('tbp.t_rev')) + '</span><b>' + NS.money(L.rev) + '</b></div><div class="tile"><span>' + esc(t('tbp.t_gross')) + '</span><b>' + NS.money(X.fmt === 't' ? tf(X).R.gross : L.gross) + '</b></div>' +
      '<div class="tile' + (L.profit < 0 ? ' neg' : ' ok') + '"><span>' + esc(t(L.profit < 0 ? 'tbp.t_loss' : 'tbp.t_profit')) + '</span><b>' + NS.money(Math.abs(L.profit)) + '</b></div>' +
      '<div class="tile' + (ok ? ' ok' : ' warn') + '"><span>' + esc(t('tbp.t_bs')) + '</span><b>' + esc(ok ? t('tbp.agrees') : NS.money(X.F.bs.diff)) + '</b></div></div>';
    var TABS = [['bs', 'tbp.tab_bs'], ['pl', 'tbp.tab_pl'], ['notes', 'tbp.tab_notes'], ['ratios', 'tbp.tab_ratios'], ['tb', 'tbp.tab_tb']];
    var seg = '<div class="seg tf-fmt" role="group" aria-label="' + esc(t('tbp.fmt')) + '">' + [['v', 'tbp.f_v'], ['t', 'tbp.f_t']].map(function (f) { return '<button type="button" class="btn sm" data-fmt="' + f[0] + '" aria-pressed="' + (X.fmt === f[0]) + '">' + esc(t(f[1])) + '</button>'; }).join('') + '</div>';
    var nav = '<div class="tbf-tabs" role="tablist">' + TABS.map(function (x) { return '<button type="button" role="tab" class="btn sm" data-tab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + esc(t(x[1])) + '</button>'; }).join('') + '</div>';
    var body = '';
    if (tab === 'bs') body = X.fmt === 't' ? '<div class="tbl-wrap">' + tfHtml(X, 'bs') + '</div>' : '<div class="tbl-wrap">' + table(M.bs, heads2(X)) + '</div>';
    else if (tab === 'pl') body = X.fmt === 't' ? '<div class="tbl-wrap">' + tfHtml(X, 'pl') + '</div>' : '<div class="tbl-wrap">' + table(M.pl, pheads(X)) + '</div>';
    else if (tab === 'notes') body = '<div class="tbl-wrap tbf-notes">' + notesHtml(X, M) + '</div>';
    else if (tab === 'ratios') body = '<div class="tbl-wrap">' + ratiosHtml(X, RT) + '</div>';
    else body = tbHtml(X);
    var note = X.fmt === 't' ? t('tbp.tnote') : t(X.co ? 'tbp.vnote' : 'tbp.vnote2');
    return '<h3 data-i18n="tbp.result">' + esc(t('tbp.result')) + '</h3>' + tiles + seg + '<p class="hint">' + esc(note) + '</p>' + nav + '<div class="tbf-body">' + body + '</div>' +
      '<div class="btns"><button type="button" class="btn primary" data-f="print">' + esc(t('tbp.print')) + '</button><button type="button" class="btn" data-f="pdf">' + esc(t('tbp.pdf')) + '</button><button type="button" class="btn" data-f="xlsx">' + esc(t('tbp.xlsx')) + '</button>' +
      (Object.keys(heads()).length ? '<button type="button" class="btn sm danger" data-f="forget">' + esc(t('tbp.forget')) + '</button>' : '') + '</div>' +
      '<p class="soft">' + esc(t('tbp.notaudit')) + '</p><div class="tbf-print">' + sheet(X, M, RT) + '</div>';
  }
  function tbHtml(X) {
    var L = X.Pl.lines;
    return '<p class="hint">' + esc(t('tbp.tbh')) + '</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">' + esc(t('tbp.ledger')) + '</th><th class="l">' + esc(t('tbp.group')) + '</th><th class="l">' + esc(t('tbp.head')) + '</th><th class="n">' + esc(t('tbp.dr')) + '</th><th class="n">' + esc(t('tbp.cr')) + '</th>' +
      (X.R.hasPY ? '<th class="n">' + esc(t('tbp.pdr')) + '</th><th class="n">' + esc(t('tbp.pcr')) + '</th>' : '') + '<th></th></tr></thead><tbody>' +
      L.map(function (x) {
        return '<tr' + (!x.g ? ' class="low"' : '') + '><th scope="row" class="l">' + esc(x.name) + '</th><td class="l">' + esc(x.group) + '</td><td class="l">' + esc(x.g ? t('tbp.g_' + curHead(x).replace(':', '_')) : t('tbp.noplace')) + (x.why === 'map' ? ' <span class="pill">' + esc(t('tbp.yours')) + '</span>' : '') + '</td>' +
          '<td class="n">' + m(x.dr || '') + '</td><td class="n">' + m(x.cr || '') + '</td>' + (X.R.hasPY ? '<td class="n">' + m(x.pdr || '') + '</td><td class="n">' + m(x.pcr || '') + '</td>' : '') +
          '<td><button type="button" class="btn sm" data-chg="' + x.i + '">' + esc(t('tbp.change')) + '</button></td></tr>';
      }).join('') + '</tbody><tfoot><tr><th class="l" colspan="3">' + esc(t('tbp.total')) + '</th><th class="n">' + m(X.Pl.dr) + '</th><th class="n">' + m(X.Pl.cr) + '</th>' + (X.R.hasPY ? '<th class="n">' + m(X.Pl.pdr) + '</th><th class="n">' + m(X.Pl.pcr) + '</th>' : '') + '<th></th></tr></tfoot></table></div>';
  }
  /* the English paper: balance sheet, profit and loss, notes, ratios (and the T format pages when that is chosen) */
  function sheet(X, M, RT) {
    var top = function (what) { return '<div class="st-hd"><div><h3>' + esc(X.name || 'Final accounts') + '</h3></div><div class="r"><b>' + esc(what) + '</b></div></div>'; };
    var pb = '<div class="pb"></div>', s = '<div class="stsheet" data-tbf-sheet>';
    if (X.fmt === 't') s += top('Trading and Profit and Loss Account for the year ended ' + fd(X.end)) + tfHtml(X, 'pl', 1) + pb + top('Balance Sheet as at ' + fd(X.end)) + tfHtml(X, 'bs', 1);
    else s += top('Balance Sheet as at ' + fd(X.end)) + table(M.bs, heads2(X)) + pb + top('Statement of Profit and Loss for the year ended ' + fd(X.end)) + table(M.pl, pheads(X));
    s += pb + top('Notes to the accounts') + notesHtml(X, M) + (RT.length ? pb + top('Key ratios') + ratiosHtml(X, RT) : '');
    return s + '<p class="soft">Prepared from the trial balance in ' + esc(X.R.found.filter(function (f) { return f.kind; }).map(function (f) { return f.name; }).join(', ')) + '. Closing stock as typed. Not audited.</p>' + NS.creditLine('st-ft') + '</div>';
  }
  function xlsx() {
    var X = RES; if (!X) return;
    var M = model(X), RT = ratios(X), py = !!X.FP;
    function rows(arr, hd) { return [hd].concat(arr.map(function (r) { return [r.c === 's' || r.c === 'm' ? '    ' + r.l : r.l, r.n || '', r.a == null ? '' : r.a].concat(py ? [r.b == null ? '' : r.b] : []); })); }
    var notes = [['Note', 'Particulars', 'This year'].concat(py ? ['Last year'] : [])];
    M.notes.forEach(function (n) { notes.push([n.no, n.title, '', '']); n.rows.forEach(function (r) { notes.push(['', r.c === 't' ? 'Total' : '    ' + r.l, r.a == null ? '' : r.a].concat(py ? [r.b == null ? '' : r.b] : [])); }); notes.push([]); });
    var sh = [];
    if (X.fmt === 't') { var A = tf(X); sh.push(['Trading and P&L', NSTFV.rows(A.R, 'tpl'), [40, 14, 14, 40, 14, 14]], ['Balance Sheet (T)', NSTFV.rows(A.BS, 'bs'), [40, 14, 14, 40, 14, 14]]); }
    sh.push(['Balance Sheet', rows(M.bs, heads2(X)), [58, 8, 18, 18]], ['Profit and Loss', rows(M.pl, pheads(X)), [58, 8, 18, 18]], ['Notes', notes, [8, 60, 18, 18]]);
    if (RT.length) sh.push(['Ratios', [['Ratio', 'How it is worked out', 'This year'].concat(py ? ['Last year', 'Change %'] : [])].concat(RT.map(function (r) { return [r.name, r.formula, r.cy == null ? '' : r2(r.cy)].concat(py ? [r.py == null ? '' : r2(r.py), r.ch == null ? '' : r2(r.ch)] : []); })), [36, 60, 14, 14, 12]]);
    sh.push(['Trial balance', [['Ledger', 'Group', 'Head', 'Debit', 'Credit'].concat(py ? ['Last year debit', 'Last year credit'] : [])].concat(X.Pl.lines.map(function (x) { return [x.name, x.group, x.g ? t('tbp.g_' + curHead(x).replace(':', '_')) : 'Not placed', x.dr || '', x.cr || ''].concat(py ? [x.pdr || '', x.pcr || ''] : []); })), [40, 26, 34, 16, 16, 16, 16]]);
    xl('final-accounts-' + (X.name || 'business').replace(/[^\w-]+/g, '-').toLowerCase() + '-' + X.end + '.xlsx', sh.map(function (x) { return { name: x[0], rows: x[1] }; }));
  }

  /* ---------- the column screen (a sheet it could not read, or one read wrongly) ---------- */
  var CK = ['name', 'group', 'dr', 'cr', 'bal', 'side', 'pdr', 'pcr', 'pbal'];
  function colsDlg(i, py) {
    var list = py ? PY : CY, R = py ? RES.R.pyRead : RES.R, f = R && R.found[i]; if (!f) return;
    var sh = list.filter(function (s) { return s.name === f.name; })[0]; if (!sh || !sh.rows) { NS.toast(t('tbp.colsxml'), 'bad'); return; }
    var rows = sh.rows.filter(function (r) { return r && r.some(function (c) { return String(c == null ? '' : c).trim(); }); });
    var hr = f.kind ? f.row : 0, map = f.map || {}, width = Math.max.apply(null, rows.slice(0, 30).map(function (r) { return r.length; }).concat([1]));
    var opts = function (k) { var s = '<option value="">—</option>'; for (var c = 0; c < width; c++) s += '<option value="' + c + '"' + (map[k] === c ? ' selected' : '') + '>' + esc(t('tbp.colno', { n: c + 1 })) + ': ' + esc(String(rows[hr] && rows[hr][c] != null ? rows[hr][c] : '').slice(0, 30)) + '</option>'; return s; };
    var d = document.createElement('dialog'); d.className = 'hub-dlg tbf-dlg';
    d.innerHTML = '<div class="dlg-hd"><h2>' + esc(t('tbp.colst', { f: f.name })) + '</h2><button type="button" class="icon-btn" data-x aria-label="Close">✕</button></div><form method="dialog"><p class="soft">' + esc(t('tbp.colsh')) + '</p>' +
      '<div class="tbl-wrap"><table class="tbl"><tbody>' + rows.slice(0, 8).map(function (r, ri) { return '<tr><th class="l">' + (ri + 1) + '</th>' + r.slice(0, 10).map(function (c) { return '<td class="l">' + esc(String(c == null ? '' : c).slice(0, 24)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="fg"><div class="f"><label for="tbf-hr">' + esc(t('tbp.hrow')) + '</label><input id="tbf-hr" type="number" min="1" value="' + (hr + 1) + '"></div>' +
      CK.map(function (k) { return '<div class="f"><label for="tbf-c-' + k + '">' + esc(t('tbp.c_' + k)) + '</label><select id="tbf-c-' + k + '">' + opts(k) + '</select></div>'; }).join('') + '</div>' +
      '<div class="btns"><button class="btn primary" value="ok">' + esc(t('tbp.usecols')) + '</button><button type="button" class="btn" data-x>' + esc(t('tbp.cancel')) + '</button></div></form>';
    document.body.appendChild(d); d.showModal();
    $$('[data-x]', d).forEach(function (b) { b.addEventListener('click', function () { d.close(); }); });
    d.addEventListener('close', function () {
      if (d.returnValue === 'ok') {
        var row = Math.max(0, (+$('#tbf-hr', d).value || 1) - 1), mp = {};
        CK.forEach(function (k) { var v = $('#tbf-c-' + k, d).value; if (v !== '') mp[k] = +v; });
        if (!('name' in mp) || !('dr' in mp || 'cr' in mp || 'bal' in mp)) { NS.toast(t('tbp.colsneed'), 'bad'); d.remove(); return; }
        var heads = B.headsAt(rows, row), sig = B.sig(heads), L = lays(); L[sig] = { map: mp }; ls('ns-tb-lay', L);
        ST = ST || {}; var fk = py ? 'forcePy' : 'force'; ST[fk] = ST[fk] || {}; ST[fk][f.name] = { row: row, map: mp, heads: heads, sig: sig, remembered: true, ok: true };
        NS.toast(t('tbp.colsok')); run();
      }
      d.remove();
    });
  }
  function chgDlg(i) {
    var x = RES.Pl.lines.filter(function (y) { return y.i === i; })[0]; if (!x) return;
    var d = document.createElement('dialog'); d.className = 'hub-dlg tbf-dlg';
    d.innerHTML = '<div class="dlg-hd"><h2>' + esc(x.name) + '</h2><button type="button" class="icon-btn" data-x aria-label="Close">✕</button></div><form method="dialog"><p class="soft">' + esc(t('tbp.chgh', { g: x.group || '—' })) + '</p>' +
      '<div class="f"><label for="tbf-cg">' + esc(t('tbp.head')) + '</label>' + headSel('tbf-cg', curHead(x)) + '</div><div class="btns"><button class="btn primary" value="ok">' + esc(t('tbp.save')) + '</button><button type="button" class="btn" data-x>' + esc(t('tbp.cancel')) + '</button></div></form>';
    document.body.appendChild(d); d.showModal();
    $$('[data-x]', d).forEach(function (b) { b.addEventListener('click', function () { d.close(); }); });
    d.addEventListener('close', function () { if (d.returnValue === 'ok') remember(x.name, $('#tbf-cg', d).value); d.remove(); });
  }
  function remember(name, h) {
    var M = heads(); if (h) M[key(name)] = h; else delete M[key(name)];
    ls('ns-tb-map', M); run();
  }

  /* ---------- events ---------- */
  function onChange(e) {
    var el = e.target;
    if (el.id === 'tbf-in') { load(el.files, 'cy'); el.value = ''; }
    else if (el.id === 'tbf-py') { load(el.files, 'py'); el.value = ''; }
    else if (el.matches('[data-map]')) { if (el.value) remember(el.getAttribute('data-map'), el.value); }
    else if (el.id === 'tbf-name' || el.id === 'tbf-kind') { var s = set(); s.name = $('#tbf-name', BOX).value.trim(); s.kind = $('#tbf-kind', BOX).value; if (el.id === 'tbf-kind') s.fmt = ''; ls('ns-tb-set', s); run(); }
    else if (el.id === 'tbf-end') { ST = ST || {}; ST.end = el.value || ''; run(); }
    else if (el.id === 'tbf-cs' || el.id === 'tbf-pcs') { ST = ST || {}; var v = el.value.trim(); ST[el.id === 'tbf-cs' ? 'cs' : 'pcs'] = v === '' ? null : r2(NS.num(v)); run(); }
  }
  function onClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    var f = b.getAttribute('data-f');
    if (f === 'sample') sample();
    else if (f === 'dlsample') dlSample();
    else if (f === 'clear') { CY = []; PY = []; ST = null; RES = null; $$('.tbf-fn', BOX).forEach(function (s) { s.textContent = ''; }); run(); }
    else if (f === 'print') { document.documentElement.classList.add('tbf-printing'); window.print(); }
    else if (f === 'pdf') { var n = $('[data-tbf-sheet]', BOX); if (n) NS.sharePdf([n], (RES.name || 'final accounts') + ' ' + RES.end, 'a4', 'Final accounts', 'Final accounts'); }
    else if (f === 'xlsx') xlsx();
    else if (f === 'forget') { if (NS.okSync ? NS.okSync(t('tbp.forgetq')) : confirm(t('tbp.forgetq'))) { ls('ns-tb-map', null); run(); } }
    else if (b.hasAttribute('data-fmt')) { var s = set(); s.fmt = b.getAttribute('data-fmt'); ls('ns-tb-set', s); run(); }
    else if (b.hasAttribute('data-tab')) { tab = b.getAttribute('data-tab'); run(); var tb = $('[data-tab="' + tab + '"]', BOX); if (tb) tb.focus(); }
    else if (b.hasAttribute('data-cols')) colsDlg(+b.getAttribute('data-cols'), b.getAttribute('data-py') === '1');
    else if (b.hasAttribute('data-chg')) chgDlg(+b.getAttribute('data-chg'));
  }
  window.addEventListener('afterprint', function () { document.documentElement.classList.remove('tbf-printing'); });

  function init() {
    BOX = panel();
    document.addEventListener('ns-lang', function () { run(); });
    /* ?try=sample opens the sample at once (links from the guides) */
    if (/[?&]try=sample\b/.test(location.search)) sample();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.NSTBF = { sample: sample, load: load, res: function () { return RES; } };
})();
