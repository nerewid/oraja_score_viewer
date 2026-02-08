import {generateNotesData} from './heatmap_generator.js'; // ヒートマップ用のノーツ数データを生成する関数をインポート
import {scoreDbData} from './db_uploader.js'; // スコアデータベースのデータをインポート
import { t } from './i18n.js'; // i18n翻訳関数をインポート
import { CLEAR_STATUS } from './constants.js'; // 共有定数をインポート

/**
 * JSON形式のデータとテンプレートファイルを受け取り、HTMLを生成する非同期関数
 * @param {object} jsonOutput - HTMLに表示するJSON形式のデータ
 * @param {string} templateFile - HTMLのテンプレートファイルのパス
 * @returns {Promise<string>} 生成されたHTML文字列
 */
export async function generateHtmlFromJson(jsonOutput, templateFile) {
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
            const i18n = {
                history: t('template.history'),
                downloadJson: t('template.download_json'),
                bpOnly: t('template.bp_only'),
                newClear: t('template.new_clear'),
                daysPerPage: t('template.days_per_page'),
            };
            const html = template.render({ clear_info: sortedJsonOutputWithKeys, clear_status: CLEAR_STATUS, notes: notesMap, i18n: i18n });
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