/** Durations in seconds, before a timeline's playback rate is applied. */
export const transitionTiming = {
  artworkIn: 0.42,
  ringStagger: 0.07,
  markStagger: 0.06,
  artworkOut: 0.36,
  ringExitStagger: 0.04,
  labelEntrance: 0.28,
  labelHoldShort: 0.12,
  labelHoldMedium: 0.2,
  labelHoldLong: 0.28,
  labelExit: 0.24,
  labelWordStagger: 0.03,
  overlayMaskAway: 0.32,
  destinationEntrance: 0.44,
  backdropFade: 0.26,
  overlayFade: 0.12,
  introWordIn: 0.32,
  introPhraseHold: 0.40,
  introWordOut: 0.22,
  introWordStagger: 0.035,
  introHeroStagger: 0.08,
} as const;

export type LabelTier = "short" | "medium" | "long";

/** Long or multiline labels get extra reading time. */
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
