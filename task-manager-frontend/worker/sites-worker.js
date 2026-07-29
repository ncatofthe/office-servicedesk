import { handleDemoApi } from "./demo-api.js";

const API_ENV_KEYS = ["API_ORIGIN", "BACKEND_ORIGIN"];
const INDEX_HTML = "__SITES_INDEX_HTML__";
const APP_JS = "__SITES_APP_JS__";
const APP_CSS = "__SITES_APP_CSS__";

function withHeaders(response, headers) {
  const nextHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) {
    nextHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  });
}

function findApiOrigin(env) {
  for (const key of API_ENV_KEYS) {
    if (typeof env?.[key] === "string" && env[key].trim()) {
      return env[key].trim().replace(/\/+$/, "");
    }
  }

  return "";
}

async function proxyApi(request, env) {
  const apiOrigin = findApiOrigin(env);
  if (!apiOrigin) {
    return handleDemoApi(request);
  }

  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(sourceUrl.pathname + sourceUrl.search, apiOrigin);
  const proxyRequest = new Request(targetUrl, request);
  return fetch(proxyRequest);
}

function isSpaRoute(pathname) {
  return pathname === "/" || !/\.[^/]+$/.test(pathname);
}

function renderIndex() {
  return new Response(INDEX_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function fetchAsset(request, env) {
  const url = new URL(request.url);
  if (isSpaRoute(url.pathname)) {
    return renderIndex();
  }

  if (url.pathname.startsWith("/assets/") && url.pathname.endsWith(".js")) {
    return new Response(APP_JS, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (url.pathname.startsWith("/assets/") && url.pathname.endsWith(".css")) {
    return new Response(APP_CSS, {
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const response = await env.ASSETS.fetch(request);
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") || url.pathname === "/api" || url.pathname.startsWith("/uploads/")) {
      return proxyApi(request, env);
    }

    const response = await fetchAsset(request, env);
    return withHeaders(response, {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
  },
};
