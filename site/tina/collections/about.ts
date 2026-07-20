const actionFields = [
  { type: "string", name: "label", label: "Label", required: true },
  { type: "string", name: "href", label: "URL", required: true },
  { type: "string", name: "variant", label: "Variant", options: ["primary", "outline", "secondary"] },
];

const numberedItemFields = [
  { type: "string", name: "number", label: "Number" },
  { type: "string", name: "title", label: "Title", required: true },
  { type: "string", name: "description", label: "Description", required: true, ui: { component: "textarea" } },
];

const namedItemFields = [
  { type: "string", name: "name", label: "Name", required: true },
  { type: "string", name: "description", label: "Description", required: true, ui: { component: "textarea" } },
];

function narrativeSection(name: string, label: string, fields = numberedItemFields) {
  return {
    type: "object",
    name,
    label,
    fields: [
      { type: "string", name: "eyebrow", label: "Eyebrow" },
      { type: "string", name: "title", label: "Title", required: true },
      { type: "string", name: "description", label: "Description", ui: { component: "textarea" } },
      { type: "object", name: "items", label: "Items", list: true, fields },
    ],
  };
}

export const aboutCollection = {
  name: "about",
  label: "About page",
  path: "site/src/content/pages",
  format: "json",
  match: { include: "about" },
  fields: [
    { type: "string", name: "pageTitle", label: "Page title", isTitle: true, required: true },
    { type: "string", name: "description", label: "Page description", required: true, ui: { component: "textarea" } },
    { type: "string", name: "seoTitle", label: "SEO title" },
    { type: "string", name: "seoDescription", label: "SEO description", ui: { component: "textarea" } },
    {
      type: "object",
      name: "sections",
      label: "Page sections",
      fields: [
        {
          type: "object",
          name: "hero",
          label: "Hero",
          fields: [
            { type: "string", name: "eyebrow", label: "Eyebrow" },
            { type: "string", name: "title", label: "Title", required: true },
            { type: "string", name: "description", label: "Description", ui: { component: "textarea" } },
            { type: "object", name: "actions", label: "Actions", list: true, fields: actionFields },
          ],
        },
        narrativeSection("why", "Why Zenith exists"),
        narrativeSection("principles", "Principles"),
        {
          type: "object",
          name: "built",
          label: "Built independently",
          fields: [
            { type: "string", name: "eyebrow", label: "Eyebrow" },
            { type: "string", name: "title", label: "Title", required: true },
            { type: "string", name: "description", label: "Description", ui: { component: "textarea" } },
            { type: "object", name: "parts", label: "Parts", list: true, fields: namedItemFields },
          ],
        },
        narrativeSection("ecosystem", "Ecosystem", namedItemFields),
        {
          type: "object",
          name: "builder",
          label: "Creator narrative",
          fields: [
            { type: "string", name: "eyebrow", label: "Eyebrow" },
            { type: "string", name: "title", label: "Title", required: true },
            { type: "string", name: "text", label: "Narrative", required: true, ui: { component: "textarea" } },
            { type: "string", name: "signature", label: "Signature" },
            { type: "string", name: "role", label: "Role" },
          ],
        },
        {
          type: "object",
          name: "cta",
          label: "Call to action",
          fields: [
            { type: "string", name: "eyebrow", label: "Eyebrow" },
            { type: "string", name: "title", label: "Title", required: true },
            { type: "string", name: "text", label: "Text", ui: { component: "textarea" } },
            { type: "object", name: "actions", label: "Actions", list: true, fields: actionFields },
          ],
        },
      ],
    },
  ],
};
