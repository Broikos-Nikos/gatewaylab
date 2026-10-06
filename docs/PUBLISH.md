# Publishing gatewaylab

Everything the repository needs to exist on GitHub, written down before the
repository is created so that creating it is a transcription rather than a
series of small decisions taken at the API.

Written at tick 217, five days after the date `D15` gave this project, because
the release could not have happened on that date: there was no
`.github/workflows/pages.yml` in the tree, so turning Pages on would have
published nothing, and no file said what the About box should contain.

## The About box

**Description**, 350 characters or fewer, and it has to carry both numbers:

> One server that answers in 5ms and stalls for 400ms every 2000ms. A closed
> loop load harness reports 32.5ms at p95. An open loop harness reports 337ms.
> Both are measuring the same six seconds, and the difference is that one of
> them stops sending while the server is silent. The page draws why.

**Homepage**: `https://broikos-nikos.github.io/gatewaylab/`

**Topics**, ten, the maximum GitHub shows without a fold:

```
load-testing  benchmarking  performance  latency  coordinated-omission
observability  reproducible-research  typescript  data-visualization
distributed-systems
```

`coordinated-omission` is the one that matters. It is the name for the mistake
this page is about, somebody searching it is already arguing with a colleague
about a p95, and the thing nobody else has published is the picture: the open
loop's wedge of requests piling up under the band where the closed loop's row
is empty.

`load-testing` and `latency` are there for the readers who arrive without the
vocabulary, which is most of them.

## Settings

- **Public**, no wiki, no projects, no discussions. Issues on: a repository that
  calls one of two harnesses wrong should be reachable by somebody who thinks
  it has that backwards.
- **Pages**: source GitHub Actions, not a branch. The workflow builds, gates
  and deploys, and a branch source would publish whatever was committed
  regardless of whether the gates passed. Here that matters because the two
  headline numbers are recomputed from the committed run by `check:harness`,
  and a branch source would let a drifted pair reach a reader.
- **No default community files.** The MIT LICENSE is committed already, and
  `check:licence` fails if the README claims a licence the tree does not carry.

## The order, and why this order

1. **Create the repository** with the description, homepage and topics above, so
   the About box is never empty. `watch-it-think` shipped with an empty one and
   a recruiter audit filed it as a high finding: the ten second screen had no
   sentence on it.
2. **Push `main` with the whole history**, every commit authored
   `Nikos Broikos <broikos.nikolaos@gmail.com>`, none co-authored. One commit
   here was authored `Broikos-Nikos` until tick 217, when the branch was
   rewritten before any of it was public; the tree hash was identical
   afterwards and the diff against the pre-rewrite branch was empty.
3. **Turn Pages on** and let the workflow run. Nothing is deployed by hand.
4. **Wait for the deploy, then open the live URL in a browser and look at it.**
   A green deploy is not a working page.
5. **Put the live link in the first screen of the README**, above the picture.

## The one thing this page needs that the others do not

It opens on a still rather than a recording, and that is deliberate: the
argument is a shape that is already on screen when the page loads. The still is
produced by `npm run capture` and held to the live page by `check:capture`, so
"the picture is the page" is a checked claim here rather than a promise.
