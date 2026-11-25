# Meridian valuation model in Excel

**[Download `Meridian_Valuation_Model.xlsx`](Meridian_Valuation_Model.xlsx)**

This is the same valuation as the web app, built as a live Excel model in investment-banking conventions. Every output is a formula, so you can change any blue input, or the company, scenario and discounting convention on the Cover, and the whole workbook recalculates.

**10 sheets · 776 formulas · 47 named ranges · 11 integrity checks**

| Sheet | What it does | Excel techniques |
|---|---|---|
| **Cover** | Pick the company, scenario (Bear/Base/Bull) and mid-year discounting from dropdowns; read the answer and the overall check status | Data validation lists, `MATCH`, conditional formatting |
| **Inputs** | Every hard-coded number, in blue: three companies, CAPM inputs, scenario overlays, statement assumptions, 12 peers and 9 precedent deals | Input/formula colour convention |
| **DCF** | Five-year unlevered free cash flow to value per share, by perpetual growth and by exit multiple, with each method's implied cross-check | `INDEX`/`MATCH` case selection, named ranges, bracketed negatives |
| **WACC** | CAPM cost of equity, after-tax cost of debt and target weights, compared with the WACC used | Build-up with linked inputs |
| **Comps** | Listed peers and precedent transactions applied to forward EBITDA: median, low, high and the deal premium | Two-key lookups (`ticker & "-" & n`), `MEDIAN`, `ROUND` |
| **Sensitivity** | Two 5 × 5 price grids: WACC × terminal growth, and WACC × exit multiple | Each cell revalues the whole DCF with one `SUMPRODUCT` (no Data Tables, so it recalculates instantly), colour scales |
| **Scenarios** | Bear, base and bull built side by side from the same overlay table | The DCF block reused three times |
| **Football field** | Every method's range on one chart | Stacked bar chart with an invisible base series, the standard pitch-book technique |
| **Statements** | Linked income statement, cash flow statement and balance sheet driven by the DCF forecast | Debt schedule, interest on opening debt, a balance check every year |
| **Checks** | Balance sheet balances; cash flow ties; EV bridge; grids centred on the base case; bear < base < bull; no error cells | `SUMPRODUCT(--ISERROR(...))`, `AND` over a range |

## How it is verified

[`verify_workbook.py`](verify_workbook.py) recalculates the workbook in LibreOffice for every combination of **3 companies × 3 scenarios × 2 discounting conventions**. In each case it compares the workbook with the web app's own engine ([`src/engine.js`](../src/engine.js)):

- every forecast line
- both 25-cell sensitivity grids
- all five football-field ranges
- the comps medians
- the CAPM WACC
- the five-year statements

```
18 cases, 1998 values compared, 0 mismatches (relative tolerance 1e-07)
```

For example, Helios in the base case is **₹143.155114780427** per share in Excel and ₹143.1551147804272 in the web app.

The check is proven to fail when it should. Changing one company's tax rate by half a point produced 552 mismatches and a failing exit code. It runs in CI on every push.

**A bug the reconciliation found:** the web app rounded the Helios peer median of 10.45× to an exit multiple of **10.4×**. JavaScript's `toFixed` works on the binary value 10.4499…, so it rounds down. Excel's `ROUND` gives 10.5×, which is the correct answer. The web engine now rounds half-up as Excel does, and a regression test covers it.

## Rebuild it

```bash
python3 excel/build_workbook.py     # needs openpyxl and Node 20+ (company data is read from src/engine.js)
python3 excel/verify_workbook.py    # needs LibreOffice (soffice) as well
```

The workbook was built and checked with LibreOffice Calc. It uses only functions common to Excel 2010 and later and to LibreOffice: `INDEX`, `MATCH`, `SUMPRODUCT`, `MEDIAN`, `ROUND`, `IF`, `AND`, `OR`, `ISERROR`, `MIN`, `MAX` and `ABS`. Its formatting has not been reviewed in desktop Excel.

---

Fictional companies, peers and deals. Not investment advice or a fairness opinion.
