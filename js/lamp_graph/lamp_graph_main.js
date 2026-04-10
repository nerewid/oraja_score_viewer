// --- メインロジック（統合・初期化）---

import { t } from '../i18n.js';
import { scoreDbData } from '../db_uploader.js';
import {
    initializeSQL,
    initializeMd5Map,
    loadDifficultyTables,
    loadSongData,
    processSongScores,
    getDifficultyTablesConfig,
    isSQLInitialized
} from './lamp_graph_data.js';
import { displayLampGraphs, displaySongList } from './lamp_graph_renderer.js';
import { populateDifficultySelect, setupEventListeners, getDOMElements } from './lamp_graph_ui.js';

// 現在選択中の集計データ（モジュールスコープ）
let currentAggregatedData = null;
let currentShortName = null;

/**
 * 難易度表選択時のメイン処理
 * @param {string} selectedInternalFileName - 選択された難易度表のファイル名
 * @param {number} selectedLnModeValue - LNモード値
 */
async function processDifficultyTableSelection(selectedInternalFileName, selectedLnModeValue) {
    const { difficultyTableSelect, lampGraphArea, songListArea } = getDOMElements();

    lampGraphArea.innerHTML = `<p>${t('lamp.loading')}</p>`;
    songListArea.innerHTML = '';

    if (!selectedInternalFileName) {
        lampGraphArea.innerHTML = '';
        return;
    }

    // score.db が読み込まれているか確認
    if (!scoreDbData) {
        lampGraphArea.innerHTML = `<p style="color: red;">${t('lamp.load_score_first')}</p>`;
        if (difficultyTableSelect) {
            difficultyTableSelect.value = '';
        }
        return;
    }
    // SQL.jsが初期化されているか確認
    if (!isSQLInitialized()) {
        lampGraphArea.innerHTML = '<p style="color: red;">データベースライブラリが初期化されていません。</p>';
        if (difficultyTableSelect) {
            difficultyTableSelect.value = '';
        }
        return;
    }

    try {
        // 1. 選択された難易度表に対応する楽曲リストJSONを読み込む
        const songListData = await loadSongData(selectedInternalFileName);

        const songs = songListData?.songs;
        const shortName = songListData?.shortName;
        if (!Array.isArray(songs)) {
            throw new Error(`読み込んだJSONに 'songs' 配列が含まれていません (${selectedInternalFileName}.json)`);
        }

        // 2. 楽曲リストとスコアDBを突き合わせて処理・集計
        const { aggregatedData } = await processSongScores(songs, selectedLnModeValue);

        // 2.5. 選択された難易度表のlevels配列を取得
        const difficultyTablesConfig = getDifficultyTablesConfig();
        const tableConfig = difficultyTablesConfig.find(t => t.internalFileName === selectedInternalFileName);
        const predefinedLevels = tableConfig?.levels;

        // 3. 集計結果を帯グラフとして表示
        displayLampGraphs(aggregatedData, shortName, predefinedLevels, lampGraphArea);

        // 4. クリック時に参照する集計データを保持
        currentAggregatedData = aggregatedData;
        currentShortName = shortName;

    } catch (error) {
        console.error('難易度表データの処理中にエラーが発生しました:', error);
        lampGraphArea.innerHTML = `<p style="color: red;">データの処理中にエラーが発生しました: ${error.message}</p>`;
        currentAggregatedData = null;
    }
}


/**
 * アプリケーションの初期化関数
 */
async function initializeApp() {
    const { difficultyTableSelect, lampGraphArea, songListArea } = getDOMElements();

    // 状態をリセット
    lampGraphArea.innerHTML = '';
    songListArea.innerHTML = '';
    if(difficultyTableSelect) difficultyTableSelect.innerHTML = '<option value="">---</option>';

    // 0. sql.jsの初期化
    try {
        await initializeSQL();
    } catch (error) {
        console.error("SQL.js の初期化に失敗しました:", error);
        return;
    }

    // 1. Md5 -> Sha256 Mapを作成
    try {
        initializeMd5Map();
    } catch (error) {
        console.error("Md5Tosha256Mapの作成中にエラー:", error);
    }

    // 2. 難易度表データを読み込み、プルダウンを生成
    try {
        const difficultyTables = await loadDifficultyTables();
        populateDifficultySelect(difficultyTables);
        console.log("難易度表プルダウン生成完了");
    } catch(error) {
        console.error("難易度表データの読み込みまたはプルダウン生成に失敗:", error);
        if (difficultyTableSelect) {
            difficultyTableSelect.innerHTML = `<option value="">${t('lamp.table_load_error')}</option>`;
        }
    }

    // 3. イベントリスナーを設定
    setupEventListeners(
        processDifficultyTableSelection,
        (level, clearStatus) => {
            if (currentAggregatedData) {
                const { songListArea } = getDOMElements();
                displaySongList(level, clearStatus, currentAggregatedData, currentShortName, songListArea);
            }
        }
    );

    console.log("アプリケーションの初期化が完了しました。");
}


// --- 実行 ---

document.addEventListener('DOMContentLoaded', () => {
    const tabBButton = document.querySelector('#tab-buttons button[data-tab="tabB"]');

    if (tabBButton) {
        const initializeAppOnce = () => {
            initializeApp();
            tabBButton.removeEventListener('click', initializeAppOnce);
        };
        tabBButton.addEventListener('click', initializeAppOnce);
    } else {
        console.error("data-tab='tabB' を持つボタン要素が見つかりません。");
    }
});
