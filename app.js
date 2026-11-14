import * as C from './core.js';
import * as R from './receipts.js';
import { icon, ICON_CHOICES, hasIcon } from './icons.js';

// Alle Daten bleiben auf diesem Gerät (localStorage + IndexedDB für Fotos). Kein Server, keine Cloud.

// ============================================================
// Helfer
// ============================================================

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const money = (n) => EUR.format(Math.abs(n) < 0.005 ? 0 : n || 0);
const signed = (n) => (n > 0.004 ? '+' : '') + money(n);
const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const shortDate = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '');
function dayLabel(d) {
  const today = C.todayStr();
  if (d === today) return 'Heute';
  if (d === C.addDays(today, -1)) return 'Gestern';
  const [y, m, dd] = d.split('-').map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, dd).getDay()];
  return `${wd}, ${dd}. ${MONTHS[m - 1]}${y !== Number(today.slice(0, 4)) ? ' ' + y : ''}`;
}
const pct = (x) => new Intl.NumberFormat('de-AT', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(x);
const pctPlain = (x) => new Intl.NumberFormat('de-AT', { style: 'percent', maximumFractionDigits: 0 }).format(x);
const amountStr = (n) => (n || n === 0 ? String(C.round2(n)).replace('.', ',') : '');
const daysSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 86400000 : Infinity);

const LS = { data: 'fin.data', lastAcc: 'fin.lastAcc' };
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

const ACCENTS = {
  green: { name: 'Grün', light: '#1f7a5c', dark: '#3ccf96' },
  blue: { name: 'Blau', light: '#0b63c5', dark: '#5aa9ff' },
  indigo: { name: 'Indigo', light: '#4c46d6', dark: '#8f8bff' },
  violet: { name: 'Violett', light: '#7a35d8', dark: '#b993ff' },
  orange: { name: 'Orange', light: '#c4480f', dark: '#ff9d5c' },
  graphite: { name: 'Graphit', light: '#3d4450', dark: '#c9ced6' },
};
const ACC_COLORS = { bank: '#1c7ed6', cash: '#a07c3b', splitwise: '#0ca678', depot: '#7048e8', neutral: '#868e96' };

// ============================================================
// Zustand & Speicherung
// ============================================================

const S = {
  data: null,
  _ledger: null,
  pendingCsv: null,
  pendingReceipt: null,
  scanToken: null,
  urls: new Map(),
  ui: { tab: 'home', month: C.monthKey(C.todayStr()), catFilter: null, georgeOpen: false },
};

function ledger() {
  if (!S._ledger) S._ledger = C.buildLedger(S.data);
  return S._ledger;
}

/** Nach jeder Änderung aufrufen: speichert auf dem Gerät und zeichnet neu. */
function commit(message) {
  S._ledger = null;
  const ok = ls.set(LS.data, JSON.stringify(S.data));
  render();
  if (!ok) toast('Speichern fehlgeschlagen – ist Safari im privaten Modus?');
  else if (message) toast(message);
}

// ============================================================
// Erscheinungsbild
// ============================================================

const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function applyAppearance() {
  const s = S.data.settings;
  const root = document.documentElement;
  if (s.theme === 'light' || s.theme === 'dark') root.dataset.theme = s.theme; else delete root.dataset.theme;
  const dark = s.theme === 'dark' || (s.theme !== 'light' && darkQuery && darkQuery.matches);
  const a = ACCENTS[s.accent] || ACCENTS.green;
  const c = dark ? a.dark : a.light;
  root.style.setProperty('--accent', c);
  root.style.setProperty('--accent-soft', hexToRgba(c, dark ? 0.18 : 0.11));
  root.style.setProperty('--on-accent', dark ? '#0b0b0d' : '#ffffff');
  document.body.classList.remove('icons-color', 'icons-accent', 'icons-mono');
  document.body.classList.add(`icons-${s.iconStyle || 'color'}`);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = dark ? '#000000' : '#f2f2f7'; });
}

// ============================================================
// Bausteine
// ============================================================

const ico = (name, color, cls = '') => `<div class="ico ${cls}" style="--c:${color || 'var(--accent)'}">${icon(name)}</div>`;
const catIco = (cat) => ico(cat.icon, cat.color);
const mini = (name) => `<span class="mini">${icon(name)}</span>`;
const chevron = (cls = '') => `<span class="chev ${cls}">${icon('chevronRight')}</span>`;

function accColor(a) {
  if (!a) return ACC_COLORS.neutral;
  return a.type === 'goal' ? a.color || '#2f9e6b' : ACC_COLORS[a.type] || ACC_COLORS.neutral;
}
const accIco = (a, cls = '') => ico(a.icon, accColor(a), cls);

function head(title) {
  return `<div class="page-head"><h1>${title}</h1><span class="badge">${icon('lock')}Nur auf diesem Gerät</span></div>`;
}

function acctName(id) {
  if (!id) return 'Anderes Konto';
  if (id === 'depot') return 'Depot';
  const a = C.getAccount(S.data, id);
  if (!a) return 'Gelöschtes Konto';
  return a.type === 'goal' ? `Sparkonto ${a.name}` : a.name;
}

function entryRow(e) {
  let ic = '', title = '', amt = 0, cls = '';
  const sub = [];
  if (e.kind === 'expense' || e.kind === 'income') {
    const cat = C.getCategory(S.data, e.categoryId);
    ic = catIco(cat);
    title = e.note || cat.name;
    if (e.note) sub.push(esc(cat.name));
    amt = e.kind === 'expense' ? -e.amount : e.amount;
    cls = e.kind === 'income' ? 'pos' : '';
    if (e.source === 'splitwise') {
      const ov = S.data.splitwise.overrides[e.ref] || {};
      const paid = ov.owed != null ? C.round2(e.sw.paid - e.sw.owed + ov.owed) : e.sw.paid;
      sub.push(esc(paid > 0 ? `Splitwise · du hast ${money(paid)} bezahlt` : `Splitwise · dein Anteil an ${money(e.sw.cost)}`));
    } else sub.push(esc(e.accountId === 'cash' ? 'Bar' : acctName(e.accountId)));
  } else if (e.kind === 'transfer') {
    const to = C.getAccount(S.data, e.toAccountId);
    ic = to && to.type === 'goal' ? accIco(to) : ico('swap', ACC_COLORS.neutral);
    title = e.note || 'Umbuchung';
    sub.push(esc(`${acctName(e.accountId)} → ${acctName(e.toAccountId)}`));
    amt = e.amount;
    cls = 'muted';
  } else if (e.kind === 'invest') {
    ic = ico('trend', ACC_COLORS.depot);
    title = e.note;
    sub.push(esc(`${acctName(e.accountId)} → Depot`));
    amt = e.amount;
    cls = 'muted';
  } else if (e.kind === 'adjust') {
    ic = ico('sliders', ACC_COLORS.neutral);
    title = e.note || 'Korrektur';
    sub.push(esc(acctName(e.accountId)));
    amt = e.amount;
  }
  const marks = `${e.recurringId ? mini('repeat') : ''}${e.receiptId ? mini('receipt') : ''}`;
  const amtStr = e.kind === 'transfer' || e.kind === 'invest' ? money(amt) : signed(amt);
  return `<button class="row tap" data-action="openEntry" data-id="${esc(e.id)}">
    ${ic}
    <div class="main"><div class="title">${esc(title)}</div><div class="sub">${marks}${sub.join(' · ')}</div></div>
    <div class="end num ${cls}">${amtStr}</div></button>`;
}

function entryList(entries, emptyText = 'Noch keine Buchungen') {
  if (!entries.length) return `<div class="card"><div class="empty">${emptyText}</div></div>`;
  let html = '<div class="card">';
  let day = null;
  for (const e of entries) {
    if (e.date !== day) { day = e.date; html += `<div class="day-head">${dayLabel(day)}</div>`; }
    html += entryRow(e);
  }
  return html + '</div>';
}

function progressBar(value, max, color) {
  const r = max > 0 ? value / max : 0;
  const cls = color ? '' : r > 1 ? 'over' : r >= 0.85 ? 'warn' : '';
  return `<div class="bar ${cls}"><i style="width:${Math.min(100, Math.max(0, r * 100)).toFixed(1)}%${color ? `;background:${color}` : ''}"></i></div>`;
}

function lineChart(points) {
  if (points.length < 2) return '';
  const W = 320, H = 140, P = 6;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1) { max += 1; min -= 1; }
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v) => H - P - ((v - min) * (H - 2 * P)) / (max - min);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Vermögensverlauf">
    <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0.28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#g)"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
  </svg>
  <div class="chart-labels"><span>${monthLabel(points[0].month)}</span><span>Heute</span></div></div>`;
}

function chips(name, options, selected) {
  return `<div class="chips">${options.map((o) => `<label><input type="radio" name="${name}" value="${esc(o.value)}" ${o.value === selected ? 'checked' : ''}><span>${o.icon ? `<span class="chip-ico" style="--c:${o.color || 'var(--accent)'}">${icon(o.icon)}</span>` : ''}${esc(o.label)}</span></label>`).join('')}</div>`;
}

function select(name, options, selected) {
  return `<select name="${name}">${options.map((o) => `<option value="${esc(o.value)}" ${o.value === selected ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
}

function iconPicker(name, selected, color) {
  return `<div class="icon-grid" style="--c:${color || 'var(--accent)'}">${ICON_CHOICES.map((k) => `<label><input type="radio" name="${name}" value="${k}" ${k === selected ? 'checked' : ''}><span>${icon(k)}</span></label>`).join('')}</div>`;
}

const catOptions = (kind) => S.data.categories.filter((c) => c.kind === kind).map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }));
const payAccounts = () => S.data.accounts.filter((a) => a.type === 'bank' || a.type === 'cash').map((a) => ({ value: a.id, label: a.name }));
const payChoices = () => [{ value: 'giro', label: 'Karte / Konto', icon: 'bank', color: ACC_COLORS.bank }, { value: 'cash', label: 'Bar', icon: 'banknote', color: ACC_COLORS.cash }];
const allAccounts = () => S.data.accounts.filter((a) => a.type !== 'splitwise').map((a) => ({ value: a.id, label: acctName(a.id) }));

function hasContent() {
  const d = S.data;
  return d.transactions.length > 0 || C.goals(d).length > 0 || d.recurring.length > 0 || !!(d.setup && d.setup.giro);
}

function urlFor(key, blob) {
  if (!S.urls.has(key)) S.urls.set(key, URL.createObjectURL(blob));
  return S.urls.get(key);
}

// ============================================================
// Ansichten
// ============================================================

function render() {
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.ui.tab));
  const views = { home: viewHome, spending: viewSpending, goals: viewGoals, depot: viewDepot, more: viewMore };
  $('#view').innerHTML = views[S.ui.tab]();
}

function setupItems() {
  const d = S.data;
  const f = d.setup || {};
  return [
    { label: 'Kontostand Girokonto eintragen', done: !!f.giro, action: 'setupAccount', id: 'giro' },
    { label: 'Sparkonten mit Dauerauftrag anlegen', done: C.goals(d).length > 0, action: 'newGoal' },
    { label: 'Bargeld zählen und eintragen', done: !!f.cash, action: 'setupAccount', id: 'cash' },
    { label: 'Gehalt & Fixkosten anlegen', done: d.recurring.some((r) => r.kind === 'income' || r.kind === 'expense'), action: 'newRecurring' },
    { label: 'Monatsbudgets festlegen', done: d.categories.some((c) => c.budget > 0), action: 'openCategories' },
    { label: 'Splitwise-Export importieren', done: !!d.splitwise.lastImport, action: 'openSplitwise' },
  ];
}

function georgeSection(bal) {
  const d = S.data;
  const giro = C.getAccount(d, 'giro');
  const gs = C.goals(d);
  const total = C.georgeTotal(d, bal);
  const open = S.ui.georgeOpen;
  let html = `<button class="row tap" data-action="toggleGeorge" aria-expanded="${open}">
    ${ico('bank', ACC_COLORS.bank)}
    <div class="main"><div class="title">George</div><div class="sub">Giro${gs.length ? ` + ${gs.length} ${gs.length === 1 ? 'Sparkonto' : 'Sparkonten'}` : ''}</div></div>
    <div class="end num">${money(total)}</div>${chevron(open ? 'open' : 'down')}</button>`;
  if (!open) return html;
  const parts = [giro, ...gs].map((a) => ({ a, v: bal[a.id] || 0 }));
  const pos = parts.reduce((s, p) => s + Math.max(0, p.v), 0);
  html += '<div class="drop">';
  if (pos > 0) {
    html += `<div class="dist">${parts.filter((p) => p.v > 0).map((p) => `<i style="width:${((p.v / pos) * 100).toFixed(2)}%;background:${accColor(p.a)}" title="${esc(p.a.name)}"></i>`).join('')}</div>`;
  }
  for (const p of parts) {
    const share = pos > 0 && p.v > 0 ? pctPlain(p.v / pos) : '';
    let sub;
    if (p.a.type === 'bank') sub = 'Tageskonto';
    else {
      const rate = C.goalMonthlyRate(d, p.a.id);
      sub = [rate > 0 ? `+${money(rate)}/Monat` : 'Kein Dauerauftrag', p.a.target > 0 ? `Ziel ${money(p.a.target)}` : null].filter(Boolean).join(' · ');
    }
    html += `<button class="row tap sub-row" data-action="${p.a.type === 'bank' ? 'openAccount' : 'openSavings'}" data-id="${p.a.id}">
      ${accIco(p.a, 'sm')}
      <div class="main"><div class="title">${esc(p.a.name)}</div><div class="sub">${esc(sub)}</div></div>
      <div class="end"><div class="num">${money(p.v)}</div>${share ? `<div class="sub">${share}</div>` : ''}</div>${chevron()}</button>`;
  }
  html += `<button class="row tap sub-row add-row" data-action="newGoal">${ico('plus', 'var(--accent)', 'sm')}<div class="main"><div class="title accent">Sparkonto hinzufügen</div></div></button>`;
  return html + '</div>';
}

function viewHome() {
  const d = S.data;
  const today = C.todayStr();
  const L = ledger();
  const bal = C.balancesAt(d, L, today);
  const dep = C.depotSummary(d);
  const total = C.round2(C.liquidTotal(d, bal) + dep.value);
  const series = C.netWorthSeries(d, L, today);
  const prev = series.length >= 2 ? series[series.length - 2].value : null;

  let html = head('Übersicht');

  if (hasContent() && daysSince(d.lastBackup) > 30) {
    html += `<div class="callout warn row-callout">${icon('save')}<div style="flex:1"><b>Zeit für ein Backup.</b> Deine Daten liegen nur auf diesem iPhone${d.lastBackup ? ` – letztes Backup am ${shortDate(d.lastBackup.slice(0, 10))}` : ''}.</div><button class="btn secondary small-btn" data-action="exportData">Sichern</button></div>`;
  }

  if (!d.setupDone) {
    const items = setupItems();
    const n = items.filter((i) => i.done).length;
    html += `<div class="section-title">Einrichtung · ${n} von ${items.length}<button data-action="hideSetup">Ausblenden</button></div>
      <div class="card setup">${items.map((i) => `<button class="row tap" data-action="${i.action}" ${i.id ? `data-id="${i.id}"` : ''}>
        <span class="check ${i.done ? 'done' : ''}">${i.done ? icon('check') : ''}</span><div class="main"><div class="title">${i.label}</div></div>${chevron()}</button>`).join('')}</div>`;
  }

  html += `<div class="card"><div class="hero"><div class="label">Gesamtvermögen</div>
    <div class="big num">${money(total)}</div>
    ${prev != null ? `<div class="delta ${total - prev >= 0 ? 'pos' : 'neg'}">${signed(C.round2(total - prev))} <span class="muted">seit Ende ${MONTHS[Number(series[series.length - 2].month.slice(5)) - 1]}</span></div>` : '<div class="delta muted">Verlauf erscheint ab dem nächsten Monat</div>'}
    </div>${lineChart(series)}</div>`;

  html += '<div class="section-title">Konten</div><div class="card">';
  html += georgeSection(bal);
  const cash = C.getAccount(d, 'cash');
  html += `<button class="row tap" data-action="openAccount" data-id="cash">${accIco(cash)}
    <div class="main"><div class="title">Bargeld</div><div class="sub">Tippen zum Nachzählen</div></div>
    <div class="end num">${money(bal.cash)}</div>${chevron()}</button>`;
  const swBal = bal.splitwise || 0;
  const sw = d.splitwise;
  const swSub = !sw.lastImport ? 'Noch nicht importiert'
    : `${Math.abs(swBal) < 0.005 ? 'Ausgeglichen' : swBal > 0 ? 'Man schuldet dir' : 'Du schuldest'} · Stand ${shortDate(sw.lastImport.slice(0, 10))}`;
  html += `<button class="row tap" data-action="openSplitwise">${ico('users', ACC_COLORS.splitwise)}
    <div class="main"><div class="title">Splitwise</div><div class="sub">${swSub}</div></div>
    <div class="end num ${swBal < 0 ? 'neg' : ''}">${money(swBal)}</div>${chevron()}</button>`;
  if (d.depot.holdings.length) {
    html += `<button class="row tap" data-tab="depot">${ico('trend', ACC_COLORS.depot)}
      <div class="main"><div class="title">Depot</div><div class="sub ${dep.gain >= 0 ? 'pos' : 'neg'}">${signed(dep.gain)} (${pct(dep.gainPct)})</div></div>
      <div class="end num">${money(dep.value)}</div>${chevron()}</button>`;
  }
  html += '</div>';

  const ms = C.monthStats(d, L, C.monthKey(today));
  html += `<div class="section-title">${monthLabel(C.monthKey(today))}<button data-tab="spending">Details</button></div><div class="card">`;
  if (ms.budgetTotal > 0) {
    const left = C.round2(ms.budgetTotal - ms.expense);
    html += `<div class="card-pad"><div class="split"><strong class="num">${money(ms.expense)}</strong><span class="small muted">von ${money(ms.budgetTotal)} Budget</span></div>
      ${progressBar(ms.expense, ms.budgetTotal)}
      <div class="small ${left < 0 ? 'neg' : 'muted'}" style="margin-top:8px">${left >= 0 ? `Noch ${money(left)} übrig` : `${money(-left)} über dem Budget`}</div></div>`;
  } else {
    html += `<div class="stats"><div><div class="k">Einnahmen</div><div class="v pos">${money(ms.income)}</div></div><div><div class="k">Ausgaben</div><div class="v">${money(ms.expense)}</div></div><div><div class="k">Saldo</div><div class="v ${ms.net < 0 ? 'neg' : ''}">${signed(ms.net)}</div></div></div>`;
  }
  for (const c of ms.categories.filter((x) => x.budget > 0 && x.spent > x.budget)) {
    html += `<div class="row plain warn-line">${icon('alert')}<div class="main small">${esc(c.category.name)}: ${money(c.spent - c.budget)} über dem Budget</div></div>`;
  }
  html += '</div>';

  const recent = L.filter((e) => !e.hidden && e.date <= today).slice(-8).reverse();
  html += '<div class="section-title">Letzte Buchungen</div>';
  html += entryList(recent, 'Noch keine Buchungen.<br>Tippe auf <b>+</b>, um eine Ausgabe einzutragen oder eine Rechnung zu scannen.');
  return html;
}

function viewSpending() {
  const d = S.data;
  const key = S.ui.month;
  const ms = C.monthStats(d, ledger(), key);
  const isCurrent = key === C.monthKey(C.todayStr());
  let html = head('Ausgaben');
  html += `<div class="month-nav"><button data-action="month" data-d="-1" aria-label="Voriger Monat">${icon('chevronLeft')}</button><strong>${monthLabel(key)}</strong><button data-action="month" data-d="1" aria-label="Nächster Monat" ${isCurrent ? 'disabled' : ''}>${icon('chevronRight')}</button></div>`;
  html += `<div class="card"><div class="stats"><div><div class="k">Einnahmen</div><div class="v pos">${money(ms.income)}</div></div><div><div class="k">Ausgaben</div><div class="v">${money(ms.expense)}</div></div><div><div class="k">Übrig</div><div class="v ${ms.net < 0 ? 'neg' : ''}">${signed(ms.net)}</div></div></div></div>`;

  html += '<div class="section-title">Kategorien & Budgets<button data-action="openCategories">Bearbeiten</button></div><div class="card">';
  if (ms.budgetTotal > 0) {
    html += `<div class="row plain budget-row"><div class="main"><div class="title">Gesamt</div><div class="sub">${money(ms.expense)} von ${money(ms.budgetTotal)}</div>${progressBar(ms.expense, ms.budgetTotal)}</div></div>`;
  }
  if (!ms.categories.length) html += '<div class="empty">Keine Ausgaben in diesem Monat.</div>';
  for (const x of ms.categories) {
    const left = C.round2(x.budget - x.spent);
    const active = S.ui.catFilter === x.category.id;
    html += `<button class="row tap budget-row ${active ? 'active' : ''}" data-action="filterCat" data-id="${x.category.id}">
      ${catIco(x.category)}
      <div class="main"><div class="title">${esc(x.category.name)}</div>
        <div class="sub">${x.budget > 0 ? `${money(x.spent)} von ${money(x.budget)}` : 'kein Budget'}</div>
        ${x.budget > 0 ? progressBar(x.spent, x.budget) : ''}</div>
      <div class="end"><div class="num">${money(x.spent)}</div>${x.budget > 0 ? `<div class="sub ${left < 0 ? 'neg' : ''}">${left >= 0 ? `noch ${money(left)}` : `${money(-left)} drüber`}</div>` : ''}</div></button>`;
  }
  html += '</div>';

  let entries = ms.entries;
  let title = 'Buchungen';
  if (S.ui.catFilter) {
    const c = C.getCategory(d, S.ui.catFilter);
    entries = entries.filter((e) => e.categoryId === S.ui.catFilter && (e.kind === 'expense' || e.kind === 'income'));
    title = esc(c.name);
  }
  html += `<div class="section-title">${title}${S.ui.catFilter ? '<button data-action="filterCat" data-id="">Alle zeigen</button>' : ''}</div>`;
  html += entryList(entries, 'Keine Buchungen in diesem Monat.');
  return html;
}

function savingsRow(g, bal) {
  const d = S.data;
  const cur = bal[g.id] || 0;
  const p = C.goalProjection(d, g, cur);
  const rule = d.recurring.find((r) => r.kind === 'transfer' && r.toAccountId === g.id && r.active !== false);
  let sub = rule ? `${money(rule.amount)} am ${rule.day}. jedes Monats` : 'Kein Dauerauftrag';
  if (p.done) sub = 'Ziel erreicht';
  else if (p.date) sub += ` · Ziel ca. ${monthLabel(p.date)}`;
  return `<button class="row tap budget-row" data-action="openSavings" data-id="${g.id}">${accIco(g)}
    <div class="main"><div class="title">${esc(g.name)}</div><div class="sub">${p.done ? mini('check') : ''}${esc(sub)}</div>${g.target > 0 ? progressBar(cur, g.target, accColor(g)) : ''}</div>
    <div class="end"><div class="num">${money(cur)}</div>${g.target > 0 ? `<div class="sub">von ${money(g.target)}</div>` : ''}</div></button>`;
}

function viewGoals() {
  const d = S.data;
  const bal = C.balancesAt(d, ledger(), C.todayStr());
  const gs = C.goals(d);
  let html = head('Sparkonten');
  if (!gs.length) {
    return html + `<div class="card"><div class="empty"><div class="em">${icon('piggy')}</div><strong>Noch keine Sparkonten</strong>
      <p>Leg deine George-Sparkonten an: aktuelles Guthaben, optional ein Sparziel und die monatliche Rate deines Dauerauftrags vom Girokonto. Die App bucht die Rate dann jeden Monat automatisch um.</p>
      <button class="btn" data-action="newGoal">Sparkonto anlegen</button></div></div>`;
  }
  const total = C.round2(gs.reduce((s, g) => s + (bal[g.id] || 0), 0));
  const rateTotal = C.round2(gs.reduce((s, g) => s + C.goalMonthlyRate(d, g.id), 0));
  html += `<div class="card"><div class="hero" style="padding-bottom:16px"><div class="label">Gespart auf ${gs.length} ${gs.length === 1 ? 'Sparkonto' : 'Sparkonten'}</div><div class="big num">${money(total)}</div>
    <div class="delta muted">${money(rateTotal)} pro Monat per Dauerauftrag vom Girokonto</div></div></div>`;
  html += `<div class="card">${gs.map((g) => savingsRow(g, bal)).join('')}</div>`;
  html += `<button class="btn secondary block" data-action="newGoal">${icon('plus')}Sparkonto hinzufügen</button>`;
  return html;
}

function viewDepot() {
  const d = S.data;
  let html = head('Depot');
  if (!d.depot.holdings.length) {
    return html + `<div class="card"><div class="empty"><div class="em">${icon('trend')}</div><strong>Noch keine Fonds</strong>
      <p>Sobald du bei Flatex startest, lege hier deinen Fonds oder ETF mit Sparplan an. Die App bucht dann jeden Monat die Sparrate vom Girokonto und zeigt dir deine Rendite.</p>
      <button class="btn" data-action="newHolding">Fonds hinzufügen</button></div></div>`;
  }
  const dep = C.depotSummary(d);
  html += `<div class="card"><div class="hero" style="padding-bottom:6px"><div class="label">Depotwert</div><div class="big num">${money(dep.value)}</div>
    <div class="delta ${dep.gain >= 0 ? 'pos' : 'neg'}">${signed(dep.gain)} (${pct(dep.gainPct)}) <span class="muted">· eingezahlt ${money(dep.invested)}</span></div></div>
    <div class="btn-row" style="padding:0 16px 16px;margin-top:10px"><button class="btn secondary" data-action="openPrices">Kurse eintragen</button><button class="btn secondary" data-action="newTrade">Kauf eintragen</button></div></div>`;

  html += '<div class="section-title">Fonds<button data-action="newHolding">Hinzufügen</button></div><div class="card">';
  for (const x of dep.holdings) {
    const h = x.holding;
    const plan = d.recurring.find((r) => r.kind === 'depot' && r.holdingId === h.id && r.active !== false);
    const sub = [
      x.shares ? `${x.shares.toLocaleString('de-AT', { maximumFractionDigits: 4 })} Anteile` : null,
      h.price ? `Kurs ${money(h.price)}${h.priceDate ? ` (${shortDate(h.priceDate)})` : ''}` : 'Kurs fehlt',
      plan ? `Sparplan ${money(plan.amount)}/Monat` : null,
    ].filter(Boolean).join(' · ');
    html += `<button class="row tap" data-action="openHolding" data-id="${h.id}">${ico('trend', ACC_COLORS.depot)}
      <div class="main"><div class="title">${esc(h.name)}</div><div class="sub">${esc(sub)}</div></div>
      <div class="end"><div class="num">${money(x.value)}</div><div class="sub ${x.gain >= 0 ? 'pos' : 'neg'}">${signed(x.gain)}</div></div></button>`;
  }
  html += '</div>';

  const trades = [...d.depot.trades].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
  if (trades.some((t) => t.estimated)) {
    html += `<div class="callout warn row-callout" style="margin-top:14px">${icon('info')}<div>Automatisch gebuchte Sparplan-Käufe sind geschätzt. Tippe sie an und trag Kurs und Anteile aus der Flatex-Abrechnung ein, damit die Rendite stimmt.</div></div>`;
  }
  html += '<div class="section-title">Käufe</div>';
  if (!trades.length) html += '<div class="card"><div class="empty">Noch keine Käufe.</div></div>';
  else {
    html += '<div class="card">';
    for (const t of trades) {
      const h = d.depot.holdings.find((x) => x.id === t.holdingId);
      html += `<button class="row tap" data-action="openEntry" data-id="tr-${t.id}">${t.estimated ? ico('clock', '#d98a00') : ico('check', '#2f9e6b')}
        <div class="main"><div class="title">${esc(h ? h.name : 'Fonds')}</div><div class="sub">${shortDate(t.date)}${t.shares ? ` · ${t.shares.toLocaleString('de-AT', { maximumFractionDigits: 4 })} Anteile` : ''}${t.estimated ? ' · geschätzt' : ''}</div></div>
        <div class="end num">${money(t.amount + (t.fee || 0))}</div></button>`;
    }
    html += '</div>';
  }
  return html;
}

function recurringLabel(r) {
  if (r.kind === 'depot') {
    const h = S.data.depot.holdings.find((x) => x.id === r.holdingId);
    return { ic: ico('trend', ACC_COLORS.depot), title: `Sparplan ${h ? h.name : ''}`, sub: `${acctName(r.accountId)} → Depot` };
  }
  if (r.kind === 'transfer') {
    const to = C.getAccount(S.data, r.toAccountId);
    return { ic: to?.type === 'goal' ? accIco(to) : ico('swap', ACC_COLORS.neutral), title: r.note || 'Umbuchung', sub: `${acctName(r.accountId)} → ${acctName(r.toAccountId)}` };
  }
  const cat = C.getCategory(S.data, r.categoryId);
  return { ic: catIco(cat), title: r.note || cat.name, sub: `${cat.name} · ${acctName(r.accountId)}` };
}

function viewMore() {
  const d = S.data;
  const bal = C.balancesAt(d, ledger(), C.todayStr());
  let html = head('Mehr');

  html += '<div class="section-title">Konten</div><div class="card">';
  const giro = C.getAccount(d, 'giro');
  html += `<button class="row tap" data-action="openAccount" data-id="giro">${accIco(giro)}<div class="main"><div class="title">George · Girokonto</div><div class="sub">Startstand ${money(giro.startBalance)} am ${shortDate(giro.startDate)}</div></div><div class="end num">${money(bal.giro)}</div>${chevron()}</button>`;
  for (const g of C.goals(d)) {
    html += `<button class="row tap" data-action="openSavings" data-id="${g.id}">${accIco(g)}<div class="main"><div class="title">George · ${esc(g.name)}</div><div class="sub">Sparkonto</div></div><div class="end num">${money(bal[g.id])}</div>${chevron()}</button>`;
  }
  const cash = C.getAccount(d, 'cash');
  html += `<button class="row tap" data-action="openAccount" data-id="cash">${accIco(cash)}<div class="main"><div class="title">Bargeld</div><div class="sub">Startstand ${money(cash.startBalance)} am ${shortDate(cash.startDate)}</div></div><div class="end num">${money(bal.cash)}</div>${chevron()}</button>`;
  html += `<button class="row tap" data-action="openSplitwise">${ico('users', ACC_COLORS.splitwise)}<div class="main"><div class="title">Splitwise</div><div class="sub">${d.splitwise.lastImport ? `Zuletzt importiert am ${shortDate(d.splitwise.lastImport.slice(0, 10))}` : 'Noch nicht importiert'}</div></div>${chevron()}</button>`;
  html += `<button class="row tap add-row" data-action="newGoal">${ico('plus', 'var(--accent)')}<div class="main"><div class="title accent">Sparkonto hinzufügen</div></div></button>`;
  html += '</div>';

  const nReceipts = d.transactions.filter((t) => t.receiptId).length;
  html += `<div class="section-title">Rechnungen</div><div class="card">
    <button class="row tap" data-action="openReceipts">${ico('receipt', 'var(--accent)')}<div class="main"><div class="title">Rechnungen</div><div class="sub">${nReceipts ? `${nReceipts} gespeichert` : 'Noch keine – scannen über +'}</div></div>${chevron()}</button>
  </div>`;

  const recs = [...d.recurring].sort((a, b) => a.day - b.day);
  html += '<div class="section-title">Daueraufträge & Fixkosten<button data-action="newRecurring">Neu</button></div><div class="card">';
  if (!recs.length) html += '<div class="empty">Gehalt, Miete, Abos, Versicherungen … einmal anlegen, dann bucht die App sie jeden Monat automatisch.</div>';
  for (const r of recs) {
    const l = recurringLabel(r);
    const amt = r.kind === 'income' ? signed(r.amount) : r.kind === 'expense' ? signed(-r.amount) : money(r.amount);
    html += `<button class="row tap ${r.active === false ? 'inactive' : ''}" data-action="openRecurring" data-id="${r.id}">${l.ic}
      <div class="main"><div class="title">${esc(l.title)}</div><div class="sub">am ${r.day}. · ${esc(l.sub)}${r.active === false ? ' · pausiert' : ''}</div></div>
      <div class="end num ${r.kind === 'income' ? 'pos' : ''}">${amt}</div></button>`;
  }
  html += '</div>';

  html += `<div class="section-title">Einstellungen & Backup</div><div class="card">
    <button class="row tap" data-action="openAppearance">${ico('palette', 'var(--accent)')}<div class="main"><div class="title">Erscheinungsbild</div><div class="sub">${{ system: 'Wie iPhone', light: 'Hell', dark: 'Dunkel' }[d.settings.theme]} · ${ACCENTS[d.settings.accent]?.name || 'Grün'}</div></div>${chevron()}</button>
    <button class="row tap" data-action="openCategories">${ico('tag', 'var(--accent)')}<div class="main"><div class="title">Kategorien & Budgets</div></div>${chevron()}</button>
    <button class="row tap" data-action="exportData">${ico('save', 'var(--accent)')}<div class="main"><div class="title">Backup sichern</div><div class="sub">${d.lastBackup ? `Zuletzt am ${shortDate(d.lastBackup.slice(0, 10))}` : 'Noch nie gesichert'} · inkl. Rechnungsfotos</div></div>${chevron()}</button>
    <label class="row tap">${ico('upload', 'var(--accent)')}<div class="main"><div class="title">Backup wiederherstellen</div><div class="sub">Ersetzt alle aktuellen Daten</div></div>${chevron()}<input type="file" accept="application/json,.json" id="importFile" hidden></label>
    ${d.setupDone ? `<button class="row tap" data-action="showSetup">${ico('check', 'var(--accent)')}<div class="main"><div class="title">Einrichtung wieder anzeigen</div></div>${chevron()}</button>` : ''}
  </div>`;
  html += '<p class="small muted footnote">Deine Daten und Rechnungsfotos liegen nur auf diesem Gerät und werden nirgendwohin übertragen. Sichere sie regelmäßig, z. B. in iCloud Drive oder per AirDrop an deinen Mac.</p>';
  return html;
}

// ============================================================
// Sheets (Eingabe-Dialoge)
// ============================================================

function openSheet(title, body) {
  const el = $('#sheet');
  el.innerHTML = `<div class="grip"></div><div class="sheet-head"><h2>${esc(title)}</h2><button type="button" data-action="closeSheet" aria-label="Schließen">${icon('x')}</button></div>${body}`;
  el.hidden = false;
  $('#sheet-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  el.scrollTop = 0;
}

function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet-backdrop').hidden = true;
  $('#sheet').innerHTML = '';
  document.body.style.overflow = '';
  S.pendingReceipt = null;
  S.scanToken = null;
}

function sheetEntry(tx, preset = {}) {
  const isNew = !tx;
  const t = tx || { kind: 'expense', date: C.todayStr(), accountId: ls.get(LS.lastAcc) || 'giro', amount: '', note: '', ...preset };
  const pr = isNew ? S.pendingReceipt : null;
  let receiptBlock = '';
  if (pr) {
    receiptBlock = `<div class="receipt-chip"><img src="${urlFor('pending-' + (pr.key || ''), pr.thumb)}" alt="">
      <div><b>Rechnung wird mit der Buchung gespeichert</b><br><span class="muted small">${preset.scanned ? 'Bitte Betrag, Kategorie und Bezahlart prüfen.' : 'Text konnte nicht gelesen werden – bitte selbst eintragen.'}</span></div></div>`;
  } else if (isNew) {
    receiptBlock = `<div class="scan-row">
      <label class="btn secondary">${icon('camera')}Rechnung scannen<input type="file" accept="image/*" capture="environment" id="rcCamera" hidden></label>
      <label class="btn ghost">${icon('image')}Foto wählen<input type="file" accept="image/*" id="rcPick" hidden></label></div>`;
  } else if (tx.receiptId) {
    receiptBlock = `<button type="button" class="receipt-chip tap" data-action="openReceipt" data-id="${esc(tx.receiptId)}"><span class="thumb-ph" data-thumb="${esc(tx.receiptId)}">${icon('receipt')}</span>
      <div><b>Rechnung ansehen</b><br><span class="muted small">Foto ist an dieser Buchung gespeichert</span></div>${chevron()}</button>`;
  } else {
    receiptBlock = `<label class="link attach">${icon('camera')}Rechnung anhängen<input type="file" accept="image/*" id="rcAttach" data-tx="${esc(tx.id)}" hidden></label>`;
  }
  openSheet(isNew ? (pr ? 'Rechnung erfassen' : 'Neue Buchung') : 'Buchung bearbeiten', `
    ${receiptBlock}
    <form data-form="entry" data-id="${esc(tx?.id || '')}" data-kind="${t.kind}" autocomplete="off">
      <div class="seg">
        <label><input type="radio" name="kind" value="expense" ${t.kind === 'expense' ? 'checked' : ''}><span>Ausgabe</span></label>
        <label><input type="radio" name="kind" value="income" ${t.kind === 'income' ? 'checked' : ''}><span>Einnahme</span></label>
        <label><input type="radio" name="kind" value="transfer" ${t.kind === 'transfer' ? 'checked' : ''}><span>Umbuchung</span></label>
      </div>
      <label class="field"><input class="amount-input" name="amount" inputmode="decimal" placeholder="0,00 €" value="${amountStr(t.amount)}" required></label>
      <div class="only-expense">${chips('catExpense', catOptions('expense'), t.kind === 'expense' ? t.categoryId : null)}</div>
      <div class="only-income">${chips('catIncome', catOptions('income'), t.kind === 'income' ? t.categoryId : 'gehalt')}</div>
      <div class="not-transfer"><span class="field-label">Bezahlt mit</span>${chips('accountId', payChoices(), t.kind !== 'transfer' ? t.accountId : 'giro')}</div>
      <div class="only-transfer grid2">
        <label class="field"><span>Von</span>${select('fromAccount', [...allAccounts(), { value: '', label: 'Anderes Konto' }], t.kind === 'transfer' ? t.accountId || '' : 'giro')}</label>
        <label class="field"><span>Nach</span>${select('toAccount', [...allAccounts(), { value: '', label: 'Anderes Konto' }], t.kind === 'transfer' ? t.toAccountId || '' : 'cash')}</label>
      </div>
      <div class="grid2">
        <label class="field"><span>Datum</span><input type="date" name="date" value="${t.date}" required></label>
        <label class="field"><span>${pr ? 'Geschäft' : 'Notiz'}</span><input name="note" value="${esc(t.note || '')}" placeholder="optional"></label>
      </div>
      ${tx?.recurringId ? `<div class="callout row-callout">${icon('repeat')}<div>Automatisch durch einen Dauerauftrag gebucht. Änderungen gelten nur für diese eine Buchung.</div></div>` : ''}
      <button class="btn block" type="submit">Speichern</button>
      ${!isNew ? `<button class="btn danger block" type="button" data-action="deleteEntry" style="margin-top:10px">${icon('trash')}Löschen</button>` : ''}
    </form>`);
  if (!isNew && tx.receiptId) fillThumbs();
  if (isNew && !pr) setTimeout(() => $('#sheet input[name=amount]')?.focus(), 50);
}

async function fillThumbs() {
  for (const el of document.querySelectorAll('[data-thumb]')) {
    try {
      const rec = await R.getReceipt(el.dataset.thumb);
      if (rec && el.isConnected) el.outerHTML = `<img src="${urlFor('t-' + rec.id, rec.thumb)}" alt="">`;
    } catch { /* egal */ }
  }
}

function sheetSplitwiseEntry(item) {
  const ov = S.data.splitwise.overrides[item.id] || {};
  const cat = ov.categoryId || C.mapSplitwiseCategory(item.category);
  const pay = ov.payAccountId || S.data.splitwise.defaultPayAccount;
  const owed = ov.owed != null ? ov.owed : item.owed;
  const paid = C.round2(item.paid - item.owed + owed);
  openSheet('Splitwise-Eintrag', `
    <div class="card card-pad">
      <div class="title" style="font-weight:600;font-size:18px">${esc(item.description)}</div>
      <div class="muted small">${dayLabel(item.date)}${item.category ? ` · ${esc(item.category)}` : ''}</div>
      <div class="stats" style="margin:12px -16px -16px"><div><div class="k">Gesamt</div><div class="v">${money(item.cost)}</div></div><div><div class="k">Du hast bezahlt</div><div class="v">${money(paid)}</div></div><div><div class="k">Dein Anteil</div><div class="v">${money(owed)}</div></div></div>
    </div>
    <form data-form="splitwiseEntry" data-id="${esc(item.id)}">
      ${item.payment ? '' : `<span class="field-label">Kategorie für deinen Anteil</span>${chips('categoryId', catOptions('expense'), cat)}
        <label class="field"><span>Dein Anteil (€)</span><input name="owed" inputmode="decimal" value="${amountStr(owed)}">
        <span class="hint">Der Export verrät nicht, wie geteilt wurde – die App nimmt 50/50 an. Bei anderer Aufteilung hier korrigieren.</span></label>`}
      <label class="field"><span>${item.payment ? 'Ausgleich über' : 'Bezahlt von'}</span>${select('payAccountId', [...payAccounts(), { value: 'none', label: 'Anderes Konto (nicht abziehen)' }], pay)}</label>
      <button class="btn block" type="submit">Speichern</button>
    </form>`);
}

function sheetAccount(id, setupMode = false) {
  const a = C.getAccount(S.data, id);
  const today = C.todayStr();
  const bal = C.balancesAt(S.data, ledger(), today)[id] || 0;
  const isCash = a.type === 'cash';
  const title = isCash ? 'Bargeld' : 'George · Girokonto';
  const recent = ledger().filter((e) => !e.hidden && (e.accountId === id || e.toAccountId === id)).slice(-15).reverse();
  if (setupMode || !(S.data.setup || {})[id]) {
    openSheet(title, `
      <form data-form="accountStart" data-id="${id}">
        <div class="callout">${isCash ? 'Zähl dein Bargeld (Geldbörse, Sparschwein …) und trag den Betrag ein.' : 'Öffne die George App und trag den aktuellen Stand deines Girokontos ein. Deine Sparkonten legst du danach einzeln an.'}</div>
        <label class="field"><span>${isCash ? 'Bargeld heute' : 'Kontostand heute'}</span><input class="amount-input" name="amount" inputmode="decimal" placeholder="0,00 €" value="${(S.data.setup || {})[id] ? amountStr(a.startBalance) : ''}" required></label>
        <label class="field"><span>Stand vom</span><input type="date" name="date" value="${a.startDate || today}" required><span class="hint">Buchungen vor diesem Datum sind im Stand schon enthalten und werden nicht mitgerechnet.</span></label>
        <button class="btn block" type="submit">Speichern</button>
      </form>`);
    return;
  }
  openSheet(title, `
    <div class="card"><div class="hero" style="padding-bottom:16px"><div class="label">Stand laut App</div><div class="big num">${money(bal)}</div></div></div>
    <form data-form="reconcile" data-id="${id}">
      <label class="field"><span>${isCash ? 'Wie viel Bargeld hast du gerade?' : 'Kontostand laut George'}</span><input class="amount-input" name="amount" inputmode="decimal" placeholder="${amountStr(bal)} €" required>
      <span class="hint">${isCash ? 'Die Differenz wird als „Bargeld (ohne Zuordnung)“-Ausgabe gebucht.' : 'Eine Differenz wird als „Kontoabgleich“ gebucht (fehlende Ausgaben unter Sonstiges).'}</span></label>
      <button class="btn block" type="submit">${isCash ? 'Bargeld abgleichen' : 'Kontostand abgleichen'}</button>
    </form>
    <div class="btn-row">
      <button class="btn secondary" data-action="withdrawCash">${isCash ? 'Geld abgehoben' : 'Bargeld abheben'}</button>
      <button class="btn secondary" data-action="editAccountStart" data-id="${id}">Startstand</button>
    </div>
    <div class="section-title">Letzte Buchungen</div>
    ${entryList(recent)}`);
}

function sheetSavings(g) {
  const d = S.data;
  const today = C.todayStr();
  const cur = C.balancesAt(d, ledger(), today)[g.id] || 0;
  const p = C.goalProjection(d, g, cur);
  const rule = d.recurring.find((r) => r.kind === 'transfer' && r.toAccountId === g.id && r.active !== false);
  const next = rule ? C.nextOccurrence(C.addDays(today, 1), rule.day) : null;
  const recent = ledger().filter((e) => !e.hidden && (e.accountId === g.id || e.toAccountId === g.id)).slice(-15).reverse();
  const color = accColor(g);
  let goalInfo = '';
  if (g.target > 0) {
    goalInfo = `<div style="padding:0 18px 16px">${progressBar(cur, g.target, color)}
      <div class="split small" style="margin-top:8px"><span class="muted">${pctPlain(Math.min(1, cur / g.target))} von ${money(g.target)}</span>
      <span class="muted">${p.done ? 'Ziel erreicht' : p.date ? `Ziel ca. ${monthLabel(p.date)}` : `noch ${money(g.target - cur)}`}</span></div></div>`;
  }
  openSheet(g.name, `
    <div class="card"><div class="hero" style="padding-bottom:${g.target > 0 ? 10 : 16}px"><div class="label hero-label">${accIco(g, 'sm')}Sparkonto · George</div><div class="big num">${money(cur)}</div></div>${goalInfo}</div>
    <div class="card">
      <div class="row plain">${ico('repeat', color, 'sm')}<div class="main"><div class="title">Dauerauftrag</div><div class="sub">${rule ? `${money(rule.amount)} am ${rule.day}. jedes Monats vom ${esc(acctName(rule.accountId))}` : 'Kein Dauerauftrag eingerichtet'}</div></div></div>
      ${next ? `<div class="row plain">${ico('clock', color, 'sm')}<div class="main"><div class="title">Nächste Ausführung</div><div class="sub">${dayLabel(next)}</div></div><div class="end num">+${money(rule.amount)}</div></div>` : ''}
      <div class="row plain">${ico('chart', color, 'sm')}<div class="main"><div class="title">Seit Erfassung</div><div class="sub">Startstand ${money(g.startBalance)} am ${shortDate(g.startDate)}</div></div><div class="end num ${cur - g.startBalance >= 0 ? 'pos' : 'neg'}">${signed(C.round2(cur - (g.startBalance || 0)))}</div></div>
    </div>
    <div class="btn-row three">
      <button class="btn secondary" data-action="goalDeposit" data-id="${g.id}">${icon('arrowIn')}Einzahlen</button>
      <button class="btn secondary" data-action="goalWithdraw" data-id="${g.id}">${icon('arrowOut')}Entnehmen</button>
      <button class="btn secondary" data-action="editGoal" data-id="${g.id}">${icon('pencil')}Bearbeiten</button>
    </div>
    <div class="section-title">Letzte Buchungen</div>
    ${entryList(recent, 'Noch keine Buchungen – der Dauerauftrag erscheint hier ab der ersten Ausführung.')}`);
}

function sheetRecurring(r) {
  const isNew = !r;
  const t = r || { kind: 'expense', amount: '', day: 1, accountId: 'giro', categoryId: null, note: '', startDate: C.addDays(C.todayStr(), 1), active: true };
  if (t.kind === 'depot') { const h = S.data.depot.holdings.find((x) => x.id === t.holdingId); if (h) return sheetHolding(h); }
  if (t.kind === 'transfer' && C.getAccount(S.data, t.toAccountId)?.type === 'goal') return sheetGoal(C.getAccount(S.data, t.toAccountId));
  openSheet(isNew ? 'Neuer Dauerauftrag' : 'Dauerauftrag', `
    <form data-form="recurring" data-id="${esc(r?.id || '')}" data-kind="${t.kind}">
      <div class="seg">
        <label><input type="radio" name="kind" value="expense" ${t.kind === 'expense' ? 'checked' : ''}><span>Fixkosten</span></label>
        <label><input type="radio" name="kind" value="income" ${t.kind === 'income' ? 'checked' : ''}><span>Einnahme</span></label>
        <label><input type="radio" name="kind" value="transfer" ${t.kind === 'transfer' ? 'checked' : ''}><span>Umbuchung</span></label>
      </div>
      <div class="callout only-transfer small">Daueraufträge auf deine Sparkonten richtest du direkt beim Sparkonto ein.</div>
      <label class="field"><span>Bezeichnung</span><input name="note" value="${esc(t.note)}" placeholder="z. B. Miete, Gehalt, Netflix" required></label>
      <div class="grid2">
        <label class="field"><span>Betrag pro Monat</span><input name="amount" inputmode="decimal" placeholder="0,00" value="${amountStr(t.amount)}" required></label>
        <label class="field"><span>Am … des Monats</span><input name="day" type="number" min="1" max="31" inputmode="numeric" value="${t.day}" required></label>
      </div>
      <div class="only-expense">${chips('catExpense', catOptions('expense'), t.kind === 'expense' ? t.categoryId : 'wohnen')}</div>
      <div class="only-income">${chips('catIncome', catOptions('income'), t.kind === 'income' ? t.categoryId : 'gehalt')}</div>
      <div class="not-transfer"><label class="field"><span>Konto</span>${select('accountId', payAccounts(), t.accountId || 'giro')}</label></div>
      <div class="only-transfer grid2">
        <label class="field"><span>Von</span>${select('fromAccount', [...allAccounts(), { value: '', label: 'Anderes Konto' }], t.accountId || '')}</label>
        <label class="field"><span>Nach</span>${select('toAccount', [...allAccounts(), { value: '', label: 'Anderes Konto' }], t.toAccountId || '')}</label>
      </div>
      <label class="field"><span>Erste Buchung frühestens am</span><input type="date" name="startDate" value="${t.startDate}" required>
        <span class="hint">Was vor diesem Datum lag, ist schon in deinem Kontostand enthalten.</span></label>
      ${!isNew ? `<label class="switch-row"><span>Aktiv</span><input type="checkbox" name="active" ${t.active !== false ? 'checked' : ''}></label>` : ''}
      <button class="btn block" type="submit">Speichern</button>
      ${!isNew ? `<button class="btn danger block" type="button" data-action="deleteRecurring" style="margin-top:10px">${icon('trash')}Dauerauftrag löschen</button>` : ''}
    </form>`);
}

function sheetGoal(g) {
  const isNew = !g;
  const cur = g ? C.balancesAt(S.data, ledger(), C.todayStr())[g.id] || 0 : '';
  const rule = g ? S.data.recurring.find((r) => r.kind === 'transfer' && r.toAccountId === g.id) : null;
  const active = rule && rule.active !== false;
  const color = g ? accColor(g) : C.SAVINGS_COLORS[C.goals(S.data).length % C.SAVINGS_COLORS.length];
  openSheet(isNew ? 'Neues Sparkonto' : `${g.name} bearbeiten`, `
    <form data-form="goal" data-id="${esc(g?.id || '')}">
      <label class="field"><span>Name des Sparkontos</span><input name="name" value="${esc(g?.name || '')}" placeholder="z. B. Notgroschen, Urlaub, Auto" required></label>
      <div class="grid2">
        <label class="field"><span>Aktuelles Guthaben</span><input name="current" inputmode="decimal" placeholder="0,00" value="${amountStr(cur)}" required></label>
        <label class="field"><span>Sparziel (optional)</span><input name="target" inputmode="decimal" placeholder="—" value="${g?.target ? amountStr(g.target) : ''}"></label>
      </div>
      <div class="section-title" style="margin-top:4px">Dauerauftrag vom Girokonto</div>
      <div class="grid2">
        <label class="field"><span>Betrag pro Monat</span><input name="rate" inputmode="decimal" placeholder="0 = keiner" value="${active ? amountStr(rule.amount) : ''}"></label>
        <label class="field"><span>Ausführung am</span><input name="day" type="number" min="1" max="31" inputmode="numeric" value="${rule?.day || 1}"></label>
      </div>
      <label class="field"><span>Abbuchung von</span>${select('fromAccount', [...payAccounts(), { value: '', label: 'Anderes Konto (nicht abziehen)' }], rule ? rule.accountId || '' : 'giro')}
        <span class="hint">Die Rate wird jeden Monat automatisch vom Girokonto aufs Sparkonto umgebucht${isNew ? ' – erstmals nach heute' : ''}.</span></label>
      <span class="field-label">Symbol</span>
      ${iconPicker('icon', g?.icon || 'piggy', color)}
      <span class="field-label">Farbe</span>
      <div class="swatches">${C.SAVINGS_COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div>
      <button class="btn block" type="submit">Speichern</button>
      ${!isNew ? `<button class="btn danger block" type="button" data-action="deleteGoal" data-id="${g.id}" style="margin-top:10px">${icon('trash')}Sparkonto löschen</button>` : ''}
    </form>`);
}

function sheetHolding(h) {
  const isNew = !h;
  const plan = h ? S.data.recurring.find((r) => r.kind === 'depot' && r.holdingId === h.id) : null;
  const today = C.todayStr();
  openSheet(isNew ? 'Fonds hinzufügen' : h.name, `
    <form data-form="holding" data-id="${esc(h?.id || '')}">
      <label class="field"><span>Name</span><input name="name" value="${esc(h?.name || '')}" placeholder="z. B. Vanguard FTSE All-World" required></label>
      <div class="grid2">
        <label class="field"><span>ISIN (optional)</span><input name="isin" value="${esc(h?.isin || '')}" placeholder="IE00…" autocapitalize="characters"></label>
        <label class="field"><span>Aktueller Kurs (€)</span><input name="price" inputmode="decimal" value="${h?.price ? amountStr(h.price) : ''}" placeholder="aus Flatex"></label>
      </div>
      <div class="section-title" style="margin-top:6px">Sparplan</div>
      <div class="grid2">
        <label class="field"><span>Betrag pro Monat</span><input name="planAmount" inputmode="decimal" placeholder="0 = kein Sparplan" value="${plan && plan.active !== false ? amountStr(plan.amount) : ''}"></label>
        <label class="field"><span>Ausführung am</span><input name="planDay" type="number" min="1" max="31" value="${plan?.day || 1}"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Gebühr pro Ausführung</span><input name="planFee" inputmode="decimal" value="${plan?.fee ? amountStr(plan.fee) : ''}" placeholder="0,00"></label>
        <label class="field"><span>Erste Ausführung</span><input type="date" name="planStart" value="${plan?.startDate || today}"></label>
      </div>
      <label class="field"><span>Abbuchung von</span>${select('planAccount', [...payAccounts(), { value: '', label: 'Anderes Konto (nicht abziehen)' }], plan ? plan.accountId || '' : 'giro')}</label>
      <button class="btn block" type="submit">Speichern</button>
      ${!isNew ? `<div class="btn-row"><button class="btn secondary" type="button" data-action="newTrade" data-holding="${h.id}">Einmalkauf</button><button class="btn danger" type="button" data-action="deleteHolding" data-id="${h.id}">${icon('trash')}Löschen</button></div>` : ''}
    </form>`);
}

function sheetPrices() {
  const hs = S.data.depot.holdings;
  openSheet('Kurse eintragen', `
    <form data-form="prices">
      <div class="callout">Den aktuellen Kurs siehst du in der Flatex-App bei deinem Depot. Einmal im Monat eintragen reicht völlig.</div>
      ${hs.map((h) => `<label class="field"><span>${esc(h.name)}${h.priceDate ? ` · zuletzt ${shortDate(h.priceDate)}` : ''}</span><input name="price_${h.id}" inputmode="decimal" placeholder="Kurs in €" value="${h.price ? amountStr(h.price) : ''}"></label>`).join('')}
      <button class="btn block" type="submit">Speichern</button>
    </form>`);
}

function sheetTrade(t, holdingId) {
  const isNew = !t;
  const hs = S.data.depot.holdings;
  if (!hs.length) { toast('Leg zuerst einen Fonds an.'); return; }
  const x = t || { date: C.todayStr(), holdingId: holdingId || hs[0].id, amount: '', fee: 0, price: null, shares: null, fromAccountId: 'giro' };
  const h = hs.find((y) => y.id === x.holdingId);
  openSheet(isNew ? 'Kauf eintragen' : 'Kauf', `
    <form data-form="trade" data-id="${esc(t?.id || '')}">
      ${t?.estimated ? '<div class="callout warn">Automatisch aus dem Sparplan gebucht. Trag Kurs, Anteile und Gebühr aus der Flatex-Abrechnung ein.</div>' : ''}
      <label class="field"><span>Fonds</span>${select('holdingId', hs.map((y) => ({ value: y.id, label: y.name })), x.holdingId)}</label>
      <div class="grid2">
        <label class="field"><span>Datum</span><input type="date" name="date" value="${x.date}" required></label>
        <label class="field"><span>Betrag (€)</span><input name="amount" inputmode="decimal" value="${amountStr(x.amount)}" required></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Kurs (€)</span><input name="price" inputmode="decimal" value="${x.price ? amountStr(x.price) : h?.price ? amountStr(h.price) : ''}"></label>
        <label class="field"><span>Anteile</span><input name="shares" inputmode="decimal" value="${x.shares ? String(x.shares).replace('.', ',') : ''}" placeholder="Betrag ÷ Kurs"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Gebühr (€)</span><input name="fee" inputmode="decimal" value="${x.fee ? amountStr(x.fee) : ''}" placeholder="0,00"></label>
        <label class="field"><span>Bezahlt von</span>${select('fromAccountId', [...payAccounts(), { value: '', label: 'Anderes Konto' }], x.fromAccountId || '')}</label>
      </div>
      <button class="btn block" type="submit">Speichern</button>
      ${!isNew ? `<button class="btn danger block" type="button" data-action="deleteTrade" data-id="${t.id}" style="margin-top:10px">${icon('trash')}Löschen</button>` : ''}
    </form>`);
}

function sheetCategories() {
  const cats = S.data.categories;
  const row = (c) => `<div class="card cat-edit">
      <div class="row plain">
        <details class="icon-pick"><summary>${catIco(c)}</summary>${iconPicker(`icon_${c.id}`, c.icon, c.color)}</details>
        <input class="cat-name" name="name_${c.id}" value="${esc(c.name)}" aria-label="Name">
        ${c.kind === 'expense' ? `<input class="cat-budget" name="budget_${c.id}" inputmode="decimal" value="${c.budget ? amountStr(c.budget) : ''}" placeholder="Budget" aria-label="Monatsbudget">` : ''}
        ${c.custom ? `<button type="button" class="icon-btn neg" data-action="deleteCategory" data-id="${c.id}" aria-label="Löschen">${icon('trash')}</button>` : ''}
      </div></div>`;
  openSheet('Kategorien & Budgets', `
    <form data-form="categories">
      <div class="callout">Trag pro Kategorie ein Monatsbudget ein (leer = kein Budget). Tippe auf ein Symbol, um es zu ändern.</div>
      <div class="section-title" style="margin-top:0">Ausgaben · Budget pro Monat</div>
      ${cats.filter((c) => c.kind === 'expense').map(row).join('')}
      <div class="section-title">Einnahmen</div>
      ${cats.filter((c) => c.kind === 'income').map(row).join('')}
      <div class="section-title">Neue Kategorie</div>
      <label class="field"><input name="newName" placeholder="Name (optional)"></label>
      <div class="seg"><label><input type="radio" name="newKind" value="expense" checked><span>Ausgabe</span></label><label><input type="radio" name="newKind" value="income"><span>Einnahme</span></label></div>
      <span class="field-label">Symbol</span>
      ${iconPicker('newIcon', 'tag')}
      <button class="btn block" type="submit">Speichern</button>
    </form>`);
}

function sheetAppearance() {
  const s = S.data.settings;
  const radio = (name, value, label, ic) => `<label><input type="radio" name="${name}" value="${value}" ${s[name] === value ? 'checked' : ''}><span>${ic ? icon(ic) : ''}${label}</span></label>`;
  const demo = S.data.categories.slice(0, 5);
  openSheet('Erscheinungsbild', `
    <form data-form="appearance">
      <span class="field-label">Darstellung</span>
      <div class="seg seg-ico">${radio('theme', 'system', 'Wie iPhone', 'monitor')}${radio('theme', 'light', 'Hell', 'sun')}${radio('theme', 'dark', 'Dunkel', 'moon')}</div>
      <span class="field-label">Akzentfarbe</span>
      <div class="swatches big">${Object.entries(ACCENTS).map(([k, a]) => `<label title="${a.name}"><input type="radio" name="accent" value="${k}" ${s.accent === k ? 'checked' : ''}><span style="background:${a.light}"></span><em>${a.name}</em></label>`).join('')}</div>
      <span class="field-label">Farbstil der Icons</span>
      <div class="seg">${radio('iconStyle', 'color', 'Farbig')}${radio('iconStyle', 'accent', 'Akzentfarbe')}${radio('iconStyle', 'mono', 'Schlicht')}</div>
      <div class="card preview-card"><div class="row plain">${demo.map((c) => catIco(c)).join('')}</div></div>
      <button class="btn block" type="button" data-action="closeSheet">Fertig</button>
    </form>`);
}

function sheetSplitwise() {
  const sw = S.data.splitwise;
  const bal = C.balancesAt(S.data, ledger(), C.todayStr()).splitwise || 0;
  const status = sw.lastImport
    ? `<div class="card"><div class="hero" style="padding-bottom:16px"><div class="label">${bal >= 0 ? 'Man schuldet dir' : 'Du schuldest'}</div><div class="big num">${money(Math.abs(bal))}</div>
        <div class="delta muted">Stand vom ${shortDate(sw.lastImport.slice(0, 10))} · ${sw.items.length} Einträge · Spalte „${esc(sw.me)}“</div></div></div>`
    : '';
  openSheet('Splitwise', `${status}
    <div class="callout"><b>So holst du deine Splitwise-Daten:</b><br>
      1. In der Splitwise-App deinen Bruder öffnen (oder eure Gruppe).<br>
      2. Oben auf das Zahnrad → <b>Export as spreadsheet</b> (als Tabelle exportieren).<br>
      3. Die Datei mit <b>In Dateien sichern</b> speichern.<br>
      4. Hier auf <b>Export importieren</b> tippen und die Datei wählen.<br><br>
      Importiere einfach immer den neuesten Export – die App ersetzt die alten Daten, nichts wird doppelt gezählt.</div>
    <label class="btn block" style="margin-bottom:14px">${icon('upload')}Export importieren<input type="file" accept=".csv,text/csv,text/comma-separated-values" id="swFile" hidden></label>
    <div class="callout"><b>So zählt die App:</b> Bei geteilten Ausgaben zählt nur <b>dein Anteil</b>. Was du für deinen Bruder vorstreckst, wird als Guthaben geführt. Trag gemeinsame Einkäufe deshalb <b>nicht zusätzlich</b> mit + ein.</div>
    <form data-form="splitwiseSettings">
      <label class="field"><span>Wenn ich in Splitwise etwas bezahle, kommt das Geld von</span>${select('defaultPayAccount', [...payAccounts(), { value: 'none', label: 'Anderes Konto (nicht abziehen)' }], sw.defaultPayAccount)}</label>
      <label class="field"><span>Einträge übernehmen ab</span><input type="date" name="since" value="${sw.since}"><span class="hint">Ältere Einträge sind schon in deinen Kontoständen enthalten.</span></label>
      <button class="btn secondary block" type="submit">Einstellungen speichern</button>
    </form>`);
}

function sheetPickPerson(persons) {
  openSheet('Wer bist du?', `
    <form data-form="pickPerson">
      <div class="callout">Der Export enthält eine Spalte pro Person. Welche davon bist du?</div>
      ${chips('me', persons.map((p) => ({ value: p, label: p })), persons.includes(S.data.splitwise.me) ? S.data.splitwise.me : persons[0])}
      <button class="btn block" type="submit">Importieren</button>
    </form>`);
}

function runSplitwiseImport(me) {
  const res = C.importSplitwise(S.data, S.pendingCsv, me);
  S.pendingCsv = null;
  closeSheet();
  commit(`Splitwise importiert: ${res.count} Einträge, Saldo ${money(C.balancesAt(S.data, C.buildLedger(S.data), C.todayStr()).splitwise || 0)}`);
}

// ---------- Rechnungen ----------

async function startScan(file) {
  const token = {};
  closeSheet();
  S.scanToken = token;
  openSheet('Rechnung wird gelesen', `<div class="scan-progress">
      <div class="scan-img"><span class="spinner"></span></div>
      <div class="bar"><i id="ocrBar" style="width:3%"></i></div>
      <p id="ocrMsg" class="muted small">Foto wird vorbereitet …</p>
      <button class="btn ghost block" data-action="skipOcr" id="skipOcr" hidden>Überspringen & selbst eintippen</button>
      <p class="muted small footnote">Die Texterkennung läuft direkt auf deinem iPhone – das Foto wird nicht hochgeladen.</p></div>`);
  let prepared;
  try {
    prepared = await R.prepareImage(file);
  } catch (e) {
    if (S.scanToken === token) { closeSheet(); toast(e.message); }
    return;
  }
  if (S.scanToken !== token) return;
  prepared.key = C.uid();
  S.pendingReceipt = prepared;
  S.scanToken = token;
  $('.scan-img').innerHTML = `<img src="${urlFor('pending-' + prepared.key, prepared.thumb)}" alt="">`;
  $('#skipOcr').hidden = false;
  $('#ocrMsg').textContent = 'Texterkennung wird geladen …';
  let parsed = null;
  try {
    const text = await Promise.race([
      R.recognize(prepared.blob, (p) => {
        if (S.scanToken !== token) return;
        $('#ocrBar') && ($('#ocrBar').style.width = `${Math.max(5, Math.round(p * 100))}%`);
        $('#ocrMsg') && ($('#ocrMsg').textContent = `Text wird erkannt … ${Math.round(p * 100)} %`);
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Das Lesen dauert zu lange')), 90000)),
    ]);
    if (S.scanToken !== token) return;
    prepared.ocrText = text;
    parsed = C.parseReceiptText(text);
  } catch (e) {
    if (S.scanToken !== token) return;
    toast(`${e.message} – bitte Betrag selbst eintragen.`);
  }
  openScannedEntry(parsed);
}

function openScannedEntry(p) {
  const pr = S.pendingReceipt;
  S.scanToken = null;
  S.pendingReceipt = pr;
  sheetEntry(null, {
    kind: 'expense',
    amount: p?.amount ?? '',
    date: p?.date || C.todayStr(),
    note: p?.merchant || '',
    accountId: p?.pay || ls.get(LS.lastAcc) || 'giro',
    scanned: !!(p && (p.amount || p.merchant)),
  });
}

async function sheetReceipts() {
  openSheet('Rechnungen', '<div class="empty"><span class="spinner"></span></div>');
  let list;
  try { list = await R.allReceipts(); } catch (e) { $('#sheet').querySelector('.empty').textContent = e.message; return; }
  if ($('#sheet').hidden) return;
  const txById = new Map(S.data.transactions.map((t) => [t.id, t]));
  const body = list.length
    ? `<div class="receipt-grid">${list.map((r) => {
      const t = txById.get(r.txId);
      return `<button class="receipt-tile" data-action="openReceipt" data-id="${esc(r.id)}"><img src="${urlFor('t-' + r.id, r.thumb)}" alt="">
        <div class="rt-info"><div class="title">${esc((t && t.note) || r.merchant || 'Rechnung')}</div><div class="sub">${shortDate((t && t.date) || r.date)} · ${money((t && t.amount) ?? r.amount)}</div></div></button>`;
    }).join('')}</div>`
    : `<div class="card"><div class="empty"><div class="em">${icon('receipt')}</div><strong>Noch keine Rechnungen</strong><p>Tippe auf <b>+</b> und dann auf <b>Rechnung scannen</b>. Das Foto wird hier gespeichert – nur auf diesem Gerät.</p></div></div>`;
  $('#sheet').innerHTML = $('#sheet').innerHTML.replace(/<div class="empty"><span class="spinner"><\/span><\/div>$/, '') + body;
}

async function sheetReceipt(id) {
  const rec = await R.getReceipt(id);
  if (!rec) { toast('Rechnung nicht gefunden.'); return; }
  const t = S.data.transactions.find((x) => x.id === rec.txId);
  openSheet((t && t.note) || rec.merchant || 'Rechnung', `
    <div class="receipt-full"><img src="${urlFor('f-' + rec.id, rec.blob)}" alt="Rechnung"></div>
    <div class="card">
      <div class="row plain">${ico('receipt', 'var(--accent)', 'sm')}<div class="main"><div class="title">${money((t && t.amount) ?? rec.amount)}</div><div class="sub">${dayLabel((t && t.date) || rec.date)}${t ? ` · ${t.accountId === 'cash' ? 'Bar' : 'Karte / Konto'}` : ''}</div></div></div>
    </div>
    <div class="btn-row three">
      ${t ? `<button class="btn secondary" data-action="openEntry" data-id="${esc(t.id)}">${icon('pencil')}Buchung</button>` : ''}
      <button class="btn secondary" data-action="shareReceipt" data-id="${esc(rec.id)}">${icon('upload')}Teilen</button>
      <button class="btn danger" data-action="deleteReceipt" data-id="${esc(rec.id)}">${icon('trash')}Löschen</button>
    </div>`);
}

// ============================================================
// Aktionen
// ============================================================

const actions = {
  closeSheet,
  newEntry: () => { closeSheet(); sheetEntry(null); },
  openEntry: ({ id }) => {
    if (id.startsWith('tr-')) return sheetTrade(S.data.depot.trades.find((t) => t.id === id.slice(3)));
    if (id.startsWith('sw-')) return sheetSplitwiseEntry(S.data.splitwise.items.find((i) => i.id === id.slice(3)));
    const tx = S.data.transactions.find((t) => t.id === id);
    if (tx) sheetEntry(tx);
  },
  deleteEntry: () => {
    const id = $('#sheet form').dataset.id;
    const tx = S.data.transactions.find((t) => t.id === id);
    if (!confirm(tx?.receiptId ? 'Diese Buchung samt Rechnungsfoto löschen?' : 'Diese Buchung löschen?')) return;
    if (tx?.receiptId) R.deleteReceipt(tx.receiptId).catch(() => {});
    S.data.transactions = S.data.transactions.filter((t) => t.id !== id);
    closeSheet();
    commit('Gelöscht');
  },
  month: ({ d }) => {
    const next = C.addMonths(S.ui.month, Number(d));
    if (next > C.monthKey(C.todayStr())) return;
    S.ui.month = next; S.ui.catFilter = null; render();
  },
  filterCat: ({ id }) => { S.ui.catFilter = S.ui.catFilter === id || !id ? null : id; render(); },
  toggleGeorge: () => { S.ui.georgeOpen = !S.ui.georgeOpen; render(); },
  hideSetup: () => { S.data.setupDone = true; commit('Einrichtung ausgeblendet – du findest sie unter „Mehr“.'); },
  showSetup: () => { S.data.setupDone = false; S.ui.tab = 'home'; commit(); },
  setupAccount: ({ id }) => sheetAccount(id, true),
  openAccount: ({ id }) => sheetAccount(id),
  editAccountStart: ({ id }) => sheetAccount(id, true),
  withdrawCash: () => sheetEntry(null, { kind: 'transfer', accountId: 'giro', toAccountId: 'cash', note: 'Bargeld abgehoben' }),
  newRecurring: () => sheetRecurring(null),
  openRecurring: ({ id }) => sheetRecurring(S.data.recurring.find((r) => r.id === id)),
  deleteRecurring: () => {
    const id = $('#sheet form').dataset.id;
    if (!confirm('Dauerauftrag löschen? Bereits gebuchte Buchungen bleiben erhalten.')) return;
    S.data.recurring = S.data.recurring.filter((r) => r.id !== id);
    closeSheet();
    commit('Dauerauftrag gelöscht');
  },
  newGoal: () => sheetGoal(null),
  openSavings: ({ id }) => sheetSavings(C.getAccount(S.data, id)),
  editGoal: ({ id }) => sheetGoal(C.getAccount(S.data, id)),
  goalDeposit: ({ id }) => sheetEntry(null, { kind: 'transfer', accountId: 'giro', toAccountId: id, note: 'Einzahlung Sparkonto' }),
  goalWithdraw: ({ id }) => sheetEntry(null, { kind: 'transfer', accountId: id, toAccountId: 'giro', note: 'Entnahme Sparkonto' }),
  deleteGoal: ({ id }) => {
    if (!confirm('Sparkonto löschen? Das Guthaben zählt danach nicht mehr zu deinem Vermögen. Wenn du das Geld aufs Girokonto zurückgebucht hast, trag vorher „Entnehmen“ ein.')) return;
    S.data.accounts = S.data.accounts.filter((a) => a.id !== id);
    S.data.recurring = S.data.recurring.filter((r) => r.toAccountId !== id && r.accountId !== id);
    closeSheet();
    commit('Sparkonto gelöscht');
  },
  newHolding: () => sheetHolding(null),
  openHolding: ({ id }) => sheetHolding(S.data.depot.holdings.find((h) => h.id === id)),
  deleteHolding: ({ id }) => {
    if (!confirm('Fonds samt allen Käufen löschen?')) return;
    S.data.depot.holdings = S.data.depot.holdings.filter((h) => h.id !== id);
    S.data.depot.trades = S.data.depot.trades.filter((t) => t.holdingId !== id);
    S.data.recurring = S.data.recurring.filter((r) => r.holdingId !== id);
    closeSheet();
    commit('Fonds gelöscht');
  },
  newTrade: ({ holding }) => sheetTrade(null, holding),
  deleteTrade: ({ id }) => {
    if (!confirm('Kauf löschen?')) return;
    S.data.depot.trades = S.data.depot.trades.filter((t) => t.id !== id);
    closeSheet();
    commit('Gelöscht');
  },
  openPrices: () => sheetPrices(),
  openCategories: () => sheetCategories(),
  openAppearance: () => sheetAppearance(),
  deleteCategory: ({ id }) => {
    if (!confirm('Kategorie löschen? Buchungen darin landen unter „Sonstiges“.')) return;
    S.data.categories = S.data.categories.filter((c) => c.id !== id);
    for (const t of S.data.transactions) if (t.categoryId === id) t.categoryId = 'sonstiges';
    for (const r of S.data.recurring) if (r.categoryId === id) r.categoryId = 'sonstiges';
    for (const k in S.data.splitwise.overrides) if (S.data.splitwise.overrides[k].categoryId === id) delete S.data.splitwise.overrides[k].categoryId;
    commit();
    sheetCategories();
  },
  openSplitwise: () => sheetSplitwise(),
  openReceipts: () => sheetReceipts(),
  openReceipt: ({ id }) => sheetReceipt(id),
  skipOcr: () => { if (S.pendingReceipt) openScannedEntry(null); },
  deleteReceipt: async ({ id }) => {
    if (!confirm('Rechnungsfoto löschen? Die Buchung bleibt erhalten.')) return;
    await R.deleteReceipt(id);
    for (const t of S.data.transactions) if (t.receiptId === id) delete t.receiptId;
    closeSheet();
    commit('Rechnung gelöscht');
  },
  shareReceipt: async ({ id }) => {
    const rec = await R.getReceipt(id);
    const file = new File([rec.blob], `rechnung-${rec.date || 'foto'}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch { /* abgebrochen */ }
    } else toast('Teilen wird von diesem Browser nicht unterstützt.');
  },
  exportData: async () => {
    const name = `finanzen-backup-${C.todayStr()}.json`;
    let receipts = [];
    try { receipts = await R.exportReceipts(); } catch { /* keine Fotos */ }
    const json = JSON.stringify({ ...S.data, lastBackup: new Date().toISOString(), receipts }, null, 1);
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    let done = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Finanzen-Backup' }); done = true; } catch (e) { if (e.name === 'AbortError') return; }
    }
    if (!done) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    S.data.lastBackup = new Date().toISOString();
    commit(`Backup erstellt${receipts.length ? ` (inkl. ${receipts.length} ${receipts.length === 1 ? "Rechnung" : "Rechnungen"})` : ''}`);
  },
};

// ============================================================
// Formulare
// ============================================================

function num(v, { required = false, allowZero = true } = {}) {
  const n = C.parseAmount(v);
  if (Number.isNaN(n)) { if (required) throw new Error('Bitte einen gültigen Betrag eingeben.'); return 0; }
  if (n < 0 || (!allowZero && n === 0)) throw new Error('Bitte einen Betrag größer als 0 eingeben.');
  return C.round2(n);
}

function dayNum(v) {
  const n = Math.round(Number(v));
  if (!(n >= 1 && n <= 31)) throw new Error('Bitte einen Tag zwischen 1 und 31 eingeben.');
  return n;
}

const forms = {
  async entry(fd, form) {
    const kind = fd.get('kind');
    const amount = num(fd.get('amount'), { required: true, allowZero: false });
    const tx = { id: form.dataset.id || C.uid(), kind, amount, date: fd.get('date'), note: (fd.get('note') || '').trim() };
    if (kind === 'transfer') {
      tx.accountId = fd.get('fromAccount') || null;
      tx.toAccountId = fd.get('toAccount') || null;
      tx.categoryId = null;
      if (tx.accountId === tx.toAccountId) throw new Error('Von- und Nach-Konto müssen verschieden sein.');
    } else {
      tx.categoryId = fd.get(kind === 'expense' ? 'catExpense' : 'catIncome');
      if (!tx.categoryId) throw new Error('Bitte eine Kategorie wählen.');
      tx.accountId = fd.get('accountId') || 'giro';
      tx.toAccountId = null;
      ls.set(LS.lastAcc, tx.accountId);
    }
    const i = S.data.transactions.findIndex((t) => t.id === tx.id);
    let warn = '';
    if (i < 0 && S.pendingReceipt) {
      const pr = S.pendingReceipt;
      const rid = C.uid();
      try {
        await R.saveReceipt({ id: rid, blob: pr.blob, thumb: pr.thumb, date: tx.date, merchant: tx.note, amount: tx.amount, txId: tx.id, ocrText: pr.ocrText || '', createdAt: new Date().toISOString() });
        tx.receiptId = rid;
      } catch { warn = ' – Foto konnte nicht gespeichert werden'; }
    }
    if (i >= 0) S.data.transactions[i] = { ...S.data.transactions[i], ...tx };
    else S.data.transactions.push({ ...tx, source: tx.receiptId ? 'receipt' : 'manual' });
    closeSheet();
    commit(i >= 0 ? 'Gespeichert' : `${kind === 'expense' ? 'Ausgabe' : kind === 'income' ? 'Einnahme' : 'Umbuchung'} gespeichert${tx.receiptId ? ' – Rechnung abgelegt' : ''}${warn}`);
  },

  splitwiseEntry(fd, form) {
    const id = form.dataset.id;
    const item = S.data.splitwise.items.find((i) => i.id === id);
    const ov = { ...(S.data.splitwise.overrides[id] || {}) };
    if (fd.get('categoryId')) ov.categoryId = fd.get('categoryId');
    if (fd.get('payAccountId')) ov.payAccountId = fd.get('payAccountId');
    if (fd.has('owed')) {
      const owed = num(fd.get('owed'), { required: true });
      const paid = C.round2(item.paid - item.owed + owed);
      if (paid < 0 || paid > item.cost + 0.005) throw new Error(`Dein Anteil muss zwischen ${money(Math.max(0, item.owed - item.paid))} und ${money(item.cost - item.paid + item.owed)} liegen.`);
      if (Math.abs(owed - item.owed) < 0.005) delete ov.owed; else ov.owed = owed;
    }
    S.data.splitwise.overrides[id] = ov;
    closeSheet();
    commit('Gespeichert');
  },

  accountStart(fd, form) {
    const id = form.dataset.id;
    const a = C.getAccount(S.data, id);
    const amount = C.parseAmount(fd.get('amount'));
    if (Number.isNaN(amount)) throw new Error('Bitte einen gültigen Betrag eingeben.');
    a.startBalance = C.round2(amount);
    a.startDate = fd.get('date');
    S.data.setup = { ...(S.data.setup || {}), [id]: true };
    closeSheet();
    commit('Gespeichert');
  },

  reconcile(fd, form) {
    const id = form.dataset.id;
    const actual = C.parseAmount(fd.get('amount'));
    if (Number.isNaN(actual)) throw new Error('Bitte einen gültigen Betrag eingeben.');
    const e = C.makeReconcileEntry(S.data, ledger(), id, actual);
    closeSheet();
    if (!e) { toast('Passt genau – nichts zu korrigieren.'); return; }
    S.data.transactions.push(e);
    commit(`Abgeglichen: ${signed(e.kind === 'expense' ? -e.amount : e.amount)}`);
  },

  recurring(fd, form) {
    const kind = fd.get('kind');
    const r = {
      id: form.dataset.id || C.uid(), kind, note: fd.get('note').trim(),
      amount: num(fd.get('amount'), { required: true, allowZero: false }), day: dayNum(fd.get('day')),
      startDate: fd.get('startDate'),
    };
    if (kind === 'transfer') {
      r.accountId = fd.get('fromAccount') || null;
      r.toAccountId = fd.get('toAccount') || null;
      r.categoryId = null;
      if (r.accountId === r.toAccountId) throw new Error('Von- und Nach-Konto müssen verschieden sein.');
    } else {
      r.accountId = fd.get('accountId');
      r.toAccountId = null;
      r.categoryId = fd.get(kind === 'expense' ? 'catExpense' : 'catIncome');
      if (!r.categoryId) throw new Error('Bitte eine Kategorie wählen.');
    }
    const i = S.data.recurring.findIndex((x) => x.id === r.id);
    if (i >= 0) {
      const old = S.data.recurring[i];
      r.active = !!fd.get('active');
      r.lastBooked = old.lastBooked ?? null; // schützt vor doppelten Buchungen
      S.data.recurring[i] = { ...old, ...r };
    } else {
      S.data.recurring.push({ ...r, active: true, lastBooked: null });
    }
    const n = C.bookDueRecurring(S.data);
    closeSheet();
    commit(n ? `Gespeichert – ${n} fällige Buchung${n > 1 ? 'en' : ''} eingetragen` : 'Dauerauftrag gespeichert');
  },

  goal(fd, form) {
    const today = C.todayStr();
    const name = fd.get('name').trim();
    const current = num(fd.get('current'), { required: true });
    const target = num(fd.get('target'));
    const rate = num(fd.get('rate'));
    const day = dayNum(fd.get('day') || 1);
    const from = fd.get('fromAccount') || null;
    const iconName = hasIcon(fd.get('icon')) ? fd.get('icon') : 'piggy';
    const color = fd.get('color') || C.SAVINGS_COLORS[0];
    let g = form.dataset.id ? C.getAccount(S.data, form.dataset.id) : null;
    const isNew = !g;
    if (!g) {
      g = { id: C.uid(), type: 'goal', bank: 'george', name, icon: iconName, color, target, startBalance: current, startDate: today };
      S.data.accounts.push(g);
    } else {
      Object.assign(g, { name, icon: iconName, color, target });
      const e = C.makeReconcileEntry(S.data, C.buildLedger(S.data), g.id, current, today);
      if (e) S.data.transactions.push(e);
    }
    let rule = S.data.recurring.find((r) => r.kind === 'transfer' && r.toAccountId === g.id);
    if (rate > 0) {
      if (!rule) {
        rule = { id: C.uid(), kind: 'transfer', toAccountId: g.id, startDate: C.addDays(today, 1), lastBooked: null };
        S.data.recurring.push(rule);
      } else if (rule.active === false) {
        rule.startDate = C.addDays(today, 1);
        rule.lastBooked = null;
      }
      Object.assign(rule, { amount: rate, day, accountId: from, note: `Dauerauftrag ${name}`, active: true });
    } else if (rule) {
      rule.active = false;
    }
    S.ui.georgeOpen = true;
    closeSheet();
    commit(isNew ? 'Sparkonto angelegt' : 'Sparkonto gespeichert');
  },

  holding(fd, form) {
    const today = C.todayStr();
    const price = num(fd.get('price'));
    let h = form.dataset.id ? S.data.depot.holdings.find((x) => x.id === form.dataset.id) : null;
    const fields = { name: fd.get('name').trim(), isin: (fd.get('isin') || '').trim().toUpperCase() };
    if (!h) { h = { id: C.uid(), ...fields }; S.data.depot.holdings.push(h); } else Object.assign(h, fields);
    const amount = num(fd.get('planAmount'));
    let plan = S.data.recurring.find((r) => r.kind === 'depot' && r.holdingId === h.id);
    if (amount > 0) {
      if (!plan) { plan = { id: C.uid(), kind: 'depot', holdingId: h.id, lastBooked: null }; S.data.recurring.push(plan); }
      Object.assign(plan, { amount, day: dayNum(fd.get('planDay') || 1), fee: num(fd.get('planFee')), accountId: fd.get('planAccount') || null, startDate: fd.get('planStart') || today, active: true, note: `Sparplan ${h.name}` });
    } else if (plan) plan.active = false;
    const n = C.bookDueRecurring(S.data);
    if (price > 0 && price !== h.price) C.applyPrice(S.data, h.id, price, today);
    closeSheet();
    commit(n ? `Gespeichert – ${n} Sparplan-Ausführung${n > 1 ? 'en' : ''} gebucht` : 'Fonds gespeichert');
  },

  prices(fd) {
    const today = C.todayStr();
    for (const h of S.data.depot.holdings) {
      const p = num(fd.get(`price_${h.id}`));
      if (p > 0 && p !== h.price) C.applyPrice(S.data, h.id, p, today);
    }
    closeSheet();
    commit('Kurse gespeichert');
  },

  trade(fd, form) {
    const amount = num(fd.get('amount'), { required: true, allowZero: false });
    const price = num(fd.get('price'));
    let shares = C.parseAmount(fd.get('shares'));
    if (!(shares > 0)) shares = price > 0 ? Math.round((amount / price) * 1e6) / 1e6 : null;
    const t = {
      id: form.dataset.id || C.uid(), holdingId: fd.get('holdingId'), date: fd.get('date'), amount,
      fee: num(fd.get('fee')), price: price || null, shares, fromAccountId: fd.get('fromAccountId') || null, estimated: false,
    };
    const i = S.data.depot.trades.findIndex((x) => x.id === t.id);
    if (i >= 0) S.data.depot.trades[i] = { ...S.data.depot.trades[i], ...t };
    else S.data.depot.trades.push(t);
    const h = S.data.depot.holdings.find((x) => x.id === t.holdingId);
    if (h && price > 0 && (!h.priceDate || t.date >= h.priceDate)) { h.price = price; h.priceDate = t.date; }
    closeSheet();
    commit('Kauf gespeichert');
  },

  categories(fd) {
    for (const c of S.data.categories) {
      const name = (fd.get(`name_${c.id}`) || '').trim();
      if (name) c.name = name;
      const ic = fd.get(`icon_${c.id}`);
      if (hasIcon(ic)) c.icon = ic;
      if (c.kind === 'expense') c.budget = num(fd.get(`budget_${c.id}`));
    }
    const newName = (fd.get('newName') || '').trim();
    if (newName) {
      const palette = ['#2f9e6b', '#1c7ed6', '#7048e8', '#e8590c', '#d6336c', '#0ca678', '#a07c3b', '#ae3ec9'];
      S.data.categories.push({ id: C.uid(), name: newName, icon: hasIcon(fd.get('newIcon')) ? fd.get('newIcon') : 'tag', color: palette[S.data.categories.length % palette.length], kind: fd.get('newKind') || 'expense', budget: 0, custom: true });
    }
    closeSheet();
    commit('Kategorien gespeichert');
  },

  splitwiseSettings(fd) {
    const sw = S.data.splitwise;
    sw.defaultPayAccount = fd.get('defaultPayAccount');
    const since = fd.get('since');
    let msg = 'Gespeichert';
    if (since && since !== sw.since) {
      sw.since = since;
      if (sw.lastImport) msg = 'Gespeichert – bitte den Export neu importieren, damit das neue Datum gilt.';
    }
    closeSheet();
    commit(msg);
  },

  pickPerson(fd) {
    runSplitwiseImport(fd.get('me'));
  },
};

// ============================================================
// Start
// ============================================================

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

async function onFileChosen(el) {
  const file = el.files[0];
  el.value = '';
  if (!file) return;
  if (el.id === 'rcCamera' || el.id === 'rcPick') return startScan(file);
  if (el.id === 'rcAttach') {
    const t = S.data.transactions.find((x) => x.id === el.dataset.tx);
    if (!t) return;
    const pr = await R.prepareImage(file);
    const rid = C.uid();
    await R.saveReceipt({ id: rid, blob: pr.blob, thumb: pr.thumb, date: t.date, merchant: t.note, amount: t.amount, txId: t.id, createdAt: new Date().toISOString() });
    t.receiptId = rid;
    commit('Rechnung angehängt');
    sheetEntry(t);
    return;
  }
  const text = await file.text();
  if (el.id === 'importFile') {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.accounts)) throw new Error('Das ist keine gültige Backup-Datei.');
    if (!confirm('Backup wiederherstellen? Alle aktuellen Daten und Rechnungsfotos auf diesem Gerät werden ersetzt.')) return;
    let n = 0;
    if (Array.isArray(d.receipts)) n = await R.importReceipts(d.receipts);
    delete d.receipts;
    S.data = C.normalizeData(d);
    applyAppearance();
    commit(`Backup wiederhergestellt${n ? ` (inkl. ${n} ${n === 1 ? "Rechnung" : "Rechnungen"})` : ''}`);
  } else if (el.id === 'swFile') {
    const parsed = C.parseSplitwiseCSV(text);
    S.pendingCsv = parsed;
    const me = S.data.splitwise.me;
    if (parsed.persons.length === 1) runSplitwiseImport(parsed.persons[0]);
    else if (me && parsed.persons.includes(me)) runSplitwiseImport(me);
    else sheetPickPerson(parsed.persons);
  }
}

function wireEvents() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-action]');
    if (!t) return;
    if (t.dataset.tab) {
      closeSheet();
      S.ui.tab = t.dataset.tab;
      S.ui.catFilter = null;
      render();
      window.scrollTo(0, 0);
      return;
    }
    const fn = actions[t.dataset.action];
    if (fn) { e.preventDefault(); Promise.resolve().then(() => fn(t.dataset, t)).catch((err) => toast(err.message)); }
  });
  $('#sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('submit', (e) => {
    const f = e.target;
    const fn = forms[f.dataset.form];
    if (!fn) return;
    e.preventDefault();
    Promise.resolve().then(() => fn(new FormData(f), f)).catch((err) => toast(err.message));
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.name === 'kind' && el.form) el.form.dataset.kind = el.value;
    if (el.form && el.form.dataset.form === 'appearance') {
      S.data.settings[el.name] = el.value;
      applyAppearance();
      commit();
      const prev = el.form.querySelector('.preview-card');
      if (prev) prev.innerHTML = `<div class="row plain">${S.data.categories.slice(0, 5).map((c) => catIco(c)).join('')}</div>`;
      return;
    }
    if (el.type === 'file') onFileChosen(el).catch((err) => toast(err.message));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !S.data) return;
    const n = C.bookDueRecurring(S.data);
    if (n) commit();
    else if ($('#sheet').hidden) { S._ledger = null; render(); }
  });
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => S.data && applyAppearance());
}

function init() {
  const tabIcons = { home: 'home', spending: 'chart', goals: 'piggy', depot: 'trend', more: 'more' };
  document.querySelectorAll('#tabbar button').forEach((b) => { b.querySelector('.ti').outerHTML = icon(tabIcons[b.dataset.tab]); });
  $('#fab').innerHTML = icon('plus');
  wireEvents();
  const raw = ls.get(LS.data);
  if (raw) { try { S.data = C.normalizeData(JSON.parse(raw)); } catch { S.data = null; } }
  if (!S.data) S.data = C.createInitialData();
  applyAppearance();
  // Browser bitten, die Daten nicht automatisch zu löschen
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  C.bookDueRecurring(S.data);
  commit();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
