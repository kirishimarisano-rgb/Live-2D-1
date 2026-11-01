// 存在這台瀏覽器裡的個人設定：名字（localStorage）、自訂背景圖（IndexedDB，圖比較大）。
// 無痕模式或封鎖網站資料時存不了，就當作沒有設定。

export function loadText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveText(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* 存不了就算了 */
  }
}

const DB = 'kanban-musume';
const STORE = 'files';

function openDb(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

export async function loadBlob(key: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise((ok) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => ok((req.result as Blob) ?? null);
      req.onerror = () => ok(null);
    });
  } catch {
    return null;
  }
}

export async function saveBlob(key: string, blob: Blob | null): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise((ok) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      if (blob) st.put(blob, key);
      else st.delete(key);
      tx.oncomplete = () => ok(true);
      tx.onerror = () => ok(false);
    });
  } catch {
    return false;
  }
}

/** Blob → 載好的 <img> */
export function blobImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = fail;
    im.src = URL.createObjectURL(blob);
  });
}
