import {
  loadDocumentationDetailFromLookup,
  loadDocumentationIndexSource,
  type DocumentationSectionGroup,
} from "./documentationSource";

function normalizedSectionOrder(section: DocumentationSectionGroup["section"]): number {
  if (Number.isInteger(section.order) && Number(section.order) < Number.MAX_SAFE_INTEGER) {
    return Number(section.order);
  }

  if (section.slug === "root") {
    return 0;
  }

  return Number.MAX_SAFE_INTEGER;
}

function normalizedEntryOrder(entry: DocumentationSectionGroup["entries"][number]): number {
  if (Number.isInteger(entry.docOrder) && Number(entry.docOrder) < Number.MAX_SAFE_INTEGER) {
    return Number(entry.docOrder);
  }

  return Number.MAX_SAFE_INTEGER;
}

export function orderDocumentationSectionGroups(
  groups: DocumentationSectionGroup[],
): DocumentationSectionGroup[] {
  return [...groups]
    .map((group) => ({
      section: group.section,
      entries: [...group.entries].sort((left, right) => {
        const leftOrder = normalizedEntryOrder(left);
        const rightOrder = normalizedEntryOrder(right);
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        const titleOrder = left.title.localeCompare(right.title);
        if (titleOrder !== 0) {
          return titleOrder;
        }

        return left.path.localeCompare(right.path);
      }),
    }))
    .sort((left, right) => {
      const leftOrder = normalizedSectionOrder(left.section);
      const rightOrder = normalizedSectionOrder(right.section);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const titleOrder = left.section.title.localeCompare(right.section.title);
      if (titleOrder !== 0) {
        return titleOrder;
      }

      return left.section.slug.localeCompare(right.section.slug);
    });
}

export async function loadDocumentationLandingSource() {
  const indexSource = await loadDocumentationIndexSource();

  return {
    sourceMode: indexSource.sourceMode,
    sections: orderDocumentationSectionGroups(indexSource.sections),
  };
}

export async function loadDocumentationPageSource(lookup: string | { slug: string; sectionSlug?: string | null }) {
  const detailSource = await loadDocumentationDetailFromLookup(lookup);
  const landingSource = await loadDocumentationLandingSource();

  return {
    document: detailSource.document,
    sourceMode: detailSource.sourceMode,
    sections: landingSource.sections,
  };
}
