export function excerptFieldSpec() {
  return {
    field: "excerpt",
    type: "text",
    meta: {
      interface: "input-multiline",
      group: "meta_content",
      sort: 9,
      width: "full",
      note: "Short editorial excerpt used in the public blog index and cards.",
    },
    schema: {
      data_type: "text",
      is_nullable: true,
    },
  };
}

export function authorNameFieldSpec() {
  return {
    field: "author_name",
    type: "string",
    meta: {
      interface: "input",
      group: "meta_content",
      sort: 10,
      width: "half",
      note: "Public-facing byline used by the site when a Directus user relation is not the intended author label.",
    },
    schema: {
      data_type: "character varying",
      max_length: 255,
      is_nullable: true,
    },
  };
}

export function authorRoleFieldSpec() {
  return {
    field: "author_role",
    type: "string",
    meta: {
      interface: "input",
      group: "meta_content",
      sort: 11,
      width: "half",
      note: "Short role or editorial lane shown under the public byline.",
    },
    schema: {
      data_type: "character varying",
      max_length: 255,
      is_nullable: true,
    },
  };
}

export function authorHrefFieldSpec() {
  return {
    field: "author_href",
    type: "string",
    meta: {
      interface: "input",
      group: "meta_content",
      sort: 12,
      width: "full",
      note: "Optional public profile URL for the post byline.",
    },
    schema: {
      data_type: "character varying",
      max_length: 255,
      is_nullable: true,
    },
  };
}

export function resolveCategorySlug(post) {
  if (post.slug === "release-0-6-18") {
    return "releases";
  }

  return "engineering";
}

export const LEGACY_SAMPLE_POST_SLUGS = [
  "benefits-of-headless-cms",
  "how-to-become-a-very-productive-rabbit",
  "pirates-guide-productivity-tools-mac",
  "rabbit-facts-that-will-blow-your-mind",
  "rabbit-grooming-essential-tips",
  "why-steampunk-rabbits-are-the-future-of-work",
];
