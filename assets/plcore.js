/* NSPL: trial balance, profit and loss and balance sheet underneath profit-loss.niveshsahayak.in.
   Pure functions, nothing stored for the books themselves. The trial balance comes from the saved records (NSBooks: every
   document turned into double-entry lines), the stock register (NSStock: opening and closing stock value) and lines the
   user types (fixed assets, depreciation, capital, loans, drawings, other income, tax...). Every line carries a head of the
   Schedule III format (Companies Act, 2013, Division I; ICAI uses the same heads for proprietors and firms), and the two
   statements are added up from the heads, so typed lines and saved records always land in the same place.
   Trial balance line: { k, name, g (head), dr, cr, src: 'books' | 'stock' | 'typed', n (parties in a total) }.
   Books part: profit and loss accounts (sales, purchases, expenses, round off) are the movement inside the period;
   balance sheet accounts are the balance on the last day. Profit of earlier periods, opening stock and stock brought in
   with an opening stock record are added so the trial balance always agrees:
     earlier = P&L accounts before the period − opening stock + value of all opening stock records up to the last day. */
(function (G) {
  'use strict';
  var B = G.NSBooks || (typeof NSBooks !== 'undefined' ? NSBooks : null), S = G.NSStock || (typeof NSStock !== 'undefined' ? NSStock : null);
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function prevDay(iso) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }

  /* heads in the order they print; side 'bs' (balance sheet) or 'pl' (profit and loss) */
  var ORDER = ['cap', 'drw', 'res', 'ltb', 'stb', 'tpay', 'ocl', 'ppe', 'ninv', 'trec', 'cash', 'oca', 'rev', 'oinc', 'osk', 'mat', 'pur', 'emp', 'fin', 'dep', 'oth', 'tax'];
  var SIDE = {}; ORDER.forEach(function (g, i) { SIDE[g] = i < 12 ? 'bs' : 'pl'; });

  /* head of an expense by its name; map = { name key: head } from the page (names in the screen language) */
  function headOf(name, map) {
    var k = key(name);
    if (map && map[k]) return map[k];
    if (/advance|deposit|loan to/.test(k)) return 'oca';
    if (/salar|wage|staff|bonus|provident|\bpf\b|\besi\b|gratuity|employee/.test(k)) return 'emp';
    if (/\bemi\b|loan repay/.test(k)) return 'ltb';   /* an EMI mostly pays back the loan; its interest part is a finance cost */
    if (/interest|loan processing/.test(k)) return 'fin';
    if (/depreciat|amorti/.test(k)) return 'dep';
    if (/^purchase/.test(k)) return 'pur';
    if (/income tax/.test(k)) return 'drw';   /* a proprietor's own income tax is drawings, not a business expense */
    return 'oth';
  }
  function isPL(a) { return a === 'sales' || a === 'sales-return' || a === 'purchases' || a === 'purchase-return' || a === 'round-off' || a.indexOf('exp:') === 0 || a.indexOf('inc:') === 0; }
  /* accounts of journal entries and the fixed assets register (Batch 2): prefix -> head */
  var PREFIX = { 'fa:': 'ppe', 'loan:': 'ltb', 'od:': 'stb', 'given:': 'oca', 'cap:': 'cap', 'drw:': 'drw' };
  function cap1(s) { return String(s).replace(/^./, function (c) { return c.toUpperCase(); }); }
  function line(k, name, g, v, src) { v = r2(v); return { k: k, name: name, g: g, dr: v > 0 ? v : 0, cr: v < 0 ? -v : 0, src: src || 'books' }; }
  function bizOk(d, b) { return !b || key(d.seller && d.seller.name) === b; }

  /* value of opening stock records (stk open) dated from..to */
  function openStock(docs, biz, from, to) {
    var b = key(biz), v = 0;
    (docs || []).forEach(function (d) {
      if (d.type !== 'stk' || d.kind !== 'open' || !bizOk(d, b) || from && d.date < from || to && d.date > to) return;
      (d.lines || []).forEach(function (l) { v += num(l.qty) * num(l.rate); });
    });
    return r2(v);
  }

  var NAMES = { sales: ['Sales', 'rev'], 'sales-return': ['Sales returns', 'rev'], purchases: ['Purchases', 'pur'], 'purchase-return': ['Purchase returns', 'pur'],
    cash: ['Cash in hand', 'cash'], bank: ['Bank', 'cash'], 'chq-in': ['Cheques in hand', 'cash'], 'chq-out': ['Cheques issued, not yet cleared', 'ocl'],
    'tds-receivable': ['TDS receivable', 'oca'], 'tds-payable': ['TDS payable', 'ocl'], opening: ['Opening balances of parties', 'cap'] };

  /* trial balance from the saved records. opt: { os, cs } typed opening / closing stock (else from the stock register), map (expense heads) */
  function fromBooks(docs, items, biz, from, to, opt) {
    opt = opt || {};
    var before = from ? B.accounts(docs, biz, prevDay(from)) : {}, upto = B.accounts(docs, biz, to), b = key(biz);
    var heads = {}; (docs || []).forEach(function (d) {
      if (!bizOk(d, b)) return;
      if (d.cat) heads[key(d.cat)] = heads[key(d.cat)] || String(d.cat).trim();
      (d.lines || []).forEach(function (l) { if (l && l.head) heads[key(l.head)] = heads[key(l.head)] || String(l.head).trim(); });
    });
    var rows = [], plBefore = 0, rec = 0, pay = 0, nr = 0, np = 0, gst = 0, seen = {};
    Object.keys(upto).concat(Object.keys(before)).forEach(function (a) {
      if (seen[a]) return; seen[a] = 1;
      var u = upto[a] || 0, b0 = before[a] || 0;
      if (isPL(a)) {
        plBefore += b0;
        var v = r2(u - b0); if (!v) return;
        if (a === 'round-off') rows.push(line(a, 'Round off', v > 0 ? 'oth' : 'oinc', v));
        else if (a.indexOf('inc:') === 0) rows.push(line(a, cap1(a.slice(4)), 'oinc', v));
        else if (a.indexOf('exp:') === 0) { var nm = heads[a.slice(4)] || a.slice(4).replace(/^./, function (c) { return c.toUpperCase(); }); rows.push(line(a, nm, headOf(nm, opt.map), v)); }
        else rows.push(line(a, NAMES[a][0], NAMES[a][1], v));
        return;
      }
      if (!u) return;
      if (a.indexOf('p:') === 0) { if (u > 0) { rec += u; nr++; } else { pay -= u; np++; } return; }
      if (/^gst-/.test(a)) { gst += u; return; }
      var px = Object.keys(PREFIX).filter(function (x) { return a.indexOf(x) === 0; })[0];
      if (px) { rows.push(line(a, cap1(a.slice(px.length)), PREFIX[px], u)); return; }
      if (NAMES[a]) rows.push(line(a, NAMES[a][0], NAMES[a][1], u));
      else rows.push(line(a, a, u > 0 ? 'oca' : 'ocl', u));
    });
    if (r2(rec)) { var x = line('trec', 'Trade receivables (customers who owe you)', 'trec', rec); x.n = nr; rows.push(x); }
    if (r2(pay)) { var y = line('tpay', 'Trade payables (suppliers you owe)', 'tpay', -pay); y.n = np; rows.push(y); }
    if (r2(gst)) rows.push(line('gst', gst > 0 ? 'GST input credit (net)' : 'GST payable (net)', gst > 0 ? 'oca' : 'ocl', gst));
    var openAll = openStock(docs, biz, '', to), openIn = openStock(docs, biz, from, to);
    var os = opt.os != null ? r2(num(opt.os)) : r2((from && S ? S.summary(docs, items, biz, '', prevDay(from)).value : 0) + openIn);
    var cs = opt.cs != null ? r2(num(opt.cs)) : S ? S.summary(docs, items, biz, '', to).value : 0;
    if (os) rows.push(line('osk', 'Opening stock', 'osk', os, 'stock'));
    if (openAll) rows.push(line('cap-stock', 'Stock brought in (opening stock records)', 'cap', -openAll, 'stock'));
    var earlier = r2(plBefore - os + openAll);
    if (earlier) rows.push(line('res-earlier', earlier < 0 ? 'Profit of earlier periods' : 'Loss of earlier periods', 'res', earlier));
    rows.sort(function (p, q) { return ORDER.indexOf(p.g) - ORDER.indexOf(q.g) || p.name.localeCompare(q.name); });
    return { rows: rows, os: os, cs: cs };
  }

  function totals(rows) {
    var dr = 0, cr = 0; rows.forEach(function (r) { dr += num(r.dr); cr += num(r.cr); });
    return { dr: r2(dr), cr: r2(cr), diff: r2(dr - cr) };
  }

  /* the two statements from trial balance lines and the closing stock */
  function statements(rows, cs) {
    var s = {}; cs = r2(num(cs));
    rows.forEach(function (r) { s[r.g] = r2((s[r.g] || 0) + num(r.dr) - num(r.cr)); });
    function g(k) { return s[k] || 0; }
    var pl = { rev: -g('rev'), oinc: -g('oinc') };
    pl.income = r2(pl.rev + pl.oinc);
    pl.mat = g('mat'); pl.pur = g('pur'); pl.chg = r2(g('osk') - cs); pl.emp = g('emp'); pl.fin = g('fin'); pl.dep = g('dep'); pl.oth = g('oth');
    pl.exp = r2(pl.mat + pl.pur + pl.chg + pl.emp + pl.fin + pl.dep + pl.oth);
    pl.pbt = r2(pl.income - pl.exp); pl.tax = g('tax'); pl.profit = r2(pl.pbt - pl.tax);
    pl.gross = r2(pl.rev - pl.mat - pl.pur - pl.chg);   /* gross profit: sales less cost of goods sold */
    var bs = { cap: -g('cap'), drw: g('drw'), res: r2(-g('res') + pl.profit), ltb: -g('ltb'), stb: -g('stb'), tpay: -g('tpay'), ocl: -g('ocl'),
      ppe: g('ppe'), ninv: g('ninv'), inv: cs, trec: g('trec'), cash: g('cash'), oca: g('oca') };
    bs.own = r2(bs.cap - bs.drw + bs.res); bs.ncl = bs.ltb; bs.cl = r2(bs.stb + bs.tpay + bs.ocl); bs.el = r2(bs.own + bs.ncl + bs.cl);
    bs.nca = r2(bs.ppe + bs.ninv); bs.ca = r2(bs.inv + bs.trec + bs.cash + bs.oca); bs.assets = r2(bs.nca + bs.ca);
    bs.diff = r2(bs.assets - bs.el);
    return { pl: pl, bs: bs, tb: totals(rows) };
  }

  var API = { ORDER: ORDER, SIDE: SIDE, headOf: headOf, fromBooks: fromBooks, totals: totals, statements: statements, openStock: openStock, prevDay: prevDay, num: num, r2: r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSPL = API;
})(typeof window !== 'undefined' ? window : this);
