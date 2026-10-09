/** @OnlyCurrentDoc */
// 先行予約の登録を受け取って、このスプレッドシートに1行ずつ書き込む Google Apps Script。
// 1行目の @OnlyCurrentDoc で、触れる範囲をこのスプレッドシート1つだけに限っている。
// 使い方は README.md の「一般公開して登録を集める」を参照。
// 同じメールアドレスで2回登録された場合は、行を増やさずに最新の内容で上書きする。

const SHEET_NAME = "先行予約";
const HEADERS = ["登録日時", "メールアドレス", "地域", "言語", "先行体験"];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    const email = String(data.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ ok: false, error: "bad_email" });

    const sheet = getSheet();
    const row = [
      new Date(),
      email,
      String(data.prefecture || "").slice(0, 20),
      data.lang === "en" ? "en" : "ja",
      data.trial === true ? "参加したい" : "",
    ];
    const emails = sheet.getRange(2, 2, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
    const found = emails.indexOf(email);
    if (found >= 0 && sheet.getLastRow() > 1) {
      sheet.getRange(found + 2, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: "server" });
  } finally {
    lock.releaseLock();
  }
}

// 登録数をブラウザで確かめるとき用（ウェブアプリの URL を開くと人数が出る）
function doGet() {
  return reply({ count: Math.max(getSheet().getLastRow() - 1, 0) });
}

function getSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
