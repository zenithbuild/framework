import { gsap, SplitText, ScrollTrigger } from "../gsap-setup";

export interface SplitParagraphOptions {
    trigger?: HTMLElement;
    start?: string;
    immediate?: boolean;
    delay?: number;
}

/**
 * Paragraph/subtext reveal: SplitText.create() with lines + mask.
 * Uses linesClass for controlled line wrappers.
 * Returns a cleanup function for use in zenMount ctx.cleanup().
 */
export function splitParagraph(
    element: HTMLElement,
    options: SplitParagraphOptions = {},
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
        type: "lines",
        mask: "lines",
        linesClass: "line-inner++",
        autoSplit: true,
        onSplit(self) {
            gsap.set(element, { autoAlpha: 1 });

            const tweenConfig: gsap.TweenVars = {
                yPercent: 100,
                stagger: 0.06,
                duration: 0.75,
                ease: "power3.out",
                delay,
            };

            if (!isImmediate) {
                tweenConfig.scrollTrigger = {
                    trigger: triggerElement,
                    start: startPosition,
                    toggleActions: "play none none none",
                };
            }

            return gsap.from(self.lines, tweenConfig);
        },
    });

    return () => {
        split.revert();
    };
}
