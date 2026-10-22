# Datenumfang, Herkunft und Rechenvertrag

## Amtliche Primärquelle

- Herausgeber: Bundesamt für Gesundheit (BAG); ALT als **Anhang 4 der Krankenpflege-Leistungsverordnung**, SR 832.112.31, Art. 29.
- [Offizielle ALT-Seite](https://www.bag.admin.ch/de/arzneimittelliste-mit-tarif-alt).
- [Vollständiges PDF, Ausgabe 1. Juli 2026](https://www.bag.admin.ch/dam/de/sd-web/-HLD9iP4EcXL/Gesamtliste_ALT_Ausgabe%2001.07.2026.pdf), auf der BAG-Seite publiziert am **24. Juni 2026**. Das Datum der Ausgabe ist kein Abrufdatum.
- Original: **932872 Bytes**, 34 Seiten, SHA256 **73a82c5e4dff4a7249c5e9db0c8c6918d006e847949ca4de4ef894c99fc78d2c**.
- Abrufzeit und HTML-Quellenfingerabdruck: `public/data/provenance.json`. Der Zeitstempel stammt vom tatsächlichen Abruf. Keine Behauptung eines automatischen Aktualisierungsdienstes.
- Das Deckblatt/Seite 2 identifiziert den amtlichen Verordnungsanhang und die berücksichtigten EDI-Änderungen vom 9. Juni 2026 (AS 2026 336). Die BAG-Seite erläutert, dass die ALT selbst nicht in AS/SR veröffentlicht wird.

## Vollständiger extrahierter Umfang

| Bereich | Quellzeilen |
|---|---:|
| 1.1 nicht namentlich aufgeführte Hilfsstoff-Maximalpreise | 4 |
| I: Präparate, Wirk- und Hilfsstoffe | 752 |
| Aromatherapeutica / ätherische Öle | 64 |
| Aromatherapeutica / Hilfsstoffe | 7 |
| Fette Oele | 11 |
| Blut- und Plasmapräparate | 2 |
| II: Bearbeitungstarif | 31 |
| III: Gefässtarif | 46 |
| **Gesamt** | **917** |

Preisarten: 817 Mengenstaffelzeilen, 49 Fix-CHF-Zeilen, 31 Taxpunktzeilen, 4 Sondereinheiten mit Preisreferenz aber bewusst offener Berechnung, 16 Verweiszeilen ohne eigenen Preis. Verweise werden als Quellzeilen gezählt, nicht als zusätzliche eindeutig abrechenbare Arzneistoffe. Zwei Preisarten in einer Blutpräparate-Zeile sind keine zwei berechenbaren Positionen: der Fabrikabgabepreis ist reine Referenz, der Abrechnungspreis die einzige Rechenbasis. Keine Hersteller-/Vertriebs-/Transportmarge nochmals addieren.

Alle 34 Seiten sind als ursprünglicher `pdftotext -layout`-Text erhalten. Die Textextraktion ist **kein OCR**, keine medizinische Paraphrase und keine Übersetzung. Umbrüche/Abstände stammen aus dem PDF. Nichtpreisige Quellartefakte wie `+A323` werden im Titel nicht nachträglich „repariert“. Apostroph/typografischer Apostroph in Tausenderpreisen bleibt in `raw` erhalten und wird nur für die getrennte dezimale CHF-Zeichenfolge entfernt.

### Provenienz pro Quellzeile

`source.pdf_page`, `source.y_min`, `source.y_max` führen zur gedruckten PDF-Seite (einschliesslich Titelblättern) und zum geometrischen Tabellenbereich. Die ALT vergibt für die Stofftabellen keine Positionsnummern; `alt-…-p…-y…` sind **interne** stabile Quellzeilen-IDs dieser Ausgabe, keine amtlichen Abrechnungscodes. Für Bearbeitung bleiben vorhandene Quellcodes wie A.1.a erhalten; unletterte Zeilen können denselben Quellgruppencode haben und werden nur intern unterschieden. `hierarchy` enthält die Quellgruppierung, `rule_ids` verknüpft vollständige allgemeine/abschnittsbezogene Regeln, `notes` enthält den vollständigen individuellen Hinweis (u.a. Ivermectin, Miconazol, Midazolam). Die Details bieten den Originalkontext und sämtliche übergeordneten Regeln.

### Konservative Rechenregeln

- I: Preisstaffeln in CHF exkl. MWST. Spalten sind ausdrücklich 0.001/0.01/0.1/1/10/100/500/1000 beziehungsweise die jeweiligen Spalten der Aromatherapeutica und Hilfsstoffe. Keine Gleichsetzung eines solchen Zellwerts mit einem linearen Einheitsverkaufspreis.
- 1.7.2 a/b: nächstkleinere bezifferte Mengenbasis verwenden; proportional rechnen; nicht die nächste Spaltenpreisgrenze überschreiten; Minimum 10 Rp. Vor der ersten bezifferten Basis proportional und mindestens 10 Rp.
- 1.7.2 c: Materialzeilen mit exakten rationalen Rappenbeträgen auf 5 Rp.; Rest bis einschliesslich 2 Rp. abwärts, darüber aufwärts. Kein binäres Floating-Point für Geld.
- 1.7.2 d: genau fünffache höchste Mengenbasis → viereinhalbfacher höchster Ansatz; genau zehnfache → achtfacher Ansatz. Andere Mengen ab fünffacher Basis bleiben offen, da keine zusätzliche Interpolations-/Stufenregel erfunden wird. Regeltext im Ergebnis.
- Sonderangaben wie „pro folie“, „x 1000 U.I“, „1 Mio“ bleiben trotz numerischer Referenzpreise **unberechnet**; keine ungesicherte Einheitentransformation.
- II: Taxpunkte × CHF 1.05 exkl. MWST, genau mit BigInt-Brüchen. Benutzer wählt ganze Anzahlen von Leistungs-/Zuschlagsblöcken. Pro Zeile auf Rappen kaufmännisch gerundet: ausdrückliche Software-Rechenkonvention. Eingeschlossene Arbeiten werden nicht automatisch nochmals ergänzt; keine Aussage, dass eine manuelle Kombination zulässig ist.
- III/Fixbeträge: ganze Anzahl der benannten Gebindeeinheiten, etwa 25 Stück Gelatinekapseln pro **einer** Packung. Keine Umrechnung auf Stück, Gewicht oder Füllvolumen. Blutpräparate-Abrechnungspreis bereits inkl. 12 % Marge und Transport, exkl. MWST.
- Keine automatische MWST-Erhöhung: 1.7.1 nennt den reduzierten Satz am Schluss einmalig, aber die Quelle beziffert den Steuersatz nicht. Ebenso keine automatische Rezeptur-Minimalgebühr CHF 5.– oder sonstige Gefäss-/Arbeits-/Handlingposition. Originalregeln vollständig einsehbar.
- Offene/ungültige Zeilen sind `null`, niemals ein künstlicher Preis null. Summe eindeutig als Teilsumme exkl. MWST bezeichnet; offene Zeilen mit Anzahl und Regel ausgewiesen.

## Rechte und Veröffentlichungssatz

[Art. 5 URG (SR 231.1)](https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/de#art_5) nimmt Gesetze, Verordnungen und andere amtliche Erlasse sowie amtliche Entscheidungen/Protokolle/Berichte vom urheberrechtlichen Werksschutz aus. Gegenprüfung anhand des [amtlichen PDF, Stand 1. Juli 2025, Art. 5 auf Seiten 2–3](https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1993/1798_1798_1798/20250701/de/pdf-a/fedlex-data-admin-ch-eli-cc-1993-1798_1798_1798-20250701-de-pdf-a.pdf). Die veröffentlichte Datengrundlage hier ist der vom Original auf Seite 2 ausdrücklich ausgewiesene **amtliche Verordnungsanhang**, nicht ein privater Arzneimittelkatalog oder eine blosse frei zugängliche Herstellerdatenbank. Diese Einordnung ist keine pauschale BAG-Lizenz und keine Rechtsberatung.

Der allgemeine [Copyright-Hinweis der Bundesbehörden](https://www.admin.ch/gov/de/start/rechtliches.html) überträgt durch Herunterladen keine Rechte und verlangt für geschützte Elemente grundsätzlich eine vorgängige Zustimmung. Deshalb werden die BAG-Webseite, Logos, Gestaltung, Fotos, PDF-Faksimiles und mögliche fremde Software **nicht** übernommen/ausgeliefert. `sources/` mit den Originalen bleibt ignoriert. `source-pages.json` enthält nur den amtlichen Text des Tarifanhangs, ohne PDF-Gestaltung/Schriftdateien. Bibliografische Angaben im amtlichen Text bleiben als Herkunftsangabe erhalten; keine dort erwähnten Arzneibücher/Monographien wurden übernommen.

Eigene Software: MIT (`LICENSE`). Keine Frontend-/Python-Drittbibliotheken. Node/Python/Poppler/curl sind externe Laufzeit-/Entwicklungswerkzeuge unter ihren eigenen Lizenzen und werden nicht gebündelt. Keine BESA-/RAI-/Herstellerinstrumente oder geschützten Klassifikationen Bestandteil dieses Datenpakets.

## Reproduzierbarkeit / Fehlergrenzen

Erst Originaldownload nach `sources/`, dann Fingerabdruck, dann Import. `scripts/import_catalog.py` akzeptiert ausschliesslich den gepinnten PDF-Hash. Spalten werden geometrisch an den tatsächlichen Mengenüberschriften ausgerichtet: Stofftabellen rechtsbündig, Aromatherapeutica zentriert, Hilfsstoff-Maximalpreise nach echten Zellgrenzen. Mehrzeilige Titel, Flag-Gutter und breite individuelle Limitationen getrennt. Nicht zugeordnete Preiszeilen und doppelte Staffelspalten brechen den Import ab.

Offline-Nachweis mit den beibehaltenen Originalen: `npm run verify:source`. Der normale öffentliche Checkout benötigt keine ignorierten Originale. `npm test` kontrolliert Importhilfen und den publizierten Vollbestand, Quellen-/Seitenabdeckung, bekannte Limitationen, Preissemantik, exakte Rechnung, Speicher und Export. Native Browserprüfung ist eine zusätzliche Abnahme, nicht durch reine Unit-Tests ersetzt.
