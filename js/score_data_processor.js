import { sqlPromise } from './db_uploader.js';

export async function findMissingSha256sByMd5s(db, md5List) {
    if (md5List.length === 0) {
        return new Map();
    }

    const chunkSize = 999;
    const allResults = new Map();

    for (let i = 0; i < md5List.length; i += chunkSize) {
        const chunk = md5List.slice(i, i + chunkSize);
        const chunkResults = await executeMd5ChunkQuery(db, chunk);
        for(const [md5,sha256] of chunkResults){
            allResults.set(md5,sha256);
        }
    }

    return allResults;
}

export async function executeMd5ChunkQuery(db, md5Chunk) {
    if (md5Chunk.length === 0) {
        return new Map();
    }

    const md5Placeholders = md5Chunk.map(() => '?').join(',');
    const query = `SELECT md5, sha256 FROM song WHERE md5 IN (${md5Placeholders})`;

    try {
        const stmt = db.prepare(query);
        stmt.bind(md5Chunk);

        const results = new Map();
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.set(row.md5,row.sha256);
        }
        stmt.free();
        return results;
    } catch (error) {
        console.error("songテーブル検索エラー:", error);
        return new Map();
    }
}

export async function findScoresBySha256s(scorelogDb, sha256ToMd5Map,songDataMap) {
    const sha256List = Array.from(sha256ToMd5Map.keys());

    if (sha256List.length === 0) {
        return [];
    }

    const chunkSize = 999;
    const allResults = [];

    for (let i = 0; i < sha256List.length; i += chunkSize) {
        const chunk = sha256List.slice(i, i + chunkSize);
        const chunkResults = await executeChunkQuery(scorelogDb, chunk);
        allResults.push(...chunkResults);
    }

    const results = allResults.filter(result => sha256ToMd5Map.has(result.sha256)).map(result => {
        const md5 = sha256ToMd5Map.get(result.sha256);
        const song = songDataMap.get(md5);
        let formattedTitle = song?.title || "不明"; // デフォルト値は「不明」

        if (song?.levels && Array.isArray(song.levels)) {
            if (song.levels.length === 1) {
                formattedTitle = `${song.levels[0].shortName}${song.levels[0].level} ${song.title}`;
            } else if (song.levels.length > 1) {
                const levelsString = song.levels.map(level => `${level.shortName}${level.level}`).join("/");
                formattedTitle = `${levelsString} ${song.title}`;
            }
        }
        return {
            ...result,
            md5: md5,
            title: formattedTitle // 整形後のタイトルを設定
        };
    });

    return results;
}

async function executeChunkQuery(db, sha256Chunk) {
    if (sha256Chunk.length === 0) {
        return [];
    }

    const sha256Placeholders = sha256Chunk.map(() => '?').join(',');
    const query = `SELECT sha256, date FROM scorelog WHERE sha256 IN (${sha256Placeholders})`; // sha256で検索するように変更

    try {
        const stmt = db.prepare(query);
        stmt.bind(sha256Chunk);

        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push(row);
        }
        stmt.free();
        return results;
    } catch (error) {
        console.error("SQLクエリ実行エラー:", error);
        return [];
    }
}
