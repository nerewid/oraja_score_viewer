import {generateNotesData} from './heatmap_generator.js'
import { scoreDbData} from './db_uploader.js';

export async function generateHtmlFromJson(jsonOutput, templateFile) { // heatmapJsonFile引数を削除
    const clear_status = {
        "10": { "name": "Max", "color": "rgba(255, 215, 0, 0.5)" },
        "9": { "name": "Perfect", "color": "rgba(0, 255, 255, 0.5)" },
        "8": { "name": "FullCombo", "color": "rgba(173, 255, 47, 0.5)" },
        "7": { "name": "ExHard", "color": "rgba(255, 165, 0, 0.5)" },
        "6": { "name": "Hard", "color": "rgba(192, 0, 0, 0.5)" },
        "5": { "name": "Normal", "color": "rgba(135, 206, 235, 0.5)" },
        "4": { "name": "Easy", "color": "rgba(0, 128, 0, 0.5)" },
        "3": { "name": "LightAssistEasy", "color": "rgba(255, 192, 203, 0.5)" },
        "2": { "name": "AssistEasy", "color": "rgba(128, 0, 128, 0.5)" },
        "1": { "name": "Failed", "color": "rgba(128, 0, 0, 0.5)" },
        "0": { "name": "NoPlay", "color": "rgba(0, 0, 0, 0.5)" }
    };

    try {
        const templateResponse = await fetch(templateFile);
        if (!templateResponse.ok) {
            throw new Error(`HTTP error! status: ${templateResponse.status} for ${templateFile}`);
        }
        const templateText = await templateResponse.text();

        try {
            const template = nunjucks.compile(templateText);

            const sortedDates = Object.keys(jsonOutput).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
            const sortedJsonOutputWithKeys = sortedDates.map(date => ({
                date: date,
                titles: Object.keys(jsonOutput[date])
                    .map(title => ({ title: title, data: jsonOutput[date][title] }))
                    .sort((a, b) => parseInt(b.data.clear) - parseInt(a.data.clear)) // ここでソート
            }));
            const SQL = await initSqlJs({ locateFile: filename => `/js/${filename}` });
            const scoreDb = new SQL.Database(new Uint8Array(scoreDbData));
            const noteData = await generateNotesData(scoreDb);
            const formattedNoteData = noteData.map(item => {
                return {
                    date: item.date.replace(/-/g, "/"), // "-" を "/" に置換
                    value: item.value
                };
            });
            const notesMap = formattedNoteData.reduce((accumulator, currentItem) => {
                accumulator[currentItem.date] = currentItem.value;
                return accumulator;
            }, {});
            console.log(notesMap); // 生成された辞書の内容を確認（デバッグ用）
            //console.log("clear_info (before template.render):", JSON.stringify(sortedJsonOutputWithKeys, null, 2)); // 追加

            console.dir(sortedJsonOutputWithKeys, { depth: null }); // 追加
            console.log(formattedNoteData, typeof formattedNoteData[0].date);
            const html = template.render({ clear_info: sortedJsonOutputWithKeys, clear_status: clear_status, notes: notesMap });
            return html;
        } catch (nunjucksError) {
            console.error("Nunjucks template error:", nunjucksError);
            return `<div style="color: red;">Nunjucks template error: ${nunjucksError.message}</div>`;
        }
    } catch (fetchError) {
        console.error("Template file fetch error:", fetchError);
        return `<div style="color: red;">Template file fetch error: ${fetchError.message}</div>`;
    }
}
