import { defineType, defineField } from "sanity";

export const trustStrip = defineType({
    name: "trustStrip",
    title: "Trust Strip",
    type: "document",
    fields: [
        defineField({ name: "label", title: "Label", type: "string" }),
        defineField({
            name: "logos",
            title: "Logos",
            type: "array",
            of: [
                {
                    type: "object",
                    fields: [
                        defineField({ name: "name", title: "Company Name", type: "string" }),
                        defineField({ name: "svgMarkup", title: "SVG Markup", type: "text", rows: 4 }),
                    ],
                },
            ],
        }),
    ],
});
