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
    var H = G.NSHeads || (typeof NSHeads !== 'undefined' ? NSHeads : null), hh = H && H.find(name);   /* the income and expense heads list (heads.js) */
    if (hh && !H.isIncome(hh)) return hh.s3;
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
  var PREFIX = { 'fa:': 'ppe', 'loan:': 'ltb', 'od:': 'stb', 'given:': 'oca', 'cap:': 'cap', 'drw:': 'drw', 'ocl:': 'ocl', 'oca:': 'oca', 'sadv:': 'oca' };
  /* name of a prefixed account: an advance to staff names the employee (WP-5), the rest the name as typed */
  function pxName(a, px) { var n = a.slice(px.length); return px === 'sadv:' ? (n === 'staff' ? 'Advance to staff' : 'Advance to ' + cap1(n)) : cap1(n); }
  /* GST ledgers, one trial balance line each like Tally (user test 2026-11-06); on the balance sheet they stay one net figure:
     every GST line takes the head of their net balance (input credit 'oca' or payable 'ocl') */
  var GSTN = { 'gst-in-cgst': 'Input CGST', 'gst-in-sgst': 'Input SGST', 'gst-in-utgst': 'Input UTGST', 'gst-in-igst': 'Input IGST', 'gst-out-cgst': 'Output CGST', 'gst-out-sgst': 'Output SGST',
    'gst-out-utgst': 'Output UTGST', 'gst-out-igst': 'Output IGST', 'gst-rcm-payable': 'GST payable on reverse charge', 'gst-adv': 'GST paid on advances' };
  function gstName(a) { return GSTN[a] || 'GST: ' + a.slice(4); }
  /* balance sheets show GST as one net line (input credit or payable); the trial balance keeps the ledgers */
  function gstNet(rows) {
    var v = 0, at = -1, out = [];
    (rows || []).forEach(function (r) { if (/^gst-/.test(r.k)) { v += num(r.dr) - num(r.cr); if (at < 0) at = out.length; } else out.push(r); });
    if (at >= 0 && r2(v)) out.splice(at, 0, line('gst', v > 0 ? 'GST input credit (net)' : 'GST payable (net)', v > 0 ? 'oca' : 'ocl', v));
    return out;
  }
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
    'tds-receivable': ['TDS receivable', 'oca'], 'tds-payable': ['TDS payable', 'ocl'], 'tcs-receivable': ['TCS receivable', 'oca'], 'tcs-payable': ['TCS payable', 'ocl'],
    pdd: ['Less: provision for doubtful debts', 'trec'],
    'sal-payable': ['Salary payable', 'ocl'], 'pf-payable': ['PF payable', 'ocl'], 'esi-payable': ['ESI payable', 'ocl'], 'pt-payable': ['Professional tax payable', 'ocl'],   /* WP-5 */   /* WP-3: shown as less from trade receivables */
    'gstcash-igst': ['GST electronic cash ledger: IGST', 'oca'], 'gstcash-cgst': ['GST electronic cash ledger: CGST', 'oca'], 'gstcash-sgst': ['GST electronic cash ledger: SGST/UTGST', 'oca'], 'gstcash-cess': ['GST electronic cash ledger: cess', 'oca'], opening: ['Opening balances (difference carried to capital)', 'cap'] };   /* opening cash, bank and party balances typed in (user test 2026-11-06: not only parties) */

  /* trial balance from the saved records. opt: { os, cs } typed opening / closing stock (else from the stock register), map (expense heads) */
  function fromBooks(docs, items, biz, from, to, opt) {
    opt = opt || {};
    var before = from ? B.accounts(docs, biz, prevDay(from)) : {}, upto = B.accounts(docs, biz, to), b = key(biz);
    var heads = {}; (docs || []).forEach(function (d) {
      if (!bizOk(d, b)) return;
      if (d.cat) heads[key(d.cat)] = heads[key(d.cat)] || String(d.cat).trim();
      (d.lines || []).forEach(function (l) { if (l && l.head) heads[key(l.head)] = heads[key(l.head)] || String(l.head).trim(); });
    });
    var rows = [], plBefore = 0, rec = 0, pay = 0, nr = 0, np = 0, gst = 0, gstL = [], seen = {};
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
      if (/^gst-/.test(a)) { gst += u; gstL.push([a, u]); return; }
      var px = Object.keys(PREFIX).filter(function (x) { return a.indexOf(x) === 0; })[0];
      if (px) { rows.push(line(a, pxName(a, px), PREFIX[px], u)); return; }
      /* a bank account in credit is an overdraft: a short-term borrowing (Schedule III), not a negative asset (round C) */
      if (a === 'bank' && u < 0) rows.push(line(a, 'Bank overdraft', 'stb', u));
      else if (NAMES[a]) rows.push(line(a, NAMES[a][0], NAMES[a][1], u));
      else rows.push(line(a, a, u > 0 ? 'oca' : 'ocl', u));
    });
    if (r2(rec)) { var x = line('trec', 'Trade receivables (customers who owe you)', 'trec', rec); x.n = nr; rows.push(x); }
    if (r2(pay)) { var y = line('tpay', 'Trade payables (suppliers you owe)', 'tpay', -pay); y.n = np; rows.push(y); }
    gstL.forEach(function (p) { if (r2(p[1])) rows.push(line(p[0], gstName(p[0]), gst > 0 ? 'oca' : 'ocl', p[1])); });
    var openAll = openStock(docs, biz, '', to), openIn = openStock(docs, biz, from, to);
    var os = opt.os != null ? r2(num(opt.os)) : r2((from && S ? S.summary(docs, items, biz, '', prevDay(from)).value : 0) + openIn);
    var cs = opt.cs != null ? r2(num(opt.cs)) : S ? S.summary(docs, items, biz, '', to).value : 0;
    /* work in progress (manufacturing, typed in the App: facore.js / famore.js): opening WIP joins the opening stock (it was profit
       of earlier periods), closing WIP joins the closing stock (inventories) */
    var wo = r2(num(opt.wipOpen)), wc = r2(num(opt.wipClose));
    if (wo || wc) { os = r2(os + wo); cs = r2(cs + wc); }
    /* finished goods at full cost (AS 2, facore.js fullCost): factory overheads on made goods in stock, given by the page */
    var ao = opt.os != null ? 0 : r2(num(opt.as2Open)), ac = opt.cs != null ? 0 : r2(num(opt.as2Close));
    if (ao || ac) { os = r2(os + ao); cs = r2(cs + ac); }
    if (os) rows.push(line('osk', wo ? 'Opening stock (with work in progress)' : 'Opening stock', 'osk', os, 'stock'));
    if (openAll) rows.push(line('cap-stock', 'Stock brought in (opening stock records)', 'cap', -openAll, 'stock'));
    var earlier = r2(plBefore - os + openAll);
    if (earlier) rows.push(line('res-earlier', earlier < 0 ? 'Profit of earlier periods' : 'Loss of earlier periods', 'res', earlier));
    rows.sort(function (p, q) { return ORDER.indexOf(p.g) - ORDER.indexOf(q.g) || p.name.localeCompare(q.name); });
    return { rows: rows, os: os, cs: cs, wipOpen: wo, wipClose: wc, as2Open: ao, as2Close: ac };
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

  /* journal lines of the App's capital and loan forms (finrep.js): kind capin | drw | loanin | loanout | givenin | givenout,
     o = { name, amt, int (interest, loanout / givenin), mode (money account 'cash' | 'bank'), lk (account of the loan for loanout /
     givenin), lt ('loan' long term | 'od' short term, loanin) }. Interest paid goes to the finance cost 'Interest on loan',
     interest received to other income 'Interest received'. Lines with nothing on either side are left out. */
  function capLoanLines(kind, o) {
    var amt = r2(num(o.amt)), int = r2(num(o.int)), name = String(o.name || '').trim(), M = o.mode === 'bank' ? 'bank' : 'cash', lines;
    function m(dr, cr) { return { t: M, a: M, dr: r2(dr), cr: r2(cr) }; }
    if (kind === 'capin') lines = [m(amt, 0), { t: 'cap', nm: name || 'Capital', a: 'cap:' + key(name || 'Capital'), dr: 0, cr: amt }];
    else if (kind === 'drw') lines = [{ t: 'drw', nm: name || 'Drawings', a: 'drw:' + key(name || 'Drawings'), dr: amt, cr: 0 }, m(0, amt)];
    else if (kind === 'loanin') lines = [m(amt, 0), { t: 'loan', nm: name, a: (o.lt === 'od' ? 'od:' : 'loan:') + key(name), dr: 0, cr: amt }];
    else if (kind === 'givenout') lines = [{ t: 'given', nm: name, a: 'given:' + key(name), dr: amt, cr: 0 }, m(0, amt)];
    else if (kind === 'loanout') lines = [{ t: 'loan', nm: name, a: o.lk, dr: amt, cr: 0 }, { t: 'exp', nm: 'Interest on loan', a: 'exp:interest on loan', dr: int, cr: 0 }, m(0, amt + int)];
    else if (kind === 'givenin') lines = [m(amt + int, 0), { t: 'given', nm: name, a: o.lk, dr: 0, cr: amt }, { t: 'inc', nm: 'Interest received', a: 'inc:interest received', dr: 0, cr: int }];
    else return [];
    return lines.filter(function (l) { return l.dr || l.cr; });
  }

  /* ---------- Trial balance styles (finrep.js) ----------
     tbDetail: the trial balance with opening balance (day before the period), the period's debits and credits and the closing
     balance of every account, like Tally's detailed trial balance. Each line: { k, name, g, od, oc (opening), td, tc
     (transactions), dr, cr (closing, the same figures fromBooks gives) } and opening + td − tc = closing on every line.
     Profit and loss accounts open at nil (earlier years sit in 'res-earlier'); stock brought in during the period with an
     opening stock record is a transaction of opening stock (debit) and of 'cap-stock' (credit), so every column pair agrees.
     Accounts that end at nil but moved in the period are listed too. opt.each: one line per customer / supplier ('p:<key>').
     stockOff: the lines without opening stock and stock brought in (their net folded into earlier periods): ledgers only.
     tbGroups: one line per Tally-like group. tbTotals: the six column totals. prevYear: the same dates one year earlier. */
  function pair(v) { v = r2(v); return v > 0 ? [v, 0] : [0, v < 0 ? -v : 0]; }
  function setPair(o, f, v) { var p = pair(v); o[f[0]] = p[0]; o[f[1]] = p[1]; return o; }
  function moves(docs, biz, from, to) {
    var m = {};
    B.inBooks(docs, biz).forEach(function (d) {
      if (from && d.date < from || to && d.date > to) return;
      B.postings(d).forEach(function (l) { var x = m[l.a] = m[l.a] || { dr: 0, cr: 0 }; x.dr = r2(x.dr + l.dr); x.cr = r2(x.cr + l.cr); });
    });
    return m;
  }
  function tbDetail(docs, items, biz, from, to, opt) {
    opt = opt || {};
    var base = fromBooks(docs, items, biz, from, to, opt), before = from ? B.accounts(docs, biz, prevDay(from)) : {}, upto = B.accounts(docs, biz, to);
    var M = moves(docs, biz, from, to), openIn = openStock(docs, biz, from, to), rows = [], done = {}, agg = {};
    function mv(a) { return M[a] || { dr: 0, cr: 0 }; }
    function add(row, open, td, tc) { var o = Object.assign({}, row); setPair(o, ['od', 'oc'], open); o.td = r2(td); o.tc = r2(tc); setPair(o, ['dr', 'cr'], r2(open + td - tc)); rows.push(o); return o; }
    /* parties and GST: summed (or one line per party), grouped by the closing balance, else the opening one */
    Object.keys(upto).concat(Object.keys(before), Object.keys(M)).forEach(function (a) {
      if (done[a]) return; done[a] = 1;
      var u = upto[a] || 0, b0 = before[a] || 0, x = mv(a), g;
      if (!r2(u) && !r2(b0) && !x.dr && !x.cr) return;
      if (a.indexOf('p:') === 0) {
        g = u > 0 || !r2(u) && (b0 > 0 || !r2(b0) && x.dr >= x.cr) ? 'trec' : 'tpay';
        if (opt.each) { add({ k: a, name: a.slice(2), g: g, src: 'books' }, b0, x.dr, x.cr); return; }
      } else if (/^gst-/.test(a)) {   /* each GST ledger on its own line, with the head fromBooks gave the GST lines */
        var gh = base.rows.filter(function (r) { return r.k === a; })[0] || base.rows.filter(function (r) { return /^gst-/.test(r.k); })[0];
        add(gh && gh.k === a ? gh : line(a, gstName(a), gh ? gh.g : 'ocl', 0), b0, x.dr, x.cr); return;
      } else if (isPL(a)) {
        var hit = base.rows.filter(function (r) { return r.k === a; })[0];
        if (hit) add(hit, 0, x.dr, x.cr);
        else if (x.dr || x.cr) add(line(a, a.indexOf('exp:') === 0 ? cap1(a.slice(4)) : a.indexOf('inc:') === 0 ? cap1(a.slice(4)) : NAMES[a] ? NAMES[a][0] : a, a.indexOf('inc:') === 0 ? 'oinc' : a.indexOf('exp:') === 0 ? 'oth' : NAMES[a] ? NAMES[a][1] : 'oth', 0), 0, x.dr, x.cr);
        return;
      } else {
        var h = base.rows.filter(function (r) { return r.k === a; })[0], px = Object.keys(PREFIX).filter(function (p) { return a.indexOf(p) === 0; })[0];
        h = h || line(a, px ? pxName(a, px) : NAMES[a] ? NAMES[a][0] : a, px ? PREFIX[px] : NAMES[a] ? NAMES[a][1] : b0 >= 0 ? 'oca' : 'ocl', 0);
        add(h, b0, x.dr, x.cr); return;
      }
      var s = agg[g] = agg[g] || { o: 0, td: 0, tc: 0, n: 0 }; s.o += b0; s.td += x.dr; s.tc += x.cr; if (r2(u)) s.n++;
    });
    Object.keys(agg).forEach(function (g) {
      var s = agg[g], hit = base.rows.filter(function (r) { return r.k === g; })[0];
      var row = hit || (g === 'gst' ? line('gst', 'GST (net)', 'oca', 0) : line(g, g === 'trec' ? 'Trade receivables (customers who owe you)' : 'Trade payables (suppliers you owe)', g, 0));
      var o = add(row, s.o, s.td, s.tc); o.n = hit ? hit.n : s.n;
    });
    /* stock and earlier periods: as fromBooks made them, with stock brought in during the period as a transaction pair */
    base.rows.forEach(function (r) {
      if (r.k === 'osk') add(r, opt.os != null ? r.dr : r.dr - openIn, opt.os != null ? 0 : openIn, 0);
      else if (r.k === 'cap-stock') add(r, opt.os != null ? -r.cr : -(r.cr - openIn), 0, opt.os != null ? 0 : openIn);
      else if (r.k === 'res-earlier') add(r, r.dr - r.cr, 0, 0);
    });
    rows.sort(function (p, q) { return ORDER.indexOf(p.g) - ORDER.indexOf(q.g) || String(p.name).localeCompare(String(q.name)); });
    return { rows: rows, os: base.os, cs: base.cs };
  }
  /* without stock lines: opening stock and stock brought in leave, their net goes to profit / loss of earlier periods */
  var PAIRS = [['od', 'oc'], ['td', 'tc'], ['dr', 'cr']];
  function stockOff(rows) {
    var out = [], net = {}, er = null, det = rows.some(function (r) { return r.td != null; });
    PAIRS.forEach(function (p) { net[p[0]] = 0; });
    rows.forEach(function (r) {
      if (r.k === 'osk' || r.k === 'cap-stock') { PAIRS.forEach(function (p) { net[p[0]] += num(r[p[0]]) - num(r[p[1]]); }); return; }
      var o = Object.assign({}, r); if (r.k === 'res-earlier') er = o; out.push(o);
    });
    if (!r2(net.od) && !r2(net.td) && !r2(net.dr)) return out;
    if (!er) { er = { k: 'res-earlier', g: 'res', src: 'books' }; out.push(er); }
    PAIRS.forEach(function (p) { if (det || p[0] === 'dr') setPair(er, p, num(er[p[0]]) - num(er[p[1]]) + net[p[0]]); });
    er.name = er.cr ? 'Profit of earlier periods' : 'Loss of earlier periods';
    if (!er.dr && !er.cr && !er.od && !er.oc && !er.td && !er.tc) out.splice(out.indexOf(er), 1);
    return out.sort(function (p, q) { return ORDER.indexOf(p.g) - ORDER.indexOf(q.g); });
  }
  /* Tally-like groups in the order they print, with their English names */
  var TBG = [['gcap', 'Capital account'], ['gres', 'Reserves and surplus (profit and loss account)'], ['gloan', 'Loans (liability)'], ['gcred', 'Sundry creditors'], ['gtax', 'Duties and taxes'], ['gcl', 'Current liabilities'],
    ['gfa', 'Fixed assets'], ['ginv', 'Investments'], ['gdeb', 'Sundry debtors'], ['gcash', 'Cash-in-hand'], ['gbank', 'Bank accounts'], ['gadv', 'Loans and advances (asset)'], ['gosk', 'Opening stock'],
    ['gsales', 'Sales accounts'], ['gpur', 'Purchase accounts'], ['gdir', 'Direct expenses'], ['gind', 'Indirect expenses'], ['ginc', 'Indirect incomes']];
  /* direct expenses: costs of getting goods in or making them; the rest (rent, electricity, salary, transport) are indirect */
  var DIRECT = /(^|\s)(wages?|freight in\w*|carriage in\w*|cartage|loading|unloading|packing|factory|manufactur\w*|job work|customs|import duty|power and fuel)(\s|$)/;
  function tbGroupOf(r) {
    var g = r.g, k = r.k || '';
    if (g === 'cap' || g === 'drw') return 'gcap';
    if (g === 'res') return 'gres';
    if (g === 'ltb' || g === 'stb') return 'gloan';
    if (g === 'tpay') return 'gcred';
    if (k === 'gst' || /^gst-/.test(k) || k === 'tds-payable') return 'gtax';   /* Tally keeps input and output GST under Duties & Taxes */
    if (g === 'ocl') return 'gcl';
    if (g === 'ppe') return 'gfa';
    if (g === 'ninv') return 'ginv';
    if (g === 'trec') return 'gdeb';
    if (g === 'cash') return k === 'bank' ? 'gbank' : 'gcash';
    if (g === 'oca') return 'gadv';
    if (g === 'osk') return 'gosk';
    if (g === 'rev') return 'gsales';
    if (g === 'pur' || g === 'mat') return 'gpur';
    if (g === 'oinc') return 'ginc';
    if (typeof API.isDirect === 'function') return API.isDirect(r) ? 'gdir' : 'gind';   /* when the books know direct expenses, follow them */
    return DIRECT.test(key(r.name)) && !/salar/.test(key(r.name)) ? 'gdir' : 'gind';
  }
  function tbGroups(rows) {
    var s = {};
    rows.forEach(function (r) {
      var id = tbGroupOf(r), x = s[id] = s[id] || { k: 'grp:' + id, grp: id, o: 0, td: 0, tc: 0, c: 0, n: 0 };
      x.o += num(r.od) - num(r.oc); x.td += num(r.td); x.tc += num(r.tc); x.c += num(r.dr) - num(r.cr); x.n++;
    });
    return TBG.filter(function (g) { return s[g[0]]; }).map(function (g) {
      var x = s[g[0]], o = { k: x.k, grp: x.grp, name: g[1], n: x.n, td: r2(x.td), tc: r2(x.tc) };
      setPair(o, ['od', 'oc'], x.o); setPair(o, ['dr', 'cr'], x.c);
      return o;
    });
  }
  function tbTotals(rows) {
    var t = { od: 0, oc: 0, td: 0, tc: 0, dr: 0, cr: 0 };
    rows.forEach(function (r) { Object.keys(t).forEach(function (f) { t[f] += num(r[f]); }); });
    Object.keys(t).forEach(function (f) { t[f] = r2(t[f]); });
    t.dopen = r2(t.od - t.oc); t.dtr = r2(t.td - t.tc); t.diff = r2(t.dr - t.cr);
    return t;
  }
  function yearBack(iso) { var y = +iso.slice(0, 4) - 1, md = iso.slice(5); if (md === '02-29') md = '02-28'; return y + '-' + md; }
  /* previous year column: a statement of profit and loss compares the same dates one year earlier; a balance sheet compares
     the last closed year end (as at 31 March before this period's financial year), with that whole year for its profit */
  function prevYear(from, to, bs) {
    if (bs) { var y = +to.slice(0, 4) - (+to.slice(5, 7) < 4 ? 1 : 0); return [(y - 1) + '-04-01', y + '-03-31']; }
    return [from ? yearBack(from) : '', yearBack(to)];
  }

  var API = { ORDER: ORDER, SIDE: SIDE, headOf: headOf, fromBooks: fromBooks, totals: totals, statements: statements, openStock: openStock, prevDay: prevDay, num: num, r2: r2 };
  API.capLoanLines = capLoanLines;
  API.gstNet = gstNet;   /* user test 2026-11-06: GST ledgers one by one in the trial balance, net on the balance sheet */   /* capital and loans (finrep.js) */
  API.tbDetail = tbDetail; API.stockOff = stockOff; API.tbGroups = tbGroups; API.tbGroupOf = tbGroupOf; API.tbTotals = tbTotals; API.TBG = TBG; API.prevYear = prevYear;   /* trial balance styles (finrep.js) */
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSPL = API;
})(typeof window !== 'undefined' ? window : this);
