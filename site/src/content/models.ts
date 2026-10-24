export interface SiteImage {
  src: string;
  width: number;
  height: number;
  alt: string;
  focalPosition?: string;
}

export interface PersonProfile {
  name: string;
  profileUrl: string;
  avatar?: SiteImage;
  member: boolean;
  contributor: boolean;
  active: boolean;
  sortOrder: number;
}

export interface SponsorProfile {
  name: string;
  url: string;
  logo?: SiteImage;
  recognitionText: string;
  featured: boolean;
  startsAt?: string;
  endsAt?: string;
}

export interface SponsorshipContent {
  mode: "invitation" | "sponsor";
  title: string;
  description: string;
  recognitionText: string;
  ctaLabel: string;
  ctaUrl: string;
  supportingStatements: string[];
  sponsor?: SponsorProfile;
}

export interface SiteSettings {
  defaultSeoTitle: string;
  defaultSeoDescription: string;
  siteUrl: string;
  socialImage?: SiteImage;
  socialLinks: Array<{ label: string; url: string }>;
  contactUrl?: string;
}

export interface EditorialContentSource {
  people: PersonProfile[];
  sponsorship: SponsorshipContent;
  settings: SiteSettings;
  diagnostics: string[];
}
