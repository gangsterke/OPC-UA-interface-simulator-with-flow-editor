import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  test: {
    environment: "node",
    // These are integration-style tests (real OPC UA server + RSA cert
    // generation per test); running multiple files in parallel causes enough
    // CPU contention to blow past the 5s default even though each is fast solo.
    testTimeout: 20000,
  },
});
