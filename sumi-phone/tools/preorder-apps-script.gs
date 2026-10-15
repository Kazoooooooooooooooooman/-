/** @OnlyCurrentDoc */
// 先行予約の登録を受け取って、このスプレッドシートに1行ずつ書き込み、登録した人に確認メールを送る Google Apps Script。
// 1行目の @OnlyCurrentDoc で、触れるスプレッドシートをこの1つだけに限っている。
// メールは、このスクリプトを動かしている Google アカウント（あなたの Gmail）から送られる。
// 使い方は README.md の「一般公開して登録を集める」と「登録した人に確認メールを送る」を参照。
// 同じメールアドレスで2回登録された場合は、行を増やさずに最新の内容で上書きし、メールも送り直さない。
// メールの最後には、配信停止とデータ削除のリンクが入る（このウェブアプリの URL に、本人だけが使える印を付けたもの）。

const SHEET_NAME = "先行予約";
const HEADERS = ["登録日時", "メールアドレス", "地域", "言語", "先行体験", "確認メール", "同意", "配信停止", "フォーム", "経路", "参照元", "紹介コード", "紹介した人"];
const MAIL_COL = 6; // 「確認メール」の列（送った日時が入る）
const CONSENT_COL = 7; // 「同意」の列（どの方法で、どの版のプライバシーポリシーに同意したか）
const STOP_COL = 8; // 「配信停止」の列（停止した日時が入る。入っている人には、お知らせを送らない）
// 9〜13列目：どこから来たか。「フォーム」は1枚目（hero）か最後（bottom）か、「経路」はリンクの ?from=（insta、card など）、
// 「参照元」は来る前に見ていたサイト、「紹介コード」はこの人が友だちに送るリンクの印、「紹介した人」はこの人を紹介した人の紹介コード。
// 紹介した人数は、空いている列に =COUNTIF(M:M, L2) と入れると数えられる
const FORM_COL = 9;
const CODE_COL = 12;

// ---- メールの設定（ここだけ書き換えればよい） ----
const SENDER_NAME = "Soto Phone";
const REPLY_TO = ""; // 返信を別のアドレスで受けたいときだけ入れる（空ならこのアカウントに届く）
// 送り主のアドレス。Gmail の「別のアドレスから送信」に登録したエイリアス（例：hello@sotophone.jp）を入れると、そのアドレスから届く。
// 空のままなら、このスクリプトを動かしているアカウントのアドレスから届く。
const FROM_ADDRESS = "hello@sotophone.jp";
const SITE_URL = "https://sotophone.jp/";
// 送り主の情報（特定電子メール法で、お知らせのメールに書く必要がある）。住所は、決まったら入れる（バーチャルオフィスでもよい）
const SENDER_ORG = "Soto Phone（代表 佐々木 一真）";
const SENDER_ADDRESS = "〒107-0062 東京都港区南青山3丁目1番36号 青山丸竹ビル6F";
const CONTACT = "hello@sotophone.jp";
// このウェブアプリの URL（デプロイの画面に出る …/exec）。メールの「配信停止・削除」のリンクに使う。
// Google から自動で取ると空になることがあるので、ここに書いておく。デプロイし直して URL が変わったら、ここも直す
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwa7cTRb-GxlCZKVGaWIP2FuVBQFpsDR7FpMjVoYrGJ9G6EyfLiTS_iIfux6H1iVB0Y/exec";
// 1分あたりに送るメールの上限。いたずらで大量に登録されても、あなたの Gmail から大量に送られないようにする。
// 上限を超えた分は行だけ保存され、sendPendingConfirmations() を動かすと後から送られる。
const MAX_MAILS_PER_MINUTE = 10;

// 返事を返す関数とシートを取る関数は、貼り付けが途中で切れても無くならないよう、いちばん上に置く
function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    // 前のバージョンで作ったシートには、あとから足した列の見出しがないので、足す
    const head = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    head.forEach((v, i) => { if (v === "") sheet.getRange(1, i + 1).setValue(HEADERS[i]); });
  }
  return sheet;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type === "contact") return handleContact(data);
    const email = String(data.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply({ ok: false, error: "bad_email" });

    const sheet = getSheet();
    const lang = data.lang === "en" ? "en" : "ja";
    const trial = data.trial === true;
    const row = [new Date(), email, String(data.prefecture || "").slice(0, 20), lang, trial ? "参加したい" : ""];
    // 同意の記録：下のフォームはチェックボックス、1枚目はフォームの下の案内文。どちらも、どの版のポリシーかを残す
    const consent = (data.consent === "checkbox" ? "チェック" : "案内文") + " / " + String(data.policy || "").slice(0, 20);

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
    sheet.getRange(rowIndex, CONSENT_COL).setValue(consent);
    // 経路と紹介。登録し直した人は、前の経路と紹介コードをそのまま残す（最初に来た経路のほうが大事なため）
    const tag = (v, n) => String(v || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, n);
    const prev = sheet.getRange(rowIndex, FORM_COL, 1, 5).getValues()[0];
    const code = prev[3] || tag(data.code, 12);
    const invitedBy = tag(data.invitedBy, 12);
    sheet.getRange(rowIndex, FORM_COL, 1, 5).setValues([[
      data.source === "hero" ? "1枚目" : "最後",
      prev[1] || tag(data.from, 40),
      prev[2] || tag(data.site, 60),
      code,
      prev[4] || (invitedBy !== code ? invitedBy : ""),
    ]]);
    // 配信を停止していた人が登録し直したら、もう一度お知らせを受け取れるようにする
    sheet.getRange(rowIndex, STOP_COL).setValue("");

    // 確認メールは、まだ送っていない人にだけ送る
    const sentAt = sheet.getRange(rowIndex, MAIL_COL).getValue();
    if (!sentAt && canSendNow()) {
      sendConfirmation(email, lang, trial);
      sheet.getRange(rowIndex, MAIL_COL).setValue(new Date());
    }
    return reply({ ok: true, code: code });
  } catch (err) {
    console.error(err); // Apps Script の「実行数」に原因が残る
    return reply({ ok: false, error: "server" });
  } finally {
    lock.releaseLock();
  }
}

// お問い合わせ：シート「問い合わせ」に1行ずつ残し、このスクリプトを動かしているアカウントにメールで知らせる。
// 返信は、そのメールに「返信」すれば相手に届く（返信先を相手のアドレスにしてある）
const CONTACT_SHEET = "問い合わせ";
const CONTACT_HEADERS = ["受付日時", "用件", "お名前", "メールアドレス", "内容", "言語", "返信"];
function handleContact(data) {
  // 人には見えない欄に何か入っていたら、機械による送信。保存も通知もせず、成功と同じ返事だけ返す
  if (String(data.website || "")) return reply({ ok: true });
  const email = String(data.email || "").trim().toLowerCase();
  const message = String(data.message || "").trim().slice(0, 4000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply({ ok: false, error: "bad_email" });
  if (!message) return reply({ ok: false, error: "empty" });
  const topic = String(data.topic || "").slice(0, 40);
  const name = String(data.name || "").slice(0, 80);
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(CONTACT_SHEET);
  if (!sheet) { sheet = book.insertSheet(CONTACT_SHEET); sheet.appendRow(CONTACT_HEADERS); sheet.setFrozenRows(1); }
  // 先頭が = + - @ の内容は、スプレッドシートが式として読まないように ' を付ける
  const safe = (v) => /^[=+\-@]/.test(v) ? "'" + v : v;
  sheet.appendRow([new Date(), safe(topic), safe(name), email, safe(message), data.lang === "en" ? "en" : "ja", ""]);
  if (canSendNow()) {
    const to = Session.getEffectiveUser().getEmail();
    const body = ["用件：" + topic, "お名前：" + (name || "（なし）"), "メールアドレス：" + email, "", message, "", "――", "このメールに返信すると、" + email + " に届きます。"].join("\n");
    MailApp.sendEmail({ to: to, replyTo: email, subject: "【Soto Phone 問い合わせ】" + topic + "（" + (name || email) + "）", body: body, name: SENDER_NAME });
  }
  return reply({ ok: true });
}

// サイトに出す登録人数。水増しにならないよう、次の条件をすべて満たす人だけを数える。
// ・確認メールを送れた（「確認メール」に日時が入っている）・配信を止めていない・テストの登録ではない（経路が test でない）
// ・同じアドレスは1人。サイトを開くたびにシートを読まないよう、10分間は覚えておく
function verifiedCount() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get("verifiedCount");
  if (hit !== null) return Number(hit);
  const sheet = getSheet();
  const last = sheet.getLastRow();
  let n = 0;
  if (last > 1) {
    const rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
    const seen = {};
    rows.forEach((r) => {
      const email = String(r[1] || "").trim().toLowerCase();
      if (!email || seen[email] || !r[MAIL_COL - 1] || r[STOP_COL - 1] || String(r[9] || "") === "test") return;
      seen[email] = true;
      n++;
    });
  }
  cache.put("verifiedCount", String(n), 600);
  return n;
}

// ウェブアプリの URL を開いたとき
// ・何も付けずに開く：登録数を返す（count は確認メールが届いた人の数でサイトに出す数、rows はシートの行数）
// ・メールの「配信停止・データ削除」のリンクから開く：確認の画面を出し、ボタンを押したら停止または削除する
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.e) return reply({ count: verifiedCount(), rows: Math.max(getSheet().getLastRow() - 1, 0) });
  const email = String(p.e).trim().toLowerCase();
  const en = p.l === "en";
  if (p.t !== tokenFor(email)) return page(en ? "This link is not valid." : "このリンクは使えません。", en ? "Please contact " + CONTACT + "." : CONTACT + " までご連絡ください。", en);
  const base = WEB_APP_URL + "?e=" + encodeURIComponent(email) + "&t=" + p.t + (en ? "&l=en" : "");
  // メールのリンクを自動で開くセキュリティ機能があるので、リンクを開いただけでは何もせず、ボタンを押したときだけ実行する
  if (p.do === "stop" || p.do === "delete") {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getSheet();
      const last = sheet.getLastRow();
      const emails = last > 1 ? sheet.getRange(2, 2, last - 1, 1).getValues().flat() : [];
      const found = emails.indexOf(email);
      if (found >= 0 && p.do === "delete") sheet.deleteRow(found + 2);
      if (found >= 0 && p.do === "stop") sheet.getRange(found + 2, STOP_COL).setValue(new Date());
    } finally {
      lock.releaseLock();
    }
    return p.do === "delete"
      ? page(en ? "Your data has been deleted." : "登録情報を削除しました。", en ? "We've deleted your email address and everything you registered. You won't hear from us again." : "メールアドレスと登録された内容を、すべて削除しました。今後、メールが届くことはありません。", en)
      : page(en ? "You've been unsubscribed." : "配信を停止しました。", en ? "You won't receive any more emails from Soto Phone." : "Soto Phone からのお知らせは、今後届きません。", en);
  }
  return page(
    en ? "Unsubscribe or delete your data" : "配信の停止・登録情報の削除",
    (en ? "Email: " : "メールアドレス：") + email,
    en,
    [[base + "&do=stop", en ? "Stop emails" : "配信を停止する"], [base + "&do=delete", en ? "Delete all my data" : "登録情報をすべて削除する"]]
  );
}

// 本人のメールに入れるための印。秘密の鍵はスクリプトのプロパティに自動で作って保存する
function tokenFor(email) {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty("LINK_KEY");
  if (!key) { key = Utilities.getUuid() + Utilities.getUuid(); props.setProperty("LINK_KEY", key); }
  const sig = Utilities.computeHmacSha256Signature(email, key);
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, "").slice(0, 32);
}

function manageUrl(email, lang) {
  return WEB_APP_URL + "?e=" + encodeURIComponent(email) + "&t=" + tokenFor(email) + (lang === "en" ? "&l=en" : "");
}

// 確認や完了を伝える、文字だけの小さな画面
function page(title, text, en, buttons) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const btns = (buttons || []).map(([href, label]) => '<p><a target="_top" href="' + esc(href) + '" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#1f1e1c;color:#fff;text-decoration:none">' + esc(label) + "</a></p>").join("");
  const html = '<div style="font-family:sans-serif;max-width:520px;margin:48px auto;padding:0 20px;line-height:1.9;color:#1f1e1c"><h1 style="font-size:20px;font-weight:600">' + esc(title) + "</h1><p>" + esc(text) + "</p>" + btns + '<p style="margin-top:32px;font-size:13px;color:#666">Soto Phone · ' + esc(CONTACT) + "</p></div>";
  return HtmlService.createHtmlOutput(html).setTitle("Soto Phone").addMetaTag("viewport", "width=device-width, initial-scale=1");
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
    const stopped = sheet.getRange(i + 2, STOP_COL).getValue();
    if (!email || sentAt || stopped || !canSendNow()) return;
    sendConfirmation(email, lang, trial);
    sheet.getRange(i + 2, MAIL_COL).setValue(new Date());
  });
}

// 届くメールを自分で確かめる用。Apps Script の画面でこの関数を選んで「実行」すると、自分あてに日本語版が届く。
function testSendToMe() {
  sendConfirmation(Session.getEffectiveUser().getEmail(), "ja", true);
}

function sendConfirmation(email, lang, trial) {
  const link = manageUrl(email, lang);
  const m = lang === "en" ? mailEn(trial, link) : mailJa(trial, link);
  if (FROM_ADDRESS) {
    // エイリアスから送れるのは GmailApp だけ（MailApp は自分のアドレスからしか送れない）
    const opts = { htmlBody: m.html, name: SENDER_NAME, from: FROM_ADDRESS };
    if (REPLY_TO) opts.replyTo = REPLY_TO;
    GmailApp.sendEmail(email, m.subject, m.text, opts);
    return;
  }
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

function mailJa(trial, link) {
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
    "配信の停止・登録情報の削除：" + link,
    "（お心当たりがない場合も、こちらから削除できます）",
    "",
    "送信者：" + SENDER_ORG,
    SENDER_ADDRESS ? "所在地：" + SENDER_ADDRESS : null,
    "お問い合わせ：" + CONTACT,
    "プライバシーポリシー：" + SITE_URL + "privacy.html",
  ].filter((l) => l !== null).filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return { subject: "【Soto Phone】先行予約の登録を受け付けました", text: lines.join("\n"), html: toHtml(lines) };
}

function mailEn(trial, link) {
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
    "Unsubscribe or delete your data: " + link,
    "(If this wasn't you, you can delete it there too.)",
    "",
    "Sender: Soto Phone (Kazuma Sasaki)",
    "Address: 6F Aoyama Marutake Bldg., 3-1-36 Minami-Aoyama, Minato-ku, Tokyo 107-0062, Japan",
    "Contact: " + CONTACT,
    "Privacy policy: " + SITE_URL + "privacy-en.html",
  ].filter((l) => l !== null).filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return { subject: "Soto Phone: you're on the pre-order list", text: lines.join("\n"), html: toHtml(lines) };
}

// 文字だけの、落ち着いた見た目の HTML メールにする
function toHtml(lines) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 長い URL は、押せるリンクにする
  const link = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => '<a href="' + u + '" style="color:#1f1e1c">' + u + "</a>");
  const body = lines.map((l) => (l === "" ? "<br>" : link(l) + "<br>")).join("");
  return '<div style="font-family:\'Hiragino Sans\',\'Yu Gothic\',sans-serif;font-size:15px;line-height:1.9;color:#1f1e1c;max-width:560px">' + body + "</div>";
}
