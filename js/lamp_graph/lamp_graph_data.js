// --- データ取得・処理モジュール ---

import { sqlPromise } from '../db_uploader.js';
import { getSha256ToMd5Map } from '../score_change_to_json.js';
import { scoreDbData } from '../db_uploader.js';
import { songdataDbData } from '../db_uploader.js';
import { executeBatchQuery } from '../utils/batch-query.js';

// sql.js のコアオブジェクト (初期化後に設定)
let SQL = null;

// Md5 -> Sha256 の逆引きMap (初期化後に設定)
let Md5Tosha256Map;

// 難易度表の定義一覧（levels配列を含む）
let difficultyTablesConfig = [];

/**
 * sha256ToMd5Map から逆引き用の Md5Tosha256Map を作成する
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
    }
    return md5Map;
}

/**
 * 難易度表一覧のデータを読み込む
 * @returns {Promise<Array<object>>} 難易度表データの配列
 */
async function loadDifficultyTables() {
    const url = './raw_difficulty_table_data/difficulty_tables.json';
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        }
        const data = await response.json();
        let tables = [];
        if (Array.isArray(data)) {
            tables = data;
        } else if (data && Array.isArray(data.tables)) {
             tables = data.tables;
        } else {
            console.warn(`予期しない形式の難易度表一覧データです (${url})`);
            tables = [];
        }

        // モジュール変数に保存（levels配列を保持）
        difficultyTablesConfig = tables;

        return tables;
    } catch (error) {
        console.error(`難易度表一覧データ(${url})の読み込みに失敗しました:`, error);
        throw error;
    }
}


/**
 * internalFileNameに基づいて難易度表データを読み込む
 * @param {string} internalFileName - 読み込むJSONファイル名 (拡張子なし)
 * @returns {Promise<object>} 楽曲データオブジェクト ({ songs: [...] })
 */
async function loadSongData(internalFileName) {
    const url = `./raw_difficulty_table_data/${internalFileName}.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`楽曲データ(${url})の読み込みに失敗しました:`, error);
        throw error;
    }
}


/**
 * 指定された複数のSHA256ハッシュに対応するスコアデータをscoreDbData(Uint8Array)から一括取得する
 * @param {Array<string>} sha256List - 取得したいスコアのSHA256ハッシュ値の配列
 * @param {number} selectedLnModeValue - LNモード値
 * @returns {Promise<Map<string, { clear: number, minbp: number | null }>>} - SHA256をキーとしたスコアデータのMap
 */
async function getScoresBySha256s(sha256List, selectedLnModeValue) {
    const modeNum = parseInt(selectedLnModeValue, 10);
    const queryTemplate = `SELECT sha256, clear, minbp, notes, mode, epg, lpg, egr, lgr FROM score WHERE mode = ${modeNum} AND sha256 IN ({placeholders})`;

    const scoresMap = await executeBatchQuery(SQL, scoreDbData, queryTemplate, sha256List, (row, result) => {
        const clearValue = Number(row.clear);
        const minbpValue = row.minbp !== undefined && row.minbp !== null ? Number(row.minbp) : null;
        const notes = Number(row.notes);
        const mode = Number(row.mode);
        const epg = Number(row.epg);
        const lpg = Number(row.lpg);
        const egr = Number(row.egr);
        const lgr = Number(row.lgr);
        const exscore = (epg + lpg) * 2 + egr + lgr;

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
 * @param {number} selectedLnModeValue - LNモード値
 * @returns {Promise<{ songDetails: Array<object>, aggregatedData: Map<string, Map<string, { count: number, songs: Array<object> }>> }>}
 */
async function processSongScores(songs, selectedLnModeValue) {
    const aggregatedData = new Map();
    const songDetails = [];
    const sha256ToFetch = new Set();
    const tempSongInfos = [];

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

        if (!currentSha256 && md5 && Md5Tosha256Map.has(md5)) {
            currentSha256 = Md5Tosha256Map.get(md5);
        }

        tempSongInfos.push({
            originalSong: song,
            level: level,
            title: title,
            md5: md5,
            sha256: currentSha256,
            site_url: site_url
        });

        if (currentSha256) {
            sha256ToFetch.add(currentSha256);
        }
    }
    console.log(`フェーズ1完了。スコア取得対象のユニークなSHA256数: ${sha256ToFetch.size}`);


    // --- フェーズ2: スコアデータの一括取得 ---
    console.log("フェーズ2: スコアデータの一括取得を開始...");
    const sha256List = Array.from(sha256ToFetch);
    const songsMap = await checkExistSongsBySha256s(sha256List);
    const scoresMap = await getScoresBySha256s(sha256List, 0);
    let scoresMapXn = null
    if (Number(selectedLnModeValue) !== 0) {
        scoresMapXn = await getScoresBySha256s(sha256List, selectedLnModeValue)
    }
    console.log("フェーズ2完了。");

    // --- フェーズ3: スコアデータのマージと集計 ---
    console.log("フェーズ3: スコアデータのマージと集計を開始...");
    for (const songInfo of tempSongInfos) {
        let clear = -1;
        let minbp = null;
        let notes = null
        let mode = null;
        let exscore = null;
        let sha256 = null;

        if (songInfo.sha256 && songsMap.includes(songInfo.sha256)){
            clear = 0;
            sha256 = songInfo.sha256
        }

        if (sha256 && scoresMap.has(sha256)) {
            const scoreRecord = scoresMap.get(sha256);
            clear = scoreRecord.clear;
            minbp = scoreRecord.minbp;
            mode = scoreRecord.mode;
            notes = scoreRecord.notes;
            exscore = scoreRecord.exscore;
        }
        if (sha256 && scoresMapXn && scoresMapXn.has(sha256)) {
            const scoreRecordXn = scoresMapXn.get(sha256);
            clear = scoreRecordXn.clear;
            minbp = scoreRecordXn.minbp;
            mode = scoreRecordXn.mode;
            notes = scoreRecordXn.notes;
            exscore = scoreRecordXn.exscore;
        }

        const finalSongInfo = {
            level: songInfo.level,
            title: songInfo.title,
            site_url: songInfo.site_url,
            md5: songInfo.md5,
            sha256: songInfo.sha256,
            clear: String(clear),
            minbp: minbp,
            notes: notes,
            exscore: exscore
        };
        songDetails.push(finalSongInfo);

        // --- 集計処理 ---
        if (!aggregatedData.has(finalSongInfo.level)) {
            aggregatedData.set(finalSongInfo.level, new Map());
        }
        const levelData = aggregatedData.get(finalSongInfo.level);

        const clearStr = finalSongInfo.clear;
        if (!levelData.has(clearStr)) {
            levelData.set(clearStr, { count: 0, songs: [] });
        }
        const clearData = levelData.get(clearStr);
        clearData.count++;
        clearData.songs.push(finalSongInfo);
    }
    console.log("フェーズ3完了。");

    return { songDetails, aggregatedData };
}

/**
 * SQL.jsを初期化する
 * @returns {Promise<void>}
 */
async function initializeSQL() {
    if (typeof sqlPromise === 'undefined') {
        throw new Error("sqlPromiseが定義されていません。");
    }
    SQL = await sqlPromise;
    console.log("SQL.jsの初期化完了");
}

/**
 * Md5Tosha256Mapを初期化する
 */
function initializeMd5Map() {
    Md5Tosha256Map = createMd5ToSha256Map();
    if (!Md5Tosha256Map || Md5Tosha256Map.size === 0) {
        console.warn("Md5Tosha256Mapの作成に失敗したか、空です。sha256ToMd5Mapを確認してください。");
    } else {
        console.log("Md5 to Sha256 Map 作成完了");
    }
}

/**
 * difficultyTablesConfigを取得する
 * @returns {Array<object>}
 */
function getDifficultyTablesConfig() {
    return difficultyTablesConfig;
}

/**
 * SQL初期化済みか確認する
 * @returns {boolean}
 */
function isSQLInitialized() {
    return SQL !== null;
}

export {
    initializeSQL,
    initializeMd5Map,
    loadDifficultyTables,
    loadSongData,
    processSongScores,
    getDifficultyTablesConfig,
    isSQLInitialized
};
