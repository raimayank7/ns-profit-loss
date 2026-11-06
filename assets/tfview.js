/* NSTFV: draws the T format final accounts of NSTF (tfcore.js) for the App (tformat.js) and profit-loss. (plreport.js).
     html(R, 'tpl' | 'bs', o)   Trading and Profit and Loss Account (R = NSTF.tradingPL) or Balance Sheet (R = NSTF.balanceSheet)
                                as one table, Dr / Liabilities on the left and Cr / Assets on the right, totals on one row; on a
                                narrow screen the two sides stack (two tables, .tf-n). o = { en (English, for paper), name(row, en) }
     rows(R, ctx, o)            the same lines as spreadsheet rows: [Particulars, Rs, Rs, Particulars, Rs, Rs]
     dx(settings)               which expenses are direct: the user's choice (settings.tf.dx) over the defaults for the App's
                                own expense heads in the screen language
   Screen words: NS.t('tf.*'); paper words: EN below (printed documents are always English). */
(function () {
  'use strict';
  var esc = NS.esc, money = NS.money, TF = window.NSTF;
  var EN = { osk: 'To Opening stock', pur: 'To Purchases', purg: 'Purchases', pret: 'Less: Purchase returns', dirh: 'To Direct expenses', gpcd: 'To Gross profit c/d',
    sales: 'By Sales', salg: 'Sales', sret: 'Less: Sales returns', csk: 'By Closing stock', glcd: 'By Gross loss c/d', glbd: 'To Gross loss b/d', indh: 'To Indirect expenses',
    np: 'To Net profit (transferred to capital account)', gpbd: 'By Gross profit b/d', nl: 'By Net loss (transferred to capital account)',
    cap: 'Capital account', capn: 'Capital account: {n}', capu: 'Profit and loss account (not yet divided between partners)', capopen: 'Opening balance', capadd: 'Add: Capital brought in',
    capnp: 'Add: Net profit', capnl: 'Less: Net loss', capdrw: 'Less: Drawings', capint: 'Add: Interest on capital', capsal: 'Add: Salary (remuneration)',
    capsh: 'Add: Share of profit', capshl: 'Less: Share of loss', capo: 'Other capital and profit of earlier periods',
    npa: 'To Net profit (transferred to P&L appropriation account)', nla: 'By Net loss (transferred to P&L appropriation account)', loans: 'Loans (long term)', stl: 'Short-term loans and bank overdraft', cred: 'Sundry creditors',
    duty: 'Duties and taxes', ocl: 'Other current liabilities', fa: 'Fixed assets', fadepx: '{n} (cost {g} less depreciation {d})', inv: 'Investments', cskb: 'Closing stock',
    debt: 'Sundry debtors', debtpdd: 'Sundry debtors {g} less provision for doubtful debts {d}', cash: 'Cash in hand', chq: 'Cheques in hand', bank: 'Bank', adv: 'Loans and advances', gstin: 'GST input credit', tdsr: 'TDS receivable',
    to: 'To {x}', by: 'By {x}', diff: 'Difference (trial balance does not agree)', total: 'Total', part: 'Particulars', amt: 'Amount (Rs)', dr: 'Dr.', cr: 'Cr.',
    liab: 'Liabilities', assets: 'Assets', t_tpl: 'Trading and Profit and Loss Account', t_bs: 'Balance Sheet', trd: 'Trading account', pla: 'Profit and loss account' };
  var LESS = { pret: 1, sret: 1, capdrw: 1, fadep: 1, capnl: 1, capshl: 1 };
  /* groups that name their only account after a colon: "Loans (long term): HDFC Bank" */
  var NAMED = { loans: 1, stl: 1, inv: 1, adv: 1, duty: 1, ocl: 1 };

  function w(id, o, v) {
    var s = o.en ? EN[id] : NS.t('tf.' + id);
    return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s;
  }
  function nm(row, o) { return o.name ? o.name(row, !!o.en) : o.en ? row.en || row.name : row.loc || row.name; }
  function m(v) { return v == null || v === '' ? '' : money(v, false); }
  function lab(x, side, ctx, o, top) {
    if (x.t === 'row') {
      var n = nm(x.row, o);
      if (x.parts) { var g = x.parts[0], d = x.parts[1]; n = w('fadepx', o, { n: n, g: m(g.v), d: m(-d.v) }); }
      return top && ctx === 'tpl' ? w(side === 'dr' ? 'to' : 'by', o, { x: n }) : n;
    }
    if (x.t === 'capdrw' && x.row) return w('capdrw', o) + ' (' + nm(x.row, o) + ')';
    if (x.t === 'cap') { var on = x.own ? nm(x.own, o) : x.name; return on ? w('capn', o, { n: on }) : w('cap', o); }
    if (x.t === 'csk' && ctx === 'bs') return w('cskb', o);
    if (x.t === 'debt' && x.pdd) return w('debtpdd', o, { g: m(x.gross), d: m(x.pdd) });   /* WP-3 */
    if (o.firm && (x.t === 'np' || x.t === 'nl')) return w(x.t + 'a', o);   /* a firm: the net profit or loss goes to the appropriation account */
    if (NAMED[x.t] && x.row && !x.parts) return w(x.t, o) + ': ' + nm(x.row, o);
    return w(x.t, o);
  }
  function show(x) { return LESS[x.t] ? Math.abs(x.v) : x.v; }
  /* one side as rows { l (label), i (inner amount), v (outer amount), c (class) } */
  function flat(lines, side, ctx, o) {
    var out = [];
    lines.forEach(function (x) {
      if (x.parts && !(x.t === 'row')) {
        out.push({ l: lab(x, side, ctx, o, true), c: 'h' });
        x.parts.forEach(function (p, i) { out.push({ l: lab(p, side, ctx, o, false), i: show(p), v: i === x.parts.length - 1 ? x.v : null, c: 'sub' }); });
      } else out.push({ l: lab(x, side, ctx, o, true), v: x.v });
    });
    return out;
  }
  /* the two sides of a part, balanced with a difference row when they do not agree */
  function sides(R, ctx, o) {
    var parts = [];
    if (ctx === 'tpl') {
      parts.push({ h: w('trd', o), a: flat(R.tr.dr, 'dr', ctx, o), b: flat(R.tr.cr, 'cr', ctx, o), tot: R.tr.tot });
      parts.push({ h: w('pla', o), a: flat(R.pl.dr, 'dr', ctx, o), b: flat(R.pl.cr, 'cr', ctx, o), tot: R.pl.tot });
    } else {
      var a = flat(R.liab, 'dr', ctx, o), b = flat(R.assets, 'cr', ctx, o);
      if (Math.abs(R.diff) >= 0.005) (R.diff > 0 ? a : b).push({ l: w('diff', o), v: Math.abs(R.diff), c: 'bad' });
      parts.push({ a: a, b: b, tot: Math.max(R.tl, R.ta) });
    }
    return parts;
  }
  /* "Dr." / "Cr." keep their dot at the end in right-to-left screens (round C: ".Dr") */
  function heads(ctx, o) { return ctx === 'bs' ? [w('liab', o), w('assets', o)] : [w('dr', o), w('cr', o)].map(function (s) { return /^[A-Za-z]+\.$/.test(s) ? '\u2066' + s + '\u2069' : s; }); }
  function cells(r) { return r ? '<th scope="row" class="l' + (r.c === 'sub' ? ' sub' : '') + '">' + esc(r.l) + '</th><td class="n i">' + m(r.i) + '</td><td class="n">' + m(r.v) + '</td>' : '<td></td><td></td><td></td>'; }
  function html(R, ctx, o) {
    o = o || {};
    var H = heads(ctx, o), P = sides(R, ctx, o), sub = '<th class="l">' + esc(w('part', o)) + '</th><th class="n" colspan="2">' + esc(w('amt', o)) + '</th>';
    var wide = '<table class="tbl tf-t tf-w"><thead><tr><th class="l tf-side" colspan="3">' + esc(H[0]) + '</th><th class="l tf-side" colspan="3">' + esc(H[1]) + '</th></tr><tr>' + sub + sub + '</tr></thead><tbody>' +
      P.map(function (p) {
        var n = Math.max(p.a.length, p.b.length), s = p.h ? '<tr class="sec"><th colspan="6" class="l">' + esc(p.h) + '</th></tr>' : '';
        for (var i = 0; i < n; i++) s += '<tr class="' + [p.a[i] && p.a[i].c, p.b[i] && p.b[i].c].filter(Boolean).map(function (c) { return 'a-' + c; }).join(' ') + '">' + cells(p.a[i]) + cells(p.b[i]) + '</tr>';
        return s + '<tr class="tot"><th class="l">' + esc(w('total', o)) + '</th><td></td><td class="n">' + m(p.tot) + '</td><th class="l">' + esc(w('total', o)) + '</th><td></td><td class="n">' + m(p.tot) + '</td></tr>';
      }).join('') + '</tbody></table>';
    if (o.en) return wide;
    /* narrow screens: the left side, then the right side */
    var narrow = [0, 1].map(function (k) {
      return '<table class="tbl tf-t tf-n"><thead><tr><th class="l tf-side" colspan="3">' + esc(H[k]) + '</th></tr><tr>' + sub + '</tr></thead><tbody>' +
        P.map(function (p) {
          var L = k ? p.b : p.a;
          return (p.h ? '<tr class="sec"><th colspan="3" class="l">' + esc(p.h) + '</th></tr>' : '') + L.map(function (r) { return '<tr class="a-' + (r.c || 'x') + '">' + cells(r) + '</tr>'; }).join('') +
            '<tr class="tot"><th class="l">' + esc(w('total', o)) + '</th><td></td><td class="n">' + m(p.tot) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }).join('');
    return '<div class="tf-box">' + wide + narrow + '</div>';
  }
  /* spreadsheet rows (English): one row per line, both sides side by side */
  function rows(R, ctx, oo) {
    var o = { en: true, firm: !!(oo && oo.firm) }, H = heads(ctx, o), out = [[H[0], '', '', H[1], '', ''], [EN.part, 'Rs', 'Rs', EN.part, 'Rs', 'Rs']];
    function c(r) { return r ? [(r.c === 'sub' ? '    ' : '') + r.l, r.i == null ? '' : r.i, r.v == null ? '' : r.v] : ['', '', '']; }
    sides(R, ctx, o).forEach(function (p) {
      if (p.h) out.push([p.h, '', '', '', '', '']);
      for (var i = 0; i < Math.max(p.a.length, p.b.length); i++) out.push(c(p.a[i]).concat(c(p.b[i])));
      out.push(['Total', '', p.tot, 'Total', '', p.tot]);
    });
    return out;
  }
  /* direct or indirect: defaults for the App's own heads (as typed in the screen language and in English) under the user's choice */
  var CODE_EN = { transport: 'Transport and freight', fuel: 'Fuel', rent: 'Rent', power: 'Electricity', salary: 'Salary and wages', phone: 'Phone and internet', repair: 'Repairs and maintenance',
    office: 'Office expenses', bank: 'Bank charges', prof: 'Professional fees', ads: 'Advertising', misc: 'Miscellaneous' };
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  /* a manufacturer's power, fuel, wages and carriage are factory costs: direct by default, the same rule the AS 2 full cost and
     the manufacturing account use, so every screen shows one gross profit (round C) */
  var MAKER = { power: 1, salary: 1, fuel: 1, transport: 1 };
  function dx(settings, maker) {
    var o = {};
    Object.keys(CODE_EN).forEach(function (c) {
      var d = maker && MAKER[c] ? true : TF.defaultDirect('exp:' + c, CODE_EN[c]);
      o['exp:' + c] = d; o['exp:' + key(CODE_EN[c])] = d; o['exp:' + key(NS.t('app.ex_' + c))] = d;
    });
    return Object.assign(o, settings && settings.tf && settings.tf.dx || {});
  }
  window.NSTFV = { EN: EN, html: html, rows: rows, dx: dx, CODE_EN: CODE_EN };
})();
