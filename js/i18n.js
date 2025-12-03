const translations = {
    ja: {
        // index.html
        'app.description': 'beatorajaのプレイ履歴を日別に分かりやすく表示します。',
        'app.table_update_date': '難易度表情報更新日：',
        'upload.howto': '利用方法',
        'upload.instruction': 'beatorajaフォルダの中にあるdbファイルを選択してください。',
        'upload.score_location': 'score.db, scorelog.dbは <span style="font-weight: bold;">beatoraja0.x.x/player/(playerName)</span> フォルダに',
        'upload.songdata_location': 'songdata.dbは <span style="font-weight: bold;">beatoraja0.x.x/</span> フォルダにあります。',
        'button.load_score': 'score.db を読み込む',
        'button.load_scorelog': 'scorelog.db を読み込む',
        'button.load_songdata': 'songdata.db を読み込む',
        'button.process': 'データ処理開始',
        'loading.processing': '処理中...',
        'loading.db_loading': 'データベースを読み込んでいます',
        'loading.db_init': 'データベースを初期化中...',
        'loading.table_loading': '難易度表を読み込み中...',
        'loading.song_prep': '楽曲データを準備中...',
        'loading.hash_mapping': 'ハッシュマッピングを作成中...',
        'loading.score_search': 'スコアを検索中...',
        'loading.json_create': 'JSONデータを作成中...',
        'loading.html_gen': 'HTMLを生成中...',
        'loading.display': '画面を表示中...',
        'loading.complete': '完了しました！',
        'error.title': 'エラーが発生しました',
        'error.details': '詳細情報を表示',
        'button.close': '閉じる',
        'link.details': '本ツールの詳細、対応している難易度表については',
        'link.here': 'こちら。',
        'link.table_viewer': '難易度表を閲覧する',
        'message.load_success': '読み込みに成功しました。',
        'message.load_failed': '読み込みに失敗しました: ',
        'alert.missing_db': 'scorelog.dbまたはsongdata.dbファイルが不足しています。',
        'alert.process_error': 'データ処理中にエラーが発生しました。ファイルが正しいか確認してください。',
        // lamp_graph_generator.js
        'lamp.select_table': '難易度表を選択してください',
        'lamp.loading': '読み込み中...',
        'lamp.no_data': '表示するデータがありません。',
        'lamp.no_songs': '該当する楽曲が見つかりません。',
        'lamp.load_score_first': 'score.db を先に読み込んでください。',
        'lamp.song_list_error': '曲リストの表示に失敗しました。',
        'lamp.table_load_error': '難易度表読込エラー',
        // heatmap_generator.js
        'heatmap.notes': '打鍵数ヒートマップ ',
        'heatmap.progress': '更新数ヒートマップ ',
        'heatmap.updates': '回更新',
        'heatmap.missing_db': 'score.dbまたはscorelog.dbファイルが不足しています。先にアップロードしてください。',
        // table_viewer.html
        'table_viewer.title': '各BMS難易度表を閲覧する',
        'table_viewer.back': 'メインページに戻る',
        'table_viewer.select_label': '難易度表を選択:',
        'table_viewer.select_placeholder': '-- 難易度表を選択してください --',
        'table_viewer.loading': '難易度表を読み込み中...',
        'table_viewer.stats': '総曲数: {count}曲 / レベル数: {levels}',
        // template.njk
        'template.history': '更新履歴',
        'template.download_json': 'JSONダウンロード',
        'template.bp_only': 'BP更新のみ',
        'template.new_clear': '新規',
        'template.days_per_page': '日/ページ',
    },
    en: {
        // index.html
        'app.description': 'View your beatoraja play history organized by date.',
        'app.table_update_date': 'Difficulty table updated: ',
        'upload.howto': 'How to Use',
        'upload.instruction': 'Select the db files from your beatoraja folder.',
        'upload.score_location': 'score.db and scorelog.db are in <span style="font-weight: bold;">beatoraja0.x.x/player/(playerName)</span> folder',
        'upload.songdata_location': 'songdata.db is in <span style="font-weight: bold;">beatoraja0.x.x/</span> folder.',
        'button.load_score': 'Load score.db',
        'button.load_scorelog': 'Load scorelog.db',
        'button.load_songdata': 'Load songdata.db',
        'button.process': 'Start Processing',
        'loading.processing': 'Processing...',
        'loading.db_loading': 'Loading database',
        'loading.db_init': 'Initializing database...',
        'loading.table_loading': 'Loading difficulty tables...',
        'loading.song_prep': 'Preparing song data...',
        'loading.hash_mapping': 'Creating hash mapping...',
        'loading.score_search': 'Searching scores...',
        'loading.json_create': 'Creating JSON data...',
        'loading.html_gen': 'Generating HTML...',
        'loading.display': 'Displaying results...',
        'loading.complete': 'Complete!',
        'error.title': 'An error occurred',
        'error.details': 'Show details',
        'button.close': 'Close',
        'link.details': 'For details and supported difficulty tables, see ',
        'link.here': 'here.',
        'link.table_viewer': 'Browse difficulty tables',
        'message.load_success': 'Loaded successfully.',
        'message.load_failed': 'Failed to load: ',
        'alert.missing_db': 'scorelog.db or songdata.db file is missing.',
        'alert.process_error': 'An error occurred during processing. Please check if the files are correct.',
        // lamp_graph_generator.js
        'lamp.select_table': 'Select a difficulty table',
        'lamp.loading': 'Loading...',
        'lamp.no_data': 'No data to display.',
        'lamp.no_songs': 'No matching songs found.',
        'lamp.load_score_first': 'Please load score.db first.',
        'lamp.song_list_error': 'Failed to display song list.',
        'lamp.table_load_error': 'Table load error',
        // heatmap_generator.js
        'heatmap.notes': 'Notes Heatmap ',
        'heatmap.progress': 'Progress Heatmap ',
        'heatmap.updates': ' updates',
        'heatmap.missing_db': 'score.db or scorelog.db is missing. Please upload first.',
        // table_viewer.html
        'table_viewer.title': 'Browse BMS Difficulty Tables',
        'table_viewer.back': 'Back to main page',
        'table_viewer.select_label': 'Select table:',
        'table_viewer.select_placeholder': '-- Select a difficulty table --',
        'table_viewer.loading': 'Loading difficulty table...',
        'table_viewer.stats': 'Total songs: {count} / Levels: {levels}',
        // template.njk
        'template.history': 'Update History',
        'template.download_json': 'Download JSON',
        'template.bp_only': 'BP Updates Only',
        'template.new_clear': 'New ',
        'template.days_per_page': ' days/page',
    }
};

let currentLang = localStorage.getItem('lang') || 'ja';

// 翻訳テキストを取得
export function t(key, params = {}) {
    let text = translations[currentLang][key] || translations['ja'][key] || key;
    // パラメータ置換 ({count}, {levels}など)
    Object.keys(params).forEach(param => {
        text = text.replace(`{${param}}`, params[param]);
    });
    return text;
}

// 言語を設定
export function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    // HTMLのlang属性も更新
    document.documentElement.lang = lang;
}

// 現在の言語を取得
export function getLang() {
    return currentLang;
}

// HTML要素に翻訳を適用
export function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        if (el.hasAttribute('data-i18n-html')) {
            el.innerHTML = translation;
        } else {
            el.textContent = translation;
        }
    });
}
