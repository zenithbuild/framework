import { defineType, defineField } from "sanity";

export const editorialSection = defineType({
    name: "editorialSection",
    title: "Editorial Section",
    type: "document",
    fields: [
        defineField({ name: "eyebrow", title: "Eyebrow", type: "string" }),
        defineField({ name: "headline", title: "Headline", type: "string" }),
        defineField({ name: "body", title: "Body", type: "text", rows: 5 }),
        defineField({ name: "secondaryHeadline", title: "Secondary Headline", type: "string" }),
        defineField({ name: "secondaryBody", title: "Secondary Body", type: "text", rows: 5 }),
    ],
});
