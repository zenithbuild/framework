import { defineType, defineField } from "sanity";

export const siteSettings = defineType({
    name: "siteSettings",
    title: "Site Settings",
    type: "document",
    fields: [
        defineField({ name: "title", title: "Site Title", type: "string" }),
        defineField({ name: "description", title: "Meta Description", type: "text", rows: 3 }),
    ],
});
