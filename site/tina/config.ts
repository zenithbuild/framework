import { defineConfig } from "tinacms";
import { aboutCollection } from "./collections/about";
import { blogCollection } from "./collections/blog";
import { docsCollection } from "./collections/docs";
import { peopleCollection } from "./collections/people";
import { settingsCollection } from "./collections/settings";
import { sponsorsCollection } from "./collections/sponsors";

export default defineConfig({
  branch: process.env.TINA_PUBLIC_BRANCH || process.env.HEAD || "main",
  clientId: process.env.TINA_PUBLIC_CLIENT_ID || "",
  token: process.env.TINA_TOKEN || "",
  localContentPath: "../..",
  build: {
    outputFolder: "admin",
    publicFolder: "src/public",
  },
  media: {
    tina: {
      mediaRoot: "uploads",
      publicFolder: "site/src/public",
    },
  },
  schema: {
    collections: [
      docsCollection,
      blogCollection,
      aboutCollection,
      sponsorsCollection,
      peopleCollection,
      settingsCollection,
    ],
  },
});
