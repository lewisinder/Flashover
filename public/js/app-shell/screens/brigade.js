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

function safeFormatTimestamp(ts) {
  if (!ts) return "";
  const millis =
    typeof ts === "number"
      ? ts
      : ts._seconds
        ? ts._seconds * 1000
        : ts.seconds
          ? ts.seconds * 1000
          : null;
  if (!millis) return "";
  return new Date(millis).toLocaleString();
}

export async function renderBrigade({ root, auth, brigadeId, setTitle, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "fs-page max-w-4xl mx-auto");
  const stack = el("div", "fs-stack");

  const headerCard = el("div", "fs-card");
  const headerInner = el("div", "fs-card-inner fs-stack");
  const headerTop = el("div");
  const h2 = el("div", "fs-card-title");
  h2.textContent = "Loading brigade…";
  const sub = el("div", "fs-card-subtitle");
  sub.textContent = "";
  headerTop.appendChild(h2);
  headerTop.appendChild(sub);
  headerInner.appendChild(headerTop);
  headerCard.appendChild(headerInner);

  const errorEl = el("div", "fs-alert fs-alert-error");
  errorEl.style.display = "none";

  const joinRequestsCard = el("div", "fs-card hidden");
  const jrInner = el("div", "fs-card-inner fs-stack");
  jrInner.innerHTML = `
    <div>
      <div class="fs-card-title">Join requests</div>
      <div class="fs-card-subtitle">Approve or deny new members.</div>
    </div>
  `;
  const jrList = el("div", "fs-list");
  const jrError = el("div", "fs-alert fs-alert-error");
  jrError.style.display = "none";
  jrInner.appendChild(jrList);
  jrInner.appendChild(jrError);
  joinRequestsCard.appendChild(jrInner);

  const membersCard = el("div", "fs-card");
  const membersInner = el("div", "fs-card-inner fs-stack");
  membersInner.innerHTML = `
    <div>
      <div class="fs-card-title">Members</div>
      <div class="fs-card-subtitle">Roles control who can manage gear and settings.</div>
    </div>
  `;
  const membersList = el("div", "fs-list");
  membersList.innerHTML =
    '<div class="fs-row"><div><div class="fs-row-title">Loading…</div><div class="fs-row-meta">Fetching members</div></div></div>';
  membersInner.appendChild(membersList);
  membersCard.appendChild(membersInner);

  const adminCard = el("div", "fs-card hidden");
  const adminInner = el("div", "fs-card-inner fs-stack");
  adminInner.innerHTML = `
    <div>
      <div class="fs-card-title">Add a member</div>
      <div class="fs-card-subtitle">Invite someone by email.</div>
    </div>
  `;
  const adminForm = el("form", "fs-stack");
  const emailWrap = el("div", "fs-field");
  const emailLabel = el("label", "fs-label");
  emailLabel.setAttribute("for", "member-email-shell");
  emailLabel.textContent = "Email";
  const emailInput = el("input", "fs-input");
  emailInput.type = "email";
  emailInput.required = true;
  emailInput.id = "member-email-shell";
  emailInput.placeholder = "user@example.com";
  emailWrap.appendChild(emailLabel);
  emailWrap.appendChild(emailInput);
  const addBtn = el("button", "fs-btn fs-btn-primary");
  addBtn.type = "submit";
  addBtn.textContent = "Add Member";
  const addError = el("div", "fs-alert fs-alert-error");
  addError.style.display = "none";
  const addSuccess = el("div", "fs-alert fs-alert-success");
  addSuccess.style.display = "none";
  adminForm.appendChild(emailWrap);
  adminForm.appendChild(addBtn);
  adminForm.appendChild(addError);
  adminForm.appendChild(addSuccess);
  adminInner.appendChild(adminForm);
  adminCard.appendChild(adminInner);

  stack.appendChild(headerCard);
  stack.appendChild(errorEl);
  stack.appendChild(joinRequestsCard);
  stack.appendChild(membersCard);
  stack.appendChild(adminCard);
  container.appendChild(stack);
  root.appendChild(container);

  const user = auth?.currentUser;
  if (!user) return;

  function setAlert(el, message) {
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  async function loadBrigadeData() {
    setAlert(errorEl, "");
    showLoading?.();
    try {
      const token = await user.getIdToken();
      const brigadeData = await fetchJson(`/api/brigades/${encodeURIComponent(brigadeId)}`, { token });

      const title = `${brigadeData.name} (${brigadeData.stationNumber})`;
      h2.textContent = title;
      setTitle?.(title);
      sub.textContent = brigadeData.region ? `Region: ${brigadeData.region}` : "";

      const currentMembership = (brigadeData.members || []).find((m) => m.id === user.uid);
      const isAdmin = currentMembership && currentMembership.role === "Admin";

      membersList.innerHTML = "";
      (brigadeData.members || []).forEach((member) => {
        const row = el("div", "fs-row");

        const left = el("div");
        const isSelf = member.id === user.uid;
        left.innerHTML = `
          <div class="fs-row-title">${member.name || "N/A"}${isSelf ? " (you)" : ""}</div>
          <div class="fs-row-meta">${member.email || ""}</div>
        `;

        const actions = el("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.style.alignItems = "center";

        if (isAdmin) {
          const roleSelect = el("select", "fs-select");
          roleSelect.style.width = "auto";
          roleSelect.style.padding = "8px 10px";
          roleSelect.id = `role-${member.id}`;
          ["Member", "Gear Manager", "Admin"].forEach((role) => {
            const opt = document.createElement("option");
            opt.value = role;
            opt.textContent = role;
            if (member.role === role) opt.selected = true;
            roleSelect.appendChild(opt);
          });
          roleSelect.addEventListener("change", async () => {
            setAlert(addError, "");
            setAlert(addSuccess, "");
            showLoading?.();
            try {
              const token = await user.getIdToken();
              const result = await fetchJson(
                `/api/brigades/${encodeURIComponent(brigadeId)}/members/${encodeURIComponent(member.id)}`,
                { token, method: "PUT", body: { role: roleSelect.value } }
              );
              setAlert(addSuccess, result.message || "Role updated.");
            } catch (err) {
              console.error("Error updating role:", err);
              setAlert(addError, err.message);
            } finally {
              hideLoading?.();
            }
          });

          actions.appendChild(roleSelect);

          if (!isSelf) {
            const removeBtn = el("button", "fs-btn fs-btn-danger");
            removeBtn.type = "button";
            removeBtn.textContent = "Remove";
            removeBtn.style.width = "auto";
            removeBtn.style.padding = "8px 10px";
            removeBtn.addEventListener("click", async () => {
              if (
                !confirm(
                  `Are you sure you want to remove ${member.name} from the brigade? This action cannot be undone.`
                )
              ) {
                return;
              }
              setAlert(addError, "");
              setAlert(addSuccess, "");
              showLoading?.();
              try {
                const token = await user.getIdToken();
                const result = await fetchJson(
                  `/api/brigades/${encodeURIComponent(brigadeId)}/members/${encodeURIComponent(member.id)}`,
                  { token, method: "DELETE" }
                );
                setAlert(addSuccess, result.message || "Member removed.");
                await loadBrigadeData();
              } catch (err) {
                console.error("Error removing member:", err);
                setAlert(addError, err.message);
              } finally {
                hideLoading?.();
              }
            });
            actions.appendChild(removeBtn);
          }
        } else {
          const pill = el("span", "fs-pill");
          pill.textContent = member.role || "Member";
          if (String(member.role).toLowerCase() === "admin") pill.classList.add("fs-pill-success");
          actions.appendChild(pill);
        }

        row.appendChild(left);
        if (actions.childNodes.length) row.appendChild(actions);
        membersList.appendChild(row);
      });

      adminCard.classList.toggle("hidden", !isAdmin);
      joinRequestsCard.classList.toggle("hidden", !isAdmin);

      if (isAdmin) {
        await loadJoinRequests();
      }
    } catch (err) {
      console.error("Error loading brigade data:", err);
      setAlert(errorEl, err.message);
      h2.textContent = "Error";
      setTitle?.("Brigade");
      membersList.innerHTML = "";
    } finally {
      hideLoading?.();
    }
  }

  async function loadJoinRequests() {
    jrList.innerHTML =
      '<div class="fs-row"><div><div class="fs-row-title">Loading…</div><div class="fs-row-meta">Fetching join requests</div></div></div>';
    setAlert(jrError, "");
    try {
      const token = await user.getIdToken();
      const requests = await fetchJson(
        `/api/brigades/${encodeURIComponent(brigadeId)}/join-requests`,
        { token }
      );
      jrList.innerHTML = "";
      if (!Array.isArray(requests) || requests.length === 0) {
        jrList.innerHTML =
          '<div class="fs-row"><div><div class="fs-row-title">No requests</div><div class="fs-row-meta">You’re all caught up.</div></div></div>';
        return;
      }

      requests.forEach((req) => {
        const row = el("div", "fs-row");
        const left = el("div");
        left.innerHTML = `
          <div class="fs-row-title">${req.userName || req.id}</div>
          <div class="fs-row-meta">Requested: ${safeFormatTimestamp(req.requestedAt)}</div>
        `;

        const right = el("div");
        right.style.display = "flex";
        right.style.gap = "8px";
        right.style.alignItems = "center";

        const acceptBtn = el("button", "fs-btn fs-btn-primary");
        acceptBtn.type = "button";
        acceptBtn.textContent = "Accept";
        acceptBtn.style.width = "auto";
        acceptBtn.style.padding = "8px 10px";

        const denyBtn = el("button", "fs-btn fs-btn-secondary");
        denyBtn.type = "button";
        denyBtn.textContent = "Deny";
        denyBtn.style.width = "auto";
        denyBtn.style.padding = "8px 10px";

        async function handle(action) {
          setAlert(jrError, "");
          showLoading?.();
          try {
            const token = await user.getIdToken();
            await fetchJson(
              `/api/brigades/${encodeURIComponent(brigadeId)}/join-requests/${encodeURIComponent(req.id)}`,
              { token, method: "POST", body: { action } }
            );
            await loadJoinRequests();
            await loadBrigadeData();
          } catch (err) {
            console.error("Error handling join request:", err);
            setAlert(jrError, err.message);
          } finally {
            hideLoading?.();
          }
        }

        acceptBtn.addEventListener("click", () => handle("accept"));
        denyBtn.addEventListener("click", () => handle("deny"));
        right.appendChild(acceptBtn);
        right.appendChild(denyBtn);

        row.appendChild(left);
        row.appendChild(right);
        jrList.appendChild(row);
      });
    } catch (err) {
      console.error("Error loading join requests:", err);
      setAlert(jrError, err.message);
      jrList.innerHTML = "";
    }
  }

  adminForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setAlert(addError, "");
    setAlert(addSuccess, "");
    addBtn.disabled = true;
    addBtn.textContent = "Adding...";
    showLoading?.();
    try {
      const token = await user.getIdToken();
      const result = await fetchJson(`/api/brigades/${encodeURIComponent(brigadeId)}/members`, {
        token,
        method: "POST",
        body: { email: emailInput.value },
      });
      setAlert(addSuccess, result.message || "Member added.");
      adminForm.reset();
      await loadBrigadeData();
    } catch (err) {
      console.error("Error adding member:", err);
      setAlert(addError, err.message);
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Add Member";
      hideLoading?.();
    }
  });

  // Initial hydrate without blocking route transition.
  void loadBrigadeData();
}
