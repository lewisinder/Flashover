export function createRouter({ routes, defaultRoute, onRouteStart, onRouteEnd, onNotFound }) {
  function normalize(hash) {
    const raw = (hash || "").replace(/^#/, "");
    if (!raw) return defaultRoute;
    if (!raw.startsWith("/")) return `/${raw}`;
    return raw;
  }

  async function handleRoute() {
    const route = normalize(window.location.hash);
    const handler = routes[route];

    if (!handler) {
      onNotFound?.(route);
      return;
    }

    try {
      onRouteStart?.(route);
      await handler();
    } finally {
      onRouteEnd?.(route);
    }
  }

  return {
    start() {
      window.addEventListener("hashchange", handleRoute);
      if (!window.location.hash) window.location.hash = `#${defaultRoute}`;
      void handleRoute();
    },
  };
}

