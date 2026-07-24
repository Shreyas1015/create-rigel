// Style Dictionary v4 — tokens.json (DTCG) → src/app/tokens.css as a Tailwind v4
// @theme block. DTCG ($value/$type + aliases) is auto-detected (usesDtcg). Only SEMANTIC
// tokens are emitted; primitives (color.primitive.*) are internal alias targets, filtered
// out so components can't use raw values. Token paths map to Tailwind v4 namespaces:
// color.primary → --color-primary (bg-primary/text-primary), radius.md → --radius-md,
// text.base → --text-base. PLAN-005 AC-1.
export default {
  source: ['tokens.json'],
  usesDtcg: true,
  hooks: {
    formats: {
      'css/tailwind-theme': ({ dictionary }) => {
        const decls = dictionary.allTokens
          .map((t) => `  --${t.name}: ${t.$value ?? t.value};`)
          .join('\n')
        return `/* GENERATED from tokens.json by Style Dictionary — do not edit by hand. */\n@theme {\n${decls}\n}\n`
      },
    },
  },
  platforms: {
    tailwind: {
      transformGroup: 'css',
      buildPath: 'src/app/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/tailwind-theme',
          filter: (token) => !token.path.includes('primitive'),
        },
      ],
    },
  },
}
