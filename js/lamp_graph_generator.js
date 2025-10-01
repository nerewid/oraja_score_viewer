// --- ES Module Imports ---

import { sqlPromise } from './db_uploader.js'; 
import { getSha256ToMd5Map } from './score_change_to_json.js';
import { scoreDbData } from './db_uploader.js';
import { songdataDbData } from './db_uploader.js';

// --- グローバル変数・定数 ---

// sql.js のコアオブジェクト (初期化後に設定)
let SQL;

// Md5 -> Sha256 の逆引きMap (初期化後に設定)
let Md5Tosha256Map;

// クリアランプの定義
const clear_status = {
    "10": { "name": "Max", "color": "rgba(255, 215, 0, 0.5)" },
    "9": { "name": "Perfect", "color": "rgba(173, 255, 47, 0.5)" },
    "8": { "name": "FullCombo", "color": "rgba(0, 255, 255, 0.5)" },
    "7": { "name": "ExHard", "color": "rgba(255, 165, 0, 0.5)" },
    "6": { "name": "Hard", "color": "rgba(192, 0, 0, 0.5)" },
    "5": { "name": "Normal", "color": "rgba(135, 206, 235, 0.5)" },
    "4": { "name": "Easy", "color": "rgba(0, 128, 0, 0.5)" },
    "3": { "name": "LightAssistEasy", "color": "rgba(255, 192, 203, 0.5)" },
    "2": { "name": "AssistEasy", "color": "rgba(128, 0, 128, 0.5)" },
    "1": { "name": "Failed", "color": "rgba(128, 0, 0, 0.5)" },
    "0": { "name": "Not Played", "color": "rgba(32, 32, 32, 0.5)" },
    "-1": { "name": "No Chart", "color": "rgba(0, 0, 0, 0.5)" }
};
const clear_status_order = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "0", "-1"]; // 描画順

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
        if (Array.isArray(data)) {
            return data;
        } else if (data && Array.isArray(data.tables)) { // 例: { "tables": [...] } の形式
             return data.tables;
        } else {
            console.warn(`予期しない形式の難易度表一覧データです (${url})`);
            return [];
        }
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
 * SQLiteのIN句を使用し、パフォーマンスを向上させる。
 * SQL.jsの prepare -> bind -> step -> getAsObject -> free パターンを使用します。
 * @param {Array<string>} sha256List - 取得したいスコアのSHA256ハッシュ値の配列
 * @returns {Promise<Map<string, { clear: number, minbp: number | null }>>} - SHA256をキーとしたスコアデータのMap
 */
async function getScoresBySha256s(sha256List, selectedLnModeValue) {
    const scoresMap = new Map(); // 結果を格納するMap<sha256, scoreData>

    if (!scoreDbData || !(scoreDbData instanceof Uint8Array)) {
        console.error("scoreDbData が Uint8Array としてロードされていません。");
        return scoresMap; // 空のMapを返す
    }
    if (!SQL) {
        console.error("SQL.jsが初期化されていません。");
        return scoresMap; // 空のMapを返す
    }

    // 取得対象のSHA256リストが空の場合は処理不要
    if (!sha256List || sha256List.length === 0) {
        return scoresMap;
    }

    const BATCH_SIZE = 999; // SQLiteのIN句の一般的な制限数 (環境により異なる可能性あり)
    let db = null;

    try {
        // Uint8Arrayからデータベースを開く（この関数呼び出し中は開いたままにする）
        db = new SQL.Database(scoreDbData);

        // SHA256リストをバッチサイズで分割して処理
        for (let i = 0; i < sha256List.length; i += BATCH_SIZE) {
            const batch = sha256List.slice(i, i + BATCH_SIZE);

            // バッチが空の場合はスキップ
            if (batch.length === 0) {
                continue;
            }

            // IN句のためのプレースホルダ文字列を生成 (例: ?, ?, ?)
            const placeholders = batch.map(() => '?').join(',');

            // クエリ文字列を作成
            // sha256カラムも取得する必要がある点に注意
            const query = `SELECT sha256, clear, minbp FROM score WHERE mode = ${selectedLnModeValue} AND sha256 IN (${placeholders})`;

            let stmt = null;
            try {
                // --- 修正点: prepare, bind, step, getAsObject を使用 ---
                // クエリを準備
                stmt = db.prepare(query);

                // バッチ内のSHA256値をバインド
                stmt.bind(batch);

                // 結果セットを一行ずつ処理
                while (stmt.step()) {
                    // 現在の行をオブジェクトとして取得
                    const row = stmt.getAsObject();

                    // 元の getScoreBySha256 と同様に型変換とnull/undefined/NaN対応を行う
                    const clearValue = Number(row.clear);
                     // minbpがDBでNULLの場合、SQL.jsはnullまたはundefinedを返す可能性があるため両方チェック
                    const minbpValue = row.minbp !== undefined && row.minbp !== null ? Number(row.minbp) : null;
                    const notes =  Number(row.notes);
                    const mode =  Number(row.mode);
                    let epg = Number(row.epg);
                    let lpg = Number(row.lpg);
                    let egr = Number(row.egr);
                    let lgr = Number(row.lgr);
                    let exscore =  epg + lpg + egr + lgr;
                    // 取得した結果をMapに格納
                    scoresMap.set(row.sha256, {
                        clear: isNaN(clearValue) ? 0 : clearValue, // NaNの場合は0扱い
                        minbp: isNaN(minbpValue) ? null : minbpValue, // NaNの場合はnull扱い
                        notes: notes,
                        mode: mode,
                        exscore: exscore
                    });
                }

            } catch (batchQueryError) {
                // バッチクエリ実行中のエラー
                console.error(`スコア一括取得クエリの実行中にエラーが発生しました (バッチ ${i}-${Math.min(i + BATCH_SIZE - 1, sha256List.length - 1)}):`, batchQueryError);
                // このバッチはスキップされますが、他のバッチは続行します。
            } finally {
                // 使用済みステートメントを解放
                // エラー発生時も解放されるように finally で囲む
                if (stmt) {
                    try { stmt.free(); } catch(e) { console.error("Statement free中にエラー:", e); }
                }
            }
        }

    } catch (dbError) {
        // データベースを開く際のエラー
        console.error("データベースを開く際にエラーが発生しました:", dbError);
        // ここでエラーが発生した場合、処理を中断し、取得済みのMapを返します (通常は空)。
        return scoresMap;
    } finally {
        // データベース接続を閉じる
        // エラー発生時も確実に閉じるように finally で囲む
        if (db) {
            try {
                db.close();
            } catch (closeError) {
                console.error("データベースのクローズ中にエラーが発生しました:", closeError);
            }
        }
    }

    // 処理が完了したMapを返す
    console.log(`スコア一括取得完了。取得できたスコア数: ${scoresMap.size}`);
    return scoresMap;
}


/**
 * 指定された複数のSHA256ハッシュに対応する楽曲データがsongdataに存在するか判定する
 * SQLiteのIN句を使用し、パフォーマンスを向上させる。
 * SQL.jsの prepare -> bind -> step -> getAsObject -> free パターンを使用します。
 * @param {Array<string>} sha256List - 取得したいスコアのSHA256ハッシュ値の配列
 * @returns {Promise<Map<string, { clear: number, minbp: number | null }>>} - SHA256をキーとしたスコアデータのMap
 */
async function checkExistSongsBySha256s(sha256List) {
    const scoresMap = new Array(); // 結果を格納する[sha256]

    if (!songdataDbData || !(songdataDbData instanceof Uint8Array)) {
        console.error("songdataDbData が Uint8Array としてロードされていません。");
        return scoresMap; // 空のMapを返す
    }
    if (!SQL) {
        console.error("SQL.jsが初期化されていません。");
        return scoresMap; // 空のMapを返す
    }

    // 取得対象のSHA256リストが空の場合は処理不要
    if (!sha256List || sha256List.length === 0) {
        return scoresMap;
    }

    const BATCH_SIZE = 999; // SQLiteのIN句の一般的な制限数 (環境により異なる可能性あり)
    let db = null;

    try {
        // Uint8Arrayからデータベースを開く（この関数呼び出し中は開いたままにする）
        db = new SQL.Database(songdataDbData);

        // SHA256リストをバッチサイズで分割して処理
        for (let i = 0; i < sha256List.length; i += BATCH_SIZE) {
            const batch = sha256List.slice(i, i + BATCH_SIZE);

            // バッチが空の場合はスキップ
            if (batch.length === 0) {
                continue;
            }

            // IN句のためのプレースホルダ文字列を生成 (例: ?, ?, ?)
            const placeholders = batch.map(() => '?').join(',');

            // クエリ文字列を作成
            // sha256カラムも取得する必要がある点に注意
            const query = `SELECT sha256 FROM song WHERE sha256 IN (${placeholders})`;

            let stmt = null;
            try {
                // --- 修正点: prepare, bind, step, getAsObject を使用 ---
                // クエリを準備
                stmt = db.prepare(query);

                // バッチ内のSHA256値をバインド
                stmt.bind(batch);

                // 結果セットを一行ずつ処理
                while (stmt.step()) {
                    // 現在の行をオブジェクトとして取得
                    const row = stmt.getAsObject();
                    scoresMap.push(row.sha256);
                }

            } catch (batchQueryError) {
                // バッチクエリ実行中のエラー
                console.error(`楽曲データ取得クエリの実行中にエラーが発生しました (バッチ ${i}-${Math.min(i + BATCH_SIZE - 1, sha256List.length - 1)}):`, batchQueryError);
                // このバッチはスキップされますが、他のバッチは続行します。
            } finally {
                // 使用済みステートメントを解放
                // エラー発生時も解放されるように finally で囲む
                if (stmt) {
                    try { stmt.free(); } catch(e) { console.error("Statement free中にエラー:", e); }
                }
            }
        }

    } catch (dbError) {
        // データベースを開く際のエラー
        console.error("データベースを開く際にエラーが発生しました:", dbError);
        // ここでエラーが発生した場合、処理を中断し、取得済みのMapを返します (通常は空)。
        return scoresMap;
    } finally {
        // データベース接続を閉じる
        // エラー発生時も確実に閉じるように finally で囲む
        if (db) {
            try {
                db.close();
            } catch (closeError) {
                console.error("データベースのクローズ中にエラーが発生しました:", closeError);
            }
        }
    }

    // 処理が完了したMapを返す
    console.log(`楽曲データ一括取得完了。取得できた譜面数: ${scoresMap.size}`);
    return scoresMap;
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
        const cite_url = song.cite_url ? song.cite_url : null;

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
            cite_url: cite_url
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
        if (sha256 && scoresMapXn.has(sha256)) {
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
            cite_url: songInfo.cite_url,
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
function displayLampGraphs(aggregatedData, shortName) {
    lampGraphArea.innerHTML = ''; // 既存のグラフをクリア
    lampGraphArea.classList.add('default-cursor'); // デフォルトカーソルに戻す

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

        for (const clearCode of clear_status_order) {
            const clearData = levelData.get(clearCode);
            if (clearData && clearData.count > 0) {
                const percentage = (clearData.count / totalSongsInLevel) * 100;

                const segment = document.createElement('div');
                segment.classList.add('lamp-graph-segment');
                segment.style.width = `${percentage}%`;
                segment.style.backgroundColor = clear_status[clearCode]?.color || '#888';
                segment.style.left = `${currentPercentage}%`;
                segment.dataset.clearStatus = clearCode;
                segment.title = `${clear_status[clearCode]?.name || 'Unknown'}: ${clearData.count} songs (${percentage.toFixed(1)}%)`;

                const countSpan = document.createElement('span');
                countSpan.textContent = clearData.count;
                countSpan.style.color = getContrastColor(clear_status[clearCode]?.color || '#888');
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

    lampGraphArea.innerHTML = '<p>読み込み中...</p>'; // ローディング表示
    songListArea.innerHTML = ''; // 曲リストをクリア

    if (!selectedInternalFileName) {
        lampGraphArea.innerHTML = ''; // 未選択状態ならクリア
        return;
    }

    // score.db が読み込まれているか確認
    if (!scoreDbData) {
        lampGraphArea.innerHTML = '<p style="color: red;">score.db を先に読み込んでください。</p>';
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

        // 3. 集計結果を帯グラフとして表示
        displayLampGraphs(aggregatedData, shortName);

        // 4. クリック時に参照する集計データを保持 (より安全な方法を検討しても良い)
        window.currentAggregatedData = aggregatedData;
        window.currentShortName = shortName;

    } catch (error) {
        console.error('難易度表データの処理中にエラーが発生しました:', error);
        lampGraphArea.innerHTML = `<p style="color: red;">データの処理中にエラーが発生しました: ${error.message}</p>`;
        window.currentAggregatedData = null; // エラー時はデータもクリア
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

        if (song.cite_url) {
            const link = document.createElement('a');
            link.href = song.cite_url;
            link.textContent = titleElement.textContent; // リンクのテキストは元のタイトル
            link.target = '_blank';
            li.appendChild(link);
        } else {
            li.appendChild(titleElement); // cite_url がない場合はそのままテキストを追加
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

        if (level && clearStatus && window.currentAggregatedData) {
            displaySongList(level, clearStatus, window.currentAggregatedData, window.currentShortName);
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