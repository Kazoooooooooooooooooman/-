import { api } from "/assets/api.js";
try {
  const me = await api("/api/me");
  location.replace({ creator: "/app/creator.html", buyer: "/app/buyer.html", reviewer: "/app/review.html", admin: "/app/admin.html" }[me.role]);
} catch { location.replace("/app/login.html"); }
