export function createRouter({ routes, defaultRoute, onRouteStart, onRouteEnd, onNotFound }) {
  const routeEntries = Object.entries(routes).map(([pattern, handler]) => {
    const keys = [];
    const segments = pattern.split("/").filter(Boolean);
    const regexParts = segments.map((seg) => {
      if (seg.startsWith(":")) {
        keys.push(seg.slice(1));
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
    const regex = new RegExp(`^/${regexParts.join("/")}$`);
    return { pattern, regex, keys, handler };
  });

  function normalize(hash) {
    const rawHash = (hash || "").replace(/^#/, "");
    const [rawPath, rawQuery] = rawHash.split("?");
    const path = rawPath || "";
    const query = rawQuery || "";

    if (!path) return { route: defaultRoute, query: "" };
    if (!path.startsWith("/")) return { route: `/${path}`, query };
    return { route: path, query };
  }

  async function handleRoute() {
    const { route, query } = normalize(window.location.hash);
    let handler = routes[route];
    let params = {};

    if (!handler) {
      for (const entry of routeEntries) {
        const match = route.match(entry.regex);
        if (!match) continue;
        handler = entry.handler;
        params = entry.keys.reduce((acc, key, idx) => {
          acc[key] = decodeURIComponent(match[idx + 1]);
          return acc;
        }, {});
        break;
      }
    }

    if (!handler) {
      onNotFound?.(route);
      return;
    }

    try {
      onRouteStart?.(route);
      await handler({ route, params, query: new URLSearchParams(query) });
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
