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
  const iconSrc = statusIcons[status] || "/design_assets/Note Icon.png";

  const wrap = el("div");
  if (isSubItem) {
    wrap.style.marginLeft = "18px";
    wrap.style.paddingLeft = "12px";
    wrap.style.borderLeft = "2px solid rgba(15, 23, 42, 0.10)";
  }

  const row = el("div", "fs-row");
  const left = el("div");
  left.style.display = "flex";
  left.style.alignItems = "center";
  left.style.gap = "12px";

  const bubble = el("div", "fs-icon-bubble");
  bubble.innerHTML = `<img src="${iconSrc}" alt="" />`;

  const text = el("div");
  text.innerHTML = `<div class="fs-row-title">${item.name || "Item"}</div>`;

  const pill = el("span", "fs-pill");
  const statusLabel = status ? status[0].toUpperCase() + status.slice(1) : "Unknown";
  pill.textContent = statusLabel;
  if (status === "present") pill.classList.add("fs-pill-success");
  else if (status === "missing" || status === "defect") pill.classList.add("fs-pill-danger");
  else pill.classList.add("fs-pill-warn");

  left.appendChild(bubble);
  left.appendChild(text);
  row.appendChild(left);
  row.appendChild(pill);
  wrap.appendChild(row);

  if (item.note) {
    const note = el("div", "fs-row-meta");
    note.style.marginLeft = isSubItem ? "56px" : "56px";
    note.style.padding = "6px 0 0";
    note.textContent = item.note;
    wrap.appendChild(note);
  }

  if (item.type === "container" && Array.isArray(item.subItems) && item.subItems.length > 0) {
    const subWrap = el("div");
    subWrap.style.marginTop = "10px";
    subWrap.style.display = "flex";
    subWrap.style.flexDirection = "column";
    subWrap.style.gap = "10px";
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

  const container = el("div", "fs-page max-w-4xl mx-auto");
  const stack = el("div", "fs-stack");

  const errorEl = el("div", "fs-alert fs-alert-error");
  errorEl.style.display = "none";

  const metaCard = el("div", "fs-card");
  const metaInner = el("div", "fs-card-inner fs-stack");
  const metaTitle = el("div");
  metaTitle.innerHTML = `<div class="fs-card-title">Report details</div><div class="fs-card-subtitle">Who completed this check and when.</div>`;
  const metaBy = el("div", "fs-row-meta");
  const metaDate = el("div", "fs-row-meta");
  metaInner.appendChild(metaTitle);
  metaInner.appendChild(metaBy);
  metaInner.appendChild(metaDate);
  metaCard.appendChild(metaInner);

  const content = el("div", "fs-stack");

  const closeBtn = el("button", "fs-btn fs-btn-secondary");
  closeBtn.type = "button";
  closeBtn.textContent = "Back to reports";
  closeBtn.addEventListener("click", () => {
    window.location.hash = "#/reports";
  });

  stack.appendChild(errorEl);
  stack.appendChild(metaCard);
  stack.appendChild(content);
  stack.appendChild(closeBtn);
  container.appendChild(stack);
  root.appendChild(container);

  const user = auth?.currentUser;
  if (!user) return;

  function setAlert(el, message) {
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  showLoading?.();
  try {
    const token = await user.getIdToken();
    const report = await fetchJson(
      `/api/brigades/${encodeURIComponent(brigadeId)}/reports/${encodeURIComponent(reportId)}`,
      { token }
    );

    const title = `Report for ${report.applianceName || "Appliance"}`;
    setTitle?.(title);

    metaBy.textContent = `Checked by: ${report.username || report.creatorName || "Unknown"}`;
    metaDate.textContent = `Date: ${report.date ? new Date(report.date).toLocaleString() : ""}`;

    content.innerHTML = "";

    if (Array.isArray(report.lockers) && report.lockers.length > 0) {
      report.lockers.forEach((locker) => {
        const section = el("div", "fs-card");
        const inner = el("div", "fs-card-inner fs-stack");
        inner.innerHTML = `
          <div>
            <div class="fs-card-title">${locker.name || "Locker"}</div>
            <div class="fs-card-subtitle">Items in order (including containers).</div>
          </div>
        `;

        const itemsWrap = el("div", "fs-stack");
        (locker.shelves || []).forEach((shelf) => {
          (shelf.items || []).forEach((item) => {
            itemsWrap.appendChild(renderItem(item, { isSubItem: false }));
          });
        });
        inner.appendChild(itemsWrap);
        section.appendChild(inner);
        content.appendChild(section);
      });
    } else {
      content.innerHTML =
        '<div class="fs-card"><div class="fs-card-inner"><div class="fs-card-title">No locker data</div><div class="fs-card-subtitle">This report didn’t include any lockers.</div></div></div>';
    }
  } catch (err) {
    console.error("Error loading report details:", err);
    setAlert(errorEl, err.message);
  } finally {
    hideLoading?.();
  }
}
