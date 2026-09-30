// ESLint voor de packages en functies (apps/web heeft een eigen configuratie van Next.js).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "apps/web/**", "**/.next/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
