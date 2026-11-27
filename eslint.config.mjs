import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // The owner-role (RLS-bypassing) connection may only be used by the system modules, scripts and tests.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/system/**", "src/lib/db/**", "src/lib/rate-limit.ts", "src/lib/mail/outbox.ts", "src/app/api/**"],
    rules: {
      "no-restricted-syntax": ["error", { selector: "ImportSpecifier[imported.name=/^(sysDb|sysTx)$/]", message: "sysDb/sysTx bypass row-level security. Use withTenant(), or move this into src/lib/system/." }],
    },
  },
];
export default config;
