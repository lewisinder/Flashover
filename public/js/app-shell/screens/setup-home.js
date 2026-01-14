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
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function renderSetupHome({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "fs-page max-w-4xl mx-auto");
  const stack = el("div", "fs-stack");

  const topCard = el("div", "fs-card");
  const topInner = el("div", "fs-card-inner fs-stack");
  topInner.innerHTML = `
    <div>
      <div class="fs-card-title">Appliance setup</div>
      <div class="fs-card-subtitle">Admins can create and edit appliances for a brigade.</div>
    </div>
  `;

  const field = el("div", "fs-field");
  const label = el("label", "fs-label");
  label.setAttribute("for", "brigade-selector-setup-shell");
  label.textContent = "Brigade";
  const select = el("select", "fs-select");
  select.id = "brigade-selector-setup-shell";
  select.innerHTML = '<option value="">Loading…</option>';
  field.appendChild(label);
  field.appendChild(select);

  const errorEl = el("div", "fs-alert fs-alert-error");
  errorEl.style.display = "none";
  const adminHintEl = el("div", "fs-alert");
  adminHintEl.style.display = "none";

  topInner.appendChild(field);
  topInner.appendChild(errorEl);
  topInner.appendChild(adminHintEl);
  topCard.appendChild(topInner);

  const listCard = el("div", "fs-card");
  const listInner = el("div", "fs-card-inner fs-stack");
  listInner.innerHTML = `
    <div>
      <div class="fs-card-title">Appliances</div>
      <div class="fs-card-subtitle">Tap an appliance to edit its lockers and items.</div>
    </div>
  `;
  const list = el("div", "fs-list");
  list.innerHTML =
    '<div class="fs-row"><div><div class="fs-row-title">Select a brigade</div><div class="fs-row-meta">Appliances will appear here.</div></div></div>';

  const createBtn = el("button", "fs-btn fs-btn-primary");
  createBtn.type = "button";
  createBtn.textContent = "Create appliance";

  listInner.appendChild(list);
  listInner.appendChild(createBtn);
  listCard.appendChild(listInner);

  stack.appendChild(topCard);
  stack.appendChild(listCard);
  container.appendChild(stack);
  root.appendChild(container);

  const applianceModal = el("div", "fixed inset-0 w-full h-full flex items-center justify-center hidden");
  applianceModal.style.backgroundColor = "rgba(0,0,0,0.6)";
  applianceModal.style.backdropFilter = "blur(4px)";
  const modalCard = el("div", "fs-card");
  modalCard.style.width = "92%";
  modalCard.style.maxWidth = "420px";
  const modalInner = el("div", "fs-card-inner fs-stack");
  const modalTitle = el("div", "fs-card-title");
  const nameInput = el("input", "fs-input");
  nameInput.type = "text";
  nameInput.placeholder = "eg RAV281";
  const modalBtnRow = el("div");
  modalBtnRow.style.display = "flex";
  modalBtnRow.style.justifyContent = "flex-end";
  modalBtnRow.style.gap = "8px";
  const cancelBtn = el("button", "fs-btn fs-btn-secondary");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.width = "auto";
  cancelBtn.style.padding = "8px 10px";
  const saveBtn = el("button", "fs-btn fs-btn-primary");
  saveBtn.type = "button";
  saveBtn.textContent = "Create";
  saveBtn.style.width = "auto";
  saveBtn.style.padding = "8px 10px";
  modalBtnRow.appendChild(cancelBtn);
  modalBtnRow.appendChild(saveBtn);
  modalInner.appendChild(modalTitle);
  modalInner.appendChild(nameInput);
  modalInner.appendChild(modalBtnRow);
  modalCard.appendChild(modalInner);
  applianceModal.appendChild(modalCard);
  root.appendChild(applianceModal);

  const deleteModal = el("div", "fixed inset-0 w-full h-full flex items-center justify-center hidden");
  deleteModal.style.backgroundColor = "rgba(0,0,0,0.6)";
  deleteModal.style.backdropFilter = "blur(4px)";
  const deleteCard = el("div", "fs-card");
  deleteCard.style.width = "92%";
  deleteCard.style.maxWidth = "420px";
  const deleteInner = el("div", "fs-card-inner fs-stack");
  const deleteTitle = el("div", "fs-card-title");
  deleteTitle.textContent = "Are you sure?";
  const deleteText = el("p");
  deleteText.style.color = "var(--fs-muted)";
  const deleteBtnRow = el("div");
  deleteBtnRow.style.display = "flex";
  deleteBtnRow.style.justifyContent = "flex-end";
  deleteBtnRow.style.gap = "8px";
  const deleteCancel = el("button", "fs-btn fs-btn-secondary");
  deleteCancel.type = "button";
  deleteCancel.textContent = "Cancel";
  deleteCancel.style.width = "auto";
  deleteCancel.style.padding = "8px 10px";
  const deleteConfirm = el("button", "fs-btn fs-btn-danger");
  deleteConfirm.type = "button";
  deleteConfirm.textContent = "Delete";
  deleteConfirm.style.width = "auto";
  deleteConfirm.style.padding = "8px 10px";
  deleteBtnRow.appendChild(deleteCancel);
  deleteBtnRow.appendChild(deleteConfirm);
  deleteInner.appendChild(deleteTitle);
  deleteInner.appendChild(deleteText);
  deleteInner.appendChild(deleteBtnRow);
  deleteCard.appendChild(deleteInner);
  deleteModal.appendChild(deleteCard);
  root.appendChild(deleteModal);

  const actionSheet = el("div", "fs-sheet-backdrop hidden");
  const sheet = el("div", "fs-sheet");
  const sheetTitle = el("div", "fs-sheet-title");
  sheetTitle.textContent = "Appliance actions";
  const sheetSubtitle = el("div", "fs-row-meta");
  const sheetActions = el("div", "fs-sheet-actions");
  const sheetRename = el("button", "fs-btn fs-btn-secondary");
  sheetRename.type = "button";
  sheetRename.textContent = "Rename";
  const sheetDelete = el("button", "fs-btn fs-btn-danger");
  sheetDelete.type = "button";
  sheetDelete.textContent = "Delete";
  const sheetCancel = el("button", "fs-btn fs-btn-secondary");
  sheetCancel.type = "button";
  sheetCancel.textContent = "Cancel";
  sheetActions.appendChild(sheetRename);
  sheetActions.appendChild(sheetDelete);
  sheetActions.appendChild(sheetCancel);
  sheet.appendChild(sheetTitle);
  sheet.appendChild(sheetSubtitle);
  sheet.appendChild(sheetActions);
  actionSheet.appendChild(sheet);
  root.appendChild(actionSheet);

  let activeBrigadeId = null;
  let truckData = { appliances: [] };
  let editingApplianceId = null;
  let deletingApplianceId = null;
  let actionApplianceId = null;
  let actionApplianceName = "";
  let canEdit = true;

  function setAlert(el, message) {
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function updateAdminUi(brigadeId) {
    const role = String((brigadeMetaById.get(brigadeId) || {}).role || "").toLowerCase();
    canEdit = role === "admin";
    setAlert(adminHintEl, canEdit ? "" : "Admins only: you don’t have permission to edit appliance setup.");
    createBtn.disabled = !canEdit;
    createBtn.title = canEdit ? "" : "Admins only";
  }

  function openModal(applianceId) {
    editingApplianceId = applianceId || null;
    if (editingApplianceId) {
      const appliance = truckData.appliances.find((a) => a.id === editingApplianceId);
      modalTitle.textContent = "Edit Appliance";
      nameInput.value = appliance?.name || "";
      saveBtn.textContent = "Save";
    } else {
      modalTitle.textContent = "Create New Appliance";
      nameInput.value = "";
      saveBtn.textContent = "Create";
    }
    applianceModal.classList.remove("hidden");
    nameInput.focus();
  }

  function closeModal() {
    applianceModal.classList.add("hidden");
  }

  function openDeleteModal(applianceId, applianceName) {
    deletingApplianceId = applianceId;
    deleteText.textContent = `This will permanently delete the appliance "${applianceName}" and all its contents. This action cannot be undone.`;
    deleteModal.classList.remove("hidden");
  }

  function closeDeleteModal() {
    deleteModal.classList.add("hidden");
    deletingApplianceId = null;
  }

  function openActionSheet(appliance) {
    actionApplianceId = appliance?.id || null;
    actionApplianceName = appliance?.name || "";
    sheetSubtitle.textContent = actionApplianceName;
    actionSheet.classList.remove("hidden");
  }

  function closeActionSheet() {
    actionSheet.classList.add("hidden");
    actionApplianceId = null;
    actionApplianceName = "";
  }

  actionSheet.addEventListener("click", (e) => {
    if (e.target === actionSheet) closeActionSheet();
  });

  sheetCancel.addEventListener("click", closeActionSheet);
  sheetRename.addEventListener("click", () => {
    if (!actionApplianceId) return;
    closeActionSheet();
    openModal(actionApplianceId);
  });
  sheetDelete.addEventListener("click", () => {
    if (!actionApplianceId) return;
    closeActionSheet();
    openDeleteModal(actionApplianceId, actionApplianceName);
  });

  function renderList() {
    list.innerHTML = "";
    const appliances = Array.isArray(truckData?.appliances) ? truckData.appliances : [];
    if (appliances.length === 0) {
      list.innerHTML =
        '<div class="fs-row"><div><div class="fs-row-title">No appliances yet</div><div class="fs-row-meta">Create one to start setting up lockers.</div></div></div>';
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
      text.innerHTML = `<div class="fs-row-title">${appliance.name}</div><div class="fs-row-meta">Edit lockers & items</div>`;
      left.appendChild(bubble);
      left.appendChild(text);

      const actions = el("div");
      actions.style.display = "flex";
      actions.style.alignItems = "center";

      const menu = el("button", "fs-icon-btn");
      menu.type = "button";
      menu.textContent = "⋯";
      menu.setAttribute("aria-label", "More actions");
      if (!canEdit) menu.style.display = "none";

      actions.appendChild(menu);

      row.appendChild(left);
      row.appendChild(actions);

      row.addEventListener("click", () => {
        if (!canEdit) {
          alert("Admins only: you don't have permission to edit appliance setup.");
          return;
        }
        localStorage.setItem("selectedApplianceId", appliance.id);
        window.location.hash = `#/setup/${encodeURIComponent(appliance.id)}`;
      });

      menu.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!canEdit) {
          alert("Admins only: you don't have permission to edit appliance setup.");
          return;
        }
        openActionSheet(appliance);
      });

      list.appendChild(row);
    });
  }

  async function loadBrigadeData(brigadeId) {
    setAlert(errorEl, "");
    list.innerHTML =
      '<div class="fs-row"><div><div class="fs-row-title">Loading…</div><div class="fs-row-meta">Fetching appliances</div></div></div>';
    try {
      const token = await auth.currentUser.getIdToken();
      truckData = await fetchJson(`/api/brigades/${encodeURIComponent(brigadeId)}/data`, { token });
      if (!truckData.appliances) truckData.appliances = [];
      renderList();
    } catch (err) {
      console.error("Error loading brigade data (setup):", err);
      list.innerHTML = "";
      setAlert(errorEl, err.message);
    }
  }

  async function saveBrigadeData() {
    if (!activeBrigadeId) return;
    showLoading?.();
    try {
      const token = await auth.currentUser.getIdToken();
      await fetchJson(`/api/brigades/${encodeURIComponent(activeBrigadeId)}/data`, {
        token,
        method: "POST",
        body: truckData,
      });
    } finally {
      hideLoading?.();
    }
  }

  cancelBtn.addEventListener("click", closeModal);
  createBtn.addEventListener("click", () => {
    if (!canEdit) {
      alert("Admins only: you don't have permission to edit appliance setup.");
      return;
    }
    openModal(null);
  });
  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      alert("Appliance name cannot be empty.");
      return;
    }

    if (editingApplianceId) {
      const appliance = truckData.appliances.find((a) => a.id === editingApplianceId);
      if (appliance) appliance.name = name;
    } else {
      truckData.appliances.push({ id: String(Date.now()), name, lockers: [] });
    }

    await saveBrigadeData();
    renderList();
    closeModal();
  });

  deleteCancel.addEventListener("click", closeDeleteModal);
  deleteConfirm.addEventListener("click", async () => {
    if (!deletingApplianceId) return;
    truckData.appliances = (truckData.appliances || []).filter((a) => a.id !== deletingApplianceId);
    closeDeleteModal();
    await saveBrigadeData();
    renderList();
  });

  const user = auth?.currentUser;
  if (!user) return;

  let brigadeMetaById = new Map();
  // Don't block route transitions on network reads; render immediately and hydrate async.
  void (async () => {
    try {
      const brigades = await getUserBrigades({ db, uid: user.uid });
      brigadeMetaById = new Map(brigades.map((b) => [b.id, b]));
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
      activeBrigadeId = storedExists ? stored : brigades[0].id;
      localStorage.setItem("activeBrigadeId", activeBrigadeId);
      select.value = activeBrigadeId;

      updateAdminUi(activeBrigadeId);
      await loadBrigadeData(activeBrigadeId);

      select.addEventListener("change", async (e) => {
        const brigadeId = e.target.value;
        if (!brigadeId) return;
        activeBrigadeId = brigadeId;
        localStorage.setItem("activeBrigadeId", brigadeId);
        updateAdminUi(brigadeId);
        await loadBrigadeData(brigadeId);
      });
    } catch (err) {
      console.error("Failed to load brigades (setup):", err);
      setAlert(errorEl, "Could not load your brigades.");
    }
  })();
}
