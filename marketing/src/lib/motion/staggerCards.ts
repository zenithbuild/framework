import { gsap, ScrollTrigger } from "../gsap-setup";

/**
 * Stagger cards entrance — y translation + autoAlpha with stagger.
 * Returns a cleanup function.
 */
export function staggerCards(
    trigger: HTMLElement,
    cards: HTMLElement[],
    options: { y?: number; stagger?: number; duration?: number; start?: string } = {},
): () => void {
    const prefersReduced = zenWindow()?.matchMedia(
        "(prefers-reduced-motion: reduce)",
    )?.matches;

    if (prefersReduced) {
        gsap.set(cards, { autoAlpha: 1 });
        return () => {};
    }

    const tween = gsap.from(cards, {
        y: options.y ?? 60,
        autoAlpha: 0,
        stagger: options.stagger ?? 0.12,
        duration: options.duration ?? 0.9,
        ease: "power3.out",
        scrollTrigger: {
            trigger,
            start: options.start || "top 75%",
            toggleActions: "play none none none",
        },
    });

    return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
    };
}
