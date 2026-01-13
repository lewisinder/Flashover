import { getUserBrigades } from "../cache.js";

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

async function fetchJson(url, { token, method, body } = {}) {
  const res = await fetch(url, {
    method: method || "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export async function renderReports({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "fs-page max-w-4xl mx-auto");
  const stack = el("div", "fs-stack");

  const topCard = el("div", "fs-card");
  const topInner = el("div", "fs-card-inner fs-stack");
  topInner.innerHTML = `
    <div>
      <div class="fs-card-title">Brigade</div>
      <div class="fs-card-subtitle">Choose a brigade to view its reports.</div>
    </div>
  `;

  const field = el("div", "fs-field");
  const label = el("label", "fs-label");
  label.setAttribute("for", "brigade-selector-reports-shell");
  label.textContent = "Brigade";
  const select = el("select", "fs-select");
  select.id = "brigade-selector-reports-shell";
  select.innerHTML = '<option value="">Loading…</option>';

  const errorEl = el("div", "fs-alert fs-alert-error");
  errorEl.style.display = "none";

  field.appendChild(label);
  field.appendChild(select);
  topInner.appendChild(field);
  topInner.appendChild(errorEl);
  topCard.appendChild(topInner);

  const listCard = el("div", "fs-card");
  const listInner = el("div", "fs-card-inner fs-stack");
  listInner.innerHTML = `
    <div>
      <div class="fs-card-title">Reports</div>
      <div class="fs-card-subtitle">Tap a report to view the full details.</div>
    </div>
  `;
  const list = el("div", "fs-list");
  list.innerHTML =
    '<div class="fs-row"><div><div class="fs-row-title">Select a brigade</div><div class="fs-row-meta">Reports will show here.</div></div></div>';

  listInner.appendChild(list);
  listCard.appendChild(listInner);

  stack.appendChild(topCard);
  stack.appendChild(listCard);
  container.appendChild(stack);
  root.appendChild(container);

  const user = auth?.currentUser;
  if (!user) return;

  function setAlert(el, message) {
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  async function loadReportsForBrigade(brigadeId) {
    setAlert(errorEl, "");
    list.innerHTML =
      '<div class="fs-row"><div><div class="fs-row-title">Loading…</div><div class="fs-row-meta">Fetching reports</div></div></div>';
    try {
      const token = await user.getIdToken();
      const reports = await fetchJson(`/api/reports/brigade/${encodeURIComponent(brigadeId)}`, { token });

      list.innerHTML = "";
      if (!Array.isArray(reports) || reports.length === 0) {
        list.innerHTML =
          '<div class="fs-row"><div><div class="fs-row-title">No reports yet</div><div class="fs-row-meta">Completed checks will appear here.</div></div></div>';
        return;
      }

      reports.forEach((report) => {
        const card = el("button", "fs-row");
        card.type = "button";
        const appUsername = report.username || report.creatorName || "Unknown";
        const signedName = typeof report.signedName === "string" ? report.signedName.trim() : "";
        const who = signedName || appUsername;
        const when = report.date ? new Date(report.date).toLocaleString() : "";

        const left = el("div");
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "12px";

        const bubble = el("div", "fs-icon-bubble");
        bubble.innerHTML = `<img src="/design_assets/Report Icon.png" alt="" />`;

        const text = el("div");
        text.innerHTML = `
          <div class="fs-row-title">${report.applianceName || "Unknown appliance"}</div>
          <div class="fs-row-meta">Checked by ${who}${when ? ` • ${when}` : ""}</div>
          <div class="fs-row-meta fs-row-meta-subtle">app username: ${appUsername}</div>
        `;

        const chevron = el("div");
        chevron.style.color = "var(--fs-muted)";
        chevron.style.fontWeight = "900";
        chevron.style.fontSize = "18px";
        chevron.textContent = "›";

        left.appendChild(bubble);
        left.appendChild(text);
        card.appendChild(left);
        card.appendChild(chevron);

        card.addEventListener("click", () => {
          window.location.hash = `#/report/${encodeURIComponent(brigadeId)}/${encodeURIComponent(report.id)}`;
        });
        list.appendChild(card);
      });
    } catch (err) {
      console.error("Error loading reports:", err);
      list.innerHTML = "";
      setAlert(errorEl, err.message);
    }
  }

  // Don't block route transitions on network reads; render immediately and hydrate async.
  void (async () => {
    try {
      const brigades = await getUserBrigades({ db, uid: user.uid });
      select.innerHTML = "";
      if (brigades.length === 0) {
        select.innerHTML = '<option value="">No brigades found</option>';
        list.innerHTML =
          '<div class="fs-row"><div><div class="fs-row-title">No brigades yet</div><div class="fs-row-meta">Join or create one from the Brigades tab.</div></div></div>';
        return;
      }

      brigades.forEach((b) => {
        const opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = b.brigadeName || b.id;
        select.appendChild(opt);
      });

      const stored = localStorage.getItem("activeBrigadeId");
      const storedExists = stored && brigades.some((b) => b.id === stored);
      const active = storedExists ? stored : brigades[0].id;
      localStorage.setItem("activeBrigadeId", active);
      select.value = active;

      await loadReportsForBrigade(active);

      select.addEventListener("change", async (e) => {
        const brigadeId = e.target.value;
        if (!brigadeId) return;
        localStorage.setItem("activeBrigadeId", brigadeId);
        await loadReportsForBrigade(brigadeId);
      });
    } catch (err) {
      console.error("Failed to load brigades:", err);
      setAlert(errorEl, "Could not load your brigades.");
    }
  })();
}
