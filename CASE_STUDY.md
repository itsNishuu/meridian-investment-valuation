# Meridian — Investment Valuation Lab

**Domain:** Financial modelling, corporate valuation, investment-banking research  
**Portfolio category:** Independent educational case study, not an actual M&A or investment banking mandate  
**Dataset:** Three entirely synthetic companies, peer multiples, capital structures and forecast assumptions.

## The problem

Company valuation requires a disciplined operating forecast and clear links from assumptions to cash flow, enterprise value, equity value and valuation sensitivity. It is rarely sufficient to display one unqualified share price.

## The demonstrator

- Editable five-year assumptions for sales growth, EBIT margins, tax, depreciation, capex, working capital, leverage and share capital.
- Five-year unlevered free-cash-flow forecast with end-of-year discounting and Gordon-growth terminal value.
- DCF enterprise-to-equity value bridge and ₹ per-share output.
- Sensitivity across five discount rates and five long-term growth assumptions.
- Fictional EV / forward EBITDA trading peers and hypothetical precedent transactions as valuation cross-checks.
- Exportable forecast CSV and investment-committee-style memo.

## The reviewer should examine

1. Select Helios Precision Systems and inspect the five forecast rows.
2. Increase WACC by 1pp; confirm DCF equity value decreases.
3. Increase long-term growth by 0.5pp; confirm DCF equity value increases.
4. Compare the mid-point of the WACC/g sensitivity matrix to the base DCF result.
5. Review all supporting caveats and inspect `tests/engines.test.mjs`.

## What it proves

Competence in the mechanics and communication of forecast-based valuation, sensitivity analysis and transaction-style analyst documentation. Appropriate portfolio evidence for Valuation Analyst, Financial Modelling Analyst and Investment Banking Analyst (transition) applications.

**Does not prove:** a real transaction mandate, audited three-statement financial model, certified valuation, validated precedent-transactions dataset, deal execution, investment performance, investment-banking associate tenure or real-world fairness analysis.
