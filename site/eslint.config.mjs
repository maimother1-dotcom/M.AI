import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * eslint-config-next 16 ships flat config arrays directly, so FlatCompat is
 * neither needed nor compatible here.
 */
export default [
  ...coreWebVitals,
  ...typescript,
  { ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts"] },
];
