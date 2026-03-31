import { defineType, defineField } from "sanity";

export const differentiator = defineType({
    name: "differentiator",
    title: "Differentiators Section",
    type: "document",
    fields: [
        defineField({ name: "eyebrow", title: "Eyebrow", type: "string" }),
        defineField({ name: "headline", title: "Headline", type: "string" }),
        defineField({
            name: "items",
            title: "Items",
            type: "array",
            of: [
                {
                    type: "object",
                    fields: [
                        defineField({ name: "number", title: "Number", type: "string" }),
                        defineField({ name: "title", title: "Title", type: "string" }),
                        defineField({ name: "description", title: "Description", type: "text", rows: 3 }),
                    ],
                },
            ],
        }),
    ],
});
