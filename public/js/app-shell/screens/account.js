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
      brigadeList.innerHTML =
        '<div class="fs-row"><div><div class="fs-row-title">No brigades yet</div><div class="fs-row-meta">Join or create a brigade from the Brigades tab.</div></div></div>';
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

      const leaveBtn = el("button", "fs-btn fs-btn-secondary");
      leaveBtn.type = "button";
      leaveBtn.style.width = "auto";
      leaveBtn.style.padding = "8px 10px";
      leaveBtn.textContent = "Leave";

      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.alignItems = "center";
      right.appendChild(pill);
      right.appendChild(leaveBtn);

      leaveBtn.addEventListener("click", async () => {
        const ok = confirm(`Leave brigade: ${b.brigadeName || b.id}?`);
        if (!ok) return;
        showLoading?.();
        try {
          const token = await user.getIdToken();
          await fetchJson(`/api/brigades/${encodeURIComponent(b.id)}/leave`, { token, method: "POST" });
          row.remove();
        } catch (err) {
          alert(err.message || "Failed to leave brigade.");
        } finally {
          hideLoading?.();
        }
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
