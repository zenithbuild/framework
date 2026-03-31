export const SITE_SETTINGS_QUERY = `*[_type == "siteSettings"][0]{
  title,
  description
}`;

export const HERO_QUERY = `*[_type == "hero"][0]{
  eyebrow,
  headline,
  subline,
  ctaPrimaryLabel,
  ctaPrimaryHref,
  ctaSecondaryLabel,
  ctaSecondaryHref
}`;

export const TRUST_STRIP_QUERY = `*[_type == "trustStrip"][0]{
  label,
  logos[]{
    name,
    svgMarkup
  }
}`;

export const VALUE_PROP_QUERY = `*[_type == "featureSection"][0]{
  eyebrow,
  headline,
  body,
  features[]{
    title,
    description,
    icon
  }
}`;

export const DIFFERENTIATORS_QUERY = `*[_type == "differentiator"][0]{
  eyebrow,
  headline,
  items[]{
    number,
    title,
    description
  }
}`;

export const CODE_SHOWCASE_QUERY = `*[_type == "codeShowcase"][0]{
  eyebrow,
  headline,
  body,
  tabs[]{
    label,
    language,
    code
  }
}`;

export const EDITORIAL_QUERY = `*[_type == "editorialSection"][0]{
  eyebrow,
  headline,
  body,
  secondaryHeadline,
  secondaryBody
}`;

export const PERFORMANCE_QUERY = `*[_type == "statsSection"][0]{
  eyebrow,
  headline,
  body,
  stats[]{
    value,
    label,
    description
  }
}`;

export const CTA_QUERY = `*[_type == "ctaSection"][0]{
  headline,
  subline,
  ctaPrimaryLabel,
  ctaPrimaryHref,
  ctaSecondaryLabel,
  ctaSecondaryHref
}`;
