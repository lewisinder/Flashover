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

function buildReportExportHandoffUrl(pdfUrl) {
  const url = new URL("/report-export-download.html", window.location.origin);
  url.searchParams.set("url", pdfUrl.startsWith("/") ? pdfUrl : new URL(pdfUrl, window.location.origin).pathname);
  return url.toString();
}

function normalizeRole(role) {
  const raw = String(role || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (raw === "admin") return "admin";
  if (raw === "gearmanager") return "gearManager";
  if (raw === "member") return "member";
  if (raw === "viewer") return "viewer";
  return null;
}

function canManageReports(role) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "gearManager";
}

function filenameFromContentDisposition(header) {
  const value = String(header || "");
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch (e) {
      return "";
    }
  }
  const quoted = value.match(/filename="([^"]+)"/i);
  return quoted ? quoted[1] : "";
}

async function downloadReportPdf({ brigadeId, reportId, token, fallbackFilename }) {
  const response = await fetch(
    `/api/brigades/${encodeURIComponent(brigadeId)}/reports/${encodeURIComponent(reportId)}/export.pdf`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromContentDisposition(response.headers.get("Content-Disposition")) || fallbackFilename || "flashover-report.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const downloadBtnLabel = "Download PDF";
  downloadBtn.textContent = downloadBtnLabel;
  const emailBtn = el("button", "fs-btn fs-btn-secondary");
  emailBtn.type = "button";
  const emailBtnLabel = "Email PDF";
  emailBtn.textContent = emailBtnLabel;
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

  document.getElementById("report-action-sheet")?.remove();
  const actionSheet = el("div", "fs-sheet-backdrop hidden");
  actionSheet.id = "report-action-sheet";
  const sheet = el("div", "fs-sheet");
  const sheetTitle = el("div", "fs-sheet-title");
  sheetTitle.textContent = "Report actions";
  const sheetSubtitle = el("div", "fs-row-meta");
  const sheetActions = el("div", "fs-sheet-actions");
  const sheetDownload = el("button", "fs-btn fs-btn-secondary");
  sheetDownload.type = "button";
  sheetDownload.textContent = "Download report";
  const sheetDelete = el("button", "fs-btn fs-btn-danger");
  sheetDelete.type = "button";
  sheetDelete.textContent = "Delete report";
  const sheetCancel = el("button", "fs-btn fs-btn-secondary");
  sheetCancel.type = "button";
  sheetCancel.textContent = "Cancel";
  sheetActions.appendChild(sheetDownload);
  sheetActions.appendChild(sheetDelete);
  sheetActions.appendChild(sheetCancel);
  sheet.appendChild(sheetTitle);
  sheet.appendChild(sheetSubtitle);
  sheet.appendChild(sheetActions);
  actionSheet.appendChild(sheet);
  document.body.appendChild(actionSheet);

  let actionReport = null;
  let actionCanDelete = false;
  let activeBrigade = null;

  function setAlert(el, message) {
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function openActionSheet(report, canDelete) {
    actionReport = report;
    actionCanDelete = !!canDelete;
    sheetSubtitle.textContent = report?.applianceName || "Report";
    sheetDelete.style.display = actionCanDelete ? "" : "none";
    actionSheet.classList.remove("hidden");
  }

  function closeActionSheet() {
    actionSheet.classList.add("hidden");
    actionReport = null;
    actionCanDelete = false;
  }

  sheet.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  actionSheet.addEventListener("click", (e) => {
    if (e.target === actionSheet) closeActionSheet();
  });

  sheetCancel.addEventListener("click", closeActionSheet);

  function setExportLink(message, url) {
    exportSuccessEl.textContent = "";
    exportSuccessEl.style.display = "block";
    exportSuccessEl.append(document.createTextNode(`${message} `));
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open PDF export";
    exportSuccessEl.appendChild(link);
  }

  function setButtonLoading(button, label, isLoading) {
    if (isLoading) {
      button.setAttribute("aria-busy", "true");
      button.innerHTML = `<span class="fs-btn-spinner" aria-hidden="true"></span><span>${label}</span>`;
      return;
    }
    button.removeAttribute("aria-busy");
    button.textContent = label;
  }

  function setExportBusy(isBusy, activeAction = "") {
    downloadBtn.disabled = isBusy;
    emailBtn.disabled = isBusy;
    applianceSelect.disabled = isBusy;
    fromInput.disabled = isBusy;
    toInput.disabled = isBusy;
    setButtonLoading(downloadBtn, activeAction === "download" ? "Preparing PDF..." : downloadBtnLabel, isBusy && activeAction === "download");
    setButtonLoading(emailBtn, activeAction === "email" ? "Emailing PDF..." : emailBtnLabel, isBusy && activeAction === "email");
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
    const handoffWindow = window.open("about:blank", "_blank");
    if (handoffWindow) {
      handoffWindow.document.title = "Preparing PDF export...";
      handoffWindow.document.body.innerHTML = "<p style=\"font-family: sans-serif; padding: 24px;\">Preparing your PDF export...</p>";
    }
    try {
      const brigadeId = select.value;
      if (!brigadeId) throw new Error("Choose a brigade to export.");
      const selection = getExportSelection();
      setExportBusy(true, "download");
      const token = await user.getIdToken();
      const data = await fetchJson(
        `/api/reports/brigade/${encodeURIComponent(brigadeId)}/export/download-link`,
        {
          token,
          method: "POST",
          body: selection,
        }
      );
      if (!data || !data.url) throw new Error("Could not prepare the PDF download.");
      const pdfUrl = data.url.startsWith("/") ? data.url : new URL(data.url, window.location.origin).pathname;
      const handoffUrl = buildReportExportHandoffUrl(pdfUrl);
      if (handoffWindow && !handoffWindow.closed) {
        handoffWindow.location.href = handoffUrl;
        setAlert(exportSuccessEl, "PDF export opened in a new tab.");
      } else {
        setExportLink("PDF export ready.", handoffUrl);
      }
    } catch (err) {
      if (handoffWindow && !handoffWindow.closed) handoffWindow.close();
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
      setExportBusy(true, "email");
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

  async function loadReportsForBrigade(brigadeId, brigade = null) {
    setAlert(errorEl, "");
    list.innerHTML =
      '<div class="fs-row"><div><div class="fs-row-title">Loading…</div><div class="fs-row-meta">Fetching reports</div></div></div>';
    try {
      const token = await user.getIdToken();
      const reports = await fetchJson(`/api/reports/brigade/${encodeURIComponent(brigadeId)}`, { token });
      const canDeleteReports = canManageReports(brigade?.role);

      list.innerHTML = "";
      if (!Array.isArray(reports) || reports.length === 0) {
        list.innerHTML =
          '<div class="fs-row"><div><div class="fs-row-title">No reports yet</div><div class="fs-row-meta">Completed checks will appear here.</div></div></div>';
        return;
      }

      reports.forEach((report) => {
        const card = el("div", "fs-row");
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
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

        const actions = el("div");
        actions.style.display = "flex";
        actions.style.alignItems = "center";
        actions.style.gap = "8px";

        const menu = el("button", "fs-icon-btn");
        menu.type = "button";
        menu.textContent = "⋯";
        menu.setAttribute("aria-label", "More actions");

        const chevron = el("div");
        chevron.style.color = "var(--fs-muted)";
        chevron.style.fontWeight = "900";
        chevron.style.fontSize = "18px";
        chevron.textContent = "›";

        left.appendChild(bubble);
        left.appendChild(text);
        actions.appendChild(menu);
        actions.appendChild(chevron);
        card.appendChild(left);
        card.appendChild(actions);

        const openReport = () => {
          window.location.hash = `#/report/${encodeURIComponent(brigadeId)}/${encodeURIComponent(report.id)}`;
        };

        card.addEventListener("click", openReport);
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openReport();
          }
        });
        menu.addEventListener("click", (e) => {
          e.stopPropagation();
          openActionSheet(report, canDeleteReports);
        });
        list.appendChild(card);
      });
    } catch (err) {
      console.error("Error loading reports:", err);
      list.innerHTML = "";
      setAlert(errorEl, err.message);
    }
  }

  sheetDownload.addEventListener("click", async () => {
    const report = actionReport;
    if (!report) return;
    closeActionSheet();
    setAlert(errorEl, "");
    showLoading?.();
    try {
      const token = await user.getIdToken();
      await downloadReportPdf({
        brigadeId: select.value,
        reportId: report.id,
        token,
        fallbackFilename: `${report.applianceName || "flashover-report"}.pdf`,
      });
    } catch (err) {
      console.error("Failed to download report:", err);
      setAlert(errorEl, err.message || "Could not download the report.");
    } finally {
      hideLoading?.();
    }
  });

  sheetDelete.addEventListener("click", async () => {
    const report = actionReport;
    if (!report || !actionCanDelete) return;
    if (!confirm("Are you sure you want to delete this report? This cannot be undone.")) return;
    closeActionSheet();
    setAlert(errorEl, "");
    showLoading?.();
    try {
      const token = await user.getIdToken();
      await fetchJson(
        `/api/brigades/${encodeURIComponent(select.value)}/reports/${encodeURIComponent(report.id)}`,
        { token, method: "DELETE" }
      );
      await loadReportsForBrigade(select.value, activeBrigade);
    } catch (err) {
      console.error("Failed to delete report:", err);
      setAlert(errorEl, err.message || "Could not delete the report.");
    } finally {
      hideLoading?.();
    }
  });

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
      activeBrigade = brigades.find((b) => b.id === active) || null;

      await loadAppliancesForBrigade(active);
      await loadReportsForBrigade(active, activeBrigade);

      select.addEventListener("change", async (e) => {
        const brigadeId = e.target.value;
        if (!brigadeId) return;
        localStorage.setItem("activeBrigadeId", brigadeId);
        activeBrigade = brigades.find((b) => b.id === brigadeId) || null;
        await loadAppliancesForBrigade(brigadeId);
        await loadReportsForBrigade(brigadeId, activeBrigade);
      });
    } catch (err) {
      console.error("Failed to load brigades:", err);
      setAlert(errorEl, "Could not load your brigades.");
    }
  })();
}
