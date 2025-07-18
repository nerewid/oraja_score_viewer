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

        if internalFileName == "satellite":
            json_data_from_url = add_cite_url_to_json(json_data_from_url, "https://stellabms.xyz/s/sl/", "submission")
        elif internalFileName == "stella":
            json_data_from_url = add_cite_url_to_json(json_data_from_url, "https://stellabms.xyz/s/st/", "submission")
        elif internalFileName == "dpsatellite":
            json_data_from_url = add_cite_url_to_json(json_data_from_url, "https://stellabms.xyz/s/dp/", "submission")
        elif internalFileName == "dpstella":
            json_data_from_url = add_cite_url_to_json(json_data_from_url, "https://stellabms.xyz/s/dpst/", "submission")
        else:
            json_data_from_url = add_cite_url_to_json(json_data_from_url,
                                                      "http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking&bmsmd5=",
                                                      "md5")

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

def add_cite_url_to_json(json_data, prefix, key):
    """
    受け取ったJSONデータ内の各要素に対して、"key" キーが存在する場合、
    その値を使用して "cite_url" キーと値を新たに追加します。

    Args:
        json_data (list or dict): requests.get().json() で取得したJSONデータ。
        prefix (str): "cite_url" のプレフィックス文字列。

    Returns:
        list or dict: "cite_url" が追加されたJSONデータ。
    """
    if isinstance(json_data, list):
        updated_data = []
        for item in json_data:
            if isinstance(item, dict) and key in item:
                item["cite_url"] = f"{prefix}{item[key]}"
            updated_data.append(item)
        return updated_data
    elif isinstance(json_data, dict):
        if key in json_data:
            json_data["cite_url"] = f"{prefix}{json_data[key]}"
        return json_data
    else:
        return json_data  # JSONデータでない場合はそのまま返す


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