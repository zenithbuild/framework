import { requireReadableSlug } from "../../src/content/slugContract";

export const blogCollection = {
  name: "blog",
  label: "Blog",
  path: "site/src/content/blog",
  format: "md",
  ui: {
    filename: {
      slugify: (values: { title?: string }) => requireReadableSlug(values.title || "post", "Blog title"),
    },
  },
  fields: [
    { type: "string", name: "title", label: "Title", isTitle: true, required: true },
    { type: "string", name: "description", label: "Description", required: true, ui: { component: "textarea" } },
    { type: "boolean", name: "published", label: "Published", required: true },
    { type: "datetime", name: "publishedAt", label: "Published at" },
    { type: "datetime", name: "updatedAt", label: "Updated at" },
    { type: "reference", name: "author", label: "Author", collections: ["people"] },
    { type: "string", name: "category", label: "Category" },
    { type: "string", name: "tags", label: "Tags", list: true },
    { type: "boolean", name: "featured", label: "Featured" },
    {
      type: "object",
      name: "featuredImage",
      label: "Featured image",
      fields: [
        { type: "image", name: "src", label: "Image" },
        { type: "number", name: "width", label: "Width" },
        { type: "number", name: "height", label: "Height" },
        { type: "string", name: "alt", label: "Alt text" },
        { type: "string", name: "focalPosition", label: "Focal position" },
      ],
    },
    { type: "string", name: "seoTitle", label: "SEO title" },
    { type: "string", name: "seoDescription", label: "SEO description", ui: { component: "textarea" } },
    { type: "string", name: "canonicalPath", label: "Canonical path" },
    { type: "string", name: "relatedSlugs", label: "Related posts", list: true },
    { type: "rich-text", name: "body", label: "Body", isBody: true, required: true },
  ],
};
