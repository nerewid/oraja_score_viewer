// heatmap_generator.js (メイン処理)
import { scoreDbData, scorelogDbData, sqlPromise } from './db_uploader.js';
import { t } from './i18n.js';
import { UNIX_TO_MS, HEATMAP_CONFIG } from './constants.js';
import { showError, hideLoading } from './score_change_to_json.js';

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
        const query = `
            SELECT strftime('%Y-%m-%d', date, 'unixepoch') AS date, COUNT(*) AS value
            FROM scorelog
            GROUP BY strftime('%Y-%m-%d', date, 'unixepoch')
            ORDER BY date
        `;
        const stmt = db.prepare(query);
        return collectRows(stmt);
    } catch (error) {
        console.error("progressデータ生成エラー:", error);
        throw error;
    }
}

// Cal-Heatmap表示関数
function displayCalHeatmap(data, elementId, title, limit, colorScheme, unit) {
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
                        return `${dayjsDate.format('YYYY/MM/DD')}: ${displayValue} ${unit}`;
                    },
                },
            ],
        ];

        cal.paint({
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
        const element = document.getElementById(`${elementId}-pre`);
        element.innerHTML = `<h1>${title}</h1>`;
    } catch (error) {
        console.error("ヒートマップ生成エラー:", error);
        throw error;
    }
}


// イベントリスナー
document.getElementById("processData").addEventListener("click", async () => {
    if (!scoreDbData || !scorelogDbData) {
        alert(t('heatmap.missing_db'));
        return;
    }

    try {
        const heatmapData = await generateHeatmapData(scoreDbData, scorelogDbData);

        displayCalHeatmap(heatmapData.notes, "cal-heatmap-notes", t('heatmap.notes'), HEATMAP_CONFIG.NOTES_LIMIT, HEATMAP_CONFIG.NOTES_COLOR_SCHEME, "Notes");
        displayCalHeatmap(heatmapData.progress, "cal-heatmap-progress", t('heatmap.progress'), HEATMAP_CONFIG.PROGRESS_LIMIT, HEATMAP_CONFIG.PROGRESS_COLOR_SCHEME, t('heatmap.updates'));

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

export { generateHeatmapData, generateNotesData, generateProgressData, displayCalHeatmap };