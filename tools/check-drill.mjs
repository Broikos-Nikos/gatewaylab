/**
 * Every derived figure recomputes from the committed run.
 *
 *   npm run check:drill
 *
 * `check:harness` tests the behaviour by running it, and `check:spread` tests
 * whether the run is quotable. This tests the arithmetic on top: the ratios, the
 * widest percentile, the request shares and the slip share are all derived from
 * the two harness summaries, and a derived figure nobody re-derives is a cache.
 *
 * Deliberately not checked here: whether re-running the drill would produce
 * these numbers. It would not, and that is the point of freezing it. Timing on a
 * laptop is reproducible to a shape, not to a millisecond.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERCENTILES, compare } from '../src/lib/harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const d = JSON.parse(readFileSync(resolve(root, 'src/generated/drill.json'), 'utf8'))

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const [closed, open] = d.harnesses
const drift = []
const cmp = (path, a, b) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) drift.push(`${path}: committed ${JSON.stringify(a)}, recomputed ${JSON.stringify(b)}`)
}

const fresh = compare(closed, open)
cmp('verdict.ratios', d.verdict.ratios, fresh.ratios)
cmp('verdict.widest', d.verdict.widest, fresh.widest)

const intended = Math.round((d.drill.durationMs / 1000) * d.drill.ratePerSecond)
cmp('verdict.intendedRequests', d.verdict.intendedRequests, intended)
cmp('verdict.requestsClosed', d.verdict.requestsClosed, closed.requests)
cmp('verdict.requestsOpen', d.verdict.requestsOpen, open.requests)
cmp('verdict.sentShareOfIntended', d.verdict.sentShareOfIntended, Number((closed.requests / intended).toFixed(2)))

const effect = open[d.verdict.widest.percentile] - closed[d.verdict.widest.percentile]
cmp('verdict.effectMs', d.verdict.effectMs, effect)
cmp('verdict.slipP99', d.verdict.slipP99, open.slip.p99)
cmp('verdict.slipShareOfEffect', d.verdict.slipShareOfEffect, Number((open.slip.p99 / effect).toFixed(3)))

// The percentiles must be ordered. A summary where p90 is below p50 is a sorting
// bug, and it would sail past every comparison above because both sides come
// from the same broken function.
for (const h of d.harnesses) {
  const seq = PERCENTILES.map((q) => h[`p${q}`])
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] < seq[i - 1]) {
      drift.push(`${h.harness}: p${PERCENTILES[i]} is ${seq[i]} and p${PERCENTILES[i - 1]} is ${seq[i - 1]}`)
    }
  }
  if (h.max !== null && h[`p${PERCENTILES.at(-1)}`] > h.max) {
    drift.push(`${h.harness}: p${PERCENTILES.at(-1)} is ${h[`p${PERCENTILES.at(-1)}`]} and max is ${h.max}`)
  }
}

if (drift.length > 0) {
  fail(
    `the committed figures disagree with the library in ${drift.length} place${drift.length === 1 ? '' : 's'}`,
    drift.join(String.fromCharCode(10) + '      '),
  )
} else {
  console.log(`  ok      ${Object.keys(d.verdict).length} derived figures recompute to exactly what is committed, and both percentile sets are ordered`)
}

if (failed > 0) {
  console.error('\nA derived figure nobody re-derives is a cache, and a cache nobody invalidates is a lie with a timestamp.')
  process.exit(1)
}

console.log('drill: every derived figure comes out of the committed run')
