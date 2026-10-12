/** @OnlyCurrentDoc */
// 先行予約の登録を受け取って、このスプレッドシートに1行ずつ書き込み、登録した人に確認メールを送る Google Apps Script。
// 1行目の @OnlyCurrentDoc で、触れるスプレッドシートをこの1つだけに限っている。
// メールは、このスクリプトを動かしている Google アカウント（あなたの Gmail）から送られる。
// 使い方は README.md の「一般公開して登録を集める」と「登録した人に確認メールを送る」を参照。
// 同じメールアドレスで2回登録された場合は、行を増やさずに最新の内容で上書きし、メールも送り直さない。

const SHEET_NAME = "先行予約";
const HEADERS = ["登録日時", "メールアドレス", "地域", "言語", "先行体験", "確認メール"];
const MAIL_COL = 6; // 「確認メール」の列（送った日時が入る）

// ---- メールの設定（ここだけ書き換えればよい） ----
const SENDER_NAME = "Soto Phone";
const REPLY_TO = ""; // 返信を別のアドレスで受けたいときだけ入れる（空ならこのアカウントに届く）
const SITE_URL = "https://sotophone.jp/";
// 1分あたりに送るメールの上限。いたずらで大量に登録されても、あなたの Gmail から大量に送られないようにする。
// 上限を超えた分は行だけ保存され、sendPendingConfirmations() を動かすと後から送られる。
const MAX_MAILS_PER_MINUTE = 10;

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    const email = String(data.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply({ ok: false, error: "bad_email" });

    const sheet = getSheet();
    const lang = data.lang === "en" ? "en" : "ja";
    const trial = data.trial === true;
    const row = [new Date(), email, String(data.prefecture || "").slice(0, 20), lang, trial ? "参加したい" : ""];

    const last = sheet.getLastRow();
    const emails = last > 1 ? sheet.getRange(2, 2, last - 1, 1).getValues().flat() : [];
    const found = emails.indexOf(email);
    let rowIndex;
    if (found >= 0) {
      rowIndex = found + 2;
      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
      rowIndex = sheet.getLastRow();
    }

    // 確認メールは、まだ送っていない人にだけ送る
    const sentAt = sheet.getRange(rowIndex, MAIL_COL).getValue();
    if (!sentAt && canSendNow()) {
      sendConfirmation(email, lang, trial);
      sheet.getRange(rowIndex, MAIL_COL).setValue(new Date());
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

// 確認メールを送れなかった人（上限に達したときなど）に、まとめて送る。
// Apps Script の画面でこの関数を選んで「実行」するか、時間主導のトリガーで1時間ごとに動かす。
function sendPendingConfirmations() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return;
  const rows = sheet.getRange(2, 1, last - 1, MAIL_COL).getValues();
  rows.forEach((r, i) => {
    const email = r[1], lang = r[3] === "en" ? "en" : "ja", trial = r[4] === "参加したい", sentAt = r[5];
    if (!email || sentAt || !canSendNow()) return;
    sendConfirmation(email, lang, trial);
    sheet.getRange(i + 2, MAIL_COL).setValue(new Date());
  });
}

// 届くメールを自分で確かめる用。Apps Script の画面でこの関数を選んで「実行」すると、自分あてに日本語版が届く。
function testSendToMe() {
  sendConfirmation(Session.getEffectiveUser().getEmail(), "ja", true);
}

function sendConfirmation(email, lang, trial) {
  const m = lang === "en" ? mailEn(trial) : mailJa(trial);
  const options = { to: email, subject: m.subject, body: m.text, htmlBody: m.html, name: SENDER_NAME };
  if (REPLY_TO) options.replyTo = REPLY_TO;
  MailApp.sendEmail(options);
}

// 1分あたりの上限と、Gmail の1日の送信上限の両方を見る
function canSendNow() {
  if (MailApp.getRemainingDailyQuota() < 5) return false;
  const cache = CacheService.getScriptCache();
  const key = "mails-" + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(key) || 0);
  if (n >= MAX_MAILS_PER_MINUTE) return false;
  cache.put(key, String(n + 1), 120);
  return true;
}

function mailJa(trial) {
  const lines = [
    "Soto Phone の先行予約にご登録いただき、ありがとうございます。",
    "",
    "発売が決まったら、このメールアドレスにいちばん先にお知らせします。",
    trial ? "試作機の先行体験の募集が始まったときも、こちらからご案内します。" : "",
    "",
    "登録は無料です。購入の確定やお支払いは発生しません。",
    "",
    "楽しさは、画面の外に。",
    "Soto Phone",
    SITE_URL,
    "",
    "――",
    "このメールは、" + SITE_URL + " で先行予約に登録された方にお送りしています。",
    "お心当たりがない場合や、今後のお知らせが不要な場合は、このメールに「配信停止」とご返信ください。",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return { subject: "【Soto Phone】先行予約の登録を受け付けました", text: lines.join("\n"), html: toHtml(lines) };
}

function mailEn(trial) {
  const lines = [
    "Thank you for joining the Soto Phone pre-order list.",
    "",
    "We'll email this address first when it launches.",
    trial ? "We'll also let you know here when prototype trials open." : "",
    "",
    "Registration is free. Nothing is purchased and no payment is taken.",
    "",
    "Joy lives outside the screen.",
    "Soto Phone",
    SITE_URL,
    "",
    "--",
    "You're receiving this because this address was registered for pre-order at " + SITE_URL + ".",
    "If this wasn't you, or you'd rather not hear from us, just reply with \"unsubscribe\".",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return { subject: "Soto Phone: you're on the pre-order list", text: lines.join("\n"), html: toHtml(lines) };
}

// 文字だけの、落ち着いた見た目の HTML メールにする
function toHtml(lines) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = lines.map((l) => (l === "" ? "<br>" : esc(l) + "<br>")).join("");
  return '<div style="font-family:\'Hiragino Sans\',\'Yu Gothic\',sans-serif;font-size:15px;line-height:1.9;color:#1f1e1c;max-width:560px">' + body + "</div>";
}

function getSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else if (sheet.getRange(1, MAIL_COL).getValue() === "") {
    // 前のバージョンで作ったシートには「確認メール」の列がないので、見出しを足す
    sheet.getRange(1, MAIL_COL).setValue(HEADERS[MAIL_COL - 1]);
  }
  return sheet;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
