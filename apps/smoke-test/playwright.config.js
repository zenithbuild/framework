import { defineConfig } from "@playwright/test";

const smokePort = Number.parseInt(process.env.ZENITH_SMOKE_PORT || "4173", 10);
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  timeout: 45_000,
  use: {
    baseURL: smokeBaseUrl,
    headless: true
  },
  webServer: {
    command: `bun run dev -- --port ${smokePort}`,
    url: `${smokeBaseUrl}/`,
    reuseExistingServer: true,
    timeout: 120_000
  }
});
