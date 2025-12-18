function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

const REGIONS = [
  { value: "Te Hiku", label: "Te Hiku (Northland, Whangarei, Auckland)" },
  { value: "Ngā Tai Ki Te Puku", label: "Ngā Tai Ki Te Puku (Hamilton, Thames, Tauranga, Rotorua, Gisborne)" },
  { value: "Te Ūpoko", label: "Te Ūpoko (Napier, New Plymouth, Whanganui, Palmerston North, Wellington)" },
  { value: "Te Ihu", label: "Te Ihu (Nelson, Greymouth, Rolleston, Christchurch, Timaru)" },
  { value: "Te Kei", label: "Te Kei (Queenstown, Dunedin, Invercargill)" },
];

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

export async function renderBrigades({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "p-4 max-w-4xl mx-auto");
  const card = el("div", "bg-white rounded-2xl shadow-lg p-6 space-y-8");

  const user = auth?.currentUser;
  if (!user) {
    card.innerHTML = '<p class="text-center text-gray-700">You need to be signed in.</p>';
    container.appendChild(card);
    root.appendChild(container);
    return;
  }

  const joinTitle = el("h2", "text-2xl font-bold");
  joinTitle.textContent = "Join a Brigade";

  const joinWrap = el("div", "space-y-4");
  const joinLabel = el("label", "block text-lg font-medium text-gray-700");
  joinLabel.setAttribute("for", "join-brigade-region-shell");
  joinLabel.textContent = "Select a Region to Find Brigades";
  const joinSelect = el("select", "mt-1 block w-full bg-gray-100 rounded-lg p-3 border border-gray-300");
  joinSelect.id = "join-brigade-region-shell";
  joinSelect.innerHTML = `<option value="" disabled selected>Select a Region</option>`;
  REGIONS.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.value;
    opt.textContent = r.label;
    joinSelect.appendChild(opt);
  });

  const joinList = el("div", "space-y-4");
  joinList.id = "join-brigades-list-shell";

  const joinError = el("p", "text-red-action-2 text-center");
  const joinSuccess = el("p", "text-green-action-1 text-center");

  joinWrap.appendChild(joinLabel);
  joinWrap.appendChild(joinSelect);
  joinWrap.appendChild(joinList);
  joinWrap.appendChild(joinError);
  joinWrap.appendChild(joinSuccess);

  const myTitle = el("h2", "text-2xl font-bold");
  myTitle.textContent = "My Brigades";
  const myList = el("div", "space-y-4");
  myList.innerHTML = '<p class="text-gray-600">Loading your brigades...</p>';

  const createTitle = el("h2", "text-2xl font-bold");
  createTitle.textContent = "Create a New Brigade";
  const createError = el("p", "text-red-action-2 text-center");

  const form = el("form", "space-y-4");
  form.id = "create-brigade-form-shell";

  const grid = el("div", "grid grid-cols-1 md:grid-cols-2 gap-4");
  const nameWrap = el("div");
  const nameLabel = el("label", "block text-lg font-medium text-gray-700");
  nameLabel.setAttribute("for", "brigade-name-shell");
  nameLabel.textContent = "Name";
  const nameInput = el(
    "input",
    "mt-1 block w-full bg-gray-100 rounded-lg p-3 border border-gray-300 placeholder-gray-500"
  );
  nameInput.id = "brigade-name-shell";
  nameInput.type = "text";
  nameInput.placeholder = "e.g., Titirangi";
  nameInput.required = true;
  nameWrap.appendChild(nameLabel);
  nameWrap.appendChild(nameInput);

  const stationWrap = el("div");
  const stationLabel = el("label", "block text-lg font-medium text-gray-700");
  stationLabel.setAttribute("for", "station-number-shell");
  stationLabel.textContent = "Station Number";
  const stationInput = el(
    "input",
    "mt-1 block w-full bg-gray-100 rounded-lg p-3 border border-gray-300 placeholder-gray-500"
  );
  stationInput.id = "station-number-shell";
  stationInput.type = "text";
  stationInput.placeholder = "e.g., 69";
  stationInput.required = true;
  stationWrap.appendChild(stationLabel);
  stationWrap.appendChild(stationInput);

  grid.appendChild(nameWrap);
  grid.appendChild(stationWrap);

  const regionWrap = el("div");
  const regionLabel = el("label", "block text-lg font-medium text-gray-700");
  regionLabel.setAttribute("for", "brigade-region-shell");
  regionLabel.textContent = "Region";
  const regionSelect = el("select", "mt-1 block w-full bg-gray-100 rounded-lg p-3 border border-gray-300");
  regionSelect.id = "brigade-region-shell";
  regionSelect.required = true;
  regionSelect.innerHTML = `<option value="" disabled selected>Select a Region</option>`;
  REGIONS.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.value;
    opt.textContent = r.value;
    regionSelect.appendChild(opt);
  });
  regionWrap.appendChild(regionLabel);
  regionWrap.appendChild(regionSelect);

  const createBtn = el("button", "w-full bg-blue text-white font-bold py-3 px-4 rounded-lg text-xl");
  createBtn.type = "submit";
  createBtn.textContent = "Create Brigade";

  form.appendChild(grid);
  form.appendChild(regionWrap);
  form.appendChild(createBtn);
  form.appendChild(createError);

  card.appendChild(joinTitle);
  card.appendChild(joinWrap);
  card.appendChild(el("hr", "my-2"));
  card.appendChild(myTitle);
  card.appendChild(myList);
  card.appendChild(el("hr", "my-2"));
  card.appendChild(createTitle);
  card.appendChild(form);

  container.appendChild(card);
  root.appendChild(container);

  async function refreshMyBrigades() {
    showLoading?.();
    try {
      const brigades = await loadUserBrigades({ db, uid: user.uid });
      myList.innerHTML = "";

      if (brigades.length === 0) {
        myList.innerHTML = '<p class="text-gray-700">You are not a member of any brigades yet.</p>';
        return;
      }

      brigades.forEach((brigade) => {
        const isAdmin = brigade.role === "Admin";
        const row = el("div", "bg-gray-100 p-4 rounded-lg flex justify-between items-center");

        const left = el("div");
        left.innerHTML = `
          <h3 class="text-xl font-bold">${brigade.brigadeName || "Brigade"}</h3>
          <p class="text-gray-600">Your Role: <span class="font-semibold">${brigade.role || "Member"}</span></p>
        `;

        const actions = el("div", "flex items-center");

        const manageBtn = el("button", "bg-blue text-white font-semibold py-2 px-4 rounded-lg");
        manageBtn.type = "button";
        manageBtn.textContent = "Manage";
        manageBtn.addEventListener("click", () => {
          window.location.href = `/brigade-management.html?id=${brigade.id}`;
        });

        const leaveBtn = el("button", "ml-2 bg-red-action-1 text-white font-semibold py-2 px-4 rounded-lg");
        leaveBtn.type = "button";
        leaveBtn.textContent = "Leave";
        leaveBtn.addEventListener("click", async () => {
          if (!confirm(`Are you sure you want to leave the brigade "${brigade.brigadeName}"?`)) return;
          joinError.textContent = "";
          joinSuccess.textContent = "";
          showLoading?.();
          try {
            const token = await user.getIdToken();
            const result = await fetchJson(`/api/brigades/${brigade.id}/leave`, { token, method: "POST" });
            joinSuccess.textContent = result.message || "Left brigade.";
            await refreshMyBrigades();
          } catch (err) {
            console.error("Error leaving brigade:", err);
            joinError.textContent = err.message;
          } finally {
            hideLoading?.();
          }
        });

        actions.appendChild(manageBtn);
        actions.appendChild(leaveBtn);

        if (isAdmin) {
          const delBtn = el("button", "ml-2 bg-red-action-2 p-2 rounded-full");
          delBtn.type = "button";
          delBtn.innerHTML = `<img src="/design_assets/No Icon.png" alt="Delete Brigade" class="h-6 w-6">`;
          delBtn.addEventListener("click", async () => {
            const name = brigade.brigadeName || brigade.id;
            if (!confirm(`Are you sure you want to delete the brigade "${name}"? This will remove all members and cannot be undone.`)) {
              return;
            }
            if (!confirm(`Final warning: Deleting "${name}" is permanent. Are you sure?`)) return;
            joinError.textContent = "";
            joinSuccess.textContent = "";
            showLoading?.();
            try {
              const token = await user.getIdToken();
              const result = await fetchJson(`/api/brigades/${brigade.id}`, { token, method: "DELETE" });
              joinSuccess.textContent = result.message || "Deleted brigade.";
              await refreshMyBrigades();
            } catch (err) {
              console.error("Error deleting brigade:", err);
              joinError.textContent = err.message;
            } finally {
              hideLoading?.();
            }
          });
          actions.appendChild(delBtn);
        }

        row.appendChild(left);
        row.appendChild(actions);
        myList.appendChild(row);
      });
    } catch (err) {
      console.error("Error loading brigades:", err);
      myList.innerHTML =
        '<p class="text-red-action-2">Could not load your brigades. Please try again later.</p>';
    } finally {
      hideLoading?.();
    }
  }

  async function requestToJoin(brigadeId, buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = "Requesting...";
    joinError.textContent = "";
    joinSuccess.textContent = "";
    showLoading?.();
    try {
      const token = await user.getIdToken();
      const result = await fetchJson(`/api/brigades/${brigadeId}/join-requests`, { token, method: "POST" });
      joinSuccess.textContent = result.message || "Request sent.";
      buttonEl.textContent = "Request Sent";
      buttonEl.classList.remove("bg-green-action-1");
      buttonEl.classList.add("bg-gray-400");
    } catch (err) {
      console.error("Error sending join request:", err);
      joinError.textContent = err.message;
      buttonEl.disabled = false;
      buttonEl.textContent = "Request to Join";
    } finally {
      hideLoading?.();
    }
  }

  joinSelect.addEventListener("change", async (e) => {
    const region = e.target.value;
    if (!region) return;

    joinList.innerHTML = "<p>Loading brigades in this region...</p>";
    joinError.textContent = "";
    joinSuccess.textContent = "";
    showLoading?.();

    try {
      const token = await user.getIdToken();
      const brigades = await fetchJson(`/api/brigades/region/${encodeURIComponent(region)}`, { token });
      joinList.innerHTML = "";

      if (!Array.isArray(brigades) || brigades.length === 0) {
        joinList.innerHTML = "<p>No brigades found in this region.</p>";
        return;
      }

      brigades.forEach((brigade) => {
        const row = el("div", "bg-gray-100 p-4 rounded-lg flex justify-between items-center");
        const left = el("div");
        left.innerHTML = `<h3 class="text-xl font-bold">${brigade.name} (${brigade.stationNumber})</h3>`;
        const btn = el("button", "bg-green-action-1 text-white font-semibold py-2 px-4 rounded-lg");
        btn.type = "button";
        btn.textContent = "Request to Join";
        btn.addEventListener("click", () => requestToJoin(brigade.id, btn));
        row.appendChild(left);
        row.appendChild(btn);
        joinList.appendChild(row);
      });
    } catch (err) {
      console.error("Error fetching regional brigades:", err);
      joinList.innerHTML = "";
      joinError.textContent = err.message;
    } finally {
      hideLoading?.();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    createError.textContent = "";
    joinError.textContent = "";
    joinSuccess.textContent = "";

    createBtn.disabled = true;
    createBtn.textContent = "Creating...";
    showLoading?.();

    try {
      const token = await user.getIdToken();
      const result = await fetchJson("/api/brigades", {
        token,
        method: "POST",
        body: {
          name: nameInput.value,
          stationNumber: stationInput.value,
          region: regionSelect.value,
          creatorId: user.uid,
          creatorName: user.displayName || user.email,
        },
      });

      console.log(result.message || "Brigade created.");
      form.reset();
      await refreshMyBrigades();
    } catch (err) {
      console.error("Error creating brigade:", err);
      createError.textContent = err.message;
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = "Create Brigade";
      hideLoading?.();
    }
  });

  await refreshMyBrigades();
}
