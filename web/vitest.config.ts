import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node", // pure reducer logic — no DOM needed
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
