import {
  PUBLIC_DOCUMENTATION_MATCH,
  PUBLIC_DOCUMENTATION_ROOT,
  PUBLIC_DOCUMENTATION_SECTIONS,
} from "../../../docs/public-documentation-policy.mjs";
import { requireReadableSlug } from "../../src/content/slugContract";

export const docsCollection = {
  name: "docs",
  label: "Documentation",
  path: PUBLIC_DOCUMENTATION_ROOT,
  format: "md",
  match: PUBLIC_DOCUMENTATION_MATCH,
  ui: {
    filename: {
      readonly: false,
      slugify: (values: { title?: string }) => requireReadableSlug(values.title || "document", "Documentation title"),
    },
  },
  fields: [
    { type: "string", name: "title", label: "Title", isTitle: true, required: true },
    { type: "string", name: "description", label: "Description", ui: { component: "textarea" } },
    {
      type: "string",
      name: "section",
      label: "Reader section",
      required: true,
      options: PUBLIC_DOCUMENTATION_SECTIONS.map((section) => section.title),
    },
    { type: "number", name: "sectionOrder", label: "Section order", required: true },
    { type: "number", name: "order", label: "Article order", required: true },
    { type: "string", name: "sidebarLabel", label: "Sidebar label" },
    {
      type: "string",
      name: "status",
      label: "Status",
      required: true,
      options: ["canonical", "draft", "deprecated", "internal", "archived"],
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
      ui: { component: "textarea" },
    },
  ],
};
