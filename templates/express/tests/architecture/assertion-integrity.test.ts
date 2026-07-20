/**
 * Architecture test — assertion integrity (AC-5). Runs in the per-layer gate via
 * `jest tests/architecture/`.
 *
 * A test that claims an AC-ID must actually assert something. Using the TypeScript
 * compiler API (already present via ts-jest — no new dependency) we parse every
 * acceptance test file and, for each `it`/`test` whose title contains an AC-ID,
 * require at least one NON-TRIVIAL assertion. The following are rejected:
 *   - zero `expect(...)` calls
 *   - only trivial assertions on literals (`expect(true).toBe(true)`)
 *   - snapshot-only (`toMatchSnapshot` / `toMatchInlineSnapshot`)
 *
 * A fresh repo (no acceptance tests) skips cleanly.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const ACCEPTANCE_DIR = 'tests/acceptance'
const AC_ID = /\bAC-\d+\b/
const SNAPSHOT_MATCHERS = new Set(['toMatchSnapshot', 'toMatchInlineSnapshot'])
const LITERAL_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
])

function acceptanceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...acceptanceFiles(full))
    else if (entry.endsWith('.test.ts')) out.push(full)
  }
  return out
}

/** The literal title string of an `it`/`test` call, or null. */
function testTitle(call: ts.CallExpression): string | null {
  const callee = call.expression
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
      ? callee.expression.text
      : null
  if (name !== 'it' && name !== 'test') return null
  const arg = call.arguments[0]
  if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) return arg.text
  return null
}

/** The callback (last function/arrow argument) of a test call. */
function testBody(call: ts.CallExpression): ts.Node | null {
  for (let i = call.arguments.length - 1; i >= 0; i--) {
    const a = call.arguments[i]!
    if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) return a.body
  }
  return null
}

/** Walk up an `expect(...)` call to collect its chained matcher names. */
function matchersOf(expectCall: ts.Node): string[] {
  const names: string[] = []
  let cur: ts.Node | undefined = expectCall.parent
  while (
    cur &&
    (ts.isPropertyAccessExpression(cur) ||
      ts.isCallExpression(cur) ||
      ts.isElementAccessExpression(cur))
  ) {
    if (ts.isPropertyAccessExpression(cur)) names.push(cur.name.text)
    cur = cur.parent
  }
  return names
}

function isLiteral(node: ts.Expression | undefined): boolean {
  if (!node) return false
  if (ts.isPrefixUnaryExpression(node)) return isLiteral(node.operand) // -1, !true
  return LITERAL_KINDS.has(node.kind)
}

/** True if a test body contains at least one meaningful (non-trivial) assertion. */
function hasMeaningfulAssertion(body: ts.Node): boolean {
  let meaningful = false
  const visit = (node: ts.Node): void => {
    if (meaningful) return
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'expect'
    ) {
      const argLiteral = isLiteral(node.arguments[0])
      const matchers = matchersOf(node)
      const invoked = matchers.length > 0
      const snapshotOnly = matchers.some((m) => SNAPSHOT_MATCHERS.has(m))
      if (invoked && !argLiteral && !snapshotOnly) meaningful = true
    }
    ts.forEachChild(node, visit)
  }
  visit(body)
  return meaningful
}

type Offender = { file: string; title: string }

function scan(): Offender[] {
  const offenders: Offender[] = []
  for (const file of acceptanceFiles(ACCEPTANCE_DIR)) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const title = testTitle(node)
        if (title && AC_ID.test(title)) {
          const body = testBody(node)
          if (!body || !hasMeaningfulAssertion(body)) offenders.push({ file, title })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return offenders
}

const offenders = scan()

describe('architecture: acceptance-test assertion integrity', () => {
  it('every AC-claiming acceptance test has a non-trivial assertion', () => {
    const report = offenders.map((o) => `${o.file} :: "${o.title}"`)
    expect(report).toEqual([])
  })
})
