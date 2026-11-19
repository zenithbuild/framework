// Static layout for the hero mapping connectors (Figma layers `Map · signal`, `Map · event`, `Map · expr`).
// This only places the real SVG strokes; it never animates them. Reads happen on setup, font load and
// resize only (never inside a tween), per the Round 4 motion spec. GSAP owns the stroke-dashoffset draw.

export interface HeroConnectorNodes {
  body: HTMLElement;
  source: HTMLElement;
  well: HTMLElement;
  pins: Array<HTMLElement | null | undefined>;
  heads: Array<HTMLElement | null | undefined>;
  paths: Array<SVGPathElement | null | undefined>;
  dots: Array<SVGCircleElement | null | undefined>;
  errorPath?: SVGPathElement | null;
  errorMark?: SVGTextElement | null;
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Figma geometry: H to gutter+6, one cubic across the gutter to gutter+54, then H into the output column. */
export function connectorPath(startX: number, startY: number, endX: number, endY: number, gutterLeft: number) {
  const bendStart = round(gutterLeft + 6);
  const control = round(gutterLeft + 30);
  const bendEnd = round(gutterLeft + 54);
  return `M${round(startX)} ${round(startY)}H${bendStart}C${control} ${round(startY)} ${control} ${round(endY)} ${bendEnd} ${round(endY)}H${round(endX)}`;
}

/** Returns false when the connector layer is not rendered (mobile tab layout). */
export function layoutHeroConnectors(nodes: HeroConnectorNodes): boolean {
  const bodyRect = nodes.body.getBoundingClientRect();
  if (bodyRect.width === 0 || nodes.source.offsetParent === null) return false;
  const gutterLeft = nodes.source.getBoundingClientRect().right - bodyRect.left;
  const endX = nodes.well.getBoundingClientRect().left - bodyRect.left + 14;
  let eventStart: { x: number; y: number } | null = null;
  nodes.paths.forEach((path, index) => {
    const pin = nodes.pins[index];
    const head = nodes.heads[index];
    if (!path || !pin || !head) return;
    const pinRect = pin.getBoundingClientRect();
    const headRect = head.getBoundingClientRect();
    const startX = pinRect.right - bodyRect.left + 4.8;
    const startY = pinRect.top + pinRect.height / 2 - bodyRect.top;
    const endY = headRect.top + headRect.height / 2 - bodyRect.top;
    path.setAttribute("d", connectorPath(startX, startY, endX, endY, gutterLeft));
    const dot = nodes.dots[index];
    if (dot) { dot.setAttribute("cx", String(round(startX))); dot.setAttribute("cy", String(round(startY))); }
    if (index === 1) eventStart = { x: startX, y: startY };
  });
  if (eventStart && nodes.errorPath) {
    const start = eventStart as { x: number; y: number };
    nodes.errorPath.setAttribute("d", `M${round(start.x)} ${round(start.y)}H${round(gutterLeft + 30)}`);
    if (nodes.errorMark) { nodes.errorMark.setAttribute("x", String(round(gutterLeft + 32))); nodes.errorMark.setAttribute("y", String(round(start.y + 5))); }
  }
  return true;
}
