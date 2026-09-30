import { api, $, show, el, requireUser, pill } from "/assets/api.js";

const me = await requireUser(["reviewer", "admin"]);
if (me) {
  const msg = $("#msg");

  function reviewCard(s) {
    const m = s.checks.metrics || {};
    const reason = el("input", { placeholder: "不合格の理由（クリエイターに届きます）", maxlength: "500", "aria-label": "不合格の理由" });
    const audio = el("audio", { controls: "", preload: "none", src: `/api/review/${s.id}/audio` });
    const decide = async (decision, grade = "") => {
      try {
        await api(`/api/review/${s.id}`, { method: "POST", json: { decision, grade, reason: reason.value } });
        show(msg, `#${s.id} を${decision === "approve" ? `合格（${grade}）` : "不合格"}にしました`);
        load();
      } catch (err) { show(msg, err.message, false); }
    };
    return el("div", { class: "card" },
      el("div", { class: "row" }, pill([s.category, ""]), s.tier_label !== "誰でも" ? pill([s.tier_label, "gold"]) : "",
        s.industry_label !== "指定なし" ? pill([s.industry_label, "wait"]) : "",
        el("span", { class: "muted" }, `提出 #${s.id} · 注文 #${s.order_id}`)),
      el("p", {}, s.instructions || "（指示なし）"),
      audio,
      el("p", { class: "muted num" }, `${m.duration_sec}秒 · 平均 ${m.level_dbfs} dBFS · 無音 ${Math.round((m.silence_ratio || 0) * 100)}% · 音割れ ${((m.clip_ratio || 0) * 100).toFixed(2)}%`),
      el("div", { class: "grade-buttons" },
        ...["A", "B", "C"].map((g) => el("button", { type: "button", class: g === "A" ? "accent" : "", onclick: () => decide("approve", g) }, `合格 ${g}`))),
      el("div", { class: "inline-form" }, reason, el("button", { type: "button", class: "secondary", onclick: () => decide("reject") }, "不合格")),
    );
  }

  async function load() {
    const q = await api("/api/review/queue");
    $("#queue").replaceChildren(...(q.length ? q.map(reviewCard) : [el("p", { class: "muted" }, "審査待ちはありません")]));
  }
  load();
}
