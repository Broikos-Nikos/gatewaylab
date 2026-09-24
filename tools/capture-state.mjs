/**
 * What the picture is a picture of, in one place.
 *
 * `capture.mjs` photographs the page and writes this down; `check-capture.mjs`
 * reads the page back and compares. One function, used by both, so the gate can
 * never end up checking that two descriptions agree about a mistake.
 *
 * Four projects in this workspace paid for this. `watch-it-think` shipped a
 * recording of a green page for two days after the page became flame and blue;
 * its first fix recorded eight colours and a typeface and then passed over a
 * recording showing a rewritten headline; `tokenlab`'s picture was correct only
 * because the capture happened to be re-run three minutes after its palette
 * changed.
 *
 * A still goes stale exactly as quietly as a recording does, and the counts
 * matter more here than the paint: this picture's whole content is how many
 * marks sit inside how many bands.
 */

export function lookAt() {
  const s = getComputedStyle(document.documentElement)
  const paint = {}
  for (const k of ['--ink', '--lift', '--edge', '--text', '--dim', '--faint', '--flame', '--flame-bright']) {
    paint[k] = s.getPropertyValue(k).trim()
  }
  paint.bodyFont = getComputedStyle(document.body).fontFamily
  paint.wash = getComputedStyle(document.body).backgroundColor
  // The shading, which is the only colour in the picture that is not the accent
  // or the text, and the one a reader has to be able to see.
  const band = document.querySelector('.band')
  paint.band = band ? getComputedStyle(band).backgroundColor : ''

  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? ''

  const words = {
    headline: text('[data-headline]'),
    wordmark: text('.wordmark'),
    status: text('[data-status]'),
    rowLabels: [...document.querySelectorAll('.row__name')].map((e) => e.textContent?.trim()).join(' | '),
  }

  const state = {
    rows: document.querySelectorAll('.row').length,
    marks: document.querySelectorAll('.mark').length,
    bands: document.querySelectorAll('.band').length,
    slow: document.querySelectorAll('.mark--slow').length,
    /*
     * The argument, reduced to one number per row: how many marks sit inside a
     * shaded window. The closed loop should be near zero and the open loop
     * should not, and a picture where that reverses is a picture of the opposite
     * claim however correct its palette is.
     */
    insideBands: [...document.querySelectorAll('.row')].map((row) => {
      const bands = [...row.querySelectorAll('.band')].map((b) => [parseFloat(b.style.left), parseFloat(b.style.left) + parseFloat(b.style.width)])
      return [...row.querySelectorAll('.mark')].filter((m) => {
        const at = parseFloat(m.style.left)
        return bands.some(([from, to]) => at >= from && at < to)
      }).length
    }).join(','),
  }

  return { paint, words, state }
}
