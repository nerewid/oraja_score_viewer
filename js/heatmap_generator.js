// heatmap_generator.js (メイン処理)
import { scoreDbData, scorelogDbData } from './db_uploader.js';
import { t } from './i18n.js';

async function generateHeatmapData(scoreDbData, scorelogDbData) {
    try {
        const SQL = await initSqlJs({ locateFile: filename => `/js/${filename}` });
        const scoreDb = new SQL.Database(new Uint8Array(scoreDbData));
        const scorelogDb = new SQL.Database(new Uint8Array(scorelogDbData));

        const notesData = await generateNotesData(scoreDb);
        const progressData = await generateProgressData(scorelogDb);

        scoreDb.close();
        scorelogDb.close();

        return { notes: notesData, progress: progressData };
    } catch (error) {
        console.error("データベース処理エラー:", error);
        throw error; // エラーを上位に伝播
    }
}

async function generateNotesData(db) {
    try {
        const query = `
            SELECT date, epg + lpg + egr + lgr + egd + lgd AS total_score
            FROM player
            ORDER BY date ASC
        `;
        const stmt = db.prepare(query);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();

        const data = results.map((row, index, array) => {
            let date = row.date;
            if (typeof date === 'number') {
                date = new Date(date * 1000);
            }
            const formattedDate = date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, "-");
            const value = index > 0 ? row.total_score - array[index - 1].total_score : 0;
            return { date: formattedDate, value };
        });
        return data;
    } catch (error) {
        console.error("notesデータ生成エラー:", error);
        throw error;
    }
}

async function generateProgressData(db) {
    try {
        const query = `
            SELECT strftime('%Y-%m-%d', date, 'unixepoch') AS date, COUNT(*) AS value
            FROM scorelog
            GROUP BY strftime('%Y-%m-%d', date, 'unixepoch')
            ORDER BY date
        `;
        const stmt = db.prepare(query);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    } catch (error) {
        console.error("progressデータ生成エラー:", error);
        throw error;
    }
}

// Cal-Heatmap表示関数
function displayCalHeatmap(data, elementId, title, limit, color, unit) {
    try {
        const cal = new CalHeatmap();
        let startDate = new Date(); // 現在の日時を取得
        startDate.setFullYear(startDate.getFullYear() - 1);

        // データをMapに変換してツールチップで使用
        const dataMap = new Map();
        data.forEach(d => {
            dataMap.set(d.date, d.value);
        });

        // プラグイン配列を事前に構築
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
            range: 13,
            domain:{
                type: 'month',
                gutter: 4,
                padding: [0, 0, 0, 0],
                dynamicDimension: false,
                sort: 'asc',
                label: {text: 'YYYY/MM'}
            },
            subDomain: { type: 'day', label: null },
            date: {
                start: startDate,
                end: new Date(),
                highlight: [
                    new Date(), // Highlight today
                ]
            },
            data: {
                source: data,
                x: "date",
                y: (datum) => +datum['value']
            },
            scale: {
                color: {
                    scheme: color,
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

        displayCalHeatmap(heatmapData.notes, "cal-heatmap-notes", t('heatmap.notes'), 150000, "Greens", "Notes");
        displayCalHeatmap(heatmapData.progress, "cal-heatmap-progress", t('heatmap.progress'), 20, "Purples", t('heatmap.updates'));

    } catch (error) {
        alert(t('alert.process_error'));
    }
});

export { generateHeatmapData, generateNotesData, generateProgressData, displayCalHeatmap };