// Rechenlogik der Finanz-App: Konten, Buchungen, Daueraufträge, Splitwise, Depot.
// Reine Funktionen ohne DOM – wird von app.js und den Tests verwendet.

export const SCHEMA_VERSION = 1;

export const DEFAULT_CATEGORIES = [
  { id: 'lebensmittel', name: 'Lebensmittel & Haushalt', icon: 'cart', color: '#2f9e6b', kind: 'expense', budget: 0 },
  { id: 'wohnen', name: 'Wohnen', icon: 'home', color: '#4c6ef5', kind: 'expense', budget: 0 },
  { id: 'mobilitaet', name: 'Mobilität', icon: 'train', color: '#1c9cc4', kind: 'expense', budget: 0 },
  { id: 'essen', name: 'Essen gehen', icon: 'utensils', color: '#e8590c', kind: 'expense', budget: 0 },
  { id: 'freizeit', name: 'Freizeit', icon: 'ticket', color: '#ae3ec9', kind: 'expense', budget: 0 },
  { id: 'shopping', name: 'Shopping', icon: 'bag', color: '#d6336c', kind: 'expense', budget: 0 },
  { id: 'abos', name: 'Abos', icon: 'repeat', color: '#7048e8', kind: 'expense', budget: 0 },
  { id: 'gesundheit', name: 'Gesundheit', icon: 'medical', color: '#0ca678', kind: 'expense', budget: 0 },
  { id: 'sonstiges', name: 'Sonstiges', icon: 'box', color: '#868e96', kind: 'expense', budget: 0 },
  { id: 'bar', name: 'Bargeld (ohne Zuordnung)', icon: 'banknote', color: '#a07c3b', kind: 'expense', budget: 0 },
  { id: 'gehalt', name: 'Gehalt', icon: 'briefcase', color: '#2b8a3e', kind: 'income', budget: 0 },
  { id: 'einnahmen', name: 'Sonstige Einnahmen', icon: 'plusCircle', color: '#5c940d', kind: 'income', budget: 0 },
];

// ---------- kleine Helfer ----------

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const pad = (n) => String(n).padStart(2, '0');

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthEnd(key) {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${pad(daysInMonth(y, m))}`;
}

export function dateForDay(key, day) {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${pad(Math.min(Math.max(1, day), daysInMonth(y, m)))}`;
}

/**
 * Alle Ausführungstermine eines Auftrags zwischen from und to (inklusive).
 * interval: alle wie viele Monate (1 = monatlich, 3 = vierteljährlich, 12 = jährlich),
 * gezählt ab dem Monat von fromDate.
 */
export function occurrences(fromDate, toDate, day, interval = 1, anchor = null) {
  const out = [];
  if (!fromDate || !toDate || fromDate > toDate) return out;
  const step = Math.max(1, Number(interval) || 1);
  let key = monthKey(fromDate);
  if (anchor && step > 1) {
    // auf den Rhythmus des Ankermonats ausrichten (z. B. jährlich im März)
    const idx = (k) => { const [y, m] = k.split('-').map(Number); return y * 12 + m - 1; };
    const off = (((idx(monthKey(anchor)) - idx(key)) % step) + step) % step;
    key = addMonths(key, off);
  }
  const last = monthKey(toDate);
  for (let i = 0; i < 600 && key <= last; i++, key = addMonths(key, step)) {
    const d = dateForDay(key, day);
    if (d >= fromDate && d <= toDate) out.push(d);
  }
  return out;
}

/** Nächster Ausführungstermin ab (inklusive) einem Datum. */
export function nextOccurrence(fromDate, day) {
  let key = monthKey(fromDate);
  for (let i = 0; i < 3; i++, key = addMonths(key, 1)) {
    const d = dateForDay(key, day);
    if (d >= fromDate) return d;
  }
  return null;
}

/** Nächster Termin eines Dauerauftrags (berücksichtigt Intervall und Start). */
export function nextRuleDate(rule, fromDate) {
  const from = rule.startDate && rule.startDate > fromDate ? rule.startDate : fromDate;
  const step = Math.max(1, Number(rule.interval) || 1);
  const list = occurrences(from, monthEnd(addMonths(monthKey(from), step + 1)), rule.day, step, rule.anchorDate || rule.startDate);
  return list[0] || null;
}

export const INTERVALS = { 1: 'monatlich', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' };

export function parseAmount(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  let s = String(v).trim().replace(/\s|€/g, '');
  // "1.234,56" -> "1234.56"; "12,5" -> "12.5"; "12.50" bleibt
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "12.000" = zwölftausend
  return s === '' ? NaN : Number(s);
}

// ---------- Datenmodell ----------

export function createInitialData(today = todayStr()) {
  return normalizeData({
    version: SCHEMA_VERSION,
    createdAt: today,
    setupDone: false,
    accounts: [
      { id: 'giro', name: 'Girokonto', type: 'bank', icon: 'bank', startBalance: 0, startDate: today },
      { id: 'cash', name: 'Bargeld', type: 'cash', icon: 'wallet', startBalance: 0, startDate: today },
      { id: 'splitwise', name: 'Splitwise', type: 'splitwise', icon: 'users', startBalance: null, startDate: today },
    ],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    transactions: [],
    recurring: [],
    depot: { holdings: [], trades: [] },
    splitwise: { since: today },
  });
}

/** Ergänzt fehlende Felder (z. B. nach Import älterer Backups). */
export function normalizeData(d) {
  d.version = d.version || SCHEMA_VERSION;
  d.accounts = d.accounts || [];
  d.categories = d.categories || DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  for (const c of DEFAULT_CATEGORIES) {
    if (!d.categories.some((x) => x.id === c.id)) d.categories.push({ ...c });
  }
  d.transactions = d.transactions || [];
  d.recurring = d.recurring || [];
  d.depot = d.depot || {};
  d.depot.holdings = d.depot.holdings || [];
  d.depot.trades = d.depot.trades || [];
  d.splitwise = d.splitwise || {};
  const sw = d.splitwise;
  sw.since = sw.since || d.createdAt || todayStr();
  sw.defaultPayAccount = sw.defaultPayAccount || 'giro';
  sw.items = sw.items || [];
  sw.overrides = sw.overrides || {};
  if (!d.accounts.some((a) => a.id === 'splitwise')) {
    d.accounts.push({ id: 'splitwise', name: 'Splitwise', type: 'splitwise', icon: 'users', startBalance: null, startDate: sw.since });
  }
  // Erscheinungsbild
  d.settings = { theme: 'system', accent: 'green', iconStyle: 'color', ...(d.settings || {}) };
  // Umstellung von Emojis auf Linien-Icons (ältere Daten)
  const defIcon = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c.icon]));
  const isKey = (s) => typeof s === 'string' && /^[a-zA-Z]+$/.test(s);
  for (const c of d.categories) if (!isKey(c.icon)) c.icon = defIcon[c.id] || 'tag';
  const accIcon = { bank: 'bank', cash: 'wallet', splitwise: 'users', goal: 'piggy', insurance: 'shield' };
  for (const a of d.accounts) {
    if (!isKey(a.icon)) a.icon = accIcon[a.type] || 'tag';
    if (a.id === 'giro' && a.name === 'George Girokonto') a.name = 'Girokonto';
    if (a.type === 'goal' && !a.color) a.color = SAVINGS_COLORS[d.accounts.filter((x) => x.type === 'goal').indexOf(a) % SAVINGS_COLORS.length];
  }
  return d;
}

export const SAVINGS_COLORS = ['#2f9e6b', '#1c7ed6', '#7048e8', '#e8590c', '#0ca678', '#d6336c', '#a07c3b'];

/** Summe des George-Bereichs: Girokonto + alle Sparkonten. */
export function georgeTotal(data, bal) {
  return round2(data.accounts.filter((a) => a.type === 'bank' || a.type === 'goal').reduce((s, a) => s + (bal[a.id] || 0), 0));
}

// ---------- Rechnungen ----------

/**
 * Liest aus dem erkannten Text einer Rechnung Betrag, Datum, Geschäft und Zahlungsart.
 * Heuristisch – alle Werte werden dem Nutzer zur Kontrolle vorgeschlagen.
 */
export function parseReceiptText(text, today = todayStr()) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const amountRe = /(^|[^\d.,])(\d{1,5}(?:[.' ]\d{3})*\s?[,.]\s?\d{2})(?!\d)/g;
  const amounts = (l) => [...l.matchAll(amountRe)].map((m) => parseAmount(m[2].replace(/['\s]/g, ''))).filter((v) => v > 0 && v < 100000);
  const strong = /(summe|gesamt|total|zu zahlen|zahlbetrag|endbetrag|rechnungsbetrag|betrag)/i;
  const skip = /(mwst|ust\b|steuer|netto|r[uü]ckgeld|wechselgeld|zur[uü]ck|gegeben|rabatt|ersparnis|gespart|punkte)/i;

  let amount = null;
  for (const l of lines) {
    if (strong.test(l) && !skip.test(l)) {
      const a = amounts(l);
      if (a.length) { amount = a[a.length - 1]; break; }
    }
  }
  if (amount == null) {
    let max = 0;
    for (const l of lines) if (!skip.test(l)) for (const v of amounts(l)) if (v > max) max = v;
    amount = max || null;
  }

  let date = null;
  const validDate = (d, mo, y) => {
    const yy = y < 100 ? 2000 + y : y;
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(yy, mo)) return null;
    const ds = `${yy}-${pad(mo)}-${pad(d)}`;
    return ds <= addDays(today, 1) && ds >= addDays(today, -400) ? ds : null;
  };
  const dRe = /(\d{1,2})\s?[.,/-]\s?(\d{1,2})\s?[.,/-]\s?(\d{4}|\d{2})(?!\d)/;
  // Texterkennung liest die Punkte im Datum manchmal als Ziffer: „1341142026“ statt „13.11.2026“
  const dMisread = /(?:^|\D)(\d{2})(\d)(\d{2})\2(20\d{2})(?!\d)/;
  for (const l of lines) {
    const m = l.match(dRe);
    if (m) { date = validDate(Number(m[1]), Number(m[2]), Number(m[3])); if (date) break; }
  }
  if (!date) {
    for (const l of lines) {
      const m = l.match(dMisread);
      if (m) { date = validDate(Number(m[1]), Number(m[3]), Number(m[4])); if (date) break; }
    }
  }

  const noise = /(rechnung|beleg|kassenbon|\bbon\b|datum|uhrzeit|tel\.?|telefon|www\.|http|str\.|stra(ss|ß)e|filiale|\buid\b|atu\d|kasse|willkommen|danke)/i;
  let merchant = '';
  for (const l of lines.slice(0, 8)) {
    const letters = (l.match(/[A-Za-zÄÖÜäöüß]/g) || []).length;
    if (letters >= 3 && letters >= l.length * 0.5 && !/\d{3,}/.test(l) && !noise.test(l)) { merchant = l; break; }
  }
  merchant = merchant.replace(/^[^A-Za-zÄÖÜäöüß0-9]+|[^A-Za-zÄÖÜäöüß0-9.)]+$/g, '').slice(0, 40);
  if (merchant && merchant === merchant.toUpperCase()) {
    merchant = merchant.toLowerCase().replace(/(^|[\s&-])([a-zäöü])/g, (m, a, b) => a + b.toUpperCase());
  }

  let pay = null;
  if (/(karte|debit|maestro|visa|mastercard|kontaktlos|girocard|bankomat|apple pay|google pay|nfc)/i.test(raw)) pay = 'giro';
  else if (/(\bbar\b|gegeben|r[uü]ckgeld|wechselgeld)/i.test(raw)) pay = 'cash';

  return { amount: amount == null ? null : round2(amount), date, merchant, pay };
}

export function getAccount(data, id) {
  return data.accounts.find((a) => a.id === id) || null;
}

export function getCategory(data, id) {
  return data.categories.find((c) => c.id === id) || data.categories.find((c) => c.id === 'sonstiges');
}

export function goals(data) {
  return data.accounts.filter((a) => a.type === 'goal');
}

// ---------- Splitwise ----------

const SW_CATEGORY_MAP = [
  [/household|cleaning|groceries|lebensmittel|haushalt|supermarkt/i, 'lebensmittel'],
  [/rent|mortgage|electric|heat|gas \(heat|water|internet|tv|phone|utilit|maintenance|furniture|services|miete|strom|wohn/i, 'wohnen'],
  [/dining|restaurant|liquor|essen/i, 'essen'],
  [/fuel|gas\/fuel|parking|bus|train|taxi|car|bicycle|plane|transport/i, 'mobilitaet'],
  [/hotel|games|movies|music|sports|entertainment|vacation/i, 'freizeit'],
  [/clothing|gifts|electronics/i, 'shopping'],
  [/medical|health/i, 'gesundheit'],
];

export function mapSplitwiseCategory(name) {
  if (!name) return 'lebensmittel';
  for (const [re, id] of SW_CATEGORY_MAP) if (re.test(name)) return id;
  return 'lebensmittel'; // Splitwise wird v. a. für den Haushalt genutzt
}

/** Einfacher CSV-Leser (Komma-getrennt, Anführungszeichen, Zeilenumbrüche in Feldern). */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Liest einen Splitwise-Export („Export as spreadsheet“).
 * Spalten: Date, Description, Category, Cost, Currency, <Person 1>, <Person 2>, …
 * Personen-Spalten = Auswirkung auf den Saldo der Person (positiv = bekommt Geld).
 */
export function parseSplitwiseCSV(text) {
  const rows = parseCSV(String(text).replace(/^﻿/, ''));
  const norm = (s) => String(s || '').trim().toLowerCase();
  const hi = rows.findIndex((r) => r.map(norm).includes('date') && r.map(norm).includes('cost'));
  if (hi < 0) throw new Error('Das sieht nicht nach einem Splitwise-Export aus.');
  const head = rows[hi].map((s) => String(s).trim());
  const col = (name) => head.findIndex((h) => norm(h) === name);
  const ci = { date: col('date'), desc: col('description'), cat: col('category'), cost: col('cost'), cur: col('currency') };
  const firstPerson = Math.max(...Object.values(ci)) + 1;
  const persons = [];
  for (let i = firstPerson; i < head.length; i++) if (head[i]) persons.push({ name: head[i], col: i });
  if (!persons.length) throw new Error('Im Export fehlen die Personen-Spalten.');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const date = String(r[ci.date] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) continue; // Leerzeilen und „Total balance“
    const nets = {};
    for (const p of persons) nets[p.name] = round2(parseFloat(r[p.col]) || 0);
    out.push({
      date: date.slice(0, 10),
      description: String(r[ci.desc] || '').trim() || 'Splitwise',
      category: ci.cat >= 0 ? String(r[ci.cat] || '').trim() : '',
      cost: round2(Math.abs(parseFloat(r[ci.cost]) || 0)),
      currency: ci.cur >= 0 ? String(r[ci.cur] || '').trim().toUpperCase() || 'EUR' : 'EUR',
      nets,
    });
  }
  return { persons: persons.map((p) => p.name), rows: out };
}

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Macht aus den Export-Zeilen Einträge aus Sicht von `me`.
 * Der Export enthält nur den Saldo-Effekt (bezahlt − Anteil). Annahme: gleichmäßig geteilt;
 * passt das nicht, wird angenommen, dass eine Person alles bezahlt hat.
 * Der eigene Anteil lässt sich pro Eintrag in der App korrigieren.
 */
export function splitwiseCsvItems(parsed, me) {
  const N = parsed.persons.length;
  const seen = {};
  let total = 0;
  const items = [];
  for (const r of parsed.rows) {
    if (r.currency !== 'EUR') continue;
    const n = r.nets[me] || 0;
    total += n;
    const c = r.cost;
    const payment = /^payment$/i.test(r.category);
    let paid, owed;
    if (payment) {
      paid = Math.max(n, 0); owed = Math.max(-n, 0);
    } else {
      owed = round2(c / N); paid = round2(n + owed);
      if (paid < -0.005 || paid > c + 0.005) {
        if (n > 0) { paid = c; owed = round2(c - n); } else { paid = 0; owed = round2(-n); }
      }
      if (Math.abs(paid) < 0.005) paid = 0;
    }
    if (paid === 0 && owed === 0) continue;
    const key = `${r.date}|${c}|${n}|${r.description}`;
    seen[key] = (seen[key] || 0) + 1;
    items.push({ id: `c${hashStr(`${key}|${seen[key]}`)}`, date: r.date, description: r.description, cost: c, paid: round2(paid), owed: round2(owed), net: round2(n), payment, currency: 'EUR', category: r.category });
  }
  return { items, total: round2(total) };
}

// ---------- Hauptbuch ----------

/**
 * Liefert alle Buchungen (manuell, Daueraufträge, Splitwise, Depotkäufe) als einheitliche Liste.
 * kind: expense | income | transfer | adjust | invest
 */
export function buildLedger(data) {
  const out = [];
  for (const t of data.transactions) {
    if (t.kind === 'expense' && t.split) {
      // Geteilte Rechnung: Ausgabe = mein Anteil (über Splitwise), mein bezahlter Betrag fließt ins Splitwise-Guthaben
      const paid = round2(t.split.paid || 0);
      if (paid > 0) out.push({ ...t, id: `${t.id}~p`, kind: 'transfer', amount: paid, accountId: t.split.payAcc || null, toAccountId: 'splitwise', categoryId: null, hidden: true, parent: t.id, source: 'split' });
      out.push({ source: 'manual', ...t, accountId: 'splitwise' });
    } else out.push({ source: 'manual', ...t });
  }

  const sw = data.splitwise;
  for (const raw of sw.items) {
    if (raw.date < sw.since) continue;
    const ov = sw.overrides[raw.id] || {};
    // korrigierter eigener Anteil: Saldo-Effekt (bezahlt − Anteil) bleibt gleich
    const it = ov.owed != null && !raw.payment
      ? { ...raw, owed: ov.owed, paid: round2(raw.paid - raw.owed + ov.owed) }
      : raw;
    const payAcc = ov.payAccountId || sw.defaultPayAccount;
    const base = { date: it.date, source: 'splitwise', ref: it.id, note: it.description, sw: it };
    if (it.payment) {
      const net = round2(it.paid - it.owed);
      if (net > 0) out.push({ ...base, id: `sw-${it.id}`, kind: 'transfer', amount: net, accountId: payAcc === 'none' ? null : payAcc, toAccountId: 'splitwise', note: `Ausgleich: ${it.description}` });
      else if (net < 0) out.push({ ...base, id: `sw-${it.id}`, kind: 'transfer', amount: -net, accountId: 'splitwise', toAccountId: payAcc === 'none' ? null : payAcc, note: `Ausgleich: ${it.description}` });
      continue;
    }
    if (it.paid > 0) {
      out.push({ ...base, id: `swp-${it.id}`, kind: 'transfer', amount: it.paid, accountId: payAcc === 'none' ? null : payAcc, toAccountId: 'splitwise', hidden: true });
    }
    if (it.owed > 0) {
      out.push({ ...base, id: `sw-${it.id}`, kind: 'expense', amount: it.owed, accountId: 'splitwise', categoryId: ov.categoryId || mapSplitwiseCategory(it.category) });
    }
  }

  for (const tr of data.depot.trades) {
    const h = data.depot.holdings.find((x) => x.id === tr.holdingId);
    out.push({
      id: `tr-${tr.id}`, ref: tr.id, source: 'depot', kind: 'invest', date: tr.date,
      amount: round2((tr.amount || 0) + (tr.fee || 0)), accountId: tr.fromAccountId || null,
      note: `Kauf ${h ? h.name : 'Fonds'}`, recurringId: tr.recurringId,
    });
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function applyEntry(bal, e, startDates) {
  const ok = (acc) => acc && acc in bal && e.date >= startDates[acc];
  const amt = e.amount || 0;
  switch (e.kind) {
    case 'expense': if (ok(e.accountId)) bal[e.accountId] -= amt; break;
    case 'income': if (ok(e.accountId)) bal[e.accountId] += amt; break;
    case 'adjust': if (ok(e.accountId)) bal[e.accountId] += amt; break; // vorzeichenbehaftet
    case 'invest': if (ok(e.accountId)) bal[e.accountId] -= amt; break;
    case 'transfer':
      if (ok(e.accountId)) bal[e.accountId] -= amt;
      if (ok(e.toAccountId)) bal[e.toAccountId] += amt;
      break;
  }
}

/** Kontostände aller Konten zu einem Datum (Ende des Tages). */
export function balancesAt(data, ledger, date) {
  const bal = {};
  const starts = {};
  for (const a of data.accounts) {
    bal[a.id] = a.startDate && a.startDate <= date ? a.startBalance || 0 : 0;
    starts[a.id] = a.startDate || '0000-00-00';
  }
  for (const e of ledger) {
    if (e.date > date) break;
    applyEntry(bal, e, starts);
  }
  for (const k in bal) bal[k] = round2(bal[k]);
  return bal;
}

// ---------- Depot ----------

export function depotSummary(data, upTo = null) {
  const holdings = data.depot.holdings.map((h) => {
    const trades = data.depot.trades.filter((t) => t.holdingId === h.id && (!upTo || t.date <= upTo));
    let invested = 0, shares = 0, noShareAmount = 0;
    for (const t of trades) {
      invested += (t.amount || 0) + (t.fee || 0);
      if (t.shares > 0) shares += t.shares;
      else noShareAmount += t.amount || 0;
    }
    const value = h.price > 0 ? shares * h.price + noShareAmount : invested;
    return { holding: h, trades, invested: round2(invested), shares: Math.round(shares * 1e6) / 1e6, value: round2(value), gain: round2(value - invested) };
  });
  const invested = round2(holdings.reduce((s, x) => s + x.invested, 0));
  const value = round2(holdings.reduce((s, x) => s + x.value, 0));
  return { holdings, invested, value, gain: round2(value - invested), gainPct: invested > 0 ? (value - invested) / invested : 0 };
}

/** Setzt den Kurs eines Fonds und ergänzt geschätzte Sparplan-Käufe ohne Anteile. */
export function applyPrice(data, holdingId, price, date) {
  const h = data.depot.holdings.find((x) => x.id === holdingId);
  if (!h || !(price > 0)) return;
  h.price = price;
  h.priceDate = date;
  for (const t of data.depot.trades) {
    if (t.holdingId === h.id && t.estimated && !(t.shares > 0)) {
      t.price = price;
      t.shares = Math.round((t.amount / price) * 1e6) / 1e6;
    }
  }
}

/** Importiert einen Splitwise-Export und richtet den Splitwise-Saldo am echten Gesamtsaldo aus. */
export function importSplitwise(data, parsed, me, now = new Date()) {
  const sw = data.splitwise;
  const { items, total } = splitwiseCsvItems(parsed, me);
  sw.me = me;
  sw.items = items.filter((i) => i.date >= sw.since);
  sw.total = total;
  sw.lastImport = now.toISOString();
  const acc = getAccount(data, 'splitwise');
  acc.startDate = sw.since;
  acc.startBalance = 0;
  const derived = balancesAt(data, buildLedger(data), '9999-12-31').splitwise || 0;
  acc.startBalance = round2(total - derived);
  return { count: sw.items.length, total };
}

// ---------- Daueraufträge ----------

/** Bucht alle fälligen Daueraufträge bis heute. Gibt die Anzahl neuer Buchungen zurück. */
export function bookDueRecurring(data, today = todayStr()) {
  let created = 0;
  for (const r of data.recurring) {
    if (r.active === false) continue;
    const end = r.endDate && r.endDate < today ? r.endDate : today;
    for (const d of occurrences(r.startDate, end, r.day, r.interval || 1, r.anchorDate || r.startDate)) {
      if (r.lastBooked && d <= r.lastBooked) continue;
      if (r.kind === 'depot') {
        const h = data.depot.holdings.find((x) => x.id === r.holdingId);
        if (!h) continue;
        const price = h.price > 0 ? h.price : null;
        data.depot.trades.push({
          id: uid(), date: d, holdingId: h.id, amount: r.amount, fee: r.fee || 0,
          price, shares: price ? Math.round((r.amount / price) * 1e6) / 1e6 : null,
          fromAccountId: r.accountId || null, recurringId: r.id, estimated: true,
        });
      } else {
        data.transactions.push({
          id: uid(), date: d, kind: r.kind, amount: r.amount, accountId: r.accountId || null,
          toAccountId: r.toAccountId || null, categoryId: r.categoryId || null,
          note: r.note || '', recurringId: r.id, source: 'recurring',
          ...(r.contributor ? { contributor: r.contributor } : {}),
        });
      }
      r.lastBooked = d;
      created++;
    }
  }
  return created;
}

// ---------- Auswertungen ----------

export function monthStats(data, ledger, key) {
  const byCat = {};
  let expense = 0, income = 0;
  const entries = [];
  for (const e of ledger) {
    if (monthKey(e.date) !== key) continue;
    if (!e.hidden) entries.push(e);
    if (e.kind === 'expense') {
      expense += e.amount;
      byCat[e.categoryId] = (byCat[e.categoryId] || 0) + e.amount;
    } else if (e.kind === 'income') {
      income += e.amount;
    }
  }
  const categories = data.categories
    .filter((c) => c.kind === 'expense')
    .map((c) => ({ category: c, spent: round2(byCat[c.id] || 0), budget: c.budget || 0 }))
    .filter((x) => x.spent > 0 || x.budget > 0)
    .sort((a, b) => b.spent - a.spent || b.budget - a.budget);
  const budgetTotal = round2(data.categories.filter((c) => c.kind === 'expense').reduce((s, c) => s + (c.budget || 0), 0));
  return { expense: round2(expense), income: round2(income), net: round2(income - expense), categories, budgetTotal, entries: entries.reverse() };
}

/** Summe, die in die Vermögensübersicht einfließt (ohne Depot). Bei geteilten Sparkonten zählt nur dein Anteil. */
export function liquidTotal(data, bal, ledger = null, date = null) {
  return round2(data.accounts.reduce((s, a) => {
    if (a.type === 'goal' && a.shared && ledger) return s + goalOwnership(data, ledger, a, date || todayStr()).mine;
    return s + (bal[a.id] || 0);
  }, 0));
}

/**
 * Wem gehört wie viel auf einem Sparkonto? Startanteil + eigene Einzahlungen − Entnahmen;
 * Einzahlungen anderer (mit „contributor“) zählen für sie. Zinsen/Korrekturen anteilig.
 */
export function goalOwnership(data, ledger, goal, date = todayStr()) {
  const start = goal.startBalance || 0;
  let mine = goal.shared ? (goal.myStartShare ?? start) : start;
  let others = start - mine;
  const byPerson = {};
  if (goal.shared && others) byPerson['Andere (Startguthaben)'] = round2(others);
  for (const e of ledger) {
    if (e.date > date) break;
    if (e.date < (goal.startDate || '')) continue;
    const amt = e.amount || 0;
    const into = e.toAccountId === goal.id || ((e.kind === 'income' || e.kind === 'adjust') && e.accountId === goal.id);
    if (e.kind === 'adjust' && e.accountId === goal.id) {
      const tot = mine + others;
      if (goal.shared && tot > 0) { const r = mine / tot; mine += amt * r; others += amt * (1 - r); } else mine += amt;
      continue;
    }
    if (into) {
      if (e.contributor && goal.shared) { others += amt; byPerson[e.contributor] = round2((byPerson[e.contributor] || 0) + amt); } else mine += amt;
    } else if (e.accountId === goal.id && (e.kind === 'transfer' || e.kind === 'expense' || e.kind === 'invest')) {
      mine -= amt;
    }
  }
  return { total: round2(mine + others), mine: round2(mine), others: round2(others), byPerson };
}

/** Vermögensverlauf: ein Punkt pro Monatsende (aktueller Monat = heute). */
export function netWorthSeries(data, ledger, today = todayStr(), months = 12) {
  const earliest = data.accounts.reduce((m, a) => (a.startDate && a.startDate < m ? a.startDate : m), today);
  let key = monthKey(earliest);
  const minKey = addMonths(monthKey(today), -(months - 1));
  if (key < minKey) key = minKey;
  const pts = [];
  for (; key <= monthKey(today); key = addMonths(key, 1)) {
    const date = monthEnd(key) < today ? monthEnd(key) : today;
    const bal = balancesAt(data, ledger, date);
    const depot = date === today ? depotSummary(data).value : depotSummary(data, date).invested;
    pts.push({ month: key, date, value: round2(liquidTotal(data, bal, ledger, date) + depot) });
  }
  return pts;
}

/** Monatliche Sparrate eines Ziels (Summe aktiver Daueraufträge auf das Ziel). */
export function goalMonthlyRate(data, goalId, who = 'all') {
  return round2(data.recurring
    .filter((r) => r.active !== false && r.kind === 'transfer' && r.toAccountId === goalId)
    .filter((r) => (who === 'me' ? !r.contributor : who === 'others' ? !!r.contributor : true))
    .reduce((s, r) => s + r.amount / (r.interval || 1), 0));
}

export function goalProjection(data, goal, current, today = todayStr()) {
  const rate = goalMonthlyRate(data, goal.id);
  if (!goal.target || goal.target <= 0) return { rate, done: false, monthsLeft: null, date: null };
  if (current >= goal.target) return { rate, done: true, monthsLeft: 0, date: today };
  if (rate <= 0) return { rate, done: false, monthsLeft: null, date: null };
  const monthsLeft = Math.ceil((goal.target - current) / rate);
  return { rate, done: false, monthsLeft, date: addMonths(monthKey(today), monthsLeft) };
}

/** Erzeugt eine Ausgleichsbuchung, damit der App-Stand dem tatsächlichen Stand entspricht. */
export function makeReconcileEntry(data, ledger, accountId, actual, today = todayStr()) {
  const acc = getAccount(data, accountId);
  const cur = balancesAt(data, ledger, today)[accountId] || 0;
  const diff = round2(actual - cur);
  if (Math.abs(diff) < 0.005) return null;
  const base = { id: uid(), date: today, accountId, source: 'reconcile' };
  if (acc.type === 'cash') {
    return diff < 0
      ? { ...base, kind: 'expense', amount: -diff, categoryId: 'bar', note: 'Bargeld gezählt' }
      : { ...base, kind: 'income', amount: diff, categoryId: 'einnahmen', note: 'Bargeld gezählt' };
  }
  if (acc.type === 'bank') {
    return diff < 0
      ? { ...base, kind: 'expense', amount: -diff, categoryId: 'sonstiges', note: 'Kontoabgleich' }
      : { ...base, kind: 'income', amount: diff, categoryId: 'einnahmen', note: 'Kontoabgleich' };
  }
  return { ...base, kind: 'adjust', amount: diff, note: 'Stand korrigiert' };
}
