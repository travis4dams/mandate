# Content Reference

Auto-generated from `schemas/*.json`. Do not edit by hand — run `npm run docs:gen`.

## Content types

### Scenario

An initial game state. Logic only — name and desc are localization keys, not inline player-facing strings.

**Id pattern:** `^scen\.[a-z0-9_]+$`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Stable unique id, e.g. scen.1979_stagflation. |
| `date` | string | yes | ISO year-month start date, e.g. 1979-08. |
| `name` | string | yes | Localization key for the scenario title, e.g. scen.1979_stagflation.name. |
| `desc` | string | yes | Localization key for the scenario description, e.g. scen.1979_stagflation.desc. |
| `vars` | object | yes | Initial continuous economic and institutional variables. |
| `flags` | object | yes | Initial boolean world facts. |
| `playable` | boolean | no | True for scenarios offered by the start screen; absent for test fixtures. |
| `briefing` | string | no | Optional briefing content id for this scenario's meetings. |

**Example:** [`content/scenarios/1979_stagflation.json`](content/scenarios/1979_stagflation.json)

### Doctrine

An adoptable framework. Standing effects apply while adopted; abandoning incurs a credibility flip-flop cost.

**Id pattern:** `^doctrine\.[a-z0-9_]+$`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes |  |
| `name` | string | yes | Localization key. |
| `description` | string | yes | Localization key. |
| `standing_effects` | array | no |  |
| `meeting_hook` | string | no | Optional hook name. When present, proposeRate will invoke the corresponding meet |
| `flip_flop_cost` | number | yes | Credibility deducted when switching away or abandoning. |

**Example:** [`content/doctrines/gradualism.json`](content/doctrines/gradualism.json)

### Briefing

A staff briefing with exactly three policy-scenario branches (raise/hold/lower), each carrying a macro forecast payload. All player-facing text is localization keys. Shape is stable for SPEC-BRIEF-2 quality scoring.

**Id pattern:** `^brief\.[a-z0-9_]+$`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Stable unique id, e.g. brief.1979_q3_stagflation. |
| `name` | string | yes | Localization key for the briefing title, e.g. brief.1979_q3_stagflation.name. |
| `desc` | string | yes | Localization key for the briefing summary, e.g. brief.1979_q3_stagflation.desc. |
| `scenarios` | array | yes | Exactly three policy-scenario branches in order: raise, hold, lower. |

**Example:** [`content/briefings/1979_q3_stagflation.json`](content/briefings/1979_q3_stagflation.json)

### Hearing

A confirmation-hearing content type. Questions and answers deterministically select the starting scenario and accumulate state modifiers. All player-facing text is localization keys.

**Id pattern:** `^hearing\.[a-z0-9_]+$`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Stable unique id, e.g. hearing.confirmation. |
| `name` | string | yes | Localization key for the hearing title. |
| `desc` | string | yes | Localization key for the hearing description. |
| `questions` | array | yes | Ordered list of questions posed to the incoming Chair. |

**Example:** [`content/hearings/confirmation.json`](content/hearings/confirmation.json)

### Event

A weighted, condition-gated event. Logic only. All display text is referenced by localization key and lives in content/localization.

**Id pattern:** `^evt\.[a-z0-9_]+$`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Stable unique id, e.g. evt.oil_shock. |
| `category` | enum | yes | exogenous = weather unrelated to the player; endogenous = consequence of game st |
| `title` | string | yes | Localization key for the headline. |
| `desc` | string | no | Localization key for the body text. |
| `fires_once` | boolean | no |  |
| `trigger` | ref | no | Conditions under which the event is eligible to fire. Omit for always-eligible. |
| `mean_time_to_happen` | object | no | Paradox-style MTTH. Lower effective days = more likely. Modifiers multiply base_ |
| `options` | array | yes | Player choices. Each applies a list of effects. |

**Example:** [`content/events/oil_shock.json`](content/events/oil_shock.json)

### Technology

A strictly-beneficial unlock node in one of the three research trees. Adopting a tech never imposes a penalty; the only cost is the opportunity cost of research spent elsewhere.

**Id pattern:** `^tech\.(theory|applied|infrastructure)\.[a-z0-9_]+$`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes |  |
| `tree` | enum | yes | theory = macro frameworks; applied = deployable tools/ops; infrastructure = data |
| `name` | string | yes | Localization key. |
| `description` | string | no | Localization key. |
| `prerequisites` | array | no |  |
| `cost` | object | yes |  |
| `diffusion` | object | no |  |
| `unlocks` | object | no | What becomes available. All entries are gains. |

**Example:** [`content/tech/applied.json`](content/tech/applied.json)

### Trait

A named committee-member trait. SPEC-COMM-5: each trait declares always-on effects (preferred_rate_shift, band_modifier) and optional signal-reactive hooks that are dormant until the referenced world-state series exists.

**Id pattern:** `^trait\.[a-z0-9_]+$`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Stable unique trait id, e.g. trait.hawkish_lean. |
| `name` | string | yes | Localization key for the trait name. |
| `desc` | string | yes | Localization key for the trait description. |
| `effects` | object | yes | Always-on effects applied every meeting regardless of world-state signal. |
| `signal_hooks` | array | yes | Signal-reactive effects declared but dormant until the referenced world-state se |

**Example:** [`content/traits/catalog.json`](content/traits/catalog.json)

### Committee

An FOMC-style committee. SPEC-COMM-3: each member carries continuous Taylor-rule reaction coefficients (inflation_coef, output_coef, inertia) rather than the older hawkish/dovish/neutral trichotomy. Empirical anchors live in docs/research/2026-06-02-fomc-empirical-anchors.md. SPEC-COMM-4: each member carries their own compromise_band for per-member dissent judgement.

**Id pattern:** `^comm\.[a-z0-9_]+$`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Stable unique id, e.g. comm.fomc_1979. |
| `name` | string | yes | Localization key for the committee name, e.g. comm.fomc_1979.name. |
| `desc` | string | yes | Localization key for the committee description, e.g. comm.fomc_1979.desc. |
| `members` | array | yes | Voting members of the committee. |

**Example:** [`content/committees/1979.json`](content/committees/1979.json)

### Replay

A committed player-strategy artifact: a structured capture of the player's actions (policy pivots) that can be replayed headlessly against the current engine. Engine-computed values (inflation, credibility, expectations_anchor) must NOT appear here.

**Id pattern:** `^replay\.[a-z0-9_]+$`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Stable unique id, e.g. replay.1979_chair_tightening. |
| `name` | string | yes | Localization key for the replay title, e.g. replay.1979_chair_tightening.name. |
| `desc` | string | yes | Localization key for the replay description, e.g. replay.1979_chair_tightening.d |
| `scenario` | string | yes | Scenario id this strategy is played against, e.g. scen.1979_stagflation. |
| `actions` | array | yes | Ordered list of player actions (policy pivots). Only player-controlled inputs —  |

**Example:** [`content/replays/1979_chair_tightening.json`](content/replays/1979_chair_tightening.json)

## Engine parameter files

Engine parameters live in `content/engine/` and are validated by per-section schemas.
They are not player-authored content — they tune the simulation internals.

| Schema | Content file(s) | Description |
| --- | --- | --- |
| `schemas/tick.schema.json` | `content/engine/tick.json` | Clock tick parameters. SPEC-SIM-3: history_size bounds state.history length. |
| `schemas/fog.schema.json` | `content/engine/fog.json` | Per-series fog parameters. SPEC-FOG-1: noise_scale and lag_months for each obser |
| `schemas/credibility.schema.json` | `content/engine/credibility.json` | Expectations & credibility parameters. SPEC-CRED-4 (continuous credibility-weigh |
| `schemas/committee-params.schema.json` | `content/engine/committee.json` | FOMC committee vote parameters. SPEC-COMM-3: the per-member preferred-rate formu |
| `schemas/dynamics.schema.json` | `content/engine/dynamics.json` | Macro dynamics parameters. SPEC-SIM-5: real-rate transmission (inflation + unemp |
| `schemas/guidance.schema.json` | `content/engine/guidance.json` | Forward-guidance params: stance multipliers on the expectations re-anchoring pul |
| `schemas/lags.schema.json` | `content/engine/lags.json` | Distributed-lag kernel weights. SPEC-LAG-1: policy_to_output_gap maps past real- |
| `schemas/mandate.schema.json` | `content/engine/mandate.json` | Mandate evaluator parameters. SPEC-MANDATE-1: inflation and unemployment targets |
| `schemas/meeting-schedule.schema.json` | `content/engine/meeting-schedule.json` | FOMC meeting schedule: the set of months in which a meeting can occur. SPEC-SESS |
| `schemas/productivity.schema.json` | `content/engine/productivity.json` | Total-factor productivity drift params. SPEC-PROD-1. |
| `schemas/shocks.schema.json` | `content/engine/shocks.json` | Parameters governing the seeded supply-shock term added to Phillips curve inflat |
| `schemas/term-structure.schema.json` | `content/engine/term-structure.json` | EWMA half-life for long_rate convergence toward policy_rate. SPEC-TERM-1. |
| `schemas/clock-cadence.schema.json` | `content/engine/clock-cadence.json` | Simulation tick cadence. SPEC-SIM-6: ticks_per_month parameterises the sub-month |
| `schemas/forecast-quality.schema.json` | `content/engine/forecast-quality.json` | Parameters governing how organizational investment in research capacity reduces  |
| `schemas/chair-capital.schema.json` | `content/engine/chair-capital.json` | SPEC-COMM-7: Chair capital persuasion parameters. The per-meeting budget is comp |
| `schemas/dot-plot-params.schema.json` | `content/engine/dot-plot.json` | Parameters governing the dot-plot doctrine's per-meeting anchoring bonus and spr |
| `schemas/calibration-thresholds.schema.json` | `content/engine/calibration-thresholds.json` | Maximum acceptable RMSE values per metric. SPEC-CAL-3: thresholds are content-go |
| `schemas/calibration.schema.json` | `content/engine/calibration-thresholds.json` | A committed real-world time-series baseline used to compare engine output agains |
| `schemas/state-manual.schema.json` | — | Hand-owned repo metadata — human intent that no generator ever writes. |
