import { executeBatchQueryOnDb } from './utils/batch-query.js';

export async function findMissingSha256sByMd5s(db, md5List) {
    if (md5List.length === 0) {
        return new Map();
    }

    return executeBatchQueryOnDb(
        db,
        'SELECT md5, sha256 FROM song WHERE md5 IN ({placeholders})',
        md5List,
        (row, result) => result.set(row.md5, row.sha256),
        () => new Map()
    );
}

export async function findScoresBySha256s(scorelogDb, sha256ToMd5Map,songDataMap) {
    const sha256List = Array.from(sha256ToMd5Map.keys());

    if (sha256List.length === 0) {
        return [];
    }

    const allResults = await executeBatchQueryOnDb(
        scorelogDb,
        'SELECT sha256, date FROM scorelog WHERE sha256 IN ({placeholders})',
        sha256List,
        (row, result) => result.push(row),
        () => []
    );

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
