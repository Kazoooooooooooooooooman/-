/** @OnlyCurrentDoc */
// 先行予約の登録を受け取って、このスプレッドシートに1行ずつ書き込み、登録した人に確認メールを送る Google Apps Script。
// 1行目の @OnlyCurrentDoc で、触れるスプレッドシートをこの1つだけに限っている。
// メールは、このスクリプトを動かしている Google アカウント（あなたの Gmail）から送られる。
// 使い方は README.md の「一般公開して登録を集める」と「登録した人に確認メールを送る」を参照。
// 同じメールアドレスで2回登録された場合は、行を増やさずに最新の内容で上書きし、メールも送り直さない。
// メールの最後には、配信停止とデータ削除のリンクが入る（このウェブアプリの URL に、本人だけが使える印を付けたもの）。

const SHEET_NAME = "先行予約";
const HEADERS = ["登録日時", "メールアドレス", "地域", "言語", "先行体験", "確認メール", "同意", "配信停止", "フォーム", "経路", "参照元", "紹介コード", "紹介した人", "番号"];
const MAIL_COL = 6; // 「確認メール」の列（送った日時が入る）
const CONSENT_COL = 7; // 「同意」の列（どの方法で、どの版のプライバシーポリシーに同意したか）
const STOP_COL = 8; // 「配信停止」の列（停止した日時が入る。入っている人には、お知らせを送らない）
// 9〜13列目：どこから来たか。「フォーム」は1枚目（hero）か最後（bottom）か、「経路」はリンクの ?from=（insta、card など）、
// 「参照元」は来る前に見ていたサイト、「紹介コード」はこの人が友だちに送るリンクの印、「紹介した人」はこの人を紹介した人の紹介コード。
// 紹介した人数は、空いている列に =COUNTIF(M:M, L2) と入れると数えられる
const FORM_COL = 9;
const CODE_COL = 12;
// 14列目「番号」：登録した順に1から付ける番号（No.001 のように見せる）。登録し直しても変わらない
const NUM_COL = 14;

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
    if (data.type === "view") return handleView(data);
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
      (data.source === "hero" ? "1枚目" : "最後") + (variantTag(data.variant) ? "・" + variantTag(data.variant) : ""),
      prev[1] || tag(data.from, 40),
      prev[2] || tag(data.site, 60),
      code,
      prev[4] || (invitedBy !== code ? invitedBy : ""),
    ]]);
    // 番号：まだない人にだけ付ける（登録し直した人は、前の番号のまま）
    let number = Number(sheet.getRange(rowIndex, NUM_COL).getValue()) || 0;
    if (!number) {
      number = nextNumber(sheet);
      sheet.getRange(rowIndex, NUM_COL).setValue(number);
    }
    // 配信を停止していた人が登録し直したら、もう一度お知らせを受け取れるようにする
    sheet.getRange(rowIndex, STOP_COL).setValue("");

    // 確認メールは、まだ送っていない人にだけ送る
    const sentAt = sheet.getRange(rowIndex, MAIL_COL).getValue();
    if (!sentAt && canSendNow()) {
      sendConfirmation(email, lang, trial, number);
      sheet.getRange(rowIndex, MAIL_COL).setValue(new Date());
    }
    return reply({ ok: true, code: code, number: number });
  } catch (err) {
    console.error(err); // Apps Script の「実行数」に原因が残る
    return reply({ ok: false, error: "server" });
  } finally {
    lock.releaseLock();
  }
}

// 1枚目のパターン（a・b・c、URL で選んで見た人は a-url のように）を、記号だけに整える
function variantTag(v) {
  return String(v || "").toLowerCase().replace(/[^a-z-]/g, "").slice(0, 8);
}

// 1枚目のパターンごとに、見た人の数を数える。シート「表示」に「日付・パターン・人数」を1行ずつ。
// 同じブラウザからは1日1回しか届かないので、人数はおおよその訪問者数になる。
// 登録率 ＝ 「先行予約」シートの「フォーム」列でそのパターンを数えた数 ÷ ここの人数の合計
const VIEW_SHEET = "表示";
function handleView(data) {
  const v = variantTag(data.variant);
  if (!v) return reply({ ok: false });
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(VIEW_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(VIEW_SHEET);
    sheet.appendRow(["日付", "パターン", "人数"]);
    sheet.setFrozenRows(1);
  }
  const day = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  const last = sheet.getLastRow();
  const rows = last > 1 ? sheet.getRange(2, 1, last - 1, 2).getDisplayValues() : [];
  for (let i = rows.length - 1; i >= 0 && i >= rows.length - 40; i--) {
    if (rows[i][0] === day && rows[i][1] === v) {
      const cell = sheet.getRange(i + 2, 3);
      cell.setValue(Number(cell.getValue() || 0) + 1);
      return reply({ ok: true });
    }
  }
  sheet.appendRow(["'" + day, v, 1]); // 先頭の ' で、日付ではなく文字として残す（探すときに見た目のまま比べるため）
  return reply({ ok: true });
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

// 次の番号。シートの「番号」の列でいちばん大きい数に1を足す（行を消しても、同じ番号は使い回さない）
function nextNumber(sheet) {
  const props = PropertiesService.getScriptProperties();
  const last = sheet.getLastRow();
  const nums = last > 1 ? sheet.getRange(2, NUM_COL, last - 1, 1).getValues().flat().map(Number).filter((n) => n > 0) : [];
  const n = Math.max(Number(props.getProperty("LAST_NUMBER") || 0), nums.length ? Math.max.apply(null, nums) : 0) + 1;
  props.setProperty("LAST_NUMBER", String(n));
  return n;
}

// 番号を付ける前に登録した人に、登録した順で番号を付ける。Apps Script の画面でこの関数を選んで、一度だけ「実行」する
function assignMissingNumbers() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return;
  const rows = sheet.getRange(2, 1, last - 1, NUM_COL).getValues()
    .map((r, i) => ({ row: i + 2, at: new Date(r[0]).getTime() || 0, num: Number(r[NUM_COL - 1]) || 0 }))
    .filter((r) => !r.num)
    .sort((a, b) => a.at - b.at);
  rows.forEach((r) => sheet.getRange(r.row, NUM_COL).setValue(nextNumber(sheet)));
}

// 番号の見せ方：No.007
function numberLabel(n) {
  return "No." + String(n).padStart(3, "0");
}

// 確認メールを送れなかった人（上限に達したときなど）に、まとめて送る。
// Apps Script の画面でこの関数を選んで「実行」するか、時間主導のトリガーで1時間ごとに動かす。
function sendPendingConfirmations() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return;
  const rows = sheet.getRange(2, 1, last - 1, NUM_COL).getValues();
  rows.forEach((r, i) => {
    const email = r[1], lang = r[3] === "en" ? "en" : "ja", trial = r[4] === "参加したい", sentAt = r[5];
    const stopped = sheet.getRange(i + 2, STOP_COL).getValue();
    if (!email || sentAt || stopped || !canSendNow()) return;
    let number = Number(r[NUM_COL - 1]) || 0;
    if (!number) { number = nextNumber(sheet); sheet.getRange(i + 2, NUM_COL).setValue(number); }
    sendConfirmation(email, lang, trial, number);
    sheet.getRange(i + 2, MAIL_COL).setValue(new Date());
  });
}

// 届くメールを自分で確かめる用。Apps Script の画面でこの関数を選んで「実行」すると、自分あてに日本語版が届く。
function testSendToMe() {
  sendConfirmation(Session.getEffectiveUser().getEmail(), "ja", true, 7);
}

function sendConfirmation(email, lang, trial, number) {
  const link = manageUrl(email, lang);
  const m = lang === "en" ? mailEn(trial, link, number) : mailJa(trial, link, number);
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

function mailJa(trial, link, number) {
  // 短く、急かさない。伝えるのは「番号」「これから何が届くか」「刻印」の3つだけ
  const lines = [
    "ご登録、ありがとうございます。",
    number ? "あなたの番号は " + numberLabel(number) + " です。" : null,
    "",
    "これから月に1回、開発の様子を",
    "短い手紙にしてお送りします。",
    trial ? "試作機を使ってもらう会を開くときも、ここからお声がけします。" : null,
    "",
    "完成したら、いちばん先にお見せします。",
    number && number <= 300 ? "No.300 までの方は、" : null,
    number && number <= 300 ? "ご希望で本体に番号を刻めます。" : null,
    "",
    "楽しさは、画面の外に。",
    "佐々木 一真（Soto Phone）",
    "",
    "――",
    "このメールは、sotophone.jp で登録された方にお送りしています。",
    "配信の停止・登録情報の削除：" + link,
    "送信者：" + SENDER_ORG,
    SENDER_ADDRESS ? "所在地：" + SENDER_ADDRESS : null,
    "お問い合わせ：" + CONTACT,
    "プライバシーポリシー：" + SITE_URL + "privacy",
  ].filter((l) => l !== null).filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return { subject: number ? "Soto Phone｜" + numberLabel(number) + " で受け付けました" : "Soto Phone｜受け付けました", text: lines.join("\n"), html: toHtml(lines, number, "あなたの番号") };
}

function mailEn(trial, link, number) {
  const lines = [
    "Thanks for signing up.",
    number ? "Your number is " + numberLabel(number) + "." : null,
    "",
    "Once a month, we'll send you a short letter",
    "about how the phone is coming along.",
    trial ? "We'll also reach out here when we invite people to try a prototype." : null,
    "",
    "When it's finished, you'll see it first.",
    number && number <= 300 ? "Numbers up to No.300 can be engraved" : null,
    number && number <= 300 ? "on the phone if you'd like." : null,
    "",
    "Joy lives outside the screen.",
    "Kazuma Sasaki (Soto Phone)",
    "",
    "--",
    "You're receiving this because this address was registered at " + SITE_URL + ".",
    "Unsubscribe or delete your data: " + link,
    "Sender: Soto Phone (Kazuma Sasaki)",
    "Address: 6F Aoyama Marutake Bldg., 3-1-36 Minami-Aoyama, Minato-ku, Tokyo 107-0062, Japan",
    "Contact: " + CONTACT,
    "Privacy policy: " + SITE_URL + "privacy-en",
  ].filter((l) => l !== null).filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return { subject: number ? "Soto Phone | You're " + numberLabel(number) : "Soto Phone | You're in", text: lines.join("\n"), html: toHtml(lines, number, "Your number") };
}

// 文字だけの、落ち着いた見た目の HTML メールにする
// 番号があるときは、本文の上に「先行予約券」のきっぷを置く（サイトの登録済みカードと同じ見た目）。
// メールの画面では細かい CSS が効かないことが多いので、表（table）で組み、背景の絵は紙の色に混ぜ済みの画像を使う
function toHtml(lines, number, cardLabel) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 長い URL は、押せるリンクにする
  const link = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => '<a href="' + u + '" style="color:#1f1e1c">' + u + "</a>");
  const en = cardLabel === "Your number";
  const d = new Date();
  const day = d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  const ink = "#7a6f58";
  const card = number
    ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:440px;margin:0 0 24px;border-collapse:separate;border-radius:14px;background:#f3ecdc"><tr>'
      + '<td background="' + SITE_URL + 'images/ticket-river.jpg" bgcolor="#f3ecdc" style="padding:16px 18px;border-radius:14px 0 0 14px;background:#f3ecdc url(' + SITE_URL + 'images/ticket-river.jpg) center/cover no-repeat;border-right:2px dashed #cbbf9f;vertical-align:top">'
      + '<div style="font:500 10px Helvetica,Arial,sans-serif;letter-spacing:.22em;color:' + ink + '">SOTO PHONE</div>'
      + '<div style="margin-top:18px;font-family:\'Hiragino Mincho ProN\',\'Yu Mincho\',Georgia,serif;font-size:21px;font-weight:600;letter-spacing:.12em;color:#1f1e1c">' + (en ? "Pre-order ticket" : "先行予約券") + "</div>"
      + '<div style="margin-top:2px;font-size:11px;color:' + ink + '">' + (en ? "See the finished phone first." : "完成品を、いちばん先に。") + "</div>"
      + '<div style="margin-top:18px;font:500 10.5px Helvetica,Arial,sans-serif;color:' + ink + '">' + day + (en ? " issued" : " 発行") + "</div></td>"
      + '<td width="92" align="center" style="width:92px;padding:12px 4px;vertical-align:middle;text-align:center">'
      + '<div style="font:500 10px Helvetica,Arial,sans-serif;letter-spacing:.2em;color:' + ink + '">NO.</div>'
      + '<div style="font-family:Georgia,serif;font-size:30px;font-weight:600;line-height:1.2;color:#1f1e1c">' + String(number).padStart(3, "0") + "</div>"
      + '<div style="font-size:10.5px;color:' + ink + '">' + (en ? "Pre-order" : "先行予約") + "</div></td></tr></table>"
    : "";
  // 本文は、空行で区切った段落ごとに間をあける。「――」より下（送信者や配信停止）は、小さく薄く
  const cut = lines.findIndex((l) => l === "――" || l === "--");
  const main = cut >= 0 ? lines.slice(0, cut) : lines, foot = cut >= 0 ? lines.slice(cut + 1) : [];
  const paras = main.join("\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const bodyHtml = paras.map((p) => '<p style="margin:0 0 22px">' + p.split("\n").map(link).join("<br>") + "</p>").join("");
  const footHtml = foot.length ? '<div style="margin-top:36px;padding-top:14px;border-top:1px solid #e4e0d6;font-size:11px;line-height:1.8;color:#8a857b">' + foot.map(link).join("<br>") + "</div>" : "";
  return '<div style="font-family:\'Hiragino Sans\',\'Yu Gothic\',sans-serif;font-size:15px;line-height:1.9;letter-spacing:.02em;color:#1f1e1c;max-width:480px">' + card + bodyHtml + footHtml + "</div>";
}
