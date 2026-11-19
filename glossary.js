// Lexikon für Lebensversicherungen (Österreich) und die Auswertung von Versicherungsdokumenten.
// Läuft komplett auf dem Gerät – keine KI, keine Cloud.

/**
 * re: woran der Begriff im Text erkannt wird
 * value: 'amount' | 'percent' – ob die App dazu einen Wert aus dem Dokument liest
 */
export const GLOSSARY = [
  { id: 'rueckkaufswert', term: 'Rückkaufswert', re: /r[üu]ckkaufs?wert/i, value: 'amount', important: true,
    text: 'Der Betrag, den du bekommst, wenn du den Vertrag jetzt kündigst. Er ist in den ersten Jahren oft deutlich niedriger als die eingezahlten Prämien, weil zuerst Abschluss- und Verwaltungskosten abgezogen werden.' },
  { id: 'praemiensumme', term: 'Eingezahlte Prämien', re: /(eingezahlte|bisher (be)?zahlte|summe der) pr[äa]mien|pr[äa]miensumme|einzahlungen gesamt/i, value: 'amount', important: true,
    text: 'Wie viel du insgesamt schon eingezahlt hast. Vergleich das mit dem Rückkaufswert, um zu sehen, wo du stehst.' },
  { id: 'praemie', term: 'Prämie', re: /^(?!.*(pr[äa]mienfrei|eingezahlt|bisher|summe der|risiko)).*(\bpr[äa]mie\b|\bbeitrag\b|zahlbetrag)/i, value: 'amount',
    text: 'Der Beitrag, den du regelmäßig zahlst (monatlich, vierteljährlich, halbjährlich oder jährlich). Die Versicherungssteuer ist darin meist schon enthalten.' },
  { id: 'versicherungssumme', term: 'Versicherungssumme', re: /^(?!.*pr[äa]mienfrei).*(versicherungssumme|garantierte summe)/i, value: 'amount', important: true,
    text: 'Der vertraglich vereinbarte Betrag, der im Versicherungsfall (bei Ablauf oder im Todesfall) mindestens ausgezahlt wird.' },
  { id: 'ablaufleistung', term: 'Ablaufleistung', re: /(ablauf|erlebens)leistung|auszahlung bei ablauf|erlebensfall/i, value: 'amount', important: true,
    text: 'Was du am Vertragsende bekommst. Sie setzt sich aus einem garantierten Teil und nicht garantierten Überschüssen zusammen – oft wird beides getrennt oder als Prognose angegeben.' },
  { id: 'garantiert', term: 'Garantiert vs. prognostiziert', re: /garantiert|prognos|voraussichtlich|unverbindlich/i,
    text: 'Garantierte Werte bekommst du sicher. Alles, was als „prognostiziert“, „voraussichtlich“, „unverbindlich“ oder „Überschuss“ bezeichnet ist, kann sich noch ändern – meistens nach unten.' },
  { id: 'ueberschuss', term: 'Überschussbeteiligung', re: /[üu]berschuss(beteiligung|anteil)?|gewinnbeteiligung|\bbonus\b/i, value: 'amount',
    text: 'Zusätzliche Erträge, die der Versicherer erwirtschaftet und an dich weitergibt. Nicht garantiert – die Höhe kann jedes Jahr neu festgelegt werden.' },
  { id: 'schlussueberschuss', term: 'Schlussüberschuss', re: /schluss[üu]berschuss|schlussgewinn|schlussbonus/i, value: 'amount',
    text: 'Ein Bonus, der erst am Vertragsende fällig wird. Kündigst du vorher, bekommst du ihn meist gar nicht oder nur teilweise.' },
  { id: 'todesfall', term: 'Todesfallleistung', re: /todesfall(leistung|summe|kapital|schutz)?|ableben/i, value: 'amount',
    text: 'Der Betrag, den die Bezugsberechtigten bekommen, wenn die versicherte Person während der Laufzeit stirbt.' },
  { id: 'praemienfrei', term: 'Prämienfreistellung', re: /pr[äa]mienfrei/i, value: 'amount',
    text: 'Du hörst auf zu zahlen, der Vertrag läuft aber mit geringerer Leistung weiter (prämienfreie Versicherungssumme). Oft günstiger als eine Kündigung, weil keine Stornokosten anfallen.' },
  { id: 'garantiezins', term: 'Garantiezins (Rechnungszins)', re: /(garantie|rechnungs|garantierter )zins/i, value: 'percent',
    text: 'Der garantierte Zinssatz – aber nur auf den Sparanteil deiner Prämie, nicht auf die ganze Prämie. Ältere Verträge haben oft höhere Garantiezinsen als neue.' },
  { id: 'abschlusskosten', term: 'Abschlusskosten', re: /abschlusskosten|abschlussprovision|provision/i, value: 'amount',
    text: 'Kosten für den Vertragsabschluss (vor allem Provision). Sie werden meist in den ersten Jahren von deinen Prämien abgezogen – deshalb ist der Rückkaufswert anfangs niedrig.' },
  { id: 'verwaltungskosten', term: 'Verwaltungskosten', re: /verwaltungskosten|laufende kosten|kostenanteil/i, value: 'amount',
    text: 'Laufende Kosten des Versicherers für deinen Vertrag. Sie werden jedes Jahr von deinen Prämien bzw. deinem Guthaben abgezogen.' },
  { id: 'risikopraemie', term: 'Risikoprämie', re: /risikopr[äa]mie|risikobeitrag|risikoanteil/i, value: 'amount',
    text: 'Der Teil deiner Prämie, der den Todesfallschutz bezahlt. Dieser Teil wird nicht angespart.' },
  { id: 'sparanteil', term: 'Sparanteil / Deckungskapital', re: /sparanteil|sparpr[äa]mie|deckungskapital|vertragsguthaben|deckungsr[üu]ckstellung/i, value: 'amount',
    text: 'Der Teil deiner Prämien, der nach Abzug von Kosten und Risikoprämie tatsächlich für dich angespart wird – das „Guthaben“ im Vertrag.' },
  { id: 'fonds', term: 'Fondsgebundene Versicherung', re: /fondsgebunden|fondsanteil|fondsverm[öo]gen|fondsguthaben|anteilswert/i, value: 'amount',
    text: 'Der Sparanteil wird in Investmentfonds angelegt. Der Wert schwankt mit den Börsenkursen und es gibt meist keinen Garantiezins – dafür mehr Chancen und mehr Risiko.' },
  { id: 'stornoabzug', term: 'Stornoabzug', re: /storno(abzug|kosten|geb[üu]hr)?|r[üu]ckkaufsabzug/i, value: 'amount',
    text: 'Eine Gebühr, die bei vorzeitiger Kündigung vom Rückkaufswert abgezogen wird. Ist im Rückkaufswert oft schon eingerechnet – auf die Formulierung achten.' },
  { id: 'versicherungssteuer', term: 'Versicherungssteuer', re: /versicherungssteuer/i, value: 'amount',
    text: 'In Österreich 4 % auf jede Prämie (bei sehr kurzer Laufzeit 11 %). Sie ist in deiner Prämie bereits enthalten und geht an den Staat.' },
  { id: 'dynamik', term: 'Dynamik / Wertanpassung', re: /dynamik|indexanpassung|wertanpassung|wertsicherung/i,
    text: 'Deine Prämie und Leistung steigen automatisch jedes Jahr, meist um die Inflation. Du kannst einer Erhöhung in der Regel widersprechen, ohne Nachteile für den Vertrag.' },
  { id: 'polizze', term: 'Polizze', re: /polizz?e|polizzennummer|vertragsnummer|versicherungsschein/i,
    text: 'Dein Versicherungsvertrag bzw. die Urkunde dazu. Die Polizzennummer brauchst du bei jeder Anfrage an die Versicherung.' },
  { id: 'versicherungsnehmer', term: 'Versicherungsnehmer', re: /versicherungsnehmer/i,
    text: 'Die Person, die den Vertrag abgeschlossen hat, die Prämien zahlt und Änderungen beantragen darf.' },
  { id: 'versichertePerson', term: 'Versicherte Person', re: /versicherte person/i,
    text: 'Die Person, auf deren Leben die Versicherung abgeschlossen ist. Oft identisch mit dem Versicherungsnehmer.' },
  { id: 'bezugsberechtigt', term: 'Bezugsberechtigung', re: /bezugsberechtig|beg[üu]nstigt/i,
    text: 'Wer im Versicherungsfall das Geld bekommt. Kann meistens jederzeit geändert werden – außer sie ist als „unwiderruflich“ eingetragen.' },
  { id: 'laufzeit', term: 'Laufzeit / Vertragsende', re: /ablauf(datum|termin)|vertragsende|laufzeit|versicherungsende/i,
    text: 'Wie lange der Vertrag läuft und wann die Ablaufleistung ausgezahlt wird. Für die Steuerfreiheit in Österreich gilt meist eine Mindestlaufzeit von 15 Jahren (bzw. 10 Jahre bei Einmalerlägen ab 50).' },
  { id: 'polizzendarlehen', term: 'Polizzendarlehen / Vorauszahlung', re: /polizzendarlehen|vorauszahlung|beleihung/i,
    text: 'Du „leihst“ dir Geld aus deinem Vertrag, ohne zu kündigen. Es wird mit Zinsen später von der Leistung abgezogen.' },
  { id: 'kuendigung', term: 'Kündigung (Rückkauf)', re: /k[üu]ndigung|r[üu]ckkauf\b|vorzeitige aufl[öo]sung/i,
    text: 'Wenn du kündigst, bekommst du den Rückkaufswert. Das ist besonders in den ersten Jahren oft weniger als eingezahlt. Vorher Prämienfreistellung oder Teilauszahlung überlegen.' },
];

const DOC_TYPES = [
  { type: 'Wertmitteilung', re: /wertmitteilung|standmitteilung|jahresmitteilung|vertragsstand|jahresinformation|kontoauszug/i,
    text: 'Der jährliche Brief mit dem aktuellen Stand deines Vertrags. Wichtig sind vor allem Rückkaufswert und eingezahlte Prämien.' },
  { type: 'Prämienvorschreibung', re: /pr[äa]mienvorschreibung|zahlungsaufforderung|vorschreibung|zahlungserinnerung|mahnung/i,
    text: 'Eine Aufforderung, eine Prämie zu zahlen. Prüfe Betrag und Fälligkeit – meist wird bereits per Lastschrift eingezogen.' },
  { type: 'Wertanpassung', re: /wertanpassung|indexanpassung|dynamik/i,
    text: 'Info, dass deine Prämie (und Leistung) steigt. Du kannst meist innerhalb einer Frist widersprechen.' },
  { type: 'Polizze / Vertrag', re: /polizze|versicherungsschein|antrag/i,
    text: 'Dein Vertrag. Hier stehen Laufzeit, Prämie, Versicherungssumme und Bezugsberechtigte.' },
  { type: 'Vertragsänderung', re: /nachtrag|vertrags[äa]nderung|[äa]nderungsmitteilung/i,
    text: 'Eine Änderung an deinem Vertrag – vergleiche die neuen mit den bisherigen Werten.' },
];

const parseNum = (s) => {
  let t = String(s).replace(/['\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return Number(t);
};

/** Geldbeträge in einer Zeile (ohne Datumsangaben und Prozentwerte). */
export function findAmounts(line) {
  const clean = String(line).replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/g, ' ');
  const out = [];
  const re = /(^|[^\d.,])(\d{1,3}(?:[.' ]\d{3})+|\d+)[,.](\d{2})(?!\d)(?!\s?%)/g;
  let m;
  while ((m = re.exec(clean))) {
    const v = parseNum(`${m[2]},${m[3]}`);
    if (v > 0 && v < 10000000) out.push(Math.round(v * 100) / 100);
  }
  return out;
}

function findPercent(line) {
  const m = String(line).match(/(\d{1,2}[,.]\d{1,3})\s?%/);
  return m ? parseNum(m[1]) : null;
}

/** Wertet den Text eines Versicherungsdokuments aus: Art, wichtige Werte, erklärte Begriffe, Datum. */
export function analyzeDocument(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const docType = DOC_TYPES.find((t) => t.re.test(raw)) || null;
  const terms = [];
  const values = [];
  for (const g of GLOSSARY) {
    const idx = lines.findIndex((l) => g.re.test(l));
    if (idx < 0) continue;
    terms.push(g);
    if (!g.value) continue;
    for (let i = idx; i < lines.length; i++) {
      if (!g.re.test(lines[i])) continue;
      let v = g.value === 'percent' ? findPercent(lines[i]) : findAmounts(lines[i]).pop();
      if (v == null && lines[i + 1] && !GLOSSARY.some((o) => o !== g && o.value && o.re.test(lines[i + 1]))) {
        v = g.value === 'percent' ? findPercent(lines[i + 1]) : findAmounts(lines[i + 1]).pop();
      }
      if (v != null && !Number.isNaN(v)) { values.push({ id: g.id, term: g.term, kind: g.value, value: v, line: lines[i] }); break; }
    }
  }
  const dateM = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  const date = dateM ? `${dateM[3]}-${dateM[2].padStart(2, '0')}-${dateM[1].padStart(2, '0')}` : null;
  const policyM = raw.match(/(?:polizz?en?|vertrags)[- ]?(?:nr\.?|nummer)\s*:?\s*([A-Z0-9][A-Z0-9./-]{3,})/i);
  // Hinweis: Rückkaufswert im Verhältnis zu den eingezahlten Prämien
  const rkw = values.find((v) => v.id === 'rueckkaufswert');
  const paid = values.find((v) => v.id === 'praemiensumme');
  const insights = [];
  if (rkw && paid && paid.value > 0) {
    const r = rkw.value / paid.value;
    insights.push(r >= 1
      ? `Der Rückkaufswert liegt ${Math.round((r - 1) * 100)} % über deinen eingezahlten Prämien – bei Kündigung jetzt würdest du nichts verlieren.`
      : `Der Rückkaufswert entspricht ${Math.round(r * 100)} % deiner eingezahlten Prämien. Bei Kündigung jetzt würdest du rund ${(paid.value - rkw.value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} weniger bekommen, als du eingezahlt hast.`);
  }
  if (terms.some((t) => t.id === 'garantiert') && values.some((v) => v.id === 'ablaufleistung')) {
    insights.push('Achte darauf, welcher Teil der Ablaufleistung garantiert ist – prognostizierte Werte sind nicht sicher.');
  }
  return { docType, values, terms, date, policyNo: policyM ? policyM[1] : null, insights };
}

/** Durchsucht Lexikon und Dokumenttexte; liefert Treffer mit Textausschnitt. */
export function searchAll(query, docs) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return { terms: [], docs: [] };
  const words = q.split(/\s+/).filter(Boolean);
  const hit = (s) => words.every((w) => s.toLowerCase().includes(w));
  const rank = (g) => (g.term.toLowerCase().includes(words[0]) || g.re.test(q) ? 0 : 1);
  const terms = GLOSSARY.filter((g) => hit(`${g.term} ${g.text}`) || g.re.test(q)).sort((a, b) => rank(a) - rank(b));
  const docHits = [];
  for (const d of docs) {
    const text = d.text || '';
    const lower = text.toLowerCase();
    if (!hit(`${d.name} ${text}`)) continue;
    const pos = lower.indexOf(words[0]);
    const from = Math.max(0, pos - 60);
    const snippet = pos >= 0 ? `${from > 0 ? '…' : ''}${text.slice(from, pos + 100).replace(/\s+/g, ' ')}…` : '';
    docHits.push({ doc: d, snippet });
  }
  return { terms, docs: docHits };
}
