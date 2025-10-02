let scoreDbData;
let scorelogDbData;
let songdataDbData;
let sqlPromise;

document.addEventListener('DOMContentLoaded', async () => {
    const pathSegments = window.location.pathname.split('/').filter(segment => segment !== '');
    // HTMLファイル名を除外してベースパスを取得
    const filteredSegments = pathSegments.filter(segment => !segment.endsWith('.html'));
    const repoName = filteredSegments.length > 0 ? '/' + filteredSegments[0] + '/' : '/';
    sqlPromise = initSqlJs({
        locateFile: filename => `${repoName}js/lib/${filename}`
    });
});

document.getElementById('uploadscoredb').addEventListener('click', () => {
  document.getElementById('fileInputscore').click();
});
document.getElementById('uploadscorelogdb').addEventListener('click', () => {
  document.getElementById('fileInputscorelog').click();
});
document.getElementById('uploadsongdatadb').addEventListener('click', () => {
  document.getElementById('fileInputsongdata').click();
});

document.getElementById('fileInputscore').addEventListener('change', handleFileSelect("score.db"), false);
document.getElementById('fileInputscorelog').addEventListener('change', handleFileSelect("scorelog.db"), false);
document.getElementById('fileInputsongdata').addEventListener('change', handleFileSelect("songdata.db"), false);

function handleFileSelect(expectedFileName) {
  return async function(event){
      const files = event.target.files;
      if (files.length == 0) return;
      const file = files[0];

      const reader = new FileReader();
      reader.onload = async (event) => {
          const messageArea = document.getElementById("message-" + expectedFileName.replace(".db", ""));
          try {
              const uint8Array = new Uint8Array(event.target.result);
              const SQL = await sqlPromise;
              const db = new SQL.Database(uint8Array);
              console.log(expectedFileName + "の読み込みに成功しました");

              // インデックス作成処理を追加
              if (expectedFileName === "songdata.db") {
                db.run("CREATE INDEX IF NOT EXISTS idx_song_md5 ON song (md5);");
                console.log("songdata.dbのmd5インデックスを作成しました");
            } else if (expectedFileName === "scorelog.db") {
                db.run("CREATE INDEX IF NOT EXISTS idx_scorelog_sha256_date ON scorelog (sha256, date);"); // 複合インデックスを作成
                console.log("scorelog.dbの(sha256, date)複合インデックスを作成しました");
                db.run("CREATE INDEX IF NOT EXISTS idx_scorelog_sha256 ON scorelog (sha256);"); // sha256単独のインデックスも作成(findMatchingScoresで使用)
                console.log("scorelog.dbのsha256インデックスを作成しました");
            }

              db.close();

              if (expectedFileName === "score.db") {
                  scoreDbData = uint8Array;
              } else if (expectedFileName === "scorelog.db") {
                  scorelogDbData = uint8Array;
              } else if (expectedFileName === "songdata.db") {
                  songdataDbData = uint8Array;
              }

              if (scoreDbData && scorelogDbData && songdataDbData) {
                  document.getElementById("processData").disabled = false;
              }
              messageArea.textContent = "読み込みに成功しました。";
              messageArea.classList.remove("message-error");
              messageArea.classList.add("message-success");

          } catch (e) {
              console.error(expectedFileName + "の読み込みに失敗しました:" + e);
              messageArea.textContent = "読み込みに失敗しました: " + e.message;
              messageArea.classList.remove("message-success");
              messageArea.classList.add("message-error");
          }
      };
      reader.readAsArrayBuffer(file);
  };
}

export { scoreDbData, scorelogDbData, songdataDbData, sqlPromise };