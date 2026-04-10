// --- UI操作モジュール ---

import { t } from '../i18n.js';

// HTML要素への参照
const difficultyTableSelect = document.getElementById('difficulty-table-select');
const lnModeRadios = document.querySelectorAll('input[type="radio"][name="ln-mode"]');
const lampGraphArea = document.getElementById('lamp-graph-area');
const songListArea = document.getElementById('song-list-area');

/**
 * 難易度表選択プルダウンを生成する
 * @param {Array<object>} tablesData - 難易度表データの配列
 */
function populateDifficultySelect(tablesData) {
    difficultyTableSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = t('lamp.select_table');
    difficultyTableSelect.appendChild(defaultOption);

    tablesData.forEach(table => {
        if (table.tableFullName && table.internalFileName) {
            const option = document.createElement('option');
            option.value = table.internalFileName;
            option.textContent = table.tableFullName;
            difficultyTableSelect.appendChild(option);
        } else {
            console.warn("難易度表データに tableFullName または internalFileName がありません:", table);
        }
    });
}

/**
 * イベントリスナーを設定する
 * @param {Function} onSelectionChange - 難易度表またはLNモード変更時のコールバック (internalFileName, lnModeValue) => Promise<void>
 * @param {Function} onGraphClick - グラフセグメントクリック時のコールバック (level, clearStatus) => void
 */
function setupEventListeners(onSelectionChange, onGraphClick) {
    // プルダウンリスト変更時の処理
    difficultyTableSelect.addEventListener('change', async (event) => {
        const selectedInternalFileName = event.target.value;
        let selectedLnModeValue;
        for (const radio of lnModeRadios) {
            if (radio.checked) {
                selectedLnModeValue = radio.value;
                break;
            }
        }
        await onSelectionChange(selectedInternalFileName, selectedLnModeValue);
    });

    // LN mode変更時の処理
    lnModeRadios.forEach(radio => {
        radio.addEventListener('change', async (event) => {
            const selectedLnModeValue = event.target.value;
            const selectedInternalFileName = difficultyTableSelect.value;

            console.log(`LNモードが変更されました: ${selectedLnModeValue}`);
            console.log(`現在の難易度ファイル名: ${selectedInternalFileName}`);

            await onSelectionChange(selectedInternalFileName, selectedLnModeValue);
        });
    });

    // 帯グラフエリアでのクリックイベント処理 (イベント委譲)
    lampGraphArea.addEventListener('click', (event) => {
        const segment = event.target.closest('.lamp-graph-segment');
        const bar = event.target.closest('.lamp-graph-bar');

        if (segment && bar) {
            const level = bar.dataset.level;
            const clearStatus = segment.dataset.clearStatus;

            if (level && clearStatus) {
                onGraphClick(level, clearStatus);
            } else {
                console.warn("クリックされたセグメントから level または clearStatus を取得できませんでした。");
                songListArea.innerHTML = `<p>${t('lamp.song_list_error')}</p>`;
            }
        } else if (bar) {
            songListArea.innerHTML = '';
        }
    });
}

/**
 * DOM要素の参照を取得する
 * @returns {{ difficultyTableSelect, lampGraphArea, songListArea }}
 */
function getDOMElements() {
    return { difficultyTableSelect, lampGraphArea, songListArea };
}

export { populateDifficultySelect, setupEventListeners, getDOMElements };
