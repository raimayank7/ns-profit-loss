/* NSTB: a trial balance from another program -> lines with Schedule III heads (byof2-final, 28 Nov 2026). Pure, no screen; runs on
   profit-loss.niveshsahayak.in (tbfiles.js) and in Node (scripts/test_tbfiles.js). Other sites may read a trial balance with it too.

   What it reads:
   - Any Excel / CSV sheet (sheets = [{ name, rows: [[cells]] }]): one row per ledger with the ledger name and Debit / Credit columns
     (or one balance column with Dr / Cr), optionally a Group column and last year's Debit / Credit (or balance). Headings are found
     anywhere in the first 25 rows, also over two rows ("Closing Balance" over "Debit | Credit", the way Tally and Busy export to Excel).
     Without a Group column, rows named like a Tally / Busy group ("Sundry Debtors", "Expenses (Indirect/Admn.)") are group headings:
     the ledgers under them take that group, and the heading's own total is left out when its ledgers (and sub-groups) add up to it.
   - Tally's Trial Balance report exported as XML (DSPACCNAME / DSPDISPNAME + DSPACCINFO / DSPCLDRAMTA, DSPCLCRAMTA; Tally writes debits
     as minus figures) and Tally masters XML (LEDGER with PARENT and CLOSINGBALANCE, read with NSTallyIn.collect).
   Each line: { i, name, group (as in the file), dr, cr (this year), pdr, pcr (last year), g (head), dx (direct expense, T format),
   why ('group' | 'name' | 'map' | ''), k (key for NSTF) }. Heads are plcore.js ORDER keys, plus 'cs' = closing stock (not part of the
   trial balance), 'skip' = left out; g '' = could not be placed (the user chooses once; place() takes the remembered choices).
   Facts: Schedule III to the Companies Act, 2013, Division I (as amended by MCA notification G.S.R. 207(E), 24 Mar 2021) for the
   heads; ICAI Guidance Note on Financial Statements of Non-corporate Entities (2023) for proprietors and firms. */
(function (G) {
  'use strict';
  function key(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function gk(s) { return key(s).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }   /* "Loans (Liability)" -> "loans liability" */
  function hk(s) { return key(s).replace(/[^a-z0-9%]+/g, ''); }
  function r2(n) { return Math.round((+n + Number.EPSILON) * 100) / 100; }
  function t(s) { return String(s == null ? '' : s).trim(); }

  /* an amount cell: 1,23,456.00 | (2,000) | -500 | 1200 Dr | 1,200.00 Cr | ₹ 500 -> { v (signed: + Dr, - Cr when a side is written), side, ok } */
  function amount(c) {
    if (typeof c === 'number') return { v: isFinite(c) ? c : 0, side: '', ok: isFinite(c) };
    var s = t(c); if (!s) return { v: 0, side: '', ok: true };
    var side = /\bdr\.?\s*$/i.test(s) || /^dr\.?\b/i.test(s) ? 'dr' : /\bcr\.?\s*$/i.test(s) || /^cr\.?\b/i.test(s) ? 'cr' : '';
    var neg = /^\(.*\)$/.test(s.replace(/\s*(dr|cr)\.?\s*$/i, '')) || /^-/.test(s.replace(/^[^\d(-]*/, ''));
    var x = s.replace(/(dr|cr)\.?/gi, '').replace(/[₹,\s]|rs\.?|inr/gi, '').replace(/[()]/g, '').replace(/^-/, '');
    if (!/^\d*\.?\d+$/.test(x)) return { v: 0, side: '', ok: false };
    var v = parseFloat(x); if (neg) v = -v;
    if (side === 'cr') v = -Math.abs(v); else if (side === 'dr') v = Math.abs(v);
    return { v: v, side: side, ok: true };
  }

  /* a CSV text -> rows (quoted cells with commas, "" inside quotes, CRLF or LF; a ; or tab separated file when the first line says so) */
  function csvRows(text) {
    text = String(text || '').replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '', nc = (first.match(/,/g) || []).length;
    var sep = (first.match(/\t/g) || []).length > nc ? '\t' : (first.match(/;/g) || []).length > nc ? ';' : ',';
    var rows = [], row = [], c = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === sep) { row.push(c); c = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(c); rows.push(row); row = []; c = ''; }
      else c += ch;
    }
    if (c || row.length) { row.push(c); rows.push(row); }
    return rows;
  }

  /* ---------- groups of Tally, Busy, Marg and plain trial balances -> heads ---------- */
  var GROUPS = {
    'capital account': 'cap', 'capital accounts': 'cap', 'capital': 'cap', 'share capital': 'cap', 'partners capital': 'cap', 'partners capital account': 'cap', 'proprietors capital': 'cap', 'owners capital': 'cap', 'owners funds': 'cap',
    'reserves and surplus': 'res', 'reserves': 'res', 'profit and loss a c': 'res', 'profit and loss account': 'res', 'profit loss a c': 'res', 'retained earnings': 'res',
    'loans liability': 'ltb', 'secured loans': 'ltb', 'unsecured loans': 'ltb', 'long term borrowings': 'ltb', 'term loans': 'ltb', 'loans': 'ltb', 'borrowings': 'ltb', 'non current liabilities': 'ltb',
    'bank od a c': 'stb', 'bank od': 'stb', 'bank od accounts': 'stb', 'bank occ a c': 'stb', 'bank cc a c': 'stb', 'cash credit': 'stb', 'short term borrowings': 'stb', 'bank overdraft': 'stb',
    'sundry creditors': 'tpay', 'trade payables': 'tpay', 'creditors': 'tpay', 'sundry creditors for goods': 'tpay', 'sundry creditors for expenses': 'tpay',
    'duties and taxes': 'tax', 'duties taxes': 'tax', 'gst': 'tax', 'taxes': 'tax',
    'provisions': 'ocl', 'current liabilities': 'ocl', 'other current liabilities': 'ocl', 'provisions expenses payable': 'ocl', 'expenses payable': 'ocl', 'outstanding expenses': 'ocl', 'liabilities': 'ocl', 'advance from customers': 'ocl', 'short term provisions': 'ocl',
    'fixed assets': 'ppe', 'property plant and equipment': 'ppe', 'tangible assets': 'ppe', 'intangible assets': 'ppe', 'capital work in progress': 'ppe',
    'investments': 'ninv', 'non current investments': 'ninv', 'current investments': 'ninv',
    'sundry debtors': 'trec', 'trade receivables': 'trec', 'debtors': 'trec',
    'cash in hand': 'cash', 'cash and bank balances': 'cash', 'cash and cash equivalents': 'cash', 'bank accounts': 'bank', 'bank account': 'bank', 'banks': 'bank',
    'current assets': 'oca', 'deposits asset': 'oca', 'loans and advances asset': 'oca', 'loans and advances': 'oca', 'other current assets': 'oca', 'advances': 'oca', 'misc expenses asset': 'oca', 'deposits': 'oca', 'short term loans and advances': 'oca', 'long term loans and advances': 'oca',
    'stock in hand': 'stock', 'inventories': 'stock', 'closing stock': 'stock',
    'sales accounts': 'rev', 'sales account': 'rev', 'sales': 'rev', 'sale': 'rev', 'revenue from operations': 'rev', 'income direct opr': 'rev',
    'purchase accounts': 'pur', 'purchase account': 'pur', 'purchases': 'pur', 'purchase': 'pur',
    'direct expenses': 'dexp', 'expenses direct mfg': 'dexp', 'direct expense': 'dexp', 'manufacturing expenses': 'dexp', 'factory expenses': 'dexp', 'trading expenses': 'dexp',
    'indirect expenses': 'iexp', 'expenses indirect admn': 'iexp', 'indirect expense': 'iexp', 'expenses': 'iexp', 'administrative expenses': 'iexp', 'selling expenses': 'iexp', 'office expenses': 'iexp', 'other expenses': 'iexp',
    'direct incomes': 'dinc', 'direct income': 'dinc', 'indirect incomes': 'iinc', 'indirect income': 'iinc', 'income indirect': 'iinc', 'other income': 'iinc',
    'suspense a c': 'ask', 'suspense': 'ask', 'branch divisions': 'ask', 'branch division': 'ask', 'difference in opening balances': 'ask'
  };
  /* names that are group headings in a sheet without a Group column (Tally and Busy primary and reserved groups) */
  var HEADINGS = ['capital account', 'reserves and surplus', 'loans liability', 'current liabilities', 'fixed assets', 'investments', 'current assets', 'branch divisions', 'suspense a c',
    'sales accounts', 'purchase accounts', 'direct incomes', 'indirect incomes', 'direct expenses', 'indirect expenses', 'misc expenses asset', 'bank accounts', 'bank od a c', 'cash in hand',
    'deposits asset', 'duties and taxes', 'loans and advances asset', 'provisions', 'secured loans', 'stock in hand', 'sundry creditors', 'sundry debtors', 'unsecured loans',
    'expenses direct mfg', 'expenses indirect admn', 'income direct opr', 'income indirect', 'provisions expenses payable', 'share capital', 'trade payables', 'trade receivables',
    'long term borrowings', 'short term borrowings', 'other current liabilities', 'property plant and equipment', 'other current assets', 'short term loans and advances', 'revenue from operations', 'other income'];
  var ISHEAD = {}; HEADINGS.forEach(function (h) { ISHEAD[h] = 1; });
  function groupHead(g) { return GROUPS[gk(g)] || ''; }

  /* ---------- a ledger -> head ---------- */
  var NOT_PL = { oca: 1, ltb: 1, drw: 1, cap: 1, res: 1, stb: 1, tpay: 1, trec: 1, ocl: 1, ppe: 1, ninv: 1, cash: 1 };
  var EXP_RE = /rent|electric|power|wage|salar|bonus|staff|freight|carriage|cartage|transport|telephone|phone|mobile|internet|postage|courier|printing|stationery|repair|maintenance|insurance|audit|professional|legal|fees|commission paid|advertis|bank charges|interest paid|interest on|depreciat|travel|conveyance|fuel|petrol|diesel|office|misc|general|discount allowed|bad debts|rates and taxes|packing|loading|unloading|labour|labor|hamali|majdoori|donation|entertainment|tea|refreshment|charges|expenses?\b|exp\b|loss on/;
  function expHead(name) {
    var P = G.NSPL || (typeof NSPL !== 'undefined' ? NSPL : null), h = P ? P.headOf(name) : 'oth';
    return /^(emp|fin|dep|tax|oth|mat|pur)$/.test(h) ? h : 'oth';
  }
  function isBankName(k) { return /\bbank\b|\bhdfc\b|\bicici\b|\bsbi\b|\baxis\b|\bkotak\b|\bpnb\b|\bcanara\b|\bbaroda\b|\bidbi\b|\bindusind\b|\byes bank\b|\bunion bank\b|current a ?c|savings a ?c|\bcc a ?c|\bod a ?c/.test(k); }
  function directOf(name) { var F = G.NSTF || (typeof NSTF !== 'undefined' ? NSTF : null); return F ? F.defaultDirect('', name) : /freight|carriage|cartage|wage|factory|packing|loading|unloading|power and fuel|job ?work|labour|labor|hamali/.test(key(name)); }
  /* the head of one ledger, its group (as written) and its net (dr - cr) */
  function auto(name, group, net) {
    var k = key(name), gh = groupHead(group), side = net >= 0 ? 'dr' : 'cr';
    if (/^opening stock|^stock (as )?on 1|^op(\.|ening)? ?stock/.test(k)) return { g: 'osk', why: 'name' };
    if (/^closing stock|^stock (as )?on 31|^cl(\.|osing)? ?stock/.test(k)) return { g: 'cs', why: 'name' };
    if (gh === 'stock') return { g: /closing|31/.test(k) ? 'cs' : 'osk', why: 'group' };
    if (gh === 'ask') return { g: '', why: '' };
    if (gh) {
      if (gh === 'cap') return { g: /drawing/.test(k) ? 'drw' : 'cap', why: 'group' };
      if (gh === 'tax') return { g: side === 'dr' ? 'oca' : 'ocl', why: 'group' };
      if (gh === 'bank') return { g: side === 'cr' ? 'stb' : 'cash', why: 'group', bank: 1 };
      if (gh === 'cash') return { g: side === 'cr' && isBankName(k) ? 'stb' : 'cash', why: 'group', bank: isBankName(k) ? 1 : 0 };
      if (gh === 'rev') return { g: 'rev', why: 'group', ret: /return/.test(k) && side === 'dr' };
      if (gh === 'pur') return { g: 'pur', why: 'group', ret: /return/.test(k) && side === 'cr' };
      if (gh === 'dexp') { var hd = expHead(name); return { g: hd, why: 'group', dx: !/^(dep|fin|tax)$/.test(hd) }; }
      if (gh === 'iexp') { var hi = expHead(name); return { g: hi, why: 'group', dx: false }; }
      if (gh === 'dinc' || gh === 'iinc') return { g: 'oinc', why: 'group' };
      if (gh === 'ppe' && /depreciation|accumulated/.test(k)) return { g: 'ppe', why: 'group' };
      return { g: gh, why: 'group' };
    }
    /* no group we know: by the ledger's own name */
    if (/drawing/.test(k)) return { g: 'drw', why: 'name' };
    if (/share capital|capital a\/?c|capital account|^capital$|\bcapital\b/.test(k) && side === 'cr') return { g: 'cap', why: 'name' };
    if (/^profit (and|&) loss|^p ?& ?l a\/?c|reserve|surplus/.test(k)) return { g: 'res', why: 'name' };
    if (/sales? return|return inward/.test(k)) return { g: 'rev', why: 'name', ret: side === 'dr' };
    if (/purchase return|return outward/.test(k)) return { g: 'pur', why: 'name', ret: side === 'cr' };
    if (/^sales?\b|\bsales a\/?c|\bsales account|turnover|revenue from|service income|job work income|^income from (services|operations)/.test(k)) return { g: 'rev', why: 'name' };
    if (/^purchases?\b|\bpurchase a\/?c|\bpurchase account|raw material/.test(k)) return { g: /raw material/.test(k) ? 'mat' : 'pur', why: 'name' };
    if (/^cash( in hand| a\/?c| account)?$|^petty cash/.test(k)) return { g: 'cash', why: 'name' };
    if (isBankName(k)) return { g: side === 'cr' ? (/loan|term/.test(k) ? 'ltb' : 'stb') : 'cash', why: 'name', bank: 1 };
    if (/\b(cgst|sgst|igst|utgst|gst|tds|tcs|cess)\b/.test(k)) return { g: side === 'dr' ? 'oca' : 'ocl', why: 'name' };
    if (/debtor|receivable/.test(k)) return { g: 'trec', why: 'name' };
    if (/creditor|payable/.test(k)) return { g: /salary|wages|expense|gst|tax|tds|pf|esi|bonus|audit/.test(k) ? 'ocl' : 'tpay', why: 'name' };
    if (/outstanding|provision for/.test(k)) return { g: side === 'cr' ? 'ocl' : 'oca', why: 'name' };
    if (/prepaid|advance|deposit|security|accrued|loan to|receivable/.test(k)) return { g: side === 'dr' ? 'oca' : 'ocl', why: 'name' };
    if (/loan|borrowing|mortgage/.test(k)) return { g: side === 'cr' ? (/short|od|overdraft|cash credit/.test(k) ? 'stb' : 'ltb') : 'oca', why: 'name' };
    if (/investment|fixed deposit|\bfd\b|mutual fund|shares in/.test(k)) return { g: 'ninv', why: 'name' };
    if (/furniture|fixture|machinery|machine|plant|building|land|vehicle|car\b|truck|computer|laptop|equipment|motor|scooter|goodwill|software|printer|air ?conditioner|\bac\b|generator|tools/.test(k)) return { g: 'ppe', why: 'name' };
    if (/interest received|interest income|discount received|commission received|rent received|dividend|other income|misc(ellaneous)? income|profit on sale|income$/.test(k) && side === 'cr') return { g: 'oinc', why: 'name' };
    if (/income tax|advance tax/.test(k) && side === 'dr') return { g: 'tax', why: 'name' };
    if (EXP_RE.test(k) && side === 'dr') { var he = expHead(name); return { g: he, why: 'name', dx: directOf(name) }; }
    return { g: '', why: '' };
  }

  /* ---------- the heading row of a sheet ---------- */
  var COLS = [
    { k: 'name', h: 'Particulars', need: 1, a: ['ledger', 'ledger name', 'ledgers', 'account', 'account name', 'accounts', 'name', 'name of account', 'account head', 'head of account', 'description', 'ledger account', 'name of ledger', 'account title', 'a/c name', 'party', 'particular'] },
    { k: 'group', h: 'Group', a: ['under', 'parent', 'group name', 'account group', 'primary group', 'ledger group', 'group/under', 'schedule', 'category', 'type', 'nature', 'main group', 'group head', 'head'] },
    { k: 'dr', h: 'Debit', a: ['dr', 'debit amount', 'debit balance', 'closing debit', 'closing balance debit', 'closing balance dr', 'closing dr', 'dr amount', 'debit rs', 'amount dr', 'dr balance', 'debit (rs)', 'debit (₹)', 'closing balance (dr)', 'this year debit', 'current year debit', 'cy debit', 'cy dr', 'current year dr', 'debit amount (rs)'] },
    { k: 'cr', h: 'Credit', a: ['cr', 'credit amount', 'credit balance', 'closing credit', 'closing balance credit', 'closing balance cr', 'closing cr', 'cr amount', 'credit rs', 'amount cr', 'cr balance', 'credit (rs)', 'credit (₹)', 'closing balance (cr)', 'this year credit', 'current year credit', 'cy credit', 'cy cr', 'current year cr', 'credit amount (rs)'] },
    { k: 'bal', h: 'Closing balance', a: ['balance', 'amount', 'closing', 'net balance', 'closing amount', 'closing bal', 'cl balance', 'balance amount', 'current year', 'this year', 'cy', 'amount (rs)', 'balance (rs)'] },
    { k: 'side', h: 'Dr/Cr', a: ['dr cr', 'drcr', 'dr/cr', 'balance type', 'type of balance', 'side', 'd/c', 'dc', 'dr or cr'] },
    { k: 'pdr', h: 'Previous year debit', a: ['last year debit', 'py debit', 'py dr', 'previous year dr', 'last year dr', 'prev year debit', 'previous debit', 'previous year debit (rs)', 'prior year debit'] },
    { k: 'pcr', h: 'Previous year credit', a: ['last year credit', 'py credit', 'py cr', 'previous year cr', 'last year cr', 'prev year credit', 'previous credit', 'previous year credit (rs)', 'prior year credit'] },
    { k: 'pbal', h: 'Previous year', a: ['last year', 'py', 'previous year balance', 'last year balance', 'py balance', 'previous year amount', 'last year amount', 'prior year', 'prev year'] },
    { k: 'pside', h: 'Previous year Dr/Cr', a: ['last year dr/cr', 'py dr/cr', 'py side'] },
    /* columns that must not be taken for the closing figures */
    { k: 'odr', h: 'Opening balance debit', a: ['opening debit', 'opening dr', 'opening balance dr', 'op debit', 'op dr'] },
    { k: 'ocr', h: 'Opening balance credit', a: ['opening credit', 'opening cr', 'opening balance cr', 'op credit', 'op cr'] },
    { k: 'obal', h: 'Opening balance', a: ['opening', 'op balance'] },
    { k: 'tdr', h: 'Transactions debit', a: ['debit transactions', 'transactions dr', 'period debit', 'debit during the year'] },
    { k: 'tcr', h: 'Transactions credit', a: ['credit transactions', 'transactions cr', 'period credit', 'credit during the year'] }
  ];
  function fieldOf(h) {
    var TPL = G.NSTpl || (typeof NSTpl !== 'undefined' ? NSTpl : null);
    if (TPL && TPL.fieldIn) return TPL.fieldIn(COLS, h);   /* the same heading matching as every import screen (tplcore.js) */
    var x = hk(h); if (!x) return '';
    var f = ''; COLS.some(function (c) { if (hk(c.h) === x || c.a.some(function (a) { return hk(a) === x; })) { f = c.k; return true; } return false; });
    return f;
  }
  /* headings of row r: a cell that only says Debit / Credit / Dr / Cr takes the heading above it (merged cells: the nearest one to the left) */
  function headsAt(rows, r) {
    var h = (rows[r] || []).map(t), up = r > 0 ? (rows[r - 1] || []).map(t) : [], last = '';
    var fill = up.map(function (c) { if (c) last = c; return last; });
    return h.map(function (c, i) {
      if (!c && up[i] && fieldOf(up[i]) === 'name') return up[i];   /* "Particulars" written in the row above (two-row headings) */
      if (/^(debit|credit|dr\.?|cr\.?)$/i.test(c) && fill[i] && !/^particulars$/i.test(fill[i])) { var comb = fill[i] + ' ' + c; if (fieldOf(comb)) return comb; }
      return c;
    });
  }
  function sigOf(heads) { return heads.map(hk).filter(Boolean).join('|'); }
  function layoutOf(rows, saved) {
    var best = null;
    for (var r = 0; r < Math.min(rows.length, 25); r++) {
      var heads = headsAt(rows, r), sig = sigOf(heads);
      if (saved && sig && saved[sig] && saved[sig].map) return { row: r, map: saved[sig].map, heads: heads, sig: sig, remembered: true };
      var map = {}, n = 0;
      heads.forEach(function (h, i) { var f = fieldOf(h); if (f && !(f in map)) { map[f] = i; n++; } });
      var ok = 'name' in map && (('dr' in map && 'cr' in map) || 'bal' in map);
      var score = n + (ok ? 10 : 0);
      if (n >= 2 && (!best || score > best.score)) best = { row: r, map: map, heads: heads, sig: sig, score: score, ok: ok };
    }
    return best;
  }
  /* the year end written above the headings: "1-Apr-2025 to 31-Mar-2026", "As at 31/03/2026" */
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function yearEnd(rows, upto) {
    var txt = (rows || []).slice(0, Math.max(1, upto || 8)).map(function (r) { return (r || []).join(' '); }).join(' '), m, out = '';
    var re = /(\d{1,2})[-\/. ]([A-Za-z]{3}|\d{1,2})[a-z]*[-\/. ,]+(\d{2,4})/g;
    while ((m = re.exec(txt))) {
      var d = +m[1], mo = MON[m[2].slice(0, 3).toLowerCase()] || +m[2], y = +m[3]; if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y > 1990 && y < 2100) out = y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
    }
    return out;
  }

  /* ---------- a sheet -> raw lines ---------- */
  function cell(row, i) { return i == null ? '' : row[i]; }
  function pairOf(row, L, d, c, b, s) {
    var probs = [], v = 0, any = false, dd = 0, cc = 0;
    if (d in L.map || c in L.map) {
      var x = amount(cell(row, L.map[d])), y = amount(cell(row, L.map[c]));
      if (!x.ok) probs.push(t(cell(row, L.map[d]))); if (!y.ok) probs.push(t(cell(row, L.map[c])));
      v = Math.abs(x.v) - Math.abs(y.v); any = !!(x.v || y.v); dd = Math.abs(x.v); cc = Math.abs(y.v);
      if (x.v < 0 && !y.v) v = x.v;   /* a minus figure in the debit column: Tally's way of writing a debit, or a credit */
    } else if (b in L.map) {
      var z = amount(cell(row, L.map[b])), sd = s in L.map ? key(cell(row, L.map[s])) : '';
      if (!z.ok) probs.push(t(cell(row, L.map[b])));
      v = z.v; any = !!z.v;
      if (/^c/.test(sd)) v = -Math.abs(v); else if (/^d/.test(sd)) v = Math.abs(v);
    }
    return { v: r2(v), any: any, probs: probs, dr: r2(dd), cr: r2(cc) };
  }
  var TOTAL_RE = /^(grand )?total\b|^total$|^difference in (trial|tb)|^net total|^sub ?total/;
  function fromRows(rows, L, src) {
    var out = [], skipped = [], hasGroup = 'group' in L.map;
    for (var r = L.row + 1; r < rows.length; r++) {
      var row = rows[r] || [], name = t(cell(row, L.map.name));
      if (!name) { if (row.some(function (c) { return t(c); })) skipped.push({ row: r + 1, why: 'noname' }); continue; }
      if (TOTAL_RE.test(key(name))) { var tv = pairOf(row, L, 'dr', 'cr', 'bal', 'side'); var tp = pairOf(row, L, 'pdr', 'pcr', 'pbal', 'pside'); out.push({ total: 1, row: r + 1, name: name, v: tv.v, dr: tv.dr, cr: tv.cr, pdr: tp.dr, pcr: tp.cr }); continue; }
      var cy = pairOf(row, L, 'dr', 'cr', 'bal', 'side'), py = pairOf(row, L, 'pdr', 'pcr', 'pbal', 'pside');
      if (cy.probs.length || py.probs.length) { skipped.push({ row: r + 1, why: 'amount', name: name, text: cy.probs.concat(py.probs).join(', ') }); continue; }
      out.push({ row: r + 1, name: name, group: hasGroup ? t(cell(row, L.map.group)) : '', v: cy.v, pv: py.v, any: cy.any || py.any, src: src });
    }
    return { lines: out, skipped: skipped, hasPY: 'pdr' in L.map || 'pcr' in L.map || 'pbal' in L.map, hasGroup: hasGroup };
  }

  /* ---------- group heading rows (a sheet without a Group column) ----------
     sections: a heading and the rows under it up to the next heading. A heading is left out when the rows under it, or the rows under it
     plus the next headings (its sub-groups), add up to it; inside a section a row that equals the sum of the rows right after it is an
     unknown sub-group (a group made by the user) and is left out too. A heading with nothing under it is a line itself (a short trial
     balance of groups only). */
  function close(a, b) { return Math.abs(a - b) <= 1; }
  function groupRows(lines) {
    var heads = [], warn = [], i;
    lines.forEach(function (l, j) { if (!l.total && ISHEAD[gk(l.name)]) heads.push(j); });
    if (!heads.length) return { lines: lines, warn: warn };
    var anyLedger = lines.some(function (l, j) { return !l.total && heads.indexOf(j) < 0 && l.any; });
    var out = [], cur = '';
    var secs = heads.map(function (h, n) { var end = n + 1 < heads.length ? heads[n + 1] : lines.length; return { h: h, kids: lines.slice(h + 1, end).filter(function (l) { return !l.total; }) }; });
    lines.slice(0, heads[0]).forEach(function (l) { if (!l.total) out.push(l); });   /* rows before the first heading */
    function sum(a, f) { return a.reduce(function (s, l) { return s + (l[f] || 0); }, 0); }
    secs.forEach(function (S, n) {
      var H = lines[S.h], g = H.name; cur = g;
      /* unknown sub-groups inside the section: a row equal to the sum of two or more rows right after it (or of one row, when
         that is what makes the section add up to its heading) */
      var kids = S.kids.slice(), drop = {};
      function subOf(i, min) {
        for (var j = i + 1, s = 0, ps = 0; j < kids.length; j++) {
          s += kids[j].v; ps += kids[j].pv || 0;
          if (j - i >= min && kids[i].v && close(s, kids[i].v) && close(ps, kids[i].pv || 0)) return true;
          if (Math.abs(s) > Math.abs(kids[i].v) + 1 && kids[i].v * s > 0) return false;
        }
        return false;
      }
      for (i = 0; i < kids.length; i++) if (subOf(i, 2)) drop[i] = 1;
      function rest() { return r2(kids.reduce(function (a, k, x) { return drop[x] ? a : a + k.v; }, 0)); }
      if (!close(rest(), H.v)) for (i = 0; i < kids.length; i++) if (!drop[i] && subOf(i, 1)) { drop[i] = 1; if (close(rest(), H.v)) break; delete drop[i]; }
      var led = kids.filter(function (k, x) { return !drop[x]; }), ks = r2(sum(led, 'v'));
      if (!led.length && !S.kids.length) {
        /* nothing under it: a line itself, unless it is a parent whose sub-groups follow */
        var follow = 0, ok = false;
        for (var m = n + 1; m < secs.length && anyLedger; m++) { follow += lines[secs[m].h].v; if (close(follow, H.v) && H.v) { ok = true; break; } }
        if (!ok) out.push(Object.assign({}, H, { group: g }));
        return;
      }
      if (!close(ks, H.v) && H.any) {
        var extra = 0, ok2 = false;
        for (var q = n + 1; q < secs.length; q++) { extra += lines[secs[q].h].v; if (close(ks + extra, H.v)) { ok2 = true; break; } }
        if (!ok2) warn.push({ w: 'grpsum', g: g, file: H.v, led: ks });
      }
      led.forEach(function (l) { out.push(Object.assign({}, l, { group: l.group || cur, under: g })); });
    });
    return { lines: out, warn: warn };
  }

  /* ---------- Tally XML: the Trial Balance report and masters ---------- */
  function tallyReport(text) {
    var names = [], vals = [], re = /<DSPDISPNAME>([\s\S]*?)<\/DSPDISPNAME>|<DSPACCINFO>([\s\S]*?)<\/DSPACCINFO>/g, m;
    function un(s) { return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (x, c) { return +c < 32 ? '' : String.fromCharCode(+c); }).trim(); }
    function tag(s, n) { var x = new RegExp('<' + n + '>([\\s\\S]*?)</' + n + '>').exec(s); return x ? un(x[1]) : ''; }
    var rows = [['Particulars', 'Debit', 'Credit']], pend = null;
    while ((m = re.exec(text))) {
      if (m[1] != null) { pend = un(m[1]); continue; }
      if (pend == null) continue;
      var d = amount(tag(m[2], 'DSPCLDRAMTA')), c = amount(tag(m[2], 'DSPCLCRAMTA'));
      rows.push([pend, d.v ? Math.abs(d.v) : '', c.v ? Math.abs(c.v) : '']); pend = null;
    }
    void names; void vals;
    return rows;
  }
  function tallyMasters(texts) {
    var TI = G.NSTallyIn || (typeof NSTallyIn !== 'undefined' ? NSTallyIn : null); if (!TI) return null;
    var M = TI.collect(texts), rows = [['Particulars', 'Group', 'Closing balance', 'Opening balance']], closing = 0;
    function top(g) { var seen = {}, k = key(g), last = g; while (k && !seen[k]) { seen[k] = 1; if (GROUPS[gk(k)]) return M.groups[k] ? M.groups[k].name : last; var p = M.groups[k]; if (!p) return last; last = p.parent; k = key(p.parent); } return last; }
    Object.keys(M.ledgers).forEach(function (k) {
      var L = M.ledgers[k], cl = L.closing != null && t(L.closing) !== '' ? L.closing : null; if (cl != null) closing++;
      /* Tally: minus = debit */
      var c = cl == null ? 0 : -amount(cl).v, o = -amount(L.opening).v;
      rows.push([L.name, top(L.parent) || L.parent, cl == null ? '' : r2(c), r2(o)]);
    });
    return { rows: rows, company: M.company, closing: closing, ledgers: Object.keys(M.ledgers).length };
  }
  function xmlKind(text) { return /<DSPACCNAME|<DSPDISPNAME/.test(text) ? 'report' : /<LEDGER[\s>]/.test(text) ? 'masters' : /<BusyData/i.test(text) ? 'busy' : ''; }

  /* ---------- read: sheets and / or XML texts -> lines ----------
     input = [{ name, rows } | { name, xml }]; opts.layouts = remembered column layouts { sig: { map } }; opts.force = { sheet name: layout }.
     -> { lines, skipped, warn, found: [{ name, kind, map, heads, row, sig }], hasPY, end, company, totals: { dr, cr, pdr, pcr, file } } */
  function read(input, opts) {
    opts = opts || {};
    var R = { lines: [], skipped: [], warn: [], found: [], hasPY: false, end: '', company: '', file: null, pfile: null };
    (input || []).forEach(function (f) {
      var rows = f.rows, kind = 'sheet', L;
      if (f.xml != null) {
        var xk = xmlKind(f.xml);
        if (xk === 'report') { rows = tallyReport(f.xml); kind = 'tally-report'; }
        else if (xk === 'masters') {
          var TM = tallyMasters([f.xml]);
          if (!TM) { R.warn.push({ w: 'notally', f: f.name }); return; }
          R.company = R.company || TM.company; rows = TM.rows; kind = 'tally-masters';
          if (!TM.closing) { R.warn.push({ w: 'openonly', f: f.name }); rows = rows.map(function (r, i) { return i ? [r[0], r[1], r[3]] : ['Particulars', 'Group', 'Closing balance']; }); }
          else rows = rows.map(function (r) { return r.slice(0, 3); });
        } else { R.warn.push({ w: xk === 'busy' ? 'busyxml' : 'xmlunknown', f: f.name }); return; }
      }
      rows = (rows || []).filter(function (r) { return r && r.some(function (c) { return t(c); }); });
      L = opts.force && opts.force[f.name] || layoutOf(rows, opts.layouts);
      if (!L || !L.ok && !L.remembered && !('name' in L.map && ('dr' in L.map || 'cr' in L.map || 'bal' in L.map))) { R.found.push({ name: f.name, kind: '', rows: rows.length, heads: (rows[0] || []).slice(0, 20) }); return; }
      R.end = R.end || yearEnd(rows, L.row + 1);
      var F = fromRows(rows, L, f.name);
      var lines = F.lines.filter(function (l) { return !l.total; }), totals = F.lines.filter(function (l) { return l.total; });
      if (!F.hasGroup) { var GR = groupRows(lines); lines = GR.lines; R.warn = R.warn.concat(GR.warn); }
      if (totals.length) R.file = totals[totals.length - 1];
      R.hasPY = R.hasPY || F.hasPY;
      R.found.push({ name: f.name, kind: kind, map: L.map, heads: L.heads, row: L.row, sig: L.sig, remembered: !!L.remembered, n: lines.length });
      R.skipped = R.skipped.concat(F.skipped.map(function (s) { s.f = f.name; return s; }));
      R.lines = R.lines.concat(lines.filter(function (l) { return l.any !== false || l.v || l.pv; }));
    });
    /* the same ledger twice (two files of one year): added together */
    var by = {}, out = [];
    R.lines.forEach(function (l) { var k = key(l.name) + '|' + key(l.group); if (by[k]) { by[k].v = r2(by[k].v + l.v); by[k].pv = r2((by[k].pv || 0) + (l.pv || 0)); return; } by[k] = Object.assign({}, l); out.push(by[k]); });
    R.lines = out.filter(function (l) { return r2(l.v) || r2(l.pv || 0); });
    R.lines.forEach(function (l, i) { l.i = i; });
    return R;
  }
  /* last year's trial balance in its own file: its closing figures become this year's lines' pdr / pcr (matched by ledger name) */
  function joinPY(R, P) {
    var by = {}; R.lines.forEach(function (l) { by[key(l.name)] = l; });
    (P.lines || []).forEach(function (p) {
      var l = by[key(p.name)];
      if (l) { l.pv = r2((l.pv || 0) + p.v); return; }
      var n = { name: p.name, group: p.group, v: 0, pv: p.v, i: R.lines.length, src: p.src, pyOnly: 1 }; R.lines.push(n); by[key(p.name)] = n;
    });
    R.hasPY = true; R.pfile = P.file; R.pend = P.end;
    return R;
  }

  /* ---------- heads for every line; map = the user's choices { ledger name key: head } ---------- */
  function ownerKey(name) { return key(name).replace(/\b(capital|drawings?|current|a\/?c|account|partners?|proprietors?|'s)\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() || 'capital'; }
  function place(R, map) {
    map = map || {};
    var lines = R.lines.map(function (l) {
      var net = l.v || l.pv || 0, a = auto(l.name, l.group, net), u = map[key(l.name)], g = a.g, why = a.why, dx = a.dx;
      if (u) { why = 'map'; if (/:d$/.test(u)) { g = u.slice(0, -2); dx = true; } else { g = u; dx = /^(emp|oth)$/.test(u) ? (map[key(l.name) + '|dx'] != null ? !!map[key(l.name) + '|dx'] : a.dx != null ? a.dx : directOf(l.name)) : undefined; } }
      var x = { i: l.i, name: l.name, group: l.group || '', dr: l.v > 0 ? r2(l.v) : 0, cr: l.v < 0 ? r2(-l.v) : 0, pdr: (l.pv || 0) > 0 ? r2(l.pv) : 0, pcr: (l.pv || 0) < 0 ? r2(-l.pv) : 0, g: g, why: why, src: l.src };
      if (/^(emp|oth)$/.test(g)) x.dx = dx != null ? !!dx : directOf(l.name);
      x.k = 'tb:' + l.i;
      if (g === 'rev' && a.ret) x.k = 'sales-return';
      else if (g === 'pur' && a.ret) x.k = 'purchase-return';
      else if (g === 'cap') x.k = 'cap:' + ownerKey(l.name);
      else if (g === 'drw') x.k = 'drw:' + ownerKey(l.name);
      else if (g === 'cash' && (a.bank || isBankName(key(l.name)))) x.k = 'bank:' + key(l.name);
      else if ((g === 'ocl' || g === 'oca') && /\b(c|s|i|ut)?gst\b/.test(key(l.name))) x.k = 'gst-' + l.i;   /* NSTF: duties and taxes / GST input credit */
      x.en = l.name;
      return x;
    });
    var cs = 0, pcs = 0, csFrom = false, tb = [], skip = [], ask = [];
    lines.forEach(function (x) {
      if (x.g === 'cs') { cs = r2(cs + x.dr - x.cr); pcs = r2(pcs + x.pdr - x.pcr); csFrom = true; return; }
      if (x.g === 'skip') { skip.push(x); return; }
      if (!x.g) ask.push(x);
      tb.push(x);
    });
    function tot(f) { return r2(tb.reduce(function (s, x) { return s + x[f]; }, 0)); }
    return { lines: lines, tb: tb, ask: ask, skip: skip, cs: cs, pcs: pcs, csFrom: csFrom, dr: tot('dr'), cr: tot('cr'), pdr: tot('pdr'), pcr: tot('pcr') };
  }
  /* trial balance lines of one year for NSPL.statements / NSTF (py = last year's columns); lines without a head are left out */
  function yearRows(P, py) {
    return P.tb.filter(function (x) { return x.g; }).map(function (x) { var o = Object.assign({}, x); if (py) { o.dr = x.pdr; o.cr = x.pcr; } return o; }).filter(function (x) { return x.dr || x.cr; });
  }
  /* figures for NSAudit.ratios (auditcore.js) from NSPL.statements */
  function ratioInput(F) {
    var L = F.pl, S = F.bs;
    return { rev: L.rev, cogs: r2(L.mat + L.pur + L.chg), purchases: L.pur, pat: L.profit, ebit: r2(L.pbt + L.fin), int: L.fin, prin: 0, dep: L.dep, equity: S.own, debt: r2(S.ltb + S.stb),
      ca: S.ca, cl: S.cl, inv: S.inv, rec: S.trec, pay: S.tpay, invest: S.ninv, invIncome: 0 };
  }
  /* a company? Share capital in the trial balance, or the words "Limited" / "Pvt" in the name */
  function looksCompany(R, P, name) {
    if (/\b(limited|ltd|pvt|private limited|llp)\b/i.test(name || R.company || '')) return !/\bllp\b/i.test(name || R.company || '');
    return P.lines.some(function (x) { return /share capital|equity shares/.test(key(x.name)) || /share capital/.test(key(x.group)); });
  }

  /* ---------- sample trial balance (made-up figures, clearly marked) ----------
     Tally style: group headings with their totals, ledgers under them, this year and last year, totals agree both years. */
  function sample() {
    var R = [
      ['Sharma Traders (SAMPLE, made-up figures)', '', '', '', ''],
      ['Trial Balance', '', '', '', ''],
      ['1-Apr-2025 to 31-Mar-2026', '', '', '', ''],
      ['Particulars', 'Closing Balance', '', 'Previous Year', ''],
      ['', 'Debit', 'Credit', 'Debit', 'Credit']];
    var G = [
      ['Opening Stock', [['Opening Stock', 412000, 0, 380000, 0]]],
      ['Capital Account', [['Ramesh Sharma Capital A/c', 0, 346700, 0, 600000], ['Ramesh Sharma Drawings', 120000, 0, 110000, 0]]],
      ['Loans (Liability)', [['HDFC Bank Term Loan', 0, 300000, 0, 360000]]],
      ['Current Liabilities', [['Audit Fees Payable', 0, 15000, 0, 12000], ['Salary Payable', 0, 22000, 0, 20000]]],
      ['Duties & Taxes', [['Output CGST', 0, 18400, 0, 15100], ['Output SGST', 0, 18400, 0, 15100], ['TDS Payable', 0, 3200, 0, 2800]]],
      ['Sundry Creditors', [['Gupta Wholesale', 0, 145000, 0, 120000], ['Kumar Agencies', 0, 98000, 0, 85000]]],
      ['Fixed Assets', [['Furniture and Fixtures', 85000, 0, 95000, 0], ['Computers', 42000, 0, 60000, 0], ['Delivery Van', 310000, 0, 365000, 0]]],
      ['Current Assets', [['Security Deposit (Shop)', 50000, 0, 50000, 0], ['Advance to Suppliers', 18000, 0, 12000, 0]]],
      ['Sundry Debtors', [['Mehta Stores', 132000, 0, 98000, 0], ['City Mart', 87000, 0, 76000, 0], ['Singh Kirana', 41000, 0, 39000, 0]]],
      ['Cash-in-Hand', [['Cash', 23400, 0, 18300, 0]]],
      ['Bank Accounts', [['State Bank of India Current A/c', 164000, 0, 121400, 0]]],
      ['Sales Accounts', [['Sales @ 18%', 0, 3150000, 0, 2650000], ['Sales @ 5%', 0, 410000, 0, 365000], ['Sales Returns', 35000, 0, 28000, 0]]],
      ['Purchase Accounts', [['Purchase @ 18%', 2240000, 0, 1960000, 0], ['Purchase @ 5%', 302000, 0, 270000, 0], ['Purchase Returns', 0, 21000, 0, 16000]]],
      ['Direct Expenses', [['Freight Inward', 46000, 0, 41000, 0], ['Loading and Unloading', 12000, 0, 10500, 0]]],
      ['Indirect Expenses', [['Salary', 264000, 0, 240000, 0], ['Shop Rent', 180000, 0, 168000, 0], ['Electricity Charges', 38000, 0, 34500, 0], ['Interest on Term Loan', 34000, 0, 39000, 0],
        ['Depreciation', 83000, 0, 85000, 0], ['Telephone and Internet', 14400, 0, 13200, 0], ['Audit Fees', 15000, 0, 12000, 0], ['Bank Charges', 3800, 0, 3100, 0], ['Advertisement', 22000, 0, 18000, 0],
        ['Office Expenses', 16000, 0, 14000, 0]]],
      ['Indirect Incomes', [['Discount Received', 0, 9200, 0, 7600], ['Interest on FD', 0, 6000, 0, 4200]]]];
    var td = 0, tc = 0, pd = 0, pc = 0;
    G.forEach(function (g) {
      var s = g[1].reduce(function (a, l) { return [a[0] + l[1] - l[2], a[1] + l[3] - l[4]]; }, [0, 0]);
      if (g[0] !== 'Opening Stock') R.push([g[0], s[0] > 0 ? s[0] : '', s[0] < 0 ? -s[0] : '', s[1] > 0 ? s[1] : '', s[1] < 0 ? -s[1] : '']);
      g[1].forEach(function (l) { R.push([l[0], l[1] || '', l[2] || '', l[3] || '', l[4] || '']); td += l[1]; tc += l[2]; pd += l[3]; pc += l[4]; });
    });
    /* profit of earlier years: last year's figure plus last year's profit (1,38,500) */
    R.push(['Reserves & Surplus', '', 226700, '', 88200]);
    R.push(['Profit & Loss A/c', '', 226700, '', 88200]); tc += 226700; pc += 88200;
    td = Math.max(td, tc); pd = Math.max(pd, pc);
    R.push(['Grand Total', td, td, pd, pd]);
    return { name: 'Sample trial balance (Sharma Traders).xlsx', rows: R, cs: 468000, pcs: 412000, end: '2026-03-31' };
  }

  var API = { amount: amount, GROUPS: GROUPS, groupHead: groupHead, auto: auto, COLS: COLS, fieldOf: fieldOf, headsAt: headsAt, layoutOf: layoutOf, yearEnd: yearEnd, groupRows: groupRows,
    tallyReport: tallyReport, tallyMasters: tallyMasters, xmlKind: xmlKind, read: read, joinPY: joinPY, place: place, yearRows: yearRows, ratioInput: ratioInput, looksCompany: looksCompany,
    sample: sample, csvRows: csvRows, key: key, ownerKey: ownerKey, sig: sigOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSTB = API;
})(typeof window !== 'undefined' ? window : this);
