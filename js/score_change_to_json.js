import { scorelogDbData, songdataDbData, sqlPromise } from './db_uploader.js'; // スコアログデータベースと楽曲データベースのデータ、およびSQL.jsのPromiseをインポート
import { createJsonFromScoreLogs } from './json_creator.js'; // スコアログデータからJSONを作成する関数をインポート
import { findScoresBySha256s,findMissingSha256sByMd5s } from './score_data_processor.js'; // SHA256ハッシュに基づいてスコアを検索する関数と、MD5ハッシュに基づいて不足しているSHA256ハッシュを検索する関数をインポート
import { generateHtmlFromJson } from './html_generator.js'; // JSONデータからHTMLを生成する関数をインポート
import { initializePagination } from './pagination.js'; // ページネーション機能をインポート

let sha256ToMd5Map = null;

// "processData"というIDを持つHTML要素にクリックイベントリスナーを追加
document.getElementById("processData").addEventListener("click", async () => {
    // scorelogDbDataまたはsongdataDbDataが存在しない場合
    if (!scorelogDbData || !songdataDbData) {
        alert("scorelog.dbまたはsongdata.dbファイルが不足しています。"); // アラートを表示して処理を中断
        return;
    }
    // ファイルアップロード領域を非表示にする
    document.getElementById("upload-area").classList.add("hidden");

    try {
        console.time("prepation"); // 処理時間の計測を開始（準備）
        const SQL = await sqlPromise; // SQL.jsの初期化を待つ
        const scorelogDb = new SQL.Database(scorelogDbData); // スコアログデータベースのインスタンスを作成
        const songdataDb = new SQL.Database(songdataDbData); // 楽曲データベースのインスタンスを作成

        // 統合された難易度テーブルのJSONファイルをロード
        const mergedDifficultyTables = await loadJsonFile('difficulty_table_data/merged_difficulty_tables.json');

        // 難易度テーブルの読み込みに失敗した場合
        if (!mergedDifficultyTables) {
            console.error("merged_difficulty_tables.jsonの読み込みに失敗しました。");
            alert("データ処理中にエラーが発生しました。merged_difficulty_tables.jsonの読み込みに失敗しました。");
            return;
        }

        // 難易度テーブルのsongsプロパティが存在しない、または配列でない場合
        if (!mergedDifficultyTables.songs || !Array.isArray(mergedDifficultyTables.songs)) {
            console.error("merged_difficulty_tables.jsonのsongsプロパティの形式が不正です。");
            alert("データ処理中にエラーが発生しました。merged_difficulty_tables.jsonの形式が不正です。");
            return;
        }
        console.timeEnd("prepation"); // 処理時間の計測終了（準備）
        //console.log(mergedDifficultyTables); // 読み込まれた難易度テーブルのログ出力
        const songDataMap = createSongDataMap(mergedDifficultyTables.songs); // 楽曲データをMD5ハッシュをキーとするMapに変換

        // SHA256ハッシュをキーとし、対応するMD5ハッシュを値とするMapを作成
        sha256ToMd5Map = await createSha256ToMd5Map(songdataDb, mergedDifficultyTables.songs);

        console.time("find scores"); // 処理時間の計測を開始（スコア検索）
        let results = await findScoresBySha256s(scorelogDb, sha256ToMd5Map,songDataMap); // SHA256ハッシュに基づいてスコアログデータベースからスコアを検索
        //console.log(results); // 検索結果のログ出力
        console.timeEnd("find scores"); // 処理時間の計測終了（スコア検索）

        console.time("create json"); // 処理時間の計測を開始（JSON作成）
        const jsonOutput = await createJsonFromScoreLogs(scorelogDb, results); // 検索されたスコアログからJSON形式のデータを作成
        //console.log(JSON.stringify(jsonOutput, null, 2));
        console.timeEnd("create json"); // 処理時間の計測終了（JSON作成）

        scorelogDb.close(); // スコアログデータベースを閉じる
        songdataDb.close(); // 楽曲データベースを閉じる


        showTabButtons(); // タブ切り替えボタンを表示する関数を呼び出す

        // JSONからHTMLを生成
        const html = await generateHtmlFromJson(jsonOutput, 'js/template.njk');

        // HTMLを画面に表示
        document.getElementById("results-area").innerHTML = html;
        document.getElementById('tabA').style.display = 'block'; // タブ切り替え機能のため維持

        // ページネーションを初期化
        initializePagination();

        // "downloadJson"というIDを持つHTML要素にクリックイベントリスナーを追加
        document.getElementById("downloadJson").addEventListener("click", () => {
            downloadJson(jsonOutput); // JSONダウンロードを実行する関数を呼び出す
        });

    } catch (error) {
        console.error("データ処理エラー:", error); // エラー内容をコンソールに出力
        document.getElementById("upload-area").classList.remove("hidden"); // ファイルアップロード領域を再度表示
        alert("データ処理中にエラーが発生しました。"); // エラーメッセージをアラート表示
    }
});

/**
 * 指定されたJSONファイルを非同期でロードし、JSONオブジェクトとして返却する関数。
 * パースに失敗した場合はnullを返す。
 * @param {string} file - ロードするJSONファイルのパス
 * @returns {Promise<object|null>} JSONオブジェクト、またはロード/パースに失敗した場合はnull
 */
async function loadJsonFile(file) {
    try {
        const response = await fetch(file); // ファイルをfetch APIで非同期に取得
        if (!response.ok) { // レスポンスが成功でなかった場合
            throw new Error(`HTTP error! status: ${response.status} for ${file}`); // エラーを投げる
        }
        const text = await response.text();//テキスト形式で取得
        try{
            return JSON.parse(text);//取得したテキストをJSONとしてパースし、成功すればその結果を返す
        }
        catch(jsonError){ // JSONパースに失敗した場合
            console.error(`JSONパースエラー(${file}):`, jsonError, text);//エラー情報とテキスト内容を出力
            return null; // パース失敗時はnullを返す
        }
    } catch (error) { // fetch処理でエラーが発生した場合
        console.error(`fetchエラー(${file}):`, error); // エラー内容をコンソールに出力
        return null; // エラー発生時はnullを返す
    }
}

/**
 * 楽曲データの配列から、MD5ハッシュをキーとするMapを作成する関数。
 * @param {Array<object>} songs - 楽曲データの配列。各オブジェクトはmd5プロパティを持つことが期待される。
 * @returns {Map<string, object>} MD5ハッシュをキーとし、楽曲データオブジェクトを値とするMap
 */
function createSongDataMap(songs) { // md5をキーとしたマップを作成
    console.time("create songdatamap"); // 処理時間の計測を開始（楽曲データMap作成）
    const songDataMap = new Map(); // 新しいMapオブジェクトを作成
    songs.forEach(song => { // 楽曲データの配列をforEachで処理
        if (song.md5) { // 楽曲オブジェクトがmd5プロパティを持つ場合
            songDataMap.set(song.md5, song); // MD5ハッシュをキーとして、楽曲オブジェクトをMapに登録
        }
    });
    console.timeEnd("create songdatamap"); // 処理時間の計測終了（楽曲データMap作成）
    return songDataMap; // 作成したMapを返す
}

/**
 * 楽曲データの配列を元に、SHA256ハッシュをキーとし、MD5ハッシュを値とするMapを作成する非同期関数。
 * 楽曲データにSHA256ハッシュがない場合は、MD5ハッシュを使って不足しているSHA256ハッシュをデータベースから検索する。
 * @param {object} db - 楽曲データが格納されたSQLiteデータベースのインスタンス
 * @param {Array<object>} songs - 楽曲データの配列。各オブジェクトはsha256およびmd5プロパティを持つ可能性がある。
 * @returns {Promise<Map<string, string>>} SHA256ハッシュをキーとし、MD5ハッシュを値とするMap
 */
async function createSha256ToMd5Map(db, songs) {
    console.time("append songdatamap"); // 処理時間の計測を開始（楽曲データMap追加）
    const newSha256ToMd5Map = new Map(); // 新しいMapオブジェクトを作成
    const missingMd5List = []; // SHA256ハッシュが見つからない楽曲のMD5ハッシュを格納する配列

    // 楽曲データの配列をループ処理
    for (const song of songs) {
        if (song.sha256) { // 楽曲オブジェクトがsha256プロパティを持つ場合
            newSha256ToMd5Map.set(song.sha256, song.md5); // SHA256ハッシュをキーとして、MD5ハッシュをMapに登録
        } else if (song.md5) { // sha256プロパティがなく、md5プロパティがある場合
            missingMd5List.push(song.md5); // MD5ハッシュを不足しているMD5リストに追加
        }
    }

    // 不足しているSHA256ハッシュをMD5ハッシュのリストに基づいてデータベースから検索
    const missingSha256Map = await findMissingSha256sByMd5s(db, missingMd5List);

    // 検索されたSHA256ハッシュとMD5ハッシュのペアをMapに追加
    for (const [md5, sha256] of missingSha256Map) {
        newSha256ToMd5Map.set(sha256, md5); // SHA256ハッシュをキーとして、対応するMD5ハッシュをMapに登録
    }
    //console.log(newSha256ToMd5Map); // 作成されたSHA256ToMd5Mapのログ出力
    console.timeEnd("append songdatamap"); // 処理時間の計測終了（楽曲データMap追加）
    return newSha256ToMd5Map; // 作成したMapを返す
}

/**
 * JSONデータをファイルとしてダウンロードさせる関数。
 * @param {object} jsonData - ダウンロードするJSONデータ
 */
function downloadJson(jsonData) {
    // データを加工してからソート
    const processedData = processAndSortData(jsonData);

    const jsonString = JSON.stringify(processedData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" }); // JSON文字列からBlobオブジェクトを作成
    const url = URL.createObjectURL(blob); // BlobオブジェクトのURLを作成
  
    // 現在の日付を取得してファイル名に含める
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // 月は0から始まるので+1、2桁表示
    const day = String(now.getDate()).padStart(2, '0'); // 日を2桁表示
    const filename = `score_data_${year}-${month}-${day}.json`;
  
    const link = document.createElement("a"); // 新しい<a>要素を作成
    link.href = url; // ダウンロードURLを設定
    link.download = filename; // ダウンロードするファイル名を指定
    link.click(); // リンクをプログラム的にクリックしてダウンロードを開始
  
    URL.revokeObjectURL(url); // 作成したURLを解放
  }

function processAndSortData(data) {
const processedEntries = Object.entries(data).map(([date, songData]) => {
    const processedSongData = {};
    for (const songTitle in songData) {
    const entry = { ...songData[songTitle] }; // Shallow copy

    if (entry.old_bp === 2147483647) {
        entry.old_bp = "Not Played";
    }
    if (entry.clear === "-1") {
        entry.clear = "Unchanged";
    }
    processedSongData[songTitle] = entry;
    }
    return [date, processedSongData];
});

// 日付でソート
processedEntries.sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));

// ソートされたデータを元のJSONのようなオブジェクトに戻す
const sortedAndProcessedData = {};
processedEntries.forEach(([date, songData]) => {
    sortedAndProcessedData[date] = songData;
});

return sortedAndProcessedData;
}

/**
 * タブ切り替えボタンの表示を制御する関数。
 */
function showTabButtons() {
    console.log("show tab button"); // ログ出力
    const tabButtons = document.getElementById('tab-buttons'); // 'tab-buttons'というIDを持つ要素を取得
    if (tabButtons) { // 要素が存在する場合
        console.log(tabButtons); // 取得した要素のログ出力
        tabButtons.style.display = 'block'; // タブ切り替え機能のため維持
    }
}


function getSha256ToMd5Map() {
    return sha256ToMd5Map;
}

export { getSha256ToMd5Map };