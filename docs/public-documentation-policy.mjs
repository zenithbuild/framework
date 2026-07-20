export const PUBLIC_DOCUMENTATION_ROOT = "docs/documentation";

export const PUBLIC_DOCUMENTATION_MATCH = Object.freeze({
  include: "**/*",
  exclude: "{_*,_*/**,**/_*,**/_*/**,_legacy/**,**/_legacy/**}",
});

export const PUBLIC_DOCUMENTATION_STATUS = "canonical";

export const PUBLIC_DOCUMENTATION_SECTIONS = Object.freeze([
  { title: "Getting Started", slug: "getting-started", order: 1, description: "Install Zenith, create a project, build a first page, and preview production output." },
  { title: "Core Concepts", slug: "core-concepts", order: 2, description: "Learn .zen files, components, reactivity, bindings, events, and DOM ownership." },
  { title: "Pages and Routing", slug: "pages-and-routing", order: 3, description: "Understand file routes, layouts, parameters, navigation, and route lifecycles." },
  { title: "Server and Data", slug: "server-and-data", order: 4, description: "Load data, protect routes, and keep server execution as the security boundary." },
  { title: "Styling and UI", slug: "styling-and-ui", order: 5, description: "Use Tailwind, public assets, presence, and accessible interface patterns." },
  { title: "Build and Tooling", slug: "build-and-tooling", order: 6, description: "Work with the CLI, compiler, bundler, configuration, diagnostics, and editor tools." },
  { title: "Deployment", slug: "deployment", order: 7, description: "Choose and verify the supported production output and adapter targets." },
  { title: "Advanced", slug: "advanced", order: 8, description: "Study framework boundaries, extension policy, security gates, and advanced patterns." },
]);

export function isPublicDocumentationPath(relativePath) {
  const normalized = String(relativePath || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized.endsWith(".md")) return false;

  const segments = normalized.split("/").filter(Boolean);
  return segments.length > 0
    && !segments.some((segment) => segment.startsWith("_"))
    && !segments.includes("_legacy");
}

export function documentationSectionByTitle(title) {
  return PUBLIC_DOCUMENTATION_SECTIONS.find((section) => section.title === title) || null;
}
