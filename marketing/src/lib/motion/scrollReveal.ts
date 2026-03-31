import { gsap, ScrollTrigger } from "../gsap-setup";

export interface ScrollRevealOptions {
    start?: string;
    end?: string;
    stagger?: number;
    y?: number;
    duration?: number;
    ease?: string;
}

/**
 * Section-level scroll reveal — animates child elements with
 * y-translation and autoAlpha via ScrollTrigger.
 * Returns a cleanup function.
 */
export function scrollReveal(
    trigger: HTMLElement,
    targets: HTMLElement[],
    options: ScrollRevealOptions = {},
): () => void {
    const prefersReduced = zenWindow()?.matchMedia(
        "(prefers-reduced-motion: reduce)",
    )?.matches;

    if (prefersReduced) {
        gsap.set(targets, { autoAlpha: 1 });
        return () => {};
    }

    const tween = gsap.from(targets, {
        y: options.y ?? 40,
        autoAlpha: 0,
        stagger: options.stagger ?? 0.1,
        duration: options.duration ?? 0.8,
        ease: options.ease ?? "power3.out",
        scrollTrigger: {
            trigger,
            start: options.start || "top 80%",
            end: options.end || "bottom 20%",
            toggleActions: "play none none none",
        },
    });

    return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
    };
}
