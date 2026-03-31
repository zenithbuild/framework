import { defineType, defineField } from "sanity";

export const statsSection = defineType({
    name: "statsSection",
    title: "Stats / Performance Section",
    type: "document",
    fields: [
        defineField({ name: "eyebrow", title: "Eyebrow", type: "string" }),
        defineField({ name: "headline", title: "Headline", type: "string" }),
        defineField({ name: "body", title: "Body", type: "text", rows: 3 }),
        defineField({
            name: "stats",
            title: "Stats",
            type: "array",
            of: [
                {
                    type: "object",
                    fields: [
                        defineField({ name: "value", title: "Value", type: "string" }),
                        defineField({ name: "label", title: "Label", type: "string" }),
                        defineField({ name: "description", title: "Description", type: "text", rows: 2 }),
                    ],
                },
            ],
        }),
    ],
});
