import { createClient } from "@sanity/client";

const projectId = process.env.SANITY_PROJECT_ID || "";
const dataset = process.env.SANITY_DATASET || "production";
const apiVersion = process.env.SANITY_API_VERSION || "2024-01-01";

let cachedClient: ReturnType<typeof createClient> | null | undefined;

export function getSanityClient() {
    if (cachedClient !== undefined) {
        return cachedClient;
    }

    if (!projectId) {
        cachedClient = null;
        return cachedClient;
    }

    cachedClient = createClient({
        projectId,
        dataset,
        apiVersion,
        useCdn: true,
    });
    return cachedClient;
}
