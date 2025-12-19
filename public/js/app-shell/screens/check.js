let checksScriptPromise = null;

function loadChecksScript() {
  if (window.initChecksPage) return Promise.resolve();
  if (checksScriptPromise) return checksScriptPromise;

  checksScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/js/checks.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load /js/checks.js"));
    document.head.appendChild(script);
  });

  return checksScriptPromise;
}

async function loadChecksTemplate() {
  const res = await fetch("/checks.html", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load checks template (${res.status})`);
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, "text/html");

  const styles = Array.from(doc.head.querySelectorAll("style"))
    .map((s) => s.textContent || "")
    .join("\n\n");

  doc.body.querySelectorAll("script").forEach((s) => s.remove());

  return { styles, bodyHtml: doc.body.innerHTML };
}

export async function renderCheck({
  root,
  brigadeId,
  applianceId,
  setShellChromeVisible,
  navigateToChecksHome,
  navigateToMenu,
}) {
  setShellChromeVisible?.(false);
  // Use explicit sizing rules (not Tailwind) to avoid layout issues when embedding the legacy checks UI.
  root.innerHTML =
    '<div id="shell-check-wrapper" style="height:100%; min-height:0; display:flex; flex-direction:column; background:var(--background,#f3f4f6);"></div>';
  const wrapper = root.querySelector("#shell-check-wrapper");

  // Clean up any previous run (navigating away and back).
  try {
    if (typeof window.__checksCleanup === "function") window.__checksCleanup();
  } catch (e) {}
  window.__checksCleanup = null;

  localStorage.setItem("activeBrigadeId", brigadeId);
  localStorage.setItem("selectedBrigadeId", brigadeId);
  localStorage.setItem("selectedApplianceId", applianceId);

  const { styles, bodyHtml } = await loadChecksTemplate();
  const styleEl = document.createElement("style");
  styleEl.textContent = `
${styles || ""}

/* Shell safety overrides (so embedded checks always lays out correctly) */
#shell-check-wrapper .screen.active { flex-direction: column; }
#shell-check-wrapper #locker-check-screen { width: 100%; }
#shell-check-wrapper .max-w-4xl { width: 100%; }
#shell-check-wrapper, #shell-check-wrapper .max-w-4xl, #shell-check-wrapper #locker-check-screen { min-height: 0; }
#shell-check-wrapper #locker-check-screen > main { min-height: 0; }
`;
  wrapper.appendChild(styleEl);
  wrapper.insertAdjacentHTML("beforeend", bodyHtml);

  await loadChecksScript();
  if (typeof window.initChecksPage !== "function") {
    throw new Error("checks.js did not expose initChecksPage()");
  }

  window.__checksCleanup = window.initChecksPage({
    isShell: true,
    navigateToChecksHome,
    navigateToMenu,
  });
}
