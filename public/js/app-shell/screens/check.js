const CHECK_SESSION_ID_KEY = "checkSessionId";
const CHECK_SESSION_BRIGADE_ID_KEY = "checkSessionBrigadeId";
const CHECK_SESSION_APPLIANCE_ID_KEY = "checkSessionApplianceId";
const CHECK_SESSION_STARTUP_MODE_KEY = "checkSessionStartupMode";

const CHECK_RUNNER_STYLES = `
.fs-check-runner {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 82px);
  padding-bottom: 18px;
}
.fs-check-runner.fs-check-runner-active {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.fs-check-runner.fs-check-runner-active .fs-check-toolbar {
  flex: 0 0 auto;
}
.fs-check-toolbar {
  position: sticky;
  top: 0;
  z-index: 8;
  margin: -18px -16px 14px;
  padding: 12px 16px;
  background: rgba(246, 247, 251, 0.94);
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
  backdrop-filter: blur(12px);
}
.fs-check-toolbar-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.fs-check-kicker {
  color: var(--fs-muted);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.fs-check-title {
  color: var(--fs-text);
  font-size: 18px;
  font-weight: 850;
  line-height: 1.2;
}
.fs-check-status {
  color: var(--fs-muted);
  font-size: 13px;
}
.fs-check-view {
  display: grid;
  gap: 14px;
}
.fs-check-active {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding-bottom: 98px;
}
.fs-check-detail-card {
  flex: 0 0 auto;
}
.fs-check-items-card {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}
.fs-check-items-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 14px;
}
.fs-check-focus {
  display: grid;
  grid-template-columns: minmax(190px, 42%) minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}
.fs-check-photo {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.06);
  border: 1px solid rgba(148, 163, 184, 0.3);
}
.fs-check-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fs-check-item-name {
  color: var(--fs-text);
  font-size: 24px;
  font-weight: 850;
  line-height: 1.15;
}
.fs-check-item-desc {
  margin-top: 8px;
  color: var(--fs-muted);
  font-size: 15px;
  white-space: pre-wrap;
}
.fs-check-detail-status {
  margin-top: 12px;
}
.fs-check-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(116px, 1fr));
  gap: 12px;
}
.fs-check-tile {
  position: relative;
  min-height: 136px;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 16px;
  background: #fff;
  color: var(--fs-text);
  display: grid;
  grid-template-rows: 74px auto;
  gap: 8px;
  padding: 10px;
  text-align: center;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.fs-check-tile:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
}
.fs-check-tile.is-active {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16), 0 12px 24px rgba(15, 23, 42, 0.08);
}
.fs-check-tile.is-active::after {
  content: "✓";
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: #2563eb;
  border: 2px solid #fff;
  font-size: 14px;
  font-weight: 900;
  box-shadow: 0 8px 16px rgba(37, 99, 235, 0.3);
}
.fs-check-tile.status-present { border-color: rgba(22, 163, 74, 0.5); background: rgba(240, 253, 244, 0.92); }
.fs-check-tile.status-missing { border-color: rgba(225, 29, 72, 0.5); background: rgba(255, 241, 242, 0.92); }
.fs-check-tile.status-note { border-color: rgba(194, 65, 12, 0.58); background: rgba(255, 237, 213, 0.94); }
.fs-check-tile.status-partial { border-color: rgba(245, 158, 11, 0.62); background: rgba(254, 243, 199, 0.94); }
.fs-check-thumb {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.06);
}
.fs-check-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fs-check-tile-label {
  min-width: 0;
}
.fs-check-tile-title {
  color: var(--fs-text);
  font-size: 15px;
  font-weight: 850;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.fs-check-tile-meta {
  margin-top: 3px;
  color: var(--fs-muted);
  font-size: 12px;
  font-weight: 700;
}
.fs-check-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 74px;
  padding: 4px 9px;
  border-radius: 999px;
  color: #fff;
  font-size: 12px;
  font-weight: 850;
}
.fs-check-pill.present { background: #16a34a; }
.fs-check-pill.missing { background: #e11d48; }
.fs-check-pill.note { background: #c2410c; }
.fs-check-pill.partial { background: #f59e0b; color: #111827; }
.fs-check-pill.untouched { background: #94a3b8; }
.fs-check-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 14;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  background: rgba(246, 247, 251, 0.96);
  border-top: 1px solid rgba(226, 232, 240, 0.95);
  backdrop-filter: blur(14px);
}
.fs-check-actions-inner {
  max-width: 680px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.fs-check-action {
  min-height: 58px;
  border-radius: 16px;
  font-size: 16px;
  font-weight: 850;
}
.fs-check-action.present { background: #16a34a; color: #fff; }
.fs-check-action.missing { background: #e11d48; color: #fff; }
.fs-check-action.note { background: #ea580c; color: #fff; }
.fs-check-status-list {
  display: grid;
  gap: 10px;
}
.fs-check-status-row {
  width: 100%;
  text-align: left;
}
.fs-check-status-row.fs-row-active {
  border-color: #2563eb;
  background: #dbeafe;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16), 0 12px 28px rgba(37, 99, 235, 0.16);
}
.fs-check-status-row.fs-row-active .fs-row-title {
  color: #0f172a;
}
.fs-check-status-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.fs-check-selected-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  color: #fff;
  background: #2563eb;
  font-size: 12px;
  font-weight: 850;
  box-shadow: 0 8px 16px rgba(37, 99, 235, 0.24);
}
.fs-check-summary-list {
  display: grid;
  gap: 12px;
}
.fs-check-summary-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.88);
  border: 1px solid rgba(226, 232, 240, 0.95);
}
.fs-check-subrow {
  margin-left: 28px;
  background: #fff;
}
.fs-check-note-preview {
  grid-column: 2 / -1;
  color: var(--fs-muted);
  font-size: 13px;
}
.fs-check-note-img {
  margin-top: 8px;
  width: 140px;
  height: 92px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid rgba(203, 213, 225, 0.9);
  background: rgba(15, 23, 42, 0.06);
}
.fs-check-modal-card {
  width: min(640px, calc(100vw - 28px));
}
.fs-check-note-preview-img {
  width: 100%;
  max-height: 220px;
  border-radius: 14px;
  object-fit: cover;
  border: 1px solid rgba(203, 213, 225, 0.9);
  background: rgba(15, 23, 42, 0.06);
}
.fs-check-signature {
  width: 100%;
  height: 190px;
  border-radius: 14px;
  border: 1px dashed rgba(100, 116, 139, 0.75);
  background: #fff;
  touch-action: none;
}
@media (max-width: 560px) {
  .fs-check-runner {
    min-height: calc(100vh - 74px);
  }
  .fs-check-runner.fs-check-runner-active {
    min-height: 0;
  }
  .fs-check-focus {
    grid-template-columns: minmax(152px, 42%) minmax(0, 1fr);
    gap: 12px;
  }
  .fs-check-item-name {
    font-size: 18px;
  }
  .fs-check-item-desc {
    font-size: 13px;
    line-height: 1.35;
  }
  .fs-check-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 7px;
  }
  .fs-check-tile {
    min-height: 82px;
    grid-template-rows: 44px auto;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
  }
  .fs-check-thumb {
    border-radius: 8px;
  }
  .fs-check-tile-title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    font-size: 10px;
    line-height: 1.08;
  }
  .fs-check-tile-meta {
    margin-top: 2px;
    font-size: 9px;
    line-height: 1;
  }
  .fs-check-tile.is-active::after {
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    font-size: 11px;
    border-width: 1px;
  }
  .fs-check-actions-inner {
    gap: 8px;
  }
  .fs-check-action {
    min-height: 54px;
    font-size: 14px;
  }
}
@media (max-width: 380px) {
  .fs-check-focus {
    grid-template-columns: 1fr;
  }
  .fs-check-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .fs-check-tile {
    min-height: 92px;
    grid-template-rows: 52px auto;
  }
}
`;

function ensureStyles() {
  if (document.getElementById("fs-check-runner-styles")) return;
  const style = document.createElement("style");
  style.id = "fs-check-runner-styles";
  style.textContent = CHECK_RUNNER_STYLES;
  document.head.appendChild(style);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    err.data = data;
    throw err;
  }
  return data;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
  const normalized = isPlainObject(data) ? { ...data } : {};
  normalized.appliances = Array.isArray(normalized.appliances) ? normalized.appliances : [];
  normalized.appliances = normalized.appliances.map((appliance) => ({
    ...appliance,
    id: String(appliance?.id || Date.now()),
    name: String(appliance?.name || "Appliance"),
    lockers: Array.isArray(appliance?.lockers)
      ? appliance.lockers.map((locker) => ({
          ...locker,
          id: String(locker?.id || Date.now()),
          name: String(locker?.name || "Locker"),
          items: lockerItems(locker).map(cloneItem),
        }))
      : [],
  }));
  return normalized;
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

function normalizeAnswer(raw, fallbackItemId = "") {
  if (!raw || typeof raw !== "object") return null;
  const itemId = raw.itemId != null ? String(raw.itemId) : String(fallbackItemId || "");
  if (!itemId) return null;
  const answer = {
    lockerId: raw.lockerId ?? null,
    lockerName: raw.lockerName || "",
    itemId,
    itemName: raw.itemName || "",
    itemImg: raw.itemImg || raw.img || "",
    parentItemId: raw.parentItemId || null,
    status: raw.status || "untouched",
    note: raw.note || "",
  };
  if (raw.noteImage) answer.noteImage = raw.noteImage;
  return answer;
}

function normalizeAnswers(answers) {
  if (Array.isArray(answers)) return answers.map((answer) => normalizeAnswer(answer)).filter(Boolean);
  if (answers && typeof answers === "object") {
    return Object.entries(answers)
      .map(([itemId, answer]) => normalizeAnswer(answer, itemId))
      .filter(Boolean);
  }
  return [];
}

function statusLabel(status) {
  if (status === "complete") return "Complete";
  if (status === "present") return "Present";
  if (status === "missing") return "Missing";
  if (status === "note") return "Note";
  if (status === "partial") return "Partial";
  return "Unchecked";
}

function statusClass(status) {
  return ["present", "missing", "note", "partial"].includes(status) ? status : "untouched";
}

function createSignaturePad(canvas, { onChange } = {}) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const state = {
    drawing: false,
    currentStroke: null,
    lastPoint: null,
    data: { version: 1, strokes: [] },
  };

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.width ? (event.clientX - rect.left) / rect.width : 0,
      y: rect.height ? (event.clientY - rect.top) / rect.height : 0,
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }

  function drawSegment(a, b) {
    const rect = canvas.getBoundingClientRect();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#0f172a";
    ctx.beginPath();
    ctx.moveTo(a.x * rect.width, a.y * rect.height);
    ctx.lineTo(b.x * rect.width, b.y * rect.height);
    ctx.stroke();
  }

  function drawDot(p) {
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(p.x * rect.width, p.y * rect.height, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function redraw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    state.data.strokes.forEach((stroke) => {
      const points = Array.isArray(stroke?.points) ? stroke.points : [];
      points.forEach((point, index) => {
        if (index === 0) drawDot(point);
        else drawSegment(points[index - 1], point);
      });
    });
  }

  function clear() {
    state.data = { version: 1, strokes: [] };
    state.currentStroke = null;
    state.lastPoint = null;
    redraw();
    onChange?.(null);
  }

  function getData() {
    return state.data.strokes.length ? state.data : null;
  }

  function setData(data) {
    const strokes = Array.isArray(data?.strokes) ? data.strokes : [];
    state.data = {
      version: 1,
      strokes: strokes
        .map((stroke) => ({
          points: (Array.isArray(stroke?.points) ? stroke.points : [])
            .map((point) => ({
              x: Math.max(0, Math.min(1, Number(point.x) || 0)),
              y: Math.max(0, Math.min(1, Number(point.y) || 0)),
            }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
        }))
        .filter((stroke) => stroke.points.length),
    };
    redraw();
  }

  function start(event) {
    state.drawing = true;
    const point = pointFromEvent(event);
    state.currentStroke = [point];
    state.lastPoint = point;
    drawDot(point);
    try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    event.preventDefault();
  }

  function move(event) {
    if (!state.drawing || !state.currentStroke) return;
    const point = pointFromEvent(event);
    const previous = state.lastPoint;
    state.currentStroke.push(point);
    if (previous) drawSegment(previous, point);
    state.lastPoint = point;
    event.preventDefault();
  }

  function end(event) {
    if (!state.drawing) return;
    state.drawing = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    if (state.currentStroke?.length) {
      state.data.strokes.push({ points: state.currentStroke });
      state.currentStroke = null;
      state.lastPoint = null;
      onChange?.(getData());
    }
  }

  canvas.addEventListener("pointerdown", start, { passive: false });
  canvas.addEventListener("pointermove", move, { passive: false });
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", end);
  window.addEventListener("resize", resize);
  requestAnimationFrame(resize);

  return { clear, getData, setData, resize, destroy: () => window.removeEventListener("resize", resize) };
}

export async function renderCheck({
  root,
  auth,
  brigadeId,
  applianceId,
  setShellChromeVisible,
  setShellTabbarVisible,
  setTitle,
  setRouteGuard,
  setBackHandler,
  navigateToChecksHome,
  navigateToMenu,
  showLoading,
  hideLoading,
}) {
  ensureStyles();
  root.innerHTML = "";
  setShellChromeVisible?.(true);
  setShellTabbarVisible?.(false);
  localStorage.setItem("activeBrigadeId", brigadeId);
  localStorage.setItem("selectedBrigadeId", brigadeId);
  localStorage.setItem("selectedApplianceId", applianceId);

  let disposed = false;
  let currentUser = auth.currentUser;
  let truckData = { appliances: [] };
  let appliance = null;
  let activeCheckSessionId = "";
  let activeCheckSession = null;
  let checkResults = [];
  let view = "active";
  let noteModal = null;
  let exitModalOpen = false;
  let nextLockerToStartId = null;
  let reportSignedName = "";
  let reportSignature = null;
  let saveState = "idle";
  let saveMessage = "";
  let noteSelectedFile = null;
  let noteImageRef = "";
  let notePreviewUrl = "";
  let signaturePad = null;
  let pendingNavigation = null;
  let hasCompletedReport = false;
  let modalClickHandler = null;
  let pendingAnswerSaves = new Set();
  let failedAnswerPayloads = new Map();
  let latestAnswerSequenceByItem = new Map();
  let answerSequence = 0;
  let currentCheckState = {
    lockerId: null,
    selectedItemId: null,
    isInsideContainer: false,
    parentItemId: null,
    isRechecking: false,
  };
  const privateImageUrlCache = new Map();

  const container = el("section", "fs-page fs-check-runner max-w-4xl mx-auto");
  root.appendChild(container);

  function tokenPromise() {
    if (!currentUser) throw new Error("Not signed in.");
    return currentUser.getIdToken();
  }

  async function apiJson(url, options = {}) {
    const token = await tokenPromise();
    return fetchJson(url, { ...options, token });
  }

  async function resolveImageDisplayUrl(imageRef) {
    if (!imageRef) return "";
    if (isDirectImageRef(imageRef)) return imageRef;
    if (!isPrivateImageRef(imageRef) || !currentUser) return "";
    if (privateImageUrlCache.has(imageRef)) return privateImageUrlCache.get(imageRef);
    const fileName = imageRef.split("/").pop();
    const token = await tokenPromise();
    const res = await fetch(
      `/api/brigades/${encodeURIComponent(brigadeId)}/images/${encodeURIComponent(fileName)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Image load failed (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    privateImageUrlCache.set(imageRef, url);
    return url;
  }

  function setImageSource(img, imageRef, fallback = "/design_assets/Flashover Logo.png") {
    if (!img) return;
    const ref = imageRef || "";
    img.dataset.imageRef = ref;
    if (!ref) {
      img.src = fallback;
      return;
    }
    if (isDirectImageRef(ref)) {
      img.src = ref;
      return;
    }
    img.src = fallback;
    void resolveImageDisplayUrl(ref)
      .then((url) => {
        if (url && img.dataset.imageRef === ref) img.src = url;
      })
      .catch((error) => console.error("Could not load private image:", error));
  }

  function getLockerItems(locker) {
    return Array.isArray(locker?.items) ? locker.items : [];
  }

  function findLockerById(lockerId) {
    return (appliance?.lockers || []).find((locker) => String(locker.id) === String(lockerId)) || null;
  }

  function findItemById(itemId, parentItemId = null) {
    if (!itemId) return null;
    if (parentItemId) {
      const parent = findItemById(parentItemId);
      return (parent?.subItems || []).find((item) => String(item.id) === String(itemId)) || null;
    }
    for (const locker of appliance?.lockers || []) {
      const item = getLockerItems(locker).find((candidate) => String(candidate.id) === String(itemId));
      if (item) return item;
    }
    return null;
  }

  function getCurrentLocker() {
    return findLockerById(currentCheckState.lockerId) || appliance?.lockers?.[0] || null;
  }

  function getCurrentItem() {
    return findItemById(currentCheckState.selectedItemId, currentCheckState.parentItemId);
  }

  function getResult(itemId) {
    return checkResults.find((result) => String(result.itemId) === String(itemId)) || null;
  }

  function answerExists(itemId) {
    return !!getResult(itemId);
  }

  function getLockerStatus(lockerId) {
    const locker = findLockerById(lockerId);
    if (!locker) return "untouched";
    const items = getLockerItems(locker);
    if (!items.length) return "complete";
    const checkedCount = items.filter((item) => answerExists(item.id)).length;
    if (checkedCount === items.length) return "complete";
    if (checkedCount > 0) return "partial";
    return "untouched";
  }

  function allLockersComplete() {
    return (appliance?.lockers || []).every((locker) => getLockerStatus(locker.id) === "complete");
  }

  function nextUncheckedTopLevelItem(locker) {
    return getLockerItems(locker).find((item) => !answerExists(item.id)) || null;
  }

  function nextUncheckedSubItem(containerItem) {
    return (containerItem?.subItems || []).find((item) => !answerExists(item.id)) || null;
  }

  function selectNextTopLevelItem(locker) {
    const nextItem = nextUncheckedTopLevelItem(locker);
    currentCheckState.selectedItemId = nextItem?.id || null;
    currentCheckState.parentItemId = null;
    currentCheckState.isInsideContainer = false;
    saveLocalState();
  }

  function deriveResumeStateFromAnswers() {
    const fallbackLocker = appliance?.lockers?.[0] || null;
    const fallback = {
      lockerId: fallbackLocker?.id || null,
      selectedItemId: null,
      isInsideContainer: false,
      parentItemId: null,
      isRechecking: false,
    };
    if (!appliance?.lockers?.length) return fallback;
    for (const locker of appliance.lockers) {
      for (const item of getLockerItems(locker)) {
        if (item.type === "container" && item.subItems?.length) {
          const parentAnswered = answerExists(item.id);
          const anySubAnswered = item.subItems.some((subItem) => answerExists(subItem.id));
          const nextSub = nextUncheckedSubItem(item);
          if (!parentAnswered && anySubAnswered && nextSub) {
            return {
              lockerId: locker.id,
              selectedItemId: nextSub.id,
              isInsideContainer: true,
              parentItemId: item.id,
              isRechecking: false,
            };
          }
        }
        if (!answerExists(item.id)) {
          return {
            lockerId: locker.id,
            selectedItemId: item.id,
            isInsideContainer: false,
            parentItemId: null,
            isRechecking: false,
          };
        }
      }
    }
    return {
      ...fallback,
      lockerId: appliance.lockers[appliance.lockers.length - 1]?.id || fallback.lockerId,
    };
  }

  function stateFromSession(session) {
    if (!session || typeof session !== "object") return null;
    const raw = session.currentCheckState || session.checkState || session.state || {};
    const lockerId = raw.lockerId || raw.currentLockerId || session.lockerId || session.currentLockerId;
    if (!lockerId || !findLockerById(lockerId)) return null;
    const parentItemId = raw.parentItemId || session.parentItemId || null;
    let selectedItemId = raw.selectedItemId || raw.currentItemId || session.selectedItemId || session.currentItemId || null;
    if (selectedItemId && !findItemById(selectedItemId, parentItemId)) selectedItemId = null;
    return {
      lockerId,
      selectedItemId,
      isInsideContainer: !!(raw.isInsideContainer || session.isInsideContainer || parentItemId),
      parentItemId,
      isRechecking: false,
    };
  }

  function saveLocalState() {
    sessionStorage.setItem("checkInProgress", "true");
    sessionStorage.setItem("checkResults", JSON.stringify(checkResults));
    sessionStorage.setItem("currentCheckState", JSON.stringify(currentCheckState));
  }

  function clearLocalState() {
    sessionStorage.removeItem("checkInProgress");
    sessionStorage.removeItem("checkResults");
    sessionStorage.removeItem("currentCheckState");
  }

  function clearStoredCheckSession() {
    localStorage.removeItem(CHECK_SESSION_ID_KEY);
    localStorage.removeItem(CHECK_SESSION_BRIGADE_ID_KEY);
    localStorage.removeItem(CHECK_SESSION_APPLIANCE_ID_KEY);
    localStorage.removeItem(CHECK_SESSION_STARTUP_MODE_KEY);
    activeCheckSessionId = "";
    activeCheckSession = null;
  }

  function setSaveStatus(state, message) {
    saveState = state || "idle";
    saveMessage = message || "";
    const status = container.querySelector("[data-check-save-status]");
    if (status) {
      status.textContent = saveMessage || (saveState === "saving" ? "Saving..." : saveState === "failed" ? "Save failed" : "All changes saved.");
    }
  }

  function buildAnswerPayload(result) {
    return {
      lockerId: result.lockerId ?? null,
      lockerName: result.lockerName || "",
      itemId: result.itemId,
      itemName: result.itemName || "",
      itemImg: result.itemImg || "",
      parentItemId: result.parentItemId || null,
      status: result.status || "untouched",
      note: result.note || "",
      noteImage: result.noteImage || null,
    };
  }

  async function postAnswerPayload(payload) {
    if (!activeCheckSessionId || !payload?.itemId) return null;
    return apiJson(
      `/api/brigades/${encodeURIComponent(brigadeId)}/check-sessions/${encodeURIComponent(activeCheckSessionId)}/answers/${encodeURIComponent(payload.itemId)}`,
      { method: "POST", body: payload },
    );
  }

  function saveAnswerInBackground(result) {
    if (!activeCheckSessionId || !result?.itemId) return;
    const payload = buildAnswerPayload(result);
    const key = String(payload.itemId);
    const sequence = answerSequence + 1;
    answerSequence = sequence;
    latestAnswerSequenceByItem.set(key, sequence);
    failedAnswerPayloads.delete(key);
    setSaveStatus("saving", "Saving...");

    const promise = postAnswerPayload(payload)
      .then(() => {
        if (latestAnswerSequenceByItem.get(key) === sequence) failedAnswerPayloads.delete(key);
      })
      .catch((error) => {
        console.error("Could not save check answer:", error);
        if (latestAnswerSequenceByItem.get(key) === sequence) failedAnswerPayloads.set(key, payload);
      })
      .finally(() => {
        pendingAnswerSaves.delete(promise);
        if (pendingAnswerSaves.size) {
          setSaveStatus("saving", "Saving...");
        } else if (failedAnswerPayloads.size) {
          setSaveStatus("failed", "Some answers need retrying.");
        } else {
          setSaveStatus("saved", "All changes saved.");
        }
      });
    pendingAnswerSaves.add(promise);
  }

  async function flushAnswerSaves() {
    if (pendingAnswerSaves.size) await Promise.all(Array.from(pendingAnswerSaves));
    if (!failedAnswerPayloads.size) return true;
    setSaveStatus("saving", "Retrying saves...");
    const payloads = Array.from(failedAnswerPayloads.entries());
    await Promise.all(payloads.map(async ([key, payload]) => {
      try {
        await postAnswerPayload(payload);
        failedAnswerPayloads.delete(key);
      } catch (error) {
        console.error("Could not retry check answer:", error);
      }
    }));
    setSaveStatus(failedAnswerPayloads.size ? "failed" : "saved", failedAnswerPayloads.size ? "Some answers need retrying." : "All changes saved.");
    return failedAnswerPayloads.size === 0;
  }

  function recordResult(nextResult) {
    const index = checkResults.findIndex((result) => String(result.itemId) === String(nextResult.itemId));
    const existing = index >= 0 ? checkResults[index] : null;
    const merged = { ...(existing || {}), ...nextResult };
    if (existing?.noteImage && nextResult.noteImage === undefined && merged.status === "note") {
      merged.noteImage = existing.noteImage;
    }
    if (merged.status !== "note") {
      delete merged.noteImage;
      merged.note = "";
    }
    if (index >= 0) checkResults[index] = merged;
    else checkResults.push(merged);
    saveLocalState();
    saveAnswerInBackground(merged);
    return merged;
  }

  async function loadData() {
    const data = await apiJson(`/api/brigades/${encodeURIComponent(brigadeId)}/data`);
    truckData = normalizeTruckData(data);
    appliance = truckData.appliances.find((item) => String(item.id) === String(applianceId)) || null;
    if (!appliance) throw new Error("Appliance not found.");
    if (!appliance.lockers?.length) throw new Error("This appliance has no lockers to check.");
    if (!currentCheckState.lockerId) currentCheckState.lockerId = appliance.lockers[0].id;
  }

  function hydrateSession(payload) {
    activeCheckSession = payload?.session || payload || null;
    checkResults = normalizeAnswers(payload?.answers);
    currentCheckState = stateFromSession(activeCheckSession) || deriveResumeStateFromAnswers();
    saveLocalState();
    setSaveStatus("saved", "All changes saved.");
  }

  async function startOrResumeSession() {
    const storedSessionId = String(localStorage.getItem(CHECK_SESSION_ID_KEY) || "").trim();
    const storedBrigadeId = String(localStorage.getItem(CHECK_SESSION_BRIGADE_ID_KEY) || "").trim();
    const storedApplianceId = String(localStorage.getItem(CHECK_SESSION_APPLIANCE_ID_KEY) || "").trim();
    if (
      storedSessionId &&
      (!storedBrigadeId || storedBrigadeId === String(brigadeId)) &&
      (!storedApplianceId || storedApplianceId === String(applianceId))
    ) {
      activeCheckSessionId = storedSessionId;
      localStorage.removeItem(CHECK_SESSION_STARTUP_MODE_KEY);
      try {
        await apiJson(`/api/brigades/${encodeURIComponent(brigadeId)}/check-sessions/${encodeURIComponent(activeCheckSessionId)}/claim`, { method: "POST" });
        const payload = await apiJson(`/api/brigades/${encodeURIComponent(brigadeId)}/check-sessions/${encodeURIComponent(activeCheckSessionId)}`);
        const session = payload?.session || payload || null;
        if (session?.applianceId && String(session.applianceId) !== String(applianceId)) {
          clearStoredCheckSession();
        } else {
          hydrateSession(payload);
          localStorage.setItem(CHECK_SESSION_BRIGADE_ID_KEY, brigadeId);
          localStorage.setItem(CHECK_SESSION_APPLIANCE_ID_KEY, applianceId);
          return;
        }
      } catch (error) {
        if (error.status !== 404 && error.status !== 410) throw error;
        clearStoredCheckSession();
      }
    }

    clearStoredCheckSession();
    const payload = await apiJson(
      `/api/brigades/${encodeURIComponent(brigadeId)}/appliances/${encodeURIComponent(applianceId)}/check-sessions`,
      { method: "POST", body: {} },
    );
    activeCheckSessionId = payload.sessionId || payload.session?.id || "";
    if (!activeCheckSessionId) throw new Error("The check session did not return an id.");
    localStorage.setItem(CHECK_SESSION_ID_KEY, activeCheckSessionId);
    localStorage.setItem(CHECK_SESSION_BRIGADE_ID_KEY, brigadeId);
    localStorage.setItem(CHECK_SESSION_APPLIANCE_ID_KEY, applianceId);
    hydrateSession(payload);
  }

  function updateTitle() {
    if (!setTitle) return;
    if (view === "summary") {
      setTitle("Check summary");
      return;
    }
    if (view === "signoff") {
      setTitle("Sign off");
      return;
    }
    if (view === "locker-status") {
      setTitle("Locker status");
      return;
    }
    if (currentCheckState.isInsideContainer) {
      const parent = findItemById(currentCheckState.parentItemId);
      setTitle(parent?.name || "Container");
      return;
    }
    setTitle(getCurrentLocker()?.name || appliance?.name || "Check");
  }

  function renderToolbar(kicker, title, actionHtml = "") {
    return `
      <div class="fs-check-toolbar">
        <div class="fs-check-toolbar-inner">
          <div>
            <div class="fs-check-kicker">${escapeHtml(kicker)}</div>
            <div class="fs-check-title">${escapeHtml(title)}</div>
            <div class="fs-check-status" data-check-save-status>${escapeHtml(saveMessage || (saveState === "saving" ? "Saving..." : saveState === "failed" ? "Some answers need retrying." : "All changes saved."))}</div>
          </div>
          <div>${actionHtml}</div>
        </div>
      </div>
    `;
  }

  function renderThumb(item) {
    return `
      <div class="fs-check-thumb">
        <img data-image-ref="${escapeHtml(item?.img || "")}" alt="${escapeHtml(item?.name || "Item")}" src="/design_assets/Flashover Logo.png">
      </div>
    `;
  }

  function hydrateImages(scope = container) {
    scope.querySelectorAll("img[data-image-ref]").forEach((img) => {
      setImageSource(img, img.dataset.imageRef || "");
    });
  }

  function scrollActiveTileIntoView() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const activeTile = container.querySelector(".fs-check-tile.is-active");
        if (!activeTile) return;
        activeTile.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      });
    });
  }

  function renderActiveView() {
    updateTitle();
    const locker = getCurrentLocker();
    const currentItem = getCurrentItem();
    const currentResult = currentItem ? getResult(currentItem.id) : null;
    const items = currentCheckState.isInsideContainer
      ? (findItemById(currentCheckState.parentItemId)?.subItems || [])
      : getLockerItems(locker);
    const parent = currentCheckState.isInsideContainer ? findItemById(currentCheckState.parentItemId) : null;
    const contextTitle = currentCheckState.isInsideContainer ? (parent?.name || "Container") : (locker?.name || "Locker");

    container.innerHTML = `
      ${renderToolbar(currentCheckState.isInsideContainer ? "Container" : "Locker", contextTitle, `
        <button class="fs-btn fs-btn-secondary fs-btn-sm" type="button" data-action="show-status">Status</button>
      `)}
      <div class="fs-check-view fs-check-active">
        <div class="fs-card fs-check-detail-card">
          <div class="fs-card-inner">
            <div class="fs-check-focus">
              <div class="fs-check-photo">
                <img data-image-ref="${escapeHtml(currentItem?.img || "")}" src="/design_assets/Flashover Logo.png" alt="${escapeHtml(currentItem?.name || "Item")}">
              </div>
              <div>
                <div class="fs-check-kicker">${escapeHtml(currentCheckState.isRechecking ? "Re-check" : currentCheckState.isInsideContainer ? "Checking container item" : "Checking item")}</div>
                <div class="fs-check-item-name">${escapeHtml(currentItem?.name || (items.length ? "Select an item" : "No items in this section"))}</div>
                <div class="fs-check-item-desc">${escapeHtml(currentItem?.desc || (items.length ? "Tap an item below or use the controls to record its status." : "Use locker status to choose the next section."))}</div>
                <div class="fs-check-detail-status">
                  <span class="fs-check-pill ${escapeHtml(statusClass(currentResult?.status))}">${escapeHtml(statusLabel(currentResult?.status))}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="fs-card fs-check-items-card">
          <div class="fs-card-inner fs-stack fs-check-items-scroll">
            <div class="fs-row">
              <div>
                <div class="fs-row-title">${escapeHtml(contextTitle)}</div>
                <div class="fs-row-meta">${escapeHtml(currentCheckState.isInsideContainer ? `Inside ${locker?.name || "locker"}` : `${items.length} item${items.length === 1 ? "" : "s"}`)}</div>
              </div>
              ${currentCheckState.isRechecking ? '<button class="fs-btn fs-btn-secondary fs-btn-sm" type="button" data-action="back-summary">Summary</button>' : ""}
            </div>
            <div class="fs-check-grid">
              ${items.map((item) => {
                const result = getResult(item.id);
                const status = statusClass(result?.status);
                const active = String(item.id) === String(currentCheckState.selectedItemId);
                const meta = item.type === "container"
                  ? `${(item.subItems || []).length} item${(item.subItems || []).length === 1 ? "" : "s"}`
                  : statusLabel(result?.status);
                return `
                  <button class="fs-check-tile status-${status}${active ? " is-active" : ""}" type="button" data-action="select-item" data-item-id="${escapeHtml(item.id)}" data-parent-id="${escapeHtml(currentCheckState.isInsideContainer ? currentCheckState.parentItemId : "")}" aria-pressed="${active ? "true" : "false"}" title="${escapeHtml(`${item.name || "Item"} - ${meta}`)}">
                    ${renderThumb(item)}
                    <span class="fs-check-tile-label">
                      <span class="fs-check-tile-title">${escapeHtml(item.name || "Item")}</span>
                      <span class="fs-check-tile-meta">${escapeHtml(meta)}</span>
                    </span>
                  </button>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      </div>
      ${renderActionBar(currentItem)}
    `;
    hydrateImages();
    scrollActiveTileIntoView();
  }

  function renderActionBar(currentItem) {
    if (!currentItem) {
      return `
        <div class="fs-check-actions">
          <div class="fs-check-actions-inner" style="grid-template-columns: 1fr;">
            <button class="fs-btn fs-btn-primary fs-check-action" type="button" data-action="show-status">Locker status</button>
          </div>
        </div>
      `;
    }
    if (!currentCheckState.isInsideContainer && currentItem.type === "container") {
      return `
        <div class="fs-check-actions">
          <div class="fs-check-actions-inner" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
            <button class="fs-btn fs-check-action missing" type="button" data-action="mark-missing">Missing</button>
            <button class="fs-btn fs-btn-primary fs-check-action" type="button" data-action="check-container">Check contents</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="fs-check-actions">
        <div class="fs-check-actions-inner">
          <button class="fs-btn fs-check-action missing" type="button" data-action="mark-missing">Missing</button>
          <button class="fs-btn fs-check-action note" type="button" data-action="open-note">Note</button>
          <button class="fs-btn fs-check-action present" type="button" data-action="mark-present">Present</button>
        </div>
      </div>
    `;
  }

  function renderLockerStatusView() {
    updateTitle();
    const lockers = appliance?.lockers || [];
    const suggested = lockers.find((locker) => getLockerStatus(locker.id) === "untouched") ||
      lockers.find((locker) => getLockerStatus(locker.id) === "partial") ||
      lockers[0] ||
      null;
    if (!nextLockerToStartId) nextLockerToStartId = suggested?.id || null;

    container.innerHTML = `
      ${renderToolbar("Check progress", appliance?.name || "Appliance", "")}
      <div class="fs-check-view">
        <div class="fs-card">
          <div class="fs-card-inner fs-stack">
            <div class="fs-row">
              <div>
                <div class="fs-row-title">Locker status</div>
                <div class="fs-row-meta">Choose the next locker, return to the current one, or finish when everything is complete.</div>
              </div>
            </div>
            <div class="fs-check-status-list">
              ${lockers.map((locker) => {
                const status = getLockerStatus(locker.id);
                const selected = String(locker.id) === String(nextLockerToStartId);
                const count = getLockerItems(locker).filter((item) => answerExists(item.id)).length;
                return `
                  <button class="fs-row fs-check-status-row ${selected ? "fs-row-active" : ""}" type="button" data-action="choose-locker" data-locker-id="${escapeHtml(locker.id)}" aria-pressed="${selected ? "true" : "false"}">
                    <div>
                      <div class="fs-row-title">${escapeHtml(locker.name || "Locker")}</div>
                      <div class="fs-row-meta">${escapeHtml(`${count}/${getLockerItems(locker).length} checked`)}</div>
                    </div>
                    <span class="fs-check-status-actions">
                      ${selected ? '<span class="fs-check-selected-marker">Selected</span>' : ""}
                      <span class="fs-check-pill ${escapeHtml(statusClass(status === "complete" ? "present" : status))}">${escapeHtml(status === "complete" ? "Complete" : statusLabel(status))}</span>
                    </span>
                  </button>
                `;
              }).join("")}
            </div>
            <div class="fs-actions">
              <button class="fs-btn fs-btn-secondary" type="button" data-action="return-active">Back to current locker</button>
              <button class="fs-btn fs-btn-primary" type="button" data-action="go-locker">Open locker</button>
              <button class="fs-btn fs-btn-primary" type="button" data-action="show-summary" ${allLockersComplete() ? "" : "disabled"}>Summary</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderSummaryView() {
    updateTitle();
    container.innerHTML = `
      ${renderToolbar("Ready for sign-off", appliance?.name || "Appliance", "")}
      <div class="fs-check-view">
        <div class="fs-card">
          <div class="fs-card-inner fs-stack">
            <div class="fs-row">
              <div>
                <div class="fs-row-title">Check summary</div>
                <div class="fs-row-meta">Review answers, re-check items if needed, then sign off.</div>
              </div>
            </div>
            <div class="fs-check-summary-list">
              ${renderSummaryRows()}
            </div>
            <div class="fs-actions">
              <button class="fs-btn fs-btn-secondary" type="button" data-action="show-status">Edit check</button>
              <button class="fs-btn fs-btn-secondary" type="button" data-action="pause-exit">Exit</button>
              <button class="fs-btn fs-btn-primary" type="button" data-action="show-signoff">Sign off</button>
            </div>
          </div>
        </div>
      </div>
    `;
    hydrateImages();
  }

  function renderSummaryRows() {
    const rows = [];
    (appliance?.lockers || []).forEach((locker) => {
      rows.push(`
        <div class="fs-row">
          <div>
            <div class="fs-row-title">${escapeHtml(locker.name || "Locker")}</div>
                    <div class="fs-row-meta">${escapeHtml(statusLabel(getLockerStatus(locker.id)))}</div>
          </div>
        </div>
      `);
      getLockerItems(locker).forEach((item) => {
        const result = getResult(item.id) || {
          lockerId: locker.id,
          lockerName: locker.name,
          itemId: item.id,
          itemName: item.name,
          itemImg: item.img,
          status: "untouched",
        };
        rows.push(renderSummaryRow(result, item, false));
        if (item.type === "container") {
          (item.subItems || []).forEach((subItem) => {
            const subResult = getResult(subItem.id) || {
              lockerId: locker.id,
              lockerName: locker.name,
              itemId: subItem.id,
              itemName: subItem.name,
              itemImg: subItem.img,
              parentItemId: item.id,
              status: "untouched",
            };
            rows.push(renderSummaryRow(subResult, subItem, true));
          });
        }
      });
    });
    return rows.join("");
  }

  function renderSummaryRow(result, item, isSubItem) {
    const status = statusClass(result.status);
    return `
      <div class="fs-check-summary-row ${isSubItem ? "fs-check-subrow" : ""}">
        <span class="fs-check-pill ${status}">${escapeHtml(statusLabel(result.status))}</span>
        <div>
          <div class="fs-row-title">${escapeHtml(result.itemName || item?.name || "Item")}</div>
          <div class="fs-row-meta">${escapeHtml(isSubItem ? "Container item" : item?.type === "container" ? "Container" : "Item")}</div>
        </div>
        <button class="fs-btn fs-btn-secondary fs-btn-sm" type="button" data-action="recheck" data-locker-id="${escapeHtml(result.lockerId || "")}" data-item-id="${escapeHtml(result.itemId || "")}" data-parent-id="${escapeHtml(result.parentItemId || "")}">Re-check</button>
        ${result.note || result.noteImage ? `
          <div class="fs-check-note-preview">
            ${result.note ? `<div>${escapeHtml(result.note)}</div>` : ""}
            ${result.noteImage ? `<img class="fs-check-note-img" data-image-ref="${escapeHtml(result.noteImage)}" src="/design_assets/Flashover Logo.png" alt="Attached note image">` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderSignoffView() {
    updateTitle();
    const defaultName = reportSignedName || currentUser?.displayName || currentUser?.email || "";
    container.innerHTML = `
      ${renderToolbar("Final step", appliance?.name || "Appliance", "")}
      <div class="fs-check-view">
        <div class="fs-card">
          <div class="fs-card-inner fs-stack">
            <div>
              <div class="fs-row-title">Sign off check</div>
              <div class="fs-row-meta">Enter the signing name and draw initials before creating the report.</div>
            </div>
            <label class="fs-field">
              <span class="fs-label">Name</span>
              <input id="check-signoff-name" class="fs-input" type="text" maxlength="120" value="${escapeHtml(defaultName)}">
            </label>
            <div class="fs-field">
              <span class="fs-label">Signature</span>
              <canvas id="check-signoff-canvas" class="fs-check-signature"></canvas>
            </div>
            <div class="fs-actions">
              <button class="fs-btn fs-btn-secondary" type="button" data-action="clear-signature">Clear</button>
              <button class="fs-btn fs-btn-secondary" type="button" data-action="show-summary">Back</button>
              <button class="fs-btn fs-btn-primary" type="button" data-action="complete-check" disabled>Create report</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const nameInput = container.querySelector("#check-signoff-name");
    const completeBtn = container.querySelector("[data-action='complete-check']");
    const updateEnabled = () => {
      reportSignedName = String(nameInput?.value || "").trim();
      if (completeBtn) completeBtn.disabled = !reportSignedName || !reportSignature;
    };
    signaturePad?.destroy?.();
    signaturePad = createSignaturePad(container.querySelector("#check-signoff-canvas"), {
      onChange: (data) => {
        reportSignature = data;
        updateEnabled();
      },
    });
    if (reportSignature) signaturePad?.setData(reportSignature);
    nameInput?.addEventListener("input", updateEnabled);
    requestAnimationFrame(updateEnabled);
  }

  function renderLoading(message = "Loading check...") {
    setTitle?.("Loading check");
    container.innerHTML = `
      <div class="fs-card">
        <div class="fs-card-inner">
          <div class="fs-row">
            <div>
              <div class="fs-row-title">${escapeHtml(message)}</div>
              <div class="fs-row-meta">Preparing appliance data and saved progress.</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderError(message) {
    setTitle?.("Check unavailable");
    container.innerHTML = `
      <div class="fs-card">
        <div class="fs-card-inner fs-stack">
          <div class="fs-alert fs-alert-danger">${escapeHtml(message)}</div>
          <div class="fs-actions">
            <button class="fs-btn fs-btn-primary" type="button" data-action="checks-home">Back to checks</button>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    if (disposed) return;
    container.classList.toggle("fs-check-runner-active", view === "active");
    if (signaturePad) {
      signaturePad.destroy?.();
      signaturePad = null;
    }
    if (view === "locker-status") renderLockerStatusView();
    else if (view === "summary") renderSummaryView();
    else if (view === "signoff") renderSignoffView();
    else renderActiveView();
  }

  function goToView(nextView) {
    view = nextView;
    render();
  }

  function selectItem(itemId, parentId = null) {
    currentCheckState.selectedItemId = itemId || null;
    currentCheckState.parentItemId = parentId || null;
    currentCheckState.isInsideContainer = !!parentId;
    saveLocalState();
    render();
  }

  function advanceAfterAnswer() {
    if (currentCheckState.isRechecking) {
      goToView("summary");
      return;
    }
    if (currentCheckState.isInsideContainer) {
      const parent = findItemById(currentCheckState.parentItemId);
      const next = nextUncheckedSubItem(parent);
      if (next) {
        currentCheckState.selectedItemId = next.id;
      } else {
        finishContainerCheck();
        return;
      }
    } else {
      const locker = getCurrentLocker();
      const next = nextUncheckedTopLevelItem(locker);
      currentCheckState.selectedItemId = next?.id || null;
      if (!next) {
        goToView("locker-status");
        return;
      }
    }
    saveLocalState();
    render();
  }

  function processCheck(status, note = "", noteImage = undefined) {
    const item = getCurrentItem();
    const locker = getCurrentLocker();
    if (!item || !locker) return;
    const result = {
      lockerId: locker.id,
      lockerName: locker.name || "",
      itemId: item.id,
      itemName: item.name || "",
      itemImg: item.img || "",
      parentItemId: currentCheckState.parentItemId || null,
      status,
      note,
    };
    if (noteImage !== undefined) result.noteImage = noteImage || null;
    recordResult(result);
    advanceAfterAnswer();
  }

  function startContainerCheck() {
    const item = getCurrentItem();
    if (!item || item.type !== "container") return;
    if (!item.subItems?.length) {
      processCheck("present");
      return;
    }
    currentCheckState.isInsideContainer = true;
    currentCheckState.parentItemId = item.id;
    currentCheckState.selectedItemId = nextUncheckedSubItem(item)?.id || item.subItems[0]?.id || null;
    saveLocalState();
    render();
  }

  function finishContainerCheck() {
    const locker = getCurrentLocker();
    const parent = findItemById(currentCheckState.parentItemId);
    if (!locker || !parent) return;
    const subResults = (parent.subItems || []).map((subItem) => getResult(subItem.id)).filter(Boolean);
    let status = "present";
    if (subResults.some((result) => result.status === "missing" || result.status === "partial")) status = "partial";
    else if (subResults.some((result) => result.status === "note")) status = "note";
    recordResult({
      lockerId: locker.id,
      lockerName: locker.name || "",
      itemId: parent.id,
      itemName: parent.name || "",
      itemImg: parent.img || "",
      parentItemId: null,
      status,
      note: "",
    });
    currentCheckState.isInsideContainer = false;
    currentCheckState.parentItemId = null;
    currentCheckState.selectedItemId = nextUncheckedTopLevelItem(locker)?.id || null;
    saveLocalState();
    if (!currentCheckState.selectedItemId) goToView("locker-status");
    else render();
  }

  function chooseLocker(lockerId) {
    nextLockerToStartId = lockerId;
    render();
  }

  function openSelectedLocker() {
    const locker = findLockerById(nextLockerToStartId);
    if (!locker) return;
    currentCheckState = {
      lockerId: locker.id,
      selectedItemId: null,
      isInsideContainer: false,
      parentItemId: null,
      isRechecking: false,
    };
    selectNextTopLevelItem(locker);
    goToView("active");
  }

  function openRecheck(lockerId, itemId, parentId = null) {
    currentCheckState = {
      lockerId,
      selectedItemId: itemId,
      isInsideContainer: !!parentId,
      parentItemId: parentId || null,
      isRechecking: true,
    };
    saveLocalState();
    goToView("active");
  }

  function revokeNotePreview() {
    if (notePreviewUrl) URL.revokeObjectURL(notePreviewUrl);
    notePreviewUrl = "";
  }

  function openNoteModal() {
    const item = getCurrentItem();
    if (!item) return;
    const existing = getResult(item.id);
    noteSelectedFile = null;
    noteImageRef = existing?.noteImage || "";
    revokeNotePreview();
    noteModal = { itemId: item.id };
    renderNoteModal(item, existing?.note || "", noteImageRef);
  }

  function closeNoteModal() {
    noteModal = null;
    noteSelectedFile = null;
    noteImageRef = "";
    revokeNotePreview();
    const overlay = document.getElementById("check-note-modal");
    overlay?.remove();
  }

  function renderNoteModal(item, noteText, imageRef) {
    closeNoteModal();
    noteModal = { itemId: item.id };
    const overlay = el("div", "fs-sheet-backdrop");
    overlay.id = "check-note-modal";
    overlay.innerHTML = `
      <div class="fs-card fs-check-modal-card">
        <div class="fs-card-inner fs-stack">
          <div>
            <div class="fs-row-title">Add note</div>
            <div class="fs-row-meta">${escapeHtml(item.name || "Item")}</div>
          </div>
          <label class="fs-field">
            <span class="fs-label">Note</span>
            <textarea id="check-note-text" class="fs-textarea" rows="5">${escapeHtml(noteText || "")}</textarea>
          </label>
          <label class="fs-field">
            <span class="fs-label">Image</span>
            <input id="check-note-image" class="fs-input" type="file" accept="image/*">
          </label>
          <div id="check-note-image-preview-wrap" class="${imageRef ? "" : "hidden"}">
            <img id="check-note-image-preview" class="fs-check-note-preview-img" data-image-ref="${escapeHtml(imageRef || "")}" src="/design_assets/Flashover Logo.png" alt="Note attachment preview">
          </div>
          <div id="check-note-status" class="fs-row-meta">${imageRef ? "Image attached." : ""}</div>
          <div class="fs-actions">
            <button class="fs-btn fs-btn-secondary" type="button" data-action="close-note">Cancel</button>
            <button class="fs-btn fs-btn-secondary" type="button" data-action="clear-note-image">Clear image</button>
            <button class="fs-btn fs-btn-primary" type="button" data-action="save-note">Save note</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    hydrateImages(overlay);
    overlay.querySelector("#check-note-image")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type?.toLowerCase().startsWith("image/")) {
        event.target.value = "";
        overlay.querySelector("#check-note-status").textContent = "Please choose an image file.";
        return;
      }
      revokeNotePreview();
      noteSelectedFile = file;
      noteImageRef = "";
      notePreviewUrl = URL.createObjectURL(file);
      const preview = overlay.querySelector("#check-note-image-preview");
      const wrap = overlay.querySelector("#check-note-image-preview-wrap");
      if (preview) preview.src = notePreviewUrl;
      wrap?.classList.remove("hidden");
      overlay.querySelector("#check-note-status").textContent = "Image ready to attach.";
    });
  }

  async function uploadNoteImageIfNeeded() {
    if (!noteSelectedFile) return noteImageRef || "";
    const formData = new FormData();
    formData.append("image", noteSelectedFile, noteSelectedFile.name || "note-image.jpg");
    const token = await tokenPromise();
    const response = await fetch("/api/check-note-image", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-brigade-id": brigadeId,
      },
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Image upload failed (${response.status})`);
    return data.storagePath || data.filePath || "";
  }

  async function saveNote() {
    const modalEl = document.getElementById("check-note-modal");
    const saveBtn = modalEl?.querySelector("[data-action='save-note']");
    const status = modalEl?.querySelector("#check-note-status");
    try {
      if (saveBtn) saveBtn.disabled = true;
      if (status) status.textContent = noteSelectedFile ? "Uploading image..." : "Saving note...";
      const noteText = String(modalEl?.querySelector("#check-note-text")?.value || "");
      const imageRef = await uploadNoteImageIfNeeded();
      closeNoteModal();
      processCheck("note", noteText, imageRef);
    } catch (error) {
      console.error("Could not save note:", error);
      if (status) status.textContent = error.message || "Could not save note.";
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function showExitModal(target = null) {
    exitModalOpen = true;
    pendingNavigation = target;
    const overlay = el("div", "fs-sheet-backdrop");
    overlay.id = "check-exit-modal";
    overlay.innerHTML = `
      <div class="fs-card fs-check-modal-card">
        <div class="fs-card-inner fs-stack">
          <div>
            <div class="fs-row-title">Pause this check?</div>
            <div class="fs-row-meta">Saved progress will be kept so this check can be resumed later.</div>
          </div>
          <div class="fs-actions">
            <button class="fs-btn fs-btn-secondary" type="button" data-action="continue-check">Continue check</button>
            <button class="fs-btn fs-btn-secondary" type="button" data-action="cancel-check">Cancel check</button>
            <button class="fs-btn fs-btn-primary" type="button" data-action="confirm-pause">Pause and exit</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function closeExitModal() {
    exitModalOpen = false;
    pendingNavigation = null;
    document.getElementById("check-exit-modal")?.remove();
  }

  async function pauseAndExit({ cancel = false } = {}) {
    showLoading?.();
    try {
      const flushed = await flushAnswerSaves();
      if (!flushed && !confirm("Some answers could not be saved. Exit anyway?")) return;
      if (activeCheckSessionId) {
        const endpoint = cancel ? "cancel" : "pause";
        await apiJson(
          `/api/brigades/${encodeURIComponent(brigadeId)}/check-sessions/${encodeURIComponent(activeCheckSessionId)}/${endpoint}`,
          { method: "POST" },
        );
      }
      clearLocalState();
      clearStoredCheckSession();
      const target = pendingNavigation;
      cleanup();
      if (target) window.location.hash = target;
      else navigateToChecksHome?.();
    } catch (error) {
      console.error("Could not exit check:", error);
      alert(error.message || "Could not exit this check.");
    } finally {
      hideLoading?.();
    }
  }

  async function completeCheck() {
    const name = String(container.querySelector("#check-signoff-name")?.value || "").trim();
    const signature = signaturePad?.getData() || reportSignature;
    if (!name || !signature) return;
    showLoading?.();
    try {
      const flushed = await flushAnswerSaves();
      if (!flushed) {
        alert("Some answers failed to save. Please try again before signing off.");
        return;
      }
      await apiJson(
        `/api/brigades/${encodeURIComponent(brigadeId)}/check-sessions/${encodeURIComponent(activeCheckSessionId)}/complete`,
        { method: "POST", body: { signedName: name, signature } },
      );
      hasCompletedReport = true;
      clearLocalState();
      clearStoredCheckSession();
      cleanup();
      navigateToChecksHome?.();
    } catch (error) {
      console.error("Could not complete check:", error);
      alert(error.message || "Could not create the report.");
    } finally {
      hideLoading?.();
    }
  }

  function handleBack() {
    if (noteModal) {
      closeNoteModal();
      return true;
    }
    if (exitModalOpen) {
      closeExitModal();
      return true;
    }
    if (view === "signoff") {
      goToView("summary");
      return true;
    }
    if (view === "summary") {
      goToView("locker-status");
      return true;
    }
    if (view === "locker-status") {
      goToView("active");
      return true;
    }
    showExitModal();
    return true;
  }

  function routeGuard(target) {
    if (disposed || hasCompletedReport) return true;
    if (String(target || "").startsWith("#/check/")) return true;
    if (noteModal) {
      closeNoteModal();
      return false;
    }
    if (!exitModalOpen) showExitModal(target || "#/checks");
    return false;
  }

  function beforeUnload(event) {
    if (disposed || hasCompletedReport) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    signaturePad?.destroy?.();
    signaturePad = null;
    closeNoteModal();
    closeExitModal();
    window.removeEventListener("beforeunload", beforeUnload);
    if (modalClickHandler) document.removeEventListener("click", modalClickHandler);
    privateImageUrlCache.forEach((url) => URL.revokeObjectURL(url));
    privateImageUrlCache.clear();
    setRouteGuard?.(null);
    setBackHandler?.(null);
    setShellTabbarVisible?.(true);
  }

  container.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "select-item") selectItem(btn.dataset.itemId, btn.dataset.parentId || null);
    else if (action === "mark-present") processCheck("present");
    else if (action === "mark-missing") processCheck("missing");
    else if (action === "open-note") openNoteModal();
    else if (action === "check-container") startContainerCheck();
    else if (action === "show-status") goToView("locker-status");
    else if (action === "choose-locker") chooseLocker(btn.dataset.lockerId);
    else if (action === "return-active") goToView("active");
    else if (action === "go-locker") openSelectedLocker();
    else if (action === "show-summary") goToView("summary");
    else if (action === "show-signoff") goToView("signoff");
    else if (action === "back-summary") goToView("summary");
    else if (action === "recheck") openRecheck(btn.dataset.lockerId, btn.dataset.itemId, btn.dataset.parentId || null);
    else if (action === "pause-exit") showExitModal();
    else if (action === "clear-signature") {
      reportSignature = null;
      signaturePad?.clear();
    } else if (action === "complete-check") {
      await completeCheck();
    } else if (action === "checks-home") {
      cleanup();
      navigateToChecksHome?.();
    }
  });

  modalClickHandler = async function modalClick(event) {
    if (disposed) {
      document.removeEventListener("click", modalClickHandler);
      return;
    }
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "close-note") closeNoteModal();
    else if (action === "clear-note-image") {
      noteSelectedFile = null;
      noteImageRef = "";
      revokeNotePreview();
      const modalEl = document.getElementById("check-note-modal");
      modalEl?.querySelector("#check-note-image-preview-wrap")?.classList.add("hidden");
      const fileInput = modalEl?.querySelector("#check-note-image");
      if (fileInput) fileInput.value = "";
      const status = modalEl?.querySelector("#check-note-status");
      if (status) status.textContent = "";
    } else if (action === "save-note") {
      await saveNote();
    } else if (action === "continue-check") {
      closeExitModal();
    } else if (action === "confirm-pause") {
      await pauseAndExit();
    } else if (action === "cancel-check") {
      if (confirm("Cancel this check and discard the saved session?")) await pauseAndExit({ cancel: true });
    }
  };
  document.addEventListener("click", modalClickHandler);

  window.addEventListener("beforeunload", beforeUnload);
  setRouteGuard?.(routeGuard);
  setBackHandler?.(handleBack);
  window.__checksCleanup = cleanup;

  renderLoading();
  try {
    if (!currentUser) {
      await new Promise((resolve) => {
        const unsub = auth.onAuthStateChanged((user) => {
          currentUser = user;
          unsub();
          resolve();
        });
      });
    }
    if (!currentUser) throw new Error("Please sign in to run checks.");
    showLoading?.();
    await loadData();
    await startOrResumeSession();
    if (!currentCheckState.selectedItemId) {
      const locker = getCurrentLocker();
      selectNextTopLevelItem(locker);
    }
    render();
  } catch (error) {
    console.error("Could not start native check runner:", error);
    renderError(error.message || "Could not start this check.");
  } finally {
    hideLoading?.();
  }

  return cleanup;
}
