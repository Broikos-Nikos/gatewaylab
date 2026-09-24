/**
 * Every number the README states comes out of the committed run.
 *
 *   npm run check:claims
 *
 * `check:drill` proves the figures come from the run and `check:page` proves the
 * page states them. The README is the third surface, it is the one a recruiter
 * actually reads, and until this existed it was the only one held by nothing.
 *
 * **Every claim is a phrase, never a bare integer**, counted rather than merely
 * found. `watch-it-think` held a claim as the string "6" in a README containing
 * nineteen of them, so four of its twenty four claims could not fail under any
 * edit whatsoever, and `agentscope`'s spec gate made the same mistake and its
 * first control passed against a document edited to say the wrong number.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const d = JSON.parse(readFileSync(resolve(root, 'src/generated/drill.json'), 'utf8'))
const readme = readFileSync(resolve(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n')
const flat = readme.replace(/\s+/g, ' ')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const dr = d.drill
const v = d.verdict
const [closed, open] = d.harnesses
const PCTS = [50, 75, 90, 95, 99]
const rs = [...d.runs.map((r) => r.p95Ratio)].sort((a, b) => a - b)
const q1 = rs[Math.floor(rs.length / 4)]
const q3 = rs[Math.floor((3 * rs.length) / 4)]

const CLAIMS = [
  ['the headline, both figures', `six seconds: ${closed.p95}ms at p95, or ${open.p95}ms.`],
  ['the server it is measured against', `answers in ${dr.baseMs}ms and stalls ${dr.stallMs}ms every ${dr.stallEveryMs}ms`],
  ['the two figures restated under the headline', `reports ${closed.p95}ms. The correct one reports ${open.p95}ms.`],
  ['the ratio line', 'The ratio, open over closed: ' + PCTS.map((q) => `${v.ratios[`p${q}`]}x`).join(' | ')],
  ['what was sent against what was due', `sent ${v.requestsClosed} requests where ${v.intendedRequests} were due**, which is ${Math.round(v.sentShareOfIntended * 100)}%`],
  ['the p99 agreement', `${closed.p99}ms against ${open.p99}ms, a ratio of ${v.ratios.p99}x`],
  ['the widest disagreement', `a factor of ${v.widest.ratio}, at ${v.widest.percentile}`],
  ['how unhealthy the server is', `unhealthy ${Math.round((100 * dr.stallMs) / dr.stallEveryMs)}% of the`],
  ['the slip and its share', `**${v.slipP99}ms at p99**, which is ${(v.slipShareOfEffect * 100).toFixed(1)}%\nof the ${v.effectMs}ms effect`],
  ['the repeats', `Ten repeats, and the p95 ratio across them:`],
  ['every repeat, in order', d.runs.map((r) => `${r.p95Ratio}x`).join(', ')],
  ['the middle half and the full range', `**${q1}x to ${q3}x**, which is ${Math.round((100 * (q3 - q1)) / q1)}%. The full range is ${rs[0]}x to\n${rs.at(-1)}x.`],
]

for (const h of d.harnesses) {
  CLAIMS.push([`the table row for the ${h.harness}`, `| ${h.harness} | ${h.requests} | ` + PCTS.map((q) => h[`p${q}`]).join(' | ') + ' |'])
}

let missing = 0
for (const [what, value] of CLAIMS) {
  const wanted = String(value).replace(/\s+/g, ' ')
  if (flat.split(wanted).length - 1 === 0) {
    missing++
    fail(`${what}: the run says ${JSON.stringify(wanted)} and the README does not say it`)
  }
}
if (missing === 0) console.log(`  ok      ${CLAIMS.length} claims in README.md are what the committed run produces`)

/*
 * And nothing else of the same shape. The README could state one latency
 * correctly and invent another in the next paragraph, and every claim above
 * would still pass: looking for the right answer cannot see a wrong one sitting
 * beside it.
 */
const allowed = new Set([
  ...d.harnesses.flatMap((h) => PCTS.map((q) => String(h[`p${q}`])).concat(String(h.max))),
  String(dr.baseMs),
  String(dr.stallMs),
  String(dr.stallEveryMs),
  String(dr.durationMs),
  String(v.slipP99),
  String(v.effectMs),
  // The two figures the harness control printed, quoted in the gates section.
  '5353',
  '4766',
  // A round number used to say what the slip would ruin, not a measurement.
  '10',
])
const loose = [...new Set(flat.match(/\b\d+ms\b/g) ?? [])].map((x) => x.replace('ms', '')).filter((x) => !allowed.has(x))
if (loose.length > 0) {
  fail(`the README states ${loose.length} latency figure${loose.length === 1 ? '' : 's'} the run does not produce`, loose.map((x) => `${x}ms`).join(', '))
} else {
  console.log('  ok      every latency in README.md is one the run produces')
}

if (failed > 0) {
  console.error('\nA number a reader can check is a number that has to be checked here first.')
  process.exit(1)
}

console.log('claims: every figure in the README comes out of the committed run')
