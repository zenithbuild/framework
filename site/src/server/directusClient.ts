type DirectusScalar = string | number | boolean;

interface DirectusAuthResponse {
  data: {
    access_token: string;
  };
}

interface DirectusItemsResponse<T> {
  data: T[];
}

export interface DirectusItemsQueryOptions {
  fields?: string[];
  sort?: string[];
  limit?: number;
  query?: Record<string, DirectusScalar | DirectusScalar[] | null | undefined>;
}

export interface DirectusServerClient {
  baseUrl: string;
  queryItems<T>(collection: string, options?: DirectusItemsQueryOptions): Promise<T[]>;
}

export async function createDirectusServerClient(): Promise<DirectusServerClient> {
  assertServerOnly();

  const baseUrl = resolveDirectusBaseUrl();
  const token = await resolveDirectusReadToken(baseUrl);

  return {
    baseUrl,
    async queryItems<T>(collection: string, options: DirectusItemsQueryOptions = {}) {
      const query = new URLSearchParams();

      if (Number.isInteger(options.limit)) {
        query.set("limit", String(options.limit));
      }

      for (const field of options.fields || []) {
        query.append("fields[]", field);
      }

      for (const sortKey of options.sort || []) {
        query.append("sort[]", sortKey);
      }

      for (const [key, rawValue] of Object.entries(options.query || {})) {
        appendQueryValue(query, key, rawValue);
      }

      const response = await fetch(`${baseUrl}/items/${encodeURIComponent(collection)}?${query.toString()}`, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

      if (!response.ok) {
        throw await createDirectusRequestError(collection, response, "query failed");
      }

      const payload = (await response.json()) as DirectusItemsResponse<T>;
      return payload.data || [];
    },
  };
}

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Directus server client must not run in browser bundles.");
  }
}

function resolveDirectusBaseUrl(): string {
  return (process.env.ZENITH_DIRECTUS_URL || "http://localhost:8055").replace(/\/$/, "");
}

async function resolveDirectusReadToken(baseUrl: string): Promise<string | null> {
  const staticToken = (process.env.ZENITH_DIRECTUS_TOKEN || "").trim();
  if (staticToken) {
    return staticToken;
  }

  const email = (process.env.ZENITH_DIRECTUS_EMAIL || "").trim();
  const password = (process.env.ZENITH_DIRECTUS_PASSWORD || "").trim();

  if (!email || !password) {
    return null;
  }

  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw await createDirectusRequestError("auth", response, "login failed");
  }

  const payload = (await response.json()) as DirectusAuthResponse;
  return payload.data.access_token;
}

async function createDirectusRequestError(
  scope: string,
  response: Response,
  action: string,
): Promise<Error> {
  const payload = compactDirectusErrorPayload(await response.text());
  const status = `${response.status} ${response.statusText}`.trim();
  return new Error(`[Directus:${scope}] ${action} (${status}): ${payload}`);
}

function appendQueryValue(
  query: URLSearchParams,
  key: string,
  rawValue: DirectusScalar | DirectusScalar[] | null | undefined,
) {
  if (rawValue === null || rawValue === undefined) {
    return;
  }

  if (Array.isArray(rawValue)) {
    for (const value of rawValue) {
      query.append(key, String(value));
    }
    return;
  }

  query.append(key, String(rawValue));
}

function compactDirectusErrorPayload(payload: string): string {
  const text = String(payload || "").replace(/\s+/g, " ").trim();
  return text.length > 240 ? `${text.slice(0, 237)}...` : text || "empty response";
}
