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

async function fetchBlob(url, { token } = {}) {
  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }

  return {
    blob: await res.blob(),
    filename: getDownloadFilename(res.headers.get("Content-Disposition")),
  };
}

function getDownloadFilename(disposition) {
  const match = String(disposition || "").match(/filename="([^"]+)"/i);
  return match ? match[1] : "report-export.pdf";
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return {
    from: toDateInputValue(from),
    to: toDateInputValue(to),
  };
}

function dateInputToIso(value, { endOfDay = false } = {}) {
  if (!value) return "";
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
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

  const exportCard = el("div", "fs-card");
  const exportInner = el("div", "fs-card-inner fs-stack");
  exportInner.innerHTML = `
    <div>
      <div class="fs-card-title">Export reports</div>
      <div class="fs-card-subtitle">Choose an appliance and date range.</div>
    </div>
  `;

  const exportGrid = el("div", "fs-grid");

  const applianceField = el("div", "fs-field");
  const applianceLabel = el("label", "fs-label");
  applianceLabel.setAttribute("for", "report-export-appliance");
  applianceLabel.textContent = "Appliance";
  const applianceSelect = el("select", "fs-select");
  applianceSelect.id = "report-export-appliance";
  applianceSelect.innerHTML = '<option value="">Select a brigade first</option>';
  applianceField.appendChild(applianceLabel);
  applianceField.appendChild(applianceSelect);

  const dates = defaultDateRange();
  const fromField = el("div", "fs-field");
  const fromLabel = el("label", "fs-label");
  fromLabel.setAttribute("for", "report-export-from");
  fromLabel.textContent = "From";
  const fromInput = el("input", "fs-input");
  fromInput.id = "report-export-from";
  fromInput.type = "date";
  fromInput.value = dates.from;
  fromField.appendChild(fromLabel);
  fromField.appendChild(fromInput);

  const toField = el("div", "fs-field");
  const toLabel = el("label", "fs-label");
  toLabel.setAttribute("for", "report-export-to");
  toLabel.textContent = "To";
  const toInput = el("input", "fs-input");
  toInput.id = "report-export-to";
  toInput.type = "date";
  toInput.value = dates.to;
  toField.appendChild(toLabel);
  toField.appendChild(toInput);

  exportGrid.appendChild(applianceField);
  exportGrid.appendChild(fromField);
  exportGrid.appendChild(toField);

  const exportActions = el("div", "fs-actions");
  const downloadBtn = el("button", "fs-btn fs-btn-primary");
  downloadBtn.type = "button";
  downloadBtn.textContent = "Download PDF";
  const emailBtn = el("button", "fs-btn fs-btn-secondary");
  emailBtn.type = "button";
  emailBtn.textContent = "Email PDF";
  exportActions.appendChild(downloadBtn);
  exportActions.appendChild(emailBtn);

  const exportSuccessEl = el("div", "fs-alert fs-alert-success");
  exportSuccessEl.style.display = "none";
  const exportErrorEl = el("div", "fs-alert fs-alert-error");
  exportErrorEl.style.display = "none";

  exportInner.appendChild(exportGrid);
  exportInner.appendChild(exportActions);
  exportInner.appendChild(exportSuccessEl);
  exportInner.appendChild(exportErrorEl);
  exportCard.appendChild(exportInner);

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
  stack.appendChild(exportCard);
  stack.appendChild(listCard);
  container.appendChild(stack);
  root.appendChild(container);

  const user = auth?.currentUser;
  if (!user) return;

  function setAlert(el, message) {
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function setExportBusy(isBusy) {
    downloadBtn.disabled = isBusy;
    emailBtn.disabled = isBusy;
    applianceSelect.disabled = isBusy;
    fromInput.disabled = isBusy;
    toInput.disabled = isBusy;
  }

  function getExportSelection() {
    const applianceId = applianceSelect.value;
    const from = dateInputToIso(fromInput.value);
    const to = dateInputToIso(toInput.value, { endOfDay: true });
    if (!applianceId) throw new Error("Choose an appliance to export.");
    if (!from || !to) throw new Error("Choose a valid date range.");
    if (new Date(from).getTime() > new Date(to).getTime()) {
      throw new Error("The from date must be before the to date.");
    }
    return { applianceId, from, to };
  }

  async function loadAppliancesForBrigade(brigadeId) {
    setAlert(exportErrorEl, "");
    setAlert(exportSuccessEl, "");
    applianceSelect.innerHTML = '<option value="">Loading appliances...</option>';
    downloadBtn.disabled = true;
    emailBtn.disabled = true;

    try {
      const token = await user.getIdToken();
      const data = await fetchJson(`/api/brigades/${encodeURIComponent(brigadeId)}/data`, { token });
      const appliances = data && Array.isArray(data.appliances) ? data.appliances : [];
      applianceSelect.innerHTML = "";

      if (appliances.length === 0) {
        applianceSelect.innerHTML = '<option value="">No appliances found</option>';
        setAlert(exportErrorEl, "Add an appliance before exporting reports.");
        return;
      }

      appliances.forEach((appliance) => {
        const opt = document.createElement("option");
        opt.value = appliance.id;
        opt.textContent = appliance.name || appliance.id;
        applianceSelect.appendChild(opt);
      });

      downloadBtn.disabled = false;
      emailBtn.disabled = false;
    } catch (err) {
      console.error("Failed to load appliances for export:", err);
      applianceSelect.innerHTML = '<option value="">Could not load appliances</option>';
      setAlert(exportErrorEl, err.message || "Could not load appliances.");
    }
  }

  async function downloadExport() {
    setAlert(exportErrorEl, "");
    setAlert(exportSuccessEl, "");
    try {
      const brigadeId = select.value;
      if (!brigadeId) throw new Error("Choose a brigade to export.");
      const selection = getExportSelection();
      const token = await user.getIdToken();
      const params = new URLSearchParams(selection);
      setExportBusy(true);
      const { blob, filename } = await fetchBlob(
        `/api/reports/brigade/${encodeURIComponent(brigadeId)}/export.pdf?${params.toString()}`,
        { token }
      );
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30000);
      setAlert(exportSuccessEl, "PDF export ready.");
    } catch (err) {
      console.error("Failed to download report export:", err);
      setAlert(exportErrorEl, err.message || "Could not download the PDF.");
    } finally {
      setExportBusy(false);
    }
  }

  async function emailExport() {
    setAlert(exportErrorEl, "");
    setAlert(exportSuccessEl, "");
    try {
      const brigadeId = select.value;
      if (!brigadeId) throw new Error("Choose a brigade to export.");
      const selection = getExportSelection();
      const token = await user.getIdToken();
      setExportBusy(true);
      const data = await fetchJson(
        `/api/reports/brigade/${encodeURIComponent(brigadeId)}/export/email`,
        {
          token,
          method: "POST",
          body: selection,
        }
      );
      setAlert(exportSuccessEl, data.message || "PDF export emailed.");
    } catch (err) {
      console.error("Failed to email report export:", err);
      setAlert(exportErrorEl, err.message || "Could not email the PDF.");
    } finally {
      setExportBusy(false);
    }
  }

  downloadBtn.addEventListener("click", downloadExport);
  emailBtn.addEventListener("click", emailExport);

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

      await loadAppliancesForBrigade(active);
      await loadReportsForBrigade(active);

      select.addEventListener("change", async (e) => {
        const brigadeId = e.target.value;
        if (!brigadeId) return;
        localStorage.setItem("activeBrigadeId", brigadeId);
        await loadAppliancesForBrigade(brigadeId);
        await loadReportsForBrigade(brigadeId);
      });
    } catch (err) {
      console.error("Failed to load brigades:", err);
      setAlert(errorEl, "Could not load your brigades.");
    }
  })();
}
