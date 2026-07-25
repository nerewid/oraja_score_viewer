# 行数削減リファクタリング

## Background
性能・動作に満足している前提で、コードの行数を減らすリファクタリング。Explore エージェント3体（JS / CSS・HTML / Python）の調査結果に基づく。動作変更は一切行わない。

## Scope
- 対象: js/（lib除く）、style.css、py/、.gitignore
- 非対象（却下項目）:
  - UI表示関数（showLoading/showError等）の3ファイル統合 — DOM要素・挙動差があり動作変更リスク高
  - fetch_tables.py の site_url 分岐のJSONスキーマ移行 — 行数削減にならない
  - cal-heatmap の `ch-*` / `#ch-tooltip` 系CSS — ライブラリが動的生成するため削除禁止

## Steps
- [x] A. JS共通化: `loadDifficultyTables` 重複統合（table_viewer.js / lamp_graph_data.js）、表JSON fetch 統合、レベルソートの `js/utils/level-sort.js` 切り出し（table_viewer.js / lamp_graph_renderer.js）
- [x] B. JS chunkクエリ統合: batch-query.js に「開いたdbを受け取るコア関数」を切り出し、score_data_processor.js の `executeMd5ChunkQuery`/`executeChunkQuery` から利用。同一ファイル内でしか使わない不要 export 除去（score_data_processor.js / heatmap_generator.js）
- [x] C. CSS未使用セレクタ削除: `.bp-only-section`、`.visible`、`.difficulty-table .level-cell`、複合セレクタ中の `.mono`
- [x] D. Python: merge_tables.py の md5/sha256 分岐をキー引数化で統合（出力の前後バイナリ比較必須）、エラー処理の重複ヘルパ化、fetch_tables.py の3連exceptまとめ、.gitignore に `__pycache__/` 追加
- [x] 品質ゲート: node --check / py_compile / merge出力diff / ブラウザ動作確認（Playwright + private_docs/ の実DB）
- [x] コミット・PR作成（draft）

## Risks
- merge_tables.py の md5優先・sha256側の非対称ロジック（md5があればsha256登録しない）を壊す → 前後で `merged_difficulty_tables.json` を byte 比較して担保
- レベルソートは対象の型が2箇所で異なる（songs配列 vs Mapキー配列）→ 比較関数だけを共通化しシグネチャは各自維持
- ワークフロー制約: 両pyスクリプトは引数なし実行・出力パス固定・merge_tables の exit code 挙動は変更禁止

## Done criteria
- 全JSが `node --check` 通過、py が `py_compile` 通過
- merge_tables.py の出力が変更前後で一致
- ブラウザで golden path（DBアップロード → Score Log / Lamp Viewer 表示 / 難易度表ビューア）が動作、コンソールに新規エラーなし
- 合計 100行以上の削減
