// Rechnungsfotos: Verkleinern, auf dem Gerät speichern (IndexedDB) und Text erkennen.
// Die Fotos verlassen das Gerät nie. Für die Texterkennung lädt die App beim ersten Scan
// einmalig das Programm „Tesseract.js“ (Open Source) – das Foto selbst wird dabei nicht hochgeladen.

const DB_NAME = 'finanzen';
const STORE = 'receipts';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error || new Error('Speicher für Fotos nicht verfügbar')); };
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const store = t.objectStore(STORE);
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
