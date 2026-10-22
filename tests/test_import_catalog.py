"""Offline tests require only the reviewed public data, not ignored raw sources."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('alt_import', ROOT/'scripts/import_catalog.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class ImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c=json.loads((ROOT/'public/data/catalog.json').read_text())
        cls.pages=json.loads((ROOT/'public/data/source-pages.json').read_text())
        cls.provenance=json.loads((ROOT/'public/data/provenance.json').read_text())
    def test_full_corpus_pages_and_source_pin(self):
        self.assertEqual(len(self.pages['pages']),34)
        self.assertEqual([p['page'] for p in self.pages['pages']],list(range(1,35)))
        self.assertEqual(self.provenance['files'][0]['sha256'],m.PIN)
        self.assertEqual(self.provenance['files'][0]['bytes'],932872)
        self.assertEqual(self.c['report']['rows'],917)
        self.assertEqual(sum(self.c['report']['sections'].values()),917)
        self.assertEqual(self.c['report']['unassigned_price_lines'],0)
        self.assertIn('Ausgabe vom 1. Juli 2026',self.pages['pages'][0]['text'])
    def test_every_row_and_all_rules_traceable(self):
        rules={r['id']:r for r in self.c['rules']}
        self.assertEqual(len(set(p['id'] for p in self.c['positions'])),917)
        for p in self.c['positions']:
            self.assertTrue(p['title'])
            self.assertLessEqual(p['source']['y_min'],p['source']['y_max'])
            self.assertIn(p['source']['pdf_page'],range(1,35))
            for id in p['rule_ids']:self.assertIn(id,rules)
            if p['price']['kind']=='graduated_chf':
                qs=[float(x['quantity']) for x in p['price']['cells']]
                self.assertEqual(qs,sorted(set(qs)))
        self.assertIn('1.10 Teilabgabe',rules['general']['text'])
        self.assertIn('F Teilabgabe',rules['II-rules']['text'])
    def test_source_specific_quantities_thousands_limits_and_prices(self):
        by_title={p['title']:p for p in self.c['positions']}
        self.assertEqual(by_title['Albendazolum Ph. Eur.']['price']['cells'][-1]['chf'],'4530.31')
        self.assertEqual(by_title['Captoprilum Ph. Eur.']['price']['cells'][-2]['chf'],'4959.17')
        self.assertEqual(by_title['Emulgatoren']['price']['cells'][0]['quantity'],'0.1')
        self.assertEqual(by_title['Farbstoffe']['price']['cells'][1]['quantity'],'0.1')
        self.assertEqual(by_title['Compressi lactosi (Buka) 50 Stück']['price']['kind'],'fixed_chf')
        self.assertIn('Anxiolyse',by_title['Midazolamum hydrochloridum DAC']['notes'])
        self.assertIn('L',by_title['Midazolamum hydrochloridum DAC']['flags'])
        self.assertIn('L',by_title['Ivermectinum Ph. Eur.']['flags'])
        self.assertEqual(by_title['Bacitracinum (x 1000 U.I) Ph. Eur.']['price']['kind'],'reference_only')
        self.assertTrue(any('keine besondere Gebühr' in p['notes'] for p in self.c['positions'] if p['code']=='E'))
    def test_decimal_parser_preserves_and_rejects(self):
        self.assertEqual(m.decimal("2'831.44"),'2831.44')
        self.assertEqual(m.decimal('4’959.17'),'4959.17')
        for raw in ['1.5','1,50','CHF 1.50','nan','1e3','-1.50','1.50 ']:
            with self.assertRaises(ValueError):m.decimal(raw)
    def test_coordinate_grouping_and_source_identity(self):
        lines=m.lines_from_words([{'text':'B','xMin':10,'xMax':15,'yMin':12,'yMax':22},{'text':'A','xMin':0,'xMax':5,'yMin':12.2,'yMax':22.2}])
        self.assertEqual(lines[0]['text'],'A B')
        r=m.base_row('I','literal',8,76.355,88)
        self.assertEqual(r['id'],'alt-I-p08-y07636')
        self.assertEqual(r['source']['pdf_page'],8)
    def test_table_parser_assigns_exact_columns_and_rejects_orphans(self):
        page=ET.Element('{'+m.NS['h']+'}page')
        def word(value,x1,y,x2):
            el=ET.SubElement(page,'{'+m.NS['h']+'}word',{'xMin':str(x1),'xMax':str(x2),'yMin':str(y),'yMax':str(y+10.035)})
            el.text=value
            return el
        for q,x1,x2 in [('0.001',242.1,264.9),('0.01',280,299.9),('0.1',320,331.5),('1',360.9,366.05),('10',390.9,401.09),('100',426,442.5),('500',470,488.8),('1000',514,537.6)]:word(q,x1,48.255,x2)
        word('Präparate,',79.584,53.5,120)
        word('Absinthii herba Ph. Eur.',79.584,76.355,200)
        word('0.10',348.43,76.355,366.016)
        word('0.40',383.47,76.355,401.056)
        word('3.50',424.87,76.355,442.456)
        rows=m.table_rows(page,8,'I')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['title'],'Absinthii herba Ph. Eur.')
        self.assertEqual([(c['quantity'],c['chf']) for c in rows[0]['price']['cells']],[('1','0.10'),('10','0.40'),('100','3.50')])
        # An orphan price is a hard error; it must not be silently dropped.
        word('0.40',383.47,110,401.056)
        with self.assertRaisesRegex(ValueError,'Unassigned source price'):m.table_rows(page,8,'I')
    def test_unreviewed_original_is_rejected_before_external_extraction(self):
        from unittest.mock import patch
        class FakePDF:
            def read_bytes(self):return b'%PDF-unreviewed'
        with patch.object(m.subprocess,'check_output') as extraction:
            with self.assertRaisesRegex(ValueError,'hash'):m.import_pdf(FakePDF(),{})
            extraction.assert_not_called()
    def test_original_page_coverage_for_last_items(self):
        self.assertIn('Zuckercouleur',self.pages['pages'][24]['text'])
        self.assertIn('Gelatinekapseln No 00: 25 Stück',self.pages['pages'][33]['text'])
        self.assertEqual(sum(p['section']=='III' for p in self.c['positions']),46)
        self.assertEqual(sum(p['section']=='II' for p in self.c['positions']),31)

if __name__=='__main__':unittest.main()
