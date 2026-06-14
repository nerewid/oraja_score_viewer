// --- デバッグログ一元管理ユーティリティ ---
//
// verbose なデバッグログ(進捗ログ・処理時間計測)を一箇所で制御する軽量ロガー。
// 既定では抑制し、本番(GitHub Pages)のコンソールをクリーンに保つ。
//
// 有効化方法(いずれか):
//   - URL に ?debug=1 (または ?debug=true) を付与してアクセス
//   - コンソールで localStorage.setItem('oraja_debug', '1') を実行してリロード
//   - ?debug=0 を付与すると localStorage 設定を上書きして無効化
//
// なお console.warn / console.error は「意図的な警告・エラー」として
// 各モジュールで直接呼び出しており、本ロガーの制御対象外(常に出力)。

function resolveDebugEnabled() {
    try {
        const queryValue = new URLSearchParams(window.location.search).get('debug');
        if (queryValue === '1' || queryValue === 'true') return true;
        if (queryValue === '0' || queryValue === 'false') return false;
    } catch (e) {
        // location 取得に失敗した場合は localStorage 判定にフォールバック
    }
    try {
        return window.localStorage.getItem('oraja_debug') === '1';
    } catch (e) {
        return false;
    }
}

const DEBUG_ENABLED = resolveDebugEnabled();

export const logger = {
    // 進捗ログ。DEBUG 有効時のみ出力。
    debug(...args) {
        if (DEBUG_ENABLED) console.log(...args);
    },

    // 処理時間計測の開始。DEBUG 有効時のみ。
    time(label) {
        if (DEBUG_ENABLED) console.time(label);
    },

    // 処理時間計測の終了。DEBUG 有効時のみ。
    timeEnd(label) {
        if (DEBUG_ENABLED) console.timeEnd(label);
    },
};
