let setupScriptPromise = null;
let imageCompressionPromise = null;

function loadImageCompression() {
  if (window.imageCompression) return Promise.resolve();
  if (imageCompressionPromise) return imageCompressionPromise;

  imageCompressionPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/browser-image-compression@latest/dist/browser-image-compression.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load image compression library"));
    document.head.appendChild(script);
  });

  return imageCompressionPromise;
}

function loadSetupScript() {
  if (window.initSetupPage) return Promise.resolve();
  if (setupScriptPromise) return setupScriptPromise;

  setupScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/js/setup.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load /js/setup.js"));
    document.head.appendChild(script);
  });

  return setupScriptPromise;
}

async function loadSetupTemplate() {
  const res = await fetch("/setup.html", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load setup template (${res.status})`);
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, "text/html");
  const styles = Array.from(doc.head.querySelectorAll("style"))
    .map((s) => s.textContent || "")
    .join("\n\n");
  doc.body.querySelectorAll("script").forEach((s) => s.remove());

  return { styles, bodyHtml: doc.body.innerHTML };
}

export async function renderSetupEditor({
  root,
  auth,
  brigadeId,
  applianceId,
  setShellChromeVisible,
  navigateToSetupHome,
  navigateToMenu,
}) {
  setShellChromeVisible?.(false);

  root.innerHTML =
    '<div id="shell-setup-wrapper" style="height:100%; min-height:0; display:flex; flex-direction:column; background:var(--background,#f3f4f6);"></div>';
  const wrapper = root.querySelector("#shell-setup-wrapper");

  try {
    if (typeof window.__setupCleanup === "function") window.__setupCleanup();
  } catch (e) {}
  window.__setupCleanup = null;

  localStorage.setItem("activeBrigadeId", brigadeId);
  localStorage.setItem("selectedBrigadeId", brigadeId);
  localStorage.setItem("selectedApplianceId", applianceId);

  const { styles, bodyHtml } = await loadSetupTemplate();
  const styleEl = document.createElement("style");
  styleEl.textContent = `
${styles || ""}

/* Shell safety overrides (so embedded setup always lays out correctly) */
#shell-setup-wrapper .screen.active { flex-direction: column; }
#shell-setup-wrapper, #shell-setup-wrapper .max-w-4xl { min-height: 0; }
`;
  wrapper.appendChild(styleEl);

  const inner = document.createElement("div");
  inner.className = "bg-background flex flex-col h-full";
  inner.style.minHeight = "0";
  inner.innerHTML = bodyHtml;
  wrapper.appendChild(inner);

  await loadImageCompression();
  await loadSetupScript();

  if (typeof window.initSetupPage !== "function") {
    throw new Error("setup.js did not expose initSetupPage()");
  }

  const user = auth?.currentUser;
  if (!user) {
    navigateToMenu?.();
    return;
  }

  window.__setupCleanup = window.initSetupPage({
    brigadeId,
    applianceId,
    isShell: true,
    navigateToSetupHome,
    navigateToMenu,
  });
}

