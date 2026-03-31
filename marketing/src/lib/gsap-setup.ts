export { gsap } from "gsap";
export { ScrollTrigger } from "gsap/ScrollTrigger";
export { SplitText } from "gsap/SplitText";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);
