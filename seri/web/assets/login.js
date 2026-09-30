import { api, $, show, el } from "/assets/api.js";

const meta = await api("/api/meta");
const params = new URLSearchParams(location.search);
const msg = $("#msg");

function tab(which) {
  $("#login").hidden = which !== "login";
  $("#signup").hidden = which !== "signup";
  $("#tab-login").setAttribute("aria-selected", which === "login");
  $("#tab-signup").setAttribute("aria-selected", which === "signup");
  show(msg, "");
}
$("#tab-login").onclick = () => tab("login");
$("#tab-signup").onclick = () => tab("signup");

for (const [k, v] of Object.entries(meta.industries)) $("#industry").append(el("option", { value: k }, v.label));
$("#consent-text").textContent = "同意書（" + meta.consent.version + "）: " + meta.consent.text;

function roleChanged() {
  const creator = $("#role").value === "creator";
  $("#creator-fields").hidden = !creator;
  $("#org-field").hidden = creator;
}
$("#role").onchange = roleChanged;
if (params.get("role")) { $("#role").value = params.get("role"); tab("signup"); }
roleChanged();

// only same-site paths, so a crafted link cannot bounce people to another site after login
const next = params.get("next") || "";
const go = () => location.replace(/^\/(?![\/\\])/.test(next) ? next : "/app/");

$("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try { await api("/api/auth/login", { method: "POST", json: { email: f.get("email"), password: f.get("password") } }); go(); }
  catch (err) { show(msg, err.message, false); }
});

$("#signup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const role = f.get("role");
  if (role === "creator" && !$("#consent").checked) return show(msg, "同意書に同意してください", false);
  try {
    await api("/api/auth/signup", { method: "POST", json: {
      email: f.get("email"), password: f.get("password"), name: f.get("name"), role,
      org: f.get("org") || "", industry: role === "creator" ? f.get("industry") : "",
      consent_version: role === "creator" ? meta.consent.version : "",
    } });
    go();
  } catch (err) { show(msg, err.message, false); }
});
