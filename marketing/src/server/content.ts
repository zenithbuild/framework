import { getSanityClient } from "../lib/sanity/client";
import {
    SITE_SETTINGS_QUERY,
    HERO_QUERY,
    TRUST_STRIP_QUERY,
    VALUE_PROP_QUERY,
    DIFFERENTIATORS_QUERY,
    CODE_SHOWCASE_QUERY,
    EDITORIAL_QUERY,
    PERFORMANCE_QUERY,
    CTA_QUERY,
} from "../lib/sanity/queries";
import type { MarketingPageContent } from "../lib/sanity/types";

const defaults: MarketingPageContent = {
    settings: {
        title: "Zenith — Compiler-First UI Framework",
        description: "A reactive framework built to formalize UI architecture. Deterministic output, explicit contracts, minimal runtime.",
    },
    hero: {
        eyebrow: "Framework v0.7",
        headline: "Build with intention.",
        subline: "Zenith is a compiler-first UI framework that produces deterministic output. No virtual DOM. No hidden runtime. Every render decision is explicit, auditable, and fast.",
        ctaPrimaryLabel: "Get Started",
        ctaPrimaryHref: "/docs",
        ctaSecondaryLabel: "View on GitHub",
        ctaSecondaryHref: "https://github.com/zenithbuild/framework",
    },
    trustStrip: {
        label: "Trusted by engineers who value correctness",
        logos: [],
    },
    valueProp: {
        eyebrow: "Why Zenith",
        headline: "Architecture is not optional.",
        body: "Most frameworks let you build anything — and that's the problem. Zenith encodes architectural decisions into the compiler itself. Your code compiles to exactly what you wrote. No intermediate representations. No framework-inserted wrappers. Deterministic output is the default.",
        features: [
            {
                title: "Compiler-First",
                description: "Zenith's compiler is the framework. It validates structure, enforces contracts, and produces minimal output with zero runtime overhead.",
                icon: "compiler",
            },
            {
                title: "Explicit Reactivity",
                description: "Signals, state, and refs are distinct primitives with clear ownership rules. No proxy magic. No implicit subscription tracking.",
                icon: "reactivity",
            },
            {
                title: "Server Authority",
                description: "Guards and loaders run on the server. The compiler enforces this boundary. Your sensitive logic never ships to the client.",
                icon: "server",
            },
        ],
    },
    differentiators: {
        eyebrow: "Core Principles",
        headline: "Opinionated by design.",
        items: [
            {
                number: "01",
                title: "Deterministic Output",
                description: "Every .zen file compiles to the same output regardless of environment. No runtime heuristics. No speculative optimizations. What you write is what ships.",
            },
            {
                number: "02",
                title: "Explicit Contracts",
                description: "Component interfaces are validated at compile time. Props, events, slots — every boundary is typed and enforced before your code ever runs.",
            },
            {
                number: "03",
                title: "Minimal Runtime",
                description: "Zenith's hydration layer is measured in bytes, not kilobytes. The compiler does the work so the browser doesn't have to.",
            },
        ],
    },
    codeShowcase: {
        eyebrow: "Developer Experience",
        headline: "Write less. Ship precisely.",
        body: "Zenith components are single-file, expressive, and free of framework ceremony. The syntax is HTML-native with compile-time guarantees.",
        tabs: [
            {
                label: "Component",
                language: "html",
                code: `<script lang="ts">
export interface Props {
    count: number;
    onIncrement: () => void;
}

const incoming = props as Props;
const current = incoming.count;
</script>

<div class="flex items-center gap-4">
    <span class="text-2xl font-mono">{current}</span>
    <button on:click={incoming.onIncrement}>
        Increment
    </button>
</div>`,
            },
            {
                label: "Page + Loader",
                language: "html",
                code: `<script server lang="ts">
export const guard = async (ctx) => {
    const session = ctx.cookies.get("session");
    if (!session) return redirect("/login");
    return allow();
};

export const load = async (ctx) => {
    const user = await db.users.find(ctx.params.id);
    return { user };
};
</script>

<script setup="ts">
import Avatar from "@/components/Avatar.zen";
</script>

<div class="p-8">
    <Avatar name={data.user.name} />
    <h1>{data.user.name}</h1>
</div>`,
            },
            {
                label: "Reactive State",
                language: "html",
                code: `<script setup="ts">
state open = false;
const toggleRef = ref<HTMLButtonElement>();

function toggle() {
    open = !open;
}

zenMount((ctx) => {
    ctx.cleanup(zenOn(
        zenDocument(),
        "keydown",
        (e: KeyboardEvent) => {
            if (e.key === "Escape") open = false;
        }
    ));
});
</script>

<button ref={toggleRef} on:click={toggle}>
    {open ? "Close" : "Open"}
</button>`,
            },
        ],
    },
    editorial: {
        eyebrow: "Architecture",
        headline: "The compiler is the framework.",
        body: "Zenith doesn't ship a runtime that interprets your intent at execution time. The compiler reads your .zen files, validates every expression, resolves every binding, and emits minimal JavaScript that targets the DOM directly. There's no reconciler. No fiber tree. No scheduler. The output is a direct translation of your declared structure into browser-native operations.",
        secondaryHeadline: "Designed for auditability.",
        secondaryBody: "In Zenith, every runtime behavior traces back to something you explicitly wrote. Signals have stable identity. Refs have deterministic lifecycle. Events normalize through a documented mapping. When something breaks, you can read the compiled output and understand exactly what happened.",
    },
    performance: {
        eyebrow: "Performance",
        headline: "Fast because there's less to run.",
        body: "When your framework's output is deterministic and your runtime is minimal, performance isn't an optimization target — it's a natural consequence.",
        stats: [
            { value: "0", label: "Virtual DOM Overhead", description: "No diffing, no patching, no reconciliation. Direct DOM mutations only." },
            { value: "<2KB", label: "Runtime Size", description: "The hydration runtime ships at under 2KB gzipped. The compiler does the heavy lifting." },
            { value: "100%", label: "Deterministic Output", description: "Same input, same output. Every time. No environment-dependent rendering paths." },
            { value: "0ms", label: "Framework Boot", description: "No initialization phase. No framework bootstrap. Your code runs immediately." },
        ],
    },
    cta: {
        headline: "Start building with Zenith.",
        subline: "A framework that respects your architecture. Open source, compiler-first, deterministic by default.",
        ctaPrimaryLabel: "Read the Docs",
        ctaPrimaryHref: "/docs",
        ctaSecondaryLabel: "GitHub",
        ctaSecondaryHref: "https://github.com/zenithbuild/framework",
    },
};

async function fetchOrDefault<T>(query: string, fallback: T): Promise<T> {
    try {
        const sanityClient = getSanityClient();
        if (!sanityClient) {
            return fallback;
        }
        const result = await sanityClient.fetch<T>(query);
        if (result && typeof result === "object") return result;
        return fallback;
    } catch {
        return fallback;
    }
}

export async function fetchMarketingContent(): Promise<MarketingPageContent> {
    const [
        settings,
        hero,
        trustStrip,
        valueProp,
        differentiators,
        codeShowcase,
        editorial,
        performance,
        cta,
    ] = await Promise.all([
        fetchOrDefault(SITE_SETTINGS_QUERY, defaults.settings),
        fetchOrDefault(HERO_QUERY, defaults.hero),
        fetchOrDefault(TRUST_STRIP_QUERY, defaults.trustStrip),
        fetchOrDefault(VALUE_PROP_QUERY, defaults.valueProp),
        fetchOrDefault(DIFFERENTIATORS_QUERY, defaults.differentiators),
        fetchOrDefault(CODE_SHOWCASE_QUERY, defaults.codeShowcase),
        fetchOrDefault(EDITORIAL_QUERY, defaults.editorial),
        fetchOrDefault(PERFORMANCE_QUERY, defaults.performance),
        fetchOrDefault(CTA_QUERY, defaults.cta),
    ]);

    return {
        settings,
        hero,
        trustStrip,
        valueProp,
        differentiators,
        codeShowcase,
        editorial,
        performance,
        cta,
    };
}
