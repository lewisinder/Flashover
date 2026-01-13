import { getUserBrigades } from "../cache.js";

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function buildActionCard({ iconSrc, title, subtitle, onClick }) {
  const btn = el("button", "fs-card");
  btn.type = "button";
  btn.innerHTML = `
    <div class="fs-action-card-inner">
      <div class="fs-icon-bubble"><img src="${iconSrc}" alt="" /></div>
      <div>
        <div class="fs-action-card-title">${title}</div>
        <div class="fs-action-card-subtitle">${subtitle}</div>
      </div>
    </div>
  `;
  btn.addEventListener("click", onClick);
  return btn;
}

export async function renderMenu({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "fs-page max-w-4xl mx-auto");
  const stack = el("div", "fs-stack");

  const selectorCard = el("div", "fs-card");
  const selectorInner = el("div", "fs-card-inner fs-stack");
  selectorInner.innerHTML = `
    <div>
      <div class="fs-card-title">Active brigade</div>
      <div class="fs-card-subtitle">This decides what data you’re working with.</div>
    </div>
  `;

  const selectWrap = el("div", "fs-field");
  const label = el("label", "fs-label");
  label.textContent = "Brigade";
  label.setAttribute("for", "brigade-selector-shell");
  const select = el("select", "fs-select");
  select.id = "brigade-selector-shell";
  select.innerHTML = '<option value="">Loading…</option>';
  selectWrap.appendChild(label);
  selectWrap.appendChild(select);

  const selectorMsg = el("div", "fs-alert");
  selectorMsg.textContent = "Tip: if you’re just testing, you can use the demo brigade in the emulator.";

  selectorInner.appendChild(selectWrap);
  selectorInner.appendChild(selectorMsg);
  selectorCard.appendChild(selectorInner);

  const actionsCard = el("div", "fs-card");
  const actionsInner = el("div", "fs-card-inner fs-stack");
  actionsInner.innerHTML = `
    <div>
      <div class="fs-card-title">Quick actions</div>
      <div class="fs-card-subtitle">Start a check, view reports, or manage brigades.</div>
    </div>
  `;
  const grid = el("div", "fs-grid");

  const checksCard = buildActionCard({
    iconSrc: "/design_assets/Tick Icon.png",
    title: "Checks",
    subtitle: "Start or resume an appliance check",
    onClick: () => (window.location.hash = "#/checks"),
  });
  const reportsCard = buildActionCard({
    iconSrc: "/design_assets/Report Icon.png",
    title: "Reports",
    subtitle: "View previous checks and history",
    onClick: () => (window.location.hash = "#/reports"),
  });
  const brigadesCard = buildActionCard({
    iconSrc: "/design_assets/Users Icon.png",
    title: "Brigades",
    subtitle: "Join, create, or manage members",
    onClick: () => (window.location.hash = "#/brigades"),
  });
  const setupCard = buildActionCard({
    iconSrc: "/design_assets/Gear Icon.png",
    title: "Appliance setup",
    subtitle: "Admins only",
    onClick: () => (window.location.hash = "#/setup"),
  });

  grid.appendChild(checksCard);
  grid.appendChild(reportsCard);
  grid.appendChild(brigadesCard);
  grid.appendChild(setupCard);
  actionsInner.appendChild(grid);
  actionsCard.appendChild(actionsInner);

  stack.appendChild(selectorCard);
  stack.appendChild(actionsCard);
  container.appendChild(stack);
  root.appendChild(container);

  const user = auth.currentUser;
  if (!user) return;

  let brigadeMetaById = new Map();
  function updateActionAccess(brigadeId) {
    const meta = brigadeMetaById.get(brigadeId) || {};
    const role = String(meta.role || "").toLowerCase();
    const hasBrigade = Boolean(brigadeId);
    const isAdmin = role === "admin";

    checksCard.disabled = !hasBrigade;
    reportsCard.disabled = !hasBrigade;
    setupCard.disabled = !hasBrigade || !isAdmin;

    if (!hasBrigade) {
      setupCard.querySelector(".fs-action-card-subtitle").textContent = "Pick a brigade first";
    } else if (!isAdmin) {
      setupCard.querySelector(".fs-action-card-subtitle").textContent = "Admins only";
    } else {
      setupCard.querySelector(".fs-action-card-subtitle").textContent = "Edit appliances & lockers";
    }
  }

  // Don't block route transitions on network reads; render immediately and hydrate async.
  void (async () => {
    try {
      const brigades = await getUserBrigades({ db, uid: user.uid });
      brigadeMetaById = new Map(brigades.map((b) => [b.id, b]));
      select.innerHTML = "";

      if (brigades.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No brigades found";
        select.appendChild(opt);
        localStorage.removeItem("activeBrigadeId");
        updateActionAccess("");
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
      updateActionAccess(active);

      select.addEventListener("change", (e) => {
        const next = e.target.value;
        localStorage.setItem("activeBrigadeId", next);
        updateActionAccess(next);
      });
    } catch (err) {
      console.error("Failed to load brigades:", err);
      select.innerHTML = '<option value="">Error loading brigades</option>';
      updateActionAccess("");
    }
  })();
}
