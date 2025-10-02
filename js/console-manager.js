// console出力を制御するマネージャー
// 開発者ツールを開いている時のパフォーマンス低下を軽減

// デバッグモードの設定（URLパラメータで制御可能）
const urlParams = new URLSearchParams(window.location.search);
const DEBUG_MODE = urlParams.has('debug');

// オリジナルのconsoleメソッドを保存
const originalConsole = {
    log: console.log,
    warn: console.warn,
    info: console.info,
    time: console.time,
    timeEnd: console.timeEnd,
    error: console.error
};

// デバッグモードでない場合、console出力を無効化
if (!DEBUG_MODE) {
    // 完全に無効化するのではなく、バッファリングして頻度を下げる
    let consoleBuffer = [];
    let consoleTimeout = null;

    const flushConsole = () => {
        if (consoleBuffer.length > 0) {
            // まとめて出力（開発者ツールへの負荷を軽減）
            originalConsole.log(`[Buffered ${consoleBuffer.length} messages]`);
            consoleBuffer = [];
        }
    };

    // console.logをバッファリング
    console.log = function(...args) {
        consoleBuffer.push(['log', args]);
        clearTimeout(consoleTimeout);
        consoleTimeout = setTimeout(flushConsole, 1000); // 1秒ごとにまとめて出力
    };

    // console.time/timeEnd は無効化（パフォーマンス測定は開発者ツールで行う）
    console.time = function() {};
    console.timeEnd = function() {};

    // warn/infoは重要度が低いので無効化
    console.warn = function() {};
    console.info = function() {};

    // errorは重要なので残す
    console.error = originalConsole.error;
}

// グローバルに復元関数を提供（デバッグ時に使用）
window.restoreConsole = () => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
    console.time = originalConsole.time;
    console.timeEnd = originalConsole.timeEnd;
    console.error = originalConsole.error;
    console.log('Console restored. Use ?debug in URL to enable debug mode from start.');
};

// 使い方の説明
if (!DEBUG_MODE) {
    originalConsole.log('%c[Console Manager]%c Console output is buffered for performance.',
        'color: #4db5ff; font-weight: bold;',
        'color: inherit;');
    originalConsole.log('%c[Console Manager]%c Add ?debug to URL to enable full console output.',
        'color: #4db5ff; font-weight: bold;',
        'color: inherit;');
    originalConsole.log('%c[Console Manager]%c Or run window.restoreConsole() to restore console functions.',
        'color: #4db5ff; font-weight: bold;',
        'color: inherit;');
}
