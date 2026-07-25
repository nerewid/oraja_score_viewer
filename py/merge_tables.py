import json
import os
import sys
import hashlib
from datetime import datetime

def _load_json_or_record_error(file_path, errors, missing_key=None):
    """JSONファイルを読み込み、失敗時は警告メッセージをprint・errorsに記録してNoneを返す。

    Returns:
        dict | None: 読み込んだJSONデータ。エラー時はNone。
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        msg = f"警告：難易度表ファイル'{file_path}'が見つかりません。スキップします。"
        print(msg, file=sys.stderr)
        errors.append(msg)
        return None
    except json.JSONDecodeError:
        msg = f"警告：難易度表ファイル'{file_path}'のJSON形式が不正です。スキップします。"
        print(msg, file=sys.stderr)
        errors.append(msg)
        return None

    if missing_key and missing_key not in data:
        msg = f"警告：難易度表ファイル'{file_path}'に'{missing_key}'キーが存在しません。スキップします。"
        print(msg, file=sys.stderr)
        errors.append(msg)
        return None

    return data


def _merge_song_into(merged_songs, key, song, level_entry, other_key_name):
    """merged_songs[key] に song/level_entry をマージする（既存song更新 or 新規登録）。

    md5分岐・sha256分岐で共通のロジック。other_key_name は既存songに欠けていた場合に
    補完対象となる相手側キー名（md5分岐なら"sha256"、sha256分岐なら"md5"）。
    """
    if key in merged_songs:
        existing_song = merged_songs[key]
        existing_keys = {(lv.get("level"), lv.get("table")) for lv in existing_song["levels"]}
        if (level_entry["level"], level_entry["table"]) not in existing_keys:
            existing_song["levels"].append(level_entry)
        if not existing_song.get("artist") and song.get("artist"):
            existing_song["artist"] = song["artist"]
        if not existing_song.get("title") and song.get("title"):
            existing_song["title"] = song["title"]
        if not existing_song.get(other_key_name) and song.get(other_key_name):
            existing_song[other_key_name] = song[other_key_name]
    else:
        merged_songs[key] = {
            "md5": song.get("md5"),
            "sha256": song.get("sha256"),
            "title": song.get("title"),
            "artist": song.get("artist"),
            "levels": [level_entry]
        }


def merge_difficulty_tables(table_info_path="raw_difficulty_table_data/difficulty_tables.json", output_path="merged_difficulty_tables.json"):
    """
    複数の難易度表JSONファイルを読み込み、md5をキーに統合します。
    md5が存在しない場合は一旦nullとして統合、処理後にsha256で統合を行います。

    Returns:
        bool: 成功時 True、致命的エラーで JSON 出力をスキップした場合 False
    """

    try:
        with open(table_info_path, "r", encoding="utf-8") as f:
            table_info = json.load(f)
    except FileNotFoundError:
        print(f"エラー：難易度表情報ファイル'{table_info_path}'が見つかりません。", file=sys.stderr)
        return False
    except json.JSONDecodeError:
        print(f"エラー：難易度表情報ファイル'{table_info_path}'のJSON形式が不正です。", file=sys.stderr)
        return False

    merged_songs_by_md5 = {}
    merged_songs_by_sha256 = {}
    tables = []
    errors = []

    for table in table_info:
        # skipMergeフラグをチェック
        if table.get("skipMerge", False):
            print(f"情報：'{table['tableFullName']}'はskipMergeフラグによりスキップされました。")
            continue

        internal_file_name = table["internalFileName"]
        short_name = table["shortName"]
        file_path = f"raw_difficulty_table_data/{internal_file_name}.json"
        tables.append(internal_file_name)

        table_data = _load_json_or_record_error(file_path, errors, missing_key="songs")
        if table_data is None:
            continue

        for song in table_data["songs"]:
            md5 = song.get("md5")
            sha256 = song.get("sha256")

            if not md5 and not sha256:
                print(f"警告：楽曲データに'md5'と'sha256'キーのどちらも存在しません。スキップします。データ:{song}", file=sys.stderr)
                continue

            level_entry = {
                "level": song.get("level"),
                "table": internal_file_name,
                "shortName": short_name
            }

            if md5:
                _merge_song_into(merged_songs_by_md5, md5, song, level_entry, "sha256")
            elif sha256: #md5が存在しない場合sha256で管理
                _merge_song_into(merged_songs_by_sha256, sha256, song, level_entry, "md5")

    # md5をキーにしたデータとsha256をキーにしたデータを統合
    merged_songs = {}
    for song in merged_songs_by_md5.values():
        merged_songs[song["md5"]]=song
    for song in merged_songs_by_sha256.values():
        if song.get("md5"): #md5があるならmd5で管理されているはずなので追加しない
            continue
        merged_songs[song["sha256"]]=song

    merged_data = {
        "Last Update": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "tables": tables,
        "songs": list(merged_songs.values())
    }

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        print("エラーが発生したため、JSONファイルの出力は行いません。", file=sys.stderr)
        return False

    merged_data["songs"].sort(key=lambda x: x.get("title", ""))

    try:
        with open(output_path, "w", encoding="utf-8") as outfile:
            json.dump(merged_data, outfile, indent=4, ensure_ascii=False)
        print(f"統合されたデータは'{output_path}'に保存されました。")
        return True
    except Exception as e:
        print(f"エラー：ファイルの書き込み中にエラーが発生しました：{e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    source_dir = os.path.join(project_root, "raw_difficulty_table_data")
    result_dir = os.path.join(project_root, "difficulty_table_data")

    success = merge_difficulty_tables(os.path.join(source_dir, "difficulty_tables.json"), os.path.join(result_dir, "merged_difficulty_tables.json"))
    sys.exit(0 if success else 1)