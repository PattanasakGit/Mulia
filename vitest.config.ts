import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/lib/youtube.ts", "src/lib/rooms.ts", "src/lib/time.ts", "src/lib/queue-order.ts", "src/lib/db-local.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
