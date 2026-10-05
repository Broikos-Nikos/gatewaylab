import './style.css'
import drill from './generated/drill.json'
// @ts-expect-error the library is plain JavaScript, shared with the four gates
// on purpose: a typed second copy for the browser is two implementations of the
// same arithmetic, which agree about a mistake sooner or later.
import { stallWindows } from './lib/harness.mjs'

/**
 * Two load harnesses, one server, six seconds, drawn.
 *
 * Every figure comes from `generated/drill.json`, which `npm run run:drill`
 * produces, and `check:drill`, `check:harness` and `check:spread` refuse them to
 * disagree. The run on screen is the median of ten by p95 ratio, so the picture
 * is the run the headline describes rather than the one that argues best.
 *
 * **The stall bands are computed from the drill parameters, not found in the
 * samples.** Shading fitted to the data it is meant to explain is a drawing of
 * itself. `stallWindows` takes the phase the server was already at when each
 * client started and returns the windows; the closed loop's silent stretches
 * land inside them, which is the argument rather than an artefact of the
 * drawing.
 *
 * The one thing worth looking at is the closed loop's row going empty under
 * every band while the open loop's keeps its rhythm. That is coordinated
 * omission: the harness stopped asking exactly when the answers got interesting.
 */

const el = {
  headline: document.querySelector<HTMLElement>('[data-headline]')!,
  standfirst: document.querySelector<HTMLElement>('[data-standfirst]')!,
  timeline: document.querySelector<HTMLElement>('[data-timeline]')!,
  status: document.querySelector<HTMLElement>('[data-status]')!,
  table: document.querySelector<HTMLElement>('[data-table]')!,
  caption: document.querySelector<HTMLElement>('[data-caption]')!,
  footer: document.querySelector<HTMLElement>('[data-footer]')!,
}

const d = drill
const cfg = d.drill
const [closed, open] = d.harnesses
const v = d.verdict
const shown = d.shown

/** The tallest latency drawn, so both rows share one vertical scale. */
const ceiling = Math.max(
  ...shown.samples.closed.map((s: number[]) => s[1]),
  ...shown.samples.open.map((s: number[]) => s[1]),
)

function row(
  label: string,
  samples: number[][],
  phase: number,
  note: string,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'row'
  wrap.dataset.row = ''
  wrap.dataset.row = label

  const head = document.createElement('div')
  head.className = 'row__head'
  const name = document.createElement('span')
  name.className = 'row__name'
  name.textContent = label
  const count = document.createElement('span')
  count.className = 'row__note'
  count.textContent = note
  head.append(name, count)

  const track = document.createElement('div')
  track.className = 'track'

  // The stalls first, underneath, computed rather than detected.
  for (const [from, to] of stallWindows(phase, cfg, cfg.durationMs)) {
    const band = document.createElement('div')
    band.className = 'band'
    band.dataset.band = ''
    band.style.left = `${(from / cfg.durationMs) * 100}%`
    band.style.width = `${((to - from) / cfg.durationMs) * 100}%`
    track.append(band)
  }

  // Then every request, at the time it was sent, as tall as it took.
  for (const [at, took] of samples) {
    const mark = document.createElement('div')
    mark.className = 'mark'
    mark.dataset.mark = ''
    if (took > cfg.stallMs / 2) {
      mark.classList.add('mark--slow')
      mark.dataset.slow = ''
    }
    mark.style.left = `${(at / cfg.durationMs) * 100}%`
    mark.style.height = `${Math.max(2, (took / ceiling) * 100)}%`
    mark.title = `sent at ${at}ms, took ${took}ms`
    track.append(mark)
  }

  wrap.append(head, track)
  return wrap
}

function draw(): void {
  el.timeline.replaceChildren(
    row(
      closed.harness,
      shown.samples.closed,
      shown.stallPhase.closed,
      `${shown.closedRequests} requests in ${cfg.durationMs / 1000}s`,
    ),
    row(
      open.harness,
      shown.samples.open,
      shown.stallPhase.open,
      `${shown.openRequests} requests in ${cfg.durationMs / 1000}s`,
    ),
  )

  el.status.textContent =
    `Shaded: the server is not answering. The closed loop's row goes empty under every band, ` +
    `because it is waiting rather than sending. It finished ${shown.closedRequests} requests where ` +
    `${v.intendedRequests} were due.`

  const rows = [closed, open].map((h) => {
    const r = document.createElement('div')
    r.className = 'trow'
    r.dataset.harness = h.harness
    const n = document.createElement('span')
    n.className = 'trow__name'
    n.textContent = h.harness
    const req = document.createElement('span')
    req.className = 'trow__num'
    req.textContent = `${h.requests} requests`
    const p95 = document.createElement('span')
    p95.className = 'trow__num'
    p95.textContent = `p95 ${h.p95}ms`
    const p99 = document.createElement('span')
    p99.className = 'trow__num'
    p99.textContent = `p99 ${h.p99}ms`
    r.append(n, req, p95, p99)
    return r
  })
  const head = document.createElement('p')
  head.className = 'table__head'
  head.textContent =
    `Median of ${cfg.repeats} runs. The two agree at p99 (${v.ratios.p99}x) and differ by ` +
    `${v.widest.ratio}x at ${v.widest.percentile}: which percentile they disagree at is a function of how often the server stalls.`
  el.table.replaceChildren(head, ...rows)
}

function boot(): void {
  el.headline.textContent =
    `The same server, six seconds: ${closed.p95}ms at p95, or ${open.p95}ms.`

  el.standfirst.textContent =
    `A closed loop client sends a request, waits, and sends the next, so it stops sending while the ` +
    `server is stalled and the stall never reaches its percentiles. An open loop client sends on a ` +
    `schedule and measures from when each request was due. Same server, same ${cfg.durationMs / 1000} seconds, ` +
    `${cfg.repeats} repeats: ${closed.p95}ms against ${open.p95}ms.`

  el.caption.textContent =
    `Each mark is one request, placed at the time it was sent and as tall as it took. The bands are ` +
    `computed from the drill parameters rather than found in the samples, because shading fitted to the ` +
    `data it explains is a drawing of itself. The run shown is the median of ${cfg.repeats} by p95 ratio, not the widest.`

  el.footer.textContent =
    `The harness's own dispatch slip is ${v.slipP99}ms at p99, which is ${(v.slipShareOfEffect * 100).toFixed(1)}% of the ` +
    `${v.effectMs}ms effect it reports. Against this stall that is noise; against a 10ms difference between two ` +
    `providers it would be the whole result, and a load test that does not print it is measuring its own clock. ` +
    `No provider was contacted: the server is local and its stalls are scheduled.`

  draw()
}

boot()
