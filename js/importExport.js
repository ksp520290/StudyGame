/**
 * importExport.js
 * -----------------------------------------
 * バックアップJSONの入出力を行う。
 */

const ImportExport = (() => {

  function exportBackup() {
    const state = GameState.getState();
    const backup = {
      backupMeta: { exportedAt: new Date().toISOString(), appVersion: 1 },
      state,
    };
    const json = JSON.stringify(backup, null, 2);
    const filename = `gakushu_backup_${Utils.todayStr()}.json`;
    triggerDownload(filename, json, "application/json");
    Utils.showToast("バックアップを書き出しました", "success");
  }

  /**
   * 【追加要望対応】データ管理タブの「バックアップ」をCSV形式でも出力できるようにした。
   * 表形式ではないデータ（建築物・キャラクター・設定など）を含むため、実体は
   * バックアップJSON全体を1セル（列名 backup_json）に格納したCSVとする。
   * インポート側（importBackupFromCSVText）もこの形式を前提に読み戻す。
   */
  function exportBackupAsCSV() {
    const state = GameState.getState();
    const backup = {
      backupMeta: { exportedAt: new Date().toISOString(), appVersion: 1 },
      state,
    };
    const json = JSON.stringify(backup);
    const cell = '"' + json.replace(/"/g, '""') + '"';
    const csv = "backup_json\r\n" + cell;
    const filename = `gakushu_backup_${Utils.todayStr()}.csv`;
    triggerDownload(filename, "\ufeff" + csv, "text/csv");
    Utils.showToast("バックアップを書き出しました", "success");
  }

  function importBackupFromFile(file) {
    return readFileAsText(file)
      .then((text) => restoreFromJSONText(text));
  }

  /** 【追加要望対応】データ管理タブの「バックアップ」CSV入力用。 */
  function importBackupFromCSVFile(file) {
    return readFileAsText(file)
      .then((text) => {
        const rows = CsvManager.parseCSV(text);
        if (rows.length < 2 || !rows[1][0]) {
          throw new Error("CSV内にバックアップデータ（backup_json列）が見つかりません");
        }
        return restoreFromJSONText(rows[1][0]);
      })
      .catch((err) => {
        console.error("[importExport] CSVバックアップの読み込みに失敗しました", err);
        Utils.showToast("読み込みに失敗しました: " + err.message, "error");
        throw err;
      });
  }

  function restoreFromJSONText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      Utils.showToast("読み込みに失敗しました: JSONの形式が正しくありません（破損している可能性があります）", "error");
      throw new Error("JSONの形式が正しくありません（破損している可能性があります）");
    }
    return restoreFromObject(parsed);
  }

  function restoreFromObject(parsed) {
    try {
      const incomingState = parsed.state || parsed;
      validateStateShape(incomingState);

      GameState.update((state) => {
        Object.keys(state).forEach((key) => delete state[key]);
        Object.assign(state, incomingState);
      });

      return GameState.persist().then(() => {
        Utils.showToast("データを読み込みました", "success");
      });
    } catch (err) {
      console.error("[importExport] インポート失敗", err);
      Utils.showToast("読み込みに失敗しました: " + err.message, "error");
      return Promise.reject(err);
    }
  }

  function validateStateShape(obj) {
    if (!obj || typeof obj !== "object") {
      throw new Error("データの構造が不正です");
    }
    if (!Array.isArray(obj.genres)) {
      throw new Error("ジャンルデータ（genres）が見つかりません");
    }
    if (!obj.user || typeof obj.user !== "object") {
      throw new Error("ユーザーデータ（user）が見つかりません");
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
      reader.readAsText(file, "utf-8");
    });
  }

  function triggerDownload(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { exportBackup, exportBackupAsCSV, importBackupFromFile, importBackupFromCSVFile };
})();
