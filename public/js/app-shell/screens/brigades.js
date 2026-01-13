import { getUserBrigades, invalidateUserBrigades } from "../cache.js";

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

export async function renderBrigades({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "fs-page max-w-4xl mx-auto");
  const stack = el("div", "fs-stack");

  const user = auth?.currentUser;
  if (!user) {
    const card = el("div", "fs-card");
    card.innerHTML =
      '<div class="fs-card-inner"><div class="fs-card-title">You’re signed out</div><div class="fs-card-subtitle">Please sign in to manage brigades.</div></div>';
    container.appendChild(card);
    root.appendChild(container);
    return;
  }

  function setAlert(el, message) {
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  const statusError = el("div", "fs-alert fs-alert-error");
  statusError.style.display = "none";
  const statusSuccess = el("div", "fs-alert fs-alert-success");
  statusSuccess.style.display = "none";

  // My brigades card
  const myCard = el("div", "fs-card");
  const myInner = el("div", "fs-card-inner fs-stack");
  myInner.innerHTML = `
    <div>
      <div class="fs-card-title">My brigades</div>
      <div class="fs-card-subtitle">Your memberships and roles.</div>
    </div>
  `;
  const myList = el("div", "fs-list");
  myList.innerHTML =
    '<div class="fs-row"><div><div class="fs-row-title">Loading…</div><div class="fs-row-meta">Fetching your brigades</div></div></div>';
  myInner.appendChild(myList);
  myCard.appendChild(myInner);

  // Join a brigade card
  const joinCard = el("div", "fs-card");
  const joinInner = el("div", "fs-card-inner fs-stack");
  joinInner.innerHTML = `
    <div>
      <div class="fs-card-title">Join a brigade</div>
      <div class="fs-card-subtitle">Pick a region, then request to join.</div>
    </div>
  `;

  const joinField = el("div", "fs-field");
  const joinLabel = el("label", "fs-label");
  joinLabel.setAttribute("for", "join-brigade-region-shell");
  joinLabel.textContent = "Region";

  const joinSelect = el("select", "fs-select");
  joinSelect.id = "join-brigade-region-shell";
  joinSelect.innerHTML = `<option value="" disabled selected>Select a Region</option>`;
  REGIONS.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.value;
    opt.textContent = r.label;
    joinSelect.appendChild(opt);
  });

  joinField.appendChild(joinLabel);
  joinField.appendChild(joinSelect);

  const joinList = el("div", "fs-list");
  joinList.id = "join-brigades-list-shell";
  joinList.innerHTML =
    '<div class="fs-row"><div><div class="fs-row-title">Choose a region</div><div class="fs-row-meta">Brigades will appear here.</div></div></div>';

  const joinCardError = el("div", "fs-alert fs-alert-error");
  joinCardError.style.display = "none";

  joinInner.appendChild(joinField);
  joinInner.appendChild(joinList);
  joinInner.appendChild(joinCardError);
  joinCard.appendChild(joinInner);

  // Create brigade card
  const createCard = el("div", "fs-card");
  const createInner = el("div", "fs-card-inner fs-stack");
  createInner.innerHTML = `
    <div>
      <div class="fs-card-title">Create a brigade</div>
      <div class="fs-card-subtitle">For admins setting up a new station.</div>
    </div>
  `;

  const createError = el("div", "fs-alert fs-alert-error");
  createError.style.display = "none";

  const form = el("form", "fs-stack");
  form.id = "create-brigade-form-shell";

  const grid = el("div", "fs-grid");
  const nameWrap = el("div", "fs-field");
  const nameLabel = el("label", "fs-label");
  nameLabel.setAttribute("for", "brigade-name-shell");
  nameLabel.textContent = "Name";
  const nameInput = el("input", "fs-input");
  nameInput.id = "brigade-name-shell";
  nameInput.type = "text";
  nameInput.placeholder = "e.g., Titirangi";
  nameInput.required = true;
  nameWrap.appendChild(nameLabel);
  nameWrap.appendChild(nameInput);

  const stationWrap = el("div", "fs-field");
  const stationLabel = el("label", "fs-label");
  stationLabel.setAttribute("for", "station-number-shell");
  stationLabel.textContent = "Station Number";
  const stationInput = el("input", "fs-input");
  stationInput.id = "station-number-shell";
  stationInput.type = "text";
  stationInput.placeholder = "e.g., 69";
  stationInput.required = true;
  stationWrap.appendChild(stationLabel);
  stationWrap.appendChild(stationInput);

  grid.appendChild(nameWrap);
  grid.appendChild(stationWrap);

  const regionWrap = el("div", "fs-field");
  const regionLabel = el("label", "fs-label");
  regionLabel.setAttribute("for", "brigade-region-shell");
  regionLabel.textContent = "Region";
  const regionSelect = el("select", "fs-select");
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

  const createBtn = el("button", "fs-btn fs-btn-primary");
  createBtn.type = "submit";
  createBtn.textContent = "Create";

  form.appendChild(grid);
  form.appendChild(regionWrap);
  form.appendChild(createBtn);
  form.appendChild(createError);

  createInner.appendChild(form);
  createCard.appendChild(createInner);

  stack.appendChild(statusError);
  stack.appendChild(statusSuccess);
  stack.appendChild(myCard);
  stack.appendChild(joinCard);
  stack.appendChild(createCard);
  container.appendChild(stack);
  root.appendChild(container);

  async function refreshMyBrigades({ force = false } = {}) {
    try {
      const brigades = await getUserBrigades({ db, uid: user.uid, force });
      if (!container.isConnected) return;
      myList.innerHTML = "";

      if (brigades.length === 0) {
        myList.innerHTML =
          '<div class="fs-row"><div><div class="fs-row-title">No brigades yet</div><div class="fs-row-meta">Join one below, or create a new brigade.</div></div></div>';
        return;
      }

      brigades.forEach((brigade) => {
        const isAdmin = brigade.role === "Admin";
        const row = el("div", "fs-row");

        const left = el("div");
        left.innerHTML = `
          <div class="fs-row-title">${brigade.brigadeName || "Brigade"}</div>
          <div class="fs-row-meta">Role: ${brigade.role || "Member"}</div>
        `;

        const actions = el("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.style.alignItems = "center";

        const rolePill = el("span", `fs-pill ${isAdmin ? "fs-pill-success" : ""}`);
        rolePill.textContent = brigade.role || "Member";

        const manageBtn = el("button", "fs-btn fs-btn-secondary");
        manageBtn.type = "button";
        manageBtn.textContent = "Manage";
        manageBtn.style.width = "auto";
        manageBtn.style.padding = "8px 10px";
        manageBtn.addEventListener("click", () => {
          window.location.hash = `#/brigade/${encodeURIComponent(brigade.id)}`;
        });

        const leaveBtn = el("button", "fs-btn fs-btn-secondary");
        leaveBtn.type = "button";
        leaveBtn.textContent = "Leave";
        leaveBtn.style.width = "auto";
        leaveBtn.style.padding = "8px 10px";
        leaveBtn.addEventListener("click", async () => {
          if (!confirm(`Are you sure you want to leave the brigade "${brigade.brigadeName}"?`)) return;
          setAlert(statusError, "");
          setAlert(statusSuccess, "");
	          showLoading?.();
	          try {
	            const token = await user.getIdToken();
	            const result = await fetchJson(`/api/brigades/${brigade.id}/leave`, { token, method: "POST" });
	            setAlert(statusSuccess, result.message || "Left brigade.");
	            invalidateUserBrigades(user.uid);
	            await refreshMyBrigades({ force: true });
	          } catch (err) {
	            console.error("Error leaving brigade:", err);
	            setAlert(statusError, err.message);
	          } finally {
            hideLoading?.();
          }
        });

        actions.appendChild(rolePill);
        actions.appendChild(manageBtn);
        actions.appendChild(leaveBtn);

        if (isAdmin) {
          const delBtn = el("button", "fs-btn fs-btn-danger");
          delBtn.type = "button";
          delBtn.textContent = "Delete";
          delBtn.style.width = "auto";
          delBtn.style.padding = "8px 10px";
          delBtn.addEventListener("click", async () => {
            const name = brigade.brigadeName || brigade.id;
            if (!confirm(`Are you sure you want to delete the brigade "${name}"? This will remove all members and cannot be undone.`)) {
              return;
            }
            if (!confirm(`Final warning: Deleting "${name}" is permanent. Are you sure?`)) return;
            setAlert(statusError, "");
            setAlert(statusSuccess, "");
            showLoading?.();
	            try {
	              const token = await user.getIdToken();
	              const result = await fetchJson(`/api/brigades/${brigade.id}`, { token, method: "DELETE" });
	              setAlert(statusSuccess, result.message || "Deleted brigade.");
	              invalidateUserBrigades(user.uid);
	              await refreshMyBrigades({ force: true });
	            } catch (err) {
	              console.error("Error deleting brigade:", err);
	              setAlert(statusError, err.message);
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
    }
  }

  async function requestToJoin(brigadeId, buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = "Requesting...";
    setAlert(joinCardError, "");
    showLoading?.();
    try {
      const token = await user.getIdToken();
      const result = await fetchJson(`/api/brigades/${brigadeId}/join-requests`, { token, method: "POST" });
      setAlert(statusSuccess, result.message || "Request sent.");
      buttonEl.textContent = "Requested";
      buttonEl.className = "fs-btn fs-btn-secondary";
      buttonEl.style.width = "auto";
      buttonEl.style.padding = "8px 10px";
    } catch (err) {
      console.error("Error sending join request:", err);
      setAlert(joinCardError, err.message);
      buttonEl.disabled = false;
      buttonEl.textContent = "Request to Join";
    } finally {
      hideLoading?.();
    }
  }

  joinSelect.addEventListener("change", async (e) => {
    const region = e.target.value;
    if (!region) return;

    joinList.innerHTML =
      '<div class="fs-row"><div><div class="fs-row-title">Loading…</div><div class="fs-row-meta">Fetching brigades in this region</div></div></div>';
    setAlert(joinCardError, "");
    showLoading?.();

    try {
      const token = await user.getIdToken();
      const brigades = await fetchJson(`/api/brigades/region/${encodeURIComponent(region)}`, { token });
      joinList.innerHTML = "";

      if (!Array.isArray(brigades) || brigades.length === 0) {
        joinList.innerHTML =
          '<div class="fs-row"><div><div class="fs-row-title">No brigades found</div><div class="fs-row-meta">Try another region.</div></div></div>';
        return;
      }

      brigades.forEach((brigade) => {
        const row = el("div", "fs-row");
        const left = el("div");
        left.innerHTML = `
          <div class="fs-row-title">${brigade.name} (${brigade.stationNumber})</div>
          <div class="fs-row-meta">Region: ${brigade.region || ""}</div>
        `;
        const btn = el("button", "fs-btn fs-btn-primary");
        btn.type = "button";
        btn.textContent = "Request to Join";
        btn.style.width = "auto";
        btn.style.padding = "8px 10px";
        btn.addEventListener("click", () => requestToJoin(brigade.id, btn));
        row.appendChild(left);
        row.appendChild(btn);
        joinList.appendChild(row);
      });
    } catch (err) {
      console.error("Error fetching regional brigades:", err);
      joinList.innerHTML = "";
      setAlert(joinCardError, err.message);
    } finally {
      hideLoading?.();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setAlert(createError, "");
    setAlert(statusError, "");
    setAlert(statusSuccess, "");

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
      setAlert(statusSuccess, result.message || "Brigade created.");
      form.reset();
      invalidateUserBrigades(user.uid);
      await refreshMyBrigades({ force: true });
    } catch (err) {
      console.error("Error creating brigade:", err);
      setAlert(createError, err.message);
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = "Create";
      hideLoading?.();
    }
  });

  // Initial hydrate without blocking route transition.
  void refreshMyBrigades();
}
