export function renderRouterDocumentSource() {
    return `function extractSsrData(parsed) {
  if (!parsed || typeof parsed.getElementById !== "function") return {};
  const ssrScript = parsed.getElementById("zenith-ssr-data");
  if (!ssrScript) return {};
  const source = typeof ssrScript.textContent === "string" ? ssrScript.textContent : "";
  const marker = "window.__zenith_ssr_data =";
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return {};
  const jsonText = source.slice(markerIndex + marker.length).trim().replace(/;$/, "");
  try {
    return JSON.parse(jsonText);
  } catch {
    return {};
  }
}

function parseDocumentPayload(html) {
  if (typeof DOMParser === "undefined") return null;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return {
    html,
    title: parsed.title || "",
    ssrData: extractSsrData(parsed)
  };
}

function isHtmlResponse(response) {
  const contentType = String(response.headers.get("content-type") || "");
  return /text\\/html|application\\/xhtml\\+xml/i.test(contentType);
}

function createDocumentDetail(payload, response) {
  return {
    title: payload && typeof payload.title === "string" ? payload.title : "",
    hasSsrData: !!(payload && payload.ssrData && typeof payload.ssrData === "object"),
    status: response && typeof response.status === "number" ? response.status : 200
  };
}

function createScrollDetail(targetUrl, scrollTarget) {
  return {
    mode: scrollTarget.mode,
    x: scrollTarget.x,
    y: scrollTarget.y,
    hash: targetUrl.hash || ""
  };
}`;
}
