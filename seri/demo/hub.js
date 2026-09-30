import { setPersona } from "./mock.js";
for (const a of document.querySelectorAll("a.persona")) a.addEventListener("click", () => { if (a.dataset.persona) setPersona(a.dataset.persona); });
