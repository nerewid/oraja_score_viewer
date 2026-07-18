/**
 * FileSystemDirectoryHandle を IndexedDB に永続化する小さなヘルパ。
 * 次回アクセス時に「前回選んだ beatoraja フォルダ」を再利用できるようにする。
 *
 * すべての関数は失敗しても throw せず、null / false を返す（呼び出し元の本体フローを壊さない）。
 * 特に、structured clone できないモックハンドル（関数を含む plain object）を save しようとしても
 * ここで握りつぶし、通常フローに影響を与えない。
 */

const DB_NAME = 'oraja_score_viewer';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'beatoraja_root';

// IndexedDB を開く（objectStore が無ければ作成）。失敗時は null。
function openDb() {
    return new Promise((resolve) => {
        try {
            if (typeof indexedDB === 'undefined') {
                resolve(null);
                return;
            }
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

/**
 * ディレクトリハンドルを保存する。
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<boolean>} 保存に成功したら true
 */
export async function saveDirectoryHandle(handle) {
    const db = await openDb();
    if (!db) return false;
    try {
        return await new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            // put 自体が structured clone に失敗して同期 throw する場合があるため try で囲む
            try {
                tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
            } catch (e) {
                resolve(false);
                return;
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
        });
    } catch (e) {
        return false;
    } finally {
        db.close();
    }
}

/**
 * 保存済みのディレクトリハンドルを復元する。
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function loadDirectoryHandle() {
    const db = await openDb();
    if (!db) return null;
    try {
        return await new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            let req;
            try {
                req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
            } catch (e) {
                resolve(null);
                return;
            }
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    } finally {
        db.close();
    }
}

/**
 * 保存済みのディレクトリハンドルを削除する。
 * @returns {Promise<boolean>} 削除に成功したら true
 */
export async function clearDirectoryHandle() {
    const db = await openDb();
    if (!db) return false;
    try {
        return await new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            try {
                tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
            } catch (e) {
                resolve(false);
                return;
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
        });
    } catch (e) {
        return false;
    } finally {
        db.close();
    }
}
