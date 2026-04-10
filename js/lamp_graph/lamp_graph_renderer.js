// --- レンダリングモジュール ---

import { t } from '../i18n.js';
import { CLEAR_STATUS, CLEAR_STATUS_ORDER } from '../constants.js';

// 曲リストのソート状態
let songListSortState = { column: 'title', ascending: true };

/**
 * 背景色に基づいてコントラストの高いテキストの色（白または黒）を返す
 * @param {string} hexcolor - 16進数の色コード (#rrggbb形式)
 * @returns {string} - 'white' または 'black'
 */
function getContrastColor(hexcolor) {
    const r = parseInt(hexcolor.slice(1, 3), 16);
    const g = parseInt(hexcolor.slice(3, 5), 16);
    const b = parseInt(hexcolor.slice(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? 'black' : 'white';
}

/**
 * 曲リストをソートする
 * @param {Array<object>} songs - ソート対象の曲配列
 * @param {string} column - ソートカラム名
 * @param {boolean} ascending - 昇順ならtrue
 * @returns {Array<object>} ソート済みの新しい配列
 */
function sortSongs(songs, column, ascending) {
    return [...songs].sort((a, b) => {
        if (column === 'title') {
            const aVal = a.title || '';
            const bVal = b.title || '';
            return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }

        // 数値カラム
        let aVal, bVal;
        if (column === 'bp') {
            aVal = (a.minbp !== null && !isNaN(a.minbp)) ? a.minbp : null;
            bVal = (b.minbp !== null && !isNaN(b.minbp)) ? b.minbp : null;
        } else if (column === 'notes') {
            aVal = (a.notes !== null && !isNaN(a.notes)) ? a.notes : null;
            bVal = (b.notes !== null && !isNaN(b.notes)) ? b.notes : null;
        } else if (column === 'exscore') {
            aVal = (a.exscore !== null && !isNaN(a.exscore)) ? a.exscore : null;
            bVal = (b.exscore !== null && !isNaN(b.exscore)) ? b.exscore : null;
        } else if (column === 'rate') {
            aVal = (a.notes && a.exscore !== null && !isNaN(a.exscore) && a.notes > 0) ? (a.exscore / (a.notes * 2)) * 100 : null;
            bVal = (b.notes && b.exscore !== null && !isNaN(b.exscore) && b.notes > 0) ? (b.exscore / (b.notes * 2)) * 100 : null;
        }

        // null値はソート末尾に配置
        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;
        return ascending ? aVal - bVal : bVal - aVal;
    });
}

/**
 * ソートインジケーター（▲/▼）を更新する
 * @param {HTMLTableElement} table - 対象テーブル
 */
function updateSortIndicators(table) {
    const ths = table.querySelectorAll('thead th[data-sort]');
    ths.forEach(th => {
        const col = th.getAttribute('data-sort');
        const indicator = th.querySelector('.sort-indicator');
        if (col === songListSortState.column) {
            indicator.textContent = songListSortState.ascending ? ' ▲' : ' ▼';
            th.classList.add('sort-active');
        } else {
            indicator.textContent = '';
            th.classList.remove('sort-active');
        }
    });
}

/**
 * tbodyのみを再描画する
 * @param {HTMLTableElement} table - 対象テーブル
 * @param {Array<object>} songs - 元の曲配列
 */
function createTableBody(table, songs) {
    const oldTbody = table.querySelector('tbody');
    if (oldTbody) oldTbody.remove();

    const sorted = sortSongs(songs, songListSortState.column, songListSortState.ascending);
    const tbody = document.createElement('tbody');

    sorted.forEach(song => {
        const tr = document.createElement('tr');

        // 譜面名
        const tdTitle = document.createElement('td');
        tdTitle.classList.add('title-cell');
        if (song.site_url) {
            const link = document.createElement('a');
            link.href = song.site_url;
            link.textContent = song.title;
            link.target = '_blank';
            tdTitle.appendChild(link);
        } else {
            tdTitle.textContent = song.title;
        }
        tr.appendChild(tdTitle);

        // BP
        const tdBp = document.createElement('td');
        tdBp.classList.add('numeric-cell');
        tdBp.textContent = (song.minbp !== null && !isNaN(song.minbp)) ? song.minbp : '-';
        tr.appendChild(tdBp);

        // Notes
        const tdNotes = document.createElement('td');
        tdNotes.classList.add('numeric-cell');
        tdNotes.textContent = (song.notes !== null && !isNaN(song.notes) && song.notes > 0) ? song.notes : '-';
        tr.appendChild(tdNotes);

        // EXスコア
        const tdExscore = document.createElement('td');
        tdExscore.classList.add('numeric-cell');
        tdExscore.textContent = (song.exscore !== null && !isNaN(song.exscore) && song.exscore > 0) ? song.exscore : '-';
        tr.appendChild(tdExscore);

        // スコアレート
        const tdRate = document.createElement('td');
        tdRate.classList.add('numeric-cell');
        if (song.notes && song.notes > 0 && song.exscore !== null && !isNaN(song.exscore) && song.exscore > 0) {
            const rate = (song.exscore / (song.notes * 2)) * 100;
            tdRate.textContent = rate.toFixed(2) + '%';
        } else {
            tdRate.textContent = '-';
        }
        tr.appendChild(tdRate);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
}

/**
 * 曲リストテーブルを生成する
 * @param {Array<object>} songs - 表示する曲配列
 * @returns {HTMLTableElement} 生成されたテーブル要素
 */
function createSongTable(songs) {
    const table = document.createElement('table');
    table.classList.add('song-list-table');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const columns = [
        { key: 'title', label: t('lamp.table.title') },
        { key: 'bp', label: t('lamp.table.bp') },
        { key: 'notes', label: t('lamp.table.notes') },
        { key: 'exscore', label: t('lamp.table.exscore') },
        { key: 'rate', label: t('lamp.table.rate') },
    ];

    columns.forEach(col => {
        const th = document.createElement('th');
        th.setAttribute('data-sort', col.key);
        if (col.key !== 'title') th.classList.add('numeric-cell');

        const labelSpan = document.createElement('span');
        labelSpan.textContent = col.label;
        th.appendChild(labelSpan);

        const indicator = document.createElement('span');
        indicator.classList.add('sort-indicator');
        th.appendChild(indicator);

        th.addEventListener('click', () => {
            if (songListSortState.column === col.key) {
                songListSortState.ascending = !songListSortState.ascending;
            } else {
                songListSortState.column = col.key;
                songListSortState.ascending = true;
            }
            createTableBody(table, songs);
            updateSortIndicators(table);
        });

        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    createTableBody(table, songs);
    updateSortIndicators(table);

    return table;
}

/**
 * 集計データに基づいて帯グラフのHTMLを生成し表示する
 * @param {Map<string, Map<string, { count: number, songs: Array<object> }>>} aggregatedData - 集計データ
 * @param {string} shortName - 短縮名
 * @param {Array<string>} predefinedLevels - 事前定義されたレベル順
 * @param {HTMLElement} lampGraphArea - グラフ表示エリア
 */
function displayLampGraphs(aggregatedData, shortName, predefinedLevels, lampGraphArea) {
    lampGraphArea.innerHTML = '';
    lampGraphArea.classList.add('default-cursor');

    if (aggregatedData.size === 0) {
        lampGraphArea.innerHTML = `<p>${t('lamp.no_data')}</p>`;
        return;
    }

    // レベルでソート
    let sortedLevels;

    if (predefinedLevels && Array.isArray(predefinedLevels)) {
        sortedLevels = predefinedLevels.filter(level => aggregatedData.has(level));
        console.log(`Using predefined level order: ${sortedLevels.join(', ')}`);
    } else {
        sortedLevels = Array.from(aggregatedData.keys()).sort((a, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            if (isNaN(numA) && !isNaN(numB)) return 1;
            if (!isNaN(numA) && isNaN(numB)) return -1;
            return a.localeCompare(b);
        });
    }

    for (const level of sortedLevels) {
        const levelData = aggregatedData.get(level);
        let totalSongsInLevel = 0;
        levelData.forEach(data => {
            totalSongsInLevel += data.count;
        });

        if (totalSongsInLevel === 0) continue;

        const levelContainer = document.createElement('div');
        levelContainer.classList.add('level-item');

        const levelLabel = document.createElement('div');
        levelLabel.classList.add('level-label');
        levelLabel.textContent = `${shortName}${level} (${totalSongsInLevel})`;

        levelContainer.appendChild(levelLabel);

        const graphBar = document.createElement('div');
        graphBar.classList.add('lamp-graph-bar');
        graphBar.dataset.level = level;

        let currentPercentage = 0;

        for (const clearCode of CLEAR_STATUS_ORDER) {
            const clearData = levelData.get(clearCode);
            if (clearData && clearData.count > 0) {
                const percentage = (clearData.count / totalSongsInLevel) * 100;

                const segment = document.createElement('div');
                segment.classList.add('lamp-graph-segment');
                segment.style.width = `${percentage}%`;
                segment.style.backgroundColor = CLEAR_STATUS[clearCode]?.color || '#888';
                segment.style.left = `${currentPercentage}%`;
                segment.dataset.clearStatus = clearCode;
                segment.title = `${CLEAR_STATUS[clearCode]?.name || 'Unknown'}: ${clearData.count} songs (${percentage.toFixed(1)}%)`;

                const countSpan = document.createElement('span');
                countSpan.textContent = clearData.count;
                countSpan.style.color = getContrastColor(CLEAR_STATUS[clearCode]?.color || '#888');
                segment.appendChild(countSpan);

                graphBar.appendChild(segment);
                currentPercentage += percentage;
            }
        }
        levelContainer.appendChild(graphBar);
        lampGraphArea.appendChild(levelContainer);
    }
}

/**
 * クリックされたグラフセグメントに対応する楽曲リストを表示する
 * @param {string} level - 選択されたレベル
 * @param {string} clearStatus - 選択されたクリア状態
 * @param {Map<string, Map<string, { count: number, songs: Array<object> }>>} aggregatedData - 集計データ
 * @param {string} shortName - 短縮名
 * @param {HTMLElement} songListArea - 曲リスト表示エリア
 */
function displaySongList(level, clearStatus, aggregatedData, shortName, songListArea) {
    songListArea.innerHTML = '';

    const levelData = aggregatedData.get(level);
    const clearData = levelData?.get(clearStatus);

    if (!clearData || clearData.songs.length === 0) {
        songListArea.textContent = t('lamp.no_songs');
        return;
    }

    const songsToShow = clearData.songs;

    // ソート状態をリセット
    songListSortState = { column: 'title', ascending: true };

    const listTitle = document.createElement('h3');
    const clearName = CLEAR_STATUS[clearStatus]?.name || `Status ${clearStatus}`;
    listTitle.textContent = `${shortName}${level} - ${clearName} (${songsToShow.length} songs)`;
    songListArea.appendChild(listTitle);

    const table = createSongTable(songsToShow);
    songListArea.appendChild(table);
}

export { displayLampGraphs, displaySongList };
