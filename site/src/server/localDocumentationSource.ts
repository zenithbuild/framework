import { readdir, readFile } from "node:fs/promises";
import { dirname, posix } from "node:path";
import matter from "gray-matter";
import {
  documentationSectionByTitle,
  isPublicDocumentationPath,
  PUBLIC_DOCUMENTATION_STATUS,
} from "../../../docs/public-documentation-policy.mjs";
import { renderDocumentationMarkdown } from "./documentationMarkdown";
import type { DocumentationDetail, DocumentationSection, DocumentationTag } from "./documentationSource";
import { excerptText } from "./documentationSourceSupport";
import { normalizeReadableSlug } from "../content/slugContract";

const DOCS_ROOT_URL = new URL("../../../docs/documentation/", import.meta.url);

export class DocumentationContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentationContentError";
  }
}

export async function discoverLocalDocumentationEntries(): Promise<DocumentationDetail[]> {
  const candidates = (await listMarkdownFiles(DOCS_ROOT_URL))
    .filter(isPublicDocumentationPath)
    .sort((left, right) => left.localeCompare(right));
  const entries = await Promise.all(candidates.map(loadDocumentationFile));
  validateDocumentationCollection(entries);
  for (const diagnostic of collectDocumentationOrderDiagnostics(entries)) {
    console.warn(`documentation warning: ${diagnostic}`);
  }
  return entries;
}

export function collectDocumentationOrderDiagnostics(entries: DocumentationDetail[]): string[] {
  const owners = new Map<string, string>();
  const diagnostics: string[] = [];
  for (const entry of entries) {
    const key = `${entry.section.title}:${entry.docOrder}`;
    const existing = owners.get(key);
    if (existing) {
      diagnostics.push(
        `${entry.sourcePath}: duplicate order ${entry.docOrder} in '${entry.section.title}' (also ${existing})`,
      );
    } else {
      owners.set(key, entry.sourcePath || entry.path);
    }
  }
  return diagnostics;
}

async function loadDocumentationFile(relativePath: string): Promise<DocumentationDetail> {
  const sourcePath = `docs/documentation/${relativePath}`;
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(await readFile(new URL(relativePath, DOCS_ROOT_URL), "utf8"));
  } catch (error) {
    throw contentError(sourcePath, "frontmatter", error);
  }

  const title = requiredString(parsed.data.title, sourcePath, "title");
  const description = requiredString(parsed.data.description, sourcePath, "description");
  const status = requiredString(parsed.data.status, sourcePath, "status");
  if (status !== PUBLIC_DOCUMENTATION_STATUS) {
    throw new DocumentationContentError(
      `${sourcePath}: invalid status '${status}'; public docs must use '${PUBLIC_DOCUMENTATION_STATUS}'`,
    );
  }

  const sectionTitle = requiredString(parsed.data.section, sourcePath, "section");
  const configuredSection = documentationSectionByTitle(sectionTitle);
  if (!configuredSection) {
    throw new DocumentationContentError(`${sourcePath}: invalid section '${sectionTitle}'`);
  }

  const sectionOrder = requiredPositiveInteger(parsed.data.sectionOrder, sourcePath, "sectionOrder");
  if (sectionOrder !== configuredSection.order) {
    throw new DocumentationContentError(
      `${sourcePath}: sectionOrder ${sectionOrder} does not match ${sectionTitle} (${configuredSection.order})`,
    );
  }

  const order = requiredPositiveInteger(parsed.data.order, sourcePath, "order");
  const route = deriveDocumentationRoute(relativePath, sourcePath);
  const rendered = renderDocumentationMarkdown(parsed.content.trimStart(), title);
  const section: DocumentationSection = {
    slug: configuredSection.slug,
    title: configuredSection.title,
    description: configuredSection.description,
    order: configuredSection.order,
    path: `/docs#${configuredSection.slug}`,
  };

  return {
    slug: route.slug,
    routeSectionSlug: route.routeSectionSlug,
    title,
    sidebarLabel: optionalString(parsed.data.sidebarLabel) || title,
    description,
    excerpt: excerptText(description, 180),
    path: route.path,
    sourcePath,
    sourceKind: "repo_sync",
    status,
    section,
    tags: normalizeTags(parsed.data.tags),
    markdownRaw: parsed.content.trimStart(),
    htmlRendered: rendered.html,
    headings: rendered.headings,
    docOrder: order,
    seoTitle: optionalString(parsed.data.seoTitle),
    seoDescription: optionalString(parsed.data.seoDescription),
  };
}

function deriveDocumentationRoute(relativePath: string, sourcePath: string) {
  const withoutExtension = relativePath.replace(/\.md$/i, "");
  const segments = withoutExtension.split("/");
  const invalidSegment = segments.find((segment) => !isSafeSlugSegment(segment) || normalizeReadableSlug(segment) !== segment);
  if (invalidSegment) {
    throw new DocumentationContentError(`${sourcePath}: non-canonical readable slug segment '${invalidSegment}'`);
  }

  return {
    slug: segments.at(-1) || "",
    routeSectionSlug: segments.length > 1 ? segments[0] : "root",
    path: `/docs/${segments.join("/")}`,
  };
}

function validateDocumentationCollection(entries: DocumentationDetail[]) {
  const routeOwners = new Map<string, string>();
  const sourcePaths = new Set(entries.map((entry) => entry.sourcePath || ""));
  for (const entry of entries) {
    const existing = routeOwners.get(entry.path);
    if (existing) {
      throw new DocumentationContentError(`${entry.sourcePath}: duplicate canonical route '${entry.path}' also used by ${existing}`);
    }
    routeOwners.set(entry.path, entry.sourcePath || entry.path);
  }

  for (const entry of entries) {
    validateInternalLinks(entry, routeOwners, sourcePaths);
  }
}

function validateInternalLinks(
  entry: DocumentationDetail,
  routes: Map<string, string>,
  sourcePaths: Set<string>,
) {
  const withoutCode = entry.markdownRaw.replace(/```[\s\S]*?```/g, "");
  for (const match of withoutCode.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const href = String(match[1] || "");
    if (href.startsWith("/docs/")) {
      const route = href.split(/[?#]/, 1)[0].replace(/\/$/, "");
      if (!routes.has(route)) {
        throw new DocumentationContentError(`${entry.sourcePath}: broken internal link '${href}'`);
      }
      continue;
    }

    if (href.endsWith(".md") || href.includes(".md#")) {
      const relativeTarget = href.split("#", 1)[0];
      const sourceRelative = String(entry.sourcePath || "").replace(/^docs\/documentation\//, "");
      const target = posix.normalize(posix.join(dirname(sourceRelative), relativeTarget));
      if (!sourcePaths.has(`docs/documentation/${target}`)) {
        throw new DocumentationContentError(`${entry.sourcePath}: broken relative documentation link '${href}'`);
      }
    }
  }
}

async function listMarkdownFiles(root: URL, prefix = ""): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(new URL(`${entry.name}/`, root), relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath);
    }
  }
  return files;
}

function requiredString(value: unknown, file: string, field: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new DocumentationContentError(`${file}: missing required field '${field}'`);
  return normalized;
}

function requiredPositiveInteger(value: unknown, file: string, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new DocumentationContentError(`${file}: field '${field}' must be a positive integer`);
  }
  return Number(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTags(value: unknown): DocumentationTag[] {
  if (value !== undefined && !Array.isArray(value)) {
    throw new DocumentationContentError("Documentation tags must be an array");
  }
  return [...new Set((value || []).map((tag: unknown) => String(tag || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .map((tag) => ({ slug: tag, title: tag.replaceAll("-", " "), color: null, order: null }));
}

function isSafeSlugSegment(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value !== "." && value !== "..";
}

function contentError(file: string, field: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return new DocumentationContentError(`${file}: malformed ${field}: ${message}`);
}
