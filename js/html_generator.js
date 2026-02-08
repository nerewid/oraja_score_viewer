import {generateNotesData} from './heatmap_generator.js'; // ヒートマップ用のノーツ数データを生成する関数をインポート
import {scoreDbData} from './db_uploader.js'; // スコアデータベースのデータをインポート
import { t } from './i18n.js'; // i18n翻訳関数をインポート
import { CLEAR_STATUS } from './constants.js'; // 共有定数をインポート
import { splitIntoChunks, createPlaceholders } from './utils/sql-chunker.js'; // チャンク分割・プレースホルダ生成

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
            const sortedJsonOutputWithKeys = sortedDates.map(date => {
                // フィルタ前の全タイトル
                const allTitles = Object.keys(jsonOutput[date])
                    .map(title => ({ title: title, data: jsonOutput[date][title] }));
                // ランプ/BPセクション用（スコアのみ変更の曲を除外）
                const titles = allTitles
                    .filter(t => t.data.clear !== "-1" || t.data.old_bp !== t.data.new_bp)
                    .sort((a, b) => parseInt(b.data.clear) - parseInt(a.data.clear));
                return { date, titles, allTitles };
            });
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

            // スコア更新用にノーツ数を取得
            const allSha256s = [...new Set(
                sortedJsonOutputWithKeys.flatMap(d => d.allTitles.map(t => t.data.sha256)).filter(Boolean)
            )];
            const songNotesMap = querySongNotesMap(scoreDb, allSha256s);

            // 各日付にscore_updatesを追加
            for (const dateData of sortedJsonOutputWithKeys) {
                dateData.score_updates = dateData.allTitles
                    .filter(t => t.data.new_score > t.data.old_score)
                    .map(t => {
                        const notes = songNotesMap.get(t.data.sha256) || 0;
                        const scoreRate = notes > 0 ? (t.data.new_score / (notes * 2) * 100) : null;
                        return {
                            title: t.title,
                            old_score: t.data.old_score,
                            new_score: t.data.new_score,
                            score_rate: scoreRate !== null ? scoreRate.toFixed(2) : null
                        };
                    })
                    .sort((a, b) => (parseFloat(b.score_rate) || 0) - (parseFloat(a.score_rate) || 0));
                // allTitlesはテンプレートに不要なので削除
                delete dateData.allTitles;
            }

            // テンプレートにデータを渡してHTMLをレンダリング
            const i18n = {
                history: t('template.history'),
                downloadJson: t('template.download_json'),
                bpOnly: t('template.bp_only'),
                newClear: t('template.new_clear'),
                daysPerPage: t('template.days_per_page'),
                scoreUpdate: t('template.score_update'),
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

/**
 * SHA256リストからノーツ数を一括取得する
 * @param {object} db - score.dbのSQL.jsインスタンス
 * @param {Array<string>} sha256List - SHA256ハッシュの配列
 * @returns {Map<string, number>} SHA256をキー、ノーツ数を値とするMap
 */
function querySongNotesMap(db, sha256List) {
    const notesMap = new Map();
    for (const chunk of splitIntoChunks(sha256List)) {
        const placeholders = createPlaceholders(chunk.length);
        const stmt = db.prepare(`SELECT sha256, notes FROM score WHERE sha256 IN (${placeholders})`);
        stmt.bind(chunk);
        while (stmt.step()) {
            const row = stmt.getAsObject();
            notesMap.set(row.sha256, row.notes);
        }
        stmt.free();
    }
    return notesMap;
}