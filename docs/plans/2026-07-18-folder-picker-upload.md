# beatoraja フォルダ選択による DB 自動読み込み

## Background

現在は score.db / scorelog.db / songdata.db を3つのボタンで個別にアップロードさせている。
offline.walkure.net は File System Access API の `showDirectoryPicker()` で beatoraja
ルートフォルダを選択させ、`config_sys.json` を起点に固定パスを辿って必要ファイルを
自動特定している。同方式を本プロジェクトに導入する。

調査結果の要点:
- walkure は `showDirectoryPicker()` のみ使用（webkitdirectory / drag&drop なし）
- `config_sys.json` の存在で beatoraja ルートを判定し、`songpath`（既定 `songdata.db`）と
  `playerpath`（既定 `player`）を読んで固定パスをプローブ
- Chromium 系限定（Firefox / Safari は非対応・実装予定なし）
- 本プロジェクトの下流5モジュールは db_uploader.js の export（`scoreDbData` 等）と
  「3つ揃ったら processData 活性化」の挙動を維持すれば無改修で済む

## Scope

- フォルダ選択 UI + 自動特定ロジックの追加（Chromium 系のみ表示）
- 既存の3ファイル個別アップロードはフォールバックとして維持
- 複数プレイヤープロファイル時の選択 UI（フォルダ選択直後の自動読み込み +
  セレクト変更で即時再読み込み、前回プレイヤーを localStorage に記憶）
- FileSystemDirectoryHandle の IndexedDB 保存による「前回のフォルダから読み込む」
  ボタン（当初フォローアップ予定だったがユーザー要望によりスコープに追加。
  2026-07-18 実装・OPFS を使った E2E 検証済み）

## Steps

- [x] 調査（walkure の仕組み / 現行実装）
- [x] 計画書作成
- [x] `js/db_uploader.js`: ファイル読み込みコア（SQL.js 検証 + インデックス作成 +
      module 変数格納 + processData 活性化）を `loadDbFromArrayBuffer()` として共通化
- [x] `js/folder_picker.js` 新規作成:
  - `showDirectoryPicker` の機能検出（非対応なら UI 非表示）
  - `config_sys.json` 検証 → `songpath` / `playerpath` 解決（`\` 正規化、
    絶対パスは既定値にフォールバック）
  - `player/` 配下のプロファイル列挙 → score.db 存在確認
  - 1件なら自動選択、複数なら select 表示（config_sys.json の `playername` で事前選択）
  - 3ファイルを arrayBuffer で読み `loadDbFromArrayBuffer()` に投入
- [x] `index.html`: フォルダ選択セクション追加、既存3行を `<details>`（手動選択）に格納、
      プレイヤー選択 select、案内文更新
- [x] i18n: 新規文言のキー追加（既存の `data-i18n` / `t()` 方式に従う）
- [x] `style.css`: 新 UI のスタイル
- [x] 品質ゲート: `node --check`、デバッグコード残存検査
- [x] ブラウザ動作確認（Playwright MCP）:
  - フォールバック経路: 実 DB 3ファイルを個別アップロード → データ処理 → タブ表示
  - フォルダ経路: `showDirectoryPicker` をモック（private_docs の実 DB を fetch して
    擬似 DirectoryHandle を構築）→ 自動読み込み → データ処理 → タブ表示
  - コンソールエラー検査
- [x] セルフレビュー → コミット → draft PR

## Risks

- `showDirectoryPicker` は Chromium 系限定 → フォールバック維持で緩和
- config_sys.json の `songpath` / `playerpath` が絶対パスや非標準構成の場合 →
  既定値リトライ + 失敗時は手動選択へ誘導するエラーメッセージ
- Playwright ではネイティブのフォルダ選択ダイアログを操作できない → モックで代替。
  実ダイアログ経由の確認はユーザーの手動確認に依頼

## Done criteria

- Chromium 系でフォルダ選択 → 3ファイル自動読み込み → 既存フローが従来どおり完走
- 非対応ブラウザ / 非標準構成でも従来の個別アップロードが機能
- DevTools コンソールに新規エラーなし
