"""Deterministic ALT importer. Poppler geometry, never OCR or guessed prices."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {'h': 'http://www.w3.org/1999/xhtml'}
PIN = '73a82c5e4dff4a7249c5e9db0c8c6918d006e847949ca4de4ef894c99fc78d2c'
DECIMAL = re.compile(r"^(?:\d{1,3}(?:['’]\d{3})+|\d+)\.\d{2}$")
SECTIONS = [
    {'id': 'I', 'title': 'I · Präparate, Wirk- und Hilfsstoffe', 'pages': [8, 25]},
    {'id': 'aroma', 'title': 'I · Aromatherapeutica / ätherische Öle', 'pages': [26, 27]},
    {'id': 'aux', 'title': 'I · Aromatherapeutica / Hilfsstoffe', 'pages': [28, 28]},
    {'id': 'oils', 'title': 'I · Fette Oele', 'pages': [29, 29]},
    {'id': 'blood', 'title': 'I · Blut- und Plasmapräparate', 'pages': [30, 30]},
    {'id': 'II', 'title': 'II · Bearbeitungstarif (Taxpunkte)', 'pages': [31, 32]},
    {'id': 'III', 'title': 'III · Gefässtarif (CHF)', 'pages': [33, 34]},
    {'id': 'general', 'title': '1.1 · Hilfsstoff-Maximalpreise', 'pages': [3, 3]},
]

def text(el):
    return ' '.join(w.text or '' for w in el.findall('.//h:word', NS))

def words(page):
    return [{'text': w.text or '', **{k: float(v) for k, v in w.attrib.items()}} for w in page.findall('.//h:word', NS)]

def lines_from_words(ws):
    out = []
    for w in sorted(ws, key=lambda w: (round(w['yMin'], 1), w['xMin'])):
        group = next((g for g in reversed(out[-3:]) if abs(g['y'] - w['yMin']) < 1), None)
        if group is None:
            group = {'y': w['yMin'], 'words': []}
            out.append(group)
        group['words'].append(w)
    for g in out:
        g['words'].sort(key=lambda w: w['xMin'])
        g['text'] = ' '.join(w['text'] for w in g['words'])
    return sorted(out, key=lambda g: g['y'])

def decimal(raw):
    if not DECIMAL.fullmatch(raw):
        raise ValueError(f'Not a source CHF decimal: {raw!r}')
    return raw.replace("'", '').replace('’', '')

def source(page, start, end=None):
    return {'pdf_page': page, 'y_min': round(start, 3), 'y_max': round(end if end is not None else start + 11, 3)}

def base_row(section, title, page, y, end, code=''):
    return {'id': f'alt-{section}-p{page:02d}-y{round(y * 100):05d}', 'code': code, 'title': title,
            'section': section, 'hierarchy': [section], 'unit': '', 'flags': [], 'notes': '',
            'price': {}, 'source': source(page, y, end), 'rule_ids': ['general', 'I-intro' if section in ['I', 'aroma', 'aux', 'oils', 'general'] else section + '-rules']}

def table_rows(page, number, section):
    ws = words(page)
    header = [w for w in ws if w['yMin'] < (130 if number == 26 else 90) and w['text'] in ['0.001', '0.01', '0.1', '1', '10', '100', '500', '1000']]
    # Choose the one header line containing the complete increasing quantity sequence.
    groups = lines_from_words(header)
    candidates = [g for g in groups if len(g['words']) >= 3]
    if len(candidates) != 1:
        raise ValueError(f'Ambiguous quantity header on page {number}')
    hs = candidates[0]['words']
    columns = [w['text'] for w in hs]
    rights = [w['xMax'] if number <= 25 else (w['xMin'] + w['xMax']) / 2 for w in hs]
    cutoff = hs[0]['xMin'] - (2 if number <= 25 else 20)
    top = candidates[0]['y'] + (25 if number < 26 else 12)
    bottom = 791
    price_words = [w for w in ws if top <= w['yMin'] < bottom and w['xMin'] >= cutoff and DECIMAL.fullmatch(w['text'])]
    prices = lines_from_words(price_words)
    title_left = min(w['xMin'] for w in ws if w['text'] in ['Präparate,', 'Liste', 'Fette']) if number < 30 else 0
    # On primary tables the flag gutter is left of the canonical title cell.
    if number <= 25:
        title_left = next(w['xMin'] for w in ws if w['text'] == 'Präparate,')
    left_lines = lines_from_words([w for w in ws if top <= w['yMin'] < bottom and title_left - 0.5 <= w['xMin'] < cutoff])
    # Stop following the title column once the full-width limitation begins;
    # continuation notes are retained in full below instead.
    groups = []
    for line in left_lines:
        if not groups or line['y'] - groups[-1][-1]['y'] >= 10.6:
            groups.append([])
        groups[-1].append(line)
    title_groups = []
    in_note = False
    for group in groups:
        label = ' '.join(g['text'] for g in group)
        has_price = any(group[0]['y'] - 1 <= p['y'] <= group[-1]['y'] + 1 for p in prices)
        if label.startswith('Die Vergütung'):
            in_note = True
        if in_note and not has_price:
            continue
        if has_price:
            in_note = False
        title_groups.append(group)
    out = []
    assigned = set()
    for i, group in enumerate(title_groups):
        y = group[0]['y']
        end = title_groups[i + 1][0]['y'] if i + 1 < len(title_groups) else bottom
        title = ' '.join(g['text'] for g in group)
        row = base_row(section, title, number, y, end)
        # A price must occur vertically inside the title's wrapped cell, not in its note.
        near = [(j, p) for j, p in enumerate(prices) if y - 1 <= p['y'] <= group[-1]['y'] + 1]
        if len(near) > 1:
            raise ValueError(f'Multiple price lines in title cell: {number} {title}')
        cells = []
        if near:
            j, p = near[0]
            assigned.add(j)
            used = set()
            for w in p['words']:
                if title.startswith('Compressi lactosi'):
                    if w['text'] != '12.00' or len(p['words']) != 1:
                        raise ValueError('Changed fixed Compressi pack price')
                    continue
                alignment = w['xMax'] if number <= 25 else (w['xMin'] + w['xMax']) / 2
                col = min(range(len(rights)), key=lambda j: abs(rights[j] - alignment))
                if abs(rights[col] - alignment) > 7 or col in used:
                    raise ValueError(f'Unproven column alignment: page {number}: {w}')
                used.add(col)
                cells.append({'quantity': columns[col], 'chf': decimal(w['text']), 'raw': w['text']})
        cells.sort(key=lambda c: float(c['quantity']))
        if title.startswith('Compressi lactosi'):
            row['price'] = {'kind': 'fixed_chf', 'chf': '12.00', 'raw': 'CHF 12.00'}
            row['unit'] = 'Packung à 50 Stück'
            row['hierarchy'].append('Packung')
        else:
            row['price'] = {'kind': 'graduated_chf' if cells else 'unpriced', 'cells': cells}
            explicit = re.search(r'\((g|ml)\)(?:\s|$)', title)
            row['unit'] = explicit.group(1) if explicit else 'g, ml (Quellkolonnen; keine Umrechnung)'
            if re.search(r'pro folie|\(x\s?1000|\(1 Mio\)', title, re.I):
                row['price']['kind'] = 'reference_only'
                row['unit'] = 'Sondereinheit im Originaltitel – Berechnung offen'
        gutter = [w['text'] for w in ws if w['xMin'] < title_left - 1 and y - 1 <= w['yMin'] < end and w['text'] in ['L', 'St']]
        row['flags'] = sorted(set(gutter))
        after = group[-1]['y'] + 10.5
        full_note = lines_from_words([w for w in ws if title_left - 0.5 <= w['xMin'] and after <= w['yMin'] < end - 0.5])
        row['notes'] = '\n'.join(g['text'] for g in full_note)
        out.append(row)
    missing = [p for j, p in enumerate(prices) if j not in assigned]
    if missing:
        raise ValueError(f'Unassigned source price lines on page {number}: {missing}')
    return out

def structured_tail(pages):
    out = []
    # Extract every labour tariff using its actual right-column numeric word.
    for number in [31, 32]:
        ws = words(pages[number - 1])
        ps = sorted([w for w in ws if w['xMin'] > 490 and re.fullmatch(r'\d+(?:\.\d+)?', w['text']) and w['yMin'] < 790], key=lambda w: w['yMin'])
        headings = [(w['yMin'], w['text']) for w in ws if w['xMin'] < 60 and w['text'] in list('ABCDEF')]
        # Group A's physical heading numbers and source letters remain separate.
        subheads = [(w['yMin'], w['text']) for w in ws if 60 < w['xMin'] < 75 and w['text'] in list('12345') and w['yMin'] < 790]
        for j, p in enumerate(ps):
            group = max((h for h in headings if h[0] < p['yMin']), default=(0, 'A'))[1]
            preceding_subs = [h for h in subheads if h[0] < p['yMin'] and h[0] > max((h[0] for h in headings if h[0] < p['yMin']), default=0)]
            sub = max(preceding_subs)[1] if preceding_subs else ''
            same = [w for w in ws if abs(w['yMin'] - p['yMin']) < 1 and 75 < w['xMin'] < 490]
            same.sort(key=lambda w: w['xMin'])
            label = ' '.join(w['text'] for w in same)
            if group == 'A':
                # Match the full multiline text cell surrounding its numeric baseline.
                start = p['yMin']
                if 'Füllen und Schliessen' in label:
                    nxt = [w for w in ws if p['yMin'] + 1 < w['yMin'] < p['yMin'] + 12 and 75 < w['xMin'] < 450]
                    label += ' ' + ' '.join(w['text'] for w in sorted(nxt, key=lambda w: w['xMin']))
            elif group in ['B', 'C', 'E', 'F']:
                start = max(h[0] for h in headings if h[1] == group)
                next_heading = min([h[0] for h in headings if h[0] > start] + [790])
                full = lines_from_words([w for w in ws if start + 12 < w['yMin'] < next_heading and w['xMin'] > 75 and w['xMax'] < 490 and w['text'] != 'Taxpunkt'])
                label = '\n'.join(g['text'] for g in full)
            else:
                start = p['yMin']
            letters = [w['text'] for w in ws if 60 < w['xMin'] < 75 and abs(w['yMin'] - p['yMin']) < 1 and w['text'] in list('abcdef')]
            code = group + ('.' + sub if sub else '') + ('.' + letters[0] if letters else '')
            group_title = next(g['text'] for g in lines_from_words(ws) if g['text'].startswith(group + ' '))
            context = []
            if group == 'A' and preceding_subs:
                sub_y = max(preceding_subs)[0]
                context = [g['text'] for g in lines_from_words([w for w in ws if abs(w['yMin']-sub_y)<1 and 75<w['xMin']<450])]
            elif group == 'D' and preceding_subs:
                sub_y = max(preceding_subs)[0]
                context = [g['text'] for g in lines_from_words([w for w in ws if sub_y<=w['yMin']<p['yMin'] and 75<w['xMin']<490]) if not g['text'].startswith(('Fertigspritze', 'Infusion', 'Kassette'))]
            source_note = label if group in ['B','C','E','F'] else ''
            row = base_row('II', group_title if source_note else label, number, start, p['yMax'], code)
            row['hierarchy'] = ['II', group_title] + context
            row['unit'] = 'ausgewählte Leistung / Zuschlagsblock (Originalumfang beachten)'
            row['price'] = {'kind': 'taxpoints', 'points': p['text'], 'chf_per_point': '1.05'}
            row['notes'] = source_note + ('\n\n' if source_note else '') + 'Keine automatische Addition eingeschlossener Arbeiten oder Zuschläge. Mengen beziehen sich auf den ausgewählten Leistungsblock, nicht automatisch auf Stückzahlen des Arzneimittels.'
            out.append(row)
    # Vessels: every price aligned in the final CHF column, complete preceding heading.
    group = ''
    vessel = ''
    for number in [33, 34]:
        ls = lines_from_words(words(pages[number - 1]))
        for k, l in enumerate(ls):
            if l['y'] > 790:
                continue
            if re.match(r'^[A-E] ', l['text']):
                group = l['text']
                vessel = ''
                continue
            ps = [w for w in l['words'] if DECIMAL.fullmatch(w['text']) and w['xMin'] > (480 if number == 33 else 240)]
            if ps:
                if len(ps) != 1:
                    raise ValueError('Ambiguous vessel price')
                p = ps[0]
                label = ' '.join(w['text'] for w in l['words'] if w is not p)
                row = base_row('III', (vessel + ' · ' if vessel else '') + label, number, l['y'], l['y'] + 11)
                row['hierarchy'] = ['III', group, vessel] if vessel else ['III', group]
                row['unit'] = 'Packung à 25 Stück' if '25 Stück' in label else 'Gefäss / ausgewählte Einheit'
                row['price'] = {'kind': 'fixed_chf', 'chf': decimal(p['text']), 'raw': p['text']}
                out.append(row)
            elif l['text'] not in ['CHF', 'Preis'] and not l['text'].startswith(('III.', 'Die Preise')):
                label = re.sub(r'\s+(?:Preis|CHF)$', '', l['text'])
                if label.startswith('(sogenannte'):
                    vessel += ' ' + label
                elif label:
                    vessel = label
    # Blood products: manufacturer prices are reference-only, never additive.
    number = 30
    ws = words(pages[number-1])
    price_lines = [g for g in lines_from_words(ws) if len([w for w in g['words'] if DECIMAL.fullmatch(w['text'])]) == 2]
    starts = [g['y'] for g in lines_from_words(ws) if g['text'].startswith(('Erythrozytenkonzentrat,', 'Plasma SRK'))]
    if len(price_lines) != 2 or len(starts) != 2:
        raise ValueError('Blood product shape changed')
    for i, (start, pl) in enumerate(zip(starts, price_lines)):
        end = starts[i+1] if i == 0 else next(g['y'] for g in lines_from_words(ws) if g['text'].startswith('* Im'))
        title = '\n'.join(g['text'] for g in lines_from_words([w for w in ws if start <= w['yMin'] < end and w['xMin'] < 260]))
        nums = [w for w in sorted(pl['words'], key=lambda w:w['xMin']) if DECIMAL.fullmatch(w['text'])]
        row = base_row('blood', title, number, start, end)
        row['unit'] = 'Beutel gemäss Originalvolumen'
        row['price'] = {'kind': 'fixed_chf', 'chf': decimal(nums[1]['text']), 'manufacturer_chf': decimal(nums[0]['text'])}
        row['notes'] = '* Im Abrechnungspreis enthalten ist eine Marge von 12% (inkl. Transportkosten); die Mehrwertsteuer ist im Abrechnungspreis nicht enthalten.'
        out.append(row)
    # The four unnamed but explicitly priced excipient categories in 1.1.
    ws = words(pages[2])
    hs = [w for w in ws if w['text'] in ['0.01', '0.1', '1', '10'] and 210 < w['yMin'] < 350]
    if len(hs) != 4:
        raise ValueError('General excipient header changed')
    rights = [w['xMax'] for w in sorted(hs, key=lambda w:w['xMin'])]
    columns = [w['text'] for w in sorted(hs, key=lambda w:w['xMin'])]
    ls = lines_from_words(ws)
    for label in ['Emulgatoren', 'Verdickungsmittel', 'Farbstoffe', 'Geschmacks- und']:
        g = next(g for g in ls if g['text'].startswith(label))
        if label == 'Geschmacks- und':
            start = g['y']; end = start + 24; title = 'Geschmacks- und Geruchskorrektoren'
        else:
            start = g['y']; end = start+11; title = label
        cells = []
        for w in ws:
            if start-1 <= w['yMin'] < end and DECIMAL.fullmatch(w['text']) and w['xMin'] > 250:
                eligible = [j for j, h in enumerate(sorted(hs, key=lambda h:h['xMin'])) if h['xMin'] <= (w['xMin'] + w['xMax']) / 2]
                if not eligible:
                    raise ValueError('Unassigned general excipient cell')
                col = max(eligible)
                if any(c['quantity'] == columns[col] for c in cells):
                    raise ValueError('Duplicate general quantity cell')
                cells.append({'quantity':columns[col], 'chf':decimal(w['text']), 'raw':w['text']})
        if not cells:
            raise ValueError('Empty excipient maximum price')
        row = base_row('general', title, 3, start, end)
        row['unit'] = 'g, ml (Quellkolonnen; keine Umrechnung)'
        row['price'] = {'kind':'graduated_chf', 'cells':cells}
        row['notes'] = 'Nur für nicht namentlich aufgeführte, zur Herstellung nach guter Herstellungspraxis erforderliche Hilfsstoffe; Allgemeine Bestimmungen 1.1 beachten.'
        out.append(row)
    return out

def import_pdf(pdf, manifest):
    raw = pdf.read_bytes()
    if hashlib.sha256(raw).hexdigest() != PIN:
        raise ValueError('Original PDF hash does not match the reviewed edition')
    bbox = subprocess.check_output(['pdftotext', '-bbox-layout', str(pdf), '-'])
    layout = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-']).decode()
    pages = ET.fromstring(bbox).findall('.//h:page', NS)
    texts = layout.split('\f')
    if len(pages) != 34 or len(texts) != 35 or texts[-1].strip():
        raise ValueError('Expected exactly 34 source pages')
    rows = []
    for n in range(8, 30):
        section = 'I' if n <=25 else 'aroma' if n <=27 else 'aux' if n==28 else 'oils'
        rows.extend(table_rows(pages[n-1], n, section))
    rows.extend(structured_tail(pages))
    rows.sort(key=lambda r:(r['source']['pdf_page'], r['source']['y_min']))
    if len({r['id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate source row identity')
    original_pages = [{'page': i+1, 'text': s.rstrip('\n')} for i,s in enumerate(texts[:-1])]
    rules = [
        {'id':'general', 'title':'1 · Allgemeine Bestimmungen 1.1–1.10', 'pages':[3,4,5,6]},
        {'id':'I-intro', 'title':'I · Einheiten, Abkürzungen, Qualitätsreferenzen', 'pages':[7]},
        {'id':'II-rules', 'title':'II · Vollständige Bearbeitungsregeln A–F', 'pages':[31,32]},
        {'id':'III-rules', 'title':'III · Gefässtarif und Packungsgrössen', 'pages':[33,34]},
        {'id':'blood-rules', 'title':'Blut- und Plasmapräparate / enthaltene Marge', 'pages':[30]},
    ]
    for rule in rules:
        rule['text'] = '\n\n'.join(original_pages[n-1]['text'] for n in rule['pages'])
    report = {'edition':'2026-07-01', 'pages':34, 'rows':len(rows), 'sections':{s['id']:sum(r['section']==s['id'] for r in rows) for s in SECTIONS}, 'price_kinds':{k:sum(r['price']['kind']==k for r in rows) for k in sorted({r['price']['kind'] for r in rows})}, 'method':'pdftotext -bbox-layout + -layout; geometrische Quellzeilen; kein OCR', 'unassigned_price_lines':0, 'warnings':['Nicht bepreiste Verweiszeilen bleiben offen.', 'Sondereinheiten ohne sichere Gramm-/Milliliterzuordnung sind nicht rechenbar.', 'Oberhalb des fünffachen höchsten Mengenansatzes nur die ausdrücklich genannten 5×/10×-Fälle berechnet; übrige Fälle offen.', 'Keine automatische Prüfung von Limitierungen, Herstellungsvoraussetzungen, Inklusivleistungen, Zuschlagsmengen oder Versicherungsanspruch.']}
    catalog = {'schema':1, 'edition':'2026-07-01', 'title':manifest['title'], 'source_sha256':PIN, 'sections':SECTIONS, 'positions':rows, 'rules':rules, 'report':report}
    return {'catalog.json':catalog, 'source-pages.json':{'edition':'2026-07-01','source_sha256':PIN,'pages':original_pages}, 'provenance.json':manifest, 'import-report.json':report}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, default=ROOT/'sources')
    parser.add_argument('--output-dir', type=Path, default=ROOT/'public/data')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    manifest = json.loads((args.source_dir/'manifest.json').read_text())
    outputs = import_pdf(args.source_dir/'alt-2026-07-01.pdf',manifest)
    for name, content in outputs.items():
        rendered = json.dumps(content,ensure_ascii=False,indent=2)+'\n'
        dest=args.output_dir/name
        if args.verify:
            if dest.read_text()!=rendered: raise ValueError(f'Non-reproducible output: {name}')
        else:
            dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_text(rendered)
    print(json.dumps(outputs['import-report.json'],ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
