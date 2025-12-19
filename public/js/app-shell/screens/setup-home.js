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

async function loadUserBrigades({ db, uid }) {
  const snapshot = await db.collection("users").doc(uid).collection("userBrigades").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function renderSetupHome({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "p-4 max-w-4xl mx-auto space-y-6");

  const topCard = el("div", "bg-white rounded-2xl shadow-lg p-6 space-y-4");
  const label = el("label", "block text-lg font-medium text-gray-700 mb-2 text-center");
  label.setAttribute("for", "brigade-selector-setup-shell");
  label.textContent = "Select Brigade";
  const select = el(
    "select",
    "w-full bg-white rounded-lg py-3 px-4 border border-gray-300 text-center appearance-none text-lg"
  );
  select.id = "brigade-selector-setup-shell";
  select.innerHTML = '<option value="">Loading brigades...</option>';
  const errorEl = el("p", "text-red-action-2 text-center");

  topCard.appendChild(label);
  topCard.appendChild(select);
  topCard.appendChild(errorEl);

  const listCard = el("div", "bg-white rounded-2xl shadow-lg p-6 space-y-4");
  const title = el("h2", "text-2xl font-bold");
  title.textContent = "Appliances";
  const list = el("div", "space-y-4");
  list.innerHTML = '<p class="text-gray-600 text-center">Select a brigade to load appliances.</p>';

  const createBtn = el("button", "w-full bg-green-action-1 text-white font-bold py-3 px-4 rounded-lg shadow-lg");
  createBtn.type = "button";
  createBtn.textContent = "+ Create New Appliance";

  listCard.appendChild(title);
  listCard.appendChild(list);
  listCard.appendChild(createBtn);

  container.appendChild(topCard);
  container.appendChild(listCard);
  root.appendChild(container);

  const applianceModal = el("div", "fixed inset-0 w-full h-full flex items-center justify-center hidden");
  applianceModal.style.backgroundColor = "rgba(0,0,0,0.6)";
  applianceModal.style.backdropFilter = "blur(4px)";
  const modalCard = el("div", "bg-white text-gray-900 rounded-2xl p-6 w-11/12 max-w-sm shadow-2xl");
  const modalTitle = el("h3", "text-xl font-bold mb-4");
  const nameInput = el("input", "w-full bg-gray-100 rounded-lg p-2 border border-gray-300 placeholder-gray-500");
  nameInput.type = "text";
  nameInput.placeholder = "eg RAV281";
  const modalBtnRow = el("div", "flex justify-end mt-6");
  const cancelBtn = el("button", "bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg mr-2");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  const saveBtn = el("button", "bg-blue text-white font-bold py-2 px-4 rounded-lg");
  saveBtn.type = "button";
  saveBtn.textContent = "Create";
  modalBtnRow.appendChild(cancelBtn);
  modalBtnRow.appendChild(saveBtn);
  modalCard.appendChild(modalTitle);
  modalCard.appendChild(nameInput);
  modalCard.appendChild(modalBtnRow);
  applianceModal.appendChild(modalCard);
  root.appendChild(applianceModal);

  const deleteModal = el("div", "fixed inset-0 w-full h-full flex items-center justify-center hidden");
  deleteModal.style.backgroundColor = "rgba(0,0,0,0.6)";
  deleteModal.style.backdropFilter = "blur(4px)";
  const deleteCard = el("div", "bg-white text-gray-900 rounded-2xl p-6 w-11/12 max-w-sm shadow-2xl");
  const deleteTitle = el("h3", "text-xl font-bold mb-2");
  deleteTitle.textContent = "Are you sure?";
  const deleteText = el("p", "text-gray-600 mb-6");
  const deleteBtnRow = el("div", "flex justify-end");
  const deleteCancel = el("button", "bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg mr-2");
  deleteCancel.type = "button";
  deleteCancel.textContent = "Cancel";
  const deleteConfirm = el("button", "bg-red-action-2 text-white font-bold py-2 px-4 rounded-lg");
  deleteConfirm.type = "button";
  deleteConfirm.textContent = "Delete";
  deleteBtnRow.appendChild(deleteCancel);
  deleteBtnRow.appendChild(deleteConfirm);
  deleteCard.appendChild(deleteTitle);
  deleteCard.appendChild(deleteText);
  deleteCard.appendChild(deleteBtnRow);
  deleteModal.appendChild(deleteCard);
  root.appendChild(deleteModal);

  let activeBrigadeId = null;
  let truckData = { appliances: [] };
  let editingApplianceId = null;
  let deletingApplianceId = null;

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

  function renderList() {
    list.innerHTML = "";
    const appliances = Array.isArray(truckData?.appliances) ? truckData.appliances : [];
    if (appliances.length === 0) {
      list.innerHTML = '<p class="text-center text-gray-500">No appliances configured for this brigade.</p>';
      return;
    }

    appliances.forEach((appliance) => {
      const row = el(
        "div",
        "bg-gray-100 p-4 rounded-lg flex items-center justify-between shadow-md cursor-pointer hover:bg-gray-200"
      );
      const left = el("div", "flex items-center");
      left.innerHTML = `<img src="/design_assets/Truck Icon.png" alt="Truck" class="h-10 w-10 mr-4"><h3 class="text-xl font-bold">${appliance.name}</h3>`;

      const actions = el("div", "flex items-center gap-2");
      const edit = el("button", "p-2");
      edit.type = "button";
      edit.innerHTML = '<img src="/design_assets/black pencil icon.png" class="h-6 w-6" alt="Edit">';
      const del = el("button", "p-2");
      del.type = "button";
      del.innerHTML = '<img src="/design_assets/No Icon.png" class="h-8 w-8" alt="Delete">';

      actions.appendChild(edit);
      actions.appendChild(del);

      row.appendChild(left);
      row.appendChild(actions);

      row.addEventListener("click", () => {
        localStorage.setItem("selectedApplianceId", appliance.id);
        window.location.hash = `#/setup/${encodeURIComponent(appliance.id)}`;
      });

      edit.addEventListener("click", (e) => {
        e.stopPropagation();
        openModal(appliance.id);
      });
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        openDeleteModal(appliance.id, appliance.name);
      });

      list.appendChild(row);
    });
  }

  async function loadBrigadeData(brigadeId) {
    errorEl.textContent = "";
    list.innerHTML = '<p class="text-gray-600 text-center">Loading appliances…</p>';
    showLoading?.();
    try {
      const token = await auth.currentUser.getIdToken();
      truckData = await fetchJson(`/api/brigades/${encodeURIComponent(brigadeId)}/data`, { token });
      if (!truckData.appliances) truckData.appliances = [];
      renderList();
    } catch (err) {
      console.error("Error loading brigade data (setup):", err);
      list.innerHTML = "";
      errorEl.textContent = err.message;
    } finally {
      hideLoading?.();
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
  createBtn.addEventListener("click", () => openModal(null));
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

  showLoading?.();
  try {
    const brigades = await loadUserBrigades({ db, uid: user.uid });
    select.innerHTML = "";
    if (brigades.length === 0) {
      select.innerHTML = '<option value="">No brigades found</option>';
      list.innerHTML = '<p class="text-gray-700">You are not a member of any brigades yet.</p>';
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

    await loadBrigadeData(activeBrigadeId);

    select.addEventListener("change", async (e) => {
      const brigadeId = e.target.value;
      if (!brigadeId) return;
      activeBrigadeId = brigadeId;
      localStorage.setItem("activeBrigadeId", brigadeId);
      await loadBrigadeData(brigadeId);
    });
  } catch (err) {
    console.error("Failed to load brigades (setup):", err);
    errorEl.textContent = "Could not load your brigades.";
  } finally {
    hideLoading?.();
  }
}

