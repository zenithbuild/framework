export const settingsCollection = {
  name: "siteSettings",
  label: "Site settings",
  path: "site/src/content/site",
  format: "json",
  match: { include: "settings" },
  fields: [
    { type: "string", name: "defaultSeoTitle", label: "Default SEO title", isTitle: true, required: true },
    { type: "string", name: "defaultSeoDescription", label: "Default SEO description", required: true, ui: { component: "textarea" } },
    { type: "string", name: "siteUrl", label: "Production site URL" },
    {
      type: "object",
      name: "socialImage",
      label: "Default social image",
      fields: [
        { type: "image", name: "src", label: "Image" },
        { type: "number", name: "width", label: "Width" },
        { type: "number", name: "height", label: "Height" },
        { type: "string", name: "alt", label: "Alt text" },
      ],
    },
    {
      type: "object",
      name: "socialLinks",
      label: "Social links",
      list: true,
      fields: [
        { type: "string", name: "label", label: "Label", required: true },
        { type: "string", name: "url", label: "URL", required: true },
      ],
    },
    { type: "string", name: "contactUrl", label: "Contact URL" },
  ],
};
