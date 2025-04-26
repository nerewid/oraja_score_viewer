import {generateNotesData} from './heatmap_generator.js'; // ヒートマップ用のノーツ数データを生成する関数をインポート
import {scoreDbData} from './db_uploader.js'; // スコアデータベースのデータをインポート

/**
 * JSON形式のデータとテンプレートファイルを受け取り、HTMLを生成する非同期関数
 * @param {object} jsonOutput - HTMLに表示するJSON形式のデータ
 * @param {string} templateFile - HTMLのテンプレートファイルのパス
 * @returns {Promise<string>} 生成されたHTML文字列
 */
export async function generateHtmlFromJson(jsonOutput, templateFile) {
    // クリアステータスとそれに対応する名前と色を定義したオブジェクト
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
        // テンプレートファイル取得
        const templateResponse = await fetch(templateFile);
        if (!templateResponse.ok) {
            throw new Error(`HTTP error! status: ${templateResponse.status} for ${templateFile}`);
        }
        const templateText = await templateResponse.text();

        try {
            // Nunjucksテンプレートをコンパイル
            const template = nunjucks.compile(templateText);

            // JSONデータのキー（日付）を降順にソート
            const sortedDates = Object.keys(jsonOutput).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
            // ソートされた日付に基づいて、表示するデータを整形
            const sortedJsonOutputWithKeys = sortedDates.map(date => ({
                date: date, // 日付
                titles: Object.keys(jsonOutput[date]) // その日のタイトルを取得
                    .map(title => ({ title: title, data: jsonOutput[date][title] })) // タイトルとデータを含むオブジェクトに変換
                    .sort((a, b) => parseInt(b.data.clear) - parseInt(a.data.clear)) // クリアステータスで降順にソート
            }));
            // SQL.jsを初期化
            const SQL = await initSqlJs({ locateFile: filename => `/js/${filename}` });
            // スコアデータベースをUint8Arrayから初期化
            const scoreDb = new SQL.Database(new Uint8Array(scoreDbData));
            // スコアデータベースからノーツ数データを生成
            const noteData = await generateNotesData(scoreDb);
            // ノーツ数データを日付の形式を揃えて整形
            const formattedNoteData = noteData.map(item => {
                return {
                    date: item.date.replace(/-/g, "/"), // 日付のハイフンをスラッシュに置換
                    value: item.value
                };
            });
            // 整形されたノーツ数データを日付をキーとするオブジェクトに変換
            const notesMap = formattedNoteData.reduce((accumulator, currentItem) => {
                accumulator[currentItem.date] = currentItem.value;
                return accumulator;
            }, {});

            // テンプレートにデータを渡してHTMLをレンダリング
            const html = template.render({ clear_info: sortedJsonOutputWithKeys, clear_status: clear_status, notes: notesMap });
            return html; // 生成されたHTMLを返す
        } catch (nunjucksError) {
            // Nunjucksテンプレートのエラーをコンソールに出力し、エラーメッセージを含むHTMLを返す
            console.error("Nunjucks template error:", nunjucksError);
            return `<div style="color: red;">Nunjucks template error: ${nunjucksError.message}</div>`;
        }
    } catch (fetchError) {
        // テンプレートファイルの取得エラーをコンソールに出力し、エラーメッセージを含むHTMLを返す
        console.error("Template file fetch error:", fetchError);
        return `<div style="color: red;">Template file fetch error: ${fetchError.message}</div>`;
    }
}