/**
 * Scrollbar compensation utilities for transition overlays.
 *
 * When `overflow: hidden` is applied to the body during intro or route
 * transitions, the vertical scrollbar disappears and the viewport widens,
 * which shifts fixed-position elements (notably the navigation bar).
 *
 * These helpers measure the scrollbar width and set a CSS custom property
 * so that `padding-right` can compensate, keeping the layout stable.
 */

export function measureScrollbarWidth(win: Window): number {
  return Math.max(0, win.innerWidth - win.document.documentElement.clientWidth);
}

/**
 * Sets the `--zenith-scrollbar-width` variable on the document element
 * so CSS rules can apply `padding-right` compensation.
 */
export function applyScrollbarWidth(win: Window): void {
  const width = measureScrollbarWidth(win);
  win.document.documentElement.style.setProperty(
    "--zenith-scrollbar-width",
    `${width}px`,
  );
}

/**
 * Removes the scrollbar compensation variable.
 */
export function clearScrollbarWidth(win: Window): void {
  win.document.documentElement.style.setProperty(
    "--zenith-scrollbar-width",
    "0px",
  );
}

/**
 * Activates the transition-active state: applies scrollbar compensation
 * and sets the `data-zenith-transition-active` attribute on `<html>`.
 */
export function lockTransitionScroll(win: Window): void {
  applyScrollbarWidth(win);
  win.document.documentElement.setAttribute("data-zenith-transition-active", "");
}

/**
 * Deactivates the transition-active state: removes the attribute and
 * clears the scrollbar compensation variable.
 */
export function unlockTransitionScroll(win: Window): void {
  win.document.documentElement.removeAttribute("data-zenith-transition-active");
  clearScrollbarWidth(win);
}
