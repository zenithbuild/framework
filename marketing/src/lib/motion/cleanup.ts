import { ScrollTrigger } from "../gsap-setup";

/**
 * Kill all ScrollTrigger instances scoped to a given trigger element.
 * Call this in zenMount cleanup to prevent memory leaks.
 */
export function cleanupScrollTriggers(trigger: HTMLElement): void {
    ScrollTrigger.getAll()
        .filter((st) => st.vars.trigger === trigger)
        .forEach((st) => st.kill());
}

/**
 * Kill all ScrollTrigger instances globally.
 * Use sparingly — typically only on full page unmount.
 */
export function cleanupAllScrollTriggers(): void {
    ScrollTrigger.getAll().forEach((st) => st.kill());
}
