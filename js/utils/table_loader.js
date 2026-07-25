// --- 難易度表データ読み込み共通ユーティリティ ---

/**
 * JSON URLをfetchして取得する共通ヘルパー
 * @param {string} url - 取得先URL
 * @param {(status: number) => string} httpErrorMessage - HTTPエラー時のメッセージを生成する関数
 * @returns {Promise<any>} パース済みJSON
 */
async function fetchJson(url, httpErrorMessage) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(httpErrorMessage(response.status));
    }
    return await response.json();
}

/**
 * difficulty_tables.json のレスポンスから表配列を抽出する（Array直下 or { tables: [...] } の両形式に対応）
 * @param {any} data - fetchJson等で取得したデータ
 * @returns {Array<object>|null} 抽出できた配列。形式が不正な場合はnull
 */
function extractTablesArray(data) {
    if (Array.isArray(data)) {
        return data;
    }
    if (data && Array.isArray(data.tables)) {
        return data.tables;
    }
    return null;
}

export { fetchJson, extractTablesArray };
