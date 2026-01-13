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

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function renderItem(
  item,
  { isSubItem, lockerName, parentName, makeAnchorId, registerEntry } = {}
) {
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
  const name = item.name || "Item";
  text.innerHTML = `<div class="fs-row-title">${name}</div>`;

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

  const anchorId = typeof makeAnchorId === "function" ? makeAnchorId() : "";
  if (anchorId) wrap.id = anchorId;
  if (typeof registerEntry === "function") {
    registerEntry({
      id: anchorId,
      name,
      status: status || "unknown",
      note: item.note || "",
      lockerName: lockerName || "",
      parentName: parentName || "",
      anchorEl: wrap,
      highlightEl: row,
      searchText: normalizeSearchText(`${name} ${parentName || ""} ${lockerName || ""}`),
    });
  }

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
      subWrap.appendChild(
        renderItem(sub, {
          isSubItem: true,
          lockerName,
          parentName: name,
          makeAnchorId,
          registerEntry,
        })
      );
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

  const searchCard = el("div", "fs-card");
  const searchInner = el("div", "fs-card-inner fs-stack");
  searchInner.innerHTML = `
    <div>
      <div class="fs-card-title">Search this report</div>
      <div class="fs-card-subtitle">Find an item and jump to where it appears in the checklist.</div>
    </div>
  `;
  const searchField = el("div", "fs-field");
  const searchLabel = el("label", "fs-label");
  searchLabel.textContent = "Search items";
  searchLabel.setAttribute("for", "report-search-input");
  const searchInput = el("input", "fs-input");
  searchInput.id = "report-search-input";
  searchInput.type = "search";
  searchInput.placeholder = "Type an item name…";
  searchInput.autocapitalize = "none";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchField.appendChild(searchLabel);
  searchField.appendChild(searchInput);

  const searchMeta = el("div", "fs-row-meta");
  searchMeta.style.display = "none";

  const resultsList = el("div", "fs-list");
  resultsList.style.display = "none";

  searchInner.appendChild(searchField);
  searchInner.appendChild(searchMeta);
  searchInner.appendChild(resultsList);
  searchCard.appendChild(searchInner);

  const content = el("div", "fs-stack");

  const closeBtn = el("button", "fs-btn fs-btn-secondary");
  closeBtn.type = "button";
  closeBtn.textContent = "Back to reports";
  closeBtn.addEventListener("click", () => {
    window.location.hash = "#/reports";
  });

  stack.appendChild(errorEl);
  stack.appendChild(metaCard);
  stack.appendChild(searchCard);
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

  let searchEntries = [];
  let flashTimer = null;
  let indexReady = false;

  function setSearchMeta(message) {
    searchMeta.textContent = message || "";
    searchMeta.style.display = message ? "block" : "none";
  }

  function clearResults() {
    resultsList.innerHTML = "";
    resultsList.style.display = "none";
    setSearchMeta("");
  }

  function flashHighlight(el) {
    if (!el) return;
    el.classList.remove("fs-search-hit");
    // Force reflow so the animation restarts when clicking multiple times quickly.
    void el.offsetWidth;
    el.classList.add("fs-search-hit");
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      el.classList.remove("fs-search-hit");
      flashTimer = null;
    }, 900);
  }

  function renderResults(matches, { query, truncated }) {
    resultsList.innerHTML = "";
    resultsList.style.display = "flex";

    if (matches.length === 0) {
      const empty = el("div", "fs-row");
      const left = el("div");
      const title = el("div", "fs-row-title");
      title.textContent = "No matches";
      const meta = el("div", "fs-row-meta");
      meta.textContent = `No items matched “${query}”. Try a different spelling.`;
      left.appendChild(title);
      left.appendChild(meta);
      empty.appendChild(left);
      resultsList.appendChild(empty);
      return;
    }

    matches.forEach((entry) => {
      const btn = el("button", "fs-row");
      btn.type = "button";

      const left = el("div");
      const title = el("div", "fs-row-title");
      title.textContent = entry.name;
      const meta = el("div", "fs-row-meta");

      const parts = [];
      if (entry.parentName) parts.push(`In: ${entry.parentName}`);
      if (entry.lockerName) parts.push(`Locker: ${entry.lockerName}`);
      meta.textContent = parts.join(" • ");

      left.appendChild(title);
      if (meta.textContent) left.appendChild(meta);

      const pill = el("span", "fs-pill");
      const status = String(entry.status || "").toLowerCase();
      const label = status ? status[0].toUpperCase() + status.slice(1) : "Unknown";
      pill.textContent = label;
      if (status === "present") pill.classList.add("fs-pill-success");
      else if (status === "missing" || status === "defect") pill.classList.add("fs-pill-danger");
      else pill.classList.add("fs-pill-warn");

      btn.appendChild(left);
      btn.appendChild(pill);

      btn.addEventListener("click", () => {
        entry.anchorEl?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        flashHighlight(entry.highlightEl || entry.anchorEl);
      });

      resultsList.appendChild(btn);
    });

    if (truncated) {
      const more = el("div", "fs-row");
      const left = el("div");
      const meta = el("div", "fs-row-meta");
      meta.textContent = `Showing first ${matches.length} matches. Refine your search to narrow it down.`;
      left.appendChild(meta);
      more.appendChild(left);
      resultsList.appendChild(more);
    }
  }

  function updateSearch() {
    const query = normalizeSearchText(searchInput.value);
    if (!query) {
      clearResults();
      return;
    }

    if (!indexReady) {
      setSearchMeta("Loading items…");
      resultsList.style.display = "none";
      return;
    }

    const terms = query.split(" ").filter(Boolean);
    const matches = searchEntries.filter((entry) =>
      terms.every((term) => entry.searchText.includes(term))
    );

    const MAX_RESULTS = 40;
    const truncated = matches.length > MAX_RESULTS;
    const displayMatches = matches.slice(0, MAX_RESULTS);

    setSearchMeta(
      `${matches.length} match${matches.length === 1 ? "" : "es"}${truncated ? " (refine to see more)" : ""}`
    );
    renderResults(displayMatches, { query, truncated });
  }

  searchInput.addEventListener("input", updateSearch);

  // Don't block route transitions on network reads; render immediately and hydrate async.
  void (async () => {
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
      searchEntries = [];
      indexReady = false;
      let anchorSeq = 0;
      const makeAnchorId = () => `report-item-${anchorSeq++}`;
      const registerEntry = (entry) => {
        searchEntries.push(entry);
      };

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
              itemsWrap.appendChild(
                renderItem(item, {
                  isSubItem: false,
                  lockerName: locker.name || "",
                  parentName: "",
                  makeAnchorId,
                  registerEntry,
                })
              );
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

      indexReady = true;
      // If the user started typing before the report loaded, apply the filter now.
      updateSearch();
    } catch (err) {
      console.error("Error loading report details:", err);
      setAlert(errorEl, err.message);
    } finally {
      hideLoading?.();
    }
  })();
}
