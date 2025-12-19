import { initFirebase } from "./firebase-init.js";
import { createRouter } from "./router.js";
import { renderMenu } from "./screens/menu.js";
import { renderChecks } from "./screens/checks.js";
import { renderBrigades } from "./screens/brigades.js";
import { renderBrigade } from "./screens/brigade.js";
import { renderCheck } from "./screens/check.js";

const appRoot = document.getElementById("app-root");
const titleEl = document.getElementById("app-title");
const backBtn = document.getElementById("app-back-btn");
const logoutBtn = document.getElementById("app-logout-btn");
const loadingOverlay = document.getElementById("loading-overlay");
const shellHeader = document.querySelector("body > header");
const shellFooter = document.querySelector("body > footer");

function showLoading() {
  if (loadingOverlay) loadingOverlay.style.display = "flex";
}

function hideLoading() {
  if (loadingOverlay) loadingOverlay.style.display = "none";
}

function setShellChromeVisible(visible) {
  shellHeader?.classList.toggle("hidden", !visible);
  shellFooter?.classList.toggle("hidden", !visible);
}

function setHeader({ title, showBack, showLogout }) {
  setShellChromeVisible(true);
  try {
    if (typeof window.__checksCleanup === "function") {
      window.__checksCleanup();
      window.__checksCleanup = null;
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
  window.history.back();
});

const routes = {
  "/menu": async () => {
    setHeader({ title: "Menu", showBack: false, showLogout: true });
    await renderMenu({ root: appRoot, auth, db, showLoading, hideLoading });
  },
  "/checks": async () => {
    setHeader({ title: "Appliance Checks", showBack: true, showLogout: true });
    await renderChecks({ root: appRoot, auth, db, showLoading, hideLoading });
  },
  "/brigades": async () => {
    setHeader({ title: "Brigades", showBack: true, showLogout: true });
    await renderBrigades({ root: appRoot, auth, db, showLoading, hideLoading });
  },
  "/brigade/:id": async ({ params }) => {
    setHeader({ title: "Brigade", showBack: true, showLogout: true });
    await renderBrigade({
      root: appRoot,
      auth,
      db,
      brigadeId: params.id,
      setTitle: (t) => setHeader({ title: t, showBack: true, showLogout: true }),
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
};

const router = createRouter({
  routes,
  defaultRoute: "/menu",
  onRouteStart: () => showLoading(),
  onRouteEnd: () => hideLoading(),
  onNotFound: () => {
    setHeader({ title: "Not found", showBack: true, showLogout: true });
    appRoot.innerHTML =
      '<div class="p-6 max-w-md mx-auto"><p class="text-center text-gray-700">Page not found.</p></div>';
  },
});

Promise.resolve(window.__authReady).finally(() => {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  let hasStarted = false;

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      if (!hasStarted) {
        hasStarted = true;
        await maybeSeedDemoData(user);
        router.start();
      }
      return;
    }

    // On local emulators, auth state can briefly appear as null during init.
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
