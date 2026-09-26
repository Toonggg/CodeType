import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs so the built site works from any sub-path.
  base: "./",
  test: {
    include: ["tests/**/*.test.js"],
  },
});
