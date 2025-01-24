import { scorelogDbData, songdataDbData, sqlPromise } from './db_uploader.js';
import { createJsonFromScoreLogs } from './json_creator.js';
import { findScoresBySha256s,findMissingSha256sByMd5s } from './score_data_processor.js';
import { generateHtmlFromJson } from './html_generator.js';

document.getElementById("processData").addEventListener("click", async () => {
    if (!scorelogDbData || !songdataDbData) {
        alert("scorelog.dbまたはsongdata.dbファイルが不足しています。");
        return;
    }
    document.getElementById("upload-area").style.display = "none";

    try {
        console.time("prepation");
        const SQL = await sqlPromise;
        const scorelogDb = new SQL.Database(scorelogDbData);
        const songdataDb = new SQL.Database(songdataDbData);

        const mergedDifficultyTables = await loadJsonFile('difficulty_table_data/merged_difficulty_tables.json');

        if (!mergedDifficultyTables) {
            console.error("merged_difficulty_tables.jsonの読み込みに失敗しました。");
            alert("データ処理中にエラーが発生しました。merged_difficulty_tables.jsonの読み込みに失敗しました。");
            return;
        }

        if (!mergedDifficultyTables.songs || !Array.isArray(mergedDifficultyTables.songs)) {
            console.error("merged_difficulty_tables.jsonのsongsプロパティの形式が不正です。");
            alert("データ処理中にエラーが発生しました。merged_difficulty_tables.jsonの形式が不正です。");
            return;
        }
        console.timeEnd("prepation");

        const songDataMap = createSongDataMap(mergedDifficultyTables.songs);

        const sha256ToMd5Map = await createSha256ToMd5Map(songdataDb, mergedDifficultyTables.songs);

        console.time("find scores");
        let results = await findScoresBySha256s(scorelogDb, sha256ToMd5Map,songDataMap);
        console.log(results);
        console.timeEnd("find scores");

        console.time("create json");
        const jsonOutput = await createJsonFromScoreLogs(scorelogDb, results); // createJsonFromScoreLogsに変更
        //console.log(JSON.stringify(jsonOutput, null, 2));
        console.timeEnd("create json");

        scorelogDb.close();
        songdataDb.close();

        // JSONからHTMLを生成
        const html = await generateHtmlFromJson(jsonOutput, 'js/template.njk');

        // HTMLを画面に表示
        document.getElementById("results-area").innerHTML = html;

        document.getElementById("downloadJson").style.display = "block"; // ダウンロードボタンを表示
        document.getElementById("downloadJson").addEventListener("click", () => {
            downloadJson(jsonOutput); // JSONダウンロードを実行
        });

    } catch (error) {
        console.error("データ処理エラー:", error);
        document.getElementById("upload-area").style.display = "block";
        alert("データ処理中にエラーが発生しました。");
    }
});

async function loadJsonFile(file) {
    try {
        const response = await fetch(file);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${file}`);
        }
        const text = await response.text();//テキスト形式で取得
        try{
            return JSON.parse(text);//JSONパースをtry catchで囲む
        }
        catch(jsonError){
            console.error(`JSONパースエラー(${file}):`, jsonError, text);//エラー情報とテキスト内容を出力
            return null;
        }
    } catch (error) {
        console.error(`fetchエラー(${file}):`, error);
        return null;
    }
}

function createSongDataMap(songs) { // md5をキーとしたマップを作成
    console.time("create songdatamap");
    const songDataMap = new Map();
    songs.forEach(song => {
        if (song.md5) {
            songDataMap.set(song.md5, song);
        }
    });
    console.timeEnd("create songdatamap");
    return songDataMap;
}

async function createSha256ToMd5Map(db, songs) {
    console.time("append songdatamap");
    const sha256ToMd5Map = new Map();
    const missingMd5List = [];

    for (const song of songs) {
        if (song.sha256) {
            sha256ToMd5Map.set(song.sha256, song.md5);
        } else if (song.md5) {
            missingMd5List.push(song.md5);
        }
    }

    const missingSha256Map = await findMissingSha256sByMd5s(db, missingMd5List);

    for (const [md5, sha256] of missingSha256Map) {
        sha256ToMd5Map.set(sha256, md5);
    }
    console.log(sha256ToMd5Map);
    console.timeEnd("append songdatamap");
    return sha256ToMd5Map;
}

function downloadJson(jsonData) {
    const jsonString = JSON.stringify(jsonData, null, 2); // JSONを文字列に変換（整形）
    const blob = new Blob([jsonString], { type: "application/json" }); // Blobオブジェクトを作成
    const url = URL.createObjectURL(blob); // URLを作成

    const link = document.createElement("a");
    link.href = url;
    link.download = "score_data.json"; // ダウンロードファイル名
    link.click(); // リンクをクリックしてダウンロード

    URL.revokeObjectURL(url); // URLを解放
}