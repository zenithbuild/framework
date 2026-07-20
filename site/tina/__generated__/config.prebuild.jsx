// tina/config.ts
import { defineConfig } from "tinacms";

// tina/collections/about.ts
var actionFields = [
  { type: "string", name: "label", label: "Label", required: true },
  { type: "string", name: "href", label: "URL", required: true },
  { type: "string", name: "variant", label: "Variant", options: ["primary", "outline", "secondary"] }
];
var numberedItemFields = [
  { type: "string", name: "number", label: "Number" },
  { type: "string", name: "title", label: "Title", required: true },
  { type: "string", name: "description", label: "Description", required: true, ui: { component: "textarea" } }
];
var namedItemFields = [
  { type: "string", name: "name", label: "Name", required: true },
  { type: "string", name: "description", label: "Description", required: true, ui: { component: "textarea" } }
];
function narrativeSection(name, label, fields = numberedItemFields) {
  return {
    type: "object",
    name,
    label,
    fields: [
      { type: "string", name: "eyebrow", label: "Eyebrow" },
      { type: "string", name: "title", label: "Title", required: true },
      { type: "string", name: "description", label: "Description", ui: { component: "textarea" } },
      { type: "object", name: "items", label: "Items", list: true, fields }
    ]
  };
}
var aboutCollection = {
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
            { type: "object", name: "actions", label: "Actions", list: true, fields: actionFields }
          ]
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
            { type: "object", name: "parts", label: "Parts", list: true, fields: namedItemFields }
          ]
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
            { type: "string", name: "role", label: "Role" }
          ]
        },
        {
          type: "object",
          name: "cta",
          label: "Call to action",
          fields: [
            { type: "string", name: "eyebrow", label: "Eyebrow" },
            { type: "string", name: "title", label: "Title", required: true },
            { type: "string", name: "text", label: "Text", ui: { component: "textarea" } },
            { type: "object", name: "actions", label: "Actions", list: true, fields: actionFields }
          ]
        }
      ]
    }
  ]
};

// src/content/slugContract.ts
var ReadableSlugError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReadableSlugError";
  }
};
function normalizeReadableSlug(value) {
  return String(value || "").trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
}
function requireReadableSlug(value, label = "slug") {
  const slug = normalizeReadableSlug(value);
  if (!slug) throw new ReadableSlugError(`${label} does not produce a readable slug`);
  return slug;
}

// tina/collections/blog.ts
var blogCollection = {
  name: "blog",
  label: "Blog",
  path: "site/src/content/blog",
  format: "md",
  ui: {
    filename: {
      slugify: (values) => requireReadableSlug(values.title || "post", "Blog title")
    }
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
        { type: "string", name: "focalPosition", label: "Focal position" }
      ]
    },
    { type: "string", name: "seoTitle", label: "SEO title" },
    { type: "string", name: "seoDescription", label: "SEO description", ui: { component: "textarea" } },
    { type: "string", name: "canonicalPath", label: "Canonical path" },
    { type: "string", name: "relatedSlugs", label: "Related posts", list: true },
    { type: "rich-text", name: "body", label: "Body", isBody: true, required: true }
  ]
};

// ../docs/public-documentation-policy.mjs
var PUBLIC_DOCUMENTATION_ROOT = "docs/documentation";
var PUBLIC_DOCUMENTATION_MATCH = Object.freeze({
  include: "**/*",
  exclude: "{_*,_*/**,**/_*,**/_*/**,_legacy/**,**/_legacy/**}"
});
var PUBLIC_DOCUMENTATION_SECTIONS = Object.freeze([
  { title: "Getting Started", slug: "getting-started", order: 1, description: "Install Zenith, create a project, build a first page, and preview production output." },
  { title: "Core Concepts", slug: "core-concepts", order: 2, description: "Learn .zen files, components, reactivity, bindings, events, and DOM ownership." },
  { title: "Pages and Routing", slug: "pages-and-routing", order: 3, description: "Understand file routes, layouts, parameters, navigation, and route lifecycles." },
  { title: "Server and Data", slug: "server-and-data", order: 4, description: "Load data, protect routes, and keep server execution as the security boundary." },
  { title: "Styling and UI", slug: "styling-and-ui", order: 5, description: "Use Tailwind, public assets, presence, and accessible interface patterns." },
  { title: "Build and Tooling", slug: "build-and-tooling", order: 6, description: "Work with the CLI, compiler, bundler, configuration, diagnostics, and editor tools." },
  { title: "Deployment", slug: "deployment", order: 7, description: "Choose and verify the supported production output and adapter targets." },
  { title: "Advanced", slug: "advanced", order: 8, description: "Study framework boundaries, extension policy, security gates, and advanced patterns." }
]);

// tina/collections/docs.ts
var docsCollection = {
  name: "docs",
  label: "Documentation",
  path: PUBLIC_DOCUMENTATION_ROOT,
  format: "md",
  match: PUBLIC_DOCUMENTATION_MATCH,
  ui: {
    filename: {
      readonly: false,
      slugify: (values) => requireReadableSlug(values.title || "document", "Documentation title")
    }
  },
  fields: [
    { type: "string", name: "title", label: "Title", isTitle: true, required: true },
    { type: "string", name: "description", label: "Description", ui: { component: "textarea" } },
    {
      type: "string",
      name: "section",
      label: "Reader section",
      required: true,
      options: PUBLIC_DOCUMENTATION_SECTIONS.map((section) => section.title)
    },
    { type: "number", name: "sectionOrder", label: "Section order", required: true },
    { type: "number", name: "order", label: "Article order", required: true },
    { type: "string", name: "sidebarLabel", label: "Sidebar label" },
    {
      type: "string",
      name: "status",
      label: "Status",
      required: true,
      options: ["canonical", "draft", "deprecated", "internal", "archived"]
    },
    { type: "string", name: "last_updated", label: "Last updated" },
    { type: "string", name: "version", label: "Version" },
    { type: "string", name: "tags", label: "Tags", list: true },
    { type: "string", name: "seoTitle", label: "SEO title" },
    { type: "string", name: "seoDescription", label: "SEO description", ui: { component: "textarea" } },
    {
      type: "string",
      name: "body",
      label: "Markdown body",
      isBody: true,
      ui: { component: "textarea" }
    }
  ]
};

// tina/collections/people.ts
var peopleCollection = {
  name: "people",
  label: "People",
  path: "site/src/content/people",
  format: "json",
  fields: [
    { type: "string", name: "name", label: "Display name", isTitle: true, required: true },
    { type: "string", name: "profileUrl", label: "Public profile URL", required: true },
    {
      type: "object",
      name: "avatar",
      label: "Avatar",
      fields: [
        { type: "image", name: "src", label: "Image" },
        { type: "number", name: "width", label: "Width" },
        { type: "number", name: "height", label: "Height" },
        { type: "string", name: "alt", label: "Alt text" },
        { type: "string", name: "focalPosition", label: "Focal position" }
      ]
    },
    { type: "boolean", name: "member", label: "Organization member" },
    { type: "boolean", name: "contributor", label: "Contributor" },
    { type: "boolean", name: "active", label: "Active" },
    { type: "number", name: "sortOrder", label: "Sort order" }
  ]
};

// tina/collections/settings.ts
var settingsCollection = {
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
        { type: "string", name: "alt", label: "Alt text" }
      ]
    },
    {
      type: "object",
      name: "socialLinks",
      label: "Social links",
      list: true,
      fields: [
        { type: "string", name: "label", label: "Label", required: true },
        { type: "string", name: "url", label: "URL", required: true }
      ]
    },
    { type: "string", name: "contactUrl", label: "Contact URL" }
  ]
};

// tina/collections/sponsors.ts
var sponsorsCollection = {
  name: "sponsors",
  label: "Sponsorship",
  path: "site/src/content/sponsors",
  format: "json",
  fields: [
    {
      type: "string",
      name: "kind",
      label: "Record type",
      required: true,
      options: ["invitation", "sponsor"]
    },
    { type: "string", name: "name", label: "Record name", isTitle: true, required: true },
    { type: "string", name: "url", label: "Sponsor URL" },
    {
      type: "object",
      name: "logo",
      label: "Logo",
      fields: [
        { type: "image", name: "src", label: "Image" },
        { type: "number", name: "width", label: "Width" },
        { type: "number", name: "height", label: "Height" },
        { type: "string", name: "alt", label: "Alt text" },
        { type: "string", name: "focalPosition", label: "Focal position" }
      ]
    },
    { type: "string", name: "title", label: "Section title" },
    { type: "string", name: "description", label: "Description", ui: { component: "textarea" } },
    { type: "string", name: "recognitionText", label: "Recognition text", ui: { component: "textarea" } },
    { type: "string", name: "ctaLabel", label: "CTA label" },
    { type: "string", name: "ctaUrl", label: "CTA URL" },
    { type: "string", name: "supportingStatements", label: "Supporting statements", list: true },
    { type: "boolean", name: "active", label: "Active" },
    { type: "boolean", name: "featured", label: "Featured" },
    { type: "datetime", name: "startsAt", label: "Starts at" },
    { type: "datetime", name: "endsAt", label: "Ends at" }
  ]
};

// tina/config.ts
var config_default = defineConfig({
  branch: process.env.TINA_PUBLIC_BRANCH || process.env.HEAD || "main",
  clientId: process.env.TINA_PUBLIC_CLIENT_ID || "",
  token: process.env.TINA_TOKEN || "",
  localContentPath: "../..",
  build: {
    outputFolder: "admin",
    publicFolder: "src/public"
  },
  media: {
    tina: {
      mediaRoot: "uploads",
      publicFolder: "site/src/public"
    }
  },
  schema: {
    collections: [
      docsCollection,
      blogCollection,
      aboutCollection,
      sponsorsCollection,
      peopleCollection,
      settingsCollection
    ]
  }
});
export {
  config_default as default
};
