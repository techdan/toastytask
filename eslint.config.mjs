import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "lib/db/scripts/**",  // Migration scripts are Node.js scripts, not Next.js code
      "lib/db/migrations/**",  // Migration SQL files
      "data/**",
      "**/*.db",
      "**/*.db-*",
    ],
  },
];

export default eslintConfig;
