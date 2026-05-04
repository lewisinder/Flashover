let checksScriptPromise = null;

const CHECK_SCREEN_STYLES = `
#shell-check-wrapper {
  font-family: Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  touch-action: manipulation;
}
#shell-check-wrapper .screen { display: none; }
#shell-check-wrapper .screen.active { display: flex; }
#shell-check-wrapper .item-box {
  transition: all 0.2s ease-in-out;
  cursor: pointer;
  background-color: #E5E7EB;
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.25);
  position: relative;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 1 / 1;
  min-height: 5.75rem;
}
#shell-check-wrapper .item-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
#shell-check-wrapper .item-box:hover { background-color: #d1d5db; }
#shell-check-wrapper .item-box.is-active {
  border: 4px solid #180F5E;
  box-shadow: 0 4px 8px 3px rgba(0,0,0,0.25);
}
#shell-check-wrapper .item-box,
#shell-check-wrapper .control-btn,
#shell-check-wrapper .control--btn,
#shell-check-wrapper #go-to-next-locker-btn,
#shell-check-wrapper #back-to-summary-btn,
#shell-check-wrapper #go-to-selected-locker-btn,
#shell-check-wrapper #finish-checks-early-btn,
#shell-check-wrapper #edit-report-btn,
#shell-check-wrapper #save-report-btn,
#shell-check-wrapper #exit-summary-btn,
#shell-check-wrapper #signoff-back-btn,
#shell-check-wrapper #signoff-confirm-btn {
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
}
#shell-check-wrapper .control-btn,
#shell-check-wrapper .control--btn {
  border-radius: 1rem;
}
#shell-check-wrapper .control-btn:hover,
#shell-check-wrapper .control--btn:hover,
#shell-check-wrapper #go-to-next-locker-btn:hover,
#shell-check-wrapper #back-to-summary-btn:hover,
#shell-check-wrapper #go-to-selected-locker-btn:hover,
#shell-check-wrapper #finish-checks-early-btn:hover,
#shell-check-wrapper #edit-report-btn:hover,
#shell-check-wrapper #save-report-btn:hover,
#shell-check-wrapper #exit-summary-btn:hover,
#shell-check-wrapper #signoff-back-btn:hover,
#shell-check-wrapper #signoff-confirm-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.18);
  filter: saturate(1.03);
}
#shell-check-wrapper #next-locker-list-container > button,
#shell-check-wrapper #summary-list-container > div {
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}
#shell-check-wrapper #next-locker-list-container > button {
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
#shell-check-wrapper #next-locker-list-container > button:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 24px rgba(15, 23, 42, 0.12);
}
#shell-check-wrapper #summary-list-container > div {
  border-radius: 1rem;
}
#shell-check-wrapper .item-box.status-present,
#shell-check-wrapper .item-box .status-present {
  background-color: var(--green-action-1);
  color: white;
}
#shell-check-wrapper .item-box.status-missing,
#shell-check-wrapper .item-box .status-missing {
  background-color: var(--red-action-1);
  color: white;
}
#shell-check-wrapper .item-box.status-note,
#shell-check-wrapper .item-box .status-note {
  background-color: var(--orange-action-1);
  color: white;
}
#shell-check-wrapper .item-box.status-partial,
#shell-check-wrapper .item-box .status-partial {
  background-color: #a855f7;
  color: white;
}
#shell-check-wrapper .item-name-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(0,0,0,0.5);
  color: white;
  font-size: 0.75rem;
  padding: 0.25rem;
  text-align: center;
  word-break: break-word;
}
#shell-check-wrapper .shelf-container {
  background-color: #FFFFFF;
  border-radius: 0.75rem;
  padding: 0.75rem;
  box-shadow: inset 0 4px 8px 3px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 0 0 auto;
  width: 100%;
  min-height: 6rem;
}
#shell-check-wrapper .shelf-items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 0.75rem;
  align-items: stretch;
  width: 100%;
}
#shell-check-wrapper .container-items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 0.75rem;
  width: 100%;
  align-items: stretch;
}
#shell-check-wrapper .container-items-grid .item-box {
  min-height: 6rem;
}

/* Shell sizing rules */
#shell-check-wrapper .screen.active { flex-direction: column; }
#shell-check-wrapper #locker-check-screen { width: 100%; }
#shell-check-wrapper .max-w-4xl { width: 100%; }
#shell-check-wrapper,
#shell-check-wrapper .max-w-4xl,
#shell-check-wrapper #locker-check-screen { min-height: 0; }
#shell-check-wrapper #locker-check-screen > main { min-height: 0; }
`;

const CHECK_SCREEN_MARKUP = `
<div class="bg-background flex flex-col h-full">
  <header class="bg-blue drop-shadow p-4 flex items-center justify-between flex-shrink-0 z-20">
    <div class="flex items-center">
      <button id="back-btn" class="mr-3">
        <img src="/design_assets/Back Icon.png" alt="Back" class="h-8 w-8">
      </button>
    </div>
    <h1 id="header-title" class="text-white text-2xl font-bold flex-grow text-center">Locker Name</h1>
    <div class="w-20 flex justify-end">
      <button id="go-to-locker-status-btn">
        <img src="/design_assets/Truck Icon White.png" alt="Locker Status" class="h-10 w-10">
      </button>
    </div>
  </header>

  <div class="max-w-4xl w-full mx-auto flex-grow flex flex-col min-h-0">
    <div id="locker-check-screen" class="screen active flex-col h-full">
      <div class="flex-shrink-0 bg-background">
        <div class="p-4">
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div class="col-span-1 bg-white border-4 border-blue rounded-lg shadow-[0_4px_8px_3px_rgba(0,0,0,0.25)] p-2 flex flex-col aspect-square">
              <div class="flex-grow relative bg-gray-200 rounded">
                <img id="item-image" src="/design_assets/Flashover Logo.png" alt="Item Image" class="w-full h-full object-cover rounded absolute top-0 left-0">
              </div>
            </div>
            <div class="col-span-1 md:col-span-2 bg-blue rounded-lg shadow-[0_4px_8px_3px_rgba(0,0,0,0.25)] p-4 flex flex-col text-white">
              <h2 id="item-name" class="text-2xl font-bold mb-2">Item Name</h2>
              <p id="item-desc" class="text-base whitespace-pre-wrap flex-grow overflow-y-auto">Item description.</p>
            </div>
          </div>
        </div>
      </div>

      <main class="flex-grow p-4 min-h-0 overflow-y-auto">
        <div class="bg-blue rounded-lg p-4 flex flex-col gap-4 min-h-full">
          <div class="flex items-center justify-center mb-4 flex-shrink-0">
            <div class="text-center">
              <h2 id="locker-editor-name" class="text-white text-2xl font-bold uppercase tracking-wider">Locker Name</h2>
              <p id="locker-context-label" class="hidden text-sm font-semibold text-blue-100 mt-1">Inside container</p>
            </div>
          </div>
          <div id="locker-layout" class="flex flex-col gap-6 content-start"></div>
        </div>
      </main>

      <footer class="flex-shrink-0 bg-background border-t border-gray-200">
        <div class="p-4">
          <p id="check-save-status" class="hidden text-center text-xs font-semibold text-gray-500 mb-2" aria-live="polite"></p>
          <div id="controls" class="flex justify-around items-center">
            <button id="btn-missing" class="control-btn flex flex-col items-center justify-center p-2">
              <img src="/design_assets/No Icon.png" alt="Missing" class="h-16 w-16">
            </button>
            <button id="btn-note" class="control-btn flex flex-col items-center justify-center p-2">
              <img src="/design_assets/Note Icon.png" alt="Note" class="h-16 w-16">
            </button>
            <button id="btn-present" class="control--btn flex flex-col items-center justify-center p-2">
              <img src="/design_assets/Yes Icon.png" alt="Present" class="h-16 w-16">
            </button>
          </div>
          <div id="container-controls" class="hidden flex justify-around items-center gap-4">
            <button id="btn-container-missing" class="w-1/2 bg-red-action-1 text-white font-bold py-3 px-4 rounded-lg text-lg h-20 flex items-center justify-center">Container Missing</button>
            <button id="btn-check-contents" class="w-1/2 bg-orange-action-1 text-white font-bold py-3 px-4 rounded-lg text-lg h-20 flex items-center justify-center">Check Contents</button>
          </div>
          <button id="go-to-next-locker-btn" class="hidden w-full bg-green-action-1 text-white font-bold py-3 px-4 rounded-lg text-xl mt-2">Go to Next Locker</button>
          <button id="back-to-summary-btn" class="hidden w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-xl mt-2">Back to Summary</button>
        </div>
      </footer>
    </div>

    <div id="next-locker-choice-screen" class="screen p-6 flex-col h-full">
      <h1 class="text-3xl font-bold text-center mb-6">Locker Status</h1>
      <div id="next-locker-list-container" class="flex-grow grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto p-4 content-start"></div>
      <div class="pt-4 flex-shrink-0 space-y-3">
        <button id="go-to-selected-locker-btn" class="w-full bg-blue text-white font-bold py-3 px-4 rounded-lg">Go to Selected Locker</button>
        <button id="finish-checks-early-btn" class="w-full bg-green-action-1 text-white font-bold py-3 px-4 rounded-lg">Finish & View Summary</button>
      </div>
    </div>

    <div id="summary-screen" class="screen p-6 flex-col h-full">
      <h1 class="text-3xl font-bold text-center mb-4">Check Summary</h1>
      <div id="summary-list-container" class="flex-grow space-y-4 overflow-y-auto"></div>
      <div class="pt-4 flex-shrink-0 grid grid-cols-3 gap-4">
        <button id="edit-report-btn" class="w-full bg-orange-action-1 text-white font-bold py-3 px-4 rounded-lg">Edit</button>
        <button id="save-report-btn" class="w-full bg-green-action-1 text-white font-bold py-3 px-4 rounded-lg">Sign-off report</button>
        <button id="exit-summary-btn" class="w-full bg-red-action-2 text-white font-bold py-3 px-4 rounded-lg">Exit</button>
      </div>
    </div>

    <div id="signoff-screen" class="screen p-6 flex-col h-full">
      <h1 class="text-3xl font-bold text-center mb-4">Sign-off report</h1>
      <div class="flex-grow overflow-y-auto space-y-4">
        <div class="bg-white rounded-2xl p-4 shadow space-y-2">
          <h2 class="text-xl font-bold">Your account</h2>
          <p id="signoff-app-username" class="text-sm text-gray-600"></p>
        </div>

        <div class="bg-white rounded-2xl p-4 shadow space-y-3">
          <div>
            <h2 class="text-xl font-bold">Confirmation</h2>
            <p class="text-sm text-gray-600">I confirm the contents of this report is correct.</p>
          </div>
          <div>
            <label for="signoff-name" class="block text-sm font-semibold text-gray-700 mb-1">Name</label>
            <input id="signoff-name" type="text" maxlength="120" class="w-full bg-gray-100 rounded-lg p-3 border border-gray-300" placeholder="Type your name" autocomplete="name" />
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Initials</label>
            <div class="bg-gray-100 rounded-lg border border-gray-300 overflow-hidden">
              <canvas id="signoff-signature-canvas" class="w-full" style="height: 160px; touch-action: none;"></canvas>
            </div>
            <div class="flex items-center justify-between mt-2">
              <p class="text-xs text-gray-500">Use your finger (or mouse) to draw your initials.</p>
              <button id="signoff-clear-signature-btn" type="button" class="text-sm font-semibold text-blue hover:underline">Clear signature</button>
            </div>
          </div>
        </div>
      </div>
      <div class="pt-4 flex-shrink-0 grid grid-cols-2 gap-4">
        <button id="signoff-back-btn" class="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg">Back</button>
        <button id="signoff-confirm-btn" class="w-full bg-green-action-1 text-white font-bold py-3 px-4 rounded-lg opacity-60" disabled>Confirm</button>
      </div>
    </div>

    <div id="modals-container">
      <div id="note-modal" class="fixed inset-0 w-full h-full flex items-center justify-center hidden" style="background-color: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 50;">
        <div class="bg-white text-gray-900 rounded-2xl p-6 w-11/12 max-w-md shadow-2xl">
          <h3 id="note-modal-title" class="text-xl font-bold mb-4">Add Note</h3>
          <textarea id="note-input" class="w-full h-24 bg-gray-100 rounded-lg p-2 border border-gray-300" placeholder="Type note..."></textarea>
          <div class="mt-4">
            <label for="note-image-input" class="block text-sm font-semibold text-gray-700 mb-2">Attach image</label>
            <input id="note-image-input" type="file" accept="image/*" capture="environment" class="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue file:px-4 file:py-2 file:font-bold file:text-white" />
            <div id="note-image-preview-wrap" class="hidden mt-3">
              <img id="note-image-preview" alt="Attached note image preview" class="h-32 w-full rounded-lg object-cover border border-gray-300 bg-gray-100" />
              <button id="clear-note-image-btn" type="button" class="mt-2 text-sm font-semibold text-red-action-2 hover:underline">Remove image</button>
            </div>
            <p id="note-image-status" class="hidden mt-2 text-sm text-gray-600"></p>
          </div>
          <div class="flex justify-end mt-6">
            <button id="cancel-note-btn" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg mr-2">Cancel</button>
            <button id="btn-save-note" class="bg-blue text-white font-bold py-2 px-4 rounded-lg">Save Note</button>
          </div>
        </div>
      </div>

      <div id="exit-confirm-modal" class="fixed inset-0 w-full h-full flex items-center justify-center hidden" style="background-color: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 50;">
        <div class="bg-white text-gray-900 rounded-2xl p-6 w-11/12 max-w-sm shadow-2xl text-center">
          <h3 class="text-xl font-bold mb-4">Are you sure?</h3>
          <p id="exit-confirm-message" class="text-gray-600 mb-6">You will lose your current check progress.</p>
          <div class="flex flex-col space-y-3">
            <button id="confirm-exit-anyway-btn" class="w-full bg-red-action-2 text-white font-bold py-3 px-4 rounded-lg">Yes, I'm Sure</button>
            <button id="cancel-exit-btn" class="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 px-4 rounded-lg">Continue Check</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`;

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

export async function renderCheck({
  root,
  brigadeId,
  applianceId,
  setShellChromeVisible,
  navigateToChecksHome,
  navigateToMenu,
}) {
  setShellChromeVisible?.(false);

  root.innerHTML =
    '<div id="shell-check-wrapper" style="height:100%; min-height:0; display:flex; flex-direction:column; background:var(--background,#f3f4f6);"></div>';
  const wrapper = root.querySelector("#shell-check-wrapper");

  try {
    if (typeof window.__checksCleanup === "function") window.__checksCleanup();
  } catch (e) {}
  window.__checksCleanup = null;

  localStorage.setItem("activeBrigadeId", brigadeId);
  localStorage.setItem("selectedBrigadeId", brigadeId);
  localStorage.setItem("selectedApplianceId", applianceId);

  const styleEl = document.createElement("style");
  styleEl.textContent = CHECK_SCREEN_STYLES;
  wrapper.appendChild(styleEl);
  wrapper.insertAdjacentHTML("beforeend", CHECK_SCREEN_MARKUP);

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
