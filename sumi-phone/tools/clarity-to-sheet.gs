// Microsoft Clarity の数字（ページごとの訪問数、スクロールの深さ、滞在時間、デッドクリック・レイジクリックなど）を
// 毎日このスプレッドシートの「Clarity（毎日）」タブに1日分ずつ足していく Google Apps Script。
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
    .filter((t) => t.getHandlerFunction() === "importClarity")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("importClarity").timeBased().everyDays(1).atHour(9).create();
  importClarity();
}

function importClarity() {
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
