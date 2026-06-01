# spec/

The source of truth for *what the game should do*.

- **DESIGN.md** — the living design vision (the "why" and the feel).
- **requirements.md** — the decomposed, ID'd requirements (the "what"), split into
  `[testable]` (enforced by the test suite + `spec:trace`) and `[design]`
  (verified by human/agent review).

Workflow: a change starts by adding or amending a requirement here, then a failing
test that references its ID, then the implementation. CI (`spec-check`) refuses to
let a `[testable]` requirement exist without a test.
