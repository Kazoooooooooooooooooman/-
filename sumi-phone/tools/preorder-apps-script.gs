/** @OnlyCurrentDoc */
// 先行予約の登録を受け取って、このスプレッドシートに1行ずつ書き込み、登録した人に確認メールを送る Google Apps Script。
// 1行目の @OnlyCurrentDoc で、触れるスプレッドシートをこの1つだけに限っている。
// メールは、このスクリプトを動かしている Google アカウント（あなたの Gmail）から送られる。
// 使い方は README.md の「一般公開して登録を集める」と「登録した人に確認メールを送る」を参照。
// 同じメールアドレスで2回登録された場合は、行を増やさずに最新の内容で上書きし、メールも送り直さない。
// メールの最後には、配信停止とデータ削除のリンクが入る（このウェブアプリの URL に、本人だけが使える印を付けたもの）。

const SHEET_NAME = "先行予約";
const HEADERS = ["登録日時", "メールアドレス", "地域", "言語", "先行体験", "確認メール", "同意", "配信停止", "フォーム", "経路", "参照元", "紹介コード", "紹介した人", "番号",
  "端末", "OS", "ブラウザ", "アプリ内", "画面", "表示域", "端末の言語", "時間帯", "表示モード", "登録した時刻", "登録までの秒数", "utm"];
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
// 15〜26列目：登録したときの環境（端末の種類、OS・ブラウザとその版、アプリの中のブラウザか、画面の大きさなど）
const DEVICE_COL = 15;
const DEVICE_KEYS = ["type", "os", "browser", "app", "screen", "viewport", "lang", "tz", "dark", "hour", "seconds", "utm"];
// 環境の値は、短い文字だけにして残す（数式として読まれないよう、先頭の = + - @ は外す）
function devValues(d) {
  d = d && typeof d === "object" ? d : {};
  return DEVICE_KEYS.map((k) => String(d[k] === undefined || d[k] === null ? "" : d[k]).replace(/^[=+\-@]+/, "").slice(0, 40));
}

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
    // 列が足りないシート（使わない列を消したものなど）には、先に列を足す。足りないと書き込みが失敗する
    const need = HEADERS.length - sheet.getMaxColumns();
    if (need > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), need);
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
    if (data.type === "stay") return handleStay(data);
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
    emailChip(sheet, rowIndex, email);
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
    sheet.getRange(rowIndex, DEVICE_COL, 1, DEVICE_KEYS.length).setValues([devValues(data.device)]);
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
      sendConfirmation(email, lang, trial, number, variantTag(data.variant), code);
      sheet.getRange(rowIndex, MAIL_COL).setValue(new Date());
      // 紹介リンクから来た人なら、紹介した人に「1名ご登録くださいました」と報告する（初めての登録のときだけ）
      const by = prev[4] || (invitedBy !== code ? invitedBy : "");
      if (by && String(prev[1] || tag(data.from, 40)) !== "test") {
        try { notifyReferrer(sheet, by); } catch (err) { console.error("紹介の報告に失敗：" + err); }
      }
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

// 1枚目のパターンごとに、見た人の数を数える（同じブラウザからは1日1回だけ届く）。
// シート「表示」：日付・パターン・端末ごとの人数（すぐ見る用）
// シート「表示ログ」：1回ごとに1行。環境をすべて残す（ピボットテーブルで、OS別・アプリ内ブラウザ別なども見られる）
// 登録率 ＝ 「先行予約」シートの「フォーム」列でそのパターンを数えた数 ÷ 「表示」の人数の合計
const VIEW_SHEET = "表示";
const VIEW_LOG_SHEET = "表示ログ";
const VIEW_LOG_HEADERS = ["日時", "パターン", "経路", "参照元", "端末", "OS", "ブラウザ", "アプリ内", "画面", "表示域", "端末の言語", "時間帯", "表示モード", "時刻", "秒", "utm"];
function handleView(data) {
  const v = variantTag(data.variant);
  if (!v) return reply({ ok: false });
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const dev = devValues(data.device);
  const type = dev[0] || "不明";
  const tag = (x, n) => String(x || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, n);

  let sheet = book.getSheetByName(VIEW_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(VIEW_SHEET);
    sheet.appendRow(["日付", "パターン", "端末", "人数"]);
    sheet.setFrozenRows(1);
  } else if (sheet.getRange(1, 3).getValue() === "人数") {
    // 前の版（日付・パターン・人数）のシートには、「端末」の列を足す
    sheet.insertColumnAfter(2);
    sheet.getRange(1, 3).setValue("端末");
    const n = sheet.getLastRow() - 1;
    if (n > 0) sheet.getRange(2, 3, n, 1).setValue("不明");
  }
  const day = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  const last = sheet.getLastRow();
  const rows = last > 1 ? sheet.getRange(2, 1, last - 1, 3).getDisplayValues() : [];
  let done = false;
  for (let i = rows.length - 1; i >= 0 && i >= rows.length - 60; i--) {
    if (rows[i][0] === day && rows[i][1] === v && rows[i][2] === type) {
      const cell = sheet.getRange(i + 2, 4);
      cell.setValue(Number(cell.getValue() || 0) + 1);
      done = true;
      break;
    }
  }
  if (!done) sheet.appendRow(["'" + day, v, type, 1]); // 先頭の ' で、日付ではなく文字として残す

  let log = book.getSheetByName(VIEW_LOG_SHEET);
  if (!log) {
    log = book.insertSheet(VIEW_LOG_SHEET);
    log.appendRow(VIEW_LOG_HEADERS);
    log.setFrozenRows(1);
  }
  // 並びは VIEW_LOG_HEADERS と同じ（devValues の最後の「秒」は、見ただけのときは空）
  log.appendRow([new Date(), v, tag(data.from, 40), tag(data.site, 60)].concat(dev));
  return reply({ ok: true });
}

// 1回の訪問で、どれだけ見てもらえたか。シート「滞在ログ」に、訪問ごとに1行（同じ訪問の続きが届いたら、その行を新しい値に直す）
const STAY_SHEET = "滞在ログ";
const STAY_HEADERS = ["日時", "訪問", "パターン", "経路", "見ていた秒数", "スクロール（％）", "いちばん奥の節", "登録欄に触れた", "ボタンを押した", "登録した",
  "端末", "OS", "ブラウザ", "アプリ内", "画面", "表示域", "端末の言語", "時間帯", "表示モード", "時刻", "紹介の共有"];
function handleStay(data) {
  const v = variantTag(data.variant);
  const visit = String(data.visit || "").replace(/[^0-9a-f]/g, "").slice(0, 16);
  if (!v || !visit) return reply({ ok: false });
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(STAY_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(STAY_SHEET);
    sheet.appendRow(STAY_HEADERS);
    sheet.setFrozenRows(1);
  }
  const yes = (x) => (x === true ? "はい" : "");
  // この訪問で登録したら「はい」。前に登録した人が開き直したときは「登録済み・再訪◯回目」
  const regText = (x) => {
    if (x === true) return "はい";
    const m = /^again:(\d{1,4})$/.exec(String(x || ""));
    return m ? "登録済み・再訪" + m[1] + "回目" : "";
  };
  const num = (x, max) => Math.max(0, Math.min(max, Math.round(Number(x) || 0)));
  const row = [new Date(), visit, v, String(data.from || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40),
    num(data.seconds, 86400), num(data.scroll, 100), String(data.deepest || "").slice(0, 12),
    yes(data.touched), yes(data.pressed), regText(data.registered)].concat(devValues(data.device).slice(0, 10));
  // 登録後に押した共有のボタン：LINE（LINE で送る）・共有画面（友だちに教える）・コピー（共有画面が出ない端末）
  const SHARE_JA = { line: "LINE", sheet: "共有画面", copy: "コピー" };
  row.push(String(data.shared || "").split(",").map((k) => SHARE_JA[k]).filter(Boolean).join("・"));
  if (sheet.getRange(1, STAY_HEADERS.length).getValue() === "") sheet.getRange(1, STAY_HEADERS.length).setValue(STAY_HEADERS[STAY_HEADERS.length - 1]);
  const last = sheet.getLastRow();
  const from = Math.max(2, last - 300);
  if (last >= 2) {
    const ids = sheet.getRange(from, 2, last - from + 1, 1).getValues().flat();
    const i = ids.lastIndexOf(visit);
    if (i >= 0) { sheet.getRange(from + i, 1, 1, row.length).setValues([row]); return reply({ ok: true }); }
  }
  sheet.appendRow(row);
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
    sendConfirmation(email, lang, trial, number, String(r[FORM_COL - 1] || "").split("・")[1] || "", String(r[FORM_COL + 2] || ""));
    sheet.getRange(i + 2, MAIL_COL).setValue(new Date());
  });
}

// 届くメールを自分で確かめる用。Apps Script の画面でこの関数を選んで「実行」すると、自分あてに日本語版が届く。
function testSendToMe() {
  sendConfirmation(Session.getEffectiveUser().getEmail(), "ja", true, 7, "", "abc123");
}

function sendConfirmation(email, lang, trial, number, variant, code) {
  const link = manageUrl(email, lang);
  const m = lang === "en" ? mailEn(trial, link, number, code) : mailJa(trial, link, number, variant, code);
  sendMail(email, m);
}

// 送る仕組みを1か所にまとめる（エイリアスから送れるのは GmailApp だけ。MailApp は自分のアドレスからしか送れない）
function sendMail(email, m) {
  if (FROM_ADDRESS) {
    const opts = { htmlBody: m.html, name: SENDER_NAME, from: FROM_ADDRESS };
    if (REPLY_TO) opts.replyTo = REPLY_TO;
    GmailApp.sendEmail(email, m.subject, m.text, opts);
    return;
  }
  const options = { to: email, subject: m.subject, body: m.text, htmlBody: m.html, name: SENDER_NAME };
  if (REPLY_TO) options.replyTo = REPLY_TO;
  MailApp.sendEmail(options);
}

// ── 紹介 ─────────────────────────────────────────────
// 御礼：1名で試作機の先行体験に優先して招待、10名でアルミマイボトル（先着100名様）、30名で初代 限定Tシャツ（先着10名様）。
// 数えるのは verifiedCount と同じ条件（確認メールが届いた・配信を止めていない・テストでない・同じアドレスは1人）の登録だけ。
const REF_TIERS = [
  { n: 10, cap: 100, ja: "Soto オリジナル アルミマイボトル", en: "a Soto aluminum bottle" },
  { n: 30, cap: 10, ja: "Soto 初代 限定Tシャツ", en: "a first-edition Soto T-shirt" },
];
function referralCounts(sheet) {
  const last = sheet.getLastRow();
  const counts = {}, owner = {};
  if (last < 2) return { counts, owner };
  const rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const seen = {};
  rows.forEach((r) => {
    const email = String(r[1] || "").trim().toLowerCase();
    const ok = email && r[MAIL_COL - 1] && !r[STOP_COL - 1] && String(r[FORM_COL] || "") !== "test";
    const code = String(r[FORM_COL + 2] || ""), by = String(r[FORM_COL + 3] || "");
    if (ok && code && !owner[code]) owner[code] = { email, lang: String(r[3] || "ja") === "en" ? "en" : "ja" };
    if (!ok || seen[email]) return;
    seen[email] = true;
    if (by) counts[by] = (counts[by] || 0) + 1;
  });
  return { counts, owner };
}

function notifyReferrer(sheet, by) {
  const { counts, owner } = referralCounts(sheet);
  const who = owner[by];
  const n = counts[by] || 0;
  if (!who || !n || !canSendNow()) return;
  // 先着の枠：この段に届いた人を数え、届いた順（いまの人がちょうど届いたかどうか）で判断する
  const reached = (t) => Object.keys(counts).filter((c) => counts[c] >= t.n).length;
  const tiers = REF_TIERS.map((t) => ({ t, hit: n === t.n, full: reached(t) > t.cap }));
  const next = REF_TIERS.find((t) => n < t.n && reached(t) < t.cap);
  sendMail(who.email, who.lang === "en" ? refMailEn(n, tiers, next) : refMailJa(n, tiers, next));
  // 品物を送る段に届いたら、運営にも知らせる（送り先をうかがう連絡は、運営から手で送る）
  tiers.filter((x) => x.hit && !x.full).forEach((x) => {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), "【Soto Phone 紹介】" + x.t.ja + " の対象になりました",
      who.email + " さんのご紹介が " + n + "名 になりました。" + x.t.ja + "（先着" + x.t.cap + "名様）の対象です。\nお届け先をおうかがいするご連絡を送ってください。");
  });
}

function refMailJa(n, tiers, next) {
  const hit = tiers.find((x) => x.hit);
  const lines = [
    "いつも Soto Phone を応援いただき、誠にありがとうございます。",
    "",
    "あなたがご紹介くださったリンクから、",
    "お一人の方が先行予約にご登録くださいました。",
    "これまでにご紹介いただいた方は、合わせて " + n + "名 です。",
    "",
    n === 1 ? "御礼として、試作機の先行体験に優先してご招待いたします。" : null,
    n === 1 ? "開催が決まりましたら、このメールアドレスにご案内をお送りします。" : null,
    hit && !hit.full ? "御礼として、" + hit.t.ja + "をお贈りいたします。" : null,
    hit && !hit.full ? "お届け先をおうかがいするご連絡を、改めてお送りいたします。" : null,
    hit && hit.full ? hit.t.ja + "は、先着" + hit.t.cap + "名様の枠が埋まってしまいました。申し訳ございません。" : null,
    next && (n === 1 || hit) ? "" : null,
    next ? next.ja + "のお届けまで、あと " + (next.n - n) + "名 です。" : null,
    "",
    "「欲しいと思ってくださる方がいる」という数字は、",
    "私たちが開発を進めるうえで、何よりの力になります。",
    "心より御礼申し上げます。",
    "",
    "次にご登録があった際も、このメールでご報告いたします。",
    "",
    "Soto Phone 代表　佐々木 一真",
    "",
    "――",
    "このメールは、sotophone.jp で先行予約にご登録いただいた方にお送りしています。",
    "お問い合わせ：" + CONTACT,
  ].filter((l) => l !== null).filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return { subject: "Soto Phone | ご紹介いただいた方が、先行予約にご登録くださいました", text: lines.join("\n"), html: toHtml(lines, 0, { en: false }) };
}

function refMailEn(n, tiers, next) {
  const hit = tiers.find((x) => x.hit);
  const lines = [
    "Thank you for supporting Soto Phone.",
    "",
    "Someone you referred has just joined the pre-order list.",
    "You have now referred " + n + (n === 1 ? " person." : " people."),
    "",
    n === 1 ? "As a thank-you, we'll invite you first to try a prototype." : null,
    n === 1 ? "We'll write to this address once the date is set." : null,
    hit && !hit.full ? "As a thank-you, we'll send you " + hit.t.en + "." : null,
    hit && !hit.full ? "We'll email you separately to ask for your shipping address." : null,
    hit && hit.full ? "We're sorry: the first " + hit.t.cap + " spots for " + hit.t.en + " have been taken." : null,
    next && (n === 1 || hit) ? "" : null,
    next ? (next.n - n) + " more to go until " + next.en + "." : null,
    "",
    "Every person who wants this phone helps us keep building it.",
    "Thank you, truly.",
    "",
    "We'll let you know here each time someone else joins through your link.",
    "",
    "Kazuma Sasaki, Founder, Soto Phone",
    "",
    "--",
    "You're receiving this because you joined the pre-order list at " + SITE_URL + ".",
    "Contact: " + CONTACT,
  ].filter((l) => l !== null).filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return { subject: "Soto Phone | Someone you referred has joined", text: lines.join("\n"), html: toHtml(lines, 0, { en: true }) };
}

// 文字だけのメールでは、[[REF]] の行を「ご紹介のお願い」の文に置きかえる
function refText(lines, block, numLine) {
  const out = [];
  lines.forEach((l) => { if (l === "[[REF]]") out.push(...block.slice(0, -1)); else if (l === "[[TICKET]]") { if (numLine) out.push(numLine); } else out.push(l); });
  return out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

// HTML のメールに入れる「ご紹介のお願い」の枠。サイトの登録直後の画面（script.js の done-ask）と同じ見た目にする：
// 白い枠・中央そろえ・言葉の切れ目で改行・御礼の表、その下に「LINE で送る」ボタン（送る文とリンクが入った状態で LINE が開く）
function refCard(code, en) {
  if (!code) return "";
  const ent = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/[^\x00-\x7f]/g, (c) => "&#" + c.codePointAt(0) + ";");
  const url = SITE_URL + (en ? "en" : "") + "?r=" + code;
  const msg = en
    ? "I just joined the free pre-order list for Soto Phone, a phone with no social media and no games.\nIt might suit you if you find yourself on your phone too much. It only takes your email."
    : "SNSもゲームも入っていない携帯電話「Soto Phone」の先行予約（無料）に登録しました。\nスマホをつい触りすぎてしまう方に、合うかもしれません。\n登録はメールアドレスだけで、1分ほどで終わります。";
  const line = "https://line.me/R/share?text=" + encodeURIComponent(msg + "\n" + url);
  const t = en
    ? { h: "A small request", p: ["If someone close to you struggles", "with how much they use their phone,", "we'd be grateful if you shared Soto Phone", "with them using your own link."], th: "Our thanks for your referrals",
        rows: [["1", "person", "Priority prototype invite", "When the prototype is ready"], ["10", "people", "A Soto aluminum bottle", "First 100 people"], ["30", "people", "A first-edition Soto T-shirt", "First 10 people"]],
        n: ["We'll email you each time", "someone joins through your link."], b: "Send on LINE", b2: "Tell a friend", u: "Your link" }
    : { h: "ご紹介のお願い", p: ["スマートフォンとの付き合い方に", "悩んでいる方が", "身近にいらっしゃいましたら、", "あなた専用のリンクから Soto Phone を", "ご紹介いただけますと幸いです。"], th: "ご紹介いただいた方への御礼",
        rows: [["1", "名", "先行体験に優先ご招待", "試作機ができたときにご案内"], ["10", "名", "Soto アルミマイボトル", "先着100名様"], ["30", "名", "Soto 初代 限定Tシャツ", "先着10名様"]],
        n: ["ご紹介の方がご登録されるたびに、", "メールでご報告いたします。"], b: "LINE で送る", b2: "友だちに教える", u: "あなた専用のリンク" };
  const sans = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo',sans-serif";
  const serif = "'Hiragino Mincho ProN','Yu Mincho','YuMincho',Georgia,serif";
  const dim = "#6b665d", line_ = "#e2ddd2";
  const rows = t.rows.map(([n, u, x, sub]) => '<tr>'
    + '<td width="70" style="width:70px;padding:12px 12px 12px 0;border-top:1px solid ' + line_ + ';white-space:nowrap;vertical-align:middle;text-align:right">'
    + '<span style="font-family:' + serif + ';font-size:24px;font-weight:600;line-height:1;color:#a94c2f">' + n + '</span><span style="font-size:11px;color:' + dim + ';margin-left:2px">' + ent(u) + '</span></td>'
    + '<td style="padding:12px 0;border-top:1px solid ' + line_ + ';vertical-align:middle;text-align:left">'
    + '<div style="font-size:14px;line-height:1.45;color:#1f1e1c">' + ent(x) + '</div><div style="font-size:11.5px;line-height:1.5;color:' + dim + '">' + ent(sub) + "</div></td></tr>").join("");
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px"><tr><td align="center">'
    // 白い枠
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:420px;background:#ffffff;border:1px solid ' + line_ + ';border-radius:16px"><tr><td align="center" style="padding:22px 22px 18px;font-family:' + sans + ';text-align:center">'
    + '<div style="font-family:' + serif + ';font-size:17px;letter-spacing:.12em;color:#1f1e1c">' + ent(t.h) + "</div>"
    + '<div style="margin-top:10px;font-size:13px;line-height:1.9;letter-spacing:.02em;color:' + dim + '">' + t.p.map(ent).join("<br>") + "</div>"
    + '<div style="margin-top:18px;font-size:11px;letter-spacing:.18em;color:#7a6f58">' + ent(t.th) + "</div>"
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border-collapse:collapse;border-bottom:1px solid ' + line_ + '">' + rows + "</table>"
    + '<div style="margin-top:14px;font-size:12px;line-height:1.8;color:' + dim + '">' + t.n.map(ent).join("<br>") + "</div>"
    + "</td></tr></table>"
    // その下に「LINE で送る」ボタン（サイトと同じ、黒い丸いボタンに赤い点）と、あなた専用のリンク
    // 2つめの「友だちに教える」は、メールの中では共有画面を開けないので、共有するためのページ（share.html）を開く。
    // そのページは ?c= を使うので、本人が開いても紹介には数えない
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0"><tr>'
    + '<td bgcolor="#1f1e1c" style="background:#1f1e1c;border-radius:999px">'
    + '<a href="' + line + '" style="display:inline-block;padding:13px 24px;font-family:' + sans + ';font-size:14.5px;font-weight:600;letter-spacing:.08em;color:#ffffff;text-decoration:none;white-space:nowrap">'
    + '<span style="color:#e0502e;font-size:11px;vertical-align:2px">&#9679;</span>&nbsp;&nbsp;' + ent(t.b) + "</a></td>"
    + '<td width="10" style="width:10px"></td>'
    + '<td style="border:1px solid #1f1e1c;border-radius:999px">'
    + '<a href="' + SITE_URL + "share?c=" + code + (en ? "&l=en" : "") + '" style="display:inline-block;padding:12px 22px;font-family:' + sans + ';font-size:14.5px;font-weight:600;letter-spacing:.08em;color:#1f1e1c;text-decoration:none;white-space:nowrap">' + ent(t.b2) + "</a></td>"
    + "</tr></table>"
    + '<div style="margin-top:12px;font-family:' + sans + ';font-size:11.5px;color:' + dim + '">' + ent(t.u) + '：<a href="' + url + '" style="color:#1f1e1c">' + url + "</a></div>"
    + "</td></tr></table>";
}

// 確認メールに入れる「ご紹介のお願い」。ほかの段落と同じく、1行を短く区切る。
// 御礼の3行（「1名　〜」のように全角の空白で区切った行）は、HTML のメールでは表にする（toHtml）
function refBlockJa(code) {
  if (!code) return [];
  return ["ご友人やご家族に、", "スマートフォンとの付き合い方に", "悩んでいる方がいらっしゃいましたら、",
    "あなた専用の下記リンクから、", "Soto Phone をご紹介いただけますと幸いです。",
    SITE_URL + "?r=" + code, "",
    "ご紹介いただいた方への御礼",
    "1名　試作機の先行体験に、優先してご招待",
    "10名　Soto アルミマイボトル（先着100名様）",
    "30名　Soto 初代 限定Tシャツ（先着10名様）", "",
    "ご紹介の方がご登録されるたびに、", "このメールアドレスへご報告いたします。", ""];
}
function refBlockEn(code) {
  if (!code) return [];
  return ["If someone close to you struggles", "with how much they use their phone,", "we'd be grateful if you shared Soto Phone",
    "with them using your own link:", SITE_URL + "en?r=" + code, "",
    "Our thanks for your referrals",
    "1 person　Priority invitation to try a prototype",
    "10 people　A Soto aluminum bottle (first 100 people)",
    "30 people　A first-edition Soto T-shirt (first 10 people)", "",
    "We'll email you each time", "someone joins through your link.", ""];
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

// 押したボタンの約束に合わせた言葉（サイトの script.js の ticketWords と同じ）。
// 1枚目のパターン：o は最初の版（先行予約に登録）、c は「料金を最初に知る」、d は「発売のお知らせを受け取る」、それ以外は「完成品を最初に見る」
function promiseJa(variant) {
  const h = String(variant || "").split("-")[0];
  if (h === "o") return { img: "hatsubai", title: "先行予約券", sub: "発売のお知らせを、いちばん先に。", stub: "先行予約", line: "発売が決まったら、\nいちばん先にお知らせします。" };
  if (h === "d") return { img: "oshirase", title: "招待券", sub: "発売のお知らせを、いちばん先に。", stub: "Soto Phone", line: "発売が決まったら、\nいちばん先にお知らせします。" };
  if (h === "c") return { img: "ryokin", title: "招待券", sub: "料金を、いちばん先に。", stub: "Soto Phone", line: "料金が決まったら、\nいちばん先にお知らせします。" };
  return { img: "kansei", title: "招待券", sub: "完成品を、いちばん先に。", stub: "Soto Phone", line: "完成したら、いちばん先にお見せします。" };
}

function mailJa(trial, link, number, variant, code) {
  const w = promiseJa(variant);
  // 短く、急かさない。伝えるのは「番号」「これから何が届くか」「刻印」の3つだけ
  const lines = [
    // お礼は件名で伝わるので、ここは1行だけ。いちばん目に入る場所に「ご紹介のお願い」を置く
    // 招待券（番号）がいちばん上。お礼 → これから届くもの（開発レター・先行体験・完成品・刻印）→「ご紹介のお願い」→ 署名
    number ? "[[TICKET]]" : null,
    number ? "" : null,
    "このたびはご登録いただき、",
    "誠にありがとうございます。",
    "",
    "応援してくださる方がいることが、",
    "私たちの何よりの励みです。",
    "",
    "これから月に1回、開発の様子を",
    "短い手紙にしてお送りします。",
    trial ? "試作機を使ってもらう会を開くときも、" : null,
    trial ? "ここからお声がけします。" : null,
    "",
    w.line,
    number && number <= 300 ? "No.300 までの方は、" : null,
    number && number <= 300 ? "ご希望で本体に番号を刻めます。" : null,
    "",
    code ? "[[REF]]" : null,
    code ? "" : null,
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
  return { subject: number ? "Soto Phone | " + numberLabel(number) + " で受け付けました" : "Soto Phone | 受け付けました", text: refText(lines, refBlockJa(code), number ? "あなたの番号は " + numberLabel(number) + " です。" : ""), html: toHtml(lines, number, w, refCard(code, false)) };
}

function mailEn(trial, link, number, code) {
  const lines = [
    number ? "[[TICKET]]" : null,
    number ? "" : null,
    "Thank you so much for joining",
    "the Soto Phone pre-order list.",
    "",
    "Knowing people are rooting for us",
    "means more than we can say.",
    "",
    "Once a month, we'll send you a short letter",
    "about how the phone is coming along.",
    trial ? "We'll also write here when we invite" : null,
    trial ? "people to try a prototype." : null,
    "",
    "When it's finished, you'll see it first.",
    number && number <= 300 ? "Numbers up to No.300 can be engraved" : null,
    number && number <= 300 ? "on the phone if you'd like." : null,
    "",
    code ? "[[REF]]" : null,
    code ? "" : null,
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
  return { subject: number ? "Soto Phone | You're " + numberLabel(number) : "Soto Phone | You're in", text: refText(lines, refBlockEn(code), number ? "Your number is " + numberLabel(number) + "." : ""), html: toHtml(lines, number, { img: "en", title: "Invitation", sub: "See the finished phone first.", stub: "Soto Phone", en: true }, refCard(code, true)) };
}

// 文字だけの、落ち着いた見た目の HTML メールにする
// 番号があるときは、本文の上に「先行予約券」のきっぷを置く（サイトの登録済みカードと同じ見た目）。
// メールの画面では細かい CSS が効かないことが多いので、表（table）で組み、背景の絵は紙の色に混ぜ済みの画像を使う
function toHtml(lines, number, w, refHtml) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 長い URL は、押せるリンクにする
  const link = (s) => ent(esc(s)).replace(/https?:\/\/[^\s<]+/g, (u) => '<a href="' + u + '" style="color:#1f1e1c">' + u + "</a>");
  const en = !!w.en;
  // 日本語は数値の文字参照にして送る（メールの画面によって文字化けしないように）
  const ent = (s) => String(s).replace(/[^\x00-\x7f]/g, (c) => "&#" + c.codePointAt(0) + ";");
  const sans = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo',sans-serif";
  const d = new Date();
  const day = d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  const ink = "#7a6f58";
  const card = number
    ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:440px;margin:0 0 24px;border-collapse:separate;border-radius:14px;background:#f3ecdc"><tr>'
      // 左半分は、水彩の絵と文字をいっしょに焼き込んだ画像（images/mail/ticket-*.png）。
      // 黒い画面（ダークモード）でも、画像の中の文字は色が変わらないので読める。日付と番号は、右の半券に文字で入れる
      + '<td width="79%" style="width:79%;padding:0;border-right:2px dashed #cbbf9f;vertical-align:top;line-height:0">'
      + '<img src="' + SITE_URL + 'images/mail/ticket-' + w.img + '.png" width="348" alt="' + ent(w.title + "：" + w.sub) + '" style="display:block;width:100%;max-width:348px;height:auto;border:0;border-radius:14px 0 0 14px"></td>'
      + '<td width="21%" align="center" style="width:21%;min-width:70px;padding:10px 2px;vertical-align:middle;text-align:center">'
      + '<div style="font:500 10px Helvetica,Arial,sans-serif;letter-spacing:.2em;color:' + ink + '">NO.</div>'
      + '<div style="font-family:Georgia,serif;font-size:30px;font-weight:600;line-height:1.2;color:#1f1e1c">' + String(number).padStart(3, "0") + "</div>"
      + '<div style="font-family:' + sans + ';font-size:10.5px;color:' + ink + '">' + ent(w.stub) + "</div>"
      + '<div style="margin-top:6px;font:500 9.5px ' + sans + ';color:' + ink + '">' + day.slice(5) + (en ? "" : ent(" 発行")) + "</div></td></tr></table>"
    : "";
  // 本文は、空行で区切った段落ごとに間をあける。「――」より下（送信者や配信停止）は、小さく薄く
  const cut = lines.findIndex((l) => l === "――" || l === "--");
  const main = cut >= 0 ? lines.slice(0, cut) : lines, foot = cut >= 0 ? lines.slice(cut + 1) : [];
  const paras = main.join("\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const tierRe = /^(\d+(?:名| people| person))\u3000(.+)$/;
  const tierTable = (p) => {
    const ls = p.split("\n");
    if (ls.length < 2 || !ls.slice(1).every((l) => tierRe.test(l))) return null;
    const rows = ls.slice(1).map((l) => {
      const m = tierRe.exec(l);
      return '<tr><td style="padding:10px 14px 10px 0;border-top:1px solid #e4e0d6;white-space:nowrap;vertical-align:top;font-family:Georgia,serif;font-size:17px;font-weight:600;color:#a94c2f">' + ent(esc(m[1]))
        + '</td><td style="padding:10px 0;border-top:1px solid #e4e0d6;vertical-align:top">' + ent(esc(m[2])) + "</td></tr>";
    }).join("");
    return '<div style="margin:0 0 22px"><div style="font-size:12px;letter-spacing:.12em;color:#7a6f58;margin-bottom:6px">' + ent(esc(ls[0])) + '</div>'
      + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-bottom:1px solid #e4e0d6;font-size:14px;line-height:1.6">' + rows + "</table></div>";
  };
  const hasTicketSpot = paras.indexOf("[[TICKET]]") >= 0;
  const bodyHtml = paras.map((p) => (p === "[[REF]]" ? (refHtml || "") : null) || (p === "[[TICKET]]" ? card : null) || tierTable(p) || '<p style="margin:0 0 22px">' + p.split("\n").map(link).join("<br>") + "</p>").join("");
  const footHtml = foot.length ? '<div style="margin-top:36px;padding-top:14px;border-top:1px solid #e4e0d6;font-size:11px;line-height:1.8;color:#8a857b">' + foot.map(link).join("<br>") + "</div>" : "";
  // ダークモードの画面でも読めるように、明るい色で表示するよう指定し、白い紙の上に載せる
  // （背景を指定しないと、画面だけ黒くなって黒い文字が見えなくなるメールアプリがある）
  return '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">'
    + '<style>:root{color-scheme:light only;supported-color-schemes:light only}</style>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f2ec" style="background:#f4f2ec"><tr><td align="center" style="padding:24px 12px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:520px;background:#ffffff;border-radius:16px"><tr><td style="padding:28px 24px">'
    + '<div style="font-family:\'Hiragino Sans\',\'Yu Gothic\',sans-serif;font-size:15px;line-height:1.9;letter-spacing:.02em;color:#1f1e1c;max-width:480px">' + (hasTicketSpot ? "" : card) + bodyHtml + footHtml + "</div>"
    + "</td></tr></table></td></tr></table>";
}

// ── 月に1回の手紙 ─────────────────────────────────────────────
// シート「手紙」に1通ずつ書き、「状態」を「送る」にすると、毎朝の自動実行（setupLetterTrigger で登録）で
// 確認メールが届いた人・配信を止めていない人・テストでない人に送る。1日の送信上限に近づいたら止めて、翌朝に続きを送る。
// 英語の件名・本文が空なら、英語で登録した人には送らない（日本語の手紙を英語の人に送らない）。
const LETTER_SHEET = "手紙";
const LETTER_HEADERS = ["作成日", "件名", "本文", "件名（英語）", "本文（英語）", "状態", "送った数", "最後に送った日時"];
function letterSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(LETTER_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(LETTER_SHEET);
    sheet.appendRow(LETTER_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(2, 6, 200, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["下書き", "送る", "送信中", "送信済み"], true).build());
  }
  return sheet;
}

// 送る相手（verifiedCount と同じ条件。同じアドレスは1回だけ）
function letterRecipients() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const seen = {}, out = [];
  rows.forEach((r) => {
    const email = String(r[1] || "").trim().toLowerCase();
    if (!email || seen[email] || !r[MAIL_COL - 1] || r[STOP_COL - 1] || String(r[9] || "") === "test") return;
    seen[email] = true;
    out.push({ email, lang: String(r[3] || "ja") === "en" ? "en" : "ja" });
  });
  return out;
}

function letterLines(body, link, en) {
  const foot = en
    ? ["--", "You're receiving this because this address was registered at " + SITE_URL + ".", "Unsubscribe or delete your data: " + link,
       "Sender: Soto Phone (Kazuma Sasaki)", "Contact: " + CONTACT, "Privacy policy: " + SITE_URL + "privacy-en"]
    : ["――", "このメールは、sotophone.jp で登録された方にお送りしています。", "配信の停止・登録情報の削除：" + link,
       "送信者：" + SENDER_ORG, SENDER_ADDRESS ? "所在地：" + SENDER_ADDRESS : null, "お問い合わせ：" + CONTACT, "プライバシーポリシー：" + SITE_URL + "privacy"];
  return String(body).replace(/\r/g, "").split("\n").concat([""], foot).filter((l) => l !== null);
}

function sendLetterTo(email, subject, body, en) {
  const lines = letterLines(body, manageUrl(email, en ? "en" : "ja"), en);
  const html = toHtml(lines, null, { en });
  const opts = { htmlBody: html, name: SENDER_NAME };
  if (FROM_ADDRESS) opts.from = FROM_ADDRESS;
  if (REPLY_TO) opts.replyTo = REPLY_TO;
  GmailApp.sendEmail(email, subject, lines.join("\n"), opts);
}

// 毎朝の自動実行から呼ばれる。「送る」か「送信中」のいちばん上の1通を、まだ送っていない人に送る
function sendLetters() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const sheet = letterSheet();
    const last = sheet.getLastRow();
    if (last < 2) return;
    const rows = sheet.getRange(2, 1, last - 1, LETTER_HEADERS.length).getValues();
    const i = rows.findIndex((r) => r[5] === "送る" || r[5] === "送信中");
    if (i < 0) return;
    const r = rows[i], rowNo = i + 2;
    const props = PropertiesService.getScriptProperties(), key = "letter-sent-" + rowNo + "-" + String(r[1]).slice(0, 20);
    const done = JSON.parse(props.getProperty(key) || "{}");
    sheet.getRange(rowNo, 6).setValue("送信中");
    let n = Object.keys(done).length;
    for (const p of letterRecipients()) {
      if (done[p.email]) continue;
      const en = p.lang === "en";
      if (en && !String(r[3]).trim()) continue;
      if (MailApp.getRemainingDailyQuota() < 10) break; // 確認メールの分を残して、続きは翌朝
      try {
        sendLetterTo(p.email, en ? r[3] : r[1], en ? r[4] : r[2], en);
        done[p.email] = 1; n++;
        props.setProperty(key, JSON.stringify(done));
        Utilities.sleep(1200);
      } catch (err) { console.error("letter failed", p.email, err); }
    }
    sheet.getRange(rowNo, 7).setValue(n);
    sheet.getRange(rowNo, 8).setValue(new Date());
    const left = letterRecipients().filter((p) => !done[p.email] && !(p.lang === "en" && !String(r[3]).trim())).length;
    if (!left) { sheet.getRange(rowNo, 6).setValue("送信済み"); props.deleteProperty(key); }
  } finally { lock.releaseLock(); }
}

// 送る前の確認用。いちばん下の手紙を、自分あてに1通だけ送る（状態は変えない）
function testLetterToMe() {
  const sheet = letterSheet();
  const last = sheet.getLastRow();
  if (last < 2) throw new Error("シート「手紙」に、まだ手紙がありません");
  const r = sheet.getRange(last, 1, 1, LETTER_HEADERS.length).getValues()[0];
  sendLetterTo(Session.getEffectiveUser().getEmail(), "【確認】" + r[1], r[2], false);
}

// 一度だけ実行する：毎朝9時ごろに sendLetters を動かす
function setupLetterTrigger() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === "sendLetters").forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("sendLetters").timeBased().everyDays(1).atHour(9).inTimezone("Asia/Tokyo").create();
  letterSheet();
}

// メールアドレスの欄を、ほかの行と同じ「人のチップ」（丸い枠の表示）にする。
// Apps Script の「サービス」に「Google Sheets API」（名前 Sheets）を追加したときだけ動く。追加していなければ、ふつうの文字のまま
function emailChip(sheet, rowIndex, email) {
  if (typeof Sheets === "undefined") return;
  try {
    Sheets.Spreadsheets.batchUpdate({ requests: [{ updateCells: {
      range: { sheetId: sheet.getSheetId(), startRowIndex: rowIndex - 1, endRowIndex: rowIndex, startColumnIndex: 1, endColumnIndex: 2 },
      rows: [{ values: [{ userEnteredValue: { stringValue: "@" }, chipRuns: [{ chip: { personProperties: { email: email, displayFormat: "EMAIL" } } }] }] }],
      fields: "userEnteredValue,chipRuns"
    } }] }, sheet.getParent().getId());
  } catch (e) {
    console.warn("チップにできませんでした：" + e); // 登録そのものは済んでいるので、ここで止めない
  }
}
