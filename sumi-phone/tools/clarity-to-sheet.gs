// Microsoft Clarity の数字（ページごとの訪問数、スクロールの深さ、滞在時間、デッドクリック・レイジクリックなど）を
// 毎日このスプレッドシートの「Clarity（毎日）」タブに1日分ずつ足していく Google Apps Script。
// Google アナリティクスの数字（ページごとの表示回数・ユーザー数など）も「GA（毎日）」タブに足す（GA_PROPERTY_ID を入れたときだけ）。
// あわせて、Search Console のアドオンが毎日作る日付のタブと「Backup Log」を隠して、タブを見やすく保つ。
//
// Google アナリティクスも取り込むとき（任意）
// a. Apps Script の左の「サービス」の＋から「Google Analytics Data API」を追加する
// b. スクリプト プロパティに、名前 GA_PROPERTY_ID、値に GA4 のプロパティ ID（数字だけ。「管理」→「プロパティの詳細」にある）を入れる
//
// 使い方（最初に1回だけ）
// 1. Clarity の「設定」→「データのエクスポート」で API トークンを作ってコピーする
// 2. このスプレッドシートの「拡張機能」→「Apps Script」を開き、このコードを全部貼り付けて保存する
// 3. 左の歯車「プロジェクトの設定」→「スクリプト プロパティ」に、名前 CLARITY_TOKEN、値にトークンを入れて保存する
//    （トークンはコードに書かない。人に見せない）
// 4. 上の関数の選び欄で「setup」を選んで「実行」する。許可を求められたら許可する
//    → すぐ1回取り込み、そのあとは毎朝9時ごろに自動で取り込む
//
// Clarity の API は、さかのぼれるのが直近3日まで、1日に呼べる回数は10回まで。ここでは1日1回、前日までの1日分を取る。

const SHEET_NAME = "Clarity（毎日）";
const API = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const HEADERS = ["取得日", "項目", "ページ", "セッション数", "その項目が起きたセッションの割合（%）", "回数・合計",
  "ユーザー数", "平均スクロール（%）", "合計時間（秒）", "操作していた時間（秒）", "その他"];

// 項目の名前を日本語にする（知らない名前はそのまま出す）
const METRIC_JA = {
  Traffic: "訪問数",
  ScrollDepth: "スクロールの深さ",
  EngagementTime: "滞在時間",
  DeadClickCount: "デッドクリック（押しても反応しない所を押した）",
  RageClickCount: "レイジクリック（同じ所を何度も押した）",
  QuickbackClick: "すぐ戻った",
  ExcessiveScroll: "行ったり来たりのスクロール",
  ScriptErrorCount: "ページのエラー",
  ErrorClickCount: "押したらエラー",
  PopularPages: "よく見られたページ",
  Browser: "ブラウザ",
  Device: "端末",
  OS: "OS",
  Country: "国",
  ReferrerUrl: "参照元",
  PageTitle: "ページの題名"
};

function setup() {
  ScriptApp.getProjectTriggers()
    .filter((t) => ["importClarity", "tidyTabs"].indexOf(t.getHandlerFunction()) >= 0)
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("importClarity").timeBased().everyDays(1).atHour(9).create();
  ScriptApp.newTrigger("tidyTabs").timeBased().everyHours(1).create(); // アドオンが新しい日付のタブを作ったら、1時間以内に隠す
  importClarity();
}

function importClarity() {
  try { importGa(); } catch (e) { console.warn("GA の取り込みに失敗：" + e); }
  tidyTabs();
  const token = PropertiesService.getScriptProperties().getProperty("CLARITY_TOKEN");
  if (!token) throw new Error("スクリプト プロパティに CLARITY_TOKEN がありません");
  const res = UrlFetchApp.fetch(API + "?numOfDays=1&dimension1=URL", {
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error("Clarity から取得できませんでした（" + res.getResponseCode() + "）：" + res.getContentText().slice(0, 300));
  const data = JSON.parse(res.getContentText());

  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }

  const day = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  const num = (v) => (v === undefined || v === null || v === "" ? "" : Number(v));
  const known = ["Url", "URL", "url", "sessionsCount", "sessionsWithMetricPercentage", "subTotal", "totalSessionCount",
    "distinctUserCount", "averageScrollDepth", "totalTime", "activeTime"];
  const rows = [];
  (data || []).forEach((m) => {
    (m.information || []).forEach((info) => {
      const rest = Object.keys(info).filter((k) => known.indexOf(k) < 0).map((k) => k + "=" + info[k]).join(" / ");
      rows.push([
        day,
        METRIC_JA[m.metricName] || m.metricName,
        info.Url || info.URL || info.url || "",
        num(info.sessionsCount !== undefined ? info.sessionsCount : info.totalSessionCount),
        num(info.sessionsWithMetricPercentage),
        num(info.subTotal),
        num(info.distinctUserCount),
        num(info.averageScrollDepth),
        num(info.totalTime),
        num(info.activeTime),
        rest
      ]);
    });
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
}

// Google アナリティクス：前日のページごとの数字を「GA（毎日）」に足す
function importGa() {
  const id = PropertiesService.getScriptProperties().getProperty("GA_PROPERTY_ID");
  if (!id) return;
  const report = AnalyticsData.Properties.runReport({
    dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
    dimensions: [{ name: "date" }, { name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "sessions" }, { name: "userEngagementDuration" }],
    limit: 1000
  }, "properties/" + id);
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName("GA（毎日）");
  if (!sheet) {
    sheet = book.insertSheet("GA（毎日）");
    sheet.appendRow(["日付", "ページ", "表示回数", "ユーザー数", "セッション数", "操作していた時間の合計（秒）"]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
  }
  const rows = (report.rows || []).map((r) => {
    const d = r.dimensionValues[0].value;
    return [d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8), r.dimensionValues[1].value]
      .concat(r.metricValues.map((m) => Number(m.value)));
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
}

// Search Console のアドオンが作る日付のタブ（例：2026-10-30）と「Backup Log」を隠す。中身は消さない
function tidyTabs() {
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach((sh) => {
    const name = sh.getName();
    if ((/^\d{4}-\d{2}-\d{2}$/.test(name) || name === "Backup Log") && !sh.isSheetHidden()) sh.hideSheet();
  });
}
