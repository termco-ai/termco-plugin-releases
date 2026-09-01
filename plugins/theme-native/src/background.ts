const DB_NAME = "termco-bg-images";
const STORE = "images";
const MAX_DIM = 2560;
const JPEG_QUALITY = 0.88;
const MAX_STATIC_BYTES = 30 * 1024 * 1024;
const MAX_ANIMATED_BYTES = 10 * 1024 * 1024;
const WEBP_SNIFF_BYTES = 64;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => { if (dbPromise === pending) dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Background storage is blocked by another window"));
  }).catch((error) => { if (dbPromise === pending) dbPromise = null; throw error; });
  dbPromise = pending;
  return pending;
}

export async function putBackground(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(blob, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new Error("Not enough storage to save this image. Remove unused themes or backgrounds and try again.");
    }
    throw error;
  }
}

export async function getBackground(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteBackground(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function isAnimated(file: File): Promise<boolean> {
  const type = file.type.toLowerCase();
  if (type === "image/gif" || type === "image/apng") return true;
  if (type !== "image/webp") return false;
  const head = new Uint8Array(await file.slice(0, WEBP_SNIFF_BYTES).arrayBuffer());
  if (head.length < 30 || head[0] !== 0x52 || head[1] !== 0x49 || head[2] !== 0x46 || head[3] !== 0x46 || head[8] !== 0x57 || head[9] !== 0x45 || head[10] !== 0x42 || head[11] !== 0x50) return false;
  return head[12] === 0x56 && head[13] === 0x50 && head[14] === 0x38 && head[15] === 0x58 && (head[20] & 0x02) !== 0;
}

async function encodeJpeg(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("offscreen 2D context unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2D context unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  try {
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("failed to encode image")),
      "image/jpeg",
      JPEG_QUALITY,
    ));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function importBackground(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("This file isn't an image.");
  const animated = await isAnimated(file);
  const limit = animated ? MAX_ANIMATED_BYTES : MAX_STATIC_BYTES;
  if (file.size > limit) {
    const limitMb = Math.round(limit / 1024 / 1024);
    throw new Error(animated
      ? `Animated images are limited to ${limitMb} MB to keep things smooth. This one is ${formatBytes(file.size)}.`
      : `Images are limited to ${limitMb} MB. This one is ${formatBytes(file.size)}.`);
  }
  const id = crypto.randomUUID();
  if (animated) {
    await putBackground(id, file.slice(0, file.size, file.type));
    return id;
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("This image couldn't be decoded. Try a different file."); }
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  try {
    await putBackground(id, await encodeJpeg(bitmap, Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale))));
    return id;
  } finally {
    bitmap.close();
  }
}
