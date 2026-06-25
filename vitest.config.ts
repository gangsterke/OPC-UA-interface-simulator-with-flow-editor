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
    // With enough test files, running them all in parallel (the default)
    // spins up that many real OPC UA servers + RSA keygens simultaneously and
    // reliably OOMs - verified empirically once the suite grew past ~12 files.
    // Sequential file execution is slower but stays well within memory limits.
    fileParallelism: false,
  },
});
