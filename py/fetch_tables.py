import requests
import json
import os
import configparser

def load_json_data(json_file_path):
    """JSONファイルを読み込む。"""
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"エラー: JSONファイルが見つかりません: {json_file_path}")
        return None
    except json.JSONDecodeError as e:
        print(f"エラー: JSONファイルのデコードエラー: {e}。ファイルが有効なJSON形式か確認してください。")
        return None
    except Exception as e:
        print(f"エラー: JSONファイルの読み込みで予期せぬエラーが発生しました: {e}")
        return None

def download_and_save_json(item, difficulty_table_dir):
    """URLからJSONをダウンロードして保存する。"""
    internalFileName = item.get("internalFileName")
    url = item.get("url")
    shortName = item.get("shortName") # shortNameを取得

    if not internalFileName or not url:
        print(f"エラー: internalFileNameまたはurlが不足しています: {item}")
        return

    if not shortName:
        print(f"警告: shortNameが不足しています: {item}。空文字列として処理します。")
        shortName = "" # shortNameがなくても処理を続行

    try:
        response = requests.get(url)
        response.raise_for_status()

        file_name = f"{internalFileName}.json"
        file_path = os.path.join(difficulty_table_dir, file_name)

        json_data_from_url = response.json()

        # JSONデータの構造を変更
        new_json_data = {
            "shortName": shortName,
            "songs": json_data_from_url # 元のデータをsongsキーの下に格納
        }

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(new_json_data, f, indent=4, ensure_ascii=False)
        print(f"{url} のJSONデータを {file_name} に保存しました。")

    except requests.exceptions.RequestException as e:
        print(f"エラー: {url}へのアクセスでエラーが発生しました: {e}")
    except json.JSONDecodeError as e:
        print(f"エラー: {url}から取得したデータは有効なJSONではありません: {e}。URLが正しいか、レスポンスの内容を確認してください。")
    except Exception as e:
        print(f"エラー: 予期せぬエラーが発生しました: {e}")

def main():
    """メイン関数。"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    

    difficulty_table_dir = os.path.join(project_root, "raw_difficulty_table_data")

    data = load_json_data(os.path.join(difficulty_table_dir, "difficulty_tables.json"))
    if data is None:
        return

    for item in data:
        download_and_save_json(item, difficulty_table_dir)

if __name__ == "__main__":
    main()