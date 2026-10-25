# Codebase

## Architektur und Grenzen

Vanilla ES-Module, statische Daten, kein Backend und keine Schreib-/Upload-API. Node ≥22 für Build/Tests/Loopback-Vorschau, Python-Standardbibliothek für Quellaufnahme/Import und Importtests. Systemfonts, keine CDN-Abhängigkeit. Frontend lädt beim Start vier geprüfte JSON-Dateien automatisch. Erst nach erfolgreicher Daten-/Quellenprüfung, Indexaufbau und UI-Aktivierung wird `document.body.dataset.ready = 'true'` gesetzt; Fehler setzen `false` mit sichtbarer Meldung, ohne Beispieldaten.

- `index.html`: deutschsprachige semantische Oberfläche, Katalog-/Sammlungsansicht, native Dialoge, Quellenleser, Datenschutzhinweise, 3+6 Katalognavigation (genau eine aktuelle Seite).
- `src/app.js`: sichere DOM-Erzeugung über textContent/DOM, 40er-Trefferpagination, Filter, Details, Quellen, örtliche Sammlung, native JSON/CSV-Downloads und Print-DOM. Ein Suchindex für den vollständigen Bestand; nur die DOM-Ausgabe ist begrenzt.
- `src/domain.js`: Produktionsvalidierung, exakte rationale BigInt-Preisrechnung und Rundung, Suchfilter, strikte Workspace-Typen, Speicherwächter und CSV-Schutz.
- `public/data/catalog.json`: 917 kanonische Quellzeilen, vollständige zugeordnete Regeltexte, Hierarchie und Importbericht.
- `public/data/source-pages.json`: vollständige ursprüngliche Textebene aller 34 PDF-Seiten.
- `public/data/provenance.json`: originale Quelle, Publikations-/Gültigkeits-/Abrufdaten, Bytes und SHA256.
- `public/data/import-report.json`: genaue Bereichs-/Preisartenzählungen, Methode, offen deklarierte Rechengrenzen.
- `public/favicon.svg`: eigene einfache Markierung, kein Bundeslogo.
- `scripts/acquire_sources.py`: kontrollierter offizieller Download; überprüft, dass das gepinnte vollständige PDF weiterhin verlinkt ist; archiviert Originale vor Verarbeitung.
- `scripts/import_catalog.py`: stdlib/Poppler-Importer mit Hashgate; keine OCR. Zusammengehörige Titel-/Preis-/Notiz-/Hierarchiebereiche aus geometrischen PDF-Wörtern, ursprünglicher Seitenlayouttext separat erhalten.
- `scripts/files.mjs`: autoritatives **exaktes** öffentliches Repository-Inventar `publicMembers` sowie Ziel→Quelle-Allowlist `runtimeFiles`.
- `scripts/build.mjs`: alle Eingaben vor Änderung eines bestehenden Builds laden/validieren, Symlinks und Datenabweichungen abweisen; erlaubte Bytepuffer einzeln nach neuem Stagingbaum schreiben und gegen `dist/` austauschen. Validierungsfehler lassen den letzten gültigen Build unverändert; spätere IO-Fehler sind keine behauptete globale Dateisystemtransaktion.
- `scripts/serve.mjs`: `createAppServer({root,basePath})`, GET/HEAD, exakte Runtime-Allowlist, echte Pfadcontainment-Prüfung, Loopback-Hostgate, CSP/nosniff, keine Uploads. CLI bindet 127.0.0.1, `PORT=3012` als Default; kein Fremdserver wird angehalten.
- `scripts/check.mjs`: Public-Inventar, Node-Syntax, vollständiges Datenpaket, Safe-DOM- und Navigationsvertrag.
- `.github/workflows/pages.yml`: saubere Node/Python-Installation, check/test/build, nur `dist/` als Pages-Artefakt. Lokale Ausführung veröffentlicht nichts.

## Persönlicher Zustand

`arzneimittelliste.workspace.v1` ist der einzige Schlüssel. Ein Objekt mit exakt `app`, `version`, `edition`, `sourceSha256`, `name`, `note`, `lines`, `favorites`. Zeilen enthalten exakt `id`, `quantity` (Dezimalzeichenfolge), `note`. Alle IDs müssen in derselben gepinnten Ausgabe vorhanden sein. Keine lockere Typkonvertierung von Arrays/Objekten. Grenzen: 1 000 Zeilen, Name 120 Zeichen, Gesamtnotiz 10 000, Zeilennotiz 2 000; Mengen bis 1 000 000 mit bis zu sechs Dezimalstellen, Leistungs-/Gebindeeinheiten ganzzahlig.

Fehlende Schlüssel bleiben beim Laden ungeschrieben. Ungültiger/blockierter Speicher pausiert alle automatischen Schreibvorgänge und überschreibt vorhandene Bytes nicht. Vor jedem Save wird die exakte rohe Ausgangszeichenfolge verglichen und nachher zurückgelesen. Ein natives Storage-Event pausiert den lokalen Entwurf; kein stillschweigendes Merging oder cross-tab-atomarer Compare-and-swap wird behauptet. Entwürfe können als JSON gesichert werden; Neuladen verlangt Bestätigung. Ungültige Mengeneingaben bleiben als sichtbarer DOM-Entwurf erhalten und werden nicht als voriger gültiger Preis ausgegeben.

Import: max. 5 MiB native Datei, vollständige Vorabvalidierung und Vorschau, Abbrechen ohne Schreiben. Bestätigungsbutton erst nach Download der aktuellen gültigen Sammlung freigegeben. Unmittelbar vor Ersatz ursprünglichen Entwurf und rohen Speicher erneut vergleichen; keine automatische Speicherung einer veralteten Ansicht nach Ersatz. Korrupter oder gesperrter Speicher kann hier nicht durch Import überschrieben werden. JSON/CSV/Druck lesen aktuelle Notizen; ungültige Mengendrafts verhindern einen scheinbar gültigen Export.

Druck: `renderPrintPlan` baut die Druckansicht bei jedem App-Druck und beim registrierten `beforeprint`-Ereignis aus dem aktuellen Entwurf neu auf, auch bei Browsermenü/Strg+P ohne vorherigen Buttondruck. Geänderte/geleerte Notizen und entfernte/importierte Positionen dürfen nicht aus einer älteren Druckansicht wieder erscheinen. Vor der Validierung wird die alte Ausgabe entfernt. Ungültige Mengendrafts stoppen weiterhin den App-Druck; beim nicht abbrechbaren Browserdruck ersetzt eine ausdrückliche Diagnose die alten Zeilen/Preise. Der Ereignishandler ruft weder `window.print` noch eine Speicherung auf.

## Registrierte Tests

- `tests/domain.test.mjs`: offizielle Corpus-/Preissemantik, BigInt-/Rundungsgrenzen, hohe Mengen, nicht berechenbare Einheiten, vollständige Suchparität, strikte Workspace-Validierung, lokale Persistenz/Sperre/Fremdänderung, sichere CSV-/Notizaktualität, Produktionsvalidierung.
- `tests/build.test.mjs`: exakter Runtime-Dateisatz, private Canaries ausgeschlossen, fehlende/malformed/schema-invalid/symlink Eingaben ändern den letzten gültigen Build nicht.
- `tests/price-shape.test.mjs`: im bestehenden `npm test`-Glob registrierte Preisform-Regressionen. Preisart muss eine primitive, unverändert bekannte Zeichenfolge sein; `graduated_chf` benötigt mindestens eine gültige aufsteigende Zelle. Validator und echte Check-/Build-CLI werden getrennt geprüft. Jede Mutante erhält zuvor einen gültigen Build; vollständiger Neun-Dateien-Pfadsatz und alle Hashes werden vor/nach jeder Ablehnung mit dem Seed verglichen, ungültige Eingabebytes bleiben unverändert. Preisart-Array-/Nested-Array-Fixtures behalten echte nichtleere Quellstaffeln, damit der Nichtleere-Guard den Typfehler nicht verdeckt. Kontrollen: unveränderte 917 Zeilen/alle fünf Preisarten, leere Staffeln beider offener Arten, Original-Rundungs-/Taxpunktfälle, explizite synthetische Fix-CHF-Null (kein amtlicher Nullpreis im Corpus), erfolgreiche Wiederherstellung der Originaleingabe. Keine Rechnung, Ersatzpreisbehandlung oder Browserassertion wird dafür geändert.
- `tests/server.test.mjs`: echter HTTP-Server auf zufälligem Loopback-Port und Pages-Unterpfad, jede Runtime-Datei, Header/GET/HEAD/404/405/Host/Encoding, kein Quellen-/Privatdateizugriff. Wird im Test wieder geschlossen.
- `tests/test_import_catalog.py`: vollständiges Quell-/Seiten-/Regel-Inventar, Preisstaffeln/Typen, Originalhinweise, Tausenderzeichen, exakte Mengenbasis in 1.1, Koordinaten und IDs. Ohne Rohquellen/Netzwerk lauffähig.
- `tests/browser.mjs`, separat registriert als `npm run test:browser`: native Firefox-/Camoufox-Abnahme mit externer Playwright-Schnittstelle. Keine Produktfilter-/Preisfunktionsimporte; Suche/Filter werden aus rohen Daten unabhängig bestimmt, Geldfälle mit ausdrücklich belegten bekannten Antworten geprüft. `npm run test:browser -- --self-test` prüft nur Harness-Voraussetzungen ohne Browser/Server. Für den echten Lauf vorher bauen und `PLAYWRIGHT_MODULE` / `BROWSER_EXECUTABLE` setzen (siehe README); kein automatischer Browserdownload, keine globale Installation und kein gemeinsames Profil.

### Native Prüfszenarien und Evidenz

Der Runner startet `createAppServer({root: dist, basePath: '/arzneimittelliste/'})` auf einem eigenen zufälligen `127.0.0.1`-Port und wartet in jedem neuen Dokument auf `body.dataset.ready`. Er nutzt ausschliesslich eigene frische Kontexte; acht fremde Namespace-Sentinelwerte werden roh verglichen. Fallgruppen 01–20 prüfen vollständige Pagination, corpusweite Suche/Regeltexte/Filter/Merkliste, alle Preisarten und vollständige Limitationen, 34 Quellseiten, interne Quellzeilen-ID versus vorhandenen Quellcode A.1.a, bekannte Preis-/Rundungsgrenzen, ungültige native Mengeneingaben, reale Downloads/Dateiimporte/Reload, strenge vollständige Importablehnung, Speicherfehler, echte Tab-Ereignisse, stille Rohänderungen und responsive Navigation/Geometrie. Der Print-Grenzaufruf wird instrumentiert und ausdrücklich nicht als OS-Dialog ausgegeben; die echten Print-DOM-Inhalte/CSS bleiben unverändert.

Szenario 20 löst `beforeprint` im echten Browser aus und prüft den registrierten App-Handler: gelöschte Gesamt-/Zeilennotizen und entfernte Zeilen verschwinden nach einem früheren Buttondruck; Name, Menge und bekannte Teilsumme sind aktuell. Nach echtem Neuladen funktioniert der Browserdruck ohne vorherigen Buttondruck. Ungültige Mengendrafts ergeben eine tatsächlich im Druck-CSS sichtbare Diagnose ohne alte Preise; Korrektur, geparster/bestätigter JSON-Import und bestätigtes Leeren erzeugen wieder die jeweils aktuelle Ansicht. Rohspeicher und fremde Schlüssel bleiben durch das Druckereignis unverändert. Ereignisauslösung und instrumentierter `window.print` sind ausdrücklich keine Betriebssystem-Druckdialogabnahme.

Jeder Lauf erzeugt nur `.local/browser/<run>/`: benannte Assertionsergebnisse und Fallstatus in `results.json`, vollständige Ereignisse in `events.jsonl`, echte Download-/Screenshotdateien mit SHA256, Eingabe→Animation-Frame-Messungen in `timings.json`, tatsächliche stdout-/stderr-Streams. Fehler bleiben im jeweiligen Lauf erhalten. Alle neuen Seiten werden überwacht; jeder unerwartete Console-Warn/Error, Pageerror, HTTP-/Requestfehler, Nicht-GET/HEAD oder externe Request führt zum Fehlschlag. Die einzigen absichtlichen Faults sind exakt schlüsselgebundene Storage-Methodenfehler in eigenen Testkontexten, keine pauschale Konsolen-/Netzwerk-Ausnahme. Der Runner schliesst seinen Server und alle Kontexte/Browser im `finally`. Die vier Viewports haben getrennte Kontexte/Fallstatus, damit ein Desktopfehler die 320px-Prüfung nicht verhindert. Fremde HTTP(S)-Requests werden vor Netzwerkkontakt blockiert und als Fehler gewertet. Entfernte Katalogziele werden nicht aktiviert und ihre Veröffentlichung nicht vorausgesetzt. Ein erfolgreicher Self-Test oder Syntaxcheck ist ausdrücklich kein nativer PASS.

`npm run check`, `npm test`, `npm run build` müssen in einem ausschliesslich aus `publicMembers` zusammengestellten sauberen Verzeichnis ohne `sources/`, `.local/`, `dist/` funktionieren. `npm run verify:source` ist separat und setzt beibehaltene Originale plus `pdftotext` voraus.

## Laufzeit-Inventar

| Buildziel | Quelle |
|---|---|
| index.html | index.html |
| favicon.svg | public/favicon.svg |
| src/app.js | src/app.js |
| src/domain.js | src/domain.js |
| src/styles.css | src/styles.css |
| data/catalog.json | public/data/catalog.json |
| data/source-pages.json | public/data/source-pages.json |
| data/provenance.json | public/data/provenance.json |
| data/import-report.json | public/data/import-report.json |

Keine automatische Service-Worker-/Cachemigration, keinen Kontakt zu SL-/Versicherer-APIs und keine verlässliche Prüfung einer konkreten Verordnung versprechen. Layout ist auf 320/390/768/1440 px angelegt; native Pixel-/Download-/Import-/Cross-tab-Prüfung gehört zur separaten Browserabnahme.
