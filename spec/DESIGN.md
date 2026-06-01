# MANDATE — Game Design Sketch (v2)
*Working title*

## High concept
A narrow-but-deep grand-strategy game in the Paradox / 4X tradition, anchored in the real mechanics of central banking. You chair a Federal-Reserve-style central bank: read a living economy through imperfect data, win over a committee, steer the most powerful policy levers in the world — and protect the one thing that makes any of it work, your **credibility**. Not as wide as a Paradox map game, but far deeper on monetary policy, supervision, and the institution itself.

## Design north stars
- **Realism first.** The economic model is genuinely simulated; only some of it is visible to the player. You are the single most powerful actor over the economy and still subject to its whims.
- **Accessibility = legibility, not simplification.** Every number on screen must answer four questions on demand: what it measures, how it connects to the rest of the machine, how your levers move it, and how much you can trust it right now. Complexity (including the full international layer) stays; opacity does not.
- **The institution hums below your notice.** Most of the org runs itself. What reaches you is what your staff chooses to escalate. Building the institution = earning the right to pay attention to less.

## Genre & pillars
Real-time-with-pause grand strategy, calendar-driven, with scheduled set-piece meetings. Pillars, in order of centrality:
1. **Monetary policy** — the spine.
2. **Supervision & regulation** — the strong B-plot.
3. **Communication & politics** — the pressure around everything.
4. **Crisis management** — punctuation, not the main event.

## The emotional engine: credibility & independence
- **Credibility** is your core resource and your score — never spent, only earned or lost. High credibility anchors expectations, so words do real work and small moves suffice. Low credibility lets expectations drift, inflation turns self-fulfilling, and every goal costs more pain. Earned by honoring guidance, hitting the mandate, and clear communication; bled by surprises, flip-flops, and visibly caving.
- **Independence** is the paired axis. You almost can't be fired (see governance), so the thing you fear losing is not your job but your *ability to do it*. The late-game threat is **fiscal dominance**: once government debt is high enough, political and market pressure to keep rates low — so the debt stays serviceable — becomes a direct assault on your independence.
- **Lags.** Policy works on long and variable lags. You always act on a forecast, never on the present. This is the source of nearly all the tension.

## The central views (the "map")
- **The financial system as a living network.** Institutions are nodes (sized by assets, colored by health); exposures are edges; credit and liquidity are flows. Supervision becomes spatial — you watch fragility concentrate and contagion propagate along real links, and your capital/leverage rules reshape the graph.
- **The economy as sectors** (labor, housing, manufacturing, prices) with the macro dials layered on top.
- The **data fog** sits over both and lifts as you build research, data, and infrastructure capacity.

## Core loop & the day-to-day
Time flows continuously; you pause to think and act.
1. **Data trickles in** on a calendar — jobs, inflation, GDP, stability indicators — noisy and revisable.
2. **The org escalates.** Division heads run routine operations autonomously and surface only what matters. Good staff = clean signal; weak or wrong-temperament staff floods you with noise or sits on the thing that becomes next year's crisis.
3. **Form a view.** Research turns raw data into a forecast, sharper the more you've invested.
4. **Meet & decide** at scheduled FOMC meetings — the high-stakes set pieces: build consensus, set the rate, draft the statement.
5. **Communicate** — every word moves expectations.
6. **Watch it unfold** over months on a lag, then adjust.

## Governance & the committee (real Fed rules as mechanics)
- **Board of Governors:** 14-year staggered terms; one seat opens roughly every two years. You reshape the Board slowly and always inherit predecessors' appointees — a slow strategic layer, never a free hand.
- **The Chair:** appointed from among the governors; **4-year renewable term** sitting on top of the 14-year governorship. Removal only **"for cause"** — so firing is near-impossible, and your *soft continue-gate* is **reappointment**: the President must renominate and the Senate confirm, making it a political referendum on your record (ties directly to credibility & independence).
- **The FOMC:** 7 governors + the NY Fed president (permanent vote) + 4 of the other 11 regional presidents rotating annually; all regional presidents attend and participate, but the votable room changes each year. The Chair **builds consensus** among those present to set the rate, then drafts the statement. **Minutes** release ~3 weeks later; **full transcripts** ~5 years later — a delayed-accountability hook (today's candor can resurface as a public event).
- **Governor portfolios:** the **Vice Chair for Supervision is statutory** (Dodd-Frank, 2010); other assignments (operations, etc.) are convention. You delegate oversight to governors whose competence and lean then shape those functions.
- **Conventions as choices:** testify before Congress twice yearly (conventionally Feb & July) — scheduled political set pieces for spending/earning political capital; resigning your governorship at the end of your chairmanship is optional, with real precedent for staying on (Eccles).

## Personnel — "the draft"
You recruit and develop the heads of the real divisions from a **talent market you compete in** (against academia, Wall Street, peer central banks). Each head has competence, an ideological lean, and traits that generate stories — the brilliant academic who can't communicate; the market veteran soft on regulation; the hardliner who fortifies the balance sheet and makes an enemy of every bank CEO. They have ambitions: they get poached, angle for your chair, or leak.

**Real divisions (staffable slots):** Research & Statistics, Monetary Affairs, International Finance, Financial Stability, Supervision & Regulation, RBOPS (Reserve Bank Operations & Payment Systems), Consumer & Community Affairs, Legal, Office of the COO, OIG. OIG and the Law Enforcement Unit report directly to the Chair; the COO is hired by the Board, typically reports to the operations governor, and picks the CTO/CDO/CIO/CAIO.

**The regulatory constellation (peer actors, not subordinates):** FDIC, OCC, CFPB, SEC — independent, coordinated via the **FSOC** (Treasury chairs; you hold a seat). Their leaders are characters you negotiate, ally, or clash with.

## The institution & its resources
- **Operating budget** — builds and staffs divisions and lifts the data fog. Grows with good stewardship (the Fed self-funds), so you're a builder, not a supplicant.
- **Political capital** — Congress-facing; spent on structural moves (new authorities) and defending independence; earned through outcomes and relationships (testimony).
- **Credibility** — never spent; score and effectiveness multiplier.
Talent is what budget buys.

## Tech: three trees + a doctrine layer
Strictly-beneficial unlocks (a tool, a bonus, or an option to enact) in the Paradox sense; the tradeoff is **opportunity cost** — neglected branches stay dark. Research speed per tree scales with the responsible functionary's expertise and traits, so staffing tilts your development path.
- **Theory & Frameworks** — Phillips curve, natural rate, rational expectations, time-inconsistency/credibility theory, DSGE. Improves forecasting and unlocks framework *options*.
- **Applied Policy & Operations** — OMO refinement, QE & the lower-bound kit, standing facilities, stress-test methodology, macroprudential tools, payment rails. Unlocks deployable actions.
- **Data & Infrastructure** — statistics, computing/mainframes, nowcasting, ML forecasting, real-time data. Lifts the fog and *speeds the other two trees*.

**Diffusion vs. pioneering (Paradox-style):** some advances arrive from outside (academia or a peer central bank develops them; your Research strength sets absorption speed); others you can pioneer first for prestige and credibility.

**Divisions are tech-gated:** no IT division until you unlock computing (your '90s formation); CDO and a CAIO light up later still. The org chart grows as the tree advances, on the same screen as research progress.

**Doctrine layer (separate from tech):** adopting a framework like inflation targeting is a *commitment*, not a free unlock. The tree unlocks the option (pure gain — now you *can*); adopting it as your operating doctrine binds you publicly and reshapes your credibility mechanics. Changing doctrine later carries credibility costs (flip-flopping is exactly what de-anchors expectations).

## Fiscal policy & the external world (the exogenous engine)
- **Government / Treasury is a fully autonomous AI actor** (or historical script): spending, taxes, deficits, debt issuance — none of which you control, all of which often move the outlook more than you do. Stimulus overheats you into leaning against the elected government; austerity forces easing while you look complicit; a debt-ceiling standoff is a stability shock you didn't cause and can't fix.
- **You have influence, not control.** Testimony and credibility can nudge probabilities and market reactions, never the lever itself.
- **Emergent geopolitics.** The government drifts by weighted, state-conditioned tendencies — a hawkish administration with fiscal slack makes a war event *more likely*, never certain.

## The world model (full international)
A domestic economy embedded in a global one: exchange rates, capital flows, trade, and **peer central banks** that set their own policy and react to yours. As reserve-currency issuer, your moves ripple outward; coordination (swap lines, joint action) and spillovers (a foreign crisis washing ashore) both matter. Kept legible by the four-question rule rather than by cutting depth.

## Events — organic, never random
Trigger-and-weight, state-conditioned, in three buckets:
- **Endogenous (consequences):** a housing bubble inflates because credit stayed loose; a bank's risk grows because you deregulated.
- **Exogenous (weather):** oil shocks, pandemics, foreign crises, wars — a reserved set genuinely unrelated to you, preserving humility.
- **Fiscal / political:** elections, stimulus, debt-ceiling fights, a populist who wants you gone.

## Win, lose & run structure
- **Win = fulfill the mission, sustained.** Keep the mandate satisfied within tolerance for a defined tenure/horizon. The **mandate is configurable**: *single* (price stability) lets you be more ruthless on employment; *dual* (price stability + maximum employment) forces the real trade-off and is the richer default. Eras/regions can ship different mandates.
- **Soft continue-gate:** reappointment every four years — a political referendum, not a firing risk.
- **Lose = the foundation collapses:** credibility craters and expectations de-anchor into a spiral, or independence erodes until you're effectively captured.
- **Content:** authored historical scenarios — founding-era Fed, 1970s stagflation, 2008, COVID — that start you at different institutional maturity, tech, and mandate; plus a procedural dynamic campaign playable "from the beginning or now." Historical scenarios are a difficulty ramp and teaching ladder, not the only way to play.

## Biggest design challenges (solve early)
- Making "watch the data" tense — lean on the forecast-bet, committee friction, and credibility-on-the-line.
- Surfacing invisible variables (expectations, credibility) so they're *felt* in the UI.
- Keeping the international layer legible via the four-question rule rather than cuts.
- Avoiding the late-game "perfect info = boring" trap — preserve the lag, shocks, and autonomous fiscal/political pressure so you can know the present perfectly and still be betting on the future.

## Open forks for next pass
- **Banking-network granularity:** named individual institutions you can inspect as nodes, or aggregated clusters? (Earlier call favored system-wide rules over hands-on exams — likely aggregated nodes with a few named systemically-important ones.)
- **FSOC peers:** mechanically active actors (negotiation, turf, joint action) or primarily flavor/event hooks?
- **Reappointment stakes:** how punishing should a denied reappointment be — full game-over, or continue as a lame-duck/legacy mode?

## What to prototype first (vertical slice)
Strip to the core loop and test whether it's *fun* before building breadth: one historical scenario, one mandate; rate + forward guidance only (no balance sheet, international, or supervision yet); the committee, credibility, expectations, and 3–4 data series with fog and lags modeled. The question to answer: *is reading noisy data, persuading the room, and betting on a forecast satisfying on its own?* Everything else is amplification.
