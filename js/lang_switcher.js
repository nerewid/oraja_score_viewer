import { setLang, getLang, applyTranslations } from './i18n.js';

document.addEventListener('DOMContentLoaded', () => {
    const langJa = document.getElementById('lang-ja');
    const langEn = document.getElementById('lang-en');

    // ボタンが存在しない場合は何もしない
    if (!langJa || !langEn) return;

    // 現在の言語に応じてボタンのactive状態を設定
    function updateButtonState() {
        const currentLang = getLang();
        langJa.classList.toggle('active', currentLang === 'ja');
        langEn.classList.toggle('active', currentLang === 'en');
    }

    // 初期状態を適用
    updateButtonState();
    applyTranslations();

    // クリックイベント
    langJa.addEventListener('click', () => {
        setLang('ja');
        updateButtonState();
        applyTranslations();
    });

    langEn.addEventListener('click', () => {
        setLang('en');
        updateButtonState();
        applyTranslations();
    });
});
