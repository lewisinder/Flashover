import { getUserBrigades, invalidateUserBrigades } from "../cache.js";

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

function normalizeRole(role) {
  const raw = String(role || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (raw === "admin") return "admin";
  if (raw === "gearmanager") return "gearManager";
  if (raw === "member") return "member";
  if (raw === "viewer") return "viewer";
  return "";
}

function roleLabel(role) {
  const normalized = normalizeRole(role);
  if (normalized === "admin") return "Admin";
  if (normalized === "gearManager") return "Gear Manager";
  if (normalized === "viewer") return "Viewer";
  if (normalized === "member") return "Member";
  return role || "Member";
}

function isAdminRole(role) {
  return normalizeRole(role) === "admin";
}

function parseBooleanPreference(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return null;
}

function getReportEmailPreference(profile) {
  if (!profile || typeof profile !== "object") return null;
  const candidates = [
    profile.reportEmails,
    profile.reportEmail,
    profile.reportEmailOptIn,
    profile.reportEmailPreference,
    profile.reportEmailsEnabled,
    profile.receiveReportEmails,
    profile.emailPreferences && profile.emailPreferences.reportEmails,
    profile.emailPreferences && profile.emailPreferences.reportEmail,
    profile.emailPreferences && profile.emailPreferences.reportEmailOptIn,
    profile.emailPreferences && profile.emailPreferences.reportEmailPreference,
    profile.emailPreferences && profile.emailPreferences.reportEmailsEnabled,
    profile.emailPreferences && profile.emailPreferences.receiveReportEmails,
    profile.preferences && profile.preferences.reportEmails,
    profile.preferences && profile.preferences.reportEmail,
    profile.preferences && profile.preferences.reportEmailOptIn,
    profile.preferences && profile.preferences.reportEmailPreference,
    profile.preferences && profile.preferences.reportEmailsEnabled,
    profile.preferences && profile.preferences.receiveReportEmails,
  ];
  for (const candidate of candidates) {
    const parsed = parseBooleanPreference(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function brigadesGrantReportEmailsByDefault(brigades = []) {
  return brigades.some((brigade) => {
    const role = normalizeRole(brigade?.role);
    return role === "admin" || role === "gearManager";
  });
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
  nameLabel.textContent = "Full name";
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

  const reportEmailsField = el("div", "fs-field");
  const reportEmailsLabel = el("label", "fs-label");
  reportEmailsLabel.textContent = "Report emails";
  const reportEmailsRow = el("label");
  reportEmailsRow.style.display = "flex";
  reportEmailsRow.style.alignItems = "flex-start";
  reportEmailsRow.style.gap = "10px";
  reportEmailsRow.style.cursor = "pointer";
  const reportEmailsCheckbox = el("input");
  reportEmailsCheckbox.type = "checkbox";
  reportEmailsCheckbox.style.marginTop = "4px";
  const reportEmailsCopy = el("div");
  const reportEmailsCopyTitle = el("div");
  reportEmailsCopyTitle.style.fontWeight = "600";
  reportEmailsCopyTitle.textContent = "Receive report emails";
  const reportEmailsCopyBody = el("div");
  reportEmailsCopyBody.style.color = "var(--fs-muted)";
  reportEmailsCopyBody.style.fontSize = "13px";
  reportEmailsCopyBody.textContent =
    "Admins and gear managers get report emails by default. Everyone else can opt in.";
  reportEmailsCopy.appendChild(reportEmailsCopyTitle);
  reportEmailsCopy.appendChild(reportEmailsCopyBody);
  reportEmailsRow.appendChild(reportEmailsCheckbox);
  reportEmailsRow.appendChild(reportEmailsCopy);
  reportEmailsField.appendChild(reportEmailsLabel);
  reportEmailsField.appendChild(reportEmailsRow);

  const identifierText = el("p", "text-sm");
  identifierText.style.color = "var(--fs-muted)";
  identifierText.textContent = "User ID: Loading...";

  const msg = el("p", "text-sm");
  msg.style.color = "var(--fs-muted)";

  const actions = el("div", "fs-actions");
  const resetBtn = el("button", "fs-btn fs-btn-secondary");
  resetBtn.type = "button";
  resetBtn.textContent = "Send password reset email";

  const signOutBtn = el("button", "fs-btn fs-btn-danger");
  signOutBtn.type = "button";
  signOutBtn.textContent = "Sign out";

  actions.appendChild(resetBtn);
  actions.appendChild(signOutBtn);

  profileInner.appendChild(profileTitle);
  profileInner.appendChild(nameField);
  profileInner.appendChild(emailField);
  profileInner.appendChild(reportEmailsField);
  profileInner.appendChild(identifierText);
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
  let isHydratingProfile = true;
  let saveTimer = null;
  let latestSaveToken = 0;
  let lastSavedProfileState = null;
  const renderEmptyBrigades = () => {
    brigadeList.innerHTML =
      '<div class="fs-row"><div><div class="fs-row-title">No brigades yet</div><div class="fs-row-meta">Join or create a brigade from the Brigades tab.</div></div></div>';
  };

  function currentProfileState() {
    return {
      fullName: nameInput.value.trim(),
      reportEmails: !!reportEmailsCheckbox.checked,
    };
  }

  function sameProfileState(a, b) {
    return !!a && !!b && a.fullName === b.fullName && a.reportEmails === b.reportEmails;
  }

  function setMessage(text, color = "var(--fs-muted)") {
    msg.style.color = color;
    msg.textContent = text || "";
  }

  async function persistProfile() {
    if (isHydratingProfile) return;
    const nextState = currentProfileState();
    if (!nextState.fullName) {
      setMessage("Full name is required.", "var(--red-action-2)");
      return;
    }
    if (nextState.fullName.length > 60) {
      setMessage("Name is too long.", "var(--red-action-2)");
      return;
    }
    if (sameProfileState(nextState, lastSavedProfileState)) {
      return;
    }

    const saveToken = ++latestSaveToken;
    setMessage("Saving…");
    try {
      await user.updateProfile({ displayName: nextState.fullName });
      const token = await user.getIdToken();
      await fetchJson(`/api/data/${encodeURIComponent(user.uid)}`, {
        token,
        method: "POST",
        body: {
          fullName: nextState.fullName,
          email: user.email || emailInput.value.trim(),
          reportEmailPreference: nextState.reportEmails,
          reportEmails: nextState.reportEmails,
          emailPreferences: {
            reportEmails: nextState.reportEmails,
          },
        },
      });
      lastSavedProfileState = nextState;
      if (saveToken === latestSaveToken) {
        setMessage("Saved.");
      }
    } catch (err) {
      console.error("Failed to save profile:", err);
      if (saveToken === latestSaveToken) {
        setMessage(err.message || "Failed to save.", "var(--red-action-2)");
      }
    }
  }

  function scheduleProfileSave(delay = 700) {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void persistProfile();
    }, delay);
  }

  function openActionSheet(brigade) {
    actionBrigade = brigade;
    sheetSubtitle.textContent = brigade?.brigadeName || brigade?.id || "";
    sheetDelete.style.display = isAdminRole(brigade?.role) ? "" : "none";
    actionSheet.classList.remove("hidden");
  }

  function closeActionSheet() {
    actionSheet.classList.add("hidden");
    actionBrigade = null;
  }

  sheet.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  actionSheet.addEventListener("click", (e) => {
    if (e.target === actionSheet) closeActionSheet();
  });

  async function refreshBrigadesList({ force = false } = {}) {
    const brigades = await getUserBrigades({ db, uid: user.uid, force });
    brigadeList.innerHTML = "";

    if (brigades.length === 0) {
      renderEmptyBrigades();
      return;
    }

    brigades.forEach((b) => {
      const displayRole = roleLabel(b.role);
      const row = el("div", "fs-row");
      const left = el("div");
      const brigadeIdentifier = b.brigadeIdentifier ? `Brigade ID: ${b.brigadeIdentifier}` : "";
      left.innerHTML = `
        <div class="fs-row-title">${b.brigadeName || b.id}</div>
        <div class="fs-row-meta">Role: ${displayRole}</div>
        ${brigadeIdentifier ? `<div class="fs-row-meta fs-row-meta-subtle">${brigadeIdentifier}</div>` : ""}
      `;
      const right = el("div");
      const pill = el("span", `fs-pill ${isAdminRole(b.role) ? "fs-pill-success" : ""}`);
      pill.textContent = displayRole;

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
  }

  sheetCancel.addEventListener("click", closeActionSheet);
  sheetManage.addEventListener("click", () => {
    const brigade = actionBrigade;
    if (!brigade) return;
    closeActionSheet();
    window.location.hash = `#/brigade/${encodeURIComponent(brigade.id)}`;
  });
  sheetLeave.addEventListener("click", async () => {
    const brigade = actionBrigade;
    if (!brigade) return;
    const name = brigade.brigadeName || brigade.id;
    if (!confirm(`Leave brigade: ${name}?`)) return;
    closeActionSheet();
    showLoading?.();
    try {
      const token = await user.getIdToken();
      await fetchJson(`/api/brigades/${encodeURIComponent(brigade.id)}/leave`, {
        token,
        method: "POST",
      });
      invalidateUserBrigades(user.uid);
      await refreshBrigadesList({ force: true });
    } catch (err) {
      alert(err.message || "Failed to leave brigade.");
    } finally {
      hideLoading?.();
    }
  });
  sheetDelete.addEventListener("click", async () => {
    const brigade = actionBrigade;
    if (!brigade) return;
    const name = brigade.brigadeName || brigade.id;
    if (!confirm(`Are you sure you want to delete the brigade "${name}"? This will remove all members and cannot be undone.`)) {
      return;
    }
    if (!confirm(`Final warning: Deleting "${name}" is permanent. Are you sure?`)) return;
    closeActionSheet();
    showLoading?.();
    try {
      const token = await user.getIdToken();
      await fetchJson(`/api/brigades/${encodeURIComponent(brigade.id)}`, {
        token,
        method: "DELETE",
      });
      invalidateUserBrigades(user.uid);
      await refreshBrigadesList({ force: true });
    } catch (err) {
      alert(err.message || "Failed to delete brigade.");
    } finally {
      hideLoading?.();
    }
  });

  nameInput.addEventListener("input", () => {
    if (isHydratingProfile) return;
    const nextName = nameInput.value.trim();
    if (!nextName) {
      setMessage("Full name is required.", "var(--red-action-2)");
      return;
    }
    if (nextName.length > 60) {
      setMessage("Name is too long.", "var(--red-action-2)");
      return;
    }
    setMessage("Changes pending…");
    scheduleProfileSave();
  });

  nameInput.addEventListener("blur", () => {
    if (isHydratingProfile) return;
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    void persistProfile();
  });

  reportEmailsCheckbox.addEventListener("change", () => {
    if (isHydratingProfile) return;
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    void persistProfile();
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

  async function loadProfile() {
    const token = await user.getIdToken();
    const data = await fetchJson(`/api/data/${encodeURIComponent(user.uid)}?t=${Date.now()}`, { token });
    isHydratingProfile = true;
    nameInput.value = data.fullName || data.name || data.displayName || user.displayName || "";
    emailInput.value = data.email || user.email || "";
    reportEmailsCheckbox.checked = getReportEmailPreference(data) ?? false;
    identifierText.textContent = data.identifier ? `User ID: ${data.identifier}` : "";
    lastSavedProfileState = currentProfileState();
    isHydratingProfile = false;
    return data;
  }

  // Load brigades list + allow leaving (async; don't block route transition).
  void (async () => {
    try {
      const profileData = await loadProfile();
      const brigades = await getUserBrigades({ db, uid: user.uid, force: true });
      const reportEmailsPreference = getReportEmailPreference(profileData);
      isHydratingProfile = true;
      reportEmailsCheckbox.checked =
        reportEmailsPreference !== null ? reportEmailsPreference : brigadesGrantReportEmailsByDefault(brigades);
      lastSavedProfileState = currentProfileState();
      isHydratingProfile = false;
      await refreshBrigadesList({ force: true });
    } catch (err) {
      console.error("Failed to load brigades (account):", err);
      identifierText.textContent = "";
      brigadeList.innerHTML =
        '<div class="fs-row"><div><div class="fs-row-title">Could not load brigades</div><div class="fs-row-meta">Try again later.</div></div></div>';
    }
  })();
}
