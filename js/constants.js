// --- 共有定数定義 ---

// クリアランプの定義（全モジュール共通）
export const CLEAR_STATUS = {
    "10": { "name": "Max", "color": "rgba(255, 215, 0, 0.5)" },
    "9": { "name": "Perfect", "color": "rgba(173, 255, 47, 0.5)" },
    "8": { "name": "FullCombo", "color": "rgba(0, 255, 255, 0.5)" },
    "7": { "name": "ExHard", "color": "rgba(255, 165, 0, 0.5)" },
    "6": { "name": "Hard", "color": "rgba(192, 0, 0, 0.5)" },
    "5": { "name": "Normal", "color": "rgba(135, 206, 235, 0.5)" },
    "4": { "name": "Easy", "color": "rgba(0, 128, 0, 0.5)" },
    "3": { "name": "LightAssistEasy", "color": "rgba(255, 192, 203, 0.5)" },
    "2": { "name": "AssistEasy", "color": "rgba(128, 0, 128, 0.5)" },
    "1": { "name": "Failed", "color": "rgba(128, 0, 0, 0.5)" },
    "0": { "name": "NoPlay", "color": "rgba(32, 32, 32, 0.5)" },
    "-1": { "name": "No Chart", "color": "rgba(0, 0, 0, 0.5)" }
};

// クリアステータスの描画順
export const CLEAR_STATUS_ORDER = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "0", "-1"];

// BP未プレイを示す値（SQLiteの最大int値）
export const BP_NOT_PLAYED = 2147483647;

// SQLiteのIN句パラメータ制限数
export const BATCH_SIZE = 999;
