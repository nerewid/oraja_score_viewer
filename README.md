# oraja_score_viewer
scorelog viewer for beatoraja

以下から利用できます。

https://nerewid.github.io/oraja_score_viewer/

最終機能更新日: 2025/03/01

最終難易度表情報更新日: 2025/04/21

対応している難易度表
- Satellite難易度表
- Stella難易度表
- 発狂難易度表
- NEW GENERATION難易度表
- Overjoy
- gachimijoy
- Solomon難易度表
- 16分乱打難易度表(仮)
- 腕ガチ難易度表
- Dystopia難易度表


実装予定
- 表示する難易度を指定する機能
- ランプビューワー機能

# ローカルで実行する場合
## 難易度表を最新化してツール用にマージ

$ python3 py/fetch_tables.py

$ python3 py/merge_tables.py

## httpサーバを起動してアクセス
$ python3 -m http.server

ブラウザで http://localhost:8000/ にアクセス
