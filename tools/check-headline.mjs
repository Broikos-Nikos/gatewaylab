/**
 * The sentence a reader gets before javascript runs is the sentence the drill
 * measured.
 *
 *   npm run check:headline
 *
 * `GHEAD-F2`, filed at tick 224 by the fix for `GHEAD-F1` and open since.
 * `GHEAD-F1` was an `h1` that shipped empty and was filled by script, so a
 * blocked bundle or a slow connection left the page with no headline at all.
 * The fix put the sentence in the markup. That created this one: the sentence
 * now exists five times and only one copy is held against the measurement.
 *
 *     src/main.ts            the template, computed from drill.json   check:page
 *     index.html  h1         hard coded                               nothing
 *     index.html  og:title   hard coded                               nothing
 *     index.html  og:image:alt, description, og:description           nothing
 *     README.md   the ### line                                        check:claims
 *
 * `check:page` opens the built page, where `main.ts` has already overwritten
 * the `h1`, so it reads the computed copy and never the markup. `check:claims`
 * reads the README. Between them a figure that moves regenerates `main.ts`'s
 * sentence, fails `check:claims` on the README, and leaves `index.html` saying
 * the old number to the three readers who only ever see the markup: somebody
 * with javascript off, somebody whose bundle has not arrived, and every unfurler
 * there is, because none of them run the page.
 *
 * That is the stale copy being the one a reader meets first, which is the
 * inversion worth a gate: the fallback is not a lesser surface, it is the only
 * surface for a reader who never gets the rest.
 *
 * ## What it asserts
 *
 * One sentence, built here from `src/generated/drill.json`, and then required to
 * be exactly that in the markup, in the card, in the README and in the template
 * that writes it at runtime. Not "contains both numbers": equal. A sentence that
 * contains the right figures in the wrong order is still a sentence the page did
 * not measure.
 *
 * The figures are also required in the four sentences that are not the
 * headline, as phrases and never as bare numbers, because `5` and `10` and `100`
 * are all over this document and a gate that looks for `337` in a page
 * containing `337` proves nothing about where it is.
 *
 * ## The title is one of those four
 *
 * It read `gatewaylab` until tick 232, which is the tab, the bookmark, the
 * browser history entry and the blue line in a search result all saying a word
 * nobody has heard of. Three of the eight projects here already carry a sentence
 * there and five do not, so this is a class and this is one of the five. Holding
 * it to both figures is what stops it going back to a wordmark: a rule that only
 * said "not the project name" would pass on any other word.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n')

const d = JSON.parse(read('src/generated/drill.json'))
const [closed, open] = d.harnesses

const html = read('index.html')
const readme = read('README.md')
const main = read('src/main.ts')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/* The sentence, from the measurement. This is the only place it is built. */
const headline = `The same server, six seconds: ${closed.p95}ms at p95, or ${open.p95}ms.`

/* The template in main.ts, as source rather than as output: the runtime copy
   cannot be read without running the page, and the point of this gate is to be
   the one that does not have to. */
const TEMPLATE = 'The same server, six seconds: ${closed.p95}ms at p95, or ${open.p95}ms.'

const flat = (s) => s.replace(/\s+/g, ' ').trim()

const attr = (re) => {
  const m = html.match(re)
  return m ? flat(m[1]) : null
}

const markupHeadline = attr(/<h1[^>]*data-headline[^>]*>([\s\S]*?)<\/h1>/)
const cardTitle = attr(/<meta\s+property="og:title"\s+content="([^"]*)"/)
const readmeHeadline = (() => {
  const m = readme.match(/^###\s+(.+)$/m)
  return m ? flat(m[1]) : null
})()

const EQUAL = [
  ['index.html, the h1 a reader gets with no javascript', markupHeadline],
  ['index.html, og:title, which is what an unfurler shows', cardTitle],
  ['README.md, the headline under the project name', readmeHeadline],
]

for (const [where, found] of EQUAL) {
  if (found === null) fail(`${where}: not found at all`, 'This gate is reading the wrong thing, which is worse than the finding it holds.')
  else if (found !== headline) fail(`${where} is not the sentence the drill measured`, `page says ${JSON.stringify(found)}\n      drill says ${JSON.stringify(headline)}`)
}

if (!main.includes(TEMPLATE)) {
  fail(
    'src/main.ts no longer writes this sentence',
    `expected the template ${JSON.stringify(TEMPLATE)}. If the runtime sentence and the markup sentence drift apart, the page says one thing before the bundle arrives and another after.`,
  )
}

/*
 * The three sentences that are not the headline. Phrases, with the figure inside
 * the words that give it its meaning, because this document contains 5, 10, 100,
 * 400 and 2000 as parameters and 337 as a result.
 */
const PHRASES = [
  [`${closed.p95}ms at p95`, 'the closed loop figure with its percentile'],
  [`${open.p95}ms`, 'the open loop figure'],
]

const CARRIERS = [
  ['the title, which is the tab, the bookmark and the search result', /<title>([^<]*)<\/title>/],
  ['the description a search result shows', /<meta\s+name="description"\s+content="([^"]*)"/],
  ['og:description, the card under the link', /<meta\s+property="og:description"\s+content="([^"]*)"/],
  ['og:image:alt, the card for a reader who cannot see it', /<meta\s+property="og:image:alt"\s+content="([^"]*)"/],
]

for (const [where, re] of CARRIERS) {
  const found = attr(re)
  if (found === null) {
    fail(`${where}: not in index.html`)
    continue
  }
  const missing = PHRASES.filter(([phrase]) => !found.includes(phrase))
  if (missing.length > 0) {
    fail(
      `${where} is missing ${missing.length} of the ${PHRASES.length} figures`,
      missing.map(([phrase, what]) => `${what}: expected ${JSON.stringify(phrase)}`).join('; '),
    )
  }
}

if (failed > 0) {
  console.error('\nThe copy nobody holds is the copy a reader with no javascript reads.')
  process.exit(1)
}

console.log(`  ok      the headline is ${JSON.stringify(headline)} in the markup, the card, the README and the template`)
console.log('headline: every static copy of the sentence is the one the drill measured')
