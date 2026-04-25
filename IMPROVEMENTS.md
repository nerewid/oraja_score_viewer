# 改善計画（IMPROVEMENTS.md）

このドキュメントはoraja_score_viewerプロジェクトの改善計画を管理します。

## 🗑️ 優先度：最高（不要ファイルの削除）

### ✅ 不要ファイルのクリーンアップ
**実施日:** 2025/10/02

#### 削除したファイル:
1. **Zone.Identifierファイル（14個）** - Windows環境からダウンロードされたファイルに付くメタデータ
   - `cal-heatmap.css:Zone.Identifier`
   - `style.css:Zone.Identifier`
   - `js/lib/*.js:Zone.Identifier` (7個)
   - `raw_difficulty_table_data/*.json:Zone.Identifier` (4個)
   - `js/template.html:Zone.Identifier`

2. **style.css.backup** - style_v2.css移行後の不要なバックアップ

3. **js/lib/nunjucks.js（非minified版、208KB）** - minified版が存在し使用中

4. **private_docs/test.json** - 開発中のテストファイル（Git管理不要）

#### 改善した項目:
- `.gitignore`の改善（`node_modules/`, `.DS_Store`, `*.log`を追加）
- `package-lock.json`の権限修正（root→ユーザー所有に変更）
- 有用なドキュメントファイルをGit追跡に追加

---

## 優先度：高（すぐ実装可能）

### ✅ 1. index.htmlの不要なスクリプトブロック削除
**問題:** `index.html:81-87`に孤立した関数定義が存在し、実際には何も実行されない
```javascript
<script>
    locateFile: filename => {
        const path = `/js/lib/${filename}`;
        console.log("Locate file:", path);
        return path;
    }
</script>
```
**解決策:** このスクリプトブロックを削除（`db_uploader.js:9-11`で既に正しく設定済み）

**ファイル:** `index.html:81-87`

---

### ✅ 2. package.jsonの追加
**問題:** `package-lock.json`が存在するが`package.json`がない。開発依存関係が不明確。

**解決策:** 以下の内容で`package.json`を作成
```json
{
  "name": "oraja_score_viewer",
  "version": "1.0.0",
  "description": "beatorajaスコアログビューアー",
  "scripts": {
    "serve": "python3 -m http.server",
    "fetch-tables": "python3 py/fetch_tables.py",
    "merge-tables": "python3 py/merge_tables.py",
    "update-tables": "python3 py/fetch_tables.py && python3 py/merge_tables.py"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/nerewid/oraja_score_viewer"
  },
  "license": "MIT"
}
```

---

### ✅ 3. スタイルファイルの統一
**問題:**
- `style.css`と`style_v2.css`が両方存在
- `index.html`は`style.css`のみ参照
- `style_v2.css`はより洗練されたデザイン（CSS変数、Interフォント、カードUI）だが未使用
- git statusで`style_v2.css`が追跡されていない

**選択肢:**
1. **オプションA:** `style_v2.css`を正式採用
   - `index.html`で`style_v2.css`を読み込むように変更
   - `style.css`を削除またはバックアップ
2. **オプションB:** `style.css`を維持
   - `style_v2.css`を削除

**推奨:** オプションA（より現代的なデザイン）

---

### ✅ 4. エラーメッセージUIの改善
**問題:**
- ユーザーにはalertしか表示されない（`score_change_to_json.js:78`）
- エラー詳細が不明確

**解決策:**
1. UI上にエラー表示用の要素を追加
2. より詳細なエラーメッセージを表示
3. エラーの種類に応じた対処方法を提示

**実装箇所:**
- `index.html`: エラー表示用のdiv追加
- `score_change_to_json.js`: エラーハンドリング改善
- CSS: エラー表示スタイル追加

---

## 優先度：中（機能改善）

### 🔄 5. TODOの実装
**出典:** `private_docs/todo.md`

#### 5-1. difficulty_tables.jsonに難易度の順番を追加
**目的:** 難易度表の各難易度が正しい順序で表示されるようにする

**参考URL:** https://qiita.com/kazhashimoto/items/d611bd4f4abbb618a539

**実装箇所:**
- `raw_difficulty_table_data/difficulty_tables.json`: levelOrderフィールド追加
- `py/fetch_tables.py`: 順序情報の取得・保存
- `js/lamp_graph_generator.js`: 順序に基づいたソート処理

#### ✅ 5-2. プレー履歴のページネーション
**目的:** 大量のプレー履歴がある場合のパフォーマンス改善とUI改善
**状態:** 実装済み（`js/pagination.js`）

**実装箇所:**
- `js/html_generator.js`: ページネーション機能追加
- `index.html`: ページネーション用UI追加
- CSS: ページネーションスタイル

---

### 🎯 6. ローディングインジケーター追加
**問題:** データ処理中にユーザーに進捗が見えない（console.timeのみ）

**解決策:**
1. スピナーまたはプログレスバーの表示
2. 処理ステップごとの進捗表示（例：「難易度表を読み込み中...」「スコアを検索中...」）
3. 推定残り時間の表示

**実装箇所:**
- `index.html`: ローディング用UI
- `js/score_change_to_json.js`: 進捗コールバック
- CSS: ローディングアニメーション

---

### 📊 7. パフォーマンス最適化
**現状:** チャンク化とインデックスは適切だが、UIの応答性が不足

**改善案:**
1. **Web Workerの導入**
   - 重い処理（データベースクエリ、JSON生成）をバックグラウンド化
   - UIスレッドをブロックしない
2. **増分レンダリング**
   - 特にscorelogが大量の場合、一度に全て表示せず分割表示
3. **仮想スクロール**
   - 大量の曲リスト表示時にDOMノード数を削減

**実装箇所:**
- `js/workers/`: 新規ディレクトリ作成
- 各処理モジュールの非同期化

---

## 優先度：中～低（リファクタリング）

### 🗂️ 8. lamp_graph_generator.jsの分割
**問題:** 848行で大きすぎる、保守性が低下

**分割案:**
```
js/lamp_graph/
├── lamp_graph_data.js      # データ処理（スコア取得、集計）
├── lamp_graph_renderer.js  # レンダリング（グラフ、曲リスト描画）
├── lamp_graph_ui.js         # UI操作（セレクト、ラジオボタン）
└── lamp_graph_main.js       # メインロジック（統合）
```

**メリット:**
- コードの可読性向上
- テストしやすくなる
- 複数人での並行開発が容易

---

### 🧪 9. テストの導入
**問題:** テストコードが存在せず、手動テストのみ

**推奨フレームワーク:** Vitest（軽量、ESモジュール対応）

**テスト対象（優先順）:**
1. `score_data_processor.js`: MD5/SHA256マッピング関数
2. `json_creator.js`: スコアデータ変換ロジック
3. `py/merge_tables.py`: 難易度表マージロジック

**導入手順:**
```bash
npm install -D vitest
```

`package.json`にスクリプト追加:
```json
"scripts": {
  "test": "vitest",
  "test:ui": "vitest --ui"
}
```

---

### 🌐 10. グローバル変数の削減
**問題:** `score_change_to_json.js:6`で`sha256ToMd5Map`がグローバル変数

**解決策:**
1. クラスベースの設計に変更
2. またはモジュールスコープに閉じ込める
3. 状態管理ライブラリの導入（過剰な場合は不要）

---

## 優先度：低（将来的な改善）

### 📱 11. レスポンシブデザインの改善
**問題:** モバイル対応が不明確

**実装:**
- メディアクエリの追加
- タッチ操作の最適化
- ヒートマップ/グラフのモバイル表示改善

---

### 🔒 12. プライバシー情報の明示
**推奨:**
- DBファイルがサーバーに送信されないことを明示
- データ処理がブラウザ内で完結することを説明
- プライバシーポリシーページの追加（任意）

**実装箇所:**
- `index.html`: 説明文追加
- `README.md`: プライバシーセクション追加

---

### ✅ 13. 国際化（i18n）
**状態:** 実装済み（`js/i18n.js`と`js/lang_switcher.js`で日本語/英語切替を実装）

**将来的に:**
- 追加言語の対応

---

## 進捗管理

### 完了済み
- [x] **不要ファイルのクリーンアップ（2025/10/02）**
  - Zone.Identifierファイル全削除（14個）
  - style.css.backup削除
  - js/lib/nunjucks.js（非minified版）削除
  - private_docs/test.json削除
  - .gitignore改善
  - package-lock.json権限修正
  - 有用なドキュメントファイルをGit追跡に追加
- [x] 1. index.htmlの不要なスクリプトブロック削除
- [x] 2. package.jsonの追加
- [x] 3. スタイルファイルの統一（style_v2.css採用、style.cssをバックアップ）
- [x] 4. エラーメッセージUIの改善
  - エラー表示エリア追加
  - ローディングインジケーター追加
  - プライバシー情報の明示（データがサーバーに送信されないことを明記）
  - 処理ステップごとの進捗メッセージ表示
  - 詳細なエラーメッセージとスタックトレース表示
  - 再試行ボタンの実装
- [x] 5-2. ページネーション実装（`js/pagination.js`で実装済み）
- [x] 13. 国際化対応（`js/i18n.js`と`js/lang_switcher.js`で実装済み）

### 進行中
- [ ] なし

### 未着手
- [ ] 5-1. 難易度順序の実装
- [ ] 6. ローディングインジケーター追加（部分的に完了：項目4で実装済み）
- [ ] 7. パフォーマンス最適化
- [ ] 8. lamp_graph_generator.jsの分割
- [ ] 9. テストの導入
- [ ] 10. グローバル変数の削減
- [ ] 11. レスポンシブデザイン改善
- [ ] 12. プライバシー情報の明示（部分的に完了：項目4で実装済み）

---

## メモ

### スタイルファイルについて
- `style.css`: シンプルなダークテーマ
- `style_v2.css`: CSS変数を使用した現代的なデザイン、Interフォント、カード型UI
- 決定: style_v2.cssの採用を推奨（未適用の場合）

### 依存関係
- 優先度「高」の項目は相互依存がなく並行実装可能
- Web Worker導入（項目7）は大規模な変更のため、他の改善後に実施推奨

### ファイルサイズの問題
- `js/lamp_graph_generator.js`: 848行（分割推奨）
- `js/lib/`配下のライブラリ合計: 約1.4MB（wasmファイル含む）
