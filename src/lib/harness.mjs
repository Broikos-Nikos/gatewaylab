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
    server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port }))
  })
}

async function once(url) {
  const res = await fetch(url)
  await res.text()
}

/** Send, wait, send. The obvious shape, and the one that stops asking. */
export async function closedLoop(url, durationMs) {
  const latencies = []
  const until = Date.now() + durationMs
  while (Date.now() < until) {
    const t0 = Date.now()
    await once(url)
    latencies.push(Date.now() - t0)
  }
  return { latencies, slips: [] }
}

/**
 * Send on the clock, measure from when it was due, and record how late the
 * sending itself was.
 *
 * `due` is the schedule and does not move. `slip` is how far the dispatch fell
 * behind it, which is the harness's own error and is reported rather than
 * absorbed.
 */
export async function openLoop(url, durationMs, ratePerSecond) {
  const gap = 1000 / ratePerSecond
  const start = Date.now()
  const latencies = []
  const slips = []
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
        .then(() => latencies.push(Date.now() - at))
        .catch(() => {}),
    )
  }
  await Promise.all(inFlight)
  return { latencies, slips, due }
}

/** One run of both harnesses against one server. */
export async function runOnce(drill) {
  const { server, port } = await startServer(drill)
  const url = `http://127.0.0.1:${port}/`
  // The closed loop first, alone, so neither client competes with the other for
  // the server or for the event loop.
  const c = await closedLoop(url, drill.durationMs)
  const o = await openLoop(url, drill.durationMs, drill.ratePerSecond)
  server.close()
  return {
    closed: summarise('closed loop, send and wait', c.latencies, c.slips),
    open: summarise('open loop, send on the clock', o.latencies, o.slips),
    due: o.due,
  }
}

/** The ratio at every percentile, and where it is widest. */
export function compare(closed, open) {
  const ratios = Object.fromEntries(
    PERCENTILES.map((q) => [`p${q}`, closed[`p${q}`] ? Number((open[`p${q}`] / closed[`p${q}`]).toFixed(1)) : null]),
  )
  const widest = Object.entries(ratios).reduce((a, b) => ((b[1] ?? 0) > (a[1] ?? 0) ? b : a))
  return { ratios, widest: { percentile: widest[0], ratio: widest[1] } }
}
