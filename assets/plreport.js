/* profit-loss.niveshsahayak.in: trial balance, profit and loss and balance sheet on the shared data home.
   The figures come from the saved records (NSPL.fromBooks over NSBooks and NSStock) or, for a business whose books are
   kept elsewhere (Tally, a CA, a register), only from lines typed here. Typed lines add what the documents never hold:
   fixed assets and depreciation, capital, loans, drawings, other income, tax. Every line has a Schedule III head and can be
   moved to another head. A set of statements can be saved as a 'pl' record (books.js ignores it); a draft of the typed
   lines is kept in this browser per business. Screens are in the user's language; the print sheet is English. */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, money = NS.money, P = NSPL, t = NSB.t, key = NSB.key;
  var SITE = 'profit-loss', TABS = ['pl', 'bs', 'tb', 'saved'], cur = 'pl', W = null, wid = '';
  /* credit-nature heads: their amount is cr − dr */
  var CRH = { cap: 1, res: 1, ltb: 1, stb: 1, tpay: 1, ocl: 1, rev: 1, oinc: 1 };
  var EN_H = { cap: 'Capital', drw: 'Drawings', res: 'Reserves and surplus', ltb: 'Long-term borrowings', stb: 'Short-term borrowings', tpay: 'Trade payables', ocl: 'Other current liabilities',
    ppe: 'Property, plant and equipment', ninv: 'Investments', trec: 'Trade receivables', cash: 'Cash and cash equivalents', oca: 'Short-term loans, advances and other current assets',
    rev: 'Revenue from operations', oinc: 'Other income', osk: 'Opening stock', mat: 'Cost of materials consumed', pur: 'Purchases of stock-in-trade', emp: 'Employee benefits expense',
    fin: 'Finance costs', dep: 'Depreciation and amortisation expense', oth: 'Other expenses', tax: 'Tax expense' };

  function route() { var h = location.hash.slice(1); cur = TABS.indexOf(h) >= 0 ? h : 'pl'; show(true); }
  function show(focus) {
    NSB.navMark(cur);
    return NSB.load().then(function () {
      var pane = $('[data-pane]');
      NSB.modeLine();
      if (!NSB.biz()) { pane.innerHTML = NSB.noBiz(); return; }
      work();
      pane.innerHTML = NSB.bizBar() + (cur === 'saved' ? savedHtml() : mainHtml());
      wire(pane);
      if (focus) NSB.focusH2(pane);
    });
  }
  function D() { return NSB.mine(); }
  function byId(id) { return NSB.data().doc.filter(function (d) { return d.id === id; })[0]; }

  /* ---------- working set: one per business, draft kept in this browser ---------- */
  function work() {
    var b = NSB.biz(), id = b.id || key(b.name);
    if (W && wid === id) return;
    wid = id; W = null;
    try { W = JSON.parse(localStorage.getItem('ns-pl-draft-' + id) || 'null'); } catch (e) {}
    W = Object.assign({ src: 'books', typed: [], os: null, cs: null, heads: {}, saveId: '' }, W || {});
  }
  function keepDraft() { try { localStorage.setItem('ns-pl-draft-' + wid, JSON.stringify(W)); } catch (e) {} }
  /* expense heads typed in the screen language: their head */
  function headMap() {
    var m = {}; m[key(t('app.ex_salary'))] = 'emp'; m[key(t('br.e_int'))] = 'fin'; m[key(t('br.e_emi'))] = 'ltb'; m[key(t('br.e_chg'))] = 'oth';
    return m;
  }
  function calc() {
    var p = NSB.period(SITE), base;
    if (W.src === 'typed') {
      base = { rows: [], os: r2(num(W.os)), cs: r2(num(W.cs)) };
      if (base.os) base.rows.push({ k: 'osk', name: 'Opening stock', g: 'osk', dr: base.os, cr: 0, src: 'stock' });
    } else base = P.fromBooks(D(), NSB.data().item, NSB.bizName(), p.from, p.to, { os: W.os, cs: W.cs, map: headMap() });
    var rows = base.rows.map(function (r) { return W.heads[r.k] ? Object.assign({}, r, { g: W.heads[r.k] }) : r; })
      .concat(W.typed.map(function (r, i) { return Object.assign({ src: 'typed', ti: i }, r); }));
    rows.sort(function (a, b) { return P.ORDER.indexOf(a.g) - P.ORDER.indexOf(b.g); });
    return { p: p, rows: rows, os: base.os, cs: base.cs, F: P.statements(rows, base.cs) };
  }
  /* screen names of the lines made from the books (expense lines keep the head the user typed) */
  var LBL = { sales: 'sales', 'sales-return': 'sret', purchases: 'pur', 'purchase-return': 'pret', 'round-off': 'round', cash: 'cash', bank: 'bank', 'chq-in': 'chqin', 'chq-out': 'chqout',
    'tds-receivable': 'tdsr', 'tds-payable': 'tdsp', opening: 'opening', osk: 'osk', 'cap-stock': 'capstock' };
  function nm(r) {
    if (r.src === 'typed') return r.name;
    if (r.k === 'trec' || r.k === 'tpay') return t('pl.l_' + r.k, { n: r.n });
    if (r.k === 'gst') return t(r.dr ? 'pl.l_gstin' : 'pl.l_gstout');
    if (r.k === 'res-earlier') return t(r.cr ? 'pl.l_earlierp' : 'pl.l_earlierl');
    return LBL[r.k] ? t('pl.l_' + LBL[r.k]) : r.name;
  }
  function amt(r) { return CRH[r.g] ? r2(r.cr - r.dr) : r2(r.dr - r.cr); }

  /* ---------- screens ---------- */
  function mainHtml() {
    var C = calc(), F = C.F, p = C.p;
    var head = '<div class="pane-hd"><h2>' + esc(t('pl.t_' + cur)) + '</h2><div class="quick"><button type="button" class="btn primary" data-add>+ ' + esc(t('pl.addline')) + '</button></div></div>';
    var setup = NSB.periodBar(SITE) + '<div class="sb-period"><div class="f"><label for="pl-src">' + esc(t('pl.src')) + '</label><select id="pl-src"><option value="books"' + (W.src === 'books' ? ' selected' : '') + '>' + esc(t('pl.src_books')) + '</option><option value="typed"' + (W.src === 'typed' ? ' selected' : '') + '>' + esc(t('pl.src_typed')) + '</option></select></div>' +
      '<div class="f"><label for="pl-os">' + esc(t('pl.os', { d: NS.fmtDate(p.from) })) + '</label><input id="pl-os" inputmode="decimal" value="' + esc(W.os == null ? '' : W.os) + '" placeholder="' + esc(W.src === 'books' ? money(C.os, false) : '0') + '"></div>' +
      '<div class="f"><label for="pl-cs">' + esc(t('pl.cs', { d: NS.fmtDate(p.to) })) + '</label><input id="pl-cs" inputmode="decimal" value="' + esc(W.cs == null ? '' : W.cs) + '" placeholder="' + esc(W.src === 'books' ? money(C.cs, false) : '0') + '"></div></div>' +
      '<p class="hint">' + esc(t(W.src === 'books' ? 'pl.stockh' : 'pl.typedh')) + '</p>';
    var ok = Math.abs(F.tb.diff) < 0.005;
    var tiles = '<div class="tiles"><div class="tile"><span>' + esc(t('pl.k_rev')) + '</span><b>' + money(F.pl.rev) + '</b></div><div class="tile"><span>' + esc(t('pl.k_gross')) + '</span><b>' + money(F.pl.gross) + '</b></div>' +
      '<div class="tile' + (F.pl.profit < 0 ? ' neg' : ' ok') + '"><span>' + esc(t(F.pl.profit < 0 ? 'pl.k_loss' : 'pl.k_profit')) + '</span><b>' + money(Math.abs(F.pl.profit)) + '</b></div>' +
      '<a class="tile' + (ok ? ' ok' : ' warn') + '" href="#tb"><span>' + esc(t('pl.k_tb')) + '</span><b>' + esc(ok ? t('pl.agrees') : money(F.tb.diff)) + '</b></a></div>';
    var warn = '';
    if (!ok) warn += '<p class="sb-note bad">' + esc(t('pl.w_diff', { x: money(Math.abs(F.tb.diff)), s: t(F.tb.diff > 0 ? 'pl.dr' : 'pl.cr') })) + '</p>';
    var typedCash = W.typed.some(function (r) { return r.g === 'cash'; });
    if (!typedCash) C.rows.forEach(function (r) { if ((r.k === 'cash' || r.k === 'bank') && r.cr) warn += '<p class="sb-note bad">' + esc(t('pl.w_neg', { a: nm(r) })) + '</p>'; });
    if (W.src === 'books' && !C.rows.some(function (r) { return r.g === 'rev'; })) warn += '<p class="sb-note">' + esc(t('pl.w_nosales')) + '</p>';
    var body = cur === 'bs' ? bsHtml(C) : cur === 'tb' ? tbHtml(C) : plHtml(C);
    return head + setup + tiles + warn + body +
      '<div class="btns"><button type="button" class="btn primary" data-save>' + esc(t('sb.save')) + '</button><button type="button" class="btn" data-print>' + esc(t('sb.print')) + '</button><button type="button" class="btn" data-pdf>' + esc(t('sb.pdf')) + '</button><button type="button" class="btn" data-csv>' + esc(t('sb.csv')) + '</button>' +
      (W.typed.length || W.os != null || W.cs != null || Object.keys(W.heads).length ? '<button type="button" class="btn danger" data-reset>' + esc(t('pl.reset')) + '</button>' : '') + '</div>' +
      '<div class="sb-print">' + sheet(C) + '</div>';
  }
  function tr(label, v, cls, sub) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row" class="l' + (sub ? ' sub' : '') + '">' + esc(label) + '</th><td class="n">' + (v == null ? '' : money(v, false)) + '</td></tr>'; }
  function subs(C, g, neg) { return C.rows.filter(function (r) { return r.g === g; }).map(function (r) { return tr(nm(r), neg ? -amt(r) : amt(r), '', 1); }).join(''); }
  function hd(g, v, C, neg) { return tr(t('pl.g_' + g), v, 'b') + (C.rows.filter(function (r) { return r.g === g; }).length > 1 || g === 'oth' || g === 'emp' ? subs(C, g, neg) : ''); }
  function plHtml(C) {
    var L = C.F.pl, p = C.p;
    return '<h3>' + esc(t('pl.plfor', { a: NS.fmtDate(p.from), b: NS.fmtDate(p.to) })) + '</h3><div class="tbl-wrap"><table class="tbl pl-st"><thead><tr><th class="l">' + esc(t('sb.part')) + '</th><th class="n">' + esc(t('pl.amt')) + '</th></tr></thead><tbody>' +
      hd('rev', L.rev, C) + hd('oinc', L.oinc, C) + tr(t('pl.income'), L.income, 'tot') +
      '<tr class="sec"><th colspan="2" class="l">' + esc(t('pl.expenses')) + '</th></tr>' +
      (L.mat ? hd('mat', L.mat, C) : '') + hd('pur', L.pur, C) + tr(t('pl.chg'), L.chg, 'b') + tr(t('pl.l_osk'), C.os, '', 1) + tr(t('pl.lesscs'), -C.cs, '', 1) +
      hd('emp', L.emp, C) + hd('fin', L.fin, C) + hd('dep', L.dep, C) + hd('oth', L.oth, C) + tr(t('pl.totexp'), L.exp, 'tot') +
      tr(t('pl.pbt'), L.pbt, 'tot') + (L.tax ? hd('tax', L.tax, C) : '') + tr(t(L.profit < 0 ? 'pl.loss' : 'pl.profit'), Math.abs(L.profit), 'tot big') + '</tbody></table></div>' +
      '<p class="sb-note">' + esc(t('pl.grossh', { g: money(L.gross) })) + '</p>';
  }
  function bsHtml(C) {
    var S = C.F.bs;
    return '<h3>' + esc(t('pl.bsat', { d: NS.fmtDate(C.p.to) })) + '</h3><div class="tbl-wrap"><table class="tbl pl-st"><thead><tr><th class="l">' + esc(t('sb.part')) + '</th><th class="n">' + esc(t('pl.amt')) + '</th></tr></thead><tbody>' +
      '<tr class="sec"><th colspan="2" class="l">' + esc(t('pl.el')) + '</th></tr>' +
      tr(t('pl.own'), S.own, 'b') + subs(C, 'cap') + (S.drw ? tr(t('pl.lessdrw'), -S.drw, '', 1) : '') + tr(t('pl.g_res'), S.res, '', 1) +
      (S.ltb ? tr(t('pl.ncl'), S.ncl, 'b') + subs(C, 'ltb') : '') +
      tr(t('pl.cl'), S.cl, 'b') + (S.stb ? tr(t('pl.g_stb'), S.stb, '', 1) : '') + tr(t('pl.g_tpay'), S.tpay, '', 1) + tr(t('pl.g_ocl'), S.ocl, '', 1) +
      tr(t('pl.total'), S.el, 'tot') +
      '<tr class="sec"><th colspan="2" class="l">' + esc(t('pl.assets')) + '</th></tr>' +
      (S.nca ? tr(t('pl.nca'), S.nca, 'b') + (S.ppe ? tr(t('pl.g_ppe'), S.ppe, '', 1) : '') + (S.ninv ? tr(t('pl.g_ninv'), S.ninv, '', 1) : '') : '') +
      tr(t('pl.ca'), S.ca, 'b') + tr(t('pl.inv'), S.inv, '', 1) + tr(t('pl.g_trec'), S.trec, '', 1) + tr(t('pl.g_cash'), S.cash, '', 1) + tr(t('pl.g_oca'), S.oca, '', 1) +
      tr(t('pl.total'), S.assets, 'tot') + (Math.abs(S.diff) >= 0.005 ? tr(t('pl.bsdiff'), S.diff, 'bad') : '') + '</tbody></table></div>' +
      '<p class="sb-note">' + esc(t('pl.bsh')) + '</p>';
  }
  function headSel(id, g, attr) {
    function opts(side) { return P.ORDER.filter(function (h) { return P.SIDE[h] === side && h !== 'osk'; }).map(function (h) { return '<option value="' + h + '"' + (h === g ? ' selected' : '') + '>' + esc(t('pl.g_' + h)) + '</option>'; }).join(''); }
    return '<select id="' + id + '" ' + (attr || '') + '><optgroup label="' + esc(t('pl.side_bs')) + '">' + opts('bs') + '</optgroup><optgroup label="' + esc(t('pl.side_pl')) + '">' + opts('pl') + '</optgroup></select>';
  }
  function tbHtml(C) {
    var T = C.F.tb, i = 0;
    return '<h3>' + esc(t('pl.tbas', { d: NS.fmtDate(C.p.to) })) + '</h3><p class="hint">' + esc(t('pl.tbh')) + '</p><div class="tbl-wrap"><table class="tbl pl-tb"><thead><tr><th class="l">' + esc(t('pl.acct')) + '</th><th class="l">' + esc(t('pl.head')) + '</th><th class="n">' + esc(t('pl.dr')) + '</th><th class="n">' + esc(t('pl.cr')) + '</th><th></th></tr></thead><tbody>' +
      C.rows.map(function (r) {
        var id = 'pl-h' + (i++), mov = r.src === 'books' && r.g !== 'osk';
        return '<tr><td class="l">' + esc(nm(r)) + (r.src === 'typed' ? ' <span class="pill">' + esc(t('pl.typed')) + '</span>' : '') + '</td><td class="l">' +
          (mov ? '<label class="sr" for="' + id + '">' + esc(t('pl.head')) + '</label>' + headSel(id, r.g, 'data-move="' + esc(r.k) + '"') : r.src === 'typed' ? esc(t('pl.g_' + r.g)) : esc(t('pl.g_' + r.g))) + '</td>' +
          '<td class="n">' + (r.dr ? money(r.dr, false) : '') + '</td><td class="n">' + (r.cr ? money(r.cr, false) : '') + '</td><td>' +
          (r.src === 'typed' ? '<button type="button" class="btn sm" data-edit="' + r.ti + '">' + esc(t('sb.edit')) + '</button> <button type="button" class="btn sm danger" data-rm="' + r.ti + '">' + esc(t('sb.del')) + '</button>' : '') + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><th class="l" colspan="2">' + esc(t('pl.total')) + '</th><th class="n">' + money(T.dr, false) + '</th><th class="n">' + money(T.cr, false) + '</th><th></th></tr>' +
      (Math.abs(T.diff) >= 0.005 ? '<tr class="bad"><th class="l" colspan="2">' + esc(t('pl.k_tb')) + '</th><th class="n" colspan="2">' + money(T.diff) + '</th><th></th></tr>' : '') + '</tfoot></table></div>' +
      '<p class="sb-note">' + esc(t('pl.csnote', { x: money(C.cs) })) + '</p>';
  }

  /* English print sheet: profit and loss, balance sheet, trial balance (each on its own page) */
  function sheet(C) {
    var b = NSB.biz() || {}, L = C.F.pl, S = C.F.bs, p = C.p;
    function r(l, v, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(l) + '</td><td class="n">' + (v == null ? '' : money(v, false)) + '</td></tr>'; }
    function lines(g, neg) { return C.rows.filter(function (x) { return x.g === g; }).map(function (x) { return r('   ' + x.name, neg ? -amt(x) : amt(x), 's'); }).join(''); }
    var top = function (what) { return '<div class="st-hd"><div><h3>' + esc(b.name || '') + '</h3><div class="soft">' + esc([b.addr, b.city, b.gstin && 'GSTIN ' + b.gstin].filter(Boolean).join(', ')) + '</div></div><div class="r"><b>' + esc(what) + '</b></div></div>'; };
    return '<div class="stsheet" data-sheet>' + top('Statement of profit and loss for ' + NS.fmtDate(p.from) + ' to ' + NS.fmtDate(p.to)) +
      '<table class="tbl"><thead><tr><th>Particulars</th><th class="n">Amount (₹)</th></tr></thead><tbody>' +
      r(EN_H.rev, L.rev, 'b') + lines('rev') + r(EN_H.oinc, L.oinc, 'b') + lines('oinc') + r('Total income', L.income, 'b') +
      r('Expenses', null, 'b') + (L.mat ? r(EN_H.mat, L.mat) : '') + r(EN_H.pur, L.pur) + r('Changes in inventories of stock-in-trade (opening ' + money(C.os, false) + ' less closing ' + money(C.cs, false) + ')', L.chg) +
      r(EN_H.emp, L.emp) + lines('emp') + r(EN_H.fin, L.fin) + r(EN_H.dep, L.dep) + r(EN_H.oth, L.oth) + lines('oth') + r('Total expenses', L.exp, 'b') +
      r('Profit before tax', L.pbt, 'b') + (L.tax ? r(EN_H.tax, L.tax) : '') + r(L.profit < 0 ? 'Loss for the period' : 'Profit for the period', Math.abs(L.profit), 'b') + '</tbody></table>' +
      '<div class="pb"></div>' + top('Balance sheet as at ' + NS.fmtDate(p.to)) +
      '<table class="tbl"><thead><tr><th>Particulars</th><th class="n">Amount (₹)</th></tr></thead><tbody>' +
      r('EQUITY AND LIABILITIES', null, 'b') + r("Owner's funds", S.own, 'b') + lines('cap') + (S.drw ? r('   Less: drawings', -S.drw, 's') : '') + r('   ' + EN_H.res + ' (including profit for the period)', S.res, 's') +
      (S.ltb ? r('Non-current liabilities: ' + EN_H.ltb, S.ltb, 'b') : '') + r('Current liabilities', S.cl, 'b') + (S.stb ? r('   ' + EN_H.stb, S.stb, 's') : '') + r('   ' + EN_H.tpay, S.tpay, 's') + r('   ' + EN_H.ocl, S.ocl, 's') +
      r('Total', S.el, 'b') + r('ASSETS', null, 'b') + (S.nca ? r('Non-current assets', S.nca, 'b') + (S.ppe ? r('   ' + EN_H.ppe, S.ppe, 's') : '') + (S.ninv ? r('   ' + EN_H.ninv, S.ninv, 's') : '') : '') +
      r('Current assets', S.ca, 'b') + r('   Inventories', S.inv, 's') + r('   ' + EN_H.trec, S.trec, 's') + r('   ' + EN_H.cash, S.cash, 's') + r('   ' + EN_H.oca, S.oca, 's') + r('Total', S.assets, 'b') +
      (Math.abs(S.diff) >= 0.005 ? r('Difference (trial balance does not agree)', S.diff, 'b') : '') + '</tbody></table>' +
      '<div class="pb"></div>' + top('Trial balance as at ' + NS.fmtDate(p.to)) +
      '<table class="tbl"><thead><tr><th>Account</th><th>Head</th><th class="n">Debit (₹)</th><th class="n">Credit (₹)</th></tr></thead><tbody>' +
      C.rows.map(function (x) { return '<tr><td>' + esc(x.k === 'trec' ? 'Trade receivables (' + x.n + ' parties)' : x.k === 'tpay' ? 'Trade payables (' + x.n + ' parties)' : x.name) + '</td><td>' + esc(EN_H[x.g]) + '</td><td class="n">' + (x.dr ? money(x.dr, false) : '') + '</td><td class="n">' + (x.cr ? money(x.cr, false) : '') + '</td></tr>'; }).join('') +
      '<tr class="b"><td colspan="2">Total</td><td class="n">' + money(C.F.tb.dr, false) + '</td><td class="n">' + money(C.F.tb.cr, false) + '</td></tr></tbody></table>' +
      '<p class="soft">Closing stock ' + money(C.cs, false) + ' is shown as inventories and in the change in inventories. ' + (W.src === 'books' ? 'Figures from the records saved in Nivesh Sahayak, with typed lines.' : 'Figures typed by hand.') + ' Not audited.</p>' +
      '<div class="st-ft">Made with Nivesh Sahayak Profit and Loss (profit-loss.niveshsahayak.in) on ' + NS.fmtDate(NS.today()) + '</div></div>';
  }

  /* ---------- typed lines ---------- */
  function lineForm(i) {
    var x = i == null ? { name: '', g: 'dep', dr: 0, cr: 0 } : W.typed[i];
    var f = NSB.dialog(t(i == null ? 'pl.addline' : 'pl.editline'), '<p class="hint">' + esc(t('pl.lineh')) + '</p><div class="fg"><div class="f wide"><label for="f-name">' + esc(t('pl.acct')) + '</label><input id="f-name" dir="auto" required value="' + esc(x.name) + '" list="pl-ideas"><datalist id="pl-ideas">' +
      ['i_cap', 'i_drw', 'i_ppe', 'i_dep', 'i_loan', 'i_int', 'i_oinc', 'i_cash', 'i_tax'].map(function (k) { return '<option value="' + esc(t('pl.' + k)) + '">'; }).join('') + '</datalist></div>' +
      '<div class="f wide"><label for="f-g">' + esc(t('pl.head')) + '</label>' + headSel('f-g', x.g) + '</div>' +
      '<div class="f"><label for="f-dr">' + esc(t('pl.dr')) + '</label><input id="f-dr" inputmode="decimal" value="' + esc(x.dr || '') + '"></div><div class="f"><label for="f-cr">' + esc(t('pl.cr')) + '</label><input id="f-cr" inputmode="decimal" value="' + esc(x.cr || '') + '"></div></div>' +
      '<p class="hint">' + esc(t('pl.drcrh')) + '</p><div class="btns"><button class="btn primary">' + esc(t('sb.save')) + '</button><button type="button" class="btn" onclick="this.closest(\'dialog\').close()">' + esc(t('sb.cancel')) + '</button></div>');
    var guess = { i_cap: 'cap', i_drw: 'drw', i_ppe: 'ppe', i_dep: 'dep', i_loan: 'ltb', i_int: 'fin', i_oinc: 'oinc', i_cash: 'cash', i_tax: 'tax' };
    $('#f-name', f).addEventListener('change', function () { var v = key(this.value); Object.keys(guess).forEach(function (k) { if (key(t('pl.' + k)) === v) $('#f-g', f).value = guess[k]; }); });
    f.onsubmit = function (e) {
      e.preventDefault();
      var dr = r2(num($('#f-dr', f).value)), cr = r2(num($('#f-cr', f).value)), name = $('#f-name', f).value.trim();
      if (!name || !dr === !cr) { NS.toast(t('pl.oneamt'), 'bad'); return; }
      var row = { k: 'typed-' + Date.now().toString(36), name: name, g: $('#f-g', f).value, dr: dr, cr: cr };
      if (i == null) W.typed.push(row); else { row.k = W.typed[i].k; W.typed[i] = row; }
      keepDraft(); NSB.closeDialog(); NS.toast(t('pl.lineok')); show();
    };
  }

  /* ---------- saved statements ---------- */
  function save() {
    var C = calc(), rec = W.saveId && byId(W.saveId) || { type: 'pl', app: 1 };
    Object.assign(rec, { seller: NSB.sellerCopy(), date: C.p.to, from: C.p.from, to: C.p.to, src: W.src, typed: W.typed, os: W.os, cs: W.cs, heads: W.heads,
      profit: C.F.pl.profit, revenue: C.F.pl.rev, assets: C.F.bs.assets, diff: C.F.tb.diff });
    NSStore.put('doc', rec).then(function (s) { W.saveId = s && s.id || rec.id; keepDraft(); NS.toast(t('sb.saved')); show(); });
  }
  function savedHtml() {
    var list = D().filter(function (d) { return d.type === 'pl'; }).sort(function (a, b) { return (b.to || '').localeCompare(a.to || ''); });
    return '<div class="pane-hd"><h2>' + esc(t('pl.t_saved')) + '</h2></div>' + (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(t('pl.period')) + '</th><th class="l">' + esc(t('pl.src')) + '</th><th class="n">' + esc(t('pl.k_rev')) + '</th><th class="n">' + esc(t('pl.k_profit')) + '</th><th></th></tr></thead><tbody>' +
      list.map(function (d) {
        return '<tr><td>' + NS.fmtDate(d.from) + ' – ' + NS.fmtDate(d.to) + '</td><td class="l">' + esc(t(d.src === 'typed' ? 'pl.src_typed' : 'pl.src_books')) + '</td><td class="n">' + money(d.revenue || 0, false) + '</td><td class="n">' + money(d.profit || 0, false) + '</td>' +
          '<td><button type="button" class="btn sm" data-open="' + esc(d.id) + '">' + esc(t('pl.reopen')) + '</button> <button type="button" class="btn sm danger" data-del="' + esc(d.id) + '">' + esc(t('sb.del')) + '</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card"><p>' + esc(t('pl.nosaved')) + '</p></div>');
  }
  function reopen(d) {
    W = { src: d.src || 'books', typed: d.typed || [], os: d.os == null ? null : d.os, cs: d.cs == null ? null : d.cs, heads: d.heads || {}, saveId: d.id };
    try { localStorage.setItem('ns-' + SITE + '-period', JSON.stringify({ from: d.from, to: d.to })); } catch (e) {}
    keepDraft(); location.hash = '';
    route();
  }

  function wire(pane) {
    NSB.wireBiz(pane, function () { W = null; show(); });
    NSB.wirePeriod(pane, SITE, show);
    var src = $('#pl-src', pane); if (src) src.addEventListener('change', function () { W.src = src.value; keepDraft(); show(); });
    [['#pl-os', 'os'], ['#pl-cs', 'cs']].forEach(function (a) { var x = $(a[0], pane); if (x) x.addEventListener('change', function () { W[a[1]] = x.value.trim() === '' ? null : r2(num(x.value)); keepDraft(); show(); }); });
    var add = $('[data-add]', pane); if (add) add.addEventListener('click', function () { lineForm(null); });
    $$('[data-edit]', pane).forEach(function (b) { b.addEventListener('click', function () { lineForm(+b.getAttribute('data-edit')); }); });
    $$('[data-rm]', pane).forEach(function (b) { b.addEventListener('click', function () { W.typed.splice(+b.getAttribute('data-rm'), 1); keepDraft(); show(); }); });
    $$('[data-move]', pane).forEach(function (s) { s.addEventListener('change', function () { W.heads[s.getAttribute('data-move')] = s.value; keepDraft(); show(); }); });
    var sv = $('[data-save]', pane); if (sv) sv.addEventListener('click', save);
    var rs = $('[data-reset]', pane); if (rs) rs.addEventListener('click', function () { if (confirm(t('pl.resetc'))) { W = { src: W.src, typed: [], os: null, cs: null, heads: {}, saveId: '' }; keepDraft(); show(); } });
    $$('[data-open]', pane).forEach(function (b) { b.addEventListener('click', function () { var d = byId(b.getAttribute('data-open')); if (d) reopen(d); }); });
    $$('[data-del]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var d = byId(b.getAttribute('data-del'));
      if (d && confirm(t('sb.cdel', { x: t('pl.one') + ' ' + NS.fmtDate(d.to) }))) NSStore.del('doc', d.id).then(function () { if (W.saveId === d.id) W.saveId = ''; NS.toast(t('sb.deleted')); show(); });
    }); });
    var pr = $('[data-print]', pane), pdf = $('[data-pdf]', pane), cv = $('[data-csv]', pane);
    if (pr) pr.addEventListener('click', NSB.printSheet);
    if (pdf) pdf.addEventListener('click', function () { NSB.shareSheet($('[data-sheet]', pane), NSB.bizName() + ' profit and loss ' + NSB.period(SITE).to); });
    if (cv) cv.addEventListener('click', function () {
      var C = calc(), L = C.F.pl, S = C.F.bs;
      NSB.csv('profit-and-loss-' + C.p.to + '.csv', [['Trial balance as at ' + C.p.to], ['Account', 'Head', 'Debit', 'Credit']]
        .concat(C.rows.map(function (x) { return [x.name, EN_H[x.g], x.dr || '', x.cr || '']; })).concat([['Total', '', C.F.tb.dr, C.F.tb.cr], [], ['Statement of profit and loss ' + C.p.from + ' to ' + C.p.to]])
        .concat([[EN_H.rev, L.rev], [EN_H.oinc, L.oinc], ['Total income', L.income], [EN_H.mat, L.mat], [EN_H.pur, L.pur], ['Changes in inventories', L.chg], [EN_H.emp, L.emp], [EN_H.fin, L.fin], [EN_H.dep, L.dep], [EN_H.oth, L.oth],
          ['Total expenses', L.exp], ['Profit before tax', L.pbt], [EN_H.tax, L.tax], ['Profit for the period', L.profit], [], ['Balance sheet as at ' + C.p.to], ["Owner's funds", S.own], [EN_H.ltb, S.ltb], [EN_H.stb, S.stb], [EN_H.tpay, S.tpay],
          [EN_H.ocl, S.ocl], ['Total equity and liabilities', S.el], [EN_H.ppe, S.ppe], [EN_H.ninv, S.ninv], ['Inventories', S.inv], [EN_H.trec, S.trec], [EN_H.cash, S.cash], [EN_H.oca, S.oca], ['Total assets', S.assets]]));
    });
  }

  function init() {
    if (!$('#plreport')) return;
    window.addEventListener('hashchange', route);
    document.addEventListener('ns-lang', function () { show(); });
    NSStore.ready().then(route).then(function () { NSStore.persist().catch(function () {}); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
