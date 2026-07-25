// --- レベル文字列比較の共通ユーティリティ ---

/**
 * レベル文字列を比較する（数値優先、その後localeCompare）
 * 数値に変換できない値は末尾に配置される
 * @param {string} levelA
 * @param {string} levelB
 * @returns {number}
 */
function compareLevels(levelA, levelB) {
    const numA = parseInt(levelA, 10);
    const numB = parseInt(levelB, 10);

    if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
    }
    if (isNaN(numA) && !isNaN(numB)) return 1;
    if (!isNaN(numA) && isNaN(numB)) return -1;

    return levelA.localeCompare(levelB);
}

export { compareLevels };
