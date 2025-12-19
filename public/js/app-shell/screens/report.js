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

const statusIcons = {
  present: "/design_assets/Yes Icon.png",
  missing: "/design_assets/No Icon.png",
  note: "/design_assets/Note Icon.png",
  partial: "/design_assets/Note Icon.png",
  defect: "/design_assets/No Icon.png",
  untouched: "/design_assets/Note Icon.png",
};

function renderItem(item, { isSubItem }) {
  const status = (item.status || "").toLowerCase();
  const iconSrc = statusIcons[status] || "/design_assets/No Icon.png";

  const wrap = el("div", isSubItem ? "ml-6" : "");
  const row = el("div", "bg-white p-3 rounded-lg shadow-sm flex items-center");
  const img = el("img");
  img.src = iconSrc;
  img.alt = status || "status";
  img.className = "h-6 w-6 mr-3";
  const name = el("span", "font-semibold");
  name.textContent = item.name || "Item";
  row.appendChild(img);
  row.appendChild(name);
  wrap.appendChild(row);

  if (item.note) {
    const note = el("div", "text-sm text-gray-600 italic pl-10 py-1");
    note.textContent = `Note: ${item.note}`;
    wrap.appendChild(note);
  }

  if (item.type === "container" && Array.isArray(item.subItems) && item.subItems.length > 0) {
    const subWrap = el("div", "mt-2 space-y-2");
    item.subItems.forEach((sub) => {
      subWrap.appendChild(renderItem(sub, { isSubItem: true }));
    });
    wrap.appendChild(subWrap);
  }

  return wrap;
}

export async function renderReport({
  root,
  auth,
  brigadeId,
  reportId,
  setTitle,
  showLoading,
  hideLoading,
}) {
  root.innerHTML = "";

  const container = el("div", "p-4 max-w-4xl mx-auto space-y-4");
  const card = el("div", "bg-white rounded-2xl shadow-lg p-6 space-y-6");

  const errorEl = el("p", "text-red-action-2 text-center");

  const meta = el("div", "bg-gray-100 p-3 rounded-lg shadow space-y-1");
  const metaTitle = el("h3", "text-lg font-bold text-gray-800");
  metaTitle.textContent = "Report Details";
  const metaBy = el("p");
  const metaDate = el("p");
  meta.appendChild(metaTitle);
  meta.appendChild(metaBy);
  meta.appendChild(metaDate);

  const content = el("div", "space-y-4");

  const closeBtn = el("button", "w-full bg-red-action-2 text-white font-bold py-3 px-4 rounded-lg");
  closeBtn.type = "button";
  closeBtn.textContent = "Back to Reports";
  closeBtn.addEventListener("click", () => {
    window.location.hash = "#/reports";
  });

  card.appendChild(errorEl);
  card.appendChild(meta);
  card.appendChild(content);
  card.appendChild(closeBtn);
  container.appendChild(card);
  root.appendChild(container);

  const user = auth?.currentUser;
  if (!user) return;

  showLoading?.();
  try {
    const token = await user.getIdToken();
    const report = await fetchJson(
      `/api/brigades/${encodeURIComponent(brigadeId)}/reports/${encodeURIComponent(reportId)}`,
      { token }
    );

    const title = `Report for ${report.applianceName || "Appliance"}`;
    setTitle?.(title);

    metaBy.innerHTML = `<strong>Checked by:</strong> ${report.username || report.creatorName || "Unknown"}`;
    metaDate.innerHTML = `<strong>Date:</strong> ${report.date ? new Date(report.date).toLocaleString() : ""}`;

    content.innerHTML = "";

    if (Array.isArray(report.lockers) && report.lockers.length > 0) {
      report.lockers.forEach((locker) => {
        const section = el("div", "bg-blue p-4 rounded-xl shadow-lg space-y-3");
        const h = el("h4", "text-white text-center text-xl font-bold uppercase");
        h.textContent = locker.name || "Locker";
        section.appendChild(h);

        const itemsWrap = el("div", "space-y-3");
        (locker.shelves || []).forEach((shelf) => {
          (shelf.items || []).forEach((item) => {
            itemsWrap.appendChild(renderItem(item, { isSubItem: false }));
          });
        });
        section.appendChild(itemsWrap);
        content.appendChild(section);
      });
    } else {
      content.innerHTML = "<p>This report contains no locker data.</p>";
    }
  } catch (err) {
    console.error("Error loading report details:", err);
    errorEl.textContent = err.message;
  } finally {
    hideLoading?.();
  }
}

