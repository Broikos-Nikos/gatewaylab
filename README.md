# gatewaylab

### The same server, six seconds: 32.5ms at p95, or 337ms.

<!-- No live link yet. This repository was deleted from GitHub on 7 October
     under D27 and is scheduled to be uploaded again on 10 October, D28. The link
     and the sentence below go back in on that day, which is step 5 of the
     upload sequence in state/schedule.json. Until then a claim that the page
     is live would be a claim nothing supports: the URL returned 404 when this
     was written, measured. -->
The two rows are one run.

Two load harnesses against one server that answers in 5ms and stalls 400ms every
2000ms. The obvious one reports 32.5ms. The correct one reports 337ms.

![Two rows on one six second timeline. Shaded bands mark the stalls. Under every band the closed loop's row is empty except for a single tall mark, because it is waiting rather than sending. The open loop's row has a solid wedge of requests sloping down, everything that piled up while the server was silent](docs/gatewaylab.png)

That is the real page in a real browser, taken by `npm run capture`. A still,
because the page does not move: its argument is a shape that is already there
when it loads, and a recording would be eight seconds of nothing happening at
three times the weight.

---

## What the two harnesses do

A **closed loop** client sends a request, waits for the response, and sends the
next. While the server is stalled it is not sending, so the requests that would
have been caught in the stall are never made and never reach its percentiles.
The harness backs off in sympathy with the thing it is measuring. The name for
this is coordinated omission.

An **open loop** client sends on a schedule regardless of what has come back, and
measures each request from the time it was **due**. A request that could not go
out because the client was busy has already been waiting, and so has the person
who clicked.

| harness | requests | p50 | p75 | p90 | p95 | p99 |
|---|---|---|---|---|---|---|
| closed loop, send and wait | 161 | 31.5 | 32 | 32 | 32.5 | 419 |
| open loop, send on the clock | 600 | 35 | 45 | 238 | 337 | 416.5 |

The ratio, open over closed: 1.1x | 1.4x | 7.4x | 10.4x | 1x

**The closed loop sent 161 requests where 600 were due**, which is 27% of them.
That is the mechanism rather than the symptom: it did not measure the stall
wrongly, it stopped asking during the stall.

## The part that would have fooled me, and did

**At p99 the two harnesses agree.** 419ms against 416.5ms, a ratio of 1x. The first
version of this drill reported p99 alone and the effect appeared not to exist.

It exists and it is a factor of 10.4, at p95. The server is unhealthy 20% of the
time, so the open loop's tail begins around p80, and by p99 both harnesses are
deep inside a stall and report the same stall length.

**Which percentile they disagree at is a function of how often the thing
stalls.** A benchmark quoting one percentile can be made to agree with a closed
loop harness by choosing which one, and nobody reading it would know.

## The harness knows its own error

The open loop's schedule is kept by `setTimeout`, and `setTimeout` is not a
clock. Its dispatch slips behind the schedule by **15ms at p99**, which is 4.9%
of the 304.5ms effect it reports.

Against this stall that is noise and the run stands. Against a 10ms difference
between two providers it would be the entire result. A load test that does not
print its own clock error is doing the thing this project exists to criticise, so
the slip comes back beside every measurement and `check:harness` refuses a run
where it is large against the effect.

## How much the run moves

Ten repeats, and the p95 ratio across them:

10.7x, 10.7x, 10.5x, 10x, 10.5x, 10.5x, 10.3x, 10.2x, 10.4x, 10.2x

The middle half spans **10.2x to 10.5x**, which is 3%. The full range is 10x to
10.7x.

The spread is measured across the middle half rather than the ends, and that
correction is worth the paragraph. Min to max grows with the sample size by
construction: raising the repeats from three to ten took the reported spread from
5% to 29% while nine of ten runs sat inside 8%. A tolerance measured that way
punishes better sampling, which is the opposite of what a spread is for.

## What this does not claim

**Not that this is a measurement of any provider.** It is a drill against a local
server whose stalls are scheduled. No provider was contacted and none is named.
Stage one earns the right to measure one; it does not do it.

**Not that the open loop numbers are the truth.** They are what a client holding
a rate would experience. A system with a queue, a retry policy or a circuit
breaker in front of it experiences something else, and a harness has to say which
it is modelling.

**Not that closed loop harnesses are useless.** They measure service time, which
is real and is the right quantity if the question is how long the server takes
when it is asked. They are wrong only when their output is read as latency under
load, which is how they are almost always read.

## Run it

```bash
npm install
npm run dev         # then open the address it prints
npm run build       # typecheck, four file gates, then the bundle
npm run verify      # the browser gates against one shared server
npm run run:drill   # re-measure. Changes every number. Nothing runs it automatically.
```

The drill's output is committed, like `chunkline`'s corpus and `agentscope`'s
frozen log. Timing on a laptop is reproducible to a shape, not to a millisecond,
so the run is frozen and everything that quotes it is held to that run.

## The gates

| gate | what it stops |
|---|---|
| `check:harness` | a harness that refuses to send, or sends without knowing its own clock error |
| `check:drill` | a derived figure drifting from the run it came from |
| `check:spread` | a headline quoted from too few runs, or from a spread that hides its outliers |
| `check:page` | the page stating a figure, or drawing a mark, the run does not support |
| `check:capture` | the picture above becoming a photograph of a page that no longer exists |

`check:harness` is the one this project exists to have, and it tests the
behaviour by running it rather than by reading numbers in a file. Its control
puts one `await` in front of the request in the open loop, which is the entire
difference between the two shapes, and the result corrected this repository's own
comment:

```
ok   the open loop dispatched 200 of 200 due requests
FAIL the harness's own dispatch slip is 5353ms against a 4766ms effect, 112%
```

The request count does not notice: the schedule is computed from the index, so an
awaiting loop still walks every slot and dispatches all of them, just late. What
notices is the slip.

Every gate here was written with its failure reproduced first.

## Licence

MIT.
