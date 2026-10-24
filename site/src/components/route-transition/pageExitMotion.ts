/**
 * Shared page-exit motion contract.
 *
 * Provides a restrained exit that reverses the page entrance language
 * (MotionController page mode: y:+18, autoAlpha:0 → y:0, autoAlpha:1).
 * The exit animates only route-level elements — heading, intro content,
 * primary composition, and page shell — not every scroll section.
 */
import { gsap } from "gsap";

export interface PageExitTargets {
  /** Route heading group: PageHeader, motion-page-header, or home hero */
  headingGroup: HTMLElement[];
  /** First few visible motion sections */
  primaryContent: HTMLElement[];
  /** The page shell element */
  shell: HTMLElement;
}

/**
 * Identifies route-level elements within the page shell for a restrained exit.
 * Queries are scoped to the pageShell element — no global selectors.
 */
function identifyPageExitTargets(pageShell: HTMLElement): PageExitTargets {
  const headingGroup: HTMLElement[] = [];
  const primaryContent: HTMLElement[] = [];

  // Route heading: PageHeader component or motion-page-header attribute
  const pageHeader = pageShell.querySelector<HTMLElement>('[data-page-header="true"]');
  if (pageHeader) {
    headingGroup.push(pageHeader);
  } else {
    const motionHeader = pageShell.querySelector<HTMLElement>('[data-motion-page-header="true"]');
    if (motionHeader) headingGroup.push(motionHeader);
  }

  // Home page hero
  const homeHero = pageShell.querySelector<HTMLElement>('[data-home-hero="true"]');
  if (homeHero) headingGroup.push(homeHero);

  // Primary content: first few motion sections (restrained, not every section)
  const motionSections = Array.from(
    pageShell.querySelectorAll<HTMLElement>("[data-motion-section]"),
  );
  primaryContent.push(...motionSections.slice(0, 3));

  return { headingGroup, primaryContent, shell: pageShell };
}

/**
 * Runs a restrained page exit that reverses the entrance language.
 *
 * Entrance: elements come from y:+18, autoAlpha:0 → y:0, autoAlpha:1 (power3.out)
 * Exit:      elements return to y:+18, autoAlpha:0; shell recedes (power3.in)
 *
 * Returns a gsap timeline. Call `.then()` or use `onComplete` to gate
 * the next transition phase on exit completion.
 */
export function animatePageExit(
  pageShell: HTMLElement,
  reducedMotion: boolean,
): gsap.core.Timeline {
  const { headingGroup, primaryContent, shell } = identifyPageExitTargets(pageShell);

  if (reducedMotion) {
    gsap.set(shell, { autoAlpha: 0 });
    return gsap.timeline();
  }

  const tl = gsap.timeline({
    defaults: { ease: "power3.in" },
  });

  // Heading lines move back behind their masks (reverse of entrance)
  if (headingGroup.length) {
    tl.to(
      headingGroup,
      { autoAlpha: 0, y: 18, duration: 0.3, stagger: 0.04 },
      0,
    );
  }

  // Supporting content leaves in grouped order
  if (primaryContent.length) {
    tl.to(
      primaryContent,
      { autoAlpha: 0, y: 14, duration: 0.28, stagger: 0.03 },
      0.06,
    );
  }

  // Page shell recedes slightly
  tl.to(
    shell,
    {
      autoAlpha: 0,
      scale: 0.985,
      transformOrigin: "50% 20%",
      duration: 0.4,
    },
    0.08,
  );

  return tl;
}

/**
 * Clears all inline styles applied during page exit so the
 * destination page starts in its normal CSS layout.
 */
export function clearPageExitStyles(pageShell: HTMLElement): void {
  const { headingGroup, primaryContent, shell } = identifyPageExitTargets(pageShell);
  const all = [...headingGroup, ...primaryContent, shell];
  gsap.set(all, {
    clearProps: "opacity,visibility,transform,willChange,transformOrigin",
  });
}
