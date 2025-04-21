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

[
  {
      "tableFullName": "",
      "internalFileName": "satellite",
      "shortName": "sl",
      "url": "https://stellabms.xyz/sl/score.json"
  },
  {
      "tableFullName": "",
      "internalFileName": "stella",
      "shortName": "st",
      "url": "https://stellabms.xyz/st/score.json"
  },
  {
      "tableFullName": "発狂難易度表",
      "internalFileName": "insane",
      "shortName": "★",
      "url": "https://miraiscarlet.github.io/bms/table/genocide_insane/data_insane.json"
  },
  {
      "tableFullName": "NEW GENERATION難易度表",
      "internalFileName": "new_generation",
      "shortName": "▼",
      "url": "https://rattoto10.github.io/second_table/insane_data.json"
  },
  {
      "tableFullName": "Overjoy",
      "internalFileName": "overjoy",
      "shortName": "★★",
      "url": "https://rattoto10.github.io/second_table/overjoy_score.json"
  },
  {
      "tableFullName": "gachimijoy",
      "internalFileName": "gachimijoy",
      "shortName": "双",
      "url": "https://script.google.com/macros/s/AKfycbz1nScG0S5xcvo-GpGLZMa0MgrCHWjigvdhg4OrcgbLEltlgG-9/exec"
  },
  {
      "tableFullName": "Solomon難易度表",
      "internalFileName": "solomon",
      "shortName": "✡",
      "url": "https://script.googleusercontent.com/macros/echo?user_content_key=x2zOgR8HfNkQ6TnHzlkKoE8JMb9woyjKa3y0pNIXZ3_iotueZbKCpXT5y-ynE4e6Y2NuPtRtXYeLuPwBqkSstrJoHCalajdIm5_BxDlH2jW0nuo2oDemN9CCS2h10ox_1xSncGQajx_ryfhECjZEnMR7cNnV8a75NGjQBtxNujoGdV-7j3JVfESX37ULYcQWh9bFtzDGgxbcrb2L2XezaHdukmdRA5GrHySAa7uIkNOjCM1Dfljq_w&lib=MznwyjOlysIhmj79D6u027f-2qzvq4NmQ"
  },
  {
      "tableFullName": "16分乱打難易度表(仮)",
      "internalFileName": "16thranda",
      "shortName": "",
      "url": "https://script.googleusercontent.com/macros/echo?user_content_key=yQ81HtldNqO7x50SBMxrERwJIN4XAaultIf_RlV44XbMAj4hvZ14kEr-wbAjtjjl2eIgO7X69Jz0NleBfLNRwfMlYJmx-xqzm5_BxDlH2jW0nuo2oDemN9CCS2h10ox_1xSncGQajx_ryfhECjZEnCAj3aWieAacqQmuefyMCLVB3qwUpm8qL83Ox_d_5e8d0dsDBu6GpNukiousci_cm122CfpxH3qAMvU7VPpBzWzBk7qPSqYjUg&lib=MaCuaL_B-6BIjPIN6-LoGkpXvWRuAoVU2"
  },
  {
      "tableFullName": "Dystopia難易度表",

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
