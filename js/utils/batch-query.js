import { splitIntoChunks, createPlaceholders } from './sql-chunker.js';

/**
 * Uint8ArrayからDBを開き、SHA256リストに対してバッチクエリを実行する汎用関数
 * @param {object} SQL - sql.jsのSQLオブジェクト
 * @param {Uint8Array} dbData - データベースのUint8Array
 * @param {string} queryTemplate - クエリテンプレート（{placeholders}がIN句に置換される）
 * @param {Array<string>} sha256List - クエリ対象のSHA256リスト
 * @param {Function} rowMapper - 各行を処理するコールバック (row, result) => void
 * @param {Function} resultFactory - 結果コンテナを生成する関数 () => Map|Array
 * @returns {Promise<Map|Array>} クエリ結果
 */
export async function executeBatchQuery(SQL, dbData, queryTemplate, sha256List, rowMapper, resultFactory = () => new Map()) {
    const result = resultFactory();

    if (!dbData || !(dbData instanceof Uint8Array)) {
        console.error("dbData が Uint8Array としてロードされていません。");
        return result;
    }
    if (!SQL) {
        console.error("SQL.jsが初期化されていません。");
        return result;
    }
    if (!sha256List || sha256List.length === 0) {
        return result;
    }

    let db = null;

    try {
        db = new SQL.Database(dbData);

        for (const batch of splitIntoChunks(sha256List)) {
            const placeholders = createPlaceholders(batch.length);
            const query = queryTemplate.replace('{placeholders}', placeholders);

            let stmt = null;
            try {
                stmt = db.prepare(query);
                stmt.bind(batch);

                while (stmt.step()) {
                    const row = stmt.getAsObject();
                    rowMapper(row, result);
                }
            } catch (batchQueryError) {
                console.error(`バッチクエリの実行中にエラーが発生しました (バッチサイズ: ${batch.length}):`, batchQueryError);
            } finally {
                if (stmt) {
                    try { stmt.free(); } catch(e) { console.error("Statement free中にエラー:", e); }
                }
            }
        }
    } catch (dbError) {
        console.error("データベースを開く際にエラーが発生しました:", dbError);
        return result;
    } finally {
        if (db) {
            try { db.close(); } catch (e) { console.error("データベースのクローズ中にエラー:", e); }
        }
    }

    return result;
}
