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
