function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export async function renderChecks({ root }) {
  root.innerHTML = "";

  const container = el("div", "p-6 max-w-md mx-auto space-y-4");

  const btnStart = el(
    "button",
    "w-full bg-blue text-white text-xl font-bold py-5 px-6 rounded-lg drop-shadow flex items-center justify-center space-x-3"
  );
  btnStart.innerHTML = `<img src="/design_assets/Tick Icon.png" alt="Tick" class="h-7 w-7"><span>Start Full Check</span>`;
  btnStart.addEventListener("click", () => {
    window.location.href = "/select-appliance-for-check.html";
  });

  const btnSetup = el(
    "button",
    "w-full bg-blue text-white text-xl font-bold py-5 px-6 rounded-lg drop-shadow flex items-center justify-center space-x-3"
  );
  btnSetup.innerHTML = `<img src="/design_assets/Gear Icon.png" alt="Setup" class="h-7 w-7"><span>Set Up Appliances</span>`;
  btnSetup.addEventListener("click", () => {
    window.location.href = "/select-appliance.html";
  });

  const btnReports = el(
    "button",
    "w-full bg-blue text-white text-xl font-bold py-5 px-6 rounded-lg drop-shadow flex items-center justify-center space-x-3"
  );
  btnReports.innerHTML = `<img src="/design_assets/Report Icon.png" alt="Reports" class="h-7 w-7"><span>View Past Reports</span>`;
  btnReports.addEventListener("click", () => {
    window.location.href = "/reports.html";
  });

  container.appendChild(btnStart);
  container.appendChild(btnSetup);
  container.appendChild(btnReports);
  root.appendChild(container);
}

