/* Audit and accounts kit (audit.niveshsahayak.in): pure calculations, no screen. Used by audit.js and node scripts/test_audit_kit.js.
   - Companies Act 2013 Schedule II depreciation: straight line or written down value over the useful life, by days used in the year,
     never below the residual value (Schedule II Part A: residual value normally not more than 5% of cost).
   - Income-tax depreciation by block of assets (Income-tax Act 2025, old section 32): rate on the written down value of the block;
     half the rate on additions put to use for less than 180 days in the year. Rates are typed by the user (Appendix of the Income-tax Rules).
   - Deferred tax on the difference between book and tax written down values (AS 22).
   - Cash flow statement, indirect method (AS 3), and the Schedule III ratios with the change over the previous year. */
(function (root) {
  'use strict';
  function n(v) { var x = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : 0; }
  function r2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
  function d(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
  var DAY = 864e5;
  function fyOf(t) { var x = new Date(t), y = x.getUTCFullYear(); return x.getUTCMonth() >= 3 ? y : y - 1; }
  function fyStart(y) { return Date.UTC(y, 3, 1); }
  function fyEnd(y) { return Date.UTC(y + 1, 2, 31); }
  function days(a, b) { return Math.max(0, Math.round((b - a) / DAY) + 1); }

  /* Schedule II, Part C: the common classes (years of useful life). The full schedule has more; "other" lets the user type the life. */
  var CLASSES = [
    ['bfac', 'Factory buildings', 30], ['brcc', 'Buildings other than factory, RCC frame structure', 60], ['bother', 'Buildings other than factory, not RCC frame', 30],
    ['fence', 'Fences, wells, tube wells', 5], ['temp', 'Temporary structures', 3], ['pm', 'Plant and machinery (general, not continuous process)', 15],
    ['pmcp', 'Continuous process plant', 25], ['furn', 'Furniture and fittings (general)', 10], ['furnh', 'Furniture and fittings used in hotels, restaurants, schools, cinemas', 8],
    ['office', 'Office equipment', 5], ['comp', 'Computers: end-user devices (desktops, laptops)', 3], ['server', 'Computers: servers and networks', 6],
    ['elec', 'Electrical installations and equipment', 10], ['lab', 'Laboratory equipment (general)', 10], ['bike', 'Motor cycles, scooters, mopeds', 10],
    ['car', 'Motor cars (not used in a hire business), other vehicles', 8], ['hire', 'Motor buses, lorries, cars and taxis used in a business of running them on hire', 6],
    ['other', 'Other (type the useful life)', 0]
  ];
  var LIFE = {}; CLASSES.forEach(function (c) { LIFE[c[0]] = c[2]; });
  /* Income-tax Rules 2026, Appendix I (see rule 25), 'Table of rates at which depreciation is admissible', as published on
     incometaxindia.gov.in (page uploaded 5 May 2026, read 27 Nov 2026). The common blocks; the user may still type another rate. */
  var BLOCKS = [
    ['res', 'Buildings mainly residential (not hotels or boarding houses)', 5], ['bld', 'Other buildings (including roads, bridges, wells, tube wells)', 10],
    ['temp', 'Purely temporary erections such as wooden structures', 40], ['furn', 'Furniture and fittings, including electrical fittings', 10],
    ['pm', 'Machinery and plant (general)', 15], ['car', 'Motor cars, not used in a business of running them on hire', 15],
    ['hire', 'Motor buses, lorries and taxis used in a business of running them on hire', 30], ['comp', 'Computers including computer software', 40],
    ['mould', 'Moulds used in rubber and plastic goods factories', 30], ['green', 'Devices listed at 40% (energy saving, renewable energy, pollution control, life saving medical)', 40],
    ['ship', 'Ships and vessels', 20], ['intang', 'Know-how, patents, copyrights, trademarks, licences, franchises', 25]
  ];
  var BRATE = {}; BLOCKS.forEach(function (b) { BRATE[b[0]] = b[2]; });
  var CLASS_BLOCK = { bfac: 'bld', brcc: 'bld', bother: 'bld', fence: 'bld', temp: 'temp', pm: 'pm', pmcp: 'pm', furn: 'furn', furnh: 'furn', office: 'pm', comp: 'comp', server: 'comp', elec: 'furn', lab: 'pm', bike: 'pm', car: 'car', hire: 'hire', other: 'pm' };

  /* one asset: {name, cls, life?, cost, date (put to use), res (residual %, default 5), method 'slm'|'wdv', saleDate, saleAmt, openWdv? (book WDV at the start of the year, for registers brought in)} */
  function bookDep(a, fy) {
    var cost = n(a.cost), life = n(a.life) || LIFE[a.cls] || 0, resPc = a.res === '' || a.res == null ? 5 : n(a.res), res = cost * resPc / 100;
    var put = d(a.date), sold = d(a.saleDate), S = fyStart(fy), E = fyEnd(fy);
    var out = { cost: cost, life: life, res: res, open: 0, add: 0, dep: 0, close: 0, sold: false, saleAmt: 0, gain: 0, rate: 0 };
    if (!cost || !life || put == null || put > E || (sold != null && sold < S)) { if (put != null && put <= E && sold != null && sold < S) out.gone = true; return out; }
    var wdvRate = 1 - Math.pow(res > 0 ? res / cost : 0.05, 1 / life);
    out.rate = a.method === 'wdv' ? wdvRate * 100 : (100 - resPc) / life;
    var y0 = fyOf(put), wdv = cost, used = 0;
    var typed = a.openWdv !== '' && a.openWdv != null && y0 < fy;
    if (typed) { wdv = n(a.openWdv); used = Math.max(0, (S - put) / (365.25 * DAY)); y0 = fy; }
    for (var y = y0; y <= fy; y++) {
      var from = Math.max(put, fyStart(y)), to = y === fy && sold != null && sold <= E ? sold : fyEnd(y);
      var part = days(from, to) / days(fyStart(y), fyEnd(y)), dep;
      if (y === fy) out.open = y === fyOf(put) && !typed ? 0 : wdv;
      if (a.method === 'wdv') dep = wdv * wdvRate * part;
      else dep = typed ? (wdv - res) / Math.max(0.5, life - used) * part : (cost - res) / life * part;
      dep = Math.max(0, Math.min(dep, wdv - res));
      if (y === fy) { out.add = y === fyOf(put) && !typed ? cost : 0; out.dep = dep; }
      wdv -= dep;
    }
    if (sold != null && sold <= E) { out.sold = true; out.saleAmt = n(a.saleAmt); out.gain = out.saleAmt - wdv; out.close = 0; out.wdvAtSale = wdv; }
    else out.close = wdv;
    return out;
  }

  /* tax depreciation, one block: {rate, open (WDV at the start), adds [{amt, date}], sales (money received for assets of the block sold)} */
  function taxBlock(b, fy) {
    var rate = n(b.rate) / 100, open = n(b.open), full = 0, half = 0, E = fyEnd(fy), S = fyStart(fy);
    (b.adds || []).forEach(function (x) { var t = d(x.date); if (t == null || t < S || t > E) return; if (days(t, E) >= 180) full += n(x.amt); else half += n(x.amt); });
    var sales = n(b.sales), base = open + full + half - sales, stcg = 0;
    if (base < 0) { stcg = -base; base = 0; }
    var fullBase = Math.max(0, base - half), halfBase = Math.min(half, base);
    var dep = fullBase * rate + halfBase * rate / 2;
    return { open: open, full: full, half: half, sales: sales, base: base, dep: dep, close: base - dep, stcg: stcg };
  }
  /* blocks from the assets: rate typed on each asset (tax rate %), additions = assets put to use in the year, sales = their sale money */
  function blocksFrom(assets, openings, fy) {
    var B = {}, S = fyStart(fy), E = fyEnd(fy);
    assets.forEach(function (a) {
      var r = String(n(a.taxRate)); if (!n(a.taxRate)) return;
      var b = B[r] = B[r] || { rate: r, open: n((openings || {})[r]), adds: [], sales: 0 };
      var t = d(a.date), s = d(a.saleDate);
      if (t != null && t >= S && t <= E) b.adds.push({ amt: n(a.cost), date: a.date });
      if (s != null && s >= S && s <= E) b.sales += n(a.saleAmt);
    });
    Object.keys(openings || {}).forEach(function (r) { if (!B[r] && n(openings[r])) B[r] = { rate: r, open: n(openings[r]), adds: [], sales: 0 }; });
    return Object.keys(B).sort(function (a, b) { return +a - +b; }).map(function (r) { var x = taxBlock(B[r], fy); x.rate = +r; return x; });
  }
  function register(assets, openings, fy, taxPc) {
    var rows = assets.map(function (a) { var x = bookDep(a, fy); x.a = a; return x; }).filter(function (x) { return !x.gone && (x.cost || x.a.name); });
    var T = { open: 0, add: 0, dep: 0, close: 0, saleAmt: 0, gain: 0 };
    rows.forEach(function (x) { T.open += x.open; T.add += x.add; T.dep += x.dep; T.close += x.close; if (x.sold) { T.saleAmt += x.saleAmt; T.gain += x.gain; } });
    var blocks = blocksFrom(assets, openings, fy), TB = { dep: 0, close: 0 };
    blocks.forEach(function (b) { TB.dep += b.dep; TB.close += b.close; });
    var diff = T.close - TB.close, rate = n(taxPc) / 100;
    return { rows: rows, T: T, blocks: blocks, TB: TB, diff: diff, deferred: diff * rate, kind: diff >= 0 ? 'dtl' : 'dta' };
  }

  /* cash flow statement, indirect method. c = {pbt, dep, intExp, intInc, divInc, gainFA (profit on sale of fixed assets), inv0, inv1, rec0, rec1, oca0, oca1,
     pay0, pay1, ocl0, ocl1, taxPaid, faBought, faSold, invBought, invSold, borrowIn, borrowOut, capitalIn, intPaid, divPaid, cash0, cash1} */
  var CFK = ['pbt', 'dep', 'intExp', 'intInc', 'divInc', 'gainFA', 'inv0', 'inv1', 'rec0', 'rec1', 'oca0', 'oca1', 'pay0', 'pay1', 'ocl0', 'ocl1', 'taxPaid', 'faBought', 'faSold', 'invBought', 'invSold', 'borrowIn', 'borrowOut', 'capitalIn', 'intPaid', 'divPaid', 'cash0', 'cash1'];
  function cashflow(c) {
    var v = {}; CFK.forEach(function (k) { v[k] = n((c || {})[k]); });
    var opBefore = v.pbt + v.dep + v.intExp - v.intInc - v.divInc - v.gainFA;
    var wc = -(v.inv1 - v.inv0) - (v.rec1 - v.rec0) - (v.oca1 - v.oca0) + (v.pay1 - v.pay0) + (v.ocl1 - v.ocl0);
    var A = opBefore + wc - v.taxPaid;
    var B = -v.faBought + v.faSold - v.invBought + v.invSold + v.intInc + v.divInc;
    var C = v.borrowIn - v.borrowOut + v.capitalIn - v.intPaid - v.divPaid;
    var net = A + B + C;
    return { opBefore: opBefore, wc: wc, A: A, B: B, C: C, net: net, expect: v.cash1 - v.cash0, gap: r2(net - (v.cash1 - v.cash0)) };
  }

  /* Schedule III (Division I) ratios, this year and last. y = {rev, cogs, purchases, pat, ebit, int, prin (loan principal repaid), dep, equity, debt, ca, cl, inv, rec, pay, invest, invIncome}.
     Averages use the opening (last year's) and closing figures when both are given. Change over 25% must be explained in the notes. */
  var RATIOS = [
    ['cr', 'Current ratio', 'Current assets / current liabilities'], ['de', 'Debt-equity ratio', 'Total debt / shareholders\' equity'],
    ['dscr', 'Debt service coverage ratio', 'Earnings available for debt service / (interest + principal repaid)'], ['roe', 'Return on equity (%)', 'Profit after tax / average equity'],
    ['itr', 'Inventory turnover (times)', 'Cost of goods sold / average inventory'], ['rtr', 'Trade receivables turnover (times)', 'Revenue / average trade receivables'],
    ['ptr', 'Trade payables turnover (times)', 'Purchases / average trade payables'], ['nct', 'Net capital turnover (times)', 'Revenue / working capital'],
    ['npr', 'Net profit ratio (%)', 'Profit after tax / revenue'], ['roce', 'Return on capital employed (%)', 'Earnings before interest and tax / capital employed'],
    ['roi', 'Return on investment (%)', 'Income from investments / average investments']
  ];
  function div(a, b) { return b ? a / b : null; }
  function avg(a, b, has) { return has ? (a + b) / 2 : b; }
  var RK = ['rev', 'cogs', 'purchases', 'pat', 'ebit', 'int', 'prin', 'dep', 'equity', 'debt', 'ca', 'cl', 'inv', 'rec', 'pay', 'invest', 'invIncome'];
  function ratios(cy, py) {
    var c = {}, p = {}, has = !!py;
    RK.forEach(function (k) { c[k] = n((cy || {})[k]); p[k] = n((py || {})[k]); });
    function one(x, o, hasO) {
      o = o || {}; var A = function (k) { return avg(n(o[k]), x[k] || 0, hasO); };
      return {
        cr: div(x.ca, x.cl), de: div(x.debt, x.equity), dscr: div(x.pat + x.dep + x.int, x.int + x.prin), roe: div(x.pat * 100, A('equity')),
        itr: div(x.cogs, A('inv')), rtr: div(x.rev, A('rec')), ptr: div(x.purchases, A('pay')), nct: div(x.rev, x.ca - x.cl),
        npr: div(x.pat * 100, x.rev), roce: div(x.ebit * 100, x.equity + x.debt), roi: div(x.invIncome * 100, A('invest'))
      };
    }
    var R = one(c, p, has), P = has ? one(p, null, false) : {};
    return RATIOS.map(function (r) { var a = R[r[0]], b = P[r[0]], ch = a != null && b != null && b !== 0 ? (a - b) * 100 / Math.abs(b) : null; return { k: r[0], name: r[1], formula: r[2], cy: a, py: b, ch: ch, explain: ch != null && Math.abs(ch) > 25 }; });
  }

  /* CARO 2020 (MCA order of 25 Feb 2020, applies from FY 2021-22): who it does not apply to. f = {type: 'public'|'private'|'opc'|'sec8'|'bank'|'insurance'|'small',
     holdSub (holding or subsidiary of a public company), capRes (paid-up capital + reserves at the balance sheet date), borrow (highest bank/FI borrowing in the year), rev (revenue)} in rupees */
  function caroApplies(f) {
    var t = f.type;
    if (t === 'bank' || t === 'insurance' || t === 'sec8' || t === 'opc' || t === 'small') return { applies: false, why: t };
    if (t === 'private' && !f.holdSub && n(f.capRes) <= 1e7 && n(f.borrow) <= 1e7 && n(f.rev) <= 1e8) return { applies: false, why: 'pvt' };
    return { applies: true, why: t === 'private' ? 'pvtover' : 'public' };
  }
  /* small company (Companies Act s.2(85) with Rule 2(1)(t), limits from 1 Dec 2025, G.S.R. 880(E)): paid-up capital up to Rs 10 crore and turnover up to Rs 100 crore;
     not a public company, holding or subsidiary company, section 8 company or company under a special Act */
  function isSmall(f) { return f.type === 'private' && !f.holdSub && !f.sec8 && n(f.paidUp) <= 1e8 && n(f.turnover) <= 1e9; }

  var API = { BLOCKS: BLOCKS, BRATE: BRATE, CLASS_BLOCK: CLASS_BLOCK, CFK: CFK, RK: RK, n: n, r2: r2, CLASSES: CLASSES, LIFE: LIFE, bookDep: bookDep, taxBlock: taxBlock, blocksFrom: blocksFrom, register: register, cashflow: cashflow, RATIOS: RATIOS, ratios: ratios, caroApplies: caroApplies, isSmall: isSmall, fyStart: fyStart, fyEnd: fyEnd };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.NSAudit = API;
})(this);
