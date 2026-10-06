/**
 * The open loop is open, the closed loop is closed, and the harness knows its
 * own error.
 *
 *   npm run check:harness
 *
 * This is the gate this project exists to have. Everything else here is
 * percentiles, which a statistics page already contains; the product is a
 * harness that does not quietly understate the thing it was pointed at.
 *
 * **It runs the harnesses live rather than reading the committed run.** A gate
 * that only compares numbers in a file passes against a library that has been
 * broken since those numbers were written, and the specific break this guards
 * against is the easiest one in the world to introduce: put an `await` in front
 * of the request in `openLoop` and it becomes a closed loop.
 *
 * Three things, and the third is the one nobody writes:
 *
 * 1. The open loop dispatches every request it was due to dispatch.
 * 2. The closed loop dispatches far fewer, because that is the whole finding.
 * 3. The harness's own dispatch slip is small against the effect it reports. A
 *    load test whose clock wobbles by as much as the difference it claims to
 *    have found has measured its own `setTimeout`.
 *
 * ## Which of the three actually catches it, measured rather than assumed
 *
 * The first draft of this comment said the request count was what notices when
 * `openLoop` is given an `await`. Running that control says otherwise:
 *
 *   ok   the open loop dispatched 200 of 200 due requests
 *   FAIL the harness's own dispatch slip is 5353ms against a 4766ms effect, 112%
 *
 * The count does not notice at all. The schedule is computed from `i * gap`
 * rather than from the clock, so an awaiting loop still walks every slot; it
 * just arrives late, and every slot is still dispatched. What notices is the
 * slip, because each await pushes the next dispatch further behind the schedule
 * and the error compounds to five seconds.
 *
 * So assertion 3, which exists because measuring the harness showed it has an
 * error of its own, turns out to be the one that catches the failure assertions
 * 1 and 2 were written for. They stay: they are cheap, they are true, and a
 * different break will trip them. But the comment claiming otherwise was wrong
 * and had to be run to find out.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer, closedLoop, openLoop, summarise, compare } from '../src/lib/harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const committed = JSON.parse(readFileSync(resolve(root, 'src/generated/drill.json'), 'utf8'))

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/*
 * A shorter drill than the committed one. This gate runs in every build, so it
 * is two seconds rather than eighteen, and it checks behaviour rather than
 * figures: the shapes are what it is asserting, and they do not need six
 * seconds to show themselves.
 */
const LIVE = { baseMs: 5, stallMs: 300, stallEveryMs: 1000, ratePerSecond: 100, durationMs: 2000 }

const { server, port } = await startServer(LIVE)
const url = `http://127.0.0.1:${port}/`
let closed
let open
let closedSamples
let openSamples
try {
  const c = await closedLoop(url, LIVE.durationMs)
  const o = await openLoop(url, LIVE.durationMs, LIVE.ratePerSecond)
  closed = summarise('closed', c.latencies, c.slips)
  open = summarise('open', o.latencies, o.slips)
  closedSamples = c.samples
  openSamples = o.samples
  open.due = o.due
} finally {
  server.close()
}

const due = open.due

// 1. The open loop sends what it was due to send. A tolerance of one request,
// because the loop stops on a wall clock and the last slot can fall either side.
if (Math.abs(open.requests - due) > 1) {
  fail(
    `the open loop dispatched ${open.requests} of ${due} due requests`,
    'An open loop that drops requests when the server is slow is a closed loop wearing its name.',
  )
} else {
  console.log(`  ok      the open loop dispatched ${open.requests} of ${due} due requests`)
}

/*
 * 2. And the closed loop stops sending while the server is silent, which is the
 *    finding rather than a defect.
 *
 * ## This assertion counted requests until the first deploy failed
 *
 * It was `closed.requests >= due * 0.9`, which is the closed loop's dispatch
 * count held against the **open** loop's due count. Those are different
 * quantities. The open loop's count is set by a rate; the closed loop's is set
 * by how fast the machine can complete a request and come back, and that is a
 * property of the machine. Measured at tick 217 on the same code, same server,
 * same two second drill:
 *
 *     here, Windows      closed sent  50 of 200    25%    passed
 *     ubuntu-latest      closed sent 241 of 200   120%    FAILED
 *
 * The threshold held locally because this machine's loopback and timer put
 * 31ms between a response and the next request. The runner does it in 8, so
 * the closed loop got round five times as often and sailed past a ceiling that
 * was never about the closed loop at all. gatewaylab's first deploy failed on
 * it, twenty minutes after the repository was created.
 *
 * ## What it asks now
 *
 * The mechanism, which does not move between machines: under a stall the
 * closed loop is waiting rather than sending, so the gap between two of its
 * consecutive dispatches spans the stall. The open loop keeps dispatching on
 * its clock, so its largest gap stays near its own interval. Measured here:
 *
 *     closed  50 dispatches, max gap 316ms, median  31ms
 *     open   200 dispatches, max gap  10ms, median  10ms
 *     the stall is 300ms, the open loop's nominal gap is 10ms
 *
 * A faster machine shrinks the closed loop's median and leaves its max gap
 * where it is, because the stall is the server's and not the harness's. That
 * is the whole difference between a proxy and the thing.
 */
const biggestGap = (samples) => {
  const at = samples.map((s) => s[0]).sort((a, b) => a - b)
  let worst = 0
  for (let i = 1; i < at.length; i++) worst = Math.max(worst, at[i] - at[i - 1])
  return worst
}

const closedGap = biggestGap(closedSamples)
const openGap = biggestGap(openSamples)

/*
 * A stall first, because without one this assertion cannot fail.
 *
 * Found by its own control: setting `stallMs` to 0 to take the mechanism away
 * left `closedGap >= 0` passing trivially and the failure surfaced two
 * assertions later, on the open loop, with a message about the open loop
 * pausing. A gate that reports the wrong thing when its premise is removed is
 * a gate whose premise is not checked.
 */
if (!(LIVE.stallMs > 0) || !(LIVE.stallMs > 1000 / LIVE.ratePerSecond)) {
  fail(
    `the drill stalls for ${LIVE.stallMs}ms against a ${1000 / LIVE.ratePerSecond}ms dispatch interval, so there is nothing here for a closed loop to wait out`,
    'This project compares two harnesses under a stall. Without one they are the same harness and every number below is noise.',
  )
} else if (!(closedGap >= LIVE.stallMs * 0.9)) {
  /* Nine tenths of the stall, because the gap is bounded by when the request
     that met the stall was dispatched and the stall can start mid request. */
  fail(
    `the closed loop's longest gap between dispatches is ${closedGap}ms and the server stalls for ${LIVE.stallMs}ms`,
    'Either the server is not stalling or the closed loop is not waiting for it, and both make every other number here meaningless.',
  )
} else if (!(openGap < LIVE.stallMs / 2)) {
  fail(
    `the open loop's longest gap between dispatches is ${openGap}ms, against a ${1000 / LIVE.ratePerSecond}ms interval and a ${LIVE.stallMs}ms stall`,
    'An open loop that pauses while the server is slow is a closed loop wearing its name.',
  )
} else {
  console.log(
    `  ok      the closed loop's longest gap is ${closedGap}ms across the ${LIVE.stallMs}ms stall, the open loop's is ${openGap}ms on a ${1000 / LIVE.ratePerSecond}ms interval`,
  )
}

/*
 * 3. The harness knows its own error, and the error is small against the effect.
 *
 * This is the assertion that makes the rest of the project honest. Measured on
 * the committed run: a dispatch slip of 15ms at p99 against a 292ms effect,
 * which is 5.1%. If that share ever climbs, the run is measuring `setTimeout`.
 */
if (!open.slip) {
  fail('the open loop reported no dispatch slip, so the harness does not know its own error')
} else {
  /*
   * The effect is measured where it is widest, not at a percentile chosen in
   * advance, and this gate got that wrong on its first run.
   *
   * It hardcoded p95, which is where the committed drill is widest, and the live
   * drill uses shorter stalls: 300ms every 1,000ms rather than 400 every 2,000.
   * At that frequency the closed loop's own p95 lands inside a stall, so
   * `open.p95 - closed.p95` came out at **-38ms** and the share of it was
   * Infinity.
   *
   * That is this project's entire thesis, committed by the gate written for it:
   * which percentile the two harnesses disagree at is a function of how often
   * the thing stalls, and a check that names one percentile in advance can be
   * made to see nothing by changing the server.
   */
  const { widest } = compare(closed, open)
  const effect = open[widest.percentile] - closed[widest.percentile]
  const share = effect > 0 ? open.slip.p99 / effect : Infinity
  if (!(share < 0.2)) {
    fail(
      `the harness's own dispatch slip is ${open.slip.p99}ms against a ${effect}ms effect at ${widest.percentile}, ${(share * 100).toFixed(0)}%`,
      'A load test whose clock wobbles by as much as the difference it found has measured its own setTimeout.',
    )
  } else {
    console.log(`  ok      dispatch slip p99 ${open.slip.p99}ms is ${(share * 100).toFixed(1)}% of the ${effect}ms effect at ${widest.percentile}`)
  }
}

/*
 * And the committed run agrees with the shapes this live one just demonstrated.
 * Different parameters, so the figures differ; the relationships must not.
 */
const v = committed.verdict
if (!(v.requestsOpen === v.intendedRequests)) {
  fail(`the committed run has the open loop sending ${v.requestsOpen} of ${v.intendedRequests} due`)
} else if (!(v.sentShareOfIntended < 0.9)) {
  fail(`the committed run has the closed loop sending ${Math.round(v.sentShareOfIntended * 100)}% of what was due, which is not a closed loop`)
} else if (!(v.slipShareOfEffect < 0.2)) {
  fail(`the committed run's slip is ${(v.slipShareOfEffect * 100).toFixed(0)}% of its effect`)
} else {
  console.log(`  ok      the committed run has the same shapes: ${v.requestsOpen} of ${v.intendedRequests} open, ${Math.round(v.sentShareOfIntended * 100)}% closed, slip ${(v.slipShareOfEffect * 100).toFixed(1)}%`)
}

if (failed > 0) {
  console.error('\nA harness that understates its own tail is worse than no measurement, because it is believed.')
  process.exit(1)
}

console.log('harness: open is open, closed is closed, and the clock reports its own error')
