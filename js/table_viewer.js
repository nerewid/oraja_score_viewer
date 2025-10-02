// 難易度表閲覧ページのメインスクリプト

// --- グローバル変数 ---
let difficultyTablesConfig = [];

// --- DOM要素への参照 ---
const tableSelect = document.getElementById('table-select');
const loadingArea = document.getElementById('loading-area');
const errorArea = document.getElementById('error-area');
const errorMessage = document.getElementById('error-message');
const tableInfo = document.getElementById('table-info');
const tableTitle = document.getElementById('table-title');
const tableStats = document.getElementById('table-stats');
const tableContainer = document.getElementById('table-container');

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadDifficultyTables();
    } catch (error) {
        showError(`難易度表一覧の読み込みに失敗しました: ${error.message}`);
    }
});

// --- イベントリスナー ---
tableSelect.addEventListener('change', async (event) => {
    const selectedInternalFileName = event.target.value;

    if (!selectedInternalFileName) {
        hideAllAreas();
        return;
    }

    await displayTable(selectedInternalFileName);
});

// --- 関数定義 ---

/**
 * 難易度表一覧を読み込み、プルダウンに設定する
 */
async function loadDifficultyTables() {
    const url = './raw_difficulty_table_data/difficulty_tables.json';

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (Array.isArray(data)) {
            difficultyTablesConfig = data;
        } else if (data && Array.isArray(data.tables)) {
            difficultyTablesConfig = data.tables;
        } else {
            throw new Error('予期しない形式の難易度表一覧データです');
        }

        populateTableSelect();
    } catch (error) {
        console.error('難易度表一覧の読み込みエラー:', error);
        throw error;
    }
}

/**
 * プルダウンに難易度表の選択肢を追加
 */
function populateTableSelect() {
    // デフォルトオプション以外をクリア
    tableSelect.innerHTML = '<option value="">-- 難易度表を選択してください --</option>';

    difficultyTablesConfig.forEach(table => {
        const option = document.createElement('option');
        option.value = table.internalFileName;
        option.textContent = table.tableFullName;
        tableSelect.appendChild(option);
    });
}

/**
 * 選択された難易度表のデータを読み込み、テーブルとして表示
 */
async function displayTable(internalFileName) {
    hideAllAreas();
    showLoading();

    try {
        // 難易度表の設定を取得
        const tableConfig = difficultyTablesConfig.find(t => t.internalFileName === internalFileName);
        if (!tableConfig) {
            throw new Error('難易度表の設定が見つかりません');
        }

        // 難易度表データを読み込み
        const tableData = await loadTableData(internalFileName);

        if (!tableData.songs || !Array.isArray(tableData.songs)) {
            throw new Error('難易度表データの形式が不正です');
        }

        // ソート（levels配列が定義されていればその順序、なければ自動ソート）
        const sortedSongs = sortByLevels(tableData.songs, tableConfig.levels);

        // テーブル情報を表示
        showTableInfo(tableConfig, sortedSongs);

        // テーブルを生成
        generateTable(sortedSongs, tableConfig);

        hideLoading();
    } catch (error) {
        console.error('難易度表の表示エラー:', error);
        hideLoading();
        showError(`難易度表の表示に失敗しました: ${error.message}`);
    }
}

/**
 * 難易度表データを読み込む
 */
async function loadTableData(internalFileName) {
    const url = `./raw_difficulty_table_data/${internalFileName}.json`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`楽曲データの読み込みエラー (${url}):`, error);
        throw error;
    }
}

/**
 * 楽曲をレベル順にソート
 */
function sortByLevels(songs, predefinedLevels) {
    if (predefinedLevels && Array.isArray(predefinedLevels)) {
        // predefinedLevelsの順序でソート
        return songs.slice().sort((a, b) => {
            const indexA = predefinedLevels.indexOf(a.level);
            const indexB = predefinedLevels.indexOf(b.level);

            // レベルが見つからない場合は最後に配置
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;

            return indexA - indexB;
        });
    } else {
        // 従来の自動ソート（数値優先、その後文字列）
        return songs.slice().sort((a, b) => {
            const numA = parseInt(a.level, 10);
            const numB = parseInt(b.level, 10);

            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            if (isNaN(numA) && !isNaN(numB)) return 1;
            if (!isNaN(numA) && isNaN(numB)) return -1;

            return a.level.localeCompare(b.level);
        });
    }
}

/**
 * テーブル情報を表示
 */
function showTableInfo(tableConfig, songs) {
    tableTitle.textContent = tableConfig.tableFullName;

    // レベルごとの曲数を集計
    const levelCounts = new Map();
    songs.forEach(song => {
        const count = levelCounts.get(song.level) || 0;
        levelCounts.set(song.level, count + 1);
    });

    tableStats.textContent = `総曲数: ${songs.length}曲 / レベル数: ${levelCounts.size}`;
    tableInfo.classList.remove('hidden');
}

/**
 * テーブルを生成して表示
 */
function generateTable(songs, tableConfig) {
    const shortName = tableConfig.shortName || '';

    // レベルごとにグループ化
    const groupedByLevel = new Map();
    songs.forEach(song => {
        if (!groupedByLevel.has(song.level)) {
            groupedByLevel.set(song.level, []);
        }
        groupedByLevel.get(song.level).push(song);
    });

    let html = '<table class="difficulty-table">';
    html += '<thead><tr class="main-header">';
    html += '<th>Title</th>';
    html += '<th>Artist</th>';
    html += '<th>BMS URL</th>';
    html += '<th>Chart URL</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    groupedByLevel.forEach((songsInLevel, level) => {
        const displayLevel = shortName + level;

        // レベルヘッダー行（2段目のヘッダー）
        html += `<tr class="level-header">`;
        html += `<th colspan="4">${escapeHtml(displayLevel)}</th>`;
        html += `</tr>`;

        // そのレベルの楽曲行
        songsInLevel.forEach((song) => {
            html += '<tr>';

            // Title（LR2IRランキングページへのリンク）
            if (song.md5) {
                const lr2irUrl = `http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking&bmsmd5=${song.md5}`;
                html += `<td><a href="${lr2irUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(song.title)}</a></td>`;
            } else {
                html += `<td>${escapeHtml(song.title)}</td>`;
            }

            // Artist
            html += `<td>${escapeHtml(song.artist || '')}</td>`;

            // BMS URL
            if (song.url) {
                html += `<td class="url-cell"><a href="${escapeHtml(song.url)}" target="_blank" rel="noopener noreferrer">🔗</a></td>`;
            } else {
                html += '<td class="url-cell">-</td>';
            }

            // Chart URL (url_diff)
            if (song.url_diff) {
                html += `<td class="url-cell"><a href="${escapeHtml(song.url_diff)}" target="_blank" rel="noopener noreferrer">🔗</a></td>`;
            } else {
                html += '<td class="url-cell">-</td>';
            }

            html += '</tr>';
        });
    });

    html += '</tbody></table>';
    tableContainer.innerHTML = html;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * ローディング表示
 */
function showLoading() {
    loadingArea.classList.remove('hidden');
}

/**
 * ローディング非表示
 */
function hideLoading() {
    loadingArea.classList.add('hidden');
}

/**
 * エラー表示
 */
function showError(message) {
    errorMessage.textContent = message;
    errorArea.classList.remove('hidden');
}

/**
 * すべてのエリアを非表示
 */
function hideAllAreas() {
    loadingArea.classList.add('hidden');
    errorArea.classList.add('hidden');
    tableInfo.classList.add('hidden');
    tableContainer.innerHTML = '';
}
