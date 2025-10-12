import json
import os
import hashlib
from datetime import datetime

def merge_difficulty_tables(table_info_path="difficulty_table_data/difficulty_tables.json", output_path="merged_difficulty_tables.json"):
    """
    複数の難易度表JSONファイルを読み込み、md5をキーに統合します。
    md5が存在しない場合は一旦nullとして統合、処理後にsha256で統合を行います。
    """

    try:
        with open(table_info_path, "r", encoding="utf-8") as f:
            table_info = json.load(f)
    except FileNotFoundError:
        print(f"エラー：難易度表情報ファイル'{table_info_path}'が見つかりません。")
        return
    except json.JSONDecodeError:
        print(f"エラー：難易度表情報ファイル'{table_info_path}'のJSON形式が不正です。")
        return

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

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                table_data = json.load(f)
        except FileNotFoundError:
            print(f"警告：難易度表ファイル'{file_path}'が見つかりません。スキップします。")
            continue
        except json.JSONDecodeError:
            print(f"警告：難易度表ファイル'{file_path}'のJSON形式が不正です。スキップします。")
            continue

        if "songs" not in table_data:
            print(f"警告：難易度表ファイル'{file_path}'に'songs'キーが存在しません。スキップします。")
            continue

        for song in table_data["songs"]:
            md5 = song.get("md5")
            sha256 = song.get("sha256")

            if not md5 and not sha256:
                print(f"警告：楽曲データに'md5'と'sha256'キーのどちらも存在しません。スキップします。データ:{song}")
                continue

            if md5:
                if md5 in merged_songs_by_md5:
                    existing_song = merged_songs_by_md5[md5]
                    existing_song["levels"].append({
                        "level": song.get("level"),
                        "table": internal_file_name,
                        "shortName": short_name
                    })
                    if not existing_song.get("artist") and song.get("artist"):
                        existing_song["artist"] = song["artist"]
                    if not existing_song.get("title") and song.get("title"):
                        existing_song["title"] = song["title"]
                    if not existing_song.get("sha256") and song.get("sha256"):
                        existing_song["sha256"] = song["sha256"]

                else:
                    merged_songs_by_md5[md5] = {
                        "md5": md5,
                        "sha256": sha256,
                        "title": song.get("title"),
                        "artist": song.get("artist"),
                        "levels": [{
                            "level": song.get("level"),
                            "table": internal_file_name,
                            "shortName": short_name
                        }]
                    }
            elif sha256: #md5が存在しない場合sha256で管理
                if sha256 in merged_songs_by_sha256:
                    existing_song = merged_songs_by_sha256[sha256]
                    existing_song["levels"].append({
                        "level": song.get("level"),
                        "table": internal_file_name,
                        "shortName": short_name
                    })
                    if not existing_song.get("artist") and song.get("artist"):
                        existing_song["artist"] = song["artist"]
                    if not existing_song.get("title") and song.get("title"):
                        existing_song["title"] = song["title"]
                    if not existing_song.get("md5") and song.get("md5"):
                        existing_song["md5"] = song["md5"]
                else:
                    merged_songs_by_sha256[sha256] = {
                        "md5": md5,
                        "sha256": sha256,
                        "title": song.get("title"),
                        "artist": song.get("artist"),
                        "levels": [{
                            "level": song.get("level"),
                            "table": internal_file_name,
                            "shortName": short_name
                        }]
                    }

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
            print(error)
        print("エラーが発生したため、JSONファイルの出力は行いません。")
        return
    
    merged_data["songs"].sort(key=lambda x: x.get("title", ""))

    try:
        with open(output_path, "w", encoding="utf-8") as outfile:
            json.dump(merged_data, outfile, indent=4, ensure_ascii=False)
        print(f"統合されたデータは'{output_path}'に保存されました。")
    except Exception as e:
        print(f"エラー：ファイルの書き込み中にエラーが発生しました：{e}")


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    source_dir = os.path.join(project_root, "raw_difficulty_table_data")
    result_dir = os.path.join(project_root, "difficulty_table_data")

    merge_difficulty_tables(os.path.join(source_dir, "difficulty_tables.json"), os.path.join(result_dir, "merged_difficulty_tables.json"))