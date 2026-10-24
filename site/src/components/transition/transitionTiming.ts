/**
 * Centralized timing constants for the transition animation system.
 *
 * Both the intro loader and route transition consume these values
 * so their visual language stays synchronized. The intro may include
 * additional phases (logo Flip, hero reveal) but the shared phases
 * use the same durations.
 */
export const transitionTiming = {
  // Artwork entrance
  artworkIn: 0.42,
  ringStagger: 0.07,
  markStagger: 0.06,
  logoReveal: 0.72,

  // Label phases
  labelEntrance: 0.72,
  labelHoldShort: 1.0,
  labelHoldMedium: 1.3,
  labelHoldLong: 1.6,
  labelExit: 0.72,
  labelWordStagger: 0.06,

  // Artwork exit
  artworkOut: 0.36,
  ringExitStagger: 0.04,

  // Overlay
  overlayMaskAway: 0.32,
  destinationEntrance: 0.44,
  backdropFade: 0.26,
  overlayFade: 0.12,

  // Intro-specific
  introPhraseHold: 1.2,
  introLogoFlip: 1.02,
  introHeroStagger: 0.08,

  // Reduced motion
  reducedHold: 0.5,
} as const;

export type LabelTier = "short" | "medium" | "long";

/**
 * Classifies a label into a timing tier based on word count.
 * Short labels (1-2 words) get the standard hold.
 * Medium labels (3-5 words) get a slightly longer hold.
 * Long labels (6+ words or known multiline titles) get the longest hold.
 */
export function labelTierFor(text: string): LabelTier {
  const trimmed = text.trim();
  const chars = trimmed.length;
  const words = trimmed.split(/\s+/).length;
  if (chars > 16 || words > 4) return "long";
  if (chars > 8) return "medium";
  return "short";
}

/**
 * Returns the readable hold duration for a given label text.
 */
export function labelHoldFor(text: string): number {
  const tier = labelTierFor(text);
  if (tier === "short") return transitionTiming.labelHoldShort;
  if (tier === "medium") return transitionTiming.labelHoldMedium;
  return transitionTiming.labelHoldLong;
}
