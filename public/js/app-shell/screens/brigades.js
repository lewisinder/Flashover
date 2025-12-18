function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export async function renderBrigades({ root }) {
  root.innerHTML = "";

  const container = el("div", "p-6 max-w-md mx-auto space-y-4");
  const card = el("div", "bg-white rounded-2xl shadow-lg p-6 space-y-3");

  const title = el("h2", "text-xl font-bold text-gray-900");
  title.textContent = "Brigade Management";

  const desc = el("p", "text-gray-600");
  desc.textContent =
    "This screen is in progress in the new app shell. For now, use the existing brigade management page.";

  const link = el("a", "inline-block bg-blue text-white font-bold py-3 px-4 rounded-lg text-center w-full");
  link.href = "/manage-brigades.html";
  link.textContent = "Open Brigade Management";

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(link);
  container.appendChild(card);
  root.appendChild(container);
}

