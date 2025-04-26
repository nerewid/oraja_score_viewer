// --- ES Module Imports ---

import { sqlPromise } from './db_uploader.js'; 
import { getSha256ToMd5Map } from './score_change_to_json.js';
import { scoreDbData } from './db_uploader.js';

// --- グローバル変数・定数 ---

// sql.js のコアオブジェクト (初期化後に設定)
let SQL;

// Md5 -> Sha256 の逆引きMap (初期化後に設定)
let Md5Tosha256Map;

// クリアランプの定義
const clear_status = {
    "10": { "name": "Max", "color": "rgba(255, 215, 0, 0.5)" },
    "9": { "name": "Perfect", "color": "rgba(0, 255, 255, 0.5)" },
    "8": { "name": "FullCombo", "color": "rgba(173, 255, 47, 0.5)" },
    "7": { "name": "ExHard", "color": "rgba(255, 165, 0, 0.5)" },
    "6": { "name": "Hard", "color": "rgba(192, 0, 0, 0.5)" },
    "5": { "name": "Normal", "color": "rgba(135, 206, 235, 0.5)" },
    "4": { "name": "Easy", "color": "rgba(0, 128, 0, 0.5)" },
    "3": { "name": "LightAssistEasy", "color": "rgba(255, 192, 203, 0.5)" },
    "2": { "name": "AssistEasy", "color": "rgba(128, 0, 128, 0.5)" },
    "1": { "name": "Failed", "color": "rgba(128, 0, 0, 0.5)" },
    "0": { "name": "NoPlay", "color": "rgba(0, 0, 0, 0.5)" }
};
const clear_status_order = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "0"]; // 描画順

// HTML要素への参照
const difficultyTableSelect = document.getElementById('difficulty-table-select');
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
    console.log(sha256ToMd5Map);
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
 * 指定されたSHA256ハッシュに対応するスコアデータをscoreDbData(Uint8Array)から取得する
 * @param {string} sha256 - 検索するSHA256ハッシュ
 * @returns {Promise<object | null>} スコアデータオブジェクト { clear: number, minbp: number | null }、またはnull
 */
async function getScoreBySha256(sha256) {
    if (!scoreDbData || !(scoreDbData instanceof Uint8Array)) {
        // console.warn("scoreDbData が Uint8Array としてロードされていません。");
        return null;
    }
    if (!SQL) {
        console.error("SQL.jsが初期化されていません。");
        // ユーザーにフィードバックが必要な場合、ここでエラーを投げるかUIに表示
        return null;
    }

    let db = null;
    try {
        // Uint8Arrayからデータベースを開く
        db = new SQL.Database(scoreDbData);

        // クエリを準備して実行 (mode=0 固定)
        // テーブルやカラムが存在しない場合にエラーになる可能性があるため注意
        const stmt = db.prepare("SELECT clear, minbp FROM score WHERE sha256 = :sha256 AND mode = 0");

        // getAsObjectは結果がない場合 {} を返すことがある
        const result = stmt.getAsObject({ ':sha256': sha256 });

        stmt.free(); // ステートメントを解放

        // 結果オブジェクトにsha256キーが存在するか、または他の必須キーで結果の有無を確認
        if (result && result.clear !== undefined) {
             // Number型に変換し、minbpがnullやundefinedの可能性を考慮
            const clearValue = Number(result.clear);
            const minbpValue = result.minbp !== undefined && result.minbp !== null ? Number(result.minbp) : null;
            return {
                clear: isNaN(clearValue) ? 0 : clearValue, // NaNの場合は0扱い
                minbp: isNaN(minbpValue) ? null : minbpValue // NaNの場合はnull扱い
            };
        } else {
            // console.log(`Score not found for sha256: ${sha256}`);
            return null; // 見つからない場合はnull
        }

    } catch (error) {
        // テーブル/カラム不存在などのエラーもここでキャッチされる
        console.error(`SHA256 (${sha256}) のスコア取得中にエラーが発生しました:`, error);
        return null; // エラー時もnull
    } finally {
        // データベース接続を閉じる
        if (db) {
            try {
                db.close();
            } catch (closeError) {
                console.error("データベースのクローズ中にエラーが発生しました:", closeError);
            }
        }
    }
}

/**
 * internalFileNameに基づいて楽曲データを読み込む
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
 * 難易度表のデータを読み込む
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
        if (Array.isArray(data)) {
            return data;
        } else if (data && Array.isArray(data.tables)) { // 例: { "tables": [...] } の形式
             return data.tables;
        } else {
            console.warn(`予期しない形式の難易度表データです (${url})`);
            return [];
        }
    } catch (error) {
        console.error(`難易度表データ(${url})の読み込みに失敗しました:`, error);
        throw error; // エラーを呼び出し元に伝える
        // return []; // またはデフォルト値を返す
    }
}

/**
 * 楽曲リストとスコアデータを処理し、レベル別・クリア状況別に集計する
 * @param {Array<object>} songs - 楽曲データの配列
 * @returns {Promise<{ songDetails: Array<object>, aggregatedData: Map<string, Map<string, { count: number, songs: Array<object> }>> }>}
 */
async function processSongScores(songs) {
    const aggregatedData = new Map(); // Map<level, Map<clearStatus, { count: number, songs: [] }>>
    const songDetails = []; // 処理後の楽曲情報を格納する配列 (今回は未使用)

    if (!Md5Tosha256Map) {
        console.error("Md5Tosha256Mapが初期化されていません。");
        // エラー処理、または空データを返す
        return { songDetails: [], aggregatedData: new Map() };
    }

    for (const song of songs) {
        let currentSha256 = song.sha256; // 楽曲データ内のSHA256
        const md5 = song.md5;
        const level = String(song.level); // レベルを文字列として扱う
        const title = song.title;

        // sha256 がない場合、md5 から変換を試みる
        if (!currentSha256 && md5 && Md5Tosha256Map.has(md5)) {
            currentSha256 = Md5Tosha256Map.get(md5);
            // console.log(`MD5 (${md5}) から SHA256 (${currentSha256}) を取得しました: ${title}`);
        }

        let clear = 0; // デフォルトは NoPlay
        let minbp = null; // BP不明

        if (currentSha256) {
            // scoreDBData からスコア情報を取得 (mode=0 固定)
            const scoreRecord = await getScoreBySha256(currentSha256);
            if (scoreRecord) {
                clear = scoreRecord.clear; // getScoreBySha256 が number を返すように修正済み
                minbp = scoreRecord.minbp; // getScoreBySha256 が number | null を返すように修正済み
            }
            // スコアレコードが見つからない場合はデフォルト値(clear=0, minbp=null)のまま
        }
        // SHA256 が特定できない場合もデフォルト値のまま

        const songInfo = {
            level: level,
            title: title,
            md5: md5,
            sha256: currentSha256, // 特定できたsha256も保持
            clear: String(clear), // クリア状態を文字列として扱う
            minbp: minbp
        };
        songDetails.push(songInfo); // 詳細リストにも追加

        // --- 集計処理 ---
        // レベル別に集計
        if (!aggregatedData.has(level)) {
            aggregatedData.set(level, new Map());
        }
        const levelData = aggregatedData.get(level);

        // クリア状態別に集計
        const clearStr = String(clear);
        if (!levelData.has(clearStr)) {
            levelData.set(clearStr, { count: 0, songs: [] });
        }
        const clearData = levelData.get(clearStr);
        clearData.count++;
        clearData.songs.push(songInfo); // 集計データにも楽曲情報を格納
    }

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
    defaultOption.textContent = '難易度表を選択してください';
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
function displayLampGraphs(aggregatedData) {
    lampGraphArea.innerHTML = ''; // 既存のグラフをクリア
    lampGraphArea.style.cursor = 'default'; // デフォルトカーソルに戻す

    if (aggregatedData.size === 0) {
        lampGraphArea.innerHTML = '<p>表示するデータがありません。</p>';
        return;
    }

    // レベルでソート (数値として比較)
    const sortedLevels = Array.from(aggregatedData.keys()).sort((a, b) => {
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

    for (const level of sortedLevels) {
        const levelData = aggregatedData.get(level);
        let totalSongsInLevel = 0;
        levelData.forEach(data => {
            totalSongsInLevel += data.count;
        });

        if (totalSongsInLevel === 0) continue; // 曲数が0のレベルは表示しない

        const levelGraphContainer = document.createElement('div');
        levelGraphContainer.classList.add('level-graph-container');
        levelGraphContainer.style.marginBottom = '10px';

        const levelLabel = document.createElement('div');
        levelLabel.textContent = `Level ${level} (${totalSongsInLevel} songs)`;
        levelLabel.style.fontWeight = 'bold';
        levelGraphContainer.appendChild(levelLabel);

        const graphBar = document.createElement('div');
        graphBar.classList.add('lamp-graph-bar');
        graphBar.style.display = 'flex';
        graphBar.style.position = 'relative'; // 相対配置の基準
        graphBar.style.height = '25px';
        graphBar.style.width = '100%';
        graphBar.style.border = '1px solid #ccc';
        graphBar.style.cursor = 'pointer'; // バー全体をクリック可能に
        graphBar.dataset.level = level; // レベル情報を保持 (イベント委譲用)

        let currentPercentage = 0;

        // 10 -> 0 の順で帯グラフセグメントを作成
        for (const clearCode of clear_status_order) {
            const clearData = levelData.get(clearCode); // Mapになくてもundefinedが返る
            if (clearData && clearData.count > 0) { // データが存在し、数が1以上
                const percentage = (clearData.count / totalSongsInLevel) * 100;

                const segment = document.createElement('div');
                segment.classList.add('lamp-graph-segment');
                segment.style.width = `${percentage}%`;
                segment.style.backgroundColor = clear_status[clearCode]?.color || '#888';
                segment.style.height = '100%';
                segment.style.boxSizing = 'border-box';
                segment.style.overflow = 'hidden'; // はみ出し防止
                segment.style.position = 'absolute'; // 絶対配置
                segment.style.left = `${currentPercentage}%`;
                
                // 件数を文字列として追加
                const countSpan = document.createElement('span');
                countSpan.textContent = clearData.count;
                countSpan.style.position = 'absolute';
                countSpan.style.left = '50%';
                countSpan.style.top = '50%';
                countSpan.style.transform = 'translate(-50%, -50%)';
                countSpan.style.color = getContrastColor(clear_status[clearCode]?.color || '#888');
                countSpan.style.fontSize = '0.8em';
                countSpan.style.fontWeight = 'bold';
                segment.appendChild(countSpan);

                // クリックイベントのためにデータを付与
                segment.dataset.clearStatus = clearCode;
                // ツールチップ
                segment.title = `${clear_status[clearCode]?.name || 'Unknown'}: ${clearData.count} songs (${percentage.toFixed(1)}%)`;

                graphBar.appendChild(segment);

                currentPercentage += percentage;
            }
        }
        levelGraphContainer.appendChild(graphBar);
        lampGraphArea.appendChild(levelGraphContainer);
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
function displaySongList(level, clearStatus, aggregatedData) {
    songListArea.innerHTML = ''; // 既存のリストをクリア

    const levelData = aggregatedData.get(level);
    const clearData = levelData?.get(clearStatus); // Optional chaining

    if (!clearData || clearData.songs.length === 0) {
        songListArea.textContent = '該当する楽曲が見つかりません。';
        return;
    }

    const songsToShow = clearData.songs;

    // title でソート (clearは同じはずなので不要)
    const sortedSongs = [...songsToShow].sort((a, b) => {
        // localeCompareでタイトルを比較
        return a.title.localeCompare(b.title);
    });

    const listTitle = document.createElement('h3');
    const clearName = clear_status[clearStatus]?.name || `Status ${clearStatus}`;
    listTitle.textContent = `Level ${level} - ${clearName} (${sortedSongs.length} songs)`;
    songListArea.appendChild(listTitle);

    const ul = document.createElement('ul');
    ul.style.listStyleType = 'none';
    ul.style.paddingLeft = '0';

    sortedSongs.forEach(song => {
        const li = document.createElement('li');
        li.style.marginBottom = '5px';
        li.style.borderBottom = '1px dashed #eee';
        li.style.paddingBottom = '5px';

        // BPが存在し、かつ数値である場合のみ表示 (nullチェックとNaNチェック)
        const bpText = (song.minbp !== null && !isNaN(song.minbp)) ? ` / BP: ${song.minbp}` : '';
        li.textContent = `Lv.${song.level}: ${song.title}${bpText}`;
        // SHA256やMD5などのデバッグ情報を追加したい場合
        // li.title = `SHA256: ${song.sha256 || 'N/A'}\nMD5: ${song.md5 || 'N/A'}`;
        ul.appendChild(li);
    });

    songListArea.appendChild(ul);
}


// --- イベントリスナー ---

// プルダウンリスト変更時の処理
difficultyTableSelect.addEventListener('change', async (event) => {
    const selectedInternalFileName = event.target.value;
    lampGraphArea.innerHTML = '<p>読み込み中...</p>'; // ローディング表示
    songListArea.innerHTML = ''; // 曲リストをクリア

    if (!selectedInternalFileName) {
        lampGraphArea.innerHTML = ''; // 未選択状態ならクリア
        return;
    }

    // score.db が読み込まれているか確認
    if (!scoreDbData) {
        lampGraphArea.innerHTML = '<p style="color: red;">score.db を先に読み込んでください。</p>';
        difficultyTableSelect.value = ''; // プルダウンの選択をリセット
        return;
    }
    // SQL.jsが初期化されているか確認
    if (!SQL) {
         lampGraphArea.innerHTML = '<p style="color: red;">データベースライブラリが初期化されていません。</p>';
         difficultyTableSelect.value = ''; // プルダウンの選択をリセット
        return;
    }


    try {
        // 1. 選択された難易度表に対応する楽曲リストJSONを読み込む
        const songListData = await loadSongData(selectedInternalFileName);

        // songs 配列が存在するか確認
        const songs = songListData?.songs;
        if (!Array.isArray(songs)) {
             throw new Error(`読み込んだJSONに 'songs' 配列が含まれていません (${selectedInternalFileName}.json)`);
        }


        // 2. 楽曲リストとスコアDBを突き合わせて処理・集計
        //    (Md5Tosha256Mapは初期化時に作成済み)
        const { aggregatedData } = await processSongScores(songs);

        // 3. 集計結果を帯グラフとして表示
        displayLampGraphs(aggregatedData);

        // 4. クリック時に参照する集計データを保持 (より安全な方法を検討しても良い)
        window.currentAggregatedData = aggregatedData;

    } catch (error) {
        console.error('難易度表データの処理中にエラーが発生しました:', error);
        lampGraphArea.innerHTML = `<p style="color: red;">データの処理中にエラーが発生しました: ${error.message}</p>`;
        window.currentAggregatedData = null; // エラー時はデータもクリア
    }
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

        if (level && clearStatus && window.currentAggregatedData) {
            displaySongList(level, clearStatus, window.currentAggregatedData);
        } else {
             console.warn("クリックされたセグメントから level または clearStatus を取得できませんでした。");
             songListArea.innerHTML = '<p>曲リストの表示に失敗しました。</p>';
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
            difficultyTableSelect.innerHTML = '<option value="">難易度表読込エラー</option>';
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