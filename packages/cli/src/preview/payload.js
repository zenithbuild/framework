/**
 * @param {string} html
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function injectSsrPayload(html, payload) {
  const serialized = serializeInlineScriptJson(payload);
  const scriptTag = `<script id="zenith-ssr-data">window.__zenith_ssr_data = ${serialized};</script>`;
  const existingTagRe = /<script\b[^>]*\bid=(["'])zenith-ssr-data\1[^>]*>[\s\S]*?<\/script>/i;
  if (existingTagRe.test(html)) {
    return html.replace(existingTagRe, scriptTag);
  }

  const headClose = html.match(/<\/head>/i);
  if (headClose) {
    return html.replace(/<\/head>/i, `${scriptTag}</head>`);
  }

  const bodyOpen = html.match(/<body\b[^>]*>/i);
  if (bodyOpen) {
    return html.replace(bodyOpen[0], `${bodyOpen[0]}${scriptTag}`);
  }

  return `${scriptTag}${html}`;
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
function serializeInlineScriptJson(payload) {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\//g, '\\u002F')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
