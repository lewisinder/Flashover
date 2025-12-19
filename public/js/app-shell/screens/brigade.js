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

  const container = el("div", "p-4 max-w-4xl mx-auto");
  const card = el("div", "bg-white rounded-2xl shadow-lg p-6 space-y-8");

  const header = el("div", "space-y-1");
  const h2 = el("h2", "text-2xl font-bold text-gray-900");
  h2.textContent = "Loading brigade…";
  const sub = el("p", "text-gray-600");
  sub.textContent = "";
  header.appendChild(h2);
  header.appendChild(sub);

  const errorEl = el("p", "text-red-action-2 text-center");

  const joinRequestsSection = el("div", "hidden space-y-3");
  const jrTitle = el("h3", "text-xl font-bold");
  jrTitle.textContent = "Join Requests";
  const jrList = el("div", "space-y-3");
  const jrError = el("p", "text-red-action-2 text-center");
  joinRequestsSection.appendChild(jrTitle);
  joinRequestsSection.appendChild(jrList);
  joinRequestsSection.appendChild(jrError);

  const membersSection = el("div", "space-y-3");
  const membersTitle = el("h3", "text-xl font-bold");
  membersTitle.textContent = "Brigade Members";
  const membersList = el("div", "space-y-3");
  membersList.innerHTML = '<p class="text-gray-600">Loading members...</p>';
  membersSection.appendChild(membersTitle);
  membersSection.appendChild(membersList);

  const adminSection = el("div", "hidden space-y-3");
  const adminTitle = el("h3", "text-xl font-bold");
  adminTitle.textContent = "Add a New Member";
  const adminForm = el("form", "space-y-4");
  const emailWrap = el("div");
  const emailLabel = el("label", "block text-lg font-medium text-gray-700");
  emailLabel.setAttribute("for", "member-email-shell");
  emailLabel.textContent = "User's Email";
  const emailInput = el(
    "input",
    "mt-1 block w-full bg-gray-100 rounded-lg p-3 border border-gray-300 placeholder-gray-500"
  );
  emailInput.type = "email";
  emailInput.required = true;
  emailInput.id = "member-email-shell";
  emailInput.placeholder = "user@example.com";
  emailWrap.appendChild(emailLabel);
  emailWrap.appendChild(emailInput);
  const addBtn = el("button", "w-full bg-blue text-white font-bold py-3 px-4 rounded-lg text-xl");
  addBtn.type = "submit";
  addBtn.textContent = "Add Member";
  const addError = el("p", "text-red-action-2 text-center");
  const addSuccess = el("p", "text-green-action-1 text-center");
  adminForm.appendChild(emailWrap);
  adminForm.appendChild(addBtn);
  adminForm.appendChild(addError);
  adminForm.appendChild(addSuccess);
  adminSection.appendChild(adminTitle);
  adminSection.appendChild(adminForm);

  card.appendChild(header);
  card.appendChild(errorEl);
  card.appendChild(joinRequestsSection);
  card.appendChild(membersSection);
  card.appendChild(el("hr", "my-2"));
  card.appendChild(adminSection);
  container.appendChild(card);
  root.appendChild(container);

  const user = auth?.currentUser;
  if (!user) return;

  async function loadBrigadeData() {
    errorEl.textContent = "";
    showLoading?.();
    try {
      const token = await user.getIdToken();
      const brigadeData = await fetchJson(`/api/brigades/${encodeURIComponent(brigadeId)}`, { token });

      const title = `${brigadeData.name} (${brigadeData.stationNumber})`;
      h2.textContent = title;
      setTitle?.(title);

      const currentMembership = (brigadeData.members || []).find((m) => m.id === user.uid);
      const isAdmin = currentMembership && currentMembership.role === "Admin";

      membersList.innerHTML = "";
      (brigadeData.members || []).forEach((member) => {
        const row = el(
          "div",
          "bg-gray-100 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between"
        );

        const left = el("div");
        left.innerHTML = `<p class="text-lg font-semibold">${member.name || "N/A"}</p>`;
        if (!isAdmin) {
          const roleP = el("p", "text-gray-600");
          roleP.textContent = `Role: ${member.role}`;
          left.appendChild(roleP);
        }

        const actions = el("div", "flex items-center mt-2 sm:mt-0");

        if (isAdmin) {
          const roleSelect = el("select", "bg-white border border-gray-300 rounded-md py-1 px-2");
          roleSelect.id = `role-${member.id}`;
          ["Member", "Gear Manager", "Admin"].forEach((role) => {
            const opt = document.createElement("option");
            opt.value = role;
            opt.textContent = role;
            if (member.role === role) opt.selected = true;
            roleSelect.appendChild(opt);
          });
          roleSelect.addEventListener("change", async () => {
            addError.textContent = "";
            addSuccess.textContent = "";
            showLoading?.();
            try {
              const token = await user.getIdToken();
              const result = await fetchJson(
                `/api/brigades/${encodeURIComponent(brigadeId)}/members/${encodeURIComponent(member.id)}`,
                { token, method: "PUT", body: { role: roleSelect.value } }
              );
              addSuccess.textContent = result.message || "Role updated.";
            } catch (err) {
              console.error("Error updating role:", err);
              addError.textContent = err.message;
            } finally {
              hideLoading?.();
            }
          });

          actions.appendChild(roleSelect);

          const isSelf = member.id === user.uid;
          if (!isSelf) {
            const removeBtn = el("button", "ml-2 bg-red-action-2 text-white font-semibold py-1 px-3 rounded-lg");
            removeBtn.type = "button";
            removeBtn.textContent = "Remove";
            removeBtn.addEventListener("click", async () => {
              if (
                !confirm(
                  `Are you sure you want to remove ${member.name} from the brigade? This action cannot be undone.`
                )
              ) {
                return;
              }
              addError.textContent = "";
              addSuccess.textContent = "";
              showLoading?.();
              try {
                const token = await user.getIdToken();
                const result = await fetchJson(
                  `/api/brigades/${encodeURIComponent(brigadeId)}/members/${encodeURIComponent(member.id)}`,
                  { token, method: "DELETE" }
                );
                addSuccess.textContent = result.message || "Member removed.";
                await loadBrigadeData();
              } catch (err) {
                console.error("Error removing member:", err);
                addError.textContent = err.message;
              } finally {
                hideLoading?.();
              }
            });
            actions.appendChild(removeBtn);
          }
        }

        row.appendChild(left);
        if (actions.childNodes.length) row.appendChild(actions);
        membersList.appendChild(row);
      });

      adminSection.classList.toggle("hidden", !isAdmin);
      joinRequestsSection.classList.toggle("hidden", !isAdmin);

      if (isAdmin) {
        await loadJoinRequests();
      }
    } catch (err) {
      console.error("Error loading brigade data:", err);
      errorEl.textContent = err.message;
      h2.textContent = "Error";
      setTitle?.("Brigade");
      membersList.innerHTML = "";
    } finally {
      hideLoading?.();
    }
  }

  async function loadJoinRequests() {
    jrList.innerHTML = "<p>Loading join requests...</p>";
    jrError.textContent = "";
    try {
      const token = await user.getIdToken();
      const requests = await fetchJson(
        `/api/brigades/${encodeURIComponent(brigadeId)}/join-requests`,
        { token }
      );
      jrList.innerHTML = "";
      if (!Array.isArray(requests) || requests.length === 0) {
        jrList.innerHTML = "<p>There are no pending join requests.</p>";
        return;
      }

      requests.forEach((req) => {
        const row = el("div", "bg-gray-100 p-3 rounded-lg flex justify-between items-center");
        const left = el("div");
        left.innerHTML = `
          <p class="font-semibold">${req.userName || req.id}</p>
          <p class="text-sm text-gray-500">Requested on: ${safeFormatTimestamp(req.requestedAt)}</p>
        `;

        const right = el("div");
        const acceptBtn = el("button", "bg-green-action-1 text-white font-semibold py-1 px-3 rounded-lg");
        acceptBtn.type = "button";
        acceptBtn.textContent = "Accept";
        const denyBtn = el("button", "ml-2 bg-red-action-2 text-white font-semibold py-1 px-3 rounded-lg");
        denyBtn.type = "button";
        denyBtn.textContent = "Deny";

        async function handle(action) {
          jrError.textContent = "";
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
            jrError.textContent = err.message;
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
      jrError.textContent = err.message;
      jrList.innerHTML = "";
    }
  }

  adminForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    addError.textContent = "";
    addSuccess.textContent = "";
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
      addSuccess.textContent = result.message || "Member added.";
      adminForm.reset();
      await loadBrigadeData();
    } catch (err) {
      console.error("Error adding member:", err);
      addError.textContent = err.message;
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Add Member";
      hideLoading?.();
    }
  });

  await loadBrigadeData();
}
