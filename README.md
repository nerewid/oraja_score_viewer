# oraja_score_viewer
scorelog viewer for beatoraja
- 難易度表を閲覧できます
- 日毎のランプ更新とBP更新を確認できます
- 難易度表別にランプグラフを閲覧できます

以下から利用できます。

https://nerewid.github.io/oraja_score_viewer/

最終機能更新日: 2025/12/03

最終難易度表情報更新日: 2025/12/07

対応している難易度表
- Satellite 難易度表
- Stella 難易度表
- 発狂難易度表
- NEW GENERATION 発狂難易度表
- 第3期Overjoy
- gachimijoy
- Solomon難易度表
- 16分乱打難易度表(仮)
- 腕ガチ難易度表
- Dystopia難易度表
- δ難易度表
- 発狂DP難易度表
- DP Overjoy
- DP Satellite
- DP Stella

実装予定
- 表示する難易度を選択する機能

# ローカルで実行する場合
## 難易度表を最新化してツール用にマージ

$ python3 py/fetch_tables.py

$ python3 py/merge_tables.py

## httpサーバを起動してアクセス
$ python3 -m http.server

ブラウザで http://localhost:8000/ にアクセス

---

# oraja_score_viewer (English)

Scorelog viewer for beatoraja
- Browse difficulty tables
- Check daily lamp updates and BP updates
- View lamp graphs by difficulty table

Available at:

https://nerewid.github.io/oraja_score_viewer/

Last feature update: 2025/12/03

Last difficulty table update: 2025/12/03

Supported Difficulty Tables
- Satellite
- Stella
- Insane
- NEW GENERATION Insane
- Overjoy (3rd)
- gachimijoy
- Solomon
- 16分乱打
- 腕ガチ
- Dystopia
- δ
- DP Insane
- DP Overjoy
- DP Satellite
- DP Stella

Planned Features
- Feature to select which difficulty levels to display

# Running Locally
## Update and merge difficulty tables

$ python3 py/fetch_tables.py

$ python3 py/merge_tables.py

## Start HTTP server and access
$ python3 -m http.server

Access http://localhost:8000/ in your browser
