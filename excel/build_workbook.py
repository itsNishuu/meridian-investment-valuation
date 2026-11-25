"""Build Meridian's valuation model as a formula-driven Excel workbook.

Every output is a live Excel formula: change a blue input or a selector on the Cover sheet and the
whole model recalculates. Conventions: blue = input, black = formula, green = link to another sheet.
Run:  python3 excel/build_workbook.py      ->  excel/Meridian_Valuation_Model.xlsx
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.axis import ChartLines
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation

HERE = Path(__file__).resolve().parent
OUT = HERE / 'Meridian_Valuation_Model.xlsx'

NAVY, OXBLOOD, INK, MUTED, RULE = '0F2645', '8C2A35', '142033', '5A6880', 'D3D9E2'
F_TITLE = Font(name='Calibri', size=18, bold=True, color=NAVY)
F_H = Font(name='Calibri', size=11, bold=True, color='FFFFFF')
F_SUB = Font(name='Calibri', size=11, bold=True, color=NAVY)
F_IN = Font(name='Calibri', size=11, color='0000FF')
F_CALC = Font(name='Calibri', size=11, color='000000')
F_LINK = Font(name='Calibri', size=11, color='008000')
F_BOLD = Font(name='Calibri', size=11, bold=True, color='000000')
F_NOTE = Font(name='Calibri', size=9, italic=True, color=MUTED)
FILL_H = PatternFill('solid', fgColor=NAVY)
FILL_IN = PatternFill('solid', fgColor='FFF7E0')
FILL_KEY = PatternFill('solid', fgColor='E6EBF2')
THIN = Side(style='thin', color=RULE)
TOP = Border(top=Side(style='thin', color=INK))
BOX = Border(left=Side(style='medium', color=OXBLOOD), right=Side(style='medium', color=OXBLOOD), top=Side(style='medium', color=OXBLOOD), bottom=Side(style='medium', color=OXBLOOD))

CR = '#,##0.0;(#,##0.0);"–"'
PCT = '0.0%;(0.0%);"–"'
PCT2 = '0.00%'
PRICE = '"₹"#,##0.00;("₹"#,##0.00)'
MULT = '0.0"x"'
DF = '0.0000'
COLS = 'CDEFGH'          # C = FY26A base year, D..H = forecast years 1..5
YEARS = 'DEFGH'


def load_companies():
    """Company data comes straight from the web app's engine, so the two can never disagree on inputs."""
    js = ("import('./src/engine.js').then(({COMPANIES, SCENARIOS}) => "
          "console.log(JSON.stringify({companies: COMPANIES, scenarios: SCENARIOS})))")
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=HERE.parent, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def name(wb, key, ref):
    wb.defined_names[key] = DefinedName(key, attr_text=ref)


def header(ws, row, labels, start='B'):
    c0 = ord(start)
    for i, text in enumerate(labels):
        cell = ws[f'{chr(c0 + i)}{row}']
        cell.value, cell.font, cell.fill = text, F_H, FILL_H
        cell.alignment = Alignment(horizontal='left' if i == 0 else 'right')


def put(ws, ref, value, font=F_CALC, fmt=None, fill=None, bold=False):
    c = ws[ref]
    c.value = value
    c.font = Font(name=font.name, size=font.size, color=font.color, bold=bold or font.bold, italic=font.italic)
    if fmt:
        c.number_format = fmt
    if fill:
        c.fill = fill
    return c


def title(ws, text, sub):
    put(ws, 'B2', text, F_TITLE)
    put(ws, 'B3', sub, F_NOTE)
    ws.sheet_view.showGridLines = False
    ws.column_dimensions['A'].width = 2


# ---------------------------------------------------------------- sheets
def build_inputs(wb, data):
    ws = wb.create_sheet('Inputs')
    title(ws, 'Inputs', 'All hard-coded assumptions live here, in blue. Figures in ₹ crore unless stated. Fictional companies.')
    ws.column_dimensions['B'].width = 34
    for col in 'CDE':
        ws.column_dimensions[col].width = 26
    ws.column_dimensions['F'].width = 40
    header(ws, 4, ['Assumption', 'Company 1', 'Company 2', 'Company 3', 'Note'])
    rows = [
        ('name', 'Company', None, ''), ('id', 'Ticker', None, ''), ('sector', 'Sector', None, ''),
        ('revenue', 'Revenue, FY26A', CR, '₹ crore'), ('growth1', 'Revenue growth, year 1', PCT, 'Moves linearly to year 5'),
        ('growth5', 'Revenue growth, year 5', PCT, ''), ('margin1', 'EBIT margin, year 1', PCT, 'Moves linearly to year 5'),
        ('margin5', 'EBIT margin, year 5', PCT, ''), ('taxRate', 'Tax rate', PCT, ''), ('daPct', 'D&A / revenue', PCT, ''),
        ('capexPct', 'Capex / revenue', PCT, ''), ('nwcPct', 'NWC / incremental revenue', PCT, ''),
        ('wacc', 'WACC', PCT, 'Used in the DCF; see WACC sheet'), ('terminalGrowth', 'Terminal growth', PCT, 'Perpetual growth after year 5'),
        ('debt', 'Debt', CR, '₹ crore'), ('cash', 'Cash', CR, '₹ crore'), ('shares', 'Diluted shares', '#,##0.0', 'crore'),
    ]
    r = 5
    for key, label, fmt, note in rows:
        put(ws, f'B{r}', label)
        for i, c in enumerate(data['companies']):
            put(ws, f'{"CDE"[i]}{r}', c[key], F_IN, fmt, FILL_IN)
        put(ws, f'F{r}', note, F_NOTE)
        r += 1
    # r is now 22
    put(ws, 'B23', 'Cost of capital (CAPM)', F_SUB)
    capm = [('rf', 'Risk-free rate', PCT), ('erp', 'Equity risk premium', PCT), ('beta', 'Beta', '0.00'), ('kd', 'Pre-tax cost of debt', PCT), ('dv', 'Target debt / capital', PCT)]
    for i, (key, label, fmt) in enumerate(capm):
        put(ws, f'B{24 + i}', label)
        for j, c in enumerate(data['companies']):
            put(ws, f'{"CDE"[j]}{24 + i}', c['capm'][key], F_IN, fmt, FILL_IN)
    header(ws, 30, ['Scenario overlay (added to the base case)', 'Bear', 'Base', 'Bull', 'Note'])
    sc = data['scenarios']
    for i, (key, label) in enumerate([('growth', 'Revenue growth shift'), ('margin', 'EBIT margin shift'), ('wacc', 'WACC shift'), ('terminalGrowth', 'Terminal growth shift')]):
        put(ws, f'B{31 + i}', label)
        for j, s in enumerate(['bear', 'base', 'bull']):
            put(ws, f'{"CDE"[j]}{31 + i}', sc[s][key], F_IN, PCT, FILL_IN)
    put(ws, 'B36', 'Three-statement assumptions', F_SUB)
    for i, (label, v, fmt) in enumerate([('Interest rate on debt', 0.09, PCT), ('Annual debt repayment', 30, CR), ('Opening PP&E / revenue', 0.36, PCT), ('Dividend payout', 0, PCT)]):
        put(ws, f'B{37 + i}', label)
        put(ws, f'C{37 + i}', v, F_IN, fmt, FILL_IN)
    name(wb, 'Interest_Rate', 'Inputs!$C$37')
    name(wb, 'Repayment', 'Inputs!$C$38')
    name(wb, 'PPE_to_Sales', 'Inputs!$C$39')
    name(wb, 'Payout', 'Inputs!$C$40')

    header(ws, 43, ['Key', 'Ticker', '#', 'Listed peer', 'EV / EBITDA', 'Growth', 'EBIT margin'])
    ws.column_dimensions['G'].width = 12
    ws.column_dimensions['H'].width = 12
    r = 44
    for c in data['companies']:
        for i, p in enumerate(c['peers'], 1):
            put(ws, f'B{r}', f'=C{r}&"-"&D{r}')
            put(ws, f'C{r}', c['id'], F_IN)
            put(ws, f'D{r}', i, F_IN)
            put(ws, f'E{r}', p['name'], F_IN)
            put(ws, f'F{r}', p['multiple'], F_IN, MULT, FILL_IN)
            put(ws, f'G{r}', p['growth'], F_IN, PCT)
            put(ws, f'H{r}', p['margin'], F_IN, PCT)
            r += 1
    peer_end = r - 1
    header(ws, r + 1, ['Key', 'Ticker', '#', 'Precedent target', 'EV / EBITDA', 'Year', 'Acquirer'])
    r += 2
    prec_start = r
    for c in data['companies']:
        for i, p in enumerate(c['precedents'], 1):
            put(ws, f'B{r}', f'=C{r}&"-"&D{r}')
            put(ws, f'C{r}', c['id'], F_IN)
            put(ws, f'D{r}', i, F_IN)
            put(ws, f'E{r}', p['target'], F_IN)
            put(ws, f'F{r}', p['multiple'], F_IN, MULT, FILL_IN)
            put(ws, f'G{r}', p['year'], F_IN)
            put(ws, f'H{r}', p['acquirer'], F_IN)
            r += 1
    ws.freeze_panes = 'C5'
    return {'peers': (44, peer_end), 'precedents': (prec_start, r - 1)}


ASSUMPTIONS = [  # key, label, input row, scenario-shift row, format
    ('Revenue_Base', 'Revenue, FY26A', 8, None, CR), ('Growth_Y1', 'Revenue growth, year 1', 9, 31, PCT),
    ('Growth_Y5', 'Revenue growth, year 5', 10, 31, PCT), ('Margin_Y1', 'EBIT margin, year 1', 11, 32, PCT),
    ('Margin_Y5', 'EBIT margin, year 5', 12, 32, PCT), ('Tax_Rate', 'Tax rate', 13, None, PCT),
    ('DA_Pct', 'D&A / revenue', 14, None, PCT), ('Capex_Pct', 'Capex / revenue', 15, None, PCT),
    ('NWC_Pct', 'NWC / incremental revenue', 16, None, PCT), ('WACC', 'WACC', 17, 33, PCT),
    ('Terminal_g', 'Terminal growth', 18, 34, PCT), ('Debt', 'Debt', 19, None, CR), ('Cash', 'Cash', 20, None, CR),
    ('Shares', 'Diluted shares (crore)', 21, None, '#,##0.0'),
]


def dcf_block(ws, top: int, scenario: str, prefix: str = '', wb=None):
    """Write a full assumptions + forecast + valuation block. Returns a dict of key cell references.
    scenario is an Excel expression for the scenario index (1 bear, 2 base, 3 bull)."""
    sheet = ws.title
    ref = {}
    put(ws, f'B{top}', 'Assumptions for this case', F_SUB)
    r = top + 1
    for key, label, row, shift, fmt in ASSUMPTIONS:
        f = f'=INDEX(Inputs!$C${row}:$E${row},CoIdx)'
        if shift:
            f += f'+INDEX(Inputs!$C${shift}:$E${shift},{scenario})'
        put(ws, f'B{r}', label)
        put(ws, f'C{r}', f, F_LINK, fmt)
        ref[key] = f'{sheet}!$C${r}'
        if wb is not None and not prefix:
            name(wb, key, f'{sheet}!$C${r}')
        r += 1
    A = {k: (k if not prefix else ref[k].split('!')[1]) for k in ref}   # names on the main sheet, cell refs elsewhere

    r += 1
    header(ws, r, ['₹ crore', 'FY26A', 'FY27E', 'FY28E', 'FY29E', 'FY30E', 'FY31E'])
    rows = {}
    labels = [('year', 'Forecast year', '0'), ('t', 'Interpolation weight', '0.00'), ('growth', 'Revenue growth', PCT),
              ('margin', 'EBIT margin', PCT), ('revenue', 'Revenue', CR), ('ebit', 'EBIT', CR), ('da', 'D&A', CR),
              ('ebitda', 'EBITDA', CR), ('tax', 'Tax on EBIT', CR), ('nopat', 'NOPAT', CR), ('capex', 'Less: capex', CR),
              ('nwc', 'Less: increase in NWC', CR), ('ufcf', 'Unlevered free cash flow', CR), ('period', 'Discount period (years)', '0.0'),
              ('df', 'Discount factor', DF), ('pv', 'Present value of UFCF', CR)]
    for i, (k, label, _) in enumerate(labels):
        rows[k] = r + 1 + i
    for k, label, fmt in labels:
        rr = rows[k]
        put(ws, f'B{rr}', label, F_BOLD if k in ('revenue', 'ebitda', 'ufcf') else F_CALC)
        for i, col in enumerate(YEARS):
            prev = COLS[i]
            f = {
                'year': f'={i + 1}', 't': f'=({col}{rows["year"]}-1)/4',
                'growth': f'={A["Growth_Y1"]}+({A["Growth_Y5"]}-{A["Growth_Y1"]})*{col}{rows["t"]}',
                'margin': f'={A["Margin_Y1"]}+({A["Margin_Y5"]}-{A["Margin_Y1"]})*{col}{rows["t"]}',
                'revenue': f'={prev}{rows["revenue"]}*(1+{col}{rows["growth"]})',
                'ebit': f'={col}{rows["revenue"]}*{col}{rows["margin"]}', 'da': f'={col}{rows["revenue"]}*{A["DA_Pct"]}',
                'ebitda': f'={col}{rows["ebit"]}+{col}{rows["da"]}', 'tax': f'={col}{rows["ebit"]}*{A["Tax_Rate"]}',
                'nopat': f'={col}{rows["ebit"]}-{col}{rows["tax"]}', 'capex': f'=-{col}{rows["revenue"]}*{A["Capex_Pct"]}',
                'nwc': f'=-({col}{rows["revenue"]}-{prev}{rows["revenue"]})*{A["NWC_Pct"]}',
                'ufcf': f'={col}{rows["nopat"]}+{col}{rows["da"]}+{col}{rows["capex"]}+{col}{rows["nwc"]}',
                'period': f'={col}{rows["year"]}-0.5*MidYear', 'df': f'=1/(1+{A["WACC"]})^{col}{rows["period"]}',
                'pv': f'={col}{rows["ufcf"]}*{col}{rows["df"]}',
            }[k]
            put(ws, f'{col}{rr}', f, F_CALC, fmt, bold=k in ('revenue', 'ebitda', 'ufcf'))
        if k in ('ufcf', 'ebitda'):
            for col in COLS:
                ws[f'{col}{rr}'].border = TOP
    put(ws, f'C{rows["revenue"]}', f'={A["Revenue_Base"]}', F_LINK, CR, bold=True)
    r = rows['pv'] + 2

    def line(label, formula, fmt, key=None, bold=False):
        nonlocal r
        put(ws, f'B{r}', label, F_BOLD if bold else F_CALC)
        put(ws, f'C{r}', formula, F_CALC, fmt, bold=bold)
        if key:
            ref[key] = f'{sheet}!$C${r}'
        r += 1
        return f'C{r - 1}'

    put(ws, f'B{r}', 'Valuation: perpetual growth', F_SUB)
    r += 1
    sum_pv = line('Sum of PV of UFCF', f'=SUM(D{rows["pv"]}:H{rows["pv"]})', CR, 'sum_pv')
    tv = line('Terminal value (Gordon growth)', f'=H{rows["ufcf"]}*(1+{A["Terminal_g"]})/({A["WACC"]}-{A["Terminal_g"]})', CR, 'tv')
    pv_tv = line('PV of terminal value', f'={tv}/(1+{A["WACC"]})^5', CR, 'pv_tv')
    ev = line('Enterprise value', f'={sum_pv}+{pv_tv}', CR, 'ev', True)
    nd = line('Less: net debt', f'={A["Debt"]}-{A["Cash"]}', CR, 'net_debt')
    eq = line('Equity value', f'={ev}-{nd}', CR, 'equity', True)
    line('Value per share', f'={eq}/{A["Shares"]}', PRICE, 'price', True)
    ws[ref['price'].split('!')[1].replace('$', '')].border = BOX
    line('Terminal value as % of EV', f'={pv_tv}/{ev}', PCT, 'tv_share')
    line('Implied exit multiple (EV / EBITDA)', f'={tv}/H{rows["ebitda"]}', MULT, 'implied_mult')
    r += 1
    put(ws, f'B{r}', 'Valuation: exit multiple', F_SUB)
    r += 1
    em = line('Exit multiple (peer median, 1 dp)', '=Exit_Multiple', MULT, 'exit_mult')
    tvx = line('Terminal value (exit multiple)', f'=H{rows["ebitda"]}*{em}', CR, 'tv_exit')
    evx = line('Enterprise value', f'={sum_pv}+{tvx}/(1+{A["WACC"]})^5', CR, 'ev_exit', True)
    line('Value per share', f'=({evx}-{nd})/{A["Shares"]}', PRICE, 'price_exit', True)
    line('Implied perpetual growth', f'=({tvx}*{A["WACC"]}-H{rows["ufcf"]})/({tvx}+H{rows["ufcf"]})', PCT2, 'implied_g')
    ref.update({k: f'{sheet}!$D${v}:$H${v}' for k, v in rows.items()})
    ref['rows'] = rows
    ref['end'] = r
    return ref


def build_cover(wb, data):
    ws = wb.active
    ws.title = 'Cover'
    title(ws, 'Meridian valuation model', 'Five-year unlevered DCF, comparables, sensitivities and linked statements. Fictional companies; not investment advice.')
    ws.column_dimensions['B'].width = 34
    ws.column_dimensions['C'].width = 30
    ws.column_dimensions['D'].width = 4
    ws.column_dimensions['E'].width = 60
    put(ws, 'B5', 'Choose a case', F_SUB)
    names = [c['name'] for c in data['companies']]
    for r, (label, value) in enumerate([('Company', names[0]), ('Scenario', 'Base'), ('Mid-year discounting', 'No')], 6):
        put(ws, f'B{r}', label)
        put(ws, f'C{r}', value, F_IN, fill=FILL_IN)
    dv1 = DataValidation(type='list', formula1='=Inputs!$C$5:$E$5', allow_blank=False)
    dv2 = DataValidation(type='list', formula1='"Bear,Base,Bull"', allow_blank=False)
    dv3 = DataValidation(type='list', formula1='"Yes,No"', allow_blank=False)
    for dv, cell in ((dv1, 'C6'), (dv2, 'C7'), (dv3, 'C8')):
        ws.add_data_validation(dv)
        dv.add(cell)
    put(ws, 'B10', 'Company index', F_NOTE)
    put(ws, 'C10', '=MATCH(C6,Inputs!$C$5:$E$5,0)', F_CALC, '0')
    put(ws, 'B11', 'Scenario index', F_NOTE)
    put(ws, 'C11', '=MATCH(C7,Inputs!$C$30:$E$30,0)', F_CALC, '0')
    put(ws, 'B12', 'Mid-year flag', F_NOTE)
    put(ws, 'C12', '=IF(C8="Yes",1,0)', F_CALC, '0')
    put(ws, 'B13', 'Ticker', F_NOTE)
    put(ws, 'C13', '=INDEX(Inputs!$C$6:$E$6,C10)', F_CALC)
    name(wb, 'CoIdx', 'Cover!$C$10')
    name(wb, 'ScIdx', 'Cover!$C$11')
    name(wb, 'MidYear', 'Cover!$C$12')
    name(wb, 'CoId', 'Cover!$C$13')

    put(ws, 'B15', 'Answer', F_SUB)
    summary = [('DCF value per share (perpetual growth)', '=DCF_Price', PRICE), ('DCF value per share (exit multiple)', '=DCF_Price_Exit', PRICE),
               ('Trading comparables, median', '=Comps!$H$11', PRICE), ('Precedent transactions, median', '=Comps!$H$21', PRICE),
               ('Enterprise value (₹ crore)', '=DCF_EV', CR), ('Equity value (₹ crore)', '=DCF_Equity', CR),
               ('Terminal value as % of EV', '=DCF_TV_Share', PCT), ('Model checks', '=Checks!$C$4', None)]
    for i, (label, f, fmt) in enumerate(summary):
        put(ws, f'B{16 + i}', label)
        put(ws, f'C{16 + i}', f, F_LINK, fmt, bold=i == 0)
    ws['C16'].border = BOX
    ws.conditional_formatting.add('C23', CellIsRule(operator='equal', formula=['"ALL CHECKS PASS"'], font=Font(color='1E7B4F', bold=True)))
    ws.conditional_formatting.add('C23', CellIsRule(operator='notEqual', formula=['"ALL CHECKS PASS"'], font=Font(color='B13A3D', bold=True)))

    put(ws, 'E5', 'How to use', F_SUB)
    guide = ['Pick a company, scenario and discounting convention in the yellow cells.',
             'Every sheet recalculates; nothing is pasted as a value.',
             'Inputs: every assumption, in blue. Edit any of them.',
             'DCF: the selected case, forecast to price per share.',
             'WACC: CAPM build-up compared with the WACC used.',
             'Comps: listed peers and precedent deals.',
             'Sensitivity: price grids on WACC × growth and WACC × exit multiple.',
             'Scenarios: bear, base and bull side by side.',
             'Football field: every method on one chart.',
             'Statements: linked P&L, cash flow and balance sheet.',
             'Checks: integrity tests; the Cover shows the result.']
    for i, t in enumerate(guide):
        put(ws, f'E{6 + i}', t)
    put(ws, 'E18', 'Colour key', F_SUB)
    put(ws, 'E19', 'Blue: hard-coded input', F_IN)
    put(ws, 'E20', 'Black: formula on this sheet', F_CALC)
    put(ws, 'E21', 'Green: link from another sheet', F_LINK)
    put(ws, 'E23', 'Built by excel/build_workbook.py and reconciled to the web app by excel/verify_workbook.py.', F_NOTE)


def build_dcf(wb):
    ws = wb.create_sheet('DCF')
    title(ws, 'Discounted cash flow', '=INDEX(Inputs!$C$5:$E$5,CoIdx)&" · "&INDEX(Inputs!$C$30:$E$30,ScIdx)&" case · "&IF(MidYear=1,"mid-year","year-end")&" discounting · ₹ crore"')
    ws['B3'].font = F_NOTE
    ws.column_dimensions['B'].width = 38
    for col in COLS:
        ws.column_dimensions[col].width = 13
    ref = dcf_block(ws, 5, 'ScIdx', wb=wb)
    for key, nm in [('price', 'DCF_Price'), ('price_exit', 'DCF_Price_Exit'), ('ev', 'DCF_EV'), ('equity', 'DCF_Equity'),
                    ('tv_share', 'DCF_TV_Share'), ('net_debt', 'Net_Debt'), ('ufcf', 'UFCF_Row'), ('period', 'Period_Row'),
                    ('ebitda', 'EBITDA_Row'), ('implied_mult', 'Implied_Exit_Multiple')]:
        name(wb, nm, ref[key])
    rows = ref['rows']
    name(wb, 'UFCF_Y5', f'DCF!$H${rows["ufcf"]}')
    name(wb, 'EBITDA_Y5', f'DCF!$H${rows["ebitda"]}')
    name(wb, 'Fwd_EBITDA', f'DCF!$D${rows["ebitda"]}')
    ws.freeze_panes = 'C5'
    return ref


def build_wacc(wb):
    ws = wb.create_sheet('WACC')
    title(ws, 'Cost of capital', 'CAPM cost of equity and after-tax cost of debt, weighted by target capital structure.')
    ws.column_dimensions['B'].width = 36
    ws.column_dimensions['C'].width = 14
    items = [('Risk-free rate', '=INDEX(Inputs!$C$24:$E$24,CoIdx)', PCT, F_LINK), ('Beta', '=INDEX(Inputs!$C$26:$E$26,CoIdx)', '0.00', F_LINK),
             ('Equity risk premium', '=INDEX(Inputs!$C$25:$E$25,CoIdx)', PCT, F_LINK), ('Cost of equity', '=C5+C6*C7', PCT2, F_CALC),
             ('Pre-tax cost of debt', '=INDEX(Inputs!$C$27:$E$27,CoIdx)', PCT, F_LINK), ('Tax rate', '=Tax_Rate', PCT, F_LINK),
             ('After-tax cost of debt', '=C9*(1-C10)', PCT2, F_CALC), ('Debt / capital', '=INDEX(Inputs!$C$28:$E$28,CoIdx)', PCT, F_LINK),
             ('WACC (CAPM build)', '=(1-C12)*C8+C12*C11', PCT2, F_CALC), ('WACC used in the DCF (before scenario shift)', '=INDEX(Inputs!$C$17:$E$17,CoIdx)', PCT2, F_LINK),
             ('Difference (percentage points)', '=(C13-C14)*100', '0.00', F_CALC)]
    for i, (label, f, fmt, font) in enumerate(items):
        put(ws, f'B{5 + i}', label, F_BOLD if label.startswith('WACC (') else F_CALC)
        put(ws, f'C{5 + i}', f, font, fmt, bold=label.startswith('WACC ('))
    name(wb, 'WACC_CAPM', 'WACC!$C$13')
    put(ws, 'B17', 'The DCF uses the WACC on the Inputs sheet. The build-up here shows it is within a few tenths of a point of a CAPM estimate.', F_NOTE)


def build_comps(wb, tables):
    ws = wb.create_sheet('Comps')
    title(ws, 'Comparables', 'Listed peers and precedent transactions applied to forward (year 1) EBITDA. Multiples are invented teaching data.')
    ws.column_dimensions['B'].width = 30
    for col, w in zip('CDEFGH', (14, 12, 12, 16, 16, 16)):
        ws.column_dimensions[col].width = w
    p0, p1 = tables['peers']
    q0, q1 = tables['precedents']
    put(ws, 'B4', 'Forward EBITDA (₹ crore)')
    put(ws, 'C4', '=Fwd_EBITDA', F_LINK, CR)
    header(ws, 5, ['Listed peer', 'EV / EBITDA', 'Growth', 'EBIT margin', 'Implied EV', 'Implied equity', 'Value per share'])
    for i in range(4):
        r = 6 + i
        key = f'CoId&"-"&{i + 1}'
        m = f'MATCH({key},Inputs!$B${p0}:$B${p1},0)'
        put(ws, f'B{r}', f'=INDEX(Inputs!$E${p0}:$E${p1},{m})', F_LINK)
        put(ws, f'C{r}', f'=INDEX(Inputs!$F${p0}:$F${p1},{m})', F_LINK, MULT)
        put(ws, f'D{r}', f'=INDEX(Inputs!$G${p0}:$G${p1},{m})', F_LINK, PCT)
        put(ws, f'E{r}', f'=INDEX(Inputs!$H${p0}:$H${p1},{m})', F_LINK, PCT)
        put(ws, f'F{r}', f'=C{r}*$C$4', F_CALC, CR)
        put(ws, f'G{r}', f'=F{r}-Net_Debt', F_CALC, CR)
        put(ws, f'H{r}', f'=G{r}/Shares', F_CALC, PRICE)
    for r, label in zip((10, 11, 12, 13), ('Median multiple', 'Value at median', 'Low', 'High')):
        put(ws, f'B{r}', label, F_BOLD)
    put(ws, 'C10', '=MEDIAN(C6:C9)', F_CALC, MULT, bold=True)
    put(ws, 'H11', '=(C10*$C$4-Net_Debt)/Shares', F_CALC, PRICE, bold=True)
    put(ws, 'H12', '=MIN(H6:H9)', F_CALC, PRICE)
    put(ws, 'H13', '=MAX(H6:H9)', F_CALC, PRICE)
    name(wb, 'Peer_Median', 'Comps!$C$10')
    name(wb, 'Exit_Multiple', 'Comps!$C$14')
    put(ws, 'B14', 'Exit multiple for the DCF (median, 1 dp)', F_BOLD)
    put(ws, 'C14', '=ROUND(C10,1)', F_CALC, MULT, bold=True)

    header(ws, 16, ['Precedent target', 'EV / EBITDA', 'Year', 'Acquirer', 'Implied EV', 'Implied equity', 'Value per share'])
    for i in range(3):
        r = 17 + i
        key = f'CoId&"-"&{i + 1}'
        m = f'MATCH({key},Inputs!$B${q0}:$B${q1},0)'
        put(ws, f'B{r}', f'=INDEX(Inputs!$E${q0}:$E${q1},{m})', F_LINK)
        put(ws, f'C{r}', f'=INDEX(Inputs!$F${q0}:$F${q1},{m})', F_LINK, MULT)
        put(ws, f'D{r}', f'=INDEX(Inputs!$G${q0}:$G${q1},{m})', F_LINK, '0')
        put(ws, f'E{r}', f'=INDEX(Inputs!$H${q0}:$H${q1},{m})', F_LINK)
        put(ws, f'F{r}', f'=C{r}*$C$4', F_CALC, CR)
        put(ws, f'G{r}', f'=F{r}-Net_Debt', F_CALC, CR)
        put(ws, f'H{r}', f'=G{r}/Shares', F_CALC, PRICE)
    put(ws, 'B20', 'Median multiple', F_BOLD)
    put(ws, 'C20', '=MEDIAN(C17:C19)', F_CALC, MULT, bold=True)
    put(ws, 'B21', 'Value at median', F_BOLD)
    put(ws, 'H21', '=(C20*$C$4-Net_Debt)/Shares', F_CALC, PRICE, bold=True)
    put(ws, 'B22', 'Low', F_BOLD)
    put(ws, 'H22', '=MIN(H17:H19)', F_CALC, PRICE)
    put(ws, 'B23', 'High', F_BOLD)
    put(ws, 'H23', '=MAX(H17:H19)', F_CALC, PRICE)
    put(ws, 'B24', 'Premium of deals over trading comps (at median)', F_NOTE)
    put(ws, 'H24', '=H21/H11-1', F_CALC, PCT)


def build_sensitivity(wb):
    ws = wb.create_sheet('Sensitivity')
    title(ws, 'Sensitivity', 'Value per share recomputed in each cell with SUMPRODUCT over the forecast cash flows. Centre cell = base case.')
    ws.column_dimensions['B'].width = 26
    for col in 'CDEFG':
        ws.column_dimensions[col].width = 13
    grids = {}
    for top, kind in ((5, 'g'), (14, 'exit')):
        put(ws, f'B{top}', 'WACC (rows) × terminal growth (columns)' if kind == 'g' else 'WACC (rows) × exit EV / EBITDA (columns)', F_SUB)
        steps_c = (-0.01, -0.005, 0, 0.005, 0.01) if kind == 'g' else (-2, -1, 0, 1, 2)
        base_c = 'Terminal_g' if kind == 'g' else 'Exit_Multiple'
        for j, s in enumerate(steps_c):
            put(ws, f'{"CDEFG"[j]}{top + 1}', f'={base_c}+{s}', F_CALC, PCT if kind == 'g' else MULT, FILL_KEY, bold=True)
        for i, s in enumerate((-0.02, -0.01, 0, 0.01, 0.02)):
            r = top + 2 + i
            put(ws, f'B{r}', f'=WACC+{s}', F_CALC, PCT, FILL_KEY, bold=True)
            for j in range(5):
                c = 'CDEFG'[j]
                w, h = f'$B{r}', f'{c}${top + 1}'
                pv = f'SUMPRODUCT(UFCF_Row,(1+{w})^(-Period_Row))'
                if kind == 'g':
                    f = f'=IF(OR({w}<={h},{w}<=0.04),"n/a",({pv}+UFCF_Y5*(1+{h})/({w}-{h})/(1+{w})^5-Net_Debt)/Shares)'
                else:
                    f = f'=IF({w}<=0.04,"n/a",({pv}+EBITDA_Y5*{h}/(1+{w})^5-Net_Debt)/Shares)'
                put(ws, f'{c}{r}', f, F_CALC, PRICE)
        ws[f'E{top + 4}'].border = BOX
        rng = f'C{top + 2}:G{top + 6}'
        ws.conditional_formatting.add(rng, ColorScaleRule(start_type='min', start_color='F2D7DA', mid_type='percentile', mid_value=50, mid_color='FFFFFF', end_type='max', end_color='D5E3F0'))
        grids[kind] = (top + 2, rng)
    name(wb, 'Grid_Centre', 'Sensitivity!$E$9')
    name(wb, 'Exit_Grid_Centre', 'Sensitivity!$E$18')
    put(ws, 'B24', 'Cells marked n/a are where WACC is not above terminal growth (or is 4% or below), so the Gordon formula has no meaning.', F_NOTE)
    return grids


def build_scenarios(wb):
    ws = wb.create_sheet('Scenarios')
    title(ws, 'Scenarios', 'Bear, base and bull cases built side by side from the same inputs and overlay table, for the selected company.')
    ws.column_dimensions['B'].width = 38
    for col in COLS:
        ws.column_dimensions[col].width = 13
    prices = []
    top = 5
    for idx, label in ((1, 'Bear'), (2, 'Base'), (3, 'Bull')):
        put(ws, f'B{top}', f'{label} case', Font(name='Calibri', size=14, bold=True, color=OXBLOOD))
        ref = dcf_block(ws, top + 1, str(idx), prefix=label)
        prices.append(ref['price'])
        top = ref['end'] + 2
    for nm, p in zip(('Bear_Price', 'Base_Price', 'Bull_Price'), prices):
        name(wb, nm, p)


def build_football(wb):
    ws = wb.create_sheet('Football field')
    title(ws, 'Football field', 'Value per share by method. DCF ranges use the inner 3 × 3 of each sensitivity grid.')
    ws.column_dimensions['B'].width = 30
    for col in 'CDEF':
        ws.column_dimensions[col].width = 14
    header(ws, 5, ['Method', 'Low', 'High', 'Mid', 'Range'])
    rows = [('DCF, perpetual growth', '=MIN(Sensitivity!$D$8:$F$10)', '=MAX(Sensitivity!$D$8:$F$10)', '=DCF_Price'),
            ('DCF, exit multiple', '=MIN(Sensitivity!$D$17:$F$19)', '=MAX(Sensitivity!$D$17:$F$19)', '=DCF_Price_Exit'),
            ('Trading comparables', '=Comps!$H$12', '=Comps!$H$13', '=Comps!$H$11'),
            ('Precedent transactions', '=Comps!$H$22', '=Comps!$H$23', '=Comps!$H$21'),
            ('Bear to bull scenarios', '=MIN(Bear_Price,Base_Price,Bull_Price)', '=MAX(Bear_Price,Base_Price,Bull_Price)', '=Base_Price')]
    for i, (label, lo, hi, mid) in enumerate(rows):
        r = 6 + i
        put(ws, f'B{r}', label)
        put(ws, f'C{r}', lo, F_LINK, PRICE)
        put(ws, f'D{r}', hi, F_LINK, PRICE)
        put(ws, f'E{r}', mid, F_LINK, PRICE)
        put(ws, f'F{r}', f'=D{r}-C{r}', F_CALC, PRICE)
    ch = BarChart()
    ch.type, ch.grouping, ch.overlap = 'bar', 'stacked', 100
    ch.title = 'Value per share by method (₹)'
    ch.y_axis.title = '₹ per share'
    ch.add_data(Reference(ws, min_col=3, min_row=5, max_row=10), titles_from_data=True)
    ch.add_data(Reference(ws, min_col=6, min_row=5, max_row=10), titles_from_data=True)
    ch.set_categories(Reference(ws, min_col=2, min_row=6, max_row=10))
    ch.series[0].graphicalProperties.noFill = True
    ch.series[0].graphicalProperties.line.noFill = True
    ch.series[1].graphicalProperties.solidFill = NAVY
    ch.legend = None
    ch.x_axis.delete = False          # openpyxl 3.1 hides axes in Excel unless told otherwise
    ch.y_axis.delete = False
    ch.y_axis.number_format = '"₹"#,##0'
    ch.y_axis.majorGridlines = ChartLines()
    ch.x_axis.scaling.orientation = 'maxMin'
    ch.height, ch.width = 9, 20
    ws.add_chart(ch, 'B13')


def build_statements(wb, dcf):
    ws = wb.create_sheet('Statements')
    title(ws, 'Linked three statements', 'P&L, cash flow and balance sheet driven by the DCF forecast. The balance sheet must balance every year.')
    ws.column_dimensions['B'].width = 34
    for col in COLS:
        ws.column_dimensions[col].width = 13
    rows = dcf['rows']
    header(ws, 5, ['₹ crore', 'Opening', 'FY27E', 'FY28E', 'FY29E', 'FY30E', 'FY31E'])
    L = {}
    order = ['revenue', 'ebitda', 'da', 'ebit', 'interest', 'ebt', 'tax', 'ni', None, 'cf_ni', 'cf_da', 'cf_nwc', 'cfo', 'cfi',
             'principal', 'dividends', 'cff', 'net', None, 'cash', 'ppe', 'nwc', 'assets', 'debt', 'equity', 'le', 'check']
    labels = {'revenue': 'Revenue', 'ebitda': 'EBITDA', 'da': 'D&A', 'ebit': 'EBIT', 'interest': 'Interest', 'ebt': 'Profit before tax',
              'tax': 'Tax', 'ni': 'Net income', 'cf_ni': 'Net income', 'cf_da': 'Add: D&A', 'cf_nwc': 'Less: increase in NWC',
              'cfo': 'Cash from operations', 'cfi': 'Cash from investing (capex)', 'principal': 'Debt repaid', 'dividends': 'Dividends paid',
              'cff': 'Cash from financing', 'net': 'Net change in cash', 'cash': 'Cash', 'ppe': 'Net PP&E', 'nwc': 'Net working capital',
              'assets': 'Total assets', 'debt': 'Debt', 'equity': 'Equity', 'le': 'Total debt and equity', 'check': 'Balance check (assets − debt − equity)'}
    r = 6
    for k in order:
        if k is None:
            r += 1
            continue
        if k == 'revenue':
            put(ws, f'B{r}', 'Income statement', F_SUB)
            r += 1
        if k == 'cf_ni':
            put(ws, f'B{r - 1}', 'Cash flow statement', F_SUB)
        if k == 'cash':
            put(ws, f'B{r - 1}', 'Balance sheet', F_SUB)
        L[k] = r
        put(ws, f'B{r}', labels[k], F_BOLD if k in ('ni', 'cfo', 'net', 'assets', 'le', 'check') else F_CALC)
        r += 1
    put(ws, f'C{L["cash"]}', '=Cash', F_LINK, CR)
    put(ws, f'C{L["debt"]}', '=Debt', F_LINK, CR)
    put(ws, f'C{L["ppe"]}', '=Revenue_Base*PPE_to_Sales', F_CALC, CR)
    put(ws, f'C{L["nwc"]}', '=Revenue_Base*NWC_Pct', F_CALC, CR)
    put(ws, f'C{L["assets"]}', f'=C{L["cash"]}+C{L["ppe"]}+C{L["nwc"]}', F_CALC, CR, bold=True)
    put(ws, f'C{L["equity"]}', f'=C{L["assets"]}-C{L["debt"]}', F_CALC, CR)
    put(ws, f'C{L["le"]}', f'=C{L["debt"]}+C{L["equity"]}', F_CALC, CR, bold=True)
    put(ws, f'C{L["check"]}', f'=C{L["assets"]}-C{L["le"]}', F_CALC, '0.000000', bold=True)
    for i, c in enumerate(YEARS):
        p = COLS[i]
        f = {
            'revenue': (f'=DCF!{c}{rows["revenue"]}', F_LINK), 'ebitda': (f'=DCF!{c}{rows["ebitda"]}', F_LINK),
            'da': (f'=DCF!{c}{rows["da"]}', F_LINK), 'ebit': (f'=DCF!{c}{rows["ebit"]}', F_LINK),
            'interest': (f'={p}{L["debt"]}*Interest_Rate', F_CALC), 'ebt': (f'={c}{L["ebit"]}-{c}{L["interest"]}', F_CALC),
            'tax': (f'=MAX(0,{c}{L["ebt"]})*Tax_Rate', F_CALC), 'ni': (f'={c}{L["ebt"]}-{c}{L["tax"]}', F_CALC),
            'cf_ni': (f'={c}{L["ni"]}', F_CALC), 'cf_da': (f'={c}{L["da"]}', F_CALC),
            'cf_nwc': (f'=-({c}{L["nwc"]}-{p}{L["nwc"]})', F_CALC), 'cfo': (f'={c}{L["cf_ni"]}+{c}{L["cf_da"]}+{c}{L["cf_nwc"]}', F_CALC),
            'cfi': (f'=DCF!{c}{rows["capex"]}', F_LINK), 'principal': (f'=-MIN(Repayment,{p}{L["debt"]})', F_CALC),
            'dividends': (f'=-MAX(0,{c}{L["ni"]})*Payout', F_CALC), 'cff': (f'={c}{L["principal"]}+{c}{L["dividends"]}', F_CALC),
            'net': (f'={c}{L["cfo"]}+{c}{L["cfi"]}+{c}{L["cff"]}', F_CALC), 'cash': (f'={p}{L["cash"]}+{c}{L["net"]}', F_CALC),
            'ppe': (f'={p}{L["ppe"]}-{c}{L["cfi"]}-{c}{L["da"]}', F_CALC), 'nwc': (f'={c}{L["revenue"]}*NWC_Pct', F_CALC),
            'assets': (f'={c}{L["cash"]}+{c}{L["ppe"]}+{c}{L["nwc"]}', F_CALC), 'debt': (f'={p}{L["debt"]}+{c}{L["principal"]}', F_CALC),
            'equity': (f'={p}{L["equity"]}+{c}{L["ni"]}+{c}{L["dividends"]}', F_CALC), 'le': (f'={c}{L["debt"]}+{c}{L["equity"]}', F_CALC),
            'check': (f'={c}{L["assets"]}-{c}{L["le"]}', F_CALC),
        }
        for k, (formula, font) in f.items():
            put(ws, f'{c}{L[k]}', formula, font, '0.000000' if k == 'check' else CR, bold=k in ('ni', 'cfo', 'net', 'assets', 'le', 'check'))
    for k in ('ni', 'cfo', 'net', 'assets', 'le'):
        for c in COLS:
            ws[f'{c}{L[k]}'].border = TOP
    name(wb, 'BS_Check', f'Statements!$C${L["check"]}:$H${L["check"]}')
    name(wb, 'Net_Change_Cash', f'Statements!$D${L["net"]}:$H${L["net"]}')
    name(wb, 'Closing_Cash', f'Statements!$H${L["cash"]}')
    name(wb, 'Net_Income_Row', f'Statements!$D${L["ni"]}:$H${L["ni"]}')
    ws.freeze_panes = 'C6'
    return L


def build_checks(wb):
    ws = wb.create_sheet('Checks')
    title(ws, 'Model checks', 'Each test must be TRUE. The Cover sheet reports the overall result.')
    ws.column_dimensions['B'].width = 62
    ws.column_dimensions['C'].width = 22
    put(ws, 'B4', 'Overall', F_BOLD)
    checks = [
        ('Balance sheet balances in every year', '=SUMPRODUCT(ABS(BS_Check))<0.0001'),
        ('Cash flow ties to the change in cash on the balance sheet', '=ABS(SUM(Net_Change_Cash)-(Closing_Cash-Cash))<0.0001'),
        ('Enterprise value less net debt equals equity value', '=ABS(DCF_EV-Net_Debt-DCF_Equity)<0.0001'),
        ('Terminal growth is below WACC', '=Terminal_g<WACC'),
        ('Centre of the growth grid equals the DCF price', '=ABS(Grid_Centre-DCF_Price)<0.000001'),
        ('Centre of the exit grid equals the exit-multiple price', '=ABS(Exit_Grid_Centre-DCF_Price_Exit)<0.000001'),
        ('Bear < base < bull', '=AND(Bear_Price<Base_Price,Base_Price<Bull_Price)'),
        ('Scenario sheet base case equals the DCF sheet in the base case', '=OR(ScIdx<>2,ABS(Base_Price-DCF_Price)<0.000001)'),
        ('CAPM WACC is within 0.3 points of the WACC used', '=ABS(WACC_CAPM-INDEX(Inputs!$C$17:$E$17,CoIdx))<=0.003'),
        ('No calculation errors on the DCF sheet', '=SUMPRODUCT(--ISERROR(DCF!$C$5:$H$60))=0'),
        ('No calculation errors on the Statements sheet', '=SUMPRODUCT(--ISERROR(Statements!$C$5:$H$40))=0'),
    ]
    for i, (label, f) in enumerate(checks):
        put(ws, f'B{6 + i}', label)
        put(ws, f'C{6 + i}', f)
    last = 5 + len(checks)
    put(ws, 'C4', f'=IF(AND(C6:C{last}),"ALL CHECKS PASS","CHECK FAILED")', F_BOLD)
    ws.conditional_formatting.add(f'C6:C{last}', FormulaRule(formula=['C6=TRUE'], font=Font(color='1E7B4F', bold=True)))
    ws.conditional_formatting.add(f'C6:C{last}', FormulaRule(formula=['C6=FALSE'], font=Font(color='B13A3D', bold=True), fill=PatternFill('solid', fgColor='F7DCDC')))
    return len(checks)


def build():
    data = load_companies()
    wb = Workbook()
    build_cover(wb, data)
    tables = build_inputs(wb, data)
    dcf = build_dcf(wb)
    build_wacc(wb)
    build_comps(wb, tables)
    build_sensitivity(wb)
    build_scenarios(wb)
    build_football(wb)
    build_statements(wb, dcf)
    n = build_checks(wb)
    for ws in wb.worksheets:
        ws.sheet_properties.tabColor = NAVY if ws.title in ('Cover', 'Checks') else ('0000FF' if ws.title == 'Inputs' else RULE)
        ws.page_setup.orientation = 'landscape'
        ws.page_setup.fitToWidth = 1
        ws.sheet_properties.pageSetUpPr.fitToPage = True
    wb.properties.title = 'Meridian valuation model'
    wb.properties.creator = 'Meridian case study'
    wb.calculation.fullCalcOnLoad = True
    wb.save(OUT)
    formulas = sum(1 for ws in wb.worksheets for row in ws.iter_rows() for c in row if isinstance(c.value, str) and c.value.startswith('='))
    print(f'wrote {OUT.name}: {len(wb.worksheets)} sheets, {formulas} formulas, {len(wb.defined_names)} named ranges, {n} checks')


if __name__ == '__main__':
    build()
