import { initFirebase } from "./firebase-init.js";
import { createRouter } from "./router.js";
import { renderMenu } from "./screens/menu.js";
import { renderChecks } from "./screens/checks.js";
import { renderBrigades } from "./screens/brigades.js";
import { renderBrigade } from "./screens/brigade.js";

const appRoot = document.getElementById("app-root");
const titleEl = document.getElementById("app-title");
const backBtn = document.getElementById("app-back-btn");
const logoutBtn = document.getElementById("app-logout-btn");
const loadingOverlay = document.getElementById("loading-overlay");

function showLoading() {
  if (loadingOverlay) loadingOverlay.style.display = "flex";
}

function hideLoading() {
  if (loadingOverlay) loadingOverlay.style.display = "none";
}

function setHeader({ title, showBack, showLogout }) {
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

  auth.onAuthStateChanged((user) => {
    if (user) {
      if (!hasStarted) {
        hasStarted = true;
        router.start();
      }
      return;
    }

    // On local emulators, auth state can briefly appear as null during init.
    setTimeout(() => {
      if (auth.currentUser) {
        if (!hasStarted) {
          hasStarted = true;
          router.start();
        }
        return;
      }
      window.location.href = "/signin.html";
    }, isLocal ? 1500 : 0);
  });
});
