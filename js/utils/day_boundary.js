// 日付の切り替え時刻（day boundary）設定
// 深夜プレイをまとめたい場合に、0時ではなく指定した時刻を日の境界として扱う

import { t } from '../i18n.js';

const DAY_BOUNDARY_STORAGE_KEY = 'dayBoundaryHour';

/**
 * 保存済みの日付切り替え時刻（0〜23の整数）を取得する。
 * 未保存・不正値の場合は0（従来通り0時切り替え）にフォールバックする。
 */
export function getDayBoundaryHour() {
    try {
        const stored = localStorage.getItem(DAY_BOUNDARY_STORAGE_KEY);
        const hour = parseInt(stored, 10);
        if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
            return hour;
        }
    } catch (error) {
        // localStorageが使えない環境では黙って無視する
    }
    return 0;
}

// 日付の切り替え時刻を保存する
function setDayBoundaryHour(hour) {
    try {
        localStorage.setItem(DAY_BOUNDARY_STORAGE_KEY, String(hour));
    } catch (error) {
        // localStorageが使えない環境では黙って無視する
    }
}

/**
 * Unix秒のタイムスタンプを、設定された切り替え時刻ぶんだけ巻き戻す。
 * 例: 4時切り替えの場合、午前3:59のタイムスタンプは前日の23:59相当として扱われる。
 */
export function shiftUnixSeconds(unixSec) {
    return unixSec - getDayBoundaryHour() * 3600;
}

// 選択状態を維持したままoption（現在の言語の時刻表記）を生成する
function renderOptions(select) {
    const selected = select.value !== '' ? select.value : String(getDayBoundaryHour());
    select.innerHTML = '';
    for (let hour = 0; hour <= 12; hour++) {
        const option = document.createElement('option');
        option.value = String(hour);
        option.textContent = t('day_boundary.hour_option', { h: hour });
        select.appendChild(option);
    }
    select.value = selected;
}

// 日付切り替え時刻セレクタを初期化する（select要素の生成・保存値の復元・変更時の保存）
export function initDayBoundarySelector() {
    const select = document.getElementById('day-boundary-select');
    if (!select) return;

    renderOptions(select);

    select.addEventListener('change', () => {
        const hour = parseInt(select.value, 10);
        setDayBoundaryHour(Number.isInteger(hour) ? hour : 0);
    });

    // 言語切り替え時にoptionの表記を現在の言語で再生成する
    document.addEventListener('translations-applied', () => {
        renderOptions(select);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initDayBoundarySelector();
});
