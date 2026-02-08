import { BATCH_SIZE } from '../constants.js';

/**
 * 配列をBATCH_SIZEごとのチャンクに分割する
 * SQLiteのIN句パラメータ制限（999個）に対応するための汎用関数
 * @param {Array} array - 分割する配列
 * @returns {Array<Array>} チャンクの配列
 */
export function splitIntoChunks(array) {
    const chunks = [];
    for (let i = 0; i < array.length; i += BATCH_SIZE) {
        chunks.push(array.slice(i, i + BATCH_SIZE));
    }
    return chunks;
}

/**
 * IN句用のプレースホルダ文字列を生成する
 * @param {number} count - プレースホルダの数
 * @returns {string} カンマ区切りの"?"文字列 (例: "?,?,?")
 */
export function createPlaceholders(count) {
    return Array.from({ length: count }, () => '?').join(',');
}
