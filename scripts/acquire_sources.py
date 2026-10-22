"""Fetch only the pinned public BAG original; no processing before archival."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import re
import html

ROOT = Path(__file__).resolve().parents[1]
PAGE = 'https://www.bag.admin.ch/de/arzneimittelliste-mit-tarif-alt'
PDF = 'https://www.bag.admin.ch/dam/de/sd-web/-HLD9iP4EcXL/Gesamtliste_ALT_Ausgabe%2001.07.2026.pdf'

def download(url, target):
    subprocess.run(['curl', '--fail', '-L', '--retry', '2', '--max-time', '90', '-sS', url, '-o', str(target)], check=True)
    return target.read_bytes()

def main():
    folder = ROOT / 'sources'
    folder.mkdir(parents=True, exist_ok=True)
    page = download(PAGE, folder / 'bag-alt.html')
    links = [html.unescape(s) for s in re.findall(r'href="([^"]+)"', page.decode())]
    if PDF not in links:
        raise ValueError('Pinned July 2026 complete original no longer linked; review source before changing pin.')
    pdf = download(PDF, folder / 'alt-2026-07-01.pdf')
    if not pdf.startswith(b'%PDF-'):
        raise ValueError('Not a PDF')
    manifest = {'title': 'Arzneimittelliste mit Tarif (ALT), Anhang 4 KLV', 'edition': '2026-07-01', 'publication_date': '2026-06-24', 'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'landing_url': PAGE, 'files': [{'file': 'alt-2026-07-01.pdf', 'url': PDF, 'bytes': len(pdf), 'sha256': hashlib.sha256(pdf).hexdigest()}, {'file': 'bag-alt.html', 'url': PAGE, 'bytes': len(page), 'sha256': hashlib.sha256(page).hexdigest()}]}
    (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
