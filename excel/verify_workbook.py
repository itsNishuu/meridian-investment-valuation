"""Recalculate the workbook in LibreOffice for every company x scenario x discounting case and
compare each output with the web app's engine (src/engine.js).

Run:  python3 excel/verify_workbook.py        (needs LibreOffice `soffice` and Node 20+)
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from openpyxl import load_workbook

HERE = Path(__file__).resolve().parent
BOOK = HERE / 'Meridian_Valuation_Model.xlsx'
SCEN = {'bear': 'Bear', 'base': 'Base', 'bull': 'Bull'}
TOL = 1e-7   # relative; both sides are IEEE doubles, so agreement is far tighter than this in practice


def reference():
    out = subprocess.run(['node', str(HERE / 'reference.mjs')], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def recalc(cases, tmp: Path):
    names = [c['name'] for c in json.loads(subprocess.run(
        ['node', '--input-type=module', '-e', "import('./src/engine.js').then(({COMPANIES}) => console.log(JSON.stringify(COMPANIES)))"],
        cwd=HERE.parent, capture_output=True, text=True, check=True).stdout)]
    files = []
    for i, case in enumerate(cases):
        wb = load_workbook(BOOK)
        ws = wb['Cover']
        ws['C6'] = names[case['company'] - 1]
        ws['C7'] = SCEN[case['scenario']]
        ws['C8'] = 'Yes' if case['midYear'] else 'No'
        f = tmp / f'case{i:02d}.xlsx'
        wb.save(f)
        files.append(f)
    outdir = tmp / 'calc'
    subprocess.run(['soffice', '--headless', '--calc', '--convert-to', 'xlsx', '--outdir', str(outdir), *map(str, files)],
                   capture_output=True, check=True)
    return [load_workbook(outdir / f.name, data_only=True) for f in files]


def row_values(ws, row, cols='DEFGH'):
    return [ws[f'{c}{row}'].value for c in cols]


def find_row(ws, label, col='B', start=1):
    for r in range(start, ws.max_row + 1):
        if ws[f'{col}{r}'].value == label:
            return r
    raise KeyError(label)


def compare(case, wb):
    failures, checked = [], 0

    def eq(what, got, want):
        nonlocal checked
        checked += 1
        if want is None:
            ok = got in (None, 'n/a')
        else:
            ok = isinstance(got, (int, float)) and abs(got - want) <= TOL * max(1.0, abs(want))
        if not ok:
            failures.append(f'{what}: workbook {got!r} vs engine {want!r}')

    dcf, sens, ff, st, cover, comps = wb['DCF'], wb['Sensitivity'], wb['Football field'], wb['Statements'], wb['Cover'], wb['Comps']
    for label, key in (('Revenue', 'revenue'), ('Unlevered free cash flow', 'ufcf'), ('Present value of UFCF', 'pv')):
        for y, (g, w) in enumerate(zip(row_values(dcf, find_row(dcf, label)), case[key]), 1):
            eq(f'{label} Y{y}', g, w)
    for label, key in (('Terminal value (Gordon growth)', 'terminalValue'), ('Value per share', 'price'),
                       ('Terminal value as % of EV', 'terminalShare'), ('Implied exit multiple (EV / EBITDA)', 'impliedExitMultiple'),
                       ('Exit multiple (peer median, 1 dp)', 'exitMultiple')):
        eq(label, dcf[f'C{find_row(dcf, label)}'].value, case[key])
    eq('Enterprise value', cover['C20'].value, case['enterpriseValue'])
    eq('Equity value', cover['C21'].value, case['equityValue'])
    eq('Exit-multiple price', cover['C17'].value, case['exitPrice'])
    eq('Trading comps median price', comps['H11'].value, case['tradingMedian'])
    eq('Precedents median price', comps['H21'].value, case['precedentMedian'])
    for gi, (top, key) in enumerate(((7, 'grid'), (16, 'exitGrid'))):
        for i in range(5):
            for j in range(5):
                eq(f'{key}[{i}][{j}]', sens[f'{"CDEFG"[j]}{top + i}'].value, case[key][i][j])
    for i, (lo, hi, mid) in enumerate(case['football']):
        r = 6 + i
        eq(f'football {ff[f"B{r}"].value} low', ff[f'C{r}'].value, lo)
        eq(f'football {ff[f"B{r}"].value} high', ff[f'D{r}'].value, hi)
        eq(f'football {ff[f"B{r}"].value} mid', ff[f'E{r}'].value, mid)
    eq('CAPM WACC', wb['WACC']['C13'].value, case['wacc'])
    rows = {k: find_row(st, label) for k, label in (('netIncome', 'Net income'), ('cash', 'Cash'), ('debt', 'Debt'), ('equity', 'Equity'))}
    for y, s in enumerate(case['statements']):
        col = 'DEFGH'[y]
        for k, r in rows.items():
            eq(f'Statements {k} Y{y + 1}', st[f'{col}{r}'].value, s[k])
    if wb['Checks']['C4'].value != 'ALL CHECKS PASS':
        failures.append(f"model checks: {wb['Checks']['C4'].value}")
    return checked, failures


def main():
    cases = reference()
    with tempfile.TemporaryDirectory() as tmp:
        books = recalc(cases, Path(tmp))
        total, bad = 0, 0
        for case, wb in zip(cases, books):
            n, fails = compare(case, wb)
            total += n
            tag = f"company {case['company']} {case['scenario']:<4} {'mid-year' if case['midYear'] else 'year-end'}"
            price = wb['Cover']['C16'].value
            print(f'{tag:<32} price {price:9.4f}  {n} values  {"OK" if not fails else "FAIL"}')
            for f in fails[:8]:
                print('   ', f)
            bad += len(fails)
    print(f'{len(cases)} cases, {total} values compared, {bad} mismatches (relative tolerance {TOL:g})')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
