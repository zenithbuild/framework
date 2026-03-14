import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const contentRoot = path.dirname(fileURLToPath(import.meta.url));
const trainVersionPath = path.resolve(contentRoot, "../../..", "TRAIN_VERSION");

function readJson<T>(relativePath: string): T {
  const filePath = path.join(contentRoot, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

const pageIndex = readJson("./pages/index.json");
const pageDocs = readJson("./pages/docs.json");
const pageBlog = readJson("./pages/blog.json");
const pageAbout = readJson("./pages/about.json");
const trainVersion = fs.readFileSync(trainVersionPath, "utf-8").trim();

const siteHero = readJson("./site/hero.json");
const siteNavigation = readJson("./site/navigation.json");
const siteFooter = readJson("./site/footer.json");

const compilerPipeline = readJson("./sections/compiler-pipeline.json");
const determinismConsole = readJson("./sections/determinism-console.json");
const reactivityModel = readJson("./sections/reactivity-model.json");
const runtimePrinciples = readJson("./sections/runtime-principles.json");
const ecosystemOrbit = readJson("./sections/ecosystem-orbit.json");
const gettingStarted = readJson("./sections/getting-started.json");
const contractSection = readJson("./sections/contract-section.json");

export const pageContent = {
  index: pageIndex,
  docs: pageDocs,
  blog: pageBlog,
  about: pageAbout,
} as const;

export const siteContent = {
  hero: siteHero,
  navigation: siteNavigation,
  footer: siteFooter,
} as const;

export const repoContent = {
  trainVersion,
} as const;

export const sectionContent = {
  compilerPipeline,
  determinismConsole,
  reactivityModel,
  runtimePrinciples,
  ecosystemOrbit,
  gettingStarted,
  contractSection,
} as const;
