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
  {
    // Regras novas e estritas do eslint-plugin-react-hooks (React 19) que
    // disparam em padrões legítimos deste app (inicialização de estado a partir
    // do localStorage no mount). Rebaixadas para aviso — decisão de política,
    // reversível. Refatorar os efeitos exigiria testes que o projeto não tem.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
