import { initFirebase } from "./firebase-init.js";
import { createRouter } from "./router.js";
import { renderMenu } from "./screens/menu.js";
import { renderChecks } from "./screens/checks.js";
import { renderBrigades } from "./screens/brigades.js";
import { renderBrigade } from "./screens/brigade.js";
import { renderCheck } from "./screens/check.js";
import { renderReports } from "./screens/reports.js";
import { renderReport } from "./screens/report.js";
import { renderAccount } from "./screens/account.js";
import { renderSetupHome } from "./screens/setup-home.js";
import { renderSetupEditor } from "./screens/setup-editor.js";

const appRoot = document.getElementById("app-root");
const titleEl = document.getElementById("app-title");
const backBtn = document.getElementById("app-back-btn");
const logoutBtn = document.getElementById("app-logout-btn");
const tabbar = document.getElementById("app-tabbar");
const loadingOverlay = document.getElementById("loading-overlay");
const shellHeader = document.querySelector("body > header");

const TERMS_VERSION = "v1.0";
const TERMS_BLURB =
  "I acknowledge I am a testing member and agree to the Terms of Use, including that I will not disclose, copy, share, or distribute any part of the Flashover app, its content, features, or materials to any third party.";

let loadingCount = 0;
let loadingTimer = null;

function showLoading() {
  loadingCount += 1;
  if (!loadingOverlay) return;
  if (loadingTimer) return;
  // Avoid flicker for fast operations (app-like feel).
  loadingTimer = setTimeout(() => {
    if (loadingCount > 0) loadingOverlay.style.display = "flex";
    loadingTimer = null;
  }, 200);
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (!loadingOverlay) return;
  if (loadingCount > 0) return;
  if (loadingTimer) {
    clearTimeout(loadingTimer);
    loadingTimer = null;
  }
  loadingOverlay.style.display = "none";
}

function setShellChromeVisible(visible) {
  shellHeader?.classList.toggle("hidden", !visible);
  tabbar?.classList.toggle("hidden", !visible);
}

function setHeader({ title, showBack, showLogout }) {
  setShellChromeVisible(true);
  try {
    if (typeof window.__checksCleanup === "function") {
      window.__checksCleanup();
      window.__checksCleanup = null;
    }
  } catch (e) {}
  try {
    if (typeof window.__setupCleanup === "function") {
      window.__setupCleanup();
      window.__setupCleanup = null;
    }
  } catch (e) {}
  if (titleEl) titleEl.textContent = title || "Flashover";
  if (backBtn) backBtn.classList.toggle("hidden", !showBack);
  if (logoutBtn) logoutBtn.classList.toggle("hidden", !showLogout);
}

function requireEl(el, name) {
  if (!el) throw new Error(`Missing required element: ${name}`);
  return el;
}

requireEl(appRoot, "app-root");
requireEl(titleEl, "app-title");
requireEl(backBtn, "app-back-btn");
requireEl(logoutBtn, "app-logout-btn");

const { auth, db } = initFirebase();

async function fetchUserProfile(user) {
  const token = await user.getIdToken();
  const cacheBust = `?t=${Date.now()}`;
  const res = await fetch(`/api/data/${user.uid}${cacheBust}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.message || `Failed to load profile (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}

async function saveUserProfile(user, data) {
  const token = await user.getIdToken();
  const res = await fetch(`/api/data/${user.uid}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.message || `Failed to save profile (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}

function hasAcceptedTerms(data) {
  return data?.termsAcceptance?.version === TERMS_VERSION;
}

function renderTermsGate({ user, userData, loadError, onAccepted }) {
  setShellChromeVisible(false);

  appRoot.innerHTML = `
    <section class="fs-terms">
      <div class="fs-card fs-terms-card">
        <div class="fs-card-inner space-y-5">
          <div>
            <p class="fs-terms-kicker">Terms of Use</p>
            <h2 class="fs-terms-title">Review and accept</h2>
            <p class="fs-terms-meta">Version ${TERMS_VERSION}</p>
          </div>
          <div class="fs-terms-body">
            <iframe class="fs-terms-frame" title="Flashover Terms of Use" src="/terms-of-service.html"></iframe>
          </div>
          <label class="fs-terms-ack">
            <input id="terms-ack-checkbox" type="checkbox" />
            <span>${TERMS_BLURB}</span>
          </label>
          <div id="terms-error" class="fs-terms-error hidden"></div>
          <div class="fs-terms-actions">
            <button id="terms-signout-btn" class="fs-btn fs-btn-secondary" type="button">Sign out</button>
            <button id="terms-accept-btn" class="fs-btn fs-btn-primary" type="button" disabled>
              Agree and continue
            </button>
          </div>
          <p class="fs-terms-meta">
            Need a larger view? <a class="fs-terms-link" href="/terms-of-service.html" target="_blank" rel="noopener">Open full terms</a>
          </p>
        </div>
      </div>
    </section>
  `;

  const checkbox = appRoot.querySelector("#terms-ack-checkbox");
  const acceptBtn = appRoot.querySelector("#terms-accept-btn");
  const signoutBtn = appRoot.querySelector("#terms-signout-btn");
  const errorEl = appRoot.querySelector("#terms-error");

  let saving = false;

  function setError(message) {
    if (!errorEl) return;
    if (message) {
      errorEl.textContent = message;
      errorEl.classList.remove("hidden");
      return;
    }
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }

  function updateButtonState() {
    if (!acceptBtn || !checkbox) return;
    acceptBtn.disabled = saving || !checkbox.checked;
  }

  if (loadError) {
    setError("Unable to load your profile. Please check your connection and try again.");
  }

  checkbox?.addEventListener("change", updateButtonState);
  signoutBtn?.addEventListener("click", async () => {
    try {
      await auth.signOut();
    } finally {
      window.location.href = "/signin.html";
    }
  });
  acceptBtn?.addEventListener("click", async () => {
    if (!checkbox?.checked || saving) return;
    saving = true;
    acceptBtn.textContent = "Saving...";
    updateButtonState();
    setError("");

    try {
      const latestData = userData || (await fetchUserProfile(user)) || {};
      const { serverTime, ...safeData } = latestData;
      const updated = {
        ...safeData,
        termsAcceptance: {
          version: TERMS_VERSION,
          acceptedAt: new Date().toISOString(),
          blurb: TERMS_BLURB,
        },
      };
      await saveUserProfile(user, updated);
      onAccepted();
    } catch (err) {
      setError(err?.message || "Unable to save your acceptance. Please try again.");
    } finally {
      saving = false;
      acceptBtn.textContent = "Agree and continue";
      updateButtonState();
    }
  });
}

async function ensureTermsAccepted(user) {
  let userData = null;
  let loadError = null;
  try {
    showLoading();
    userData = await fetchUserProfile(user);
  } catch (err) {
    loadError = err;
  } finally {
    hideLoading();
  }

  if (hasAcceptedTerms(userData)) return true;

  return new Promise((resolve) => {
    renderTermsGate({
      user,
      userData,
      loadError,
      onAccepted: () => resolve(true),
    });
  });
}

function getActiveTabRoute(route) {
  if (route.startsWith("/brigade/") || route === "/brigades") return "#/brigades";
  if (route.startsWith("/report/") || route === "/reports") return "#/reports";
  if (route.startsWith("/check/") || route === "/checks") return "#/checks";
  if (route === "/setup" || route.startsWith("/setup/")) return "#/checks";
  if (route === "/account") return "#/account";
  return "#/menu";
}

function setTabbarActive(route) {
  if (!tabbar) return;
  const active = getActiveTabRoute(route);
  tabbar.querySelectorAll("[data-route]").forEach((btn) => {
    const target = btn.getAttribute("data-route");
    if (target === active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

tabbar?.addEventListener("click", (e) => {
  const btn = e.target?.closest?.("[data-route]");
  const target = btn?.getAttribute?.("data-route");
  if (!target) return;
  if (window.location.hash === target) return;
  window.location.hash = target;
});

async function maybeSeedDemoData(user) {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  if (!isLocal) return;

  const seededKey = `demoSeeded:${user.uid}`;
  if (localStorage.getItem(seededKey) === "1") return;

  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/dev/seed-demo", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Seed failed (${res.status})`);
    }
    const seeded = await res.json().catch(() => ({}));
    localStorage.setItem(seededKey, "1");

    const currentActive = localStorage.getItem("activeBrigadeId");
    if (!currentActive && seeded?.brigadeId) {
      localStorage.setItem("activeBrigadeId", seeded.brigadeId);
    }
  } catch (err) {
    console.warn("Demo seed failed (app shell):", err);
  }
}

logoutBtn.addEventListener("click", async () => {
  try {
    await auth.signOut();
  } finally {
    window.location.href = "/signin.html";
  }
});

backBtn.addEventListener("click", () => {
  const hash = window.location.hash || "";

  // Prefer "app-like" back behavior over browser history for core routes.
  if (hash.startsWith("#/check/")) {
    window.location.hash = "#/checks";
    return;
  }
  if (hash.startsWith("#/brigade/")) {
    window.location.hash = "#/brigades";
    return;
  }
  if (hash.startsWith("#/report/")) {
    window.location.hash = "#/reports";
    return;
  }
  if (hash === "#/setup") {
    window.location.hash = "#/checks";
    return;
  }
  if (hash === "#/checks" || hash === "#/brigades") {
    window.location.hash = "#/menu";
    return;
  }
  if (hash === "#/reports") {
    window.location.hash = "#/checks";
    return;
  }

  window.history.back();
});

const routes = {
  "/menu": async () => {
    setHeader({ title: "Home", showBack: false, showLogout: false });
    await renderMenu({ root: appRoot, auth, db, showLoading, hideLoading });
  },
  "/checks": async () => {
    setHeader({ title: "Checks", showBack: false, showLogout: false });
    await renderChecks({ root: appRoot, auth, db, showLoading, hideLoading });
  },
  "/reports": async () => {
    setHeader({ title: "Reports", showBack: false, showLogout: false });
    await renderReports({ root: appRoot, auth, db, showLoading, hideLoading });
  },
  "/setup": async () => {
    setHeader({ title: "Appliance setup", showBack: true, showLogout: false });
    await renderSetupHome({ root: appRoot, auth, db, showLoading, hideLoading });
  },
  "/brigades": async () => {
    setHeader({ title: "Brigades", showBack: false, showLogout: false });
    await renderBrigades({ root: appRoot, auth, db, showLoading, hideLoading });
  },
  "/account": async () => {
    setHeader({ title: "Account", showBack: false, showLogout: false });
    await renderAccount({ root: appRoot, auth, db, showLoading, hideLoading });
  },
  "/brigade/:id": async ({ params }) => {
    setHeader({ title: "Brigade", showBack: true, showLogout: false });
    await renderBrigade({
      root: appRoot,
      auth,
      db,
      brigadeId: params.id,
      setTitle: (t) => setHeader({ title: t, showBack: true, showLogout: false }),
      showLoading,
      hideLoading,
    });
  },
  "/report/:brigadeId/:reportId": async ({ params }) => {
    setHeader({ title: "Report", showBack: true, showLogout: false });
    await renderReport({
      root: appRoot,
      auth,
      brigadeId: params.brigadeId,
      reportId: params.reportId,
      setTitle: (t) => setHeader({ title: t, showBack: true, showLogout: false }),
      showLoading,
      hideLoading,
    });
  },
  "/check/:brigadeId/:applianceId": async ({ params }) => {
    // Use the full legacy check UI for now, inside the shell.
    // Hide the shell header/footer to avoid duplicate headers.
    setShellChromeVisible(false);
    await renderCheck({
      root: appRoot,
      brigadeId: params.brigadeId,
      applianceId: params.applianceId,
      setShellChromeVisible,
      navigateToChecksHome: () => {
        setShellChromeVisible(true);
        window.location.hash = "#/checks";
      },
      navigateToMenu: () => {
        setShellChromeVisible(true);
        window.location.hash = "#/menu";
      },
    });
  },
  "/setup/:applianceId": async ({ params }) => {
    // Use the legacy setup UI for now, inside the shell.
    setShellChromeVisible(false);
    const brigadeId = localStorage.getItem("activeBrigadeId");
    await renderSetupEditor({
      root: appRoot,
      auth,
      brigadeId,
      applianceId: params.applianceId,
      setShellChromeVisible,
      navigateToSetupHome: () => {
        setShellChromeVisible(true);
        window.location.hash = "#/setup";
      },
      navigateToMenu: () => {
        setShellChromeVisible(true);
        window.location.hash = "#/menu";
      },
    });
  },
};

const router = createRouter({
  routes,
  defaultRoute: "/menu",
  onRouteStart: (route) => {
    setTabbarActive(route);
  },
  onRouteEnd: () => hideLoading(),
  onNotFound: () => {
    setHeader({ title: "Not found", showBack: true, showLogout: false });
    appRoot.innerHTML =
      '<div class="p-6 max-w-md mx-auto"><p class="text-center text-gray-700">Page not found.</p></div>';
  },
});

Promise.resolve(window.__authReady).finally(() => {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  let hasStarted = false;
  let startInProgress = false;

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      if (hasStarted || startInProgress) return;
      startInProgress = true;
      await maybeSeedDemoData(user);
      const canStart = await ensureTermsAccepted(user);
      if (canStart) {
        router.start();
        hasStarted = true;
      }
      startInProgress = false;
      return;
    }

    // On local emulators, auth state can briefly appear as null during init.
    hasStarted = false;
    startInProgress = false;
    setTimeout(() => {
      if (auth.currentUser) {
        if (!hasStarted) {
          hasStarted = true;
          void maybeSeedDemoData(auth.currentUser);
          router.start();
        }
        return;
      }
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.href = `/signin.html?returnTo=${encodeURIComponent(returnTo)}`;
    }, isLocal ? 1500 : 0);
  });
});
