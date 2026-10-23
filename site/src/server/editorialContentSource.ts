import { readdir, readFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import type { EditorialContentSource, PersonProfile, SponsorshipContent } from "../content/models";
import { cleanContentText, normalizePerson, normalizeSiteSettings, normalizeSponsor, safePublicUrl } from "./contentValidation";

const PEOPLE_DIRECTORY = new URL("../content/people/", import.meta.url);
const SPONSORS_DIRECTORY = new URL("../content/sponsors/", import.meta.url);
const SETTINGS_FILE = new URL("../content/site/settings.json", import.meta.url);
const ABOUT_FILE = new URL("../content/pages/about.json", import.meta.url);

const fallbackSponsorship: SponsorshipContent = {
  mode: "invitation",
  title: "Become Zenith’s first sponsor.",
  description: "Zenith is built publicly and independently. Sponsorship gives sustained time to the compiler, runtime, documentation, tooling, and the ecosystem work that connects them.",
  recognitionText: "A prominent place on the Zenith front page, paired with sustained work on the framework’s public foundation.",
  ctaLabel: "Sponsor Zenith",
  ctaUrl: "https://github.com/sponsors/zenithbuild",
  supportingStatements: [],
};

async function readJson(file: URL): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readJsonDirectory(directory: URL): Promise<Array<{ filename: string; value: unknown }>> {
  const filenames = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(filenames.map(async (filename) => ({ filename, value: await readJson(new URL(filename, directory)) })));
}

function normalizeInvitation(value: unknown): SponsorshipContent | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.kind !== "invitation") return null;
  const title = cleanContentText(input.title);
  const description = cleanContentText(input.description);
  const recognitionText = cleanContentText(input.recognitionText);
  const ctaLabel = cleanContentText(input.ctaLabel);
  const ctaUrl = safePublicUrl(input.ctaUrl, true);
  if (!title || !description || !recognitionText || !ctaLabel || !ctaUrl) return null;
  return {
    mode: "invitation",
    title,
    description,
    recognitionText,
    ctaLabel,
    ctaUrl,
    supportingStatements: Array.isArray(input.supportingStatements)
      ? input.supportingStatements.map(cleanContentText).filter(Boolean)
      : [],
  };
}

export async function loadPeopleContent(): Promise<{ people: PersonProfile[]; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  const records = await readJsonDirectory(PEOPLE_DIRECTORY);
  const seen = new Set<string>();
  const people = records.flatMap(({ filename, value }) => {
    try {
      const person = normalizePerson(value);
      const key = person.profileUrl.toLowerCase();
      if (!person.active || seen.has(key)) {
        if (seen.has(key)) diagnostics.push(`Duplicate person omitted: ${filename}`);
        return [];
      }
      seen.add(key);
      return [person];
    } catch (error) {
      diagnostics.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  });
  people.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  return { people, diagnostics };
}

export async function loadSponsorshipContent(now = new Date()): Promise<{ sponsorship: SponsorshipContent; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  const records = await readJsonDirectory(SPONSORS_DIRECTORY);
  const invitation = records.map((record) => normalizeInvitation(record.value)).find(Boolean) || fallbackSponsorship;
  const sponsors = records.map((record) => normalizeSponsor(record.value, now)).filter(Boolean);
  const sponsor = sponsors.sort((left, right) => Number(right.featured) - Number(left.featured) || left.name.localeCompare(right.name))[0];
  if (!sponsor) return { sponsorship: invitation, diagnostics };
  return {
    sponsorship: {
      ...invitation,
      mode: "sponsor",
      title: `Supported by ${sponsor.name}.`,
      description: sponsor.recognitionText,
      recognitionText: sponsor.recognitionText,
      ctaLabel: "Visit sponsor",
      ctaUrl: sponsor.url,
      sponsor,
    },
    diagnostics,
  };
}

export async function loadEditorialContentSource(): Promise<EditorialContentSource> {
  const [peopleResult, sponsorshipResult, settingsValue] = await Promise.all([
    loadPeopleContent().catch((error) => ({ people: [], diagnostics: [String(error)] })),
    loadSponsorshipContent().catch((error) => ({ sponsorship: fallbackSponsorship, diagnostics: [String(error)] })),
    readJson(SETTINGS_FILE).catch(() => ({})),
  ]);
  return {
    people: peopleResult.people,
    sponsorship: sponsorshipResult.sponsorship,
    settings: normalizeSiteSettings(settingsValue),
    diagnostics: [...peopleResult.diagnostics, ...sponsorshipResult.diagnostics],
  };
}

export function loadEditorialContentSnapshot(now = new Date()): EditorialContentSource {
  const diagnostics: string[] = [];
  const peopleRecords = readdirSync(PEOPLE_DIRECTORY)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((filename) => ({ filename, value: JSON.parse(readFileSync(new URL(filename, PEOPLE_DIRECTORY), "utf8")) }));
  const seen = new Set<string>();
  const people = peopleRecords.flatMap(({ filename, value }) => {
    try {
      const person = normalizePerson(value);
      const key = person.profileUrl.toLowerCase();
      if (!person.active || seen.has(key)) {
        if (seen.has(key)) diagnostics.push(`Duplicate person omitted: ${filename}`);
        return [];
      }
      seen.add(key);
      return [person];
    } catch (error) {
      diagnostics.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));

  const sponsorRecords = readdirSync(SPONSORS_DIRECTORY)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((filename) => JSON.parse(readFileSync(new URL(filename, SPONSORS_DIRECTORY), "utf8")));
  const invitation = sponsorRecords.map(normalizeInvitation).find(Boolean) || fallbackSponsorship;
  const sponsor = sponsorRecords.map((record) => normalizeSponsor(record, now)).filter(Boolean)
    .sort((left, right) => Number(right.featured) - Number(left.featured) || left.name.localeCompare(right.name))[0];
  const sponsorship: SponsorshipContent = sponsor ? {
    ...invitation,
    mode: "sponsor",
    title: `Supported by ${sponsor.name}.`,
    description: sponsor.recognitionText,
    recognitionText: sponsor.recognitionText,
    ctaLabel: "Visit sponsor",
    ctaUrl: sponsor.url,
    sponsor,
  } : invitation;
  const settings = normalizeSiteSettings(JSON.parse(readFileSync(SETTINGS_FILE, "utf8")));
  return { people, sponsorship, settings, diagnostics };
}

export async function loadAboutContent<T>(fallback: T): Promise<T> {
  try {
    const value = await readJson(ABOUT_FILE);
    if (!value || typeof value !== "object") return fallback;
    const record = value as Record<string, unknown>;
    return cleanContentText(record.pageTitle) && cleanContentText(record.description) ? value as T : fallback;
  } catch {
    return fallback;
  }
}
