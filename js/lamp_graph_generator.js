// --- ES Module Imports ---

import { sqlPromise } from './db_uploader.js';
import { getSha256ToMd5Map } from './score_change_to_json.js';
import { scoreDbData } from './db_uploader.js';
import { songdataDbData } from './db_uploader.js';
import { t } from './i18n.js';
import { CLEAR_STATUS, CLEAR_STATUS_ORDER } from './constants.js';
import { executeBatchQuery } from './utils/batch-query.js';

// --- グローバル変数・定数 ---

// sql.js のコアオブジェクト (初期化後に設定)
let SQL;

// Md5 -> Sha256 の逆引きMap (初期化後に設定)
let Md5Tosha256Map;

// 難易度表の定義一覧（levels配列を含む）
let difficultyTablesConfig = [];

// CLEAR_STATUS, CLEAR_STATUS_ORDER は constants.js から、チャンク関数は sql-chunker.js からインポート

// 現在選択中の集計データ（モジュールスコープ）
let currentAggregatedData = null;
let currentShortName = null;

// HTML要素への参照
const difficultyTableSelect = document.getElementById('difficulty-table-select');
const lnModeRadios = document.querySelectorAll('input[type="radio"][name="ln-mode"]');
const lampGraphArea = document.getElementById('lamp-graph-area');
const songListArea = document.getElementById('song-list-area');

// --- 事前準備 ---

/**
 * sha256ToMd5Map から逆引き用の Md5Tosha256Map を作成する
 * (importされたsha256ToMd5Mapを直接使用する)
 * @returns {Map<string, string>} MD5をキー、SHA256を値とするMap
 */
function createMd5ToSha256Map() {
    const sha256ToMd5Map = getSha256ToMd5Map();
    const md5Map = new Map();
    if (sha256ToMd5Map instanceof Map) {
        for (const [sha256, md5] of sha256ToMd5Map.entries()) {
            if (md5) { // md5が存在する場合のみ登録
                md5Map.set(md5, sha256);
            }
        }
    } else {
        console.error("インポートされた sha256ToMd5Map が Map オブジェクトではありません。");
        // 必要であればエラー処理を追加
    }
    return md5Map;
}

// --- データ取得・処理関数 ---

/**
 * 難易度表一覧のデータを読み込む
 * @returns {Promise<Array<object>>} 難易度表データの配列
 */
async function loadDifficultyTables() {
    // パスは実際のファイル配置に合わせて調整してください
    const url = './raw_difficulty_table_data/difficulty_tables.json';
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        }
        const data = await response.json();
        // difficulty_tables.json が直接配列か、特定のキーの下にあるかで調整
        let tables = [];
        if (Array.isArray(data)) {
            tables = data;
        } else if (data && Array.isArray(data.tables)) { // 例: { "tables": [...] } の形式
             tables = data.tables;
        } else {
            console.warn(`予期しない形式の難易度表一覧データです (${url})`);
            tables = [];
        }

        // グローバル変数に保存（levels配列を保持）
        difficultyTablesConfig = tables;

        return tables;
    } catch (error) {
        console.error(`難易度表一覧データ(${url})の読み込みに失敗しました:`, error);
        throw error; // エラーを呼び出し元に伝える
        // return []; // またはデフォルト値を返す
    }
}


/**
 * internalFileNameに基づいて難易度表データを読み込む
 * @param {string} internalFileName - 読み込むJSONファイル名 (拡張子なし)
 * @returns {Promise<object>} 楽曲データオブジェクト ({ songs: [...] })
 */
async function loadSongData(internalFileName) {
    // パスは実際のファイル配置に合わせて調整してください
    const url = `./raw_difficulty_table_data/${internalFileName}.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`楽曲データ(${url})の読み込みに失敗しました:`, error);
        // エラーが発生した場合、空のデータを返すか、例外を再スローするなど、適切に処理
        throw error; // エラーを呼び出し元に伝える
        // return { songs: [] }; // またはデフォルト値を返す
    }
}


/**
 * 指定された複数のSHA256ハッシュに対応するスコアデータをscoreDbData(Uint8Array)から一括取得する
 * @param {Array<string>} sha256List - 取得したいスコアのSHA256ハッシュ値の配列
 * @param {number} selectedLnModeValue - LNモード値
 * @returns {Promise<Map<string, { clear: number, minbp: number | null }>>} - SHA256をキーとしたスコアデータのMap
 */
async function getScoresBySha256s(sha256List, selectedLnModeValue) {
    const queryTemplate = `SELECT sha256, clear, minbp FROM score WHERE mode = ${selectedLnModeValue} AND sha256 IN ({placeholders})`;

    const scoresMap = await executeBatchQuery(SQL, scoreDbData, queryTemplate, sha256List, (row, result) => {
        const clearValue = Number(row.clear);
        const minbpValue = row.minbp !== undefined && row.minbp !== null ? Number(row.minbp) : null;
        const notes = Number(row.notes);
        const mode = Number(row.mode);
        const epg = Number(row.epg);
        const lpg = Number(row.lpg);
        const egr = Number(row.egr);
        const lgr = Number(row.lgr);
        const exscore = epg + lpg + egr + lgr;

        result.set(row.sha256, {
            clear: isNaN(clearValue) ? 0 : clearValue,
            minbp: isNaN(minbpValue) ? null : minbpValue,
            notes: notes,
            mode: mode,
            exscore: exscore
        });
    });

    console.log(`スコア一括取得完了。取得できたスコア数: ${scoresMap.size}`);
    return scoresMap;
}


/**
 * 指定された複数のSHA256ハッシュに対応する楽曲データがsongdataに存在するか判定する
 * @param {Array<string>} sha256List - 確認したいSHA256ハッシュ値の配列
 * @returns {Promise<Array<string>>} - 存在するSHA256の配列
 */
async function checkExistSongsBySha256s(sha256List) {
    const queryTemplate = `SELECT sha256 FROM song WHERE sha256 IN ({placeholders})`;

    const existingSongs = await executeBatchQuery(SQL, songdataDbData, queryTemplate, sha256List, (row, result) => {
        result.push(row.sha256);
    }, () => []);

    console.log(`楽曲データ一括取得完了。取得できた譜面数: ${existingSongs.length}`);
    return existingSongs;
}


/**
 * 楽曲リストとスコアデータを処理し、レベル別・クリア状況別に集計する
 * @param {Array<object>} songs - 楽曲データの配列
 * @returns {Promise<{ songDetails: Array<object>, aggregatedData: Map<string, Map<string, { count: number, songs: Array<object> }>> }>}
 */
async function processSongScores(songs, selectedLnModeValue) {
    const aggregatedData = new Map(); // Map<level, Map<clearStatus, { count: number, songs: [] }>>
    const songDetails = []; // 処理後の楽曲情報を格納する配列
    const sha256ToFetch = new Set(); // スコアを取得する必要があるユニークなSHA256のセット
    const tempSongInfos = []; // 一時的に楽曲情報を保持する配列

    if (!Md5Tosha256Map) {
        console.error("Md5Tosha256Mapが初期化されていません。");
        return { songDetails: [], aggregatedData: new Map() };
    }

    // --- フェーズ1: SHA256の特定と収集 ---
    console.log("フェーズ1: SHA256の特定と収集を開始...");
    for (const song of songs) {
        let currentSha256 = song.sha256;
        const md5 = song.md5;
        const level = String(song.level);
        const title = song.title;
        const site_url = song.site_url ? song.site_url : null;

        // sha256 がない場合、md5 から変換を試みる
        if (!currentSha256 && md5 && Md5Tosha256Map.has(md5)) {
            currentSha256 = Md5Tosha256Map.get(md5);
            // console.log(`MD5 (<span class="math-inline">\{md5\}\) から SHA256 \(</span>{currentSha256}) を取得しました: ${title}`);
        }

        // 一時的な楽曲情報を保存
        tempSongInfos.push({
            originalSong: song, // 元の楽曲オブジェクトへの参照 (必要なら)
            level: level,
            title: title,
            md5: md5,
            sha256: currentSha256, // 特定できたsha256も保持
            site_url: site_url
        });

        // スコア取得が必要なSHA256リストに追加
        if (currentSha256) {
            sha256ToFetch.add(currentSha256);
        }
    }
    console.log(`フェーズ1完了。スコア取得対象のユニークなSHA256数: ${sha256ToFetch.size}`);


    // --- フェーズ2: スコアデータの一括取得 ---
    console.log("フェーズ2: スコアデータの一括取得を開始...");
    // sha256ToFetch セットを配列に変換し、一括取得関数に渡す
    const sha256List = Array.from(sha256ToFetch);
    // 所持している曲のsha256リスト
    const songsMap = await checkExistSongsBySha256s(sha256List);
    // ロングノーツなし または LNモードのスコア取得
    const scoresMap = await getScoresBySha256s(sha256List, 0);
    // CN, HCNモードのスコア取得
    let scoresMapXn = null
    if (selectedLnModeValue !== 0) {
        scoresMapXn = await getScoresBySha256s(sha256List, selectedLnModeValue)
    }
    console.log("フェーズ2完了。");

    // --- フェーズ3: スコアデータのマージと集計 ---
    console.log("フェーズ3: スコアデータのマージと集計を開始...");
    //for (const songInfo of tempSongInfos) {
    for (const songInfo of tempSongInfos) {
        let clear = -1; // デフォルトは No Chart
        let minbp = null; // BP不明
        let notes = null
        let mode = null;
        let exscore = null;
        let sha256 = null;

        // 譜面を所持しているか判定
        if (songInfo.sha256 && songsMap.includes(songInfo.sha256)){
            clear = 0; // Not Played
            sha256 = songInfo.sha256
        }

        // LNなし&LNmodeで一括取得したスコアデータを参照
        if (sha256 && scoresMap.has(sha256)) {
            const scoreRecord = scoresMap.get(sha256);
            clear = scoreRecord.clear;
            minbp = scoreRecord.minbp;
            mode = scoreRecord.mode;
            notes = scoreRecord.notes;
            exscore = scoreRecord.exscore;
        }
        // CN or HCNmodeで一括取得したスコアデータを参照し上書き
        if (sha256 && scoresMapXn && scoresMapXn.has(sha256)) {
            const scoreRecordXn = scoresMapXn.get(sha256);
            clear = scoreRecordXn.clear;
            minbp = scoreRecordXn.minbp;
            mode = scoreRecordXn.mode;
            notes = scoreRecordXn.notes;
            exscore = scoreRecordXn.exscore;
        }

        // SHA256が特定できなかった場合、またはスコアが見つからなかった場合はデフォルト値のまま
        // songDetails に追加する最終的な楽曲情報オブジェクトを作成
        const finalSongInfo = {
            level: songInfo.level,
            title: songInfo.title,
            site_url: songInfo.site_url,
            md5: songInfo.md5,
            sha256: songInfo.sha256, // 特定できたsha256
            clear: String(clear), // クリア状態を文字列として扱う
            minbp: minbp,
            notes: notes,
            exscore: exscore
        };
        songDetails.push(finalSongInfo); // 詳細リストに追加

        // --- 集計処理 ---
        // レベル別に集計
        if (!aggregatedData.has(finalSongInfo.level)) {
            aggregatedData.set(finalSongInfo.level, new Map());
        }
        const levelData = aggregatedData.get(finalSongInfo.level);

        // クリア状態別に集計
        const clearStr = finalSongInfo.clear; // すでに文字列
        if (!levelData.has(clearStr)) {
            levelData.set(clearStr, { count: 0, songs: [] });
        }
        const clearData = levelData.get(clearStr);
        clearData.count++;
        clearData.songs.push(finalSongInfo); // 集計データにも楽曲情報を格納
    }
    console.log("フェーズ3完了。");

    return { songDetails, aggregatedData };
}


// --- UI更新関数 ---

/**
 * 難易度表選択プルダウンを生成する
 * @param {Array<object>} tablesData - 難易度表データの配列
 */
function populateDifficultySelect(tablesData) {
    difficultyTableSelect.innerHTML = ''; // 既存のオプションをクリア
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = t('lamp.select_table');
    difficultyTableSelect.appendChild(defaultOption);

    tablesData.forEach(table => {
        if (table.tableFullName && table.internalFileName) {
            const option = document.createElement('option');
            option.value = table.internalFileName; // internalFileName を value に設定
            option.textContent = table.tableFullName;
            difficultyTableSelect.appendChild(option);
        } else {
            console.warn("難易度表データに tableFullName または internalFileName がありません:", table);
        }
    });
}

/**
 * 集計データに基づいて帯グラフのHTMLを生成し表示する
 * @param {Map<string, Map<string, { count: number, songs: Array<object> }>>} aggregatedData - 集計データ
 */
function displayLampGraphs(aggregatedData, shortName, predefinedLevels) {
    lampGraphArea.innerHTML = ''; // 既存のグラフをクリア
    lampGraphArea.classList.add('default-cursor'); // デフォルトカーソルに戻す

    if (aggregatedData.size === 0) {
        lampGraphArea.innerHTML = `<p>${t('lamp.no_data')}</p>`;
        return;
    }

    // レベルでソート
    let sortedLevels;

    if (predefinedLevels && Array.isArray(predefinedLevels)) {
        // predefinedLevelsが定義されている場合、その順序を使用
        // aggregatedDataに存在するレベルのみをフィルタリング
        sortedLevels = predefinedLevels.filter(level => aggregatedData.has(level));
        console.log(`Using predefined level order: ${sortedLevels.join(', ')}`);
    } else {
        // predefinedLevelsが未定義の場合、従来のソートロジックを使用
        sortedLevels = Array.from(aggregatedData.keys()).sort((a, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            // 数値として比較できる場合は数値でソート
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            // どちらか一方でも数値でない場合は文字列として比較 (数値が先に来るように)
            if (isNaN(numA) && !isNaN(numB)) return 1;
            if (!isNaN(numA) && isNaN(numB)) return -1;
            // 両方数値でない場合は文字列として比較
            return a.localeCompare(b);
        });
    }

    for (const level of sortedLevels) {
        const levelData = aggregatedData.get(level);
        let totalSongsInLevel = 0;
        levelData.forEach(data => {
            totalSongsInLevel += data.count;
        });

        if (totalSongsInLevel === 0) continue; // 曲数が0のレベルは表示しない

        const levelContainer = document.createElement('div');
        levelContainer.classList.add('level-item'); // 新しいクラスを追加

        const levelLabel = document.createElement('div');
        levelLabel.classList.add('level-label');
        levelLabel.textContent = `${shortName}${level} (${totalSongsInLevel})`; // 短縮した表記
        
        levelContainer.appendChild(levelLabel);

        const graphBar = document.createElement('div');
        graphBar.classList.add('lamp-graph-bar');
        graphBar.dataset.level = level;

        let currentPercentage = 0;

        for (const clearCode of CLEAR_STATUS_ORDER) {
            const clearData = levelData.get(clearCode);
            if (clearData && clearData.count > 0) {
                const percentage = (clearData.count / totalSongsInLevel) * 100;

                const segment = document.createElement('div');
                segment.classList.add('lamp-graph-segment');
                segment.style.width = `${percentage}%`;
                segment.style.backgroundColor = CLEAR_STATUS[clearCode]?.color || '#888';
                segment.style.left = `${currentPercentage}%`;
                segment.dataset.clearStatus = clearCode;
                segment.title = `${CLEAR_STATUS[clearCode]?.name || 'Unknown'}: ${clearData.count} songs (${percentage.toFixed(1)}%)`;

                const countSpan = document.createElement('span');
                countSpan.textContent = clearData.count;
                countSpan.style.color = getContrastColor(CLEAR_STATUS[clearCode]?.color || '#888');
                segment.appendChild(countSpan);

                graphBar.appendChild(segment);
                currentPercentage += percentage;
            }
        }
        levelContainer.appendChild(graphBar);
        lampGraphArea.appendChild(levelContainer); // levelGraphContainer の代わりに levelContainer を追加
    }
}


async function processDifficultyTableSelection(selectedInternalFileName, selectedLnModeValue) {
    const lampGraphArea = document.getElementById('lamp-graph-area');
    const songListArea = document.getElementById('song-list-area');
    const difficultyTableSelect = document.getElementById('difficultyTableSelect'); // 必要に応じて取得

    lampGraphArea.innerHTML = `<p>${t('lamp.loading')}</p>`; // ローディング表示
    songListArea.innerHTML = ''; // 曲リストをクリア

    if (!selectedInternalFileName) {
        lampGraphArea.innerHTML = ''; // 未選択状態ならクリア
        return;
    }

    // score.db が読み込まれているか確認
    if (!scoreDbData) {
        lampGraphArea.innerHTML = `<p style="color: red;">${t('lamp.load_score_first')}</p>`;
        if (difficultyTableSelect) {
            difficultyTableSelect.value = ''; // プルダウンの選択をリセット
        }
        return;
    }
    // SQL.jsが初期化されているか確認
    if (!SQL) {
        lampGraphArea.innerHTML = '<p style="color: red;">データベースライブラリが初期化されていません。</p>';
        if (difficultyTableSelect) {
            difficultyTableSelect.value = ''; // プルダウンの選択をリセット
        }
        return;
    }

    try {
        // 1. 選択された難易度表に対応する楽曲リストJSONを読み込む
        const songListData = await loadSongData(selectedInternalFileName);

        // songs 配列が存在するか確認
        const songs = songListData?.songs;
        const shortName = songListData?.shortName;
        if (!Array.isArray(songs)) {
            throw new Error(`読み込んだJSONに 'songs' 配列が含まれていません (${selectedInternalFileName}.json)`);
        }

        // 2. 楽曲リストとスコアDBを突き合わせて処理・集計
        //    (Md5Tosha256Mapは初期化時に作成済み)
        const { aggregatedData } = await processSongScores(songs, selectedLnModeValue);

        // 2.5. 選択された難易度表のlevels配列を取得
        const tableConfig = difficultyTablesConfig.find(t => t.internalFileName === selectedInternalFileName);
        const predefinedLevels = tableConfig?.levels;

        // 3. 集計結果を帯グラフとして表示
        displayLampGraphs(aggregatedData, shortName, predefinedLevels);

        // 4. クリック時に参照する集計データを保持 (より安全な方法を検討しても良い)
        currentAggregatedData = aggregatedData;
        currentShortName = shortName;

    } catch (error) {
        console.error('難易度表データの処理中にエラーが発生しました:', error);
        lampGraphArea.innerHTML = `<p style="color: red;">データの処理中にエラーが発生しました: ${error.message}</p>`;
        currentAggregatedData = null; // エラー時はデータもクリア
    }
}

/**
 * 背景色に基づいてコントラストの高いテキストの色（白または黒）を返す
 * @param {string} hexcolor - 16進数の色コード (#rrggbb形式)
 * @returns {string} - 'white' または 'black'
 */
function getContrastColor(hexcolor) {
    const r = parseInt(hexcolor.slice(1, 3), 16);
    const g = parseInt(hexcolor.slice(3, 5), 16);
    const b = parseInt(hexcolor.slice(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? 'black' : 'white';
}

/**
 * クリックされたグラフセグメントに対応する楽曲リストを表示する
 * @param {string} level - 選択されたレベル
 * @param {string} clearStatus - 選択されたクリア状態
 * @param {Map<string, Map<string, { count: number, songs: Array<object> }>>} aggregatedData - 集計データ
 */
function displaySongList(level, clearStatus, aggregatedData, shortName) {
    songListArea.innerHTML = ''; // 既存のリストをクリア

    const levelData = aggregatedData.get(level);
    const clearData = levelData?.get(clearStatus); // Optional chaining

    if (!clearData || clearData.songs.length === 0) {
        songListArea.textContent = t('lamp.no_songs');
        return;
    }

    const songsToShow = clearData.songs;

    // title でソート (clearは同じはずなので不要)
    const sortedSongs = [...songsToShow].sort((a, b) => {
        // localeCompareでタイトルを比較
        return a.title.localeCompare(b.title);
    });

    const listTitle = document.createElement('h3');
    const clearName = CLEAR_STATUS[clearStatus]?.name || `Status ${clearStatus}`;
    listTitle.textContent = `${shortName}${level} - ${clearName} (${sortedSongs.length} songs)`;
    songListArea.appendChild(listTitle);

    const ul = document.createElement('ul');
    ul.classList.add('song-list');

    sortedSongs.forEach(song => {
        const li = document.createElement('li');
        const titleElement = document.createElement('span'); // タイトル部分の要素

        // BPが存在し、かつ数値である場合のみ表示 (nullチェックとNaNチェック)
        const bpText = (song.minbp !== null && !isNaN(song.minbp)) ? ` / BP: ${song.minbp}` : '';
        titleElement.textContent = `${song.title}`;

        if (song.site_url) {
            const link = document.createElement('a');
            link.href = song.site_url;
            link.textContent = titleElement.textContent; // リンクのテキストは元のタイトル
            link.target = '_blank';
            li.appendChild(link);
        } else {
            li.appendChild(titleElement); // site_url がない場合はそのままテキストを追加
        }

        li.appendChild(document.createTextNode(bpText)); // BPテキストはタイトル要素の後に追加

        ul.appendChild(li);
    });

    songListArea.appendChild(ul);
}


// --- イベントリスナー ---

// プルダウンリスト変更時の処理
difficultyTableSelect.addEventListener('change', async (event) => {
    const selectedInternalFileName = event.target.value;
    let selectedLnModeValue;
    // 選択されているラジオボタンを見つける
    for (const radio of lnModeRadios) {
        if (radio.checked) {
        selectedLnModeValue = radio.value;
        break; // 最初に見つかったらループを抜ける
        }
    }
    await processDifficultyTableSelection(selectedInternalFileName, selectedLnModeValue);
});

// LN mode変更時の処理
lnModeRadios.forEach(radio => {
    radio.addEventListener('change', async (event) => { // ここを async に変更
      const selectedLnModeValue = event.target.value;
      const selectedInternalFileName = difficultyTableSelect.value; // 現在選択されているプルダウンリストの値を取得

      console.log(`LNモードが変更されました: ${selectedLnModeValue}`);
      console.log(`現在の難易度ファイル名: ${selectedInternalFileName}`);

      // ここで、選択されたLNモードと難易度ファイル名を使って処理を実行
      await processDifficultyTableSelection(selectedInternalFileName, selectedLnModeValue);
    });
});


// 帯グラフエリアでのクリックイベント処理 (イベント委譲)
lampGraphArea.addEventListener('click', (event) => {
    // クリックされた要素またはその祖先から .lamp-graph-segment を探す
    const segment = event.target.closest('.lamp-graph-segment');
    // クリックされた要素またはその祖先から .lamp-graph-bar を探す
    const bar = event.target.closest('.lamp-graph-bar');

    if (segment && bar) { // セグメントがクリックされた場合
        const level = bar.dataset.level; // 親のバーからlevel取得
        const clearStatus = segment.dataset.clearStatus;

        if (level && clearStatus && currentAggregatedData) {
            displaySongList(level, clearStatus, currentAggregatedData, currentShortName);
        } else {
             console.warn("クリックされたセグメントから level または clearStatus を取得できませんでした。");
             songListArea.innerHTML = `<p>${t('lamp.song_list_error')}</p>`;
        }
    } else if (bar) { // バーの他の部分（セグメント以外）がクリックされた場合 (任意: 全リスト表示など)
        // const level = bar.dataset.level;
        // console.log(`Bar for level ${level} clicked (not a specific segment)`);
        // 必要であれば、レベル全体の曲リストを表示するなどの処理を追加
        songListArea.innerHTML = ''; // とりあえずクリア
    }
});


// --- 初期化処理 ---

/**
 * アプリケーションの初期化関数
 */
async function initializeApp() {
    // 状態をリセット
    SQL = null;
    Md5Tosha256Map = null;
    lampGraphArea.innerHTML = '';
    songListArea.innerHTML = '';
    if(difficultyTableSelect) difficultyTableSelect.innerHTML = '<option value="">---</option>'; // プルダウンをリセット



    // 0. sql.jsの初期化 (sqlPromiseが解決されるのを待つ)
    try {
        // グローバルスコープのsqlPromise、またはimportしたsqlPromiseを使用
        // 例: const sqlModule = await import('./sql-initializer.js'); const sqlPromise = sqlModule.default;
        if (typeof sqlPromise === 'undefined') {
             throw new Error("sqlPromiseが定義されていません。");
        }
        SQL = await sqlPromise; // SQLオブジェクトを取得して保持
        console.log("SQL.jsの初期化完了");
    } catch (error) {
        console.error("SQL.js の初期化に失敗しました:", error);
        return; // SQL.jsがないと動作しないため終了
    }

    // 1. Md5 -> Sha256 Mapを作成
    try {
        Md5Tosha256Map = createMd5ToSha256Map();
        if (!Md5Tosha256Map || Md5Tosha256Map.size === 0) {
             console.warn("Md5Tosha256Mapの作成に失敗したか、空です。sha256ToMd5Mapを確認してください。");
             // 必須ではないかもしれないので処理は続行するが警告を出す
        } else {
             console.log("Md5 to Sha256 Map 作成完了");
        }
    } catch (error) {
        console.error("Md5Tosha256Mapの作成中にエラー:", error);
        // エラー処理
    }


    // 2. 難易度表データを読み込み、プルダウンを生成
    try {
        const difficultyTables = await loadDifficultyTables();
        populateDifficultySelect(difficultyTables);
        console.log("難易度表プルダウン生成完了");
    } catch(error) {
        console.error("難易度表データの読み込みまたはプルダウン生成に失敗:", error);
        if (difficultyTableSelect) {
            difficultyTableSelect.innerHTML = `<option value="">${t('lamp.table_load_error')}</option>`;
        }
        // エラー処理
    }


    // 4. (もしあれば) その他の初期化処理
    console.log("アプリケーションの初期化が完了しました。");
}



// --- 実行 ---

// アプリケーションを初期化 (DOM読み込み後に実行することが望ましい)
document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('#tab-buttons .tablinks');
    const tabBButton = document.querySelector('#tab-buttons button[data-tab="tabB"]');
  
    if (tabBButton) {
      const initializeAppOnce = () => {
        initializeApp();
        // イベントリスナーを削除して、二度目の実行を防ぐ
        tabBButton.removeEventListener('click', initializeAppOnce);
      };
      tabBButton.addEventListener('click', initializeAppOnce);
    } else {
      console.error("data-tab='tabB' を持つボタン要素が見つかりません。");
    }
});

// scoreDbData をエクスポートする必要があれば (通常は不要かも)
// export { scoreDbData };