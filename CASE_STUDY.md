# Meridian — case study

**Domain:** financial modelling, corporate valuation, investment-banking analysis
**Category:** independent educational project, not a transaction mandate
**Data:** three fictional companies with invented peers, precedent deals, capital structures and forecasts

## The problem

A single DCF price is the least useful output of a valuation. Reviewers want to know what each method supports, which assumptions drive the answer, whether the terminal value is doing most of the work, and whether the methods agree with each other. They also expect the work to follow the conventions they read every day.

## What I built

- A five-year unlevered DCF with Gordon-growth or exit-multiple terminal value and optional mid-year discounting.
- Bear, base and bull scenarios applied as overlays on editable base-case inputs.
- A CAPM WACC build that can feed the model.
- Two sensitivity grids, a tornado chart and a football field that pulls every method onto one axis.
- Trading comparables and precedent transactions with implied value per share for each observation.
- A linked three-statement model on the same forecast, with a balance check.
- Automatic review points, for example when terminal value exceeds 75% of EV or when the two terminal methods disagree by more than 25%.
- A committee memo generated from the live model.

## What to look at

1. On **Summary** for Helios, read the first review point: the perpetual-growth terminal value implies about 6.8× EBITDA against a peer median above 10×. The football field shows the same gap.
2. Switch to **Bear** and **Bull** and watch every view update.
3. On **Model**, raise WACC by one point and confirm the price falls; press **Use this WACC** to adopt the CAPM figure.
4. On **Sensitivity**, check that the outlined grid cell equals the base price, and see which driver tops the tornado.
5. On **Statements**, change the dividend payout and confirm the balance sheet still balances.
6. Run `npm test`.

## What it shows

Command of forecast-driven valuation, the links between the three statements, sensitivity analysis and the presentation conventions of banking work. Relevant to valuation, financial modelling, FP&A and investment-banking analyst roles.

## What it does not show

A real mandate, audited or normalised financials, observed betas or market data, a verified comparables set, deal execution, or a fairness opinion.
