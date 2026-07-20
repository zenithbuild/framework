export function gql(strings, ...args) {
  let str = "";
  strings.forEach((string, i) => {
    str += string + (args[i] || "");
  });
  return str;
}
export const DocsPartsFragmentDoc = gql`
    fragment DocsParts on Docs {
  __typename
  title
  description
  section
  sectionOrder
  order
  sidebarLabel
  status
  last_updated
  version
  tags
  seoTitle
  seoDescription
  body
}
    `;
export const BlogPartsFragmentDoc = gql`
    fragment BlogParts on Blog {
  __typename
  title
  description
  published
  publishedAt
  updatedAt
  author {
    ... on People {
      __typename
      name
      profileUrl
      avatar {
        __typename
        src
        width
        height
        alt
        focalPosition
      }
      member
      contributor
      active
      sortOrder
    }
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
  }
  category
  tags
  featured
  featuredImage {
    __typename
    src
    width
    height
    alt
    focalPosition
  }
  seoTitle
  seoDescription
  canonicalPath
  relatedSlugs
  body
}
    `;
export const AboutPartsFragmentDoc = gql`
    fragment AboutParts on About {
  __typename
  pageTitle
  description
  seoTitle
  seoDescription
  sections {
    __typename
    hero {
      __typename
      eyebrow
      title
      description
      actions {
        __typename
        label
        href
        variant
      }
    }
    why {
      __typename
      eyebrow
      title
      description
      items {
        __typename
        number
        title
        description
      }
    }
    principles {
      __typename
      eyebrow
      title
      description
      items {
        __typename
        number
        title
        description
      }
    }
    built {
      __typename
      eyebrow
      title
      description
      parts {
        __typename
        name
        description
      }
    }
    ecosystem {
      __typename
      eyebrow
      title
      description
      items {
        __typename
        name
        description
      }
    }
    builder {
      __typename
      eyebrow
      title
      text
      signature
      role
    }
    cta {
      __typename
      eyebrow
      title
      text
      actions {
        __typename
        label
        href
        variant
      }
    }
  }
}
    `;
export const SponsorsPartsFragmentDoc = gql`
    fragment SponsorsParts on Sponsors {
  __typename
  kind
  name
  url
  logo {
    __typename
    src
    width
    height
    alt
    focalPosition
  }
  title
  description
  recognitionText
  ctaLabel
  ctaUrl
  supportingStatements
  active
  featured
  startsAt
  endsAt
}
    `;
export const PeoplePartsFragmentDoc = gql`
    fragment PeopleParts on People {
  __typename
  name
  profileUrl
  avatar {
    __typename
    src
    width
    height
    alt
    focalPosition
  }
  member
  contributor
  active
  sortOrder
}
    `;
export const SiteSettingsPartsFragmentDoc = gql`
    fragment SiteSettingsParts on SiteSettings {
  __typename
  defaultSeoTitle
  defaultSeoDescription
  siteUrl
  socialImage {
    __typename
    src
    width
    height
    alt
  }
  socialLinks {
    __typename
    label
    url
  }
  contactUrl
}
    `;
export const DocsDocument = gql`
    query docs($relativePath: String!) {
  docs(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...DocsParts
  }
}
    ${DocsPartsFragmentDoc}`;
export const DocsConnectionDocument = gql`
    query docsConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: DocsFilter) {
  docsConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            hasReferences
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...DocsParts
      }
    }
  }
}
    ${DocsPartsFragmentDoc}`;
export const BlogDocument = gql`
    query blog($relativePath: String!) {
  blog(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...BlogParts
  }
}
    ${BlogPartsFragmentDoc}`;
export const BlogConnectionDocument = gql`
    query blogConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: BlogFilter) {
  blogConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            hasReferences
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...BlogParts
      }
    }
  }
}
    ${BlogPartsFragmentDoc}`;
export const AboutDocument = gql`
    query about($relativePath: String!) {
  about(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...AboutParts
  }
}
    ${AboutPartsFragmentDoc}`;
export const AboutConnectionDocument = gql`
    query aboutConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: AboutFilter) {
  aboutConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            hasReferences
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...AboutParts
      }
    }
  }
}
    ${AboutPartsFragmentDoc}`;
export const SponsorsDocument = gql`
    query sponsors($relativePath: String!) {
  sponsors(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...SponsorsParts
  }
}
    ${SponsorsPartsFragmentDoc}`;
export const SponsorsConnectionDocument = gql`
    query sponsorsConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: SponsorsFilter) {
  sponsorsConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            hasReferences
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...SponsorsParts
      }
    }
  }
}
    ${SponsorsPartsFragmentDoc}`;
export const PeopleDocument = gql`
    query people($relativePath: String!) {
  people(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...PeopleParts
  }
}
    ${PeoplePartsFragmentDoc}`;
export const PeopleConnectionDocument = gql`
    query peopleConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: PeopleFilter) {
  peopleConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            hasReferences
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...PeopleParts
      }
    }
  }
}
    ${PeoplePartsFragmentDoc}`;
export const SiteSettingsDocument = gql`
    query siteSettings($relativePath: String!) {
  siteSettings(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...SiteSettingsParts
  }
}
    ${SiteSettingsPartsFragmentDoc}`;
export const SiteSettingsConnectionDocument = gql`
    query siteSettingsConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: SiteSettingsFilter) {
  siteSettingsConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            hasReferences
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...SiteSettingsParts
      }
    }
  }
}
    ${SiteSettingsPartsFragmentDoc}`;
export function getSdk(requester) {
  return {
    docs(variables, options) {
      return requester(DocsDocument, variables, options);
    },
    docsConnection(variables, options) {
      return requester(DocsConnectionDocument, variables, options);
    },
    blog(variables, options) {
      return requester(BlogDocument, variables, options);
    },
    blogConnection(variables, options) {
      return requester(BlogConnectionDocument, variables, options);
    },
    about(variables, options) {
      return requester(AboutDocument, variables, options);
    },
    aboutConnection(variables, options) {
      return requester(AboutConnectionDocument, variables, options);
    },
    sponsors(variables, options) {
      return requester(SponsorsDocument, variables, options);
    },
    sponsorsConnection(variables, options) {
      return requester(SponsorsConnectionDocument, variables, options);
    },
    people(variables, options) {
      return requester(PeopleDocument, variables, options);
    },
    peopleConnection(variables, options) {
      return requester(PeopleConnectionDocument, variables, options);
    },
    siteSettings(variables, options) {
      return requester(SiteSettingsDocument, variables, options);
    },
    siteSettingsConnection(variables, options) {
      return requester(SiteSettingsConnectionDocument, variables, options);
    }
  };
}
import { createClient } from "tinacms/dist/client";
const generateRequester = (client) => {
  const requester = async (doc, vars, options) => {
    let url = client.apiUrl;
    if (options?.branch) {
      const index = client.apiUrl.lastIndexOf("/");
      url = client.apiUrl.substring(0, index + 1) + options.branch;
    }
    const data = await client.request({
      query: doc,
      variables: vars,
      url
    }, options);
    return { data: data?.data, errors: data?.errors, query: doc, variables: vars || {} };
  };
  return requester;
};
export const ExperimentalGetTinaClient = () => getSdk(
  generateRequester(
    createClient({
      url: "http://localhost:4001/graphql",
      queries
    })
  )
);
export const queries = (client) => {
  const requester = generateRequester(client);
  return getSdk(requester);
};
