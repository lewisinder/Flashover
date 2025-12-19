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

export async function renderReports({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "p-4 max-w-4xl mx-auto space-y-6");

  const topCard = el("div", "bg-white rounded-2xl shadow-lg p-6 space-y-4");
  const label = el("label", "block text-lg font-medium text-gray-700 mb-2 text-center");
  label.setAttribute("for", "brigade-selector-reports-shell");
  label.textContent = "Select Brigade";
  const select = el(
    "select",
    "w-full bg-white rounded-lg py-3 px-4 border border-gray-300 text-center appearance-none text-lg"
  );
  select.id = "brigade-selector-reports-shell";
  select.innerHTML = '<option value="">Loading brigades...</option>';

  const errorEl = el("p", "text-red-action-2 text-center");

  topCard.appendChild(label);
  topCard.appendChild(select);
  topCard.appendChild(errorEl);

  const listCard = el("div", "bg-white rounded-2xl shadow-lg p-6 space-y-4");
  const title = el("h2", "text-2xl font-bold");
  title.textContent = "Past Reports";
  const list = el("div", "space-y-4");
  list.innerHTML = '<p class="text-gray-600 text-center">Select a brigade to load reports.</p>';

  listCard.appendChild(title);
  listCard.appendChild(list);

  container.appendChild(topCard);
  container.appendChild(listCard);
  root.appendChild(container);

  const user = auth?.currentUser;
  if (!user) return;

  async function loadReportsForBrigade(brigadeId) {
    errorEl.textContent = "";
    list.innerHTML = '<p class="text-gray-600 text-center">Loading reports…</p>';
    showLoading?.();
    try {
      const token = await user.getIdToken();
      const reports = await fetchJson(`/api/reports/brigade/${encodeURIComponent(brigadeId)}`, { token });

      list.innerHTML = "";
      if (!Array.isArray(reports) || reports.length === 0) {
        list.innerHTML = "<p>No reports found for this brigade.</p>";
        return;
      }

      reports.forEach((report) => {
        const card = el(
          "div",
          "bg-white rounded-xl p-4 shadow-[0_4px_8px_3px_rgba(0,0,0,0.12)] cursor-pointer hover:-translate-y-1 transition-transform"
        );
        const who = report.username || report.creatorName || "Unknown";
        const when = report.date ? new Date(report.date).toLocaleString() : "";
        card.innerHTML = `
          <h3 class="text-xl font-bold">${report.applianceName || "Unknown Appliance"}</h3>
          <p class="text-gray-600">Checked by: ${who}</p>
          <p class="text-gray-500 text-sm">${when}</p>
        `;
        card.addEventListener("click", () => {
          window.location.hash = `#/report/${encodeURIComponent(brigadeId)}/${encodeURIComponent(report.id)}`;
        });
        list.appendChild(card);
      });
    } catch (err) {
      console.error("Error loading reports:", err);
      list.innerHTML = "";
      errorEl.textContent = err.message;
    } finally {
      hideLoading?.();
    }
  }

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
    const active = storedExists ? stored : brigades[0].id;
    localStorage.setItem("activeBrigadeId", active);
    select.value = active;

    await loadReportsForBrigade(active);

    select.addEventListener("change", async (e) => {
      const brigadeId = e.target.value;
      if (!brigadeId) return;
      localStorage.setItem("activeBrigadeId", brigadeId);
      await loadReportsForBrigade(brigadeId);
    });
  } catch (err) {
    console.error("Failed to load brigades:", err);
    errorEl.textContent = "Could not load your brigades.";
  } finally {
    hideLoading?.();
  }
}

