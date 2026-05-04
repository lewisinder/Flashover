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
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    err.data = data;
    throw err;
  }
  return data;
}

function clearCheckSession() {
  sessionStorage.removeItem("checkInProgress");
  sessionStorage.removeItem("checkResults");
  sessionStorage.removeItem("currentCheckState");
}

function normalizeRole(role) {
  const raw = String(role || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (raw === "admin") return "admin";
  if (raw === "gearmanager") return "gearManager";
  if (raw === "member") return "member";
  if (raw === "viewer") return "viewer";
  return "";
}

function canEditSetup(role) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "gearManager";
}

function canRunChecks(role) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "gearManager" || normalized === "member";
}

function checkSessionIdFrom(data) {
  return (
    data?.sessionId ||
    data?.checkSessionId ||
    data?.lock?.sessionId ||
    data?.checkStatus?.sessionId ||
    data?.status?.sessionId ||
    ""
  );
}

function preserveCheckSessionId(data) {
  const sessionId = checkSessionIdFrom(data);
  if (sessionId) localStorage.setItem("checkSessionId", sessionId);
}

function appendRowText(parent, titleText, metaText) {
  const title = el("div", "fs-row-title");
  title.textContent = titleText || "";
  const meta = el("div", "fs-row-meta");
  meta.textContent = metaText || "";
  parent.appendChild(title);
  parent.appendChild(meta);
}

function lockOwnerText(lock) {
  return lock?.user || lock?.name || lock?.email || "another member";
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateTimeFormatter.format(date);
}

function lockStartedAt(lockResponse) {
  return lockResponse?.timestamp || lockResponse?.lock?.timestamp || "";
}

function sessionStartedBy(session, lock) {
  return session?.startedByName || session?.startedBy || lockOwnerText(lock);
}

function sessionStartedAt(session, lock) {
  return session?.startedAt || lockStartedAt(lock);
}

function sessionLastEditedAt(session) {
  return session?.lastSavedAt || session?.updatedAt || session?.editedAt || "";
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
  const modalDetails = el("div");
  modalDetails.style.display = "grid";
  modalDetails.style.gap = "10px";
  modalDetails.style.textAlign = "left";
  const modalDetailsTitle = el("div", "fs-label");
  modalDetailsTitle.textContent = "Details";
  modalDetails.appendChild(modalDetailsTitle);
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
  modalInner.appendChild(modalDetails);
  modalInner.appendChild(modalButtons);
  modal.appendChild(modalInner);
  modalOverlay.appendChild(modal);

  root.appendChild(container);
  root.appendChild(modalOverlay);

  cancelBtn.addEventListener("click", () => modalOverlay.classList.add("hidden"));

  const user = auth?.currentUser;
  if (!user) return;

  let brigadeMetaById = new Map();
  let activeModalToken = 0;
  function setAlert(el, message) {
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }
  function updateSetupButton(brigadeId) {
    const meta = brigadeMetaById.get(brigadeId) || {};
    const canEdit = canEditSetup(meta.role);
    btnSetup.disabled = !canEdit;
    btnSetup.title = canEdit ? "" : "Admins and gear managers only";
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
      const role = (brigadeMetaById.get(brigadeId) || {}).role;
      const canStartChecks = canRunChecks(role);
      applianceList.innerHTML = "";

      if (appliances.length === 0) {
        applianceList.innerHTML =
          '<div class="fs-row"><div><div class="fs-row-title">No appliances yet</div><div class="fs-row-meta">Admins and gear managers can add appliances from Appliance setup.</div></div></div>';
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
        const truckIcon = document.createElement("img");
        truckIcon.src = "/design_assets/Truck Icon.png";
        truckIcon.alt = "";
        bubble.appendChild(truckIcon);

        const text = el("div");
        appendRowText(
          text,
          appliance.name || "Unnamed appliance",
          canStartChecks ? "Tap to start" : "View only"
        );
        const rowMeta = text.querySelector(".fs-row-meta");
        const defaultMeta = rowMeta ? rowMeta.textContent : "";
        let rowBusy = false;
        const setRowBusy = (busy, message) => {
          rowBusy = busy;
          row.disabled = busy || !canStartChecks;
          row.setAttribute("aria-busy", busy ? "true" : "false");
          if (rowMeta) rowMeta.textContent = busy ? message : defaultMeta;
        };

        left.appendChild(bubble);
        left.appendChild(text);

        const chevron = el("div");
        chevron.style.color = "var(--fs-muted)";
        chevron.style.fontWeight = "900";
        chevron.style.fontSize = "18px";
        chevron.textContent = "›";

        row.appendChild(left);
        row.appendChild(chevron);
        row.disabled = !canStartChecks;
        row.title = canStartChecks ? "" : "Viewers cannot start or resume checks.";

        row.addEventListener("click", async () => {
          if (!canStartChecks || rowBusy) return;
          setAlert(errorEl, "");
          setAlert(successEl, "");
          setRowBusy(true, "Checking status...");
          try {
            const token = await user.getIdToken();
            const status = await fetchJson(
              `/api/brigades/${encodeURIComponent(brigadeId)}/appliances/${encodeURIComponent(appliance.id)}/check-status`,
              { token }
            );
            preserveCheckSessionId(status);

            const openCheckForm = () => {
              localStorage.setItem("activeBrigadeId", brigadeId);
              localStorage.setItem("selectedBrigadeId", brigadeId);
              localStorage.setItem("selectedApplianceId", appliance.id);
              window.location.hash = `#/check/${encodeURIComponent(brigadeId)}/${encodeURIComponent(appliance.id)}`;
            };

            const startCheck = async ({ force = false } = {}) => {
              setRowBusy(true, force ? "Starting new check..." : "Starting check...");
              const result = await fetchJson(
                `/api/brigades/${encodeURIComponent(brigadeId)}/appliances/${encodeURIComponent(appliance.id)}/start-check`,
                { token, method: "POST", body: force ? { force: true } : undefined }
              );
              preserveCheckSessionId(result);
              return result;
            };

            const renderLockDetails = (lockResponse, session) => {
              const lock = lockResponse?.lock || lockResponse?.checkStatus || lockResponse || {};
              const startedBy = sessionStartedBy(session, lock);
              const startedAt = formatDateTime(sessionStartedAt(session, lock));
              const lastEditedAt = formatDateTime(sessionLastEditedAt(session));
              modalDetails.replaceChildren(modalDetailsTitle);

              const rows = [
                { label: "Started by", value: startedBy },
                { label: "Started", value: startedAt },
              ];
              if (lastEditedAt) rows.push({ label: "Last edited", value: lastEditedAt });

              rows.forEach((entry) => {
                const row = el("div");
                row.style.display = "grid";
                row.style.gap = "2px";
                const rowLabel = el("div", "fs-row-meta");
                rowLabel.textContent = entry.label;
                const rowValue = el("div");
                rowValue.textContent = entry.value || "Not available";
                row.appendChild(rowLabel);
                row.appendChild(rowValue);
                modalDetails.appendChild(row);
              });
            };

            const showLockModal = async (lockResponse) => {
              preserveCheckSessionId(lockResponse);
              const lock = lockResponse?.lock || lockResponse?.checkStatus || lockResponse || {};
              const modalToken = ++activeModalToken;
              hideLoading?.();
              modalText.textContent = "Resume the existing check or start a new one.";
              renderLockDetails(lockResponse, null);
              modalOverlay.classList.remove("hidden");

              if (lockResponse?.sessionId) {
                void (async () => {
                  try {
                    const tokenForSession = await user.getIdToken();
                    const sessionResponse = await fetchJson(
                      `/api/brigades/${encodeURIComponent(brigadeId)}/check-sessions/${encodeURIComponent(lockResponse.sessionId)}`,
                      { token: tokenForSession }
                    );
                    if (modalToken !== activeModalToken || modalOverlay.classList.contains("hidden")) return;
                    renderLockDetails(lockResponse, sessionResponse?.session || sessionResponse);
                  } catch (err) {
                    if (modalToken !== activeModalToken) return;
                    console.warn("Unable to load check session details:", err);
                  }
                })();
              }

              resumeBtn.onclick = () => {
                activeModalToken += 1;
                modalOverlay.classList.add("hidden");
                openCheckForm();
              };

              startNewBtn.onclick = async () => {
                activeModalToken += 1;
                modalOverlay.classList.add("hidden");
                showLoading?.();
                try {
                  await startCheck({ force: true });
                  clearCheckSession();
                  openCheckForm();
                } catch (err) {
                  if (err.status === 409 || err.code === "CHECK_LOCKED") {
                    showLockModal(err.data);
                    return;
                  }
                  console.error("Error starting new check:", err);
                  setAlert(errorEl, err.message);
                } finally {
                  hideLoading?.();
                }
              };
            };

            if (status?.inProgress) {
              await showLockModal(status);
              return;
            }

            try {
              await startCheck();
            } catch (err) {
              if (err.status === 409 || err.code === "CHECK_LOCKED") {
                await showLockModal(err.data);
                return;
              }
              throw err;
            }
            openCheckForm();
          } catch (err) {
            console.error("Error starting check:", err);
            setAlert(errorEl, err.message);
          } finally {
            hideLoading?.();
            setRowBusy(false);
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
