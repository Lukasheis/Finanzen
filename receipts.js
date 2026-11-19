// Rechnungsfotos: Verkleinern, auf dem Gerät speichern (IndexedDB) und Text erkennen.
// Die Fotos verlassen das Gerät nie. Für die Texterkennung lädt die App beim ersten Scan
// einmalig das Programm „Tesseract.js“ (Open Source) – das Foto selbst wird dabei nicht hochgeladen.

const DB_NAME = 'finanzen';
const STORE = 'receipts';
const DOCS = 'docs';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        for (const name of [STORE, DOCS]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error || new Error('Speicher für Fotos nicht verfügbar')); };
    });
  }
  return dbPromise;
}

async function tx(mode, fn, storeName = STORE) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Abgebrochen'));
  });
}

const reqP = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function saveReceipt(rec) {
  return tx('readwrite', (s) => reqP(s.put(rec)));
}

export async function getReceipt(id) {
  return tx('readonly', (s) => reqP(s.get(id)));
}

export async function deleteReceipt(id) {
  return tx('readwrite', (s) => reqP(s.delete(id)));
}

export async function allReceipts() {
  const list = await tx('readonly', (s) => reqP(s.getAll()));
  return (list || []).sort((a, b) => (a.date === b.date ? (b.createdAt || '').localeCompare(a.createdAt || '') : a.date < b.date ? 1 : -1));
}

// ---------- Bilder ----------

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Das Foto konnte nicht geöffnet werden.')); };
    img.src = url;
  });
}

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function draw(img, max) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Verkleinert ein Foto (spart Speicher) und erstellt ein Vorschaubild. */
export async function prepareImage(file) {
  const img = await loadImage(file);
  const [blob, thumb] = await Promise.all([toBlob(draw(img, 1600), 0.72), toBlob(draw(img, 240), 0.7)]);
  return { blob, thumb };
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataURLToBlob(url) {
  return (await fetch(url)).blob();
}

// ---------- Backup ----------

export async function exportReceipts() {
  const list = await allReceipts();
  return Promise.all(list.map(async (r) => ({ ...r, blob: undefined, thumb: undefined, image: await blobToDataURL(r.blob), thumbImage: await blobToDataURL(r.thumb) })));
}

export async function importReceipts(list) {
  const recs = await Promise.all((list || []).map(async (r) => {
    const { image, thumbImage, ...meta } = r;
    return { ...meta, blob: await dataURLToBlob(image), thumb: await dataURLToBlob(thumbImage || image) };
  }));
  await tx('readwrite', (s) => {
    s.clear(); // Anfragen laufen der Reihe nach – erst leeren, dann einfügen
    for (const r of recs) s.put(r);
  });
  return recs.length;
}

// ---------- Texterkennung ----------

let tessPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tessPromise) {
    tessPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Texterkennung nicht verfügbar')));
      s.onerror = () => { tessPromise = null; s.remove(); reject(new Error('Texterkennung konnte nicht geladen werden – bist du offline?')); };
      document.head.appendChild(s);
    });
  }
  return tessPromise;
}

/** Erkennt den Text auf dem Foto – direkt auf dem Gerät. */
export async function recognize(blob, onProgress) {
  const T = await loadTesseract();
  const worker = await T.createWorker('deu', 1, {
    logger: (m) => { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); },
  });
  try {
    const { data } = await worker.recognize(blob);
    return data.text || '';
  } finally {
    worker.terminate();
  }
}

// ---------- Versicherungsdokumente ----------

export const saveDoc = (doc) => tx('readwrite', (s) => reqP(s.put(doc)), DOCS);
export const getDoc = (id) => tx('readonly', (s) => reqP(s.get(id)), DOCS);
export const deleteDoc = (id) => tx('readwrite', (s) => reqP(s.delete(id)), DOCS);
export async function allDocs() {
  const list = await tx('readonly', (s) => reqP(s.getAll()), DOCS);
  return (list || []).sort((a, b) => ((b.date || b.createdAt || '') < (a.date || a.createdAt || '') ? -1 : 1));
}

export async function exportDocs() {
  const list = await allDocs();
  return Promise.all(list.map(async (d) => ({ ...d, blob: undefined, thumb: undefined, file: await blobToDataURL(d.blob), thumbImage: d.thumb ? await blobToDataURL(d.thumb) : null })));
}

export async function importDocs(list) {
  const recs = await Promise.all((list || []).map(async (d) => {
    const { file, thumbImage, ...meta } = d;
    return { ...meta, blob: await dataURLToBlob(file), thumb: thumbImage ? await dataURLToBlob(thumbImage) : null };
  }));
  await tx('readwrite', (s) => { s.clear(); for (const r of recs) s.put(r); }, DOCS);
  return recs.length;
}

let pdfPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfPromise) {
    pdfPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${PDFJS}/pdf.min.js`;
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        if (!window.pdfjsLib) return reject(new Error('PDF-Leser nicht verfügbar'));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
        resolve(window.pdfjsLib);
      };
      s.onerror = () => { pdfPromise = null; s.remove(); reject(new Error('PDF-Leser konnte nicht geladen werden – bist du offline?')); };
      document.head.appendChild(s);
    });
  }
  return pdfPromise;
}

async function renderPdfPage(page, scale) {
  const viewport = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(viewport.width);
  c.height = Math.round(viewport.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return c;
}

/**
 * Liest ein Dokument (Foto oder PDF) ein: verkleinertes Bild bzw. Original-PDF, Vorschaubild und Text.
 * onStatus(text, progress 0..1) meldet den Fortschritt.
 */
export async function readDocument(file, onStatus = () => {}) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) {
    onStatus('Foto wird vorbereitet …', 0.02);
    const { blob, thumb } = await prepareImage(file);
    onStatus('Text wird erkannt …', 0.05);
    const text = await recognize(blob, (p) => onStatus(`Text wird erkannt … ${Math.round(p * 100)} %`, p));
    return { blob, thumb, text, mime: 'image/jpeg', pages: 1 };
  }
  onStatus('PDF wird geöffnet …', 0.02);
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  const first = await pdf.getPage(1);
  const thumb = await toBlob(await renderPdfPage(first, 240 / first.getViewport({ scale: 1 }).width), 0.7);
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    for (const item of content.items) {
      const y = item.transform ? item.transform[5] : null;
      text += lastY !== null && y !== null && Math.abs(y - lastY) > 2 ? `\n${item.str}` : `${lastY === null ? '' : ' '}${item.str}`;
      lastY = y;
    }
    text += '\n';
    onStatus(`Seite ${i} von ${pdf.numPages} gelesen`, i / pdf.numPages);
  }
  if (text.replace(/\s/g, '').length < 40) {
    // Eingescanntes PDF ohne Text: die ersten Seiten per Texterkennung lesen
    text = '';
    const n = Math.min(pdf.numPages, 4);
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const canvas = await renderPdfPage(page, 1600 / page.getViewport({ scale: 1 }).width);
      const img = await toBlob(canvas, 0.85);
      text += `${await recognize(img, (p) => onStatus(`Seite ${i} von ${n}: Text wird erkannt … ${Math.round(p * 100)} %`, (i - 1 + p) / n))}\n`;
    }
  }
  return { blob: new Blob([buf], { type: 'application/pdf' }), thumb, text, mime: 'application/pdf', pages: pdf.numPages };
}
