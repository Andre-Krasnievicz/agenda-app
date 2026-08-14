import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { config as loadDotenv } from "dotenv";

const parsed = loadDotenv().parsed ?? {};

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: parsed,
  },
});
