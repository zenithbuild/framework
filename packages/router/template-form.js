export function renderRouterFormSource() {
    return `function normalizeFormMethod(method) {
  const value = typeof method === "string" ? method.trim().toUpperCase() : "";
  return value || "GET";
}

function readSubmitOverride(submitter, attributeName, propertyName) {
  if (!submitter) return "";
  if (typeof submitter.getAttribute === "function") {
    const attrValue = submitter.getAttribute(attributeName);
    if (typeof attrValue === "string" && attrValue.length > 0) {
      return attrValue;
    }
  }
  const propertyValue = submitter[propertyName];
  return typeof propertyValue === "string" ? propertyValue : "";
}

function resolveFormTargetUrl(form, submitter) {
  const action =
    readSubmitOverride(submitter, "formaction", "formAction") ||
    form.getAttribute("action") ||
    form.action ||
    window.location.href;
  return new URL(action, window.location.href);
}

function resolveFormTargetValue(form, submitter) {
  const target = readSubmitOverride(submitter, "formtarget", "formTarget") || form.target || "";
  return String(target || "").trim();
}

function resolveFormMethod(form, submitter) {
  return normalizeFormMethod(
    readSubmitOverride(submitter, "formmethod", "formMethod") || form.getAttribute("method") || form.method || "GET"
  );
}

function resolveFormEnctype(form, submitter) {
  return String(
    readSubmitOverride(submitter, "formenctype", "formEnctype") ||
    form.getAttribute("enctype") ||
    form.enctype ||
    "application/x-www-form-urlencoded"
  ).toLowerCase();
}

function createFormSubmissionPayload(form, submitter) {
  try {
    return submitter ? new FormData(form, submitter) : new FormData(form);
  } catch {
    const formData = new FormData(form);
    if (submitter && submitter.name) {
      formData.append(submitter.name, submitter.value || "");
    }
    return formData;
  }
}

function shouldEnhanceForm(form, submitter) {
  if (!form || typeof form.getAttribute !== "function") return false;
  if (!form.hasAttribute("data-zen-form")) return false;
  const target = resolveFormTargetValue(form, submitter);
  if (target && target !== "_self") return false;
  if (resolveFormMethod(form, submitter) !== "POST") return false;
  if (resolveFormEnctype(form, submitter).includes("multipart/form-data")) return false;

  const targetUrl = resolveFormTargetUrl(form, submitter);
  if (targetUrl.origin !== window.location.origin) return false;
  const resolved = resolveRoute(targetUrl.pathname);
  return !!resolved && requiresServerReload(resolved.route);
}

async function performEnhancedFormSubmission(form, submitter) {
  const targetUrl = resolveFormTargetUrl(form, submitter);
  const resolved = resolveRoute(targetUrl.pathname);
  if (!resolved) {
    navigateViaBrowser(targetUrl, false);
    return true;
  }

  const context = beginNavigation(targetUrl, resolved, "push");
  let historyCommitted = false;
  let documentDetail = null;
  try {
    dispatchRouteEvent("navigation:request", buildNavigationPayload(context));
    context.stage = "fetch";
    const response = await fetch(targetUrl.href, {
      method: "POST",
      body: createFormSubmissionPayload(form, submitter),
      credentials: "include",
      headers: { Accept: "text/html,application/xhtml+xml" },
      redirect: "manual",
      signal: context.signal
    });
    if (!ensureCurrentNavigation(context)) return false;

    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      const redirectUrl = resolveRedirectUrl(response.headers.get("location"), targetUrl);
      dispatchNavigationFallback(context, {
        reason: "server-redirect",
        location: redirectUrl.href,
        status: response.status
      });
      navigateViaBrowser(redirectUrl, false);
      return true;
    }

    if (!isHtmlResponse(response) || (response.status !== 200 && response.status !== 400 && response.status !== 422)) {
      dispatchNavigationFallback(context, {
        reason: "http-status",
        status: response.status
      });
      navigateViaBrowser(targetUrl, false);
      return true;
    }

    const html = await response.text();
    if (!ensureCurrentNavigation(context)) return false;
    const payload = parseDocumentPayload(html);
    if (!payload) {
      dispatchNavigationFallback(context, {
        reason: "document-parse"
      });
      navigateViaBrowser(targetUrl, false);
      return true;
    }

    const committed = await commitNavigationDocument(
      context,
      resolved,
      targetUrl,
      "push",
      null,
      payload,
      response
    );
    documentDetail = committed.documentDetail;
    historyCommitted = committed.historyCommitted;
    if (!committed.committed) return false;
    return true;
  } catch (error) {
    if (!isAbortError(error)) {
      emitNavigationError(context, {
        reason: "runtime-failure",
        error,
        historyCommitted,
        document: documentDetail
      });
      console.error("[Zenith Router] form submission failed", error);
      dispatchNavigationFallback(context, {
        reason: "runtime-failure",
        historyCommitted
      });
      navigateViaBrowser(targetUrl, false);
      return true;
    }
    dispatchNavigationFallback(context, context.abortReason || {
      reason: "superseded",
      abortedStage: context.stage
    });
    return false;
  } finally {
    completeNavigation(context);
  }
}

function installEnhancedFormHandling() {
  document.addEventListener("submit", function(event) {
    if (event.defaultPrevented) return;
    const form = event.target;
    const submitter = event.submitter || null;
    if (!shouldEnhanceForm(form, submitter)) return;

    event.preventDefault();
    performEnhancedFormSubmission(form, submitter).catch(function(error) {
      if (!isAbortError(error)) {
        console.error("[Zenith Router] enhanced form submission failed", error);
        navigateViaBrowser(resolveFormTargetUrl(form, submitter), false);
      }
    });
  });
}`;
}
