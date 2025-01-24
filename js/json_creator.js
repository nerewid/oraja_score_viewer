import { scorelogDbData, sqlPromise } from './db_uploader.js';
import { findScoresBySha256s } from './score_data_processor.js';

export async function createJsonFromScoreLogs(scorelogDb, scorelogEntries) {
    // 最終的なJSON出力（日付をキー、曲情報を値とするMap）
    const jsonOutput = new Map();

    // SQLiteのIN句の制限（999個）に合わせてクエリを分割
    const chunkSize = 999;
    const chunks = [];
    for (let i = 0; i < scorelogEntries.length; i += chunkSize) {
        chunks.push(scorelogEntries.slice(i, i + chunkSize));
    }

    // 分割されたチャンクごとに処理
    for (const chunk of chunks) {
        // 現在のチャンクのsha256とdateの組み合わせをキーとするMapを作成
        const keyMap = new Map();
        chunk.forEach(entry => {
            keyMap.set(`${entry.sha256}-${entry.date}`, entry);
        });

        // 現在のチャンクに対するSQLクエリを生成
        const placeholders = Array.from(keyMap.keys()).map(() => '(?, ?)').join(',');
        const query = `SELECT sha256, date, oldclear, clear, oldscore, score, oldminbp, minbp FROM scorelog WHERE (sha256, date) IN (${placeholders})`;
        const values = Array.from(keyMap.keys()).flatMap(key => key.split('-'));

        // valuesが空の場合はスキップ（scorelogEntriesが空の場合など）
        if (values.length === 0) continue;

        // クエリを実行
        const stmt = scorelogDb.prepare(query);
        stmt.bind(values);

        // クエリ結果をMapに格納（sha256-dateをキーとする）
        const results = new Map();
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.set(`${row.sha256}-${row.date}`, row);
        }
        stmt.free();

        // 現在のチャンクの結果を処理
        for (const [key, entry] of keyMap) {
            const row = results.get(key);
            if (row) {
                const date = new Date(entry.date * 1000);
                const formattedDate = formatDate(date);

                const parsedClear = String(row.clear);
                const parsedOldClear = String(row.oldclear);
                const parsedOldBp = parseInt(row.oldminbp);
                const parsedNewBp = parseInt(row.minbp);

                // スコアが更新されていない場合はスキップ
                if (parsedOldClear === parsedClear && parsedOldBp === parsedNewBp) {
                    continue;
                }

                // 日付ごとのMapが存在しない場合は作成
                if (!jsonOutput.has(formattedDate)) {
                    jsonOutput.set(formattedDate, new Map());
                }

                // 曲ごとのデータが存在しない場合は作成（初期値を設定）
                if (!jsonOutput.get(formattedDate).has(entry.title)) {
                    jsonOutput.get(formattedDate).set(entry.title, {
                        clear: "-1",
                        old_bp: parsedOldBp,
                        new_bp: parsedNewBp
                    });
                } 
                // 既存のデータを更新
                const existingData = jsonOutput.get(formattedDate).get(entry.title);

                // clearを更新（oldclear != clearの場合のみ、より大きい値で更新）
                if (parsedOldClear !== parsedClear && parseInt(parsedClear) > parseInt(existingData.clear)) {
                    existingData.clear = parsedClear;
                }

                // old_bpとnew_bpを更新（oldminbp != minbpの場合のみ、old_bpはより大きい値、new_bpはより小さい値で更新）
                if (parsedOldBp !== parsedNewBp) {
                    if (parsedOldBp > existingData.old_bp) {
                        existingData.old_bp = parsedOldBp;
                    }
                    if (parsedNewBp < existingData.new_bp) {
                        existingData.new_bp = parsedNewBp;
                    }
                }
                
            } else {
                console.warn(`sha256: ${entry.sha256}, date: ${entry.date} に対応するscorelogが見つかりません。`);
            }
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