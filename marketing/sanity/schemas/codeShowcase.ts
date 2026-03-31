import { defineType, defineField } from "sanity";

export const codeShowcase = defineType({
    name: "codeShowcase",
    title: "Code Showcase Section",
    type: "document",
    fields: [
        defineField({ name: "eyebrow", title: "Eyebrow", type: "string" }),
        defineField({ name: "headline", title: "Headline", type: "string" }),
        defineField({ name: "body", title: "Body", type: "text", rows: 3 }),
        defineField({
            name: "tabs",
            title: "Code Tabs",
            type: "array",
            of: [
                {
                    type: "object",
                    fields: [
                        defineField({ name: "label", title: "Tab Label", type: "string" }),
                        defineField({ name: "language", title: "Language", type: "string" }),
                        defineField({ name: "code", title: "Code", type: "text", rows: 15 }),
                    ],
                },
            ],
        }),
    ],
});
