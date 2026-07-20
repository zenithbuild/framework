export interface PublicDocumentationSection {
  title: string;
  slug: string;
  order: number;
  description: string;
}

export const PUBLIC_DOCUMENTATION_ROOT: string;
export const PUBLIC_DOCUMENTATION_MATCH: Readonly<{ include: string; exclude: string }>;
export const PUBLIC_DOCUMENTATION_STATUS: string;
export const PUBLIC_DOCUMENTATION_SECTIONS: readonly PublicDocumentationSection[];
export function isPublicDocumentationPath(relativePath: string): boolean;
export function documentationSectionByTitle(title: string): PublicDocumentationSection | null;
