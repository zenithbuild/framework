import { defineType, defineField } from "sanity";

export const hero = defineType({
    name: "hero",
    title: "Hero Section",
    type: "document",
    fields: [
        defineField({ name: "eyebrow", title: "Eyebrow", type: "string" }),
        defineField({ name: "headline", title: "Headline", type: "string" }),
        defineField({ name: "subline", title: "Subline", type: "text", rows: 3 }),
        defineField({ name: "ctaPrimaryLabel", title: "Primary CTA Label", type: "string" }),
        defineField({ name: "ctaPrimaryHref", title: "Primary CTA URL", type: "url" }),
        defineField({ name: "ctaSecondaryLabel", title: "Secondary CTA Label", type: "string" }),
        defineField({ name: "ctaSecondaryHref", title: "Secondary CTA URL", type: "url" }),
    ],
});
