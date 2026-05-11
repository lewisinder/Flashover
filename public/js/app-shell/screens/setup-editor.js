const SETUP_AUTOSAVE_DELAY_MS = 1000;
const SETUP_IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

const SETUP_EDITOR_STYLES = `
.fs-setup-editor {
  padding-bottom: 18px;
}
.fs-setup-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  margin: -18px -16px 14px;
  padding: 12px 16px;
  background: rgba(246, 247, 251, 0.92);
  border-bottom: 1px solid rgba(226, 232, 240, 0.86);
  backdrop-filter: blur(12px);
}
.fs-setup-toolbar-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.fs-setup-status {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fs-setup-kicker {
  color: var(--fs-muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.fs-setup-title {
  color: var(--fs-text);
  font-size: 18px;
  line-height: 1.2;
  font-weight: 800;
}
.fs-setup-status-line {
  color: var(--fs-muted);
  font-size: 13px;
}
.fs-setup-save {
  width: auto;
  min-width: 96px;
}
.fs-setup-hero {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  padding: 18px;
  color: #fff;
  background: linear-gradient(135deg, #172554 0%, #2563eb 100%);
  box-shadow: 0 18px 35px rgba(37, 99, 235, 0.2);
}
.fs-setup-hero::after {
  content: "";
  position: absolute;
  top: -80px;
  right: -80px;
  width: 190px;
  height: 190px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
}
.fs-setup-hero > * {
  position: relative;
  z-index: 1;
}
.fs-setup-hero-label {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  opacity: 0.75;
}
.fs-setup-hero-title {
  margin-top: 4px;
  font-size: 32px;
  line-height: 1.1;
  font-weight: 850;
}
.fs-setup-hero-copy {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.86);
  font-size: 15px;
}
.fs-setup-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
}
.fs-setup-section-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--fs-text);
}
.fs-setup-muted {
  color: var(--fs-muted);
  font-size: 13px;
}
.fs-setup-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.fs-setup-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.fs-setup-row-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}
.fs-setup-badge {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--fs-text);
  background: rgba(15, 23, 42, 0.08);
  font-size: 18px;
  font-weight: 850;
}
.fs-setup-row-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.fs-setup-row[draggable="true"] {
  cursor: grab;
}
.fs-setup-row.is-dragging {
  opacity: 0.55;
}
.fs-setup-drop-before {
  box-shadow: inset 0 3px 0 #2563eb, 0 6px 16px rgba(15, 23, 42, 0.05);
}
.fs-setup-drop-after {
  box-shadow: inset 0 -3px 0 #2563eb, 0 6px 16px rgba(15, 23, 42, 0.05);
}
.fs-setup-editor-head {
  display: grid;
  gap: 12px;
  margin-bottom: 14px;
}
.fs-setup-name-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.fs-setup-item-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 12px;
}
.fs-setup-item-card {
  min-height: 136px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--fs-border);
  background: #fff;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.05);
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
  touch-action: pan-y;
}
.fs-setup-item-card[draggable="true"] {
  cursor: grab;
}
.fs-setup-item-card.is-dragging {
  opacity: 0.55;
}
.fs-setup-item-card.is-add {
  border-style: dashed;
  background: rgba(37, 99, 235, 0.05);
}
.fs-setup-item-card.is-drop-before {
  box-shadow: inset 3px 0 0 #2563eb, 0 6px 16px rgba(15, 23, 42, 0.05);
}
.fs-setup-item-card.is-drop-after {
  box-shadow: inset -3px 0 0 #2563eb, 0 6px 16px rgba(15, 23, 42, 0.05);
}
.fs-setup-item-image {
  width: 72px;
  height: 56px;
  object-fit: contain;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.04);
}
.fs-setup-item-name {
  max-width: 100%;
  color: var(--fs-text);
  font-size: 14px;
  font-weight: 800;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.fs-setup-item-meta {
  color: var(--fs-muted);
  font-size: 12px;
}
.fs-setup-plus {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--fs-primary);
  background: rgba(37, 99, 235, 0.11);
  font-size: 28px;
  font-weight: 800;
}
.fs-setup-modal-card {
  width: 92%;
  max-width: 560px;
}
.fs-setup-modal-wide {
  max-width: 720px;
}
.fs-setup-modal-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.fs-setup-field-grid {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 14px;
}
.fs-setup-image-picker {
  height: 150px;
  border: 2px dashed rgba(37, 99, 235, 0.3);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow: hidden;
  cursor: pointer;
}
.fs-setup-image-picker img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.fs-setup-preview-text {
  color: var(--fs-muted);
  font-size: 13px;
  font-weight: 700;
}
.fs-setup-progress {
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
}
.fs-setup-progress > div {
  height: 100%;
  width: 0%;
  border-radius: inherit;
  background: linear-gradient(135deg, var(--fs-primary) 0%, var(--fs-primary-2) 100%);
}
.fs-hidden-file {
  display: none;
}
@media (max-width: 520px) {
  .fs-setup-toolbar-inner,
  .fs-setup-name-row,
  .fs-setup-row {
    grid-template-columns: 1fr;
  }
  .fs-setup-save {
    width: 100%;
  }
  .fs-setup-row-actions {
    justify-content: stretch;
  }
  .fs-setup-row-actions > button {
    flex: 1 1 auto;
  }
  .fs-setup-field-grid {
    grid-template-columns: 1fr;
  }
  .fs-setup-image-picker {
    height: 118px;
  }
}
`;

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPrivateImageRef(value) {
  return typeof value === "string" && /^uploads\/[^/]+\/image-[A-Za-z0-9._-]+\.webp$/.test(value);
}

function isDirectImageRef(value) {
  return typeof value === "string" && (
    value.startsWith("blob:") ||
    value.startsWith("/design_assets/") ||
    value.startsWith("https://storage.googleapis.com/") ||
    value.startsWith("https://firebasestorage.googleapis.com/")
  );
}

function cloneItem(item) {
  const next = isPlainObject(item) ? { ...item } : {};
  next.id = String(next.id || Date.now());
  next.name = String(next.name || "Item");
  next.desc = String(next.desc || "");
  next.type = next.type === "container" ? "container" : "item";
  next.img = String(next.img || "");
  if (next.type === "container") {
    next.subItems = Array.isArray(next.subItems) ? next.subItems.map(cloneItem) : [];
  } else {
    delete next.subItems;
  }
  return next;
}

function lockerItems(locker) {
  if (Array.isArray(locker?.items)) return locker.items;
  if (Array.isArray(locker?.shelves)) {
    return locker.shelves.flatMap((shelf) => Array.isArray(shelf?.items) ? shelf.items : []);
  }
  return [];
}

function normalizeTruckData(data) {
  const normalized = isPlainObject(data) ? data : {};
  normalized.appliances = Array.isArray(normalized.appliances) ? normalized.appliances : [];
  normalized.appliances = normalized.appliances.map((appliance) => ({
    ...appliance,
    id: String(appliance?.id || Date.now()),
    name: String(appliance?.name || "Appliance"),
    lockers: Array.isArray(appliance?.lockers)
      ? appliance.lockers.map((locker) => {
          const nextLocker = {
            ...locker,
            id: String(locker?.id || Date.now()),
            name: String(locker?.name || "Locker"),
            items: lockerItems(locker).map(cloneItem),
          };
          delete nextLocker.shelves;
          return nextLocker;
        })
      : [],
  }));
  return normalized;
}

function visitItems(data, visitor) {
  (Array.isArray(data?.appliances) ? data.appliances : []).forEach((appliance) => {
    (Array.isArray(appliance?.lockers) ? appliance.lockers : []).forEach((locker) => {
      (Array.isArray(locker?.items) ? locker.items : []).forEach((item) => {
        visitor(item);
        (Array.isArray(item?.subItems) ? item.subItems : []).forEach(visitor);
      });
    });
  });
}

function collectPrivateImageRefs(data) {
  const refs = new Set();
  visitItems(data, (item) => {
    if (isPrivateImageRef(item?.img)) refs.add(item.img);
  });
  return refs;
}

function collectItemImageRefs(item) {
  const refs = [];
  if (isPrivateImageRef(item?.img)) refs.push(item.img);
  (Array.isArray(item?.subItems) ? item.subItems : []).forEach((subItem) => {
    refs.push(...collectItemImageRefs(subItem));
  });
  return refs;
}

function sameData(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
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

function uploadWithProgress(url, token, formData, onProgress, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    Object.entries(extraHeaders).forEach(([key, value]) => {
      if (value) xhr.setRequestHeader(key, String(value));
    });
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText);
        return;
      }
      let message = xhr.statusText || `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText)?.message || message;
      } catch (err) {}
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.send(formData);
  });
}

export async function renderSetupEditor({
  root,
  auth,
  brigadeId,
  applianceId,
  setShellChromeVisible,
  setTitle,
  setRouteGuard,
  setBackHandler,
  navigateToSetupHome,
}) {
  setShellChromeVisible?.(true);
  root.innerHTML = "";

  let currentUser = auth?.currentUser || null;
  let truckData = { appliances: [] };
  let lastSavedTruckData = { appliances: [] };
  let activeView = "lockers";
  let activeLockerId = null;
  let activeContainerId = null;
  let hasUnsavedChanges = false;
  let isSaving = false;
  let saveErrorMessage = "";
  let savedIndicator = false;
  let savedTimer = null;
  let autosaveTimer = null;
  let pendingUploads = new Map();
  let pendingUploadedImages = new Set();
  let privateImageUrlCache = new Map();
  let privateImageUrlFailures = new Set();
  let dragInfo = null;
  let pointerDrag = null;
  let pendingNavigation = null;
  let itemDraft = null;
  const modalCloseHandlers = new WeakMap();

  const style = el("style");
  style.textContent = SETUP_EDITOR_STYLES;
  root.appendChild(style);

  const page = el("section", "fs-page fs-setup-editor max-w-4xl mx-auto");
  page.innerHTML = `
    <div class="fs-setup-toolbar">
      <div class="fs-setup-toolbar-inner">
        <div class="fs-setup-status">
          <div class="fs-setup-kicker" id="setup-editor-kicker">Appliance setup</div>
          <div class="fs-setup-title" id="setup-editor-title">Loading appliance</div>
          <div class="fs-setup-status-line" id="setup-editor-status">Fetching setup data.</div>
        </div>
        <button id="setup-save-btn" class="fs-btn fs-btn-primary fs-setup-save" type="button" disabled>Save</button>
      </div>
    </div>
    <div id="setup-error" class="fs-alert fs-alert-error" style="display:none"></div>
    <div id="setup-content" class="fs-stack"></div>
  `;
  root.appendChild(page);

  const titleEl = page.querySelector("#setup-editor-title");
  const kickerEl = page.querySelector("#setup-editor-kicker");
  const statusEl = page.querySelector("#setup-editor-status");
  const saveBtn = page.querySelector("#setup-save-btn");
  const errorEl = page.querySelector("#setup-error");
  const contentEl = page.querySelector("#setup-content");

  const modalLayer = el("div");
  root.appendChild(modalLayer);

  function setError(message) {
    errorEl.textContent = message || "";
    errorEl.style.display = message ? "block" : "none";
  }

  function getAppliance() {
    return truckData.appliances.find((appliance) => String(appliance.id) === String(applianceId)) || null;
  }

  function getLocker(lockerId = activeLockerId) {
    const appliance = getAppliance();
    return appliance?.lockers?.find((locker) => String(locker.id) === String(lockerId)) || null;
  }

  function getContainer(containerId = activeContainerId) {
    const locker = getLocker();
    return locker?.items?.find((item) => String(item.id) === String(containerId) && item.type === "container") || null;
  }

  function getCurrentItems(context, parentId) {
    if (context === "container") {
      const container = getContainer(parentId);
      if (!container) return [];
      if (!Array.isArray(container.subItems)) container.subItems = [];
      return container.subItems;
    }
    const locker = getLocker(parentId || activeLockerId);
    if (!locker) return [];
    if (!Array.isArray(locker.items)) locker.items = [];
    return locker.items;
  }

  function markDirty() {
    hasUnsavedChanges = !sameData(truckData, lastSavedTruckData);
    if (hasUnsavedChanges) {
      saveErrorMessage = "";
      scheduleAutosave();
    }
    updateToolbar();
  }

  function hasActiveUploads() {
    return Array.from(pendingUploads.values()).some((entry) => entry?.status === "uploading");
  }

  function updateToolbar() {
    const appliance = getAppliance();
    const title = appliance?.name || "Appliance setup";
    const locker = getLocker();
    const container = getContainer();
    titleEl.textContent = activeView === "container" && container
      ? container.name
      : activeView === "locker" && locker
        ? locker.name
        : title;
    kickerEl.textContent = activeView === "container" ? "Container" : activeView === "locker" ? "Locker" : "Appliance setup";
    setTitle?.(activeView === "lockers" ? title : titleEl.textContent);

    let status = "All changes saved.";
    if (isSaving) status = "Saving changes.";
    else if (hasActiveUploads()) status = "Uploading images.";
    else if (saveErrorMessage) status = "Save failed.";
    else if (hasUnsavedChanges) status = "Unsaved changes.";
    else if (savedIndicator) status = "Saved.";
    statusEl.textContent = status;

    saveBtn.disabled = isSaving || hasActiveUploads() || !hasUnsavedChanges;
    saveBtn.textContent = isSaving ? "Saving..." : hasActiveUploads() ? "Uploading..." : savedIndicator ? "Saved" : "Save now";
  }

  function showSaved() {
    savedIndicator = true;
    updateToolbar();
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => {
      savedIndicator = false;
      updateToolbar();
    }, 1600);
  }

  function clearAutosaveTimer() {
    if (!autosaveTimer) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  function scheduleAutosave() {
    clearAutosaveTimer();
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      void saveBrigadeData({ source: "autosave" });
    }, SETUP_AUTOSAVE_DELAY_MS);
  }

  async function deleteUploadedImageRef(imageRef) {
    if (!isPrivateImageRef(imageRef) || !currentUser || !brigadeId) return;
    const fileName = imageRef.split("/").pop();
    if (!fileName) return;
    try {
      const token = await currentUser.getIdToken();
      await fetch(`/api/image/${encodeURIComponent(fileName)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-brigade-id": brigadeId,
        },
      });
    } catch (error) {
      console.warn("Failed to clean up uploaded setup image:", imageRef, error);
    }
  }

  function cleanupPendingUploadedImage(imageRef) {
    if (!pendingUploadedImages.has(imageRef)) return;
    pendingUploadedImages.delete(imageRef);
    void deleteUploadedImageRef(imageRef);
  }

  function cleanupPendingUploadedImages(refs) {
    refs.forEach((ref) => cleanupPendingUploadedImage(ref));
  }

  async function cleanupUnsavedUploadedImages() {
    const refs = Array.from(pendingUploadedImages);
    pendingUploadedImages.clear();
    await Promise.all(refs.map((ref) => deleteUploadedImageRef(ref)));
  }

  async function uploadSetupImageFile(file, onProgress) {
    const formData = new FormData();
    formData.append("image", file, file.name || "setup-image");
    const token = await currentUser.getIdToken();
    const responseText = await uploadWithProgress("/api/upload", token, formData, onProgress, { "x-brigade-id": brigadeId });
    const result = JSON.parse(responseText);
    return result.storagePath || result.filePath || "";
  }

  async function resolveImageDisplayUrl(imageRef) {
    if (!imageRef) return "";
    if (isDirectImageRef(imageRef)) return imageRef;
    if (!isPrivateImageRef(imageRef) || !brigadeId || !currentUser) return "";
    if (privateImageUrlCache.has(imageRef)) return privateImageUrlCache.get(imageRef);
    if (privateImageUrlFailures.has(imageRef)) return "";

    const fileName = imageRef.split("/").pop();
    const token = await currentUser.getIdToken();
    const response = await fetch(`/api/brigades/${encodeURIComponent(brigadeId)}/images/${encodeURIComponent(fileName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      privateImageUrlFailures.add(imageRef);
      return "";
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    privateImageUrlCache.set(imageRef, url);
    return url;
  }

  function setImage(img, imageRef) {
    img.dataset.imageRef = imageRef || "";
    if (!imageRef) {
      img.removeAttribute("src");
      return;
    }
    if (isDirectImageRef(imageRef)) {
      img.src = imageRef;
      return;
    }
    void resolveImageDisplayUrl(imageRef).then((url) => {
      if (url && img.dataset.imageRef === imageRef) img.src = url;
    });
  }

  function makeIconButton(label, text) {
    const btn = el("button", "fs-icon-btn");
    btn.type = "button";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.textContent = text;
    return btn;
  }

  function render() {
    updateToolbar();
    if (activeView === "locker") {
      renderLockerEditor();
      return;
    }
    if (activeView === "container") {
      renderContainerEditor();
      return;
    }
    renderLockerList();
  }

  function renderLockerList() {
    const appliance = getAppliance();
    if (!appliance) return;
    if (!Array.isArray(appliance.lockers)) appliance.lockers = [];
    contentEl.innerHTML = "";

    const hero = el("div", "fs-setup-hero");
    hero.innerHTML = `
      <div class="fs-setup-hero-label">Appliance</div>
      <div class="fs-setup-hero-title"></div>
      <div class="fs-setup-hero-copy">Choose a locker to edit its items and containers.</div>
    `;
    hero.querySelector(".fs-setup-hero-title").textContent = appliance.name || "Appliance";
    contentEl.appendChild(hero);

    const head = el("div", "fs-setup-section-head");
    const left = el("div");
    left.innerHTML = `
      <div class="fs-setup-section-title">Lockers</div>
      <div class="fs-setup-muted">Tap a locker to edit. Drag or use arrows to reorder.</div>
    `;
    const addBtn = el("button", "fs-btn fs-btn-primary fs-btn-compact");
    addBtn.type = "button";
    addBtn.textContent = "New locker";
    addBtn.addEventListener("click", () => openLockerModal());
    head.appendChild(left);
    head.appendChild(addBtn);
    contentEl.appendChild(head);

    const list = el("div", "fs-setup-list");
    if (appliance.lockers.length === 0) {
      const empty = el("div", "fs-row");
      empty.innerHTML = '<div><div class="fs-row-title">No lockers yet</div><div class="fs-row-meta">Create a locker to start adding items.</div></div>';
      list.appendChild(empty);
    }

    appliance.lockers.forEach((locker, index) => {
      const row = el("div", "fs-row fs-setup-row");
      row.draggable = true;
      row.dataset.lockerId = locker.id;
      const itemCount = Array.isArray(locker.items) ? locker.items.length : 0;
      const initial = (locker.name || "L").trim().charAt(0).toUpperCase() || "L";

      const main = el("div", "fs-setup-row-main");
      const badge = el("div", "fs-setup-badge");
      badge.textContent = initial;
      const text = el("div");
      text.innerHTML = `<div class="fs-row-title"></div><div class="fs-row-meta"></div>`;
      text.querySelector(".fs-row-title").textContent = locker.name || "Locker";
      text.querySelector(".fs-row-meta").textContent = itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "No items yet";
      main.appendChild(badge);
      main.appendChild(text);

      const actions = el("div", "fs-setup-row-actions");
      const up = makeIconButton("Move up", "↑");
      const down = makeIconButton("Move down", "↓");
      const menu = makeIconButton("Locker actions", "⋯");
      up.disabled = index === 0;
      down.disabled = index === appliance.lockers.length - 1;
      up.addEventListener("click", (e) => {
        e.stopPropagation();
        moveLocker(index, index - 1);
      });
      down.addEventListener("click", (e) => {
        e.stopPropagation();
        moveLocker(index, index + 1);
      });
      menu.addEventListener("click", (e) => {
        e.stopPropagation();
        openLockerActions(locker);
      });
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(menu);

      row.appendChild(main);
      row.appendChild(actions);
      row.addEventListener("click", () => openLocker(locker.id));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLocker(locker.id);
        }
      });
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.addEventListener("dragstart", (e) => {
        dragInfo = { type: "locker", id: locker.id };
        row.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        dragInfo = null;
        clearLockerDropState();
        row.classList.remove("is-dragging");
      });
      row.addEventListener("dragover", (e) => {
        if (dragInfo?.type !== "locker") return;
        e.preventDefault();
        clearLockerDropState();
        const rect = row.getBoundingClientRect();
        row.classList.add(e.clientY < rect.top + rect.height / 2 ? "fs-setup-drop-before" : "fs-setup-drop-after");
      });
      row.addEventListener("dragleave", () => row.classList.remove("fs-setup-drop-before", "fs-setup-drop-after"));
      row.addEventListener("drop", (e) => {
        if (dragInfo?.type !== "locker") return;
        e.preventDefault();
        const from = appliance.lockers.findIndex((item) => String(item.id) === String(dragInfo.id));
        let to = index;
        const rect = row.getBoundingClientRect();
        if (e.clientY >= rect.top + rect.height / 2) to += 1;
        if (from < to) to -= 1;
        moveLocker(from, to);
      });
      list.appendChild(row);
    });
    contentEl.appendChild(list);
  }

  function clearLockerDropState() {
    root.querySelectorAll(".fs-setup-drop-before,.fs-setup-drop-after").forEach((node) => {
      node.classList.remove("fs-setup-drop-before", "fs-setup-drop-after");
    });
  }

  function moveLocker(from, to) {
    const appliance = getAppliance();
    if (!appliance || from < 0 || to < 0 || from === to || to >= appliance.lockers.length) return;
    const [locker] = appliance.lockers.splice(from, 1);
    appliance.lockers.splice(to, 0, locker);
    markDirty();
    render();
  }

  function openLocker(lockerId) {
    activeLockerId = lockerId;
    activeContainerId = null;
    activeView = "locker";
    render();
  }

  function renderLockerEditor() {
    const locker = getLocker();
    if (!locker) {
      activeView = "lockers";
      render();
      return;
    }
    if (!Array.isArray(locker.items)) locker.items = [];
    contentEl.innerHTML = "";

    const card = el("div", "fs-card");
    const inner = el("div", "fs-card-inner");
    inner.innerHTML = `
      <div class="fs-setup-editor-head">
        <button id="setup-back-lockers" class="fs-btn fs-btn-secondary fs-btn-compact" type="button">Back to lockers</button>
        <div class="fs-setup-name-row">
          <div class="fs-field">
            <label class="fs-label" for="setup-locker-name">Locker name</label>
            <input id="setup-locker-name" class="fs-input" type="text">
          </div>
          <button id="setup-delete-locker" class="fs-btn fs-btn-danger fs-btn-compact" type="button">Delete locker</button>
        </div>
        <div class="fs-setup-muted">Tap an item to edit. Drag items in this grid to reorder them.</div>
      </div>
      <div id="setup-item-grid" class="fs-setup-item-grid"></div>
    `;
    card.appendChild(inner);
    contentEl.appendChild(card);

    const nameInput = inner.querySelector("#setup-locker-name");
    nameInput.value = locker.name || "";
    nameInput.addEventListener("change", () => {
      locker.name = nameInput.value.trim() || "Locker";
      markDirty();
      updateToolbar();
      render();
    });
    inner.querySelector("#setup-back-lockers").addEventListener("click", () => {
      activeView = "lockers";
      activeLockerId = null;
      render();
    });
    inner.querySelector("#setup-delete-locker").addEventListener("click", () => {
      openDeleteConfirm("locker", locker.id, locker.name || "Locker");
    });

    renderItemGrid(inner.querySelector("#setup-item-grid"), locker.items, "locker", locker.id);
  }

  function renderContainerEditor() {
    const container = getContainer();
    if (!container) {
      activeView = "locker";
      render();
      return;
    }
    if (!Array.isArray(container.subItems)) container.subItems = [];
    contentEl.innerHTML = "";

    const card = el("div", "fs-card");
    const inner = el("div", "fs-card-inner");
    inner.innerHTML = `
      <div class="fs-setup-editor-head">
        <button id="setup-back-locker" class="fs-btn fs-btn-secondary fs-btn-compact" type="button">Back to locker</button>
        <div>
          <div class="fs-card-title"></div>
          <div class="fs-card-subtitle">Items inside this container.</div>
        </div>
      </div>
      <div id="setup-container-grid" class="fs-setup-item-grid"></div>
    `;
    inner.querySelector(".fs-card-title").textContent = container.name || "Container";
    card.appendChild(inner);
    contentEl.appendChild(card);
    inner.querySelector("#setup-back-locker").addEventListener("click", () => {
      activeView = "locker";
      activeContainerId = null;
      render();
    });
    renderItemGrid(inner.querySelector("#setup-container-grid"), container.subItems, "container", container.id);
  }

  function renderItemGrid(grid, items, context, parentId) {
    grid.innerHTML = "";
    items.forEach((item, index) => {
      const card = el("button", "fs-setup-item-card");
      card.type = "button";
      card.draggable = true;
      card.dataset.itemId = item.id;
      card.dataset.context = context;
      card.dataset.parentId = parentId;

      if (item.img) {
        const img = el("img", "fs-setup-item-image");
        img.alt = "";
        setImage(img, item.img);
        card.appendChild(img);
      } else {
        const plus = el("div", "fs-setup-plus");
        plus.textContent = item.type === "container" ? "▣" : "•";
        card.appendChild(plus);
      }
      const name = el("div", "fs-setup-item-name");
      name.textContent = item.name || "Item";
      const meta = el("div", "fs-setup-item-meta");
      meta.textContent = item.type === "container" ? `${(item.subItems || []).length} container item${(item.subItems || []).length === 1 ? "" : "s"}` : "Item";
      card.appendChild(name);
      card.appendChild(meta);

      card.addEventListener("click", () => openItemModal({ context, itemId: item.id, parentId }));
      card.addEventListener("dragstart", (e) => {
        dragInfo = { type: "item", context, parentId, itemId: item.id };
        card.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => {
        dragInfo = null;
        clearItemDropState();
        card.classList.remove("is-dragging");
      });
      card.addEventListener("dragover", (e) => handleItemDragOver(e, card));
      card.addEventListener("dragleave", () => card.classList.remove("is-drop-before", "is-drop-after"));
      card.addEventListener("drop", (e) => handleItemDrop(e, card, index));
      card.addEventListener("pointerdown", (e) => startPointerItemDrag(e, card));
      card.addEventListener("pointermove", movePointerItemDrag);
      card.addEventListener("pointerup", endPointerItemDrag);
      card.addEventListener("pointercancel", endPointerItemDrag);
      grid.appendChild(card);
    });

    const add = el("button", "fs-setup-item-card is-add");
    add.type = "button";
    add.innerHTML = '<div class="fs-setup-plus">+</div><div class="fs-setup-item-name">Add item</div>';
    add.addEventListener("click", () => openItemModal({ context, parentId }));
    add.addEventListener("dragover", (e) => {
      if (dragInfo?.type !== "item" || dragInfo.context !== context || String(dragInfo.parentId) !== String(parentId)) return;
      e.preventDefault();
    });
    add.addEventListener("drop", (e) => {
      if (dragInfo?.type !== "item") return;
      e.preventDefault();
      moveItemWithinList(dragInfo.context, dragInfo.parentId, dragInfo.itemId, items.length);
    });
    grid.appendChild(add);
  }

  function clearItemDropState() {
    root.querySelectorAll(".is-drop-before,.is-drop-after").forEach((node) => {
      node.classList.remove("is-drop-before", "is-drop-after");
    });
  }

  function handleItemDragOver(e, card) {
    if (dragInfo?.type !== "item") return;
    if (dragInfo.context !== card.dataset.context || String(dragInfo.parentId) !== String(card.dataset.parentId)) return;
    e.preventDefault();
    clearItemDropState();
    const rect = card.getBoundingClientRect();
    card.classList.add(e.clientX < rect.left + rect.width / 2 ? "is-drop-before" : "is-drop-after");
  }

  function handleItemDrop(e, card, index) {
    if (dragInfo?.type !== "item") return;
    if (dragInfo.context !== card.dataset.context || String(dragInfo.parentId) !== String(card.dataset.parentId)) return;
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    let to = index;
    if (e.clientX >= rect.left + rect.width / 2) to += 1;
    moveItemWithinList(dragInfo.context, dragInfo.parentId, dragInfo.itemId, to);
  }

  function startPointerItemDrag(e, card) {
    if (e.pointerType === "mouse") return;
    pointerDrag = {
      card,
      context: card.dataset.context,
      parentId: card.dataset.parentId,
      itemId: card.dataset.itemId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  }

  function movePointerItemDrag(e) {
    if (!pointerDrag || e.pointerType === "mouse") return;
    const dx = Math.abs(e.clientX - pointerDrag.startX);
    const dy = Math.abs(e.clientY - pointerDrag.startY);
    if (!pointerDrag.active && (dx > 8 || dy > 8)) {
      pointerDrag.active = true;
      pointerDrag.card.classList.add("is-dragging");
      pointerDrag.card.setPointerCapture?.(e.pointerId);
    }
    if (pointerDrag.active) e.preventDefault();
  }

  function endPointerItemDrag(e) {
    if (!pointerDrag || e.pointerType === "mouse") return;
    const current = pointerDrag;
    pointerDrag = null;
    current.card.classList.remove("is-dragging");
    current.card.releasePointerCapture?.(e.pointerId);
    if (!current.active) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".fs-setup-item-card[data-item-id]");
    if (!hit || hit.dataset.context !== current.context || String(hit.dataset.parentId) !== String(current.parentId)) return;
    const items = getCurrentItems(current.context, current.parentId);
    let to = items.findIndex((item) => String(item.id) === String(hit.dataset.itemId));
    const rect = hit.getBoundingClientRect();
    if (e.clientX >= rect.left + rect.width / 2) to += 1;
    moveItemWithinList(current.context, current.parentId, current.itemId, to);
  }

  function moveItemWithinList(context, parentId, itemId, to) {
    const items = getCurrentItems(context, parentId);
    const from = items.findIndex((item) => String(item.id) === String(itemId));
    if (from < 0) return;
    let nextTo = Math.max(0, Math.min(to, items.length));
    if (from < nextTo) nextTo -= 1;
    if (from === nextTo) return;
    const [item] = items.splice(from, 1);
    items.splice(nextTo, 0, item);
    markDirty();
    render();
  }

  function openLockerModal(locker = null) {
    const isEdit = !!locker;
    const modal = openModal({
      title: isEdit ? "Rename locker" : "Create new locker",
      body: `<div class="fs-field"><label class="fs-label" for="setup-locker-modal-name">Locker name</label><input id="setup-locker-modal-name" class="fs-input" type="text"></div>`,
      actions: [
        { label: "Cancel", className: "fs-btn-secondary", close: true },
        { label: isEdit ? "Save" : "Create", className: "fs-btn-primary", action: () => saveLockerFromModal(modal, locker) },
      ],
    });
    const input = modal.querySelector("#setup-locker-modal-name");
    input.value = locker?.name || "";
    setTimeout(() => input.focus(), 0);
  }

  function saveLockerFromModal(modal, locker) {
    const input = modal.querySelector("#setup-locker-modal-name");
    const name = input.value.trim();
    if (!name) return;
    const appliance = getAppliance();
    if (!appliance) return;
    if (locker) {
      locker.name = name;
    } else {
      appliance.lockers.push({
        id: String(Date.now()),
        name,
        items: [],
      });
    }
    closeModal(modal);
    markDirty();
    render();
  }

  function openLockerActions(locker) {
    const modal = openModal({
      title: "Locker actions",
      subtitle: locker.name || "Locker",
      actions: [
        { label: "Rename", className: "fs-btn-secondary", action: () => { closeModal(modal); openLockerModal(locker); } },
        { label: "Delete", className: "fs-btn-danger", action: () => { closeModal(modal); openDeleteConfirm("locker", locker.id, locker.name || "Locker"); } },
        { label: "Cancel", className: "fs-btn-secondary", close: true },
      ],
    });
  }

  function cleanupUncommittedDraftImage(draft) {
    if (!draft) return;
    if (!draft.committed) {
      draft.cancelled = true;
      if (draft.objectUrl) {
        try { URL.revokeObjectURL(draft.objectUrl); } catch (err) {}
      }
      if (draft.uploadId) pendingUploads.delete(draft.uploadId);
      if (draft.uploadedImageRef) cleanupPendingUploadedImage(draft.uploadedImageRef);
    }
    if (itemDraft === draft) itemDraft = null;
    updateToolbar();
  }

  function updateItemModalUploadState(modal, draft, statusText = "") {
    const status = modal.querySelector("#setup-item-image-status");
    if (status) status.textContent = statusText || "";
  }

  function startDraftImageUpload({ modal, draft, file, picker }) {
    if (file.size > SETUP_IMAGE_UPLOAD_MAX_BYTES) {
      draft.uploadStatus = "error";
      draft.uploadError = "File too large. Please choose an image under 8MB.";
      updateItemModalUploadState(modal, draft, draft.uploadError);
      return;
    }

    if (draft.objectUrl) {
      try { URL.revokeObjectURL(draft.objectUrl); } catch (err) {}
    }
    if (draft.uploadedImageRef) {
      cleanupPendingUploadedImage(draft.uploadedImageRef);
      draft.uploadedImageRef = "";
    }
    if (draft.uploadId) pendingUploads.delete(draft.uploadId);

    const uploadId = `setup-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const objectUrl = URL.createObjectURL(file);
    draft.uploadId = uploadId;
    draft.objectUrl = objectUrl;
    draft.imageRef = objectUrl;
    draft.uploadStatus = "uploading";
    draft.uploadError = "";
    pendingUploads.set(uploadId, { status: "uploading", objectUrl });
    renderPickerPreview(picker, objectUrl);
    updateItemModalUploadState(modal, draft, "Uploading image...");
    updateToolbar();

    void uploadSetupImageFile(file, (event) => {
      const total = event.total ? formatBytes(event.total) : "";
      const loaded = formatBytes(event.loaded);
      updateItemModalUploadState(modal, draft, total ? `Uploading image: ${loaded} / ${total}` : `Uploading image: ${loaded}`);
    }).then((storagePath) => {
      pendingUploads.delete(uploadId);
      if (!storagePath) throw new Error("Upload did not return an image path.");
      if (draft.cancelled || draft.uploadId !== uploadId) {
        void deleteUploadedImageRef(storagePath);
        return;
      }
      pendingUploadedImages.add(storagePath);
      draft.uploadedImageRef = storagePath;
      draft.imageRef = storagePath;
      draft.uploadStatus = "uploaded";
      if (draft.targetItem) {
        draft.targetItem.img = storagePath;
        markDirty();
        render();
      }
      if (draft.objectUrl) {
        try { URL.revokeObjectURL(draft.objectUrl); } catch (err) {}
        draft.objectUrl = "";
      }
      if (modal.isConnected) {
        renderPickerPreview(picker, storagePath);
        updateItemModalUploadState(modal, draft, draft.committed ? "Image uploaded." : "Image uploaded. Save item to keep it.");
      }
      updateToolbar();
    }).catch((error) => {
      pendingUploads.delete(uploadId);
      if (draft.cancelled || draft.uploadId !== uploadId) {
        updateToolbar();
        return;
      }
      draft.imageRef = draft.originalImageRef || "";
      draft.uploadStatus = "error";
      draft.uploadError = error.message || "Image upload failed.";
      if (draft.targetItem) {
        draft.targetItem.img = draft.originalImageRef || "";
        markDirty();
        render();
      }
      if (draft.objectUrl) {
        try { URL.revokeObjectURL(draft.objectUrl); } catch (err) {}
        draft.objectUrl = "";
      }
      if (modal.isConnected) {
        renderPickerPreview(picker, draft.imageRef);
        updateItemModalUploadState(modal, draft, draft.uploadError);
      } else {
        setError(draft.uploadError);
      }
      updateToolbar();
    });
  }

  function openItemModal({ context, itemId = null, parentId }) {
    const items = getCurrentItems(context, parentId);
    const existing = itemId ? items.find((item) => String(item.id) === String(itemId)) : null;
    itemDraft = {
      isNew: !existing,
      context,
      parentId,
      itemId: existing?.id || String(Date.now()),
      originalImageRef: existing?.img || "",
      imageRef: existing?.img || "",
      uploadedImageRef: "",
      uploadStatus: "",
      uploadError: "",
      uploadId: "",
      objectUrl: "",
      committed: false,
      cancelled: false,
    };
    const draft = itemDraft;
    const canBeContainer = context === "locker";
    const modal = openModal({
      title: existing ? "Edit item" : "Add item",
      extraClass: "fs-setup-modal-wide",
      body: `
        <div class="fs-setup-field-grid">
          <div>
            <label for="setup-item-image-input" class="fs-setup-image-picker" id="setup-item-image-picker">
              <span class="fs-setup-preview-text">Item image<br>Tap to upload</span>
            </label>
            <input id="setup-item-image-input" class="fs-hidden-file" type="file" accept="image/*">
            <div id="setup-item-image-status" class="fs-row-meta" style="margin-top:8px"></div>
          </div>
          <div class="fs-stack">
            <div class="fs-field">
              <label class="fs-label" for="setup-item-name">Name</label>
              <input id="setup-item-name" class="fs-input" type="text">
            </div>
            <div class="fs-field">
              <label class="fs-label" for="setup-item-desc">Description</label>
              <textarea id="setup-item-desc" class="fs-input" rows="4"></textarea>
            </div>
            ${canBeContainer ? `
              <div class="fs-field">
                <label class="fs-label" for="setup-item-type">Type</label>
                <select id="setup-item-type" class="fs-select">
                  <option value="item">Item</option>
                  <option value="container">Container</option>
                </select>
              </div>
            ` : ""}
            ${canBeContainer ? `
              <div class="fs-field" id="setup-move-locker-field" style="display:none">
                <label class="fs-label" for="setup-move-locker">Move to locker</label>
                <select id="setup-move-locker" class="fs-select"></select>
              </div>
            ` : ""}
          </div>
        </div>
      `,
      actions: [
        { label: "Delete", className: "fs-btn-danger", hidden: !existing, action: () => { closeModal(modal); openDeleteConfirm("item", draft.itemId, existing?.name || "Item", context, parentId); } },
        { label: "Move to another locker", className: "fs-btn-secondary", hidden: !existing || context !== "locker", action: () => revealMoveLocker(modal) },
        { label: "Open container items", className: "fs-btn-secondary", hidden: context !== "locker", action: () => enterContainerFromModal(modal) },
        { label: "Cancel", className: "fs-btn-secondary", action: () => closeModal(modal) },
        { label: "Save", className: "fs-btn-primary", action: () => saveItemFromModal(modal, { close: true }) },
      ],
      onClose: () => cleanupUncommittedDraftImage(draft),
    });

    const nameInput = modal.querySelector("#setup-item-name");
    const descInput = modal.querySelector("#setup-item-desc");
    const typeInput = modal.querySelector("#setup-item-type");
    const fileInput = modal.querySelector("#setup-item-image-input");
    const picker = modal.querySelector("#setup-item-image-picker");
    nameInput.value = existing?.name || "";
    descInput.value = existing?.desc || "";
    if (typeInput) {
      typeInput.value = existing?.type === "container" ? "container" : "item";
    }
    renderPickerPreview(picker, draft.imageRef);
    updateItemModalUploadState(modal, draft, "");
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      startDraftImageUpload({ modal, draft, file, picker });
    });

    populateMoveLockerSelect(modal);
    updateContainerActionVisibility(modal);
    typeInput?.addEventListener("change", () => updateContainerActionVisibility(modal));
    setTimeout(() => nameInput.focus(), 0);
  }

  function renderPickerPreview(picker, imageRef) {
    picker.innerHTML = "";
    if (imageRef) {
      const img = el("img");
      img.alt = "";
      setImage(img, imageRef);
      picker.appendChild(img);
      return;
    }
    const span = el("span", "fs-setup-preview-text");
    span.innerHTML = "Item image<br>Tap to upload";
    picker.appendChild(span);
  }

  function updateContainerActionVisibility(modal) {
    const type = modal.querySelector("#setup-item-type")?.value || "item";
    const buttons = Array.from(modal.querySelectorAll("[data-action-label]"));
    const enterBtn = buttons.find((btn) => btn.dataset.actionLabel === "Open container items");
    if (enterBtn) enterBtn.style.display = type === "container" ? "" : "none";
  }

  function revealMoveLocker(modal) {
    const field = modal.querySelector("#setup-move-locker-field");
    if (!field) return;
    if (field.style.display !== "none") {
      moveItemToLocker(modal);
      return;
    }
    field.style.display = "";
    const button = modal.querySelector('[data-action-label="Move to another locker"]');
    if (button) {
      button.textContent = "Move";
      button.dataset.actionLabel = "Move";
    }
  }

  function populateMoveLockerSelect(modal) {
    const select = modal.querySelector("#setup-move-locker");
    if (!select) return;
    const appliance = getAppliance();
    const lockers = (appliance?.lockers || []).filter((locker) => String(locker.id) !== String(activeLockerId));
    select.innerHTML = "";
    if (lockers.length === 0) {
      const option = el("option");
      option.value = "";
      option.textContent = "No other lockers";
      select.appendChild(option);
      select.disabled = true;
      return;
    }
    lockers.forEach((locker) => {
      const option = el("option");
      option.value = locker.id;
      option.textContent = locker.name || "Locker";
      select.appendChild(option);
    });
  }

  function saveItemFromModal(modal, { close }) {
    const name = modal.querySelector("#setup-item-name").value.trim();
    if (!name) {
      alert("Item name is required.");
      return null;
    }
    const desc = modal.querySelector("#setup-item-desc").value;
    const type = modal.querySelector("#setup-item-type")?.value === "container" ? "container" : "item";
    const items = getCurrentItems(itemDraft.context, itemDraft.parentId);
    let item = items.find((entry) => String(entry.id) === String(itemDraft.itemId));
    if (!item) {
      item = { id: itemDraft.itemId, name: "", desc: "", type: "item", img: "" };
      items.push(item);
    }
    item.name = name;
    item.desc = desc;
    item.img = itemDraft.imageRef || "";
    if (itemDraft.context === "locker") {
      item.type = type;
      if (type === "container") {
        item.subItems = Array.isArray(item.subItems) ? item.subItems : [];
      } else {
        delete item.subItems;
      }
    } else {
      item.type = "item";
      delete item.subItems;
    }
    itemDraft.targetItem = item;
    itemDraft.committed = true;
    markDirty();
    if (close) {
      closeModal(modal);
      render();
    }
    return item;
  }

  function enterContainerFromModal(modal) {
    const typeInput = modal.querySelector("#setup-item-type");
    if (typeInput) typeInput.value = "container";
    const item = saveItemFromModal(modal, { close: false });
    if (!item) return;
    if (item.type !== "container") return;
    activeContainerId = item.id;
    activeView = "container";
    closeModal(modal);
    render();
  }

  function moveItemToLocker(modal) {
    const item = saveItemFromModal(modal, { close: false });
    if (!item) return;
    const targetLockerId = modal.querySelector("#setup-move-locker")?.value;
    if (!targetLockerId || String(targetLockerId) === String(activeLockerId)) return;
    const source = getCurrentItems("locker", activeLockerId);
    const index = source.findIndex((entry) => String(entry.id) === String(item.id));
    if (index < 0) return;
    const [moved] = source.splice(index, 1);
    const targetLocker = getLocker(targetLockerId);
    if (!targetLocker) return;
    if (!Array.isArray(targetLocker.items)) targetLocker.items = [];
    targetLocker.items.unshift(moved);
    markDirty();
    closeModal(modal);
    render();
  }

  function openDeleteConfirm(type, id, name, context = "locker", parentId = activeLockerId) {
    const modal = openModal({
      title: "Are you sure?",
      subtitle: `This will permanently delete ${name}.`,
      actions: [
        { label: "Cancel", className: "fs-btn-secondary", close: true },
        { label: "Delete", className: "fs-btn-danger", action: () => { deleteEntity(type, id, context, parentId); closeModal(modal); } },
      ],
    });
  }

  function deleteEntity(type, id, context, parentId) {
    const appliance = getAppliance();
    if (!appliance) return;
    if (type === "locker") {
      const locker = appliance.lockers.find((entry) => String(entry.id) === String(id));
      cleanupPendingUploadedImages((locker?.items || []).flatMap(collectItemImageRefs));
      appliance.lockers = appliance.lockers.filter((locker) => String(locker.id) !== String(id));
      activeLockerId = null;
      activeContainerId = null;
      activeView = "lockers";
    } else {
      const items = getCurrentItems(context, parentId);
      const item = items.find((entry) => String(entry.id) === String(id));
      if (item) cleanupPendingUploadedImages(collectItemImageRefs(item));
      const index = items.findIndex((entry) => String(entry.id) === String(id));
      if (index >= 0) items.splice(index, 1);
    }
    markDirty();
    render();
  }

  function openUnsavedModal(target) {
    pendingNavigation = target || null;
    const modal = openModal({
      title: "Unsaved changes",
      subtitle: saveErrorMessage || "Save changes before leaving this setup editor?",
      actions: [
        { label: "Cancel", className: "fs-btn-secondary", close: true },
        { label: "Discard", className: "fs-btn-danger", action: () => { closeModal(modal); discardAndNavigate(); } },
        { label: "Save", className: "fs-btn-primary", action: async () => {
          const saved = await saveBrigadeData();
          if (!saved) return;
          closeModal(modal);
          continuePendingNavigation();
        } },
      ],
    });
  }

  function openUploadBlockedModal(target) {
    pendingNavigation = target || null;
    openModal({
      title: "Upload in progress",
      subtitle: "Please wait for the image upload to finish before leaving setup.",
      actions: [
        { label: "OK", className: "fs-btn-primary", close: true },
      ],
    });
  }

  async function discardAndNavigate() {
    clearAutosaveTimer();
    await cleanupUnsavedUploadedImages();
    truckData = JSON.parse(JSON.stringify(lastSavedTruckData));
    hasUnsavedChanges = false;
    saveErrorMessage = "";
    continuePendingNavigation();
  }

  function continuePendingNavigation() {
    const target = pendingNavigation;
    pendingNavigation = null;
    setRouteGuard?.(null);
    if (target) window.location.hash = target;
    else navigateToSetupHome?.();
  }

  function openModal({ title, subtitle = "", body = "", actions = [], extraClass = "", onClose = null }) {
    const backdrop = el("div", "fs-sheet-backdrop");
    const card = el("div", `fs-card fs-setup-modal-card ${extraClass}`.trim());
    const inner = el("div", "fs-card-inner fs-stack");
    const head = el("div");
    const heading = el("div", "fs-card-title");
    heading.textContent = title;
    head.appendChild(heading);
    if (subtitle) {
      const sub = el("div", "fs-card-subtitle");
      sub.textContent = subtitle;
      head.appendChild(sub);
    }
    inner.appendChild(head);
    if (body) {
      const bodyWrap = el("div");
      bodyWrap.innerHTML = body;
      inner.appendChild(bodyWrap);
    }
    const actionRow = el("div", "fs-setup-modal-actions");
    actions.forEach((action) => {
      const btn = el("button", `fs-btn ${action.className || "fs-btn-secondary"} fs-btn-compact`);
      btn.type = "button";
      btn.textContent = action.label;
      btn.dataset.actionLabel = action.label;
      if (action.hidden) btn.style.display = "none";
      btn.addEventListener("click", () => {
        if (action.close) closeModal(backdrop);
        if (action.action) void action.action();
      });
      actionRow.appendChild(btn);
    });
    inner.appendChild(actionRow);
    card.appendChild(inner);
    backdrop.appendChild(card);
    modalLayer.appendChild(backdrop);
    if (typeof onClose === "function") modalCloseHandlers.set(backdrop, onClose);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdrop);
    });
    return backdrop;
  }

  function closeModal(modal) {
    if (!modal) return;
    const onClose = modalCloseHandlers.get(modal);
    modalCloseHandlers.delete(modal);
    if (onClose) onClose();
    modal?.remove();
  }

  async function saveBrigadeData({ source = "manual" } = {}) {
    clearAutosaveTimer();
    if (!currentUser || !brigadeId || isSaving || hasActiveUploads() || !hasUnsavedChanges) return false;
    isSaving = true;
    saveErrorMessage = "";
    setError("");
    updateToolbar();
    try {
      const token = await currentUser.getIdToken();
      await fetchJson(`/api/brigades/${encodeURIComponent(brigadeId)}/data`, {
        method: "POST",
        token,
        body: truckData,
      });
      lastSavedTruckData = JSON.parse(JSON.stringify(truckData));
      hasUnsavedChanges = false;
      const savedRefs = collectPrivateImageRefs(truckData);
      pendingUploadedImages.forEach((ref) => {
        if (savedRefs.has(ref)) pendingUploadedImages.delete(ref);
        else cleanupPendingUploadedImage(ref);
      });
      showSaved();
      return true;
    } catch (error) {
      console.error("Setup save failed:", error);
      saveErrorMessage = error.message || "Failed to save appliance setup.";
      setError(saveErrorMessage);
      hasUnsavedChanges = true;
      return false;
    } finally {
      isSaving = false;
      updateToolbar();
    }
  }

  async function loadData() {
    setError("");
    contentEl.innerHTML = '<div class="fs-row"><div><div class="fs-row-title">Loading...</div><div class="fs-row-meta">Fetching appliance setup.</div></div></div>';
    if (!brigadeId || !applianceId || !currentUser) {
      navigateToSetupHome?.();
      return;
    }
    try {
      const token = await currentUser.getIdToken();
      truckData = normalizeTruckData(await fetchJson(`/api/brigades/${encodeURIComponent(brigadeId)}/data`, { token }));
      const appliance = getAppliance();
      if (!appliance) {
        alert("Appliance not found in this brigade.");
        navigateToSetupHome?.();
        return;
      }
      lastSavedTruckData = JSON.parse(JSON.stringify(truckData));
      hasUnsavedChanges = false;
      activeView = "lockers";
      render();
    } catch (error) {
      console.error("Setup load failed:", error);
      setError(error.message || "Failed to load appliance setup.");
      contentEl.innerHTML = "";
    }
  }

  saveBtn.addEventListener("click", () => void saveBrigadeData({ source: "manual" }));

  function beforeUnloadHandler(e) {
    if (!hasUnsavedChanges && !hasActiveUploads()) return;
    e.preventDefault();
    e.returnValue = "";
  }

  window.addEventListener("beforeunload", beforeUnloadHandler);
  setRouteGuard?.((target) => {
    if (hasActiveUploads()) {
      openUploadBlockedModal(target);
      return false;
    }
    if (!hasUnsavedChanges || isSaving) return true;
    openUnsavedModal(target);
    return false;
  });
  setBackHandler?.(() => {
    if (activeView === "container") {
      activeView = "locker";
      activeContainerId = null;
      render();
      return true;
    }
    if (activeView === "locker") {
      activeView = "lockers";
      activeLockerId = null;
      activeContainerId = null;
      render();
      return true;
    }
    return false;
  });

  window.__setupCleanup = () => {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    setRouteGuard?.(null);
    setBackHandler?.(null);
    if (savedTimer) clearTimeout(savedTimer);
    clearAutosaveTimer();
    void cleanupUnsavedUploadedImages();
    pendingUploads.forEach((entry) => {
      if (entry?.objectUrl) {
        try { URL.revokeObjectURL(entry.objectUrl); } catch (err) {}
      }
    });
    privateImageUrlCache.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (err) {}
    });
    modalLayer.remove();
  };

  await loadData();
}
