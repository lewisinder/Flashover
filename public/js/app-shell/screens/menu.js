function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

async function loadUserBrigades({ db, uid }) {
  const snapshot = await db.collection("users").doc(uid).collection("userBrigades").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function renderMenu({ root, auth, db, showLoading, hideLoading }) {
  root.innerHTML = "";

  const container = el("div", "p-6 max-w-md mx-auto space-y-6");

  const selectorWrap = el("div", "w-full");
  const label = el("label", "block text-lg font-medium text-gray-700 mb-2 text-center");
  label.textContent = "Active Brigade";
  label.setAttribute("for", "brigade-selector-shell");

  const select = el(
    "select",
    "w-full bg-white rounded-lg py-3 px-4 border border-gray-300 text-center appearance-none text-lg"
  );
  select.id = "brigade-selector-shell";
  select.innerHTML = '<option value="">Loading brigades...</option>';
  selectorWrap.appendChild(label);
  selectorWrap.appendChild(select);

  const btnChecks = el(
    "button",
    "w-full bg-blue text-white text-xl font-bold py-5 px-6 rounded-lg drop-shadow flex items-center justify-center space-x-3"
  );
  btnChecks.innerHTML = `<img src="/design_assets/Tick Icon.png" alt="Tick" class="h-7 w-7"><span>Appliance Inventory Checks</span>`;
  btnChecks.addEventListener("click", () => {
    window.location.hash = "#/checks";
  });

  const btnBrigades = el(
    "button",
    "w-full bg-blue text-white text-xl font-bold py-5 px-6 rounded-lg drop-shadow flex items-center justify-center space-x-3"
  );
  btnBrigades.innerHTML = `<img src="/design_assets/Users Icon.png" alt="Users" class="h-7 w-7"><span>Brigade Management</span>`;
  btnBrigades.addEventListener("click", () => {
    window.location.hash = "#/brigades";
  });

  container.appendChild(selectorWrap);
  container.appendChild(btnChecks);
  container.appendChild(btnBrigades);
  root.appendChild(container);

  const user = auth.currentUser;
  if (!user) return;

  showLoading?.();
  try {
    const brigades = await loadUserBrigades({ db, uid: user.uid });
    select.innerHTML = "";

    if (brigades.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No brigades found";
      select.appendChild(opt);
      localStorage.removeItem("activeBrigadeId");
      return;
    }

    brigades.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.brigadeName || b.id;
      select.appendChild(opt);
    });

    const stored = localStorage.getItem("activeBrigadeId");
    const storedExists = stored && brigades.some((b) => b.id === stored);
    const active = storedExists ? stored : brigades[0].id;
    localStorage.setItem("activeBrigadeId", active);
    select.value = active;

    select.addEventListener("change", (e) => {
      localStorage.setItem("activeBrigadeId", e.target.value);
    });
  } catch (err) {
    console.error("Failed to load brigades:", err);
    select.innerHTML = '<option value="">Error loading brigades</option>';
  } finally {
    hideLoading?.();
  }
}

