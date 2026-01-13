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

function clearCheckSession() {
  sessionStorage.removeItem("checkInProgress");
  sessionStorage.removeItem("checkResults");
  sessionStorage.removeItem("currentCheckState");
}

export async function renderChecks({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "fs-page max-w-4xl mx-auto");
  const stack = el("div", "fs-stack");

  const topCard = el("div", "fs-card");
  const topInner = el("div", "fs-card-inner fs-stack");
  topInner.innerHTML = `
    <div>
      <div class="fs-card-title">Pick a brigade</div>
      <div class="fs-card-subtitle">Checks and setup are tied to your active brigade.</div>
    </div>
  `;

  const selectorWrap = el("div", "fs-field");
  const label = el("label", "fs-label");
  label.textContent = "Brigade";
  label.setAttribute("for", "brigade-selector-checks-shell");

  const select = el("select", "fs-select");
  select.id = "brigade-selector-checks-shell";
  select.innerHTML = '<option value="">Loading…</option>';
  selectorWrap.appendChild(label);
  selectorWrap.appendChild(select);

  const helperRow = el("div", "fs-grid");

  const btnSetup = el("button", "fs-btn fs-btn-secondary");
  btnSetup.type = "button";
  btnSetup.innerHTML = `<span>Appliance setup</span>`;
  btnSetup.addEventListener("click", () => {
    window.location.hash = "#/setup";
  });

  const btnReports = el("button", "fs-btn fs-btn-secondary");
  btnReports.type = "button";
  btnReports.innerHTML = `<span>View reports</span>`;
  btnReports.addEventListener("click", () => {
    window.location.hash = "#/reports";
  });

  helperRow.appendChild(btnSetup);
  helperRow.appendChild(btnReports);

  const errorEl = el("div", "fs-alert fs-alert-error");
  errorEl.style.display = "none";
  const successEl = el("div", "fs-alert fs-alert-success");
  successEl.style.display = "none";

  topInner.appendChild(selectorWrap);
  topInner.appendChild(helperRow);
  topInner.appendChild(errorEl);
  topInner.appendChild(successEl);
  topCard.appendChild(topInner);

  const listCard = el("div", "fs-card");
  const listInner = el("div", "fs-card-inner fs-stack");
  listInner.innerHTML = `
    <div>
      <div class="fs-card-title">Choose an appliance</div>
      <div class="fs-card-subtitle">Tap an appliance to start a new check.</div>
    </div>
  `;
  const applianceList = el("div", "fs-list");
  applianceList.innerHTML = '<div class="fs-row"><div><div class="fs-row-title">Select a brigade</div><div class="fs-row-meta">Appliances will appear here.</div></div></div>';
  listInner.appendChild(applianceList);
  listCard.appendChild(listInner);

  stack.appendChild(topCard);
  stack.appendChild(listCard);
  container.appendChild(stack);

  // Modal for check in progress
  const modalOverlay = el(
    "div",
    "fixed inset-0 w-full h-full flex items-center justify-center hidden"
  );
  modalOverlay.style.backgroundColor = "rgba(0,0,0,0.6)";
  modalOverlay.style.backdropFilter = "blur(4px)";
  modalOverlay.style.zIndex = "50";

  const modal = el("div", "fs-card");
  modal.style.width = "92%";
  modal.style.maxWidth = "420px";
  const modalInner = el("div", "fs-card-inner fs-stack");
  modalInner.style.textAlign = "center";

  const modalTitle = el("div", "fs-card-title");
  modalTitle.textContent = "Check Already in Progress";
  const modalText = el("p");
  modalText.style.color = "var(--fs-muted)";
  const resumeBtn = el("button", "fs-btn fs-btn-primary");
  resumeBtn.type = "button";
  resumeBtn.textContent = "Resume Check";
  const startNewBtn = el("button", "fs-btn fs-btn-danger");
  startNewBtn.type = "button";
  startNewBtn.textContent = "Start New Check";
  const cancelBtn = el("button", "fs-btn fs-btn-secondary");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";

  const modalButtons = el("div", "fs-stack");
  modalButtons.appendChild(resumeBtn);
  modalButtons.appendChild(startNewBtn);
  modalButtons.appendChild(cancelBtn);

  modalInner.appendChild(modalTitle);
  modalInner.appendChild(modalText);
  modalInner.appendChild(modalButtons);
  modal.appendChild(modalInner);
  modalOverlay.appendChild(modal);

  root.appendChild(container);
  root.appendChild(modalOverlay);

  cancelBtn.addEventListener("click", () => modalOverlay.classList.add("hidden"));

  const user = auth?.currentUser;
  if (!user) return;

  let brigadeMetaById = new Map();
  function setAlert(el, message) {
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }
  function updateSetupButton(brigadeId) {
    const meta = brigadeMetaById.get(brigadeId) || {};
    const role = String(meta.role || "").toLowerCase();
    const isAdmin = role === "admin";
    btnSetup.disabled = !isAdmin;
    btnSetup.title = isAdmin ? "" : "Admins only";
  }

  async function loadAppliancesForBrigade(brigadeId) {
    setAlert(errorEl, "");
    setAlert(successEl, "");
    applianceList.innerHTML =
      '<div class="fs-row"><div><div class="fs-row-title">Loading…</div><div class="fs-row-meta">Fetching appliances</div></div></div>';
    try {
      const token = await user.getIdToken();
      const data = await fetchJson(`/api/brigades/${encodeURIComponent(brigadeId)}/data`, { token });

      const appliances = Array.isArray(data?.appliances) ? data.appliances : [];
      applianceList.innerHTML = "";

      if (appliances.length === 0) {
        applianceList.innerHTML =
          '<div class="fs-row"><div><div class="fs-row-title">No appliances yet</div><div class="fs-row-meta">Admins can add appliances from Appliance setup.</div></div></div>';
        return;
      }

      appliances.forEach((appliance) => {
        const row = el("button", "fs-row");
        row.type = "button";

        const left = el("div");
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "12px";

        const bubble = el("div", "fs-icon-bubble");
        bubble.innerHTML = `<img src="/design_assets/Truck Icon.png" alt="" />`;

        const text = el("div");
        text.innerHTML = `
          <div class="fs-row-title">${appliance.name}</div>
          <div class="fs-row-meta">Tap to start</div>
        `;

        left.appendChild(bubble);
        left.appendChild(text);

        const chevron = el("div");
        chevron.style.color = "var(--fs-muted)";
        chevron.style.fontWeight = "900";
        chevron.style.fontSize = "18px";
        chevron.textContent = "›";

        row.appendChild(left);
        row.appendChild(chevron);

        row.addEventListener("click", async () => {
          setAlert(errorEl, "");
          setAlert(successEl, "");
          showLoading?.();
          try {
            const token = await user.getIdToken();
            const status = await fetchJson(
              `/api/brigades/${encodeURIComponent(brigadeId)}/appliances/${encodeURIComponent(appliance.id)}/check-status`,
              { token }
            );

            const openCheckForm = () => {
              localStorage.setItem("activeBrigadeId", brigadeId);
              localStorage.setItem("selectedBrigadeId", brigadeId);
              localStorage.setItem("selectedApplianceId", appliance.id);
              window.location.hash = `#/check/${encodeURIComponent(brigadeId)}/${encodeURIComponent(appliance.id)}`;
            };

            const startCheck = async () => {
              await fetchJson(
                `/api/brigades/${encodeURIComponent(brigadeId)}/appliances/${encodeURIComponent(appliance.id)}/start-check`,
                { token, method: "POST" }
              );
            };

            if (status?.inProgress) {
              hideLoading?.();
              modalText.textContent = `A check for this appliance was already started by ${status.user}. Would you like to resume or start a new check?`;
              modalOverlay.classList.remove("hidden");

              resumeBtn.onclick = () => {
                modalOverlay.classList.add("hidden");
                showLoading?.();
                openCheckForm();
              };

              startNewBtn.onclick = async () => {
                modalOverlay.classList.add("hidden");
                showLoading?.();
                await startCheck();
                clearCheckSession();
                openCheckForm();
              };
              return;
            }

            await startCheck();
            openCheckForm();
          } catch (err) {
            console.error("Error starting check:", err);
            setAlert(errorEl, err.message);
          } finally {
            hideLoading?.();
          }
        });

        applianceList.appendChild(row);
      });
    } catch (err) {
      console.error("Failed to load appliance data:", err);
      applianceList.innerHTML = "";
      setAlert(errorEl, err.message);
    }
  }

  // Don't block route transitions on network reads; render immediately and hydrate async.
  void (async () => {
    try {
      const brigades = await getUserBrigades({ db, uid: user.uid });
      brigadeMetaById = new Map(brigades.map((b) => [b.id, b]));
      select.innerHTML = "";
      if (brigades.length === 0) {
        select.innerHTML = '<option value="">No brigades found</option>';
        applianceList.innerHTML =
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

      updateSetupButton(active);
      await loadAppliancesForBrigade(active);

      select.addEventListener("change", async (e) => {
        const brigadeId = e.target.value;
        if (!brigadeId) return;
        localStorage.setItem("activeBrigadeId", brigadeId);
        updateSetupButton(brigadeId);
        await loadAppliancesForBrigade(brigadeId);
      });
    } catch (err) {
      console.error("Failed to load brigades:", err);
      setAlert(errorEl, "Could not load your brigades.");
    }
  })();
}
