export interface SiteSettings {
    title: string;
    description: string;
}

export interface HeroContent {
    eyebrow: string;
    headline: string;
    subline: string;
    ctaPrimaryLabel: string;
    ctaPrimaryHref: string;
    ctaSecondaryLabel: string;
    ctaSecondaryHref: string;
}

export interface TrustLogo {
    name: string;
    svgMarkup: string;
}

export interface TrustStripContent {
    label: string;
    logos: TrustLogo[];
}

export interface Feature {
    title: string;
    description: string;
    icon: string;
}

export interface ValuePropContent {
    eyebrow: string;
    headline: string;
    body: string;
    features: Feature[];
}

export interface DifferentiatorItem {
    number: string;
    title: string;
    description: string;
}

export interface DifferentiatorsContent {
    eyebrow: string;
    headline: string;
    items: DifferentiatorItem[];
}

export interface CodeTab {
    label: string;
    language: string;
    code: string;
}

export interface CodeShowcaseContent {
    eyebrow: string;
    headline: string;
    body: string;
    tabs: CodeTab[];
}

export interface EditorialContent {
    eyebrow: string;
    headline: string;
    body: string;
    secondaryHeadline: string;
    secondaryBody: string;
}

export interface StatItem {
    value: string;
    label: string;
    description: string;
}

export interface PerformanceContent {
    eyebrow: string;
    headline: string;
    body: string;
    stats: StatItem[];
}

export interface CtaContent {
    headline: string;
    subline: string;
    ctaPrimaryLabel: string;
    ctaPrimaryHref: string;
    ctaSecondaryLabel: string;
    ctaSecondaryHref: string;
}

export interface FaqItem {
    question: string;
    answer: string;
}

export interface FaqContent {
    eyebrow: string;
    headline: string;
    items: FaqItem[];
}

export interface MarketingPageContent {
    settings: SiteSettings;
    hero: HeroContent;
    trustStrip: TrustStripContent;
    valueProp: ValuePropContent;
    differentiators: DifferentiatorsContent;
    codeShowcase: CodeShowcaseContent;
    editorial: EditorialContent;
    performance: PerformanceContent;
    cta: CtaContent;
}
