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

export async function renderAccount({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "fs-page max-w-4xl mx-auto");
  const stack = el("div", "fs-stack");

  const user = auth?.currentUser;
  if (!user) {
    root.innerHTML =
      '<div class="fs-page max-w-md mx-auto"><div class="fs-card"><div class="fs-card-inner"><p>Please sign in.</p></div></div></div>';
    return;
  }

  // Profile
  const profileCard = el("div", "fs-card");
  const profileInner = el("div", "fs-card-inner fs-stack");
  const profileTitle = el("div");
  profileTitle.innerHTML = `<div class="fs-card-title">Account</div><div class="fs-card-subtitle">Profile & preferences</div>`;

  const nameField = el("div", "fs-field");
  const nameLabel = el("label", "fs-label");
  nameLabel.textContent = "Display name";
  const nameInput = el("input", "fs-input");
  nameInput.type = "text";
  nameInput.value = user.displayName || "";
  nameInput.placeholder = "Your name";
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  const emailField = el("div", "fs-field");
  const emailLabel = el("label", "fs-label");
  emailLabel.textContent = "Email";
  const emailInput = el("input", "fs-input");
  emailInput.type = "text";
  emailInput.value = user.email || "";
  emailInput.disabled = true;
  emailField.appendChild(emailLabel);
  emailField.appendChild(emailInput);

  const msg = el("p", "text-sm");
  msg.style.color = "var(--fs-muted)";

  const actions = el("div", "fs-actions");
  const saveBtn = el("button", "fs-btn fs-btn-primary");
  saveBtn.type = "button";
  saveBtn.textContent = "Save profile";

  const resetBtn = el("button", "fs-btn fs-btn-secondary");
  resetBtn.type = "button";
  resetBtn.textContent = "Send password reset email";

  const signOutBtn = el("button", "fs-btn fs-btn-danger");
  signOutBtn.type = "button";
  signOutBtn.textContent = "Sign out";

  actions.appendChild(saveBtn);
  actions.appendChild(resetBtn);
  actions.appendChild(signOutBtn);

  profileInner.appendChild(profileTitle);
  profileInner.appendChild(nameField);
  profileInner.appendChild(emailField);
  profileInner.appendChild(actions);
  profileInner.appendChild(msg);
  profileCard.appendChild(profileInner);

  // Brigades
  const brigadesCard = el("div", "fs-card");
  const brigadesInner = el("div", "fs-card-inner fs-stack");
  brigadesInner.innerHTML = `<div><div class="fs-card-title">My brigades</div><div class="fs-card-subtitle">Your membership & roles</div></div>`;
  const brigadeList = el("div", "fs-list");
  brigadeList.innerHTML = '<div class="fs-row"><div><div class="fs-row-title">Loading…</div></div></div>';
  brigadesInner.appendChild(brigadeList);
  brigadesCard.appendChild(brigadesInner);

  stack.appendChild(profileCard);
  stack.appendChild(brigadesCard);
  container.appendChild(stack);
  root.appendChild(container);

  const existingSheet = document.getElementById("account-action-sheet");
  if (existingSheet) existingSheet.remove();

  const actionSheet = el("div", "fs-sheet-backdrop hidden");
  actionSheet.id = "account-action-sheet";
  const sheet = el("div", "fs-sheet");
  const sheetTitle = el("div", "fs-sheet-title");
  sheetTitle.textContent = "Brigade actions";
  const sheetSubtitle = el("div", "fs-row-meta");
  const sheetActions = el("div", "fs-sheet-actions");
  const sheetManage = el("button", "fs-btn fs-btn-secondary");
  sheetManage.type = "button";
  sheetManage.textContent = "Manage";
  const sheetLeave = el("button", "fs-btn fs-btn-secondary");
  sheetLeave.type = "button";
  sheetLeave.textContent = "Leave";
  const sheetDelete = el("button", "fs-btn fs-btn-danger");
  sheetDelete.type = "button";
  sheetDelete.textContent = "Delete";
  const sheetCancel = el("button", "fs-btn fs-btn-secondary");
  sheetCancel.type = "button";
  sheetCancel.textContent = "Cancel";

  sheetActions.appendChild(sheetManage);
  sheetActions.appendChild(sheetLeave);
  sheetActions.appendChild(sheetDelete);
  sheetActions.appendChild(sheetCancel);
  sheet.appendChild(sheetTitle);
  sheet.appendChild(sheetSubtitle);
  sheet.appendChild(sheetActions);
  actionSheet.appendChild(sheet);
  document.body.appendChild(actionSheet);

  let actionBrigade = null;
  const renderEmptyBrigades = () => {
    brigadeList.innerHTML =
      '<div class="fs-row"><div><div class="fs-row-title">No brigades yet</div><div class="fs-row-meta">Join or create a brigade from the Brigades tab.</div></div></div>';
  };

  function openActionSheet(brigade) {
    actionBrigade = brigade;
    sheetSubtitle.textContent = brigade?.brigadeName || brigade?.id || "";
    const isAdmin = String(brigade?.role || "").toLowerCase() === "admin";
    sheetDelete.style.display = isAdmin ? "" : "none";
    actionSheet.classList.remove("hidden");
  }

  function closeActionSheet() {
    actionSheet.classList.add("hidden");
    actionBrigade = null;
  }

  actionSheet.addEventListener("click", (e) => {
    if (e.target === actionSheet) closeActionSheet();
  });

  sheetCancel.addEventListener("click", closeActionSheet);
  sheetManage.addEventListener("click", () => {
    if (!actionBrigade) return;
    closeActionSheet();
    window.location.hash = `#/brigade/${encodeURIComponent(actionBrigade.id)}`;
  });
  sheetLeave.addEventListener("click", async () => {
    if (!actionBrigade) return;
    const name = actionBrigade.brigadeName || actionBrigade.id;
    if (!confirm(`Leave brigade: ${name}?`)) return;
    closeActionSheet();
    showLoading?.();
    try {
      const token = await user.getIdToken();
      await fetchJson(`/api/brigades/${encodeURIComponent(actionBrigade.id)}/leave`, {
        token,
        method: "POST",
      });
      actionBrigade.row?.remove();
      if (brigadeList.children.length === 0) renderEmptyBrigades();
    } catch (err) {
      alert(err.message || "Failed to leave brigade.");
    } finally {
      hideLoading?.();
    }
  });
  sheetDelete.addEventListener("click", async () => {
    if (!actionBrigade) return;
    const name = actionBrigade.brigadeName || actionBrigade.id;
    if (!confirm(`Are you sure you want to delete the brigade "${name}"? This will remove all members and cannot be undone.`)) {
      return;
    }
    if (!confirm(`Final warning: Deleting "${name}" is permanent. Are you sure?`)) return;
    closeActionSheet();
    showLoading?.();
    try {
      const token = await user.getIdToken();
      await fetchJson(`/api/brigades/${encodeURIComponent(actionBrigade.id)}`, {
        token,
        method: "DELETE",
      });
      actionBrigade.row?.remove();
      if (brigadeList.children.length === 0) renderEmptyBrigades();
    } catch (err) {
      alert(err.message || "Failed to delete brigade.");
    } finally {
      hideLoading?.();
    }
  });

  saveBtn.addEventListener("click", async () => {
    const nextName = nameInput.value.trim();
    if (nextName.length > 60) {
      msg.textContent = "Name is too long.";
      return;
    }
    showLoading?.();
    msg.textContent = "";
    try {
      await user.updateProfile({ displayName: nextName });
      msg.style.color = "var(--fs-muted)";
      msg.textContent = "Saved.";
    } catch (err) {
      console.error("Failed to update profile:", err);
      msg.style.color = "var(--red-action-2)";
      msg.textContent = err.message || "Failed to save.";
    } finally {
      hideLoading?.();
    }
  });

  resetBtn.addEventListener("click", async () => {
    if (!user.email) return;
    showLoading?.();
    msg.textContent = "";
    try {
      await auth.sendPasswordResetEmail(user.email);
      msg.style.color = "var(--fs-muted)";
      msg.textContent = "Password reset email sent.";
    } catch (err) {
      console.error("Failed to send reset email:", err);
      msg.style.color = "var(--red-action-2)";
      msg.textContent = err.message || "Failed to send email.";
    } finally {
      hideLoading?.();
    }
  });

  signOutBtn.addEventListener("click", async () => {
    showLoading?.();
    try {
      await auth.signOut();
    } finally {
      hideLoading?.();
      window.location.href = "/signin.html";
    }
  });

  // Load brigades list + allow leaving (async; don't block route transition).
  void (async () => {
    try {
      const brigades = await getUserBrigades({ db, uid: user.uid });
      brigadeList.innerHTML = "";

      if (brigades.length === 0) {
        renderEmptyBrigades();
        return;
      }

      brigades.forEach((b) => {
        const row = el("div", "fs-row");
        const left = el("div");
        left.innerHTML = `
          <div class="fs-row-title">${b.brigadeName || b.id}</div>
          <div class="fs-row-meta">Role: ${b.role || "Member"}</div>
        `;
        const right = el("div");
        const pill = el("span", `fs-pill ${String(b.role).toLowerCase() === "admin" ? "fs-pill-success" : ""}`);
        pill.textContent = String(b.role || "Member");

        const menuBtn = el("button", "fs-icon-btn");
        menuBtn.type = "button";
        menuBtn.textContent = "⋯";
        menuBtn.setAttribute("aria-label", "More actions");

        right.style.display = "flex";
        right.style.gap = "8px";
        right.style.alignItems = "center";
        right.appendChild(pill);
        right.appendChild(menuBtn);

        menuBtn.addEventListener("click", () => {
          openActionSheet({ ...b, row });
        });

        row.appendChild(left);
        row.appendChild(right);
        brigadeList.appendChild(row);
      });
    } catch (err) {
      console.error("Failed to load brigades (account):", err);
      brigadeList.innerHTML =
        '<div class="fs-row"><div><div class="fs-row-title">Could not load brigades</div><div class="fs-row-meta">Try again later.</div></div></div>';
    }
  })();
}
