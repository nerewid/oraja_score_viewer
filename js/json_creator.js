import { splitIntoChunks } from './utils/sql-chunker.js';
import { INITIAL_CLEAR, UNIX_TO_MS } from './constants.js';

/**
 * sha256とdateの組み合わせキーを生成する
 */
function compositeKey(sha256, date) {
    return `${sha256}-${date}`;
}

/**
 * scorelogの1行をパースして必要なフィールドを返す
 */
function parseScorelogRow(row) {
    return {
        clear: String(row.clear),
        oldClear: String(row.oldclear),
        oldBp: parseInt(row.oldminbp),
        newBp: parseInt(row.minbp),
        oldScore: parseInt(row.oldscore),
        score: parseInt(row.score),
    };
}

/**
 * チャンクのエントリに対応するscorelogをクエリし、結果をMapで返す
 */
function queryChunkResults(scorelogDb, keyMap) {
    const placeholders = Array.from(keyMap.keys()).map(() => '(?, ?)').join(',');
    const query = `SELECT sha256, date, oldclear, clear, oldscore, score, oldminbp, minbp FROM scorelog WHERE (sha256, date) IN (${placeholders})`;
    const values = Array.from(keyMap.keys()).flatMap(key => key.split('-'));

    if (values.length === 0) return null;

    const stmt = scorelogDb.prepare(query);
    stmt.bind(values);

    const results = new Map();
    while (stmt.step()) {
        const row = stmt.getAsObject();
        results.set(compositeKey(row.sha256, row.date), row);
    }
    stmt.free();
    return results;
}

/**
 * 既存の曲データにスコアログのエントリを反映して更新する
 */
function updateSongData(existingData, parsed) {
    // clearを更新（oldclear != clearの場合のみ、より大きい値で更新）
    if (parsed.oldClear !== parsed.clear && parseInt(parsed.clear) > parseInt(existingData.clear)) {
        existingData.clear = parsed.clear;
    }

    // old_bpとnew_bpを更新（oldminbp != minbpの場合のみ、old_bpはより大きい値、new_bpはより小さい値で更新）
    if (parsed.oldBp !== parsed.newBp) {
        if (parsed.oldBp > existingData.old_bp) {
            existingData.old_bp = parsed.oldBp;
        }
        if (parsed.newBp < existingData.new_bp) {
            existingData.new_bp = parsed.newBp;
        }
    }

    // old_scoreとnew_scoreを更新（old_scoreはより小さい値=開始時点、new_scoreはより大きい値=最終結果）
    if (parsed.oldScore < existingData.old_score) {
        existingData.old_score = parsed.oldScore;
    }
    if (parsed.score > existingData.new_score) {
        existingData.new_score = parsed.score;
    }
}

export async function createJsonFromScoreLogs(scorelogDb, scorelogEntries) {
    const jsonOutput = new Map();
    const chunks = splitIntoChunks(scorelogEntries);

    for (const chunk of chunks) {
        const keyMap = new Map();
        chunk.forEach(entry => {
            keyMap.set(compositeKey(entry.sha256, entry.date), entry);
        });

        const results = queryChunkResults(scorelogDb, keyMap);
        if (!results) continue;

        for (const [key, entry] of keyMap) {
            const row = results.get(key);
            if (!row) {
                console.warn(`sha256: ${entry.sha256}, date: ${entry.date} に対応するscorelogが見つかりません。`);
                continue;
            }

            const parsed = parseScorelogRow(row);
            const formattedDate = formatDate(new Date(entry.date * UNIX_TO_MS));

            // ランプ・BP・スコアがすべて変わらない場合のみスキップ
            if (parsed.oldClear === parsed.clear && parsed.oldBp === parsed.newBp && parsed.oldScore === parsed.score) {
                continue;
            }

            if (!jsonOutput.has(formattedDate)) {
                jsonOutput.set(formattedDate, new Map());
            }

            const dateMap = jsonOutput.get(formattedDate);
            if (!dateMap.has(entry.title)) {
                dateMap.set(entry.title, {
                    clear: INITIAL_CLEAR,
                    old_bp: parsed.oldBp,
                    new_bp: parsed.newBp,
                    old_score: parsed.oldScore,
                    new_score: parsed.score,
                    sha256: entry.sha256
                });
            }

            updateSongData(dateMap.get(entry.title), parsed);
        }
    }

    // MapからObjectに変換して返す
    const finalJsonOutput = {};
    for (const [date, titleMap] of jsonOutput) {
        finalJsonOutput[date] = {};
        for (const [title, data] of titleMap) {
            finalJsonOutput[date][title] = data;
        }
    }

    return finalJsonOutput;
}


export function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}