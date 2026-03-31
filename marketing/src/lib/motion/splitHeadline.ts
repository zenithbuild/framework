import { gsap, SplitText, ScrollTrigger } from "../gsap-setup";

export interface SplitHeadlineOptions {
    trigger?: HTMLElement;
    start?: string;
    immediate?: boolean;
    delay?: number;
}

/**
 * Headline reveal: SplitText.create() with chars + mask.
 * Returns a cleanup function for use in zenMount ctx.cleanup().
 */
export function splitHeadline(
    element: HTMLElement,
    options: SplitHeadlineOptions = {},
): () => void {
    const prefersReduced = zenWindow()?.matchMedia(
        "(prefers-reduced-motion: reduce)",
    )?.matches;

    if (prefersReduced) {
        gsap.set(element, { autoAlpha: 1 });
        return () => {};
    }

    const triggerElement = options.trigger || element;
    const startPosition = options.start || "top 85%";
    const isImmediate = options.immediate === true;
    const delay = options.delay || 0;

    const split = SplitText.create(element, {
        type: "words, chars",
        mask: "chars",
        autoSplit: true,
        onSplit(self) {
            gsap.set(element, { autoAlpha: 1 });

            const tweenConfig: gsap.TweenVars = {
                yPercent: 110,
                stagger: 0.03,
                duration: 0.9,
                ease: "power4.out",
                delay,
            };

            if (!isImmediate) {
                tweenConfig.scrollTrigger = {
                    trigger: triggerElement,
                    start: startPosition,
                    toggleActions: "play none none none",
                };
            }

            return gsap.from(self.chars, tweenConfig);
        },
    });

    return () => {
        split.revert();
    };
}
