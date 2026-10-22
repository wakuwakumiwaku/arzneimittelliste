// Exact deployment mapping; never recurse through public/ or the project.
export const runtimeFiles=Object.freeze({
 'index.html':'index.html',
 'favicon.svg':'public/favicon.svg',
 'src/app.js':'src/app.js',
 'src/domain.js':'src/domain.js',
 'src/styles.css':'src/styles.css',
 'data/catalog.json':'public/data/catalog.json',
 'data/source-pages.json':'public/data/source-pages.json',
 'data/provenance.json':'public/data/provenance.json',
 'data/import-report.json':'public/data/import-report.json'
});
export const publicMembers=Object.freeze([
 '.gitignore','.gitattributes','.github/workflows/pages.yml','package.json','package-lock.json','README.md','DATA.md','LICENSE','docs/CODEBASE.md',
 'scripts/acquire_sources.py','scripts/import_catalog.py','scripts/files.mjs','scripts/check.mjs','scripts/build.mjs','scripts/serve.mjs',
 'tests/domain.test.mjs','tests/build.test.mjs','tests/server.test.mjs','tests/price-shape.test.mjs','tests/test_import_catalog.py','tests/browser.mjs',
 ...Object.values(runtimeFiles)
]);
