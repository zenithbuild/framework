import { defineType, defineField } from "sanity";

export const ctaSection = defineType({
    name: "ctaSection",
    title: "CTA Section",
    type: "document",
    fields: [
        defineField({ name: "headline", title: "Headline", type: "string" }),
        defineField({ name: "subline", title: "Subline", type: "text", rows: 2 }),
        defineField({ name: "ctaPrimaryLabel", title: "Primary CTA Label", type: "string" }),
        defineField({ name: "ctaPrimaryHref", title: "Primary CTA URL", type: "url" }),
        defineField({ name: "ctaSecondaryLabel", title: "Secondary CTA Label", type: "string" }),
        defineField({ name: "ctaSecondaryHref", title: "Secondary CTA URL", type: "url" }),
    ],
});
