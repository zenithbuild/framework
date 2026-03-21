import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SHARED_TEMPLATE_SELECTOR = '[data-benchmark-copy="lead"]';
const SHARED_VISIBLE_COUNT_SELECTOR = "[data-visible-count]";
const SHARED_ACTIVE_BUTTON_SELECTOR = '[data-category-button][data-category="runtime"]';
const SHARED_ALL_BUTTON_SELECTOR = '[data-category-button][data-category="all"]';

const caseDefinitions = {
  "static-marketing": {
    leadText: {
      zenith: "Static marketing benchmark fixture for Zenith.",
      astro: "Static marketing benchmark fixture for Astro.",
      "next-app-router": "Static marketing benchmark fixture for Next App Router.",
      nuxt: "Static marketing benchmark fixture for Nuxt.",
    },
    pagePath: {
      zenith: "src/pages/index.zen",
      astro: "src/pages/index.astro",
      "next-app-router": "app/page.js",
      nuxt: "pages/index.vue",
    },
    stylePath: {
      zenith: "src/styles/global.css",
      astro: "src/styles/global.css",
      "next-app-router": "app/globals.css",
      nuxt: "assets/css/main.css",
    },
    styleFind: "padding: 2rem 0 3rem;",
    styleReplace: "padding: 2.25rem 0 3rem;",
  },
  "content-index": {
    leadText: {
      zenith: "Content index benchmark fixture for Zenith.",
      astro: "Content index benchmark fixture for Astro.",
      "next-app-router": "Content index benchmark fixture for Next App Router.",
      nuxt: "Content index benchmark fixture for Nuxt.",
    },
    pagePath: {
      zenith: "src/pages/index.zen",
      astro: "src/pages/index.astro",
      "next-app-router": "app/page.js",
      nuxt: "pages/index.vue",
    },
    stylePath: {
      zenith: "src/styles/global.css",
      astro: "src/styles/global.css",
      "next-app-router": "app/globals.css",
      nuxt: "assets/css/main.css",
    },
    styleFind: "padding: 2rem 0 3rem;",
    styleReplace: "padding: 2.25rem 0 3rem;",
  },
  "interactive-filter": {
    leadText: {
      zenith: "Interactive filter benchmark fixture for Zenith.",
      astro: "Interactive filter benchmark fixture for Astro.",
      "next-app-router": "Interactive filter benchmark fixture for Next App Router.",
      nuxt: "Interactive filter benchmark fixture for Nuxt.",
    },
    pagePath: {
      zenith: "src/pages/index.zen",
      astro: "src/pages/index.astro",
      "next-app-router": "app/page.js",
      nuxt: "pages/index.vue",
    },
    stylePath: {
      zenith: "src/styles/global.css",
      astro: "src/styles/global.css",
      "next-app-router": "app/globals.css",
      nuxt: "assets/css/main.css",
    },
    styleFind: "font-weight: 700;",
    styleReplace: "font-weight: 650;",
    logicPath: {
      zenith: "src/pages/index.zen",
      astro: "src/pages/index.astro",
      "next-app-router": "app/InteractiveFilter.js",
      nuxt: "pages/index.vue",
    },
    logicFind: {
      zenith: 'state activeCategory = "all";',
      astro: 'let activeCategory = "all";',
      "next-app-router": 'const [activeCategory, setActiveCategory] = useState("all");',
      nuxt: 'const activeCategory = ref("all");',
    },
    logicReplace: {
      zenith: 'state activeCategory = "runtime";',
      astro: 'let activeCategory = "runtime";',
      "next-app-router": 'const [activeCategory, setActiveCategory] = useState("runtime");',
      nuxt: 'const activeCategory = ref("runtime");',
    },
  },
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function countOccurrences(source, needle) {
  if (!needle) {
    return 0;
  }
  return source.split(needle).length - 1;
}

function templateProbe() {
  return {
    mutate: [
      {
        kind: "text",
        selector: SHARED_TEMPLATE_SELECTOR,
        includes: "Mutation path validates rebuild detection.",
      },
    ],
    restore: [
      {
        kind: "text",
        selector: SHARED_TEMPLATE_SELECTOR,
        notIncludes: "Mutation path validates rebuild detection.",
      },
    ],
  };
}

function styleProbe(caseId) {
  if (caseId === "interactive-filter") {
    return {
      mutate: [
        {
          kind: "style",
          selector: '[data-category-button][aria-pressed="true"]',
          property: "fontWeight",
          equals: "650",
        },
      ],
      restore: [
        {
          kind: "style",
          selector: '[data-category-button][aria-pressed="true"]',
          property: "fontWeight",
          equals: "700",
        },
      ],
    };
  }

  return {
    mutate: [
      {
        kind: "style",
        selector: ".site-main",
        property: "paddingTop",
        equals: "36px",
      },
    ],
    restore: [
      {
        kind: "style",
        selector: ".site-main",
        property: "paddingTop",
        equals: "32px",
      },
    ],
  };
}

function interactiveLogicProbe() {
  return {
    mutate: [
      {
        kind: "text",
        selector: SHARED_VISIBLE_COUNT_SELECTOR,
        equals: "2",
      },
      {
        kind: "attribute",
        selector: SHARED_ACTIVE_BUTTON_SELECTOR,
        name: "aria-pressed",
        equals: "true",
      },
    ],
    restore: [
      {
        kind: "text",
        selector: SHARED_VISIBLE_COUNT_SELECTOR,
        equals: "6",
      },
      {
        kind: "attribute",
        selector: SHARED_ALL_BUTTON_SELECTOR,
        name: "aria-pressed",
        equals: "true",
      },
    ],
  };
}

function definitionsForCase(caseId, frameworkId) {
  const config = caseDefinitions[caseId];
  if (!config) {
    throw new Error(`No mutation definitions registered for benchmark case "${caseId}"`);
  }

  const pagePath = config.pagePath[frameworkId];
  const stylePath = config.stylePath[frameworkId];
  const leadText = config.leadText[frameworkId];

  if (!pagePath || !stylePath || !leadText) {
    throw new Error(`Missing ${caseId} mutation metadata for framework "${frameworkId}"`);
  }

  const definitions = [
    {
      id: "template-text",
      label: "Template text edit",
      targetRelativePath: pagePath,
      find: leadText,
      replace: `${leadText} Mutation path validates rebuild detection.`,
      browserProbe: templateProbe(),
    },
    {
      id: "style",
      label: "Style edit",
      targetRelativePath: stylePath,
      find: config.styleFind,
      replace: config.styleReplace,
      browserProbe: styleProbe(caseId),
    },
  ];

  if (caseId === "interactive-filter") {
    definitions.push({
      id: "interactive-logic",
      label: "Interactive logic edit",
      targetRelativePath: config.logicPath[frameworkId],
      find: config.logicFind[frameworkId],
      replace: config.logicReplace[frameworkId],
      browserProbe: interactiveLogicProbe(),
    });
  }

  return definitions;
}

export async function prepareCaseMutations(caseId, frameworkId, fixtureDir) {
  const definitions = definitionsForCase(caseId, frameworkId);

  return await Promise.all(definitions.map(async (definition) => {
    const targetPath = join(fixtureDir, definition.targetRelativePath);
    const originalContent = await readFile(targetPath, "utf8");
    const matchCount = countOccurrences(originalContent, definition.find);

    if (matchCount !== 1) {
      throw new Error(
        `Expected exactly one mutation anchor for ${frameworkId}/${caseId}/${definition.id} in ${targetPath}, found ${matchCount}`,
      );
    }

    return {
      ...definition,
      caseId,
      frameworkId,
      targetPath,
      originalContent,
      originalSha256: sha256(originalContent),
    };
  }));
}

export async function applyPreparedMutation(mutation, sampleLabel) {
  const currentContent = await readFile(mutation.targetPath, "utf8");
  const currentSha256 = sha256(currentContent);

  if (currentSha256 !== mutation.originalSha256) {
    throw new Error(`Mutation target was not restored before ${sampleLabel}: ${mutation.targetPath}`);
  }

  const matchCount = countOccurrences(currentContent, mutation.find);
  if (matchCount !== 1) {
    throw new Error(
      `Mutation anchor drifted before ${sampleLabel}: ${mutation.targetPath} expected 1 match, found ${matchCount}`,
    );
  }

  const mutatedContent = currentContent.replace(mutation.find, mutation.replace);
  if (mutatedContent === currentContent) {
    throw new Error(`Mutation did not change content for ${mutation.targetPath}`);
  }

  await writeFile(mutation.targetPath, mutatedContent, "utf8");
  const writtenContent = await readFile(mutation.targetPath, "utf8");
  const mutatedSha256 = sha256(writtenContent);

  return {
    mutationId: mutation.id,
    label: mutation.label,
    sampleLabel,
    targetPath: mutation.targetPath,
    targetRelativePath: mutation.targetRelativePath,
    originalSha256: mutation.originalSha256,
    mutatedSha256,
    replacementPreview: mutation.replace,
    browserProbe: mutation.browserProbe,
  };
}

export async function restorePreparedMutation(mutation) {
  await writeFile(mutation.targetPath, mutation.originalContent, "utf8");
  const restoredContent = await readFile(mutation.targetPath, "utf8");
  const restoredSha256 = sha256(restoredContent);

  return {
    mutationId: mutation.id,
    targetPath: mutation.targetPath,
    targetRelativePath: mutation.targetRelativePath,
    expectedSha256: mutation.originalSha256,
    restoredSha256,
    contentMatchesOriginal: restoredSha256 === mutation.originalSha256,
  };
}
