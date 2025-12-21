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

async function loadUserBrigades({ db, uid }) {
  const snapshot = await db.collection("users").doc(uid).collection("userBrigades").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function clearCheckSession() {
  sessionStorage.removeItem("checkInProgress");
  sessionStorage.removeItem("checkResults");
  sessionStorage.removeItem("currentCheckState");
}

export async function renderChecks({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "p-4 max-w-4xl mx-auto space-y-6");

  const topCard = el("div", "bg-white rounded-2xl shadow-lg p-6 space-y-4");

  const selectorWrap = el("div", "w-full");
  const label = el("label", "block text-lg font-medium text-gray-700 mb-2 text-center");
  label.textContent = "Select Brigade";
  label.setAttribute("for", "brigade-selector-checks-shell");

  const select = el(
    "select",
    "w-full bg-white rounded-lg py-3 px-4 border border-gray-300 text-center appearance-none text-lg"
  );
  select.id = "brigade-selector-checks-shell";
  select.innerHTML = '<option value="">Loading brigades...</option>';
  selectorWrap.appendChild(label);
  selectorWrap.appendChild(select);

  const helperRow = el("div", "grid grid-cols-1 sm:grid-cols-2 gap-3");

  const btnSetup = el("button", "w-full bg-blue text-white font-bold py-3 px-4 rounded-lg");
  btnSetup.type = "button";
  btnSetup.innerHTML = `<span>Set Up Appliances</span>`;
  btnSetup.addEventListener("click", () => {
    window.location.hash = "#/setup";
  });

  const btnReports = el("button", "w-full bg-blue text-white font-bold py-3 px-4 rounded-lg");
  btnReports.type = "button";
  btnReports.innerHTML = `<span>View Past Reports</span>`;
  btnReports.addEventListener("click", () => {
    window.location.hash = "#/reports";
  });

  helperRow.appendChild(btnSetup);
  helperRow.appendChild(btnReports);

  const errorEl = el("p", "text-red-action-2 text-center");
  const successEl = el("p", "text-green-action-1 text-center");

  topCard.appendChild(selectorWrap);
  topCard.appendChild(helperRow);
  topCard.appendChild(errorEl);
  topCard.appendChild(successEl);

  const listCard = el("div", "bg-white rounded-2xl shadow-lg p-6 space-y-4");
  const listTitle = el("h2", "text-2xl font-bold");
  listTitle.textContent = "Choose Appliance";
  const applianceList = el("div", "space-y-4");
  applianceList.innerHTML = '<p class="text-gray-600 text-center">Select a brigade to load appliances.</p>';
  listCard.appendChild(listTitle);
  listCard.appendChild(applianceList);

  container.appendChild(topCard);
  container.appendChild(listCard);

  // Modal for check in progress
  const modalOverlay = el(
    "div",
    "fixed inset-0 w-full h-full flex items-center justify-center hidden"
  );
  modalOverlay.style.backgroundColor = "rgba(0,0,0,0.6)";
  modalOverlay.style.backdropFilter = "blur(4px)";
  modalOverlay.style.zIndex = "50";

  const modal = el("div", "bg-white text-gray-900 rounded-2xl p-6 w-11/12 max-w-sm shadow-2xl text-center");
  const modalTitle = el("h3", "text-xl font-bold mb-4");
  modalTitle.textContent = "Check Already in Progress";
  const modalText = el("p", "text-gray-600 mb-6");
  const resumeBtn = el("button", "w-full bg-blue text-white font-bold py-3 px-4 rounded-lg");
  resumeBtn.type = "button";
  resumeBtn.textContent = "Resume Check";
  const startNewBtn = el("button", "w-full bg-red-action-1 text-white font-bold py-3 px-4 rounded-lg");
  startNewBtn.type = "button";
  startNewBtn.textContent = "Start New Check";
  const cancelBtn = el(
    "button",
    "w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg mt-2"
  );
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";

  const modalButtons = el("div", "flex flex-col space-y-3");
  modalButtons.appendChild(resumeBtn);
  modalButtons.appendChild(startNewBtn);
  modalButtons.appendChild(cancelBtn);

  modal.appendChild(modalTitle);
  modal.appendChild(modalText);
  modal.appendChild(modalButtons);
  modalOverlay.appendChild(modal);

  root.appendChild(container);
  root.appendChild(modalOverlay);

  cancelBtn.addEventListener("click", () => modalOverlay.classList.add("hidden"));

  const user = auth?.currentUser;
  if (!user) return;

  let brigadeMetaById = new Map();
  function updateSetupButton(brigadeId) {
    const meta = brigadeMetaById.get(brigadeId) || {};
    const role = String(meta.role || "").toLowerCase();
    const isAdmin = role === "admin";
    btnSetup.disabled = !isAdmin;
    btnSetup.classList.toggle("opacity-50", !isAdmin);
    btnSetup.classList.toggle("cursor-not-allowed", !isAdmin);
    btnSetup.title = isAdmin ? "" : "Admins only";
  }

  async function loadAppliancesForBrigade(brigadeId) {
    errorEl.textContent = "";
    successEl.textContent = "";
    applianceList.innerHTML = '<p class="text-gray-600 text-center">Loading appliances…</p>';
    showLoading?.();
    try {
      const token = await user.getIdToken();
      const data = await fetchJson(`/api/brigades/${encodeURIComponent(brigadeId)}/data`, { token });

      const appliances = Array.isArray(data?.appliances) ? data.appliances : [];
      applianceList.innerHTML = "";

      if (appliances.length === 0) {
        applianceList.innerHTML =
          '<p class="text-center text-gray-500">No appliances configured for this brigade. Please set one up first.</p>';
        return;
      }

      appliances.forEach((appliance) => {
        const row = el(
          "div",
          "bg-gray-100 p-4 rounded-lg flex items-center justify-between shadow-md cursor-pointer hover:bg-gray-200"
        );

        const left = el("div", "flex items-center");
        left.innerHTML = `<img src="/design_assets/Truck Icon.png" alt="Truck" class="h-10 w-10 mr-4"><h3 class="text-xl font-bold">${appliance.name}</h3>`;

        const right = el("div", "text-right text-sm text-gray-600");
        right.textContent = "";

        row.appendChild(left);
        row.appendChild(right);

        row.addEventListener("click", async () => {
          errorEl.textContent = "";
          successEl.textContent = "";
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
            errorEl.textContent = err.message;
          } finally {
            hideLoading?.();
          }
        });

        applianceList.appendChild(row);
      });
    } catch (err) {
      console.error("Failed to load appliance data:", err);
      applianceList.innerHTML = "";
      errorEl.textContent = err.message;
    } finally {
      hideLoading?.();
    }
  }

  showLoading?.();
  try {
    const brigades = await loadUserBrigades({ db, uid: user.uid });
    brigadeMetaById = new Map(brigades.map((b) => [b.id, b]));
    select.innerHTML = "";
    if (brigades.length === 0) {
      select.innerHTML = '<option value="">No brigades found</option>';
      applianceList.innerHTML =
        '<p class="text-center text-gray-500">You are not a member of any brigades yet.</p>';
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
    errorEl.textContent = "Could not load your brigades.";
  } finally {
    hideLoading?.();
  }
}
