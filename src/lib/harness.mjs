/**
 * Two load harnesses and the error of the clock that drives them.
 *
 * It lives under `src/` rather than in `tools/` because the page imports it too,
 * and the page is the only surface a reader ever sees. A second copy of this for
 * the browser would be two implementations that agree about a mistake sooner or
 * later, which this workspace has now written down six times.
 *
 * ## The two shapes
 *
 * A **closed loop** client sends a request, waits for the response, and sends
 * the next. While the server is stalled it is not sending, so the requests that
 * would have been caught in the stall are never made and never appear in the
 * percentiles. The harness backs off in sympathy with the thing it is measuring.
 * The name is coordinated omission.
 *
 * An **open loop** client sends on a schedule regardless of what has come back,
 * and measures each request from the time it was **due** rather than the time it
 * was sent. A request that could not go out because the client was busy has
 * already been waiting, and so has the person who clicked.
 *
 * ## The third thing, which is the one nobody prints
 *
 * The open loop's schedule is kept by `setTimeout`, and `setTimeout` is not a
 * clock. Measured on this machine at 100 requests a second:
 *
 *   dispatched 600 of 600 due
 *   slip against the schedule: p50 6ms, p90 13ms, p99 15ms, max 20ms
 *   328 of 600 dispatches were more than 5ms late
 *
 * So the open loop is open in shape and approximate in fact, and every latency
 * it reports carries about six milliseconds that belong to the harness rather
 * than to the server. Against a 400ms stall that is noise. Against a 10ms
 * difference between two providers it is the entire result.
 *
 * **A harness that does not report its own error is doing the thing this project
 * exists to criticise**, so `slip` comes back beside every measurement and
 * `check:harness` refuses a run where the slip is large against the effect.
 */

import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'

export const PERCENTILES = [50, 75, 90, 95, 99]

export function percentile(xs, q) {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((q / 100) * s.length))]
}

export function summarise(name, latencies, slips = []) {
  return {
    harness: name,
    requests: latencies.length,
    ...Object.fromEntries(PERCENTILES.map((q) => [`p${q}`, percentile(latencies, q)])),
    max: latencies.length ? Math.max(...latencies) : null,
    slip: slips.length
      ? {
          ...Object.fromEntries(PERCENTILES.map((q) => [`p${q}`, percentile(slips, q)])),
          max: Math.max(...slips),
          lateBy5ms: slips.filter((x) => x > 5).length,
        }
      : null,
  }
}

/**
 * A server that is healthy except when it is not.
 *
 * The stall is a sleep in the handler rather than a paused socket, because that
 * is what a real one looks like from outside: the connection is open, the
 * request is accepted, and nothing comes back for a while.
 */
export function startServer({ baseMs, stallMs, stallEveryMs }) {
  const started = Date.now()
  const server = createServer(async (_req, res) => {
    const into = (Date.now() - started) % stallEveryMs
    await sleep(into < stallMs ? stallMs - into + baseMs : baseMs)
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })
  return new Promise((ok) => {
    // `started` comes back because the stall cycle is measured from it, and a
    // client's own clock starts a few milliseconds later. Shading drawn from
    // the client's clock would be off by that much and would look fitted.
    server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port, started }))
  })
}

async function once(url) {
  const res = await fetch(url)
  await res.text()
}

/**
 * Send, wait, send. The obvious shape, and the one that stops asking.
 *
 * `samples` is `[sentAtMs, latencyMs]` per request, relative to `origin`, which
 * is what the page draws. They are kept because the argument of this project is
 * visible in *when* the requests were sent rather than in the percentiles: the
 * closed loop's sends go quiet for the length of each stall, and a summary
 * cannot show that.
 */
export async function closedLoop(url, durationMs, origin = Date.now()) {
  const latencies = []
  const samples = []
  const until = Date.now() + durationMs
  while (Date.now() < until) {
    const t0 = Date.now()
    await once(url)
    const took = Date.now() - t0
    latencies.push(took)
    samples.push([t0 - origin, took])
  }
  return { latencies, slips: [], samples }
}

/**
 * Send on the clock, measure from when it was due, and record how late the
 * sending itself was.
 *
 * `due` is the schedule and does not move. `slip` is how far the dispatch fell
 * behind it, which is the harness's own error and is reported rather than
 * absorbed.
 */
export async function openLoop(url, durationMs, ratePerSecond, origin = Date.now()) {
  const gap = 1000 / ratePerSecond
  const start = Date.now()
  const latencies = []
  const slips = []
  const samples = []
  const inFlight = []
  let due = 0
  for (let i = 0; ; i++) {
    const at = start + i * gap
    if (at - start >= durationMs) break
    due++
    const wait = at - Date.now()
    if (wait > 0) await sleep(wait)
    slips.push(Date.now() - at)
    inFlight.push(
      once(url)
        .then(() => {
          const took = Date.now() - at
          latencies.push(took)
          // Due time, not send time. A request that went out late was already
          // waiting, which is the whole reason this harness exists.
          samples.push([at - origin, took])
        })
        .catch(() => {}),
    )
  }
  await Promise.all(inFlight)
  return { latencies, slips, due, samples }
}

/** One run of both harnesses against one server. */
export async function runOnce(drill) {
  const { server, port, started } = await startServer(drill)
  const url = `http://127.0.0.1:${port}/`
  /*
   * Both clients share one origin, so their samples sit on one timeline and the
   * stall windows land in the same place for both. The closed loop runs first
   * and alone, so neither competes with the other for the server or the event
   * loop, which means the open loop's samples start where the closed loop's end
   * and the page draws them as two passes over the same six seconds.
   */
  const origin = Date.now()
  const c = await closedLoop(url, drill.durationMs, origin)
  const openOrigin = Date.now()
  const o = await openLoop(url, drill.durationMs, drill.ratePerSecond, openOrigin)
  server.close()
  return {
    closed: summarise('closed loop, send and wait', c.latencies, c.slips),
    open: summarise('open loop, send on the clock', o.latencies, o.slips),
    due: o.due,
    samples: { closed: c.samples, open: o.samples },
    /*
     * Where the stalls fall on each client's own timeline, computed from the
     * server's clock rather than detected in the samples, so the shading is not
     * fitted to the data it is supposed to explain.
     *
     * `phase` is how far into a stall cycle the server already was when that
     * client started, so the client's first stall begins at
     * `(stallEveryMs - phase) % stallEveryMs` and every `stallEveryMs` after.
     */
    stallPhase: {
      closed: (origin - started) % drill.stallEveryMs,
      open: (openOrigin - started) % drill.stallEveryMs,
    },
  }
}

/**
 * The stall windows on a client's own timeline, in milliseconds from its start.
 *
 * Computed from the parameters and the phase rather than detected in the
 * samples, because shading fitted to the data it is meant to explain is a
 * drawing of itself.
 *
 * The partial window at the front is the part that is easy to miss and was.
 * A client whose `phase` is 11ms did not arrive at a healthy server: it arrived
 * 11ms into a 400ms stall, so its first window runs from 0 to 389 and the first
 * *whole* one starts at 1989. Predicting only the whole ones left a measured
 * 412ms gap at t=0 with no shading under it, which would have read as the
 * closed loop going quiet for no reason at all.
 */
export function stallWindows(phase, { stallMs, stallEveryMs }, durationMs) {
  const out = []
  if (phase < stallMs) out.push([0, Math.min(stallMs - phase, durationMs)])
  for (let start = (stallEveryMs - phase) % stallEveryMs; start < durationMs; start += stallEveryMs) {
    if (start === 0) continue
    out.push([start, Math.min(start + stallMs, durationMs)])
  }
  return out.sort((a, b) => a[0] - b[0])
}

/** The ratio at every percentile, and where it is widest. */
export function compare(closed, open) {
  const ratios = Object.fromEntries(
    PERCENTILES.map((q) => [`p${q}`, closed[`p${q}`] ? Number((open[`p${q}`] / closed[`p${q}`]).toFixed(1)) : null]),
  )
  const widest = Object.entries(ratios).reduce((a, b) => ((b[1] ?? 0) > (a[1] ?? 0) ? b : a))
  return { ratios, widest: { percentile: widest[0], ratio: widest[1] } }
}
