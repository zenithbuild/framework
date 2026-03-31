import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./schemas";

export default defineConfig({
    name: "zenith-marketing",
    title: "Zenith Marketing",
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || "",
    dataset: process.env.SANITY_STUDIO_DATASET || "production",
    plugins: [structureTool(), visionTool()],
    schema: {
        types: schemaTypes,
    },
});
