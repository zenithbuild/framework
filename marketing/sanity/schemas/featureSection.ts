import { defineType, defineField } from "sanity";

export const featureSection = defineType({
    name: "featureSection",
    title: "Feature / Value Prop Section",
    type: "document",
    fields: [
        defineField({ name: "eyebrow", title: "Eyebrow", type: "string" }),
        defineField({ name: "headline", title: "Headline", type: "string" }),
        defineField({ name: "body", title: "Body", type: "text", rows: 4 }),
        defineField({
            name: "features",
            title: "Features",
            type: "array",
            of: [
                {
                    type: "object",
                    fields: [
                        defineField({ name: "title", title: "Title", type: "string" }),
                        defineField({ name: "description", title: "Description", type: "text", rows: 3 }),
                        defineField({ name: "icon", title: "Icon Key", type: "string" }),
                    ],
                },
            ],
        }),
    ],
});
