import { loadDbFromArrayBuffer } from './db_uploader.js';
import { t } from './i18n.js';
import { saveDirectoryHandle, loadDirectoryHandle, clearDirectoryHandle } from './utils/handle_store.js';

/**
 * File System Access API (showDirectoryPicker) を使って beatoraja ルートフォルダを選択させ、
 * config_sys.json を起点に score.db / scorelog.db / songdata.db を自動特定して読み込む。
 * 非対応ブラウザ（Chromium 系以外）ではセクションを非表示にし、手動アップロードへフォールバックする。
 * 一度読み込んだフォルダのハンドルは IndexedDB に記憶し、次回は権限確認だけで再読み込みできる。
 */

let statusEl;
let selectWrap;
let profileSelect;
let restoreBtn;

// 前回読み込んだプレイヤー名の記憶用キー
const LAST_PLAYER_STORAGE_KEY = 'folder_picker.last_player';

// processDirectory 実行中のルートハンドル（読み込み成功時に永続化する対象）
let currentRootHandle = null;

document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('folder-picker-section');
    const pickBtn = document.getElementById('folder-picker-btn');
    const manualDetails = document.getElementById('manual-upload');
    statusEl = document.getElementById('folder-picker-status');
    selectWrap = document.getElementById('folder-player-select-wrap');
    profileSelect = document.getElementById('folder-player-select');
    restoreBtn = document.getElementById('folder-restore-btn');

    if (!section || !pickBtn) return;

    // 機能検出: 非対応なら手動選択を主 UI として開いておき、フォルダ選択セクションは隠したままにする
    if (typeof window.showDirectoryPicker !== 'function') {
        if (manualDetails) manualDetails.open = true;
        return;
    }

    section.hidden = false;
    pickBtn.addEventListener('click', handlePick);
    if (profileSelect) profileSelect.addEventListener('change', handleProfileChange);
    if (restoreBtn) restoreBtn.addEventListener('click', handleRestore);

    // 記憶済みのフォルダがあれば「前回のフォルダから読み込む」ボタンを表示する
    initRestoreButton();
});

// 記憶済みハンドルを読み込み、あれば復元ボタンを表示する
async function initRestoreButton() {
    if (!restoreBtn) return;
    const handle = await loadDirectoryHandle();
    if (!handle) return;
    restoreBtn.textContent = t('folder.restore_button', { name: handle.name });
    restoreBtn.hidden = false;
}

// 復元ボタン: 権限を確認（必要なら要求）してから記憶済みフォルダを再処理する
async function handleRestore() {
    resetStatus();
    if (selectWrap) selectWrap.hidden = true;

    const handle = await loadDirectoryHandle();
    if (!handle) {
        // ハンドルが消えていた場合は通常のフォルダ選択へ誘導
        await forgetStoredFolder();
        showError(t('folder.error_restore'));
        return;
    }

    let granted = true;
    try {
        // queryPermission / requestPermission が無い実装（古い環境・モック）は granted 扱い
        if (typeof handle.queryPermission === 'function') {
            const status = await handle.queryPermission({ mode: 'read' });
            if (status !== 'granted') {
                if (typeof handle.requestPermission === 'function') {
                    const req = await handle.requestPermission({ mode: 'read' });
                    granted = req === 'granted';
                } else {
                    granted = false;
                }
            }
        }
    } catch (e) {
        granted = false;
    }

    if (!granted) {
        await forgetStoredFolder();
        showError(t('folder.error_restore'));
        return;
    }

    await processDirectory(handle, { fromRestore: true });
}

// 記憶を破棄し、復元ボタンを隠す
async function forgetStoredFolder() {
    await clearDirectoryHandle();
    if (restoreBtn) restoreBtn.hidden = true;
}

// 複数プロファイル選択時に、確定ボタンから参照するための状態
let pendingCandidates = null;
let pendingSongdataHandle = null;

async function handlePick() {
    resetStatus();
    if (selectWrap) selectWrap.hidden = true;

    let dirHandle;
    try {
        dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (e) {
        // ユーザーがダイアログをキャンセルした場合は静かに無視
        if (e && e.name === 'AbortError') return;
        showError(t('folder.error_generic'));
        return;
    }

    await processDirectory(dirHandle);
}

async function processDirectory(rootHandle, options = {}) {
    const fromRestore = options.fromRestore === true;
    // 読み込み成功時に永続化する対象として保持
    currentRootHandle = rootHandle;

    // 1. config_sys.json の存在で beatoraja ルートを判定
    let config;
    try {
        const fh = await rootHandle.getFileHandle('config_sys.json');
        const file = await fh.getFile();
        config = JSON.parse(await file.text());
    } catch (e) {
        if (fromRestore) {
            // 記憶したフォルダが移動・削除された場合は記憶を破棄して選び直しへ誘導
            await forgetStoredFolder();
            showError(t('folder.error_restore'));
        } else {
            showError(t('folder.error_not_beatoraja'));
        }
        return;
    }

    const songpath = config.songpath || 'songdata.db';
    const playerpath = config.playerpath || 'player';

    // 2. songdata.db を解決
    const songdataHandle = await resolveFileHandle(rootHandle, songpath, 'songdata.db');
    if (!songdataHandle) {
        showError(t('folder.error_no_songdata'));
        return;
    }

    // 3. player ディレクトリを解決
    const playerDir = await resolveDirHandle(rootHandle, playerpath, 'player');
    if (!playerDir) {
        showError(t('folder.error_no_player'));
        return;
    }

    // 4. score.db を持つプロファイルディレクトリを列挙
    const candidates = [];
    for await (const entry of playerDir.values()) {
        if (entry.kind !== 'directory') continue;
        try {
            await entry.getFileHandle('score.db');
            candidates.push(entry);
        } catch (e) {
            // score.db が無いディレクトリは候補から除外
        }
    }

    if (candidates.length === 0) {
        showError(t('folder.error_no_profiles'));
        return;
    }

    // 5. プレイヤーセレクトを表示し、自動選択したプレイヤーを即読み込む
    await setupProfileSelect(candidates, songdataHandle, config);
}

// 自動選択の優先順: 前回読み込んだプレイヤー（localStorage） → config_sys.json の playername → 先頭
function pickAutoProfileIndex(candidates, config) {
    const remembered = localStorage.getItem(LAST_PLAYER_STORAGE_KEY);
    if (remembered) {
        const i = candidates.findIndex(c => c.name === remembered);
        if (i >= 0) return i;
    }
    if (config.playername) {
        const i = candidates.findIndex(c => c.name === config.playername);
        if (i >= 0) return i;
    }
    return 0;
}

async function setupProfileSelect(candidates, songdataHandle, config) {
    const autoIndex = pickAutoProfileIndex(candidates, config);

    if (!selectWrap || !profileSelect) {
        // select UI が無い環境では自動選択のみ（安全側フォールバック）
        await loadProfile(candidates[autoIndex], songdataHandle);
        return;
    }
    pendingCandidates = candidates;
    pendingSongdataHandle = songdataHandle;

    profileSelect.innerHTML = '';
    candidates.forEach((c, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = c.name;
        profileSelect.appendChild(opt);
    });
    profileSelect.value = String(autoIndex);
    // 候補が1つでも「どのプレイヤーを読み込んだか」が分かるよう常に表示する
    profileSelect.disabled = candidates.length === 1;
    selectWrap.hidden = false;

    await loadProfile(candidates[autoIndex], songdataHandle);
}

// セレクト変更で即座に選択プレイヤーを再読み込みする
async function handleProfileChange() {
    if (!pendingCandidates || !profileSelect) return;
    const idx = parseInt(profileSelect.value, 10);
    const profile = pendingCandidates[idx];
    if (!profile) return;
    await loadProfile(profile, pendingSongdataHandle);
}

async function loadProfile(profileHandle, songdataHandle) {
    showStatus(t('folder.loading'), 'info');

    // score.db は候補判定時に存在確認済み。scorelog.db は個別に確認する。
    let scoreHandle;
    let scorelogHandle;
    try {
        scoreHandle = await profileHandle.getFileHandle('score.db');
    } catch (e) {
        showError(t('folder.error_no_profiles'));
        return;
    }
    try {
        scorelogHandle = await profileHandle.getFileHandle('scorelog.db');
    } catch (e) {
        showError(t('folder.error_no_scorelog'));
        return;
    }

    try {
        const scoreBuf = await (await scoreHandle.getFile()).arrayBuffer();
        const scorelogBuf = await (await scorelogHandle.getFile()).arrayBuffer();
        const songdataBuf = await (await songdataHandle.getFile()).arrayBuffer();

        await loadDbFromArrayBuffer('score.db', scoreBuf);
        await loadDbFromArrayBuffer('scorelog.db', scorelogBuf);
        await loadDbFromArrayBuffer('songdata.db', songdataBuf);
    } catch (e) {
        showError(t('folder.error_load') + (e && e.message ? e.message : e));
        return;
    }

    // 次回フォルダ選択時の自動選択用に、最後に読み込んだプレイヤーを記憶する
    try {
        localStorage.setItem(LAST_PLAYER_STORAGE_KEY, profileHandle.name);
    } catch (e) {
        // localStorage が使えない環境（プライベートモード等）では記憶をスキップ
    }

    // 読み込み完全成功時に、次回再利用のためルートフォルダのハンドルを永続化する。
    // 保存失敗（モックハンドル・非対応環境等）は握りつぶし、本体フローには影響させない。
    if (currentRootHandle) {
        const saved = await saveDirectoryHandle(currentRootHandle);
        if (saved && restoreBtn) {
            restoreBtn.textContent = t('folder.restore_button', { name: currentRootHandle.name });
            restoreBtn.hidden = false;
        }
    }

    showStatus(t('folder.success', { player: profileHandle.name }), 'success');
}

/* ============================================
   パス解決ヘルパ
   ============================================ */

// 絶対パス判定: "/" 始まり、または "X:" 形式（Windows ドライブ）
function isAbsolutePath(p) {
    return /^([A-Za-z]:|\/)/.test(p);
}

// パスを "/" 区切りに正規化し、"." や空セグメントを除いた配列を返す
function splitPath(rawPath) {
    return rawPath
        .replace(/\\/g, '/')
        .split('/')
        .filter(seg => seg && seg !== '.');
}

// rawPath をファイルハンドルとして解決。絶対パスや非標準構成は解決不能として null を返す。
async function tryResolveFile(root, rawPath) {
    const normalized = rawPath.replace(/\\/g, '/');
    if (isAbsolutePath(normalized)) return null;
    const segments = splitPath(rawPath);
    if (segments.length === 0) return null;
    const fileName = segments.pop();
    let dir = root;
    try {
        for (const seg of segments) {
            dir = await dir.getDirectoryHandle(seg);
        }
        return await dir.getFileHandle(fileName);
    } catch (e) {
        return null;
    }
}

// rawPath で解決を試み、失敗したら既定ファイル名でルート直下を再試行する
async function resolveFileHandle(root, rawPath, defaultName) {
    const handle = await tryResolveFile(root, rawPath);
    if (handle) return handle;
    if (rawPath !== defaultName) {
        return await tryResolveFile(root, defaultName);
    }
    return null;
}

async function tryResolveDir(root, rawPath) {
    const normalized = rawPath.replace(/\\/g, '/');
    if (isAbsolutePath(normalized)) return null;
    const segments = splitPath(rawPath);
    let dir = root;
    try {
        for (const seg of segments) {
            dir = await dir.getDirectoryHandle(seg);
        }
        return dir;
    } catch (e) {
        return null;
    }
}

async function resolveDirHandle(root, rawPath, defaultName) {
    const dir = await tryResolveDir(root, rawPath);
    if (dir) return dir;
    if (rawPath !== defaultName) {
        return await tryResolveDir(root, defaultName);
    }
    return null;
}

/* ============================================
   ステータス表示
   ============================================ */

function resetStatus() {
    if (!statusEl) return;
    statusEl.textContent = '';
    statusEl.classList.remove('message-error', 'message-success');
}

// kind: 'info' | 'success'
function showStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('message-error', 'message-success');
    if (kind === 'success') {
        statusEl.classList.add('message-success');
    }
}

// エラー表示。手動選択へのフォールバック誘導を末尾に付ける。
function showError(message) {
    if (!statusEl) return;
    statusEl.textContent = message + t('folder.fallback_hint');
    statusEl.classList.remove('message-success');
    statusEl.classList.add('message-error');
}
