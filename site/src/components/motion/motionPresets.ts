/**
 * Centralized motion presets for shared animation primitives.
 *
 * These values define the approved entrance animations for titles,
 * body text, action groups, and media. Pages and components should
 * reference these presets rather than defining ad-hoc GSAP configs.
 */

export type MotionMode = "route" | "scroll" | "intro" | "none";
export type MotionPreset = "maskedTitle" | "fadeUp" | "staggeredActions" | "mediaSettle" | "groupedCards";

export interface MotionConfig {
  initial: Record<string, number>;
  entrance: Record<string, number | string>;
  duration: number;
  ease: string;
  stagger: number;
  reducedFinal: Record<string, number | string>;
}

export const motionPresets: Record<MotionPreset, MotionConfig> = {
  maskedTitle: {
    initial: { autoAlpha: 0, yPercent: 105, rotationX: -42 },
    entrance: { autoAlpha: 1, yPercent: 0, rotationX: 0 },
    duration: 0.72,
    ease: "power3.out",
    stagger: 0.06,
    reducedFinal: { autoAlpha: 1, yPercent: 0, rotationX: 0 },
  },
  fadeUp: {
    initial: { autoAlpha: 0, y: 18 },
    entrance: { autoAlpha: 1, y: 0 },
    duration: 0.68,
    ease: "power3.out",
    stagger: 0.08,
    reducedFinal: { autoAlpha: 1, y: 0 },
  },
  staggeredActions: {
    initial: { autoAlpha: 0, y: 18 },
    entrance: { autoAlpha: 1, y: 0 },
    duration: 0.48,
    ease: "power3.out",
    stagger: 0.06,
    reducedFinal: { autoAlpha: 1, y: 0 },
  },
  mediaSettle: {
    initial: { autoAlpha: 0, scale: 0.96 },
    entrance: { autoAlpha: 1, scale: 1 },
    duration: 0.62,
    ease: "power3.out",
    stagger: 0,
    reducedFinal: { autoAlpha: 1, scale: 1 },
  },
  groupedCards: {
    initial: { autoAlpha: 0, y: 24 },
    entrance: { autoAlpha: 1, y: 0 },
    duration: 0.72,
    ease: "power3.out",
    stagger: 0.1,
    reducedFinal: { autoAlpha: 1, y: 0 },
  },
};

export const motionDefaults = {
  pageMode: { distance: 18, duration: 0.68, stagger: 0.08, ease: "power3.out" },
  scrollMode: { distance: 24, duration: 0.72, stagger: 0, ease: "power3.out", start: "top 88%" },
  reducedHold: 0.5,
} as const;
