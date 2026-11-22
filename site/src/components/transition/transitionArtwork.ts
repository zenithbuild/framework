import type { gsap } from "gsap";
import { transitionTiming } from "./transitionTiming";

export interface TransitionArtwork {
  glow: HTMLElement;
  rings: HTMLElement[];
  markRing: HTMLElement;
  markCore: HTMLElement;
  mark: HTMLElement;
}

// Both overlays own a ref to the wrapper. The shared identity renders its children before mount callbacks run.
export function getTransitionIdentity(wrapper: HTMLElement, mark: HTMLElement) {
  const find = (selector: string) => wrapper.querySelector<HTMLElement>(selector);
  const glow = find("[data-transition-glow]");
  const outer = find('[data-transition-ring="outer"]');
  const middle = find('[data-transition-ring="middle"]');
  const inner = find('[data-transition-ring="inner"]');
  const markRing = find("[data-transition-mark-ring]");
  const markCore = find("[data-transition-mark-core]");
  const labelFrame = find("[data-transition-label-frame]");
  const label = find("[data-transition-label]");
  if (!glow || !outer || !middle || !inner || !markRing || !markCore || !labelFrame || !label) return null;
  return { glow, rings: [outer, middle, inner], markRing, markCore, mark, labelFrame, label };
}

export function enterArtwork(timeline: gsap.core.Timeline, art: TransitionArtwork, start: number) {
  const duration = transitionTiming.artworkIn;
  timeline
    .to(art.glow, { autoAlpha: 1, scale: 1, duration }, start)
    .to(art.rings, { autoAlpha: 1, scale: 1, duration, stagger: transitionTiming.ringStagger }, start)
    .to([art.markRing, art.markCore], { autoAlpha: 1, scale: 1, duration, stagger: transitionTiming.markStagger }, start + 0.04)
    .to(art.mark, { autoAlpha: 1, scale: 1, duration }, start + 0.06);
}

export function exitArtwork(timeline: gsap.core.Timeline, art: TransitionArtwork) {
  const duration = transitionTiming.artworkOut;
  timeline
    .addLabel("artworkExit", ">")
    .to(art.rings, { autoAlpha: 0, scale: 1.15, duration, stagger: transitionTiming.ringExitStagger }, "artworkExit")
    .to(art.glow, { autoAlpha: 0, scale: 1.1, duration: duration + 0.02 }, "artworkExit+=0.02")
    .to([art.markRing, art.markCore], { autoAlpha: 0, scale: 0.2, duration: duration - 0.06, ease: "power2.in" }, "artworkExit")
    .to(art.mark, { autoAlpha: 0, scale: 0.9, duration: duration - 0.06 }, "artworkExit");
}

export function revealThroughOverlay(timeline: gsap.core.Timeline, overlay: HTMLElement, backdrop: HTMLElement) {
  timeline
    .addLabel("overlayReveal", ">")
    .to(overlay, { clipPath: "inset(100% 0% 0% 0%)", duration: transitionTiming.overlayMaskAway, ease: "power3.inOut" }, "overlayReveal")
    .to(backdrop, { autoAlpha: 0, duration: transitionTiming.backdropFade }, "overlayReveal");
}
