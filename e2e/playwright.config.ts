import { defineConfig } from "@playwright/test";

const API_PORT = 3101;
const COLLAB_PORT = 1334;
const WEB_PORT = 5199;

const database =
  process.env.DATABASE_URL ?? "postgresql://collab:collab@localhost:5433/collab_test?schema=public";
const redis = process.env.REDIS_URL ?? "redis://localhost:6380";
const secrets = {
  JWT_ACCESS_SECRET: "e2e-access-secret-0123456789",
  JWT_REFRESH_SECRET: "e2e-refresh-secret-0123456789",
};

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    colorScheme: "dark",
    // Locally the installed Chrome is used so no browser download is needed; CI installs Chromium.
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @collab/api exec tsx src/server.ts",
      cwd: "..",
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: database,
        REDIS_URL: redis,
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        ...secrets,
      },
    },
    {
      command: "pnpm --filter @collab/collab exec tsx src/server.ts",
      cwd: "..",
      port: COLLAB_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(COLLAB_PORT), DATABASE_URL: database, JWT_ACCESS_SECRET: secrets.JWT_ACCESS_SECRET },
    },
    {
      command: `pnpm --filter @collab/web exec vite --port ${WEB_PORT} --strictPort`,
      cwd: "..",
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_URL: `http://localhost:${API_PORT}`,
        VITE_COLLAB_URL: `ws://localhost:${COLLAB_PORT}`,
      },
    },
  ],
});
