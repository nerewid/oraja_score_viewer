// heatmap_generator.js (メイン処理)
import { scoreDbData, scorelogDbData, sqlPromise } from './db_uploader.js';
import { t } from './i18n.js';
import { UNIX_TO_MS, HEATMAP_CONFIG } from './constants.js';
import { showError, hideLoading } from './score_change_to_json.js';
import { getDayBoundaryHour } from './utils/day_boundary.js';

/**
 * SQLステートメントから全行をオブジェクト配列として取得する
 */
function collectRows(stmt) {
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

async function generateHeatmapData(scoreDbData, scorelogDbData) {
    try {
        // db_uploader.jsで初期化済みのPromiseを再利用（locateFile重複指定を排除）
        const SQL = await sqlPromise;
        const scoreDb = new SQL.Database(new Uint8Array(scoreDbData));
        const scorelogDb = new SQL.Database(new Uint8Array(scorelogDbData));

        try {
            const notesData = generateNotesData(scoreDb);
            const progressData = generateProgressData(scorelogDb);
            return { notes: notesData, progress: progressData };
        } finally {
            // エラー発生時もメモリリークを防ぐため確実にクローズ
            scoreDb.close();
            scorelogDb.close();
        }
    } catch (error) {
        console.error("データベース処理エラー:", error);
        throw error;
    }
}

function generateNotesData(db) {
    try {
        const query = `
            SELECT date, epg + lpg + egr + lgr + egd + lgd AS total_score
            FROM player
            ORDER BY date ASC
        `;
        const stmt = db.prepare(query);
        const results = collectRows(stmt);

        return results.map((row, index, array) => {
            let date = row.date;
            if (typeof date === 'number') {
                // player テーブルの date は日次スナップショット（常に0:00）のため、日付切り替え時刻のシフトは適用しない
                date = new Date(date * UNIX_TO_MS);
            }
            const formattedDate = date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, "-");
            const value = index > 0 ? row.total_score - array[index - 1].total_score : 0;
            return { date: formattedDate, value };
        });
    } catch (error) {
        console.error("notesデータ生成エラー:", error);
        throw error;
    }
}

function generateProgressData(db) {
    try {
        const offsetSeconds = getDayBoundaryHour() * 3600;
        const query = `
            SELECT strftime('%Y-%m-%d', date - ?, 'unixepoch') AS date, COUNT(*) AS value
            FROM scorelog
            GROUP BY strftime('%Y-%m-%d', date - ?, 'unixepoch')
            ORDER BY date
        `;
        const stmt = db.prepare(query);
        stmt.bind([offsetSeconds, offsetSeconds]);
        return collectRows(stmt);
    } catch (error) {
        console.error("progressデータ生成エラー:", error);
        throw error;
    }
}

// 描画済みヒートマップの設定。言語切り替え時の再描画に使う
const heatmapSections = new Map();

// 月別グラフの開閉状態を記憶するlocalStorageキーの接頭辞
const MONTHLY_STORAGE_PREFIX = 'heatmapMonthly:';

// 月別グラフを開いた状態で表示するか（未保存時は非表示）
function isMonthlyVisible(sectionKey) {
    try {
        return localStorage.getItem(MONTHLY_STORAGE_PREFIX + sectionKey) === '1';
    } catch (error) {
        // localStorageが使えない環境では既定の非表示にフォールバックする
        return false;
    }
}

// 月別グラフの開閉状態を保存する
function setMonthlyVisible(sectionKey, visible) {
    try {
        localStorage.setItem(MONTHLY_STORAGE_PREFIX + sectionKey, visible ? '1' : '0');
    } catch (error) {
        // localStorageが使えない環境では黙って無視する
    }
}

// ヒートマップが表示している月を古い順に並べたキー配列（'YYYY-MM'）を作る
function buildMonthKeys() {
    const today = new Date();
    const keys = [];
    for (let back = HEATMAP_CONFIG.RANGE_MONTHS - 1; back >= 0; back--) {
        const month = new Date(today.getFullYear(), today.getMonth() - back, 1);
        keys.push(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`);
    }
    return keys;
}

// 日別データ（date: 'YYYY-MM-DD'）を月別の合計とプレー日数に畳み込む
function aggregateMonthly(dailyData) {
    const monthly = new Map();
    dailyData.forEach((row) => {
        const monthKey = String(row.date).slice(0, 7);
        const value = Number(row.value) || 0;
        const current = monthly.get(monthKey) || { total: 0, days: 0 };
        current.total += value;
        if (value > 0) {
            current.days += 1;
        }
        monthly.set(monthKey, current);
    });
    return monthly;
}

// 月別グラフの列をヒートマップの月カラムに揃えるため、描画済みSVGから実寸を読む
function readColumnLayout(elementId) {
    const domains = document.querySelectorAll(`#${elementId} .ch-domain`);
    if (domains.length === 0) {
        return null;
    }
    const width = parseFloat(domains[0].getAttribute('width'));
    return Number.isFinite(width) ? { count: domains.length, width } : null;
}

// 見出し行（ラベル・合計・トグル）と月別グラフを描画する
function renderSummary(config) {
    const { sectionKey, elementId, labelKey, unitKey, data, showPlayDays } = config;
    const header = document.getElementById(`${elementId}-pre`);
    const panel = document.getElementById(`${elementId}-monthly`);
    if (!header || !panel) {
        return;
    }

    const monthly = aggregateMonthly(data);
    const rows = buildMonthKeys().map((monthKey) => monthly.get(monthKey) || { total: 0, days: 0 });
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const playDays = rows.reduce((sum, row) => sum + row.days, 0);
    const visible = isMonthlyVisible(sectionKey);

    const subParts = [t('heatmap.range', { months: HEATMAP_CONFIG.RANGE_MONTHS })];
    if (showPlayDays) {
        subParts.push(t('heatmap.play_days', { days: playDays }));
    }

    header.className = 'heatmap-head';
    header.innerHTML = `
        <span class="heatmap-head-label">${t(labelKey)}</span>
        <span class="heatmap-head-total">${total.toLocaleString('en-US')}<span class="heatmap-head-unit">${t(unitKey)}</span></span>
        <span class="heatmap-head-sub">${subParts.join(' · ')}</span>
        <button type="button" class="heatmap-monthly-toggle" aria-expanded="${visible}" aria-controls="${elementId}-monthly">${t(visible ? 'heatmap.hide_monthly' : 'heatmap.show_monthly')}</button>
    `;

    const layout = readColumnLayout(elementId);
    const columns = layout ? `repeat(${layout.count}, ${layout.width}px)` : `repeat(${rows.length}, 1fr)`;
    const gridStyle = `grid-template-columns:${columns};gap:0 ${HEATMAP_CONFIG.DOMAIN_GUTTER}px`;
    const maxTotal = Math.max(...rows.map((row) => row.total), 0);
    const bars = rows.map((row) => {
        const height = maxTotal > 0 ? Math.round((row.total / maxTotal) * 72) : 0;
        return `<div class="heatmap-bar"><b>${row.total.toLocaleString('en-US')}</b><i style="height:${height}%"></i></div>`;
    }).join('');
    const days = showPlayDays
        ? `<div class="heatmap-days" style="${gridStyle}">${rows.map((row) => `<span>${row.days > 0 ? row.days + t('heatmap.day_suffix') : ''}</span>`).join('')}</div>`
        : '';

    panel.className = `heatmap-monthly heatmap-monthly-${sectionKey}`;
    panel.innerHTML = `<div class="heatmap-chart"><div class="heatmap-bars" style="${gridStyle}">${bars}</div></div>${days}`;
    panel.hidden = !visible;

    header.querySelector('.heatmap-monthly-toggle').addEventListener('click', () => {
        const nextVisible = panel.hidden;
        panel.hidden = !nextVisible;
        const toggle = header.querySelector('.heatmap-monthly-toggle');
        toggle.setAttribute('aria-expanded', String(nextVisible));
        toggle.textContent = t(nextVisible ? 'heatmap.hide_monthly' : 'heatmap.show_monthly');
        setMonthlyVisible(sectionKey, nextVisible);
    });
}

// Cal-Heatmap表示関数
async function displayCalHeatmap(config) {
    const { data, elementId, limit, colorScheme, tooltipUnit } = config;
    try {
        const cal = new CalHeatmap();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);

        const plugins = [
            [
                window.Tooltip,
                {
                    enabled: true,
                    text: function (timestamp, value, dayjsDate) {
                        const displayValue = value !== null ? value.toLocaleString() : 0;
                        return `${dayjsDate.format('YYYY/MM/DD')}: ${displayValue} ${tooltipUnit}`;
                    },
                },
            ],
        ];

        await cal.paint({
            itemSelector: `#${elementId}`,
            range: HEATMAP_CONFIG.RANGE_MONTHS,
            domain:{
                type: 'month',
                gutter: HEATMAP_CONFIG.DOMAIN_GUTTER,
                padding: [0, 0, 0, 0],
                dynamicDimension: false,
                sort: 'asc',
                label: {text: 'YYYY/MM'}
            },
            subDomain: { type: 'day', label: null },
            date: {
                start: startDate,
                end: new Date(),
                highlight: [new Date()]
            },
            data: {
                source: data,
                x: "date",
                y: (datum) => +datum['value']
            },
            scale: {
                color: {
                    scheme: colorScheme,
                    type: 'linear',
                    domain: [0, limit],
                },
            }
        }, plugins);

        heatmapSections.set(config.sectionKey, config);
        renderSummary(config);
    } catch (error) {
        console.error("ヒートマップ生成エラー:", error);
        throw error;
    }
}

// 言語切り替え後に見出しと月別グラフを描き直す
document.addEventListener('translations-applied', () => {
    heatmapSections.forEach((config) => renderSummary(config));
});


// イベントリスナー
document.getElementById("processData").addEventListener("click", async () => {
    if (!scoreDbData || !scorelogDbData) {
        alert(t('heatmap.missing_db'));
        return;
    }

    try {
        const heatmapData = await generateHeatmapData(scoreDbData, scorelogDbData);

        await displayCalHeatmap({
            sectionKey: 'notes',
            elementId: 'cal-heatmap-notes',
            data: heatmapData.notes,
            labelKey: 'heatmap.notes',
            unitKey: 'heatmap.unit_notes',
            limit: HEATMAP_CONFIG.NOTES_LIMIT,
            colorScheme: HEATMAP_CONFIG.NOTES_COLOR_SCHEME,
            tooltipUnit: 'Notes',
            showPlayDays: true
        });
        await displayCalHeatmap({
            sectionKey: 'progress',
            elementId: 'cal-heatmap-progress',
            data: heatmapData.progress,
            labelKey: 'heatmap.progress',
            unitKey: 'heatmap.unit_updates',
            limit: HEATMAP_CONFIG.PROGRESS_LIMIT,
            colorScheme: HEATMAP_CONFIG.PROGRESS_COLOR_SCHEME,
            tooltipUnit: t('heatmap.updates'),
            showPlayDays: false
        });

    } catch (error) {
        console.error("ヒートマップ処理エラー:", error);
        hideLoading();
        document.getElementById("upload-area").classList.remove("hidden");
        showError(
            error.message || t('alert.process_error'),
            error.stack
        );
    }
});

export { generateHeatmapData, generateNotesData };