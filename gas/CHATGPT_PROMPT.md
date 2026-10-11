# ChatGPT に貼るプロンプト

下の「---」から最後までを、そのまま ChatGPT に貼ってください。コードは全部この中に入っています（ファイル添付は不要）。
ただし画面本体の `index.html`（約700KB）は大きすぎて貼れないので、**あなたが自分で** Apps Script に貼り付けます（手順はプロンプト内に書いてあります）。ファイルは `gas/index.html`（または `gas-trial.zip` の中）です。

---

あなたは Google Apps Script に詳しいサポート担当です。私は初心者です。私個人のGoogleアカウントで、社内向けWebアプリ「Project Delivery OS」（日本語UIの案件・WBS・工数管理）を **Google スプレッドシート + Apps Script** で動かすトライアルをしたいので、手順を **1ステップずつ、私の操作結果を確認しながら** 案内してください。

## 前提
- 私は自分のGoogleアカウント1つだけで使います。自分1人用で、複数人の同時編集や本物のログイン管理は不要です。
- 画面本体は `index.html`（約700KBのHTML、React製を1ファイルにしたもの）です。内容はあなたには見せられないので、**私が自分でコピーして Apps Script の HTML ファイルに貼ります**。あなたはこのファイルの中身を書き換えたり再生成したりしないでください。
- サーバー側のコード（Code.gs）と設定（appsscript.json）は下に全文あります。**一字も変えずに**私に貼らせてください（変更が必要だと思ったら、理由を説明して私の了承を得てから）。
- 画面の文言は日本語のままにしてください。

## 案内してほしい手順（目安）
1. 空のスプレッドシートを新規作成 → 拡張機能 → Apps Script を開く。
2. プロジェクトの設定で「appsscript.json マニフェスト ファイルをエディタで表示する」にチェック。
3. `コード.gs` を下の Code.gs に置き換え、`appsscript.json` を下の内容に置き換える。
4. HTMLファイルを「index」という名前（拡張子なし）で追加し、私の手元の `index.html` の全内容を貼り付ける。
5. デプロイ → 新しいデプロイ → ウェブアプリ（次のユーザーとして実行：自分／アクセスできるユーザー：自分のみ）。初回は承認画面（「このアプリは確認されていません」→ 詳細 → 移動）を進める。
6. 発行されたURLを開き、動作確認する。

## 動作確認してほしい項目
- デモデータが表示される。操作（例：右上のユーザー切替）して再読み込みしても内容が残る。スプレッドシートに「Data」シートができている。
- 左の「レポート」→「集計をCSVで出力」で、マイドライブの「Project Delivery OS」フォルダにCSVができ、画面のメッセージの「開く」から開ける。
- スプレッドシートのメニュー「Project Delivery OS → 内容をシートに書き出す（閲覧専用）」で「表_◯◯」シートができる。

## うまくいかないとき
エラーメッセージや画面の様子を私が伝えるので、原因を切り分けて、直し方を案内してください。想定される例：
- 承認画面でブロックされる／権限エラー（スプレッドシート・ドライブの許可）
- 画面が真っ白（HTMLの貼り付け漏れ・名前が `index` になっていない・デプロイが古いバージョンのまま）
- 保存されない（`Data` シートの有無、実行ログ、デプロイを「新バージョン」で更新したか）
画面を更新した後は「デプロイ → デプロイを管理 → 編集（鉛筆）→ バージョン：新バージョン」で再デプロイする必要があります。

## Code.gs（全文。そのまま貼る）
```javascript
/**
 * Project Delivery OS - Google Apps Script 側（トライアル用）
 *
 * このスクリプトは「スプレッドシートに紐づけた（コンテナバインド）」形で使います。
 *  - 画面（index.html）を Web アプリとして配信する
 *  - アプリのデータ全体を JSON にして、「Data」シートに分割して保存する
 *  - レポートのCSVを Googleドライブに保存する
 *  - メニュー「Project Delivery OS」から、内容を見やすいシートに書き出す（閲覧専用）
 */

var DATA_SHEET = 'Data';
var CHUNK_SIZE = 40000; // 1セルの上限（50,000文字）より小さく分ける
var DRIVE_FOLDER = 'Project Delivery OS';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Project Delivery OS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function dataSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DATA_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DATA_SHEET);
    sh.getRange('A1:C1').setValues([['番号', 'データ（JSONを分割したもの。編集しないでください）', '最終保存']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 保存済みのデータ（JSON文字列）を返す。まだ無ければ null */
function loadData() {
  var sh = dataSheet_();
  var last = sh.getLastRow();
  if (last < 2) return null;
  var values = sh.getRange(2, 2, last - 1, 1).getValues();
  var json = values.map(function (r) { return String(r[0]); }).join('');
  return json || null;
}

/** データ全体（JSON文字列）を保存する。同時に実行されないよう排他する */
function saveData(json) {
  if (typeof json !== 'string' || json.charAt(0) !== '{') throw new Error('保存するデータの形式が正しくありません');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = dataSheet_();
    var rows = [];
    for (var i = 0; i < json.length; i += CHUNK_SIZE) {
      rows.push([rows.length + 1, json.substring(i, i + CHUNK_SIZE)]);
    }
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, 3).clearContent();
    // 先頭が「=」や数字のものが式・数値に変換されないよう、テキストとして書く
    sh.getRange(2, 2, rows.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, rows.length, 2).setValues(rows);
    sh.getRange('C2').setValue(new Date());
  } finally {
    lock.releaseLock();
  }
  return true;
}

/** 保存データを消す（アプリの「初期データに戻す」用） */
function clearData() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = dataSheet_();
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, 3).clearContent();
  } finally {
    lock.releaseLock();
  }
  return true;
}

/** CSV・JSON を Googleドライブ（マイドライブ/Project Delivery OS）に保存して、URLを返す */
function saveToDrive(filename, text, mime) {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER);
  var safeName = String(filename).replace(/[\\/:*?"<>|]/g, '_');
  var type = String(mime || 'text/csv').split(';')[0];
  return folder.createFile(safeName, text, type).getUrl();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Project Delivery OS')
    .addItem('内容をシートに書き出す（閲覧専用）', 'exportReadableSheets')
    .addToUi();
}

/**
 * 保存データの各表を、見やすいシート（「表_◯◯」）に書き出す。閲覧専用で、ここを編集しても画面には反映されない。
 * 書き出すたびに上書きする。
 */
function exportReadableSheets() {
  var json = loadData();
  if (!json) {
    SpreadsheetApp.getUi().alert('まだデータがありません。先に画面（Webアプリ）を一度開いてください。');
    return;
  }
  var data = JSON.parse(json);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var count = 0;
  Object.keys(data).forEach(function (key) {
    var list = data[key];
    if (!Array.isArray(list)) return;
    var name = '表_' + key;
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clear();
    var cols = [];
    list.forEach(function (row) {
      Object.keys(row).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); });
    });
    if (!cols.length) return;
    var values = [cols].concat(list.map(function (row) {
      return cols.map(function (k) { return cell_(row[k]); });
    }));
    sh.getRange(1, 1, values.length, cols.length).setValues(values);
    sh.setFrozenRows(1);
    count++;
  });
  SpreadsheetApp.getUi().alert(count + ' 個の表を書き出しました（シート名は「表_」で始まります）。');
}

function cell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') v = JSON.stringify(v);
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}
```

## appsscript.json（全文。そのまま貼る）
```json
{
  "timeZone": "Asia/Tokyo",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "MYSELF"
  }
}
```

## 補足（仕組み）
- アプリは、`google.script.run` が使える環境（Apps Script上）で開くと、データ全体をJSONにして `saveData` で「Data」シートに保存し、起動時に `loadData` で読みます。CSVは `saveToDrive` でドライブに保存します。これらの関数名は変えないでください。
- 制限：自分1人用／同時編集は後勝ち／数千行を超えると重くなる。
