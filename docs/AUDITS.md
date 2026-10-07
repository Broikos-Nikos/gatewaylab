# The audits

Commit messages cite identifiers like `GALIC-F1`. This is what they refer to.

No audit pass has been run against this project yet. Every finding here was
raised by a sweep of a class found in another project in the same workspace,
which is why the identifiers read `GHEAD` and `GFOR` rather than a perspective.

**9 findings, 8 closed, 1 open**, across the 0 perspectives that produced them.

Held to the workspace queue this project is built from by
`tools/check-audit-status.mjs`, which fails if a row here says anything the
queue does not. Until tick 164 this file did not exist, and an identifier in a
sibling project's commit log pointed at nothing a reader could open.

## `self`, swept from elsewhere (not an audit pass)

Not a perspective and not an agent. Findings raised against this project while
a class found somewhere else in the workspace was being swept across all eight,
kept here because commit messages cite them like any other.

9 findings, 7 closed.

| id | severity | status | finding |
|---|---|---|---|
| `GALIC-F1` | medium | fixed, tick 118 | The README claims MIT and the repository carries no LICENSE file and no gate holding the claim |
| `GFOR-F1` | medium | fixed, tick 175 | Under forced colours the 76 slow marks become the same colour as the other 705, and the page is about the difference |
| `GGRP-F1` | medium | fixed, tick 182 | serve.mjs kills a process group the spawn never creates, so cleanup off Windows leaves the server running |
| `GHEAD-F1` | medium | fixed, tick 224 | The h1 ships empty and is written by script, so a slow or blocked load has no headline at all |
| `GMED-F1` | medium | fixed, tick 179 | Every published percentile was the sixth smallest of ten runs, called a median |
| `GPRO-F1` | medium | fixed, tick 181 | The claims header says figures are counted and only the latencies were swept, not the ten multiples |
| `GPRE-F1` | low | fixed, tick 165 | npm run verify started a server and handed the same missing browser to every gate in turn |
| `GPRO-F2` | low | fixed, tick 181 | check-promises' first rule asked for a variable name and failed a gate that was right |
| `GHEAD-F2` | low | open | The headline in index.html is held against the build and against nothing else |
