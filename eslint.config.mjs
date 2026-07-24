import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // O Designer de PDF é um editor de canvas imperativo, portado do standalone
  // checklist_construtor.html: o estado (pages/groups/markers) vive num store
  // mutável (useRef) lido no render e mutado nos handlers, com re-render forçado.
  // É intencional e contido a este módulo (React Compiler não está habilitado),
  // então desligamos aqui as regras do react-hooks que assumem estado imutável.
  {
    files: ["src/app/designer/**/*.{ts,tsx}", "src/lib/designer/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
