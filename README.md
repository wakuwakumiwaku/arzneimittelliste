# Arzneimittelliste mit Tarif (ALT)

Unabhängiger, statischer Browser der vollständigen amtlichen **ALT, Anhang 4 KLV, Ausgabe 1. Juli 2026**. Die 34 Originalseiten (Publikation 24. Juni 2026) liefern 917 nachvollziehbare Quellzeilen. Keine Konten, Tracker, externen Schriftarten oder Frontend-Laufzeitbibliotheken.

## Lokal starten

Voraussetzungen: Node.js ≥22 und Python 3 (Standardbibliothek, für Tests).

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run build
npm start
```

Die Vorschau bindet ausschliesslich an `127.0.0.1`, standardmässig Port 3012. `PORT` und `BASE_PATH` können für eine separate Vorschau gesetzt werden. Die App funktioniert auch unter einem statischen Unterpfad; alle Laufzeitdateien sind relativ verlinkt. Keine Schreib-/Upload-API. Ohne Netzwerk funktioniert ein vollständig lokal ausgelieferter Build; `file://` und automatisches Offline-Caching werden nicht zugesichert.

## Funktionen

- Automatisches Laden des ganzen Katalogs: Arzneistoffe/Präparate, Aromatherapeutica, Hilfsstoffe, fette Öle, Blut-/Plasmapräparate, Bearbeitungs- und Gefässtarife sowie die vier Hilfsstoff-Maximalpreiskategorien aus 1.1.
- Volltextsuche über sämtliche Quellzeilen, Hierarchie, Einheiten, Limitationen und zugeordnete Originalregeln; Bereich, Preisbasis, L/St und Merkliste filtern. Anfangs 40 Treffer im DOM, „Mehr anzeigen“ durchsucht weiterhin den ganzen Bestand.
- Vollständige Details, alle Mengenstaffeln und genaue PDF-Seite/Koordinaten; 34 Originalseiten als durchsuchbarer Browsertext sowie Links zum amtlichen PDF.
- Eine lokal benannte Sammlung mit Mengen, persönlichen Zeilennotizen, Gesamtnotiz und Merkliste. Keine echten Personen-/Patientendaten eingeben. Eigener Speicherschlüssel `arzneimittelliste.workspace.v1`.
- BigInt-Rechnung mit getrennten Mengenstaffeln, Fixbeträgen und Taxpunkten; offene Basis bleibt offen. CHF 1.05 pro Taxpunkt stammt aus der Quelle.
- JSON-Sicherung/-Öffnen mit strenger Versions-/Quell-/ID-Prüfung, nichtmutierender Vorschau, Vorher-Sicherung und ausdrücklicher Bestätigung. Fehlerhafter/gesperrter Speicher und Fremdänderungen stoppen automatische Schreibvorgänge und erhalten den Entwurf.
- CSV mit Formelinjektionsschutz (auch nach führendem Whitespace) und helle Druckansicht. Notizen werden bei Export/Druck aktuell gelesen.
- Drei sichtbare verwandte Kataloglinks, sechs weitere unter „Alle Kataloge“. Links sind Zielkonfiguration, keine Aussage über deren Veröffentlichung.

## Rechengrenzen

**Keine Abrechnungs-/Erstattungszusage und kein Verordnungsprogramm.** MWST, Rezepturminimum CHF 5.–, Herstellungsbedingungen, Inklusivleistungen, Kombinationen, Limitierungen, Zuschläge und Versicherungsanspruch werden nicht automatisch geprüft/ergänzt. Der ausgewiesene Wert ist nur eine Teilsumme der bewusst gewählten Zeilen exkl. MWST.

Materialberechnung: 1.7.2 a/b (proportional, Minimum 10 Rp., Deckelung zur nächsten Spalte), danach Rundung gemäss 1.7.2 c. Für hohe Mengen werden ausschliesslich die expliziten 5×-/10×-Fälle aus d berechnet; andere Mengen ab 5× höchster Mengenbasis bleiben offen. Kein erfundenes Zwischenmodell. Bei besonderen Einheiten und nicht bezifferten Verweisen bleibt die Zeile ebenfalls offen. Keine Umrechnung von Gramm in Milliliter.

Bearbeitung: ganze Anzahl des bewusst gewählten Leistungs-/Zuschlagsblocks × Taxpunkte × CHF 1.05. Auf Rappen pro Zeile kaufmännisch gerundet (**Rechenkonvention, nicht aus der ALT behauptete Bearbeitungsrundung**). Bei „bis 25“/„je weitere 25“ bleibt die Blockwahl beim Benutzer; keine automatische Umdeutung der Eingabe zu Kapselstückzahlen. Fixpreise gelten pro gewähltem Gefäss/Gebinde, z.B. eine Gelatinekapsel-Packung à 25 Stück, nicht pro einzelner Kapsel. Fabrikabgabepreise und bereits enthaltene Margen werden nicht nochmals addiert.

## Quellen, Rechte, Reimport

Siehe [DATA.md](DATA.md) und [docs/CODEBASE.md](docs/CODEBASE.md). Das Original-PDF und die Ausgangs-Webseite liegen lokal unter ignoriertem `sources/`; veröffentlicht werden nur abgeleitete amtliche Tarifdaten/-texte mit Provenienz. Das PDF selbst wird nicht mit ausgeliefert, sondern beim BAG verlinkt. Die MIT-Lizenz betrifft die eigene Software, nicht die Quellen.

```sh
python3 scripts/acquire_sources.py
python3 scripts/import_catalog.py
python3 scripts/import_catalog.py --verify
```

Nur für einen bewusst angeforderten Neuabruf; Tests/Check/Build brauchen **keine** Netzwerkverbindung und keine ignorierten Rohquellen. Reimport benötigt `curl` und Poppler `pdftotext`; kein OCR, openpyxl oder anderer Python-Fremdcode. Das Original ist per SHA256 gepinnt; eine geänderte Datei wird nicht stillschweigend übernommen.

## Separate native Browserabnahme

Die registrierte Suite `tests/browser.mjs` ist **kein Bestandteil von `npm test`** und verwendet keine App-Abhängigkeit. Check, Unit-/Importtests und Build bleiben browser- und netzwerkfrei. Zuerst:

```sh
node --check tests/browser.mjs
npm run test:browser -- --self-test
```

`--self-test` prüft nur die unabhängigen Corpus-/Oracle-/CSV-/Fixture-Voraussetzungen und startet **keinen Browser/Server**. Das ist keine native Abnahme und kein Beleg für Layout, Downloads oder Persistenz im Browser.

Erst in einer freigegebenen, exklusiven nativen Prüflane:

```sh
npm run build
PLAYWRIGHT_MODULE="$EXTERNAL_PLAYWRIGHT_ESM" \
BROWSER_EXECUTABLE="$OWNED_FIREFOX_EXECUTABLE" \
npm run test:browser
```

Beide Variablen müssen auf eine bereits separat bereitgestellte Playwright-ESM-Schnittstelle (`firefox`) und einen damit kompatiblen Firefox-/Camoufox-Browser zeigen. Keine persönliche Pfadangabe wird vorausgesetzt, nichts global installiert; ohne diese Angaben bricht der Runner **vor Browserstart** ab. Er startet nur seinen eigenen zufälligen Loopback-Port mit `/arzneimittelliste/`, eine eigene Headless-Instanz und frische isolierte Kontexte ohne persönliches Profil. Kein gemeinsamer Browser, kein Fernziel-/Katalogwechsel und keine Veröffentlichung.

Die Suite prüft echte 917er-Autoload-/Mehr-Ergebnisse, unabhängige Volltext-/Regel-/Filter-Oracles, vollständige Hinweise/Regeln und alle 34 Quellseiten, bekannte Material-/Taxpunkt-/Gebinde-/Blutpreisfälle, offene Teilsummen, ungültige Mengendrafts, tatsächliche JSON-/CSV-Downloads, aktuelle/geänderte/geleerte Notizen und den Print-DOM. JSON-Dateien werden über das echte Datei-Input geöffnet: nichtmutierende Vorschau, Abbrechen/Escape, tatsächliche Vorher-Sicherung, bestätigter Ersatz, Neuladen und vollständige Ablehnung malformed späterer Zeilen. Korrupter/gesperrter/quota-begrenzter Speicher, echter Zwei-Tab-Konflikt und stille Rohänderung müssen Entwürfe und alle acht fremden Speicherschlüssel erhalten. Testfehler bei Speicherzugriffen sind ausdrücklich auf den eigenen Schlüssel im jeweiligen Wegwerfkontext begrenzt.

`window.print` wird **nur an der nativen Aufrufgrenze instrumentiert**, nicht als echter Betriebssystem-Druckdialog behauptet. Der registrierte `beforeprint`-Handler wird zusätzlich mit einem im echten Browser ausgelösten Ereignis geprüft: neue Druckansicht ohne vorherigen Buttondruck, keine gelöschten Notizen/Zeilen aus einer alten Druckansicht, aktuelle bestätigte Imports sowie eine Diagnose statt veralteter Preise bei ungültigen Mengendrafts. Auch Browsermenü/Strg+P bereiten damit die aktuelle Sammlung neu auf; ein Betriebssystem-Druckdialog wird im Test nicht geöffnet. Der unveränderte Print-DOM und die tatsächlich berechneten hellen Druck-CSS werden separat geprüft. Die Navigation prüft 3+6 kanonische Ziele und Tastaturbedienung, ohne entfernte Ziele zu aktivieren oder ihre Erreichbarkeit zu behaupten. 1440/768/390/320px werden an echten Zeilen, Teilsumme, Detailanfang/-ende und Quelltext gemessen und fotografiert. Eingabeereignis→nächster Animation-Frame mit wirklicher DOM-Anzahl wird aufgezeichnet; kein erfundener Vorher-/Nachher-Vergleich.

Jeder echte Lauf behält `.local/browser/<eindeutiger Lauf>/` mit `results.json` (benannte erfolgreiche/fehlgeschlagene Assertions), `events.jsonl`, `timings.json`, echten Screenshot-/Downloadbytes und `stdout.log`/`stderr.log`. Alle Seiten werden auf Console-Warn/Error, Pageerror, HTTP-/Requestfehler, unerwartete Methoden und externe Requests überwacht; es gibt keine pauschale Fehlerunterdrückung. Fehlgeschlagene Läufe werden nicht überschrieben. Kontexte, Browser und eigener Server werden auch bei Fehlern im `finally` geschlossen. Exit 0 gilt nur für den vollständig durchgelaufenen tatsächlichen Browserlauf; der gesondert gekennzeichnete Self-Test ist kein Browser-PASS. Eventuelle Produktdefekte sind zu berichten, nicht durch abgeschwächte Assertions zu verstecken.

## Preisform-Vertrag und browserfreie Regression

`validateCatalog` wird gemeinsam von App-Initialisierung, Check und Build verwendet. Die Preisart muss eine **primitive Zeichenfolge** und exakt eine der fünf bekannten Arten sein; Arrays, verschachtelte Arrays oder Objekte werden nicht zu Tokens konvertiert. `graduated_chf` verlangt mindestens eine gültige, streng aufsteigende Mengen-/CHF-Zelle. Fehlende, `null`, nicht-arrayförmige oder leere berechenbare Staffeln werden vor jedem Build-Austausch abgewiesen. Leere `cells` bleiben für `unpriced` und `reference_only` zulässig und bedeuten weiterhin **offen**, nicht CHF 0.00.

`tests/price-shape.test.mjs` ist über das vorhandene `npm test`-Glob und das öffentliche Inventar registriert. Die Suite prüft den Validator sowie die tatsächlichen Check-/Build-CLI-Entrypoints mit getrennten Mutanten, darunter Preisart-Arrays mit unveränderten echten **nichtleeren** Quellzellen. Jede CLI-Fixture startet mit einem gültigen Build; vor und nach jeder Ablehnung werden der vollständige Neun-Dateien-Pfadsatz und sämtliche SHA256-Werte verglichen. Die ungültigen Eingabebytes dürfen ebenfalls nicht verändert werden. Wiederhergestellte Originaldaten müssen wieder denselben gültigen Build erzeugen. Gültige Kontrollen erhalten alle 917 Zeilen und fünf Preisarten, offene Werte, CHF 1.05/TP und die bisherigen Rechengrenzen. Die explizite Null-CHF-Typkontrolle ist synthetisch und keine amtliche Quellzeile; im Originalbestand gibt es keinen Null-CHF-Ansatz.

Diese Prüfungen sind browserfrei und ersetzen weder die separate native 23-Szenarien-Abnahme noch unabhängige SPEC-/QUALITY- und Publikationsprüfungen.

## Veröffentlichungsvorbereitung

`publicMembers` in `scripts/files.mjs` ist das genaue öffentliche Repository-Inventar; `runtimeFiles` bildet jedes Ziel im Build auf seine konkrete Quelle ab. Nur diese neun Laufzeitdateien gelangen nach `dist/`. Keine rekursiven `public/`-Kopien, Original-PDFs, Sicherungen, Entwürfe oder privaten Dateien. Der Build validiert zuerst sämtliche Eingaben und erhält bei fehlenden/ungültigen Daten den letzten gültigen Build. Das Pages-Workflow ist vorbereitet; diese Arbeitskopie führt selbst keine Veröffentlichung aus.
