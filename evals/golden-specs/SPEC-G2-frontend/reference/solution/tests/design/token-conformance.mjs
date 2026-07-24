// tests/design/token-conformance.mjs
//
// AC-6 — pure, deterministic design-token conformance logic (no Playwright, no DOM).
// The .spec.ts collects computed styles in the browser and hands them here; keeping the
// parse/normalize/diff logic in plain Node makes it unit-testable and framework-free.
//
// Token source: DESIGN.md, in a region delimited by <!-- rigel-tokens:start/end --> that
// contains one ```json block. Each dimension is ENFORCED ONLY IF its token array is
// non-empty — so a fresh app (empty tokens) passes, and teams turn on dimensions by
// filling them in. Full DESIGN.md format is Phase-2; this is the minimal shape.

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Extract and parse the rigel-tokens JSON from DESIGN.md content. */
export function parseTokens(markdown) {
  const region = markdown.match(
    /<!--\s*rigel-tokens:start\s*-->([\s\S]*?)<!--\s*rigel-tokens:end\s*-->/
  )
  const scope = region ? region[1] : markdown
  const fence = scope.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (!fence) return emptyTokens()
  let raw
  try {
    raw = JSON.parse(fence[1])
  } catch {
    return emptyTokens()
  }
  return {
    colors: (raw.colors ?? []).map(normalizeColor).filter(Boolean),
    spacing: (raw.spacing ?? []).map(toPx).filter((n) => n !== null),
    radii: (raw.radii ?? []).map(toPx).filter((n) => n !== null),
    fontSizes: (raw.fontSizes ?? []).map(toPx).filter((n) => n !== null),
    fontFamilies: (raw.fontFamilies ?? [])
      .map((f) => String(f).trim().toLowerCase())
      .filter(Boolean),
  }
}

function emptyTokens() {
  return { colors: [], spacing: [], radii: [], fontSizes: [], fontFamilies: [] }
}

export function tokensAreEmpty(t) {
  return (
    !t.colors.length &&
    !t.spacing.length &&
    !t.radii.length &&
    !t.fontSizes.length &&
    !t.fontFamilies.length
  )
}

/** Normalize a color to lowercase #rrggbb, or null for transparent/none/unparseable. */
export function normalizeColor(value) {
  if (value == null) return null
  let v = String(value).trim().toLowerCase()
  if (v === '' || v === 'transparent' || v === 'none' || v === 'currentcolor' || v === 'inherit')
    return null
  if (HEX_RE.test(v)) {
    if (v.length === 4) v = '#' + [...v.slice(1)].map((c) => c + c).join('')
    return v
  }
  const m = v.match(
    /^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,/\s]+([0-9.%]+))?\s*\)$/
  )
  if (!m) return null
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  if (a === 0) return null // fully transparent — not a token violation
  const hex = (n) => Math.round(parseFloat(n)).toString(16).padStart(2, '0')
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
}

/** Parse a CSS length to an integer px, or null (for 'auto'/'normal'/non-px). */
export function toPx(value) {
  if (typeof value === 'number') return Math.round(value)
  if (value == null) return null
  const v = String(value).trim()
  const m = v.match(/^(-?[0-9.]+)px$/)
  if (m) return Math.round(parseFloat(m[1]))
  if (/^-?[0-9.]+$/.test(v)) return Math.round(parseFloat(v)) // bare number token
  return null
}

/** First font family, lowercased, quotes stripped. */
export function firstFamily(value) {
  if (!value) return null
  const first = String(value)
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
  return first ? first.toLowerCase() : null
}

const COLOR_PROPS = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
]
const SPACING_PROPS = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'columnGap',
  'rowGap',
]

/**
 * Diff collected computed styles against the tokens. `collected` is an array of
 * { route, sel, styles: {prop: value} }. Returns a list of violation strings.
 * Only dimensions with non-empty token lists are enforced.
 */
export function checkStyles(collected, tokens) {
  const colorSet = new Set(tokens.colors)
  const spacingSet = new Set(tokens.spacing)
  const radiiSet = new Set(tokens.radii)
  const fontSet = new Set(tokens.fontSizes)
  const famSet = new Set(tokens.fontFamilies)
  const violations = []
  const add = (route, sel, prop, value) => violations.push(`${route}  ${sel}  ${prop}: ${value}`)

  for (const { route, sel, styles } of collected) {
    if (colorSet.size) {
      for (const p of COLOR_PROPS) {
        const c = normalizeColor(styles[p])
        if (c && !colorSet.has(c)) add(route, sel, p, c)
      }
    }
    if (spacingSet.size) {
      for (const p of SPACING_PROPS) {
        const n = toPx(styles[p])
        if (n && !spacingSet.has(n)) add(route, sel, p, `${n}px`)
      }
    }
    if (radiiSet.size) {
      const r = toPx(styles.borderTopLeftRadius)
      if (r && !radiiSet.has(r)) add(route, sel, 'borderRadius', `${r}px`)
    }
    if (fontSet.size) {
      const f = toPx(styles.fontSize)
      if (f && !fontSet.has(f)) add(route, sel, 'fontSize', `${f}px`)
    }
    if (famSet.size) {
      const fam = firstFamily(styles.fontFamily)
      if (fam && !famSet.has(fam)) add(route, sel, 'fontFamily', fam)
    }
  }
  return violations
}

export const COLLECT_PROPS = [
  ...COLOR_PROPS,
  ...SPACING_PROPS,
  'borderTopLeftRadius',
  'fontSize',
  'fontFamily',
]

/**
 * PLAN-005 AC-6 — build the allowed-token lists from tokens.json (DTCG), the single source
 * of truth, replacing the old DESIGN.md rigel-tokens block. Flattens the token tree,
 * resolves {alias} references to their primitive value, drops the internal `primitive`
 * tier (components use only semantics), and maps token groups to the conformance dimensions:
 *   $type color OR top group `color` → colors   ·   `radius` → radii
 *   `text` → fontSizes   ·   `spacing` → spacing   ·   `font.*family*` → fontFamilies
 */
export function tokensFromDtcg(jsonText) {
  let root
  try {
    root = JSON.parse(jsonText)
  } catch {
    return emptyTokens()
  }
  const flat = {}
  const walk = (node, path) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return
    if (Object.prototype.hasOwnProperty.call(node, '$value')) {
      flat[path.join('.')] = { value: node.$value, type: node.$type }
      return
    }
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('$')) continue
      walk(v, [...path, k])
    }
  }
  walk(root, [])
  const resolve = (val, depth = 0) => {
    if (typeof val === 'string' && /^\{[^}]+\}$/.test(val) && depth < 20) {
      const target = flat[val.slice(1, -1)]
      return target ? resolve(target.value, depth + 1) : val
    }
    return val
  }
  const out = { colors: [], spacing: [], radii: [], fontSizes: [], fontFamilies: [] }
  for (const [path, { value, type }] of Object.entries(flat)) {
    if (path.split('.').includes('primitive')) continue
    const resolved = resolve(value)
    const top = path.split('.')[0]
    if (type === 'color' || top === 'color') {
      const c = normalizeColor(resolved)
      if (c) out.colors.push(c)
    } else if (top === 'radius') {
      const n = toPx(resolved)
      if (n !== null) out.radii.push(n)
    } else if (top === 'text' || top === 'fontSize') {
      const n = toPx(resolved)
      if (n !== null) out.fontSizes.push(n)
    } else if (top === 'spacing' || top === 'space') {
      const n = toPx(resolved)
      if (n !== null) out.spacing.push(n)
    } else if (top === 'font' && /family/i.test(path)) {
      const f = firstFamily(resolved)
      if (f) out.fontFamilies.push(f)
    }
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])]
  return out
}
