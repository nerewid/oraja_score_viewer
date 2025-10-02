// ページネーション機能
export function initializePagination() {
    let currentPage = 1;
    let itemsPerPage = 100;
    const allItems = document.querySelectorAll('[data-page-item]');
    const totalItems = allItems.length;

    console.log('Pagination initialized:', totalItems, 'items');

    function updatePagination() {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;

        console.log(`Showing items ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems}`);

        // アイテムの表示/非表示
        allItems.forEach((item, index) => {
            if (index >= startIndex && index < endIndex) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });

        // ページ情報更新
        const pageInfo = `${startIndex + 1}-${Math.min(endIndex, totalItems)} / ${totalItems}日`;
        const pageInfoElement = document.getElementById('results-page-info');
        if (pageInfoElement) {
            pageInfoElement.textContent = pageInfo;
        }

        // ページ番号ボタン生成
        updatePageNumbers(totalPages);

        // ボタンの有効/無効
        const disableFirst = currentPage === 1;
        const disableLast = currentPage === totalPages || totalPages === 0;

        const firstBtn = document.getElementById('results-first-page');
        const prevBtn = document.getElementById('results-prev-page');
        const nextBtn = document.getElementById('results-next-page');
        const lastBtn = document.getElementById('results-last-page');

        if (firstBtn) firstBtn.disabled = disableFirst;
        if (prevBtn) prevBtn.disabled = disableFirst;
        if (nextBtn) nextBtn.disabled = disableLast;
        if (lastBtn) lastBtn.disabled = disableLast;

        // スクロールを上部に
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updatePageNumbers(totalPages) {
        const maxButtons = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);

        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        const container = document.getElementById('results-page-numbers');
        if (!container) return;

        container.innerHTML = '';
        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.className = i === currentPage ? 'active' : '';
            btn.addEventListener('click', () => {
                currentPage = i;
                updatePagination();
            });
            container.appendChild(btn);
        }
    }

    // イベントリスナー
    const firstBtn = document.getElementById('results-first-page');
    const prevBtn = document.getElementById('results-prev-page');
    const nextBtn = document.getElementById('results-next-page');
    const lastBtn = document.getElementById('results-last-page');
    const itemsSelect = document.getElementById('results-items-per-page');

    if (firstBtn) {
        firstBtn.addEventListener('click', () => {
            currentPage = 1;
            updatePagination();
        });
    }
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                updatePagination();
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(totalItems / itemsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                updatePagination();
            }
        });
    }
    if (lastBtn) {
        lastBtn.addEventListener('click', () => {
            currentPage = Math.ceil(totalItems / itemsPerPage);
            updatePagination();
        });
    }
    if (itemsSelect) {
        itemsSelect.addEventListener('change', (e) => {
            itemsPerPage = parseInt(e.target.value);
            currentPage = 1;
            updatePagination();
        });
    }

    // 初期化
    if (totalItems > 0) {
        updatePagination();
    }
}
