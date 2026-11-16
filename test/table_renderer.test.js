const assert = require('assert');
const {
    MAX_ROWS_PER_IMAGE,
    parseMarkdownTableBlock,
    extractTablesFromMarkdown,
    paginateTableSpec,
    buildCanvasTableScript,
    extractAndRenderMarkdownTables,
} = require('../src/table_renderer');

async function runTests() {
    console.log('🧪 Running table_renderer tests...');

    // 1. parseMarkdownTableBlock: escaped pipes, inline markdown stripping, numeric alignment
    const parsed = parseMarkdownTableBlock([
        '| Kanal | Durum | Gelir | Net (`a \\| b`) | Not |',
        '| :--- | :---: | --- | ---: | --- |',
        '| **YZ Turkey** | AKTİF | $142,50 | +$24,10 | [Detay](https://example.com) |',
        '| *Dertli Orman* | KAPALI | $18,00 | -$3,20 | `ok \\| test` |',
    ]);
    assert.ok(parsed, 'Valid Markdown table should parse');
    assert.deepStrictEqual(parsed.headers, ['Kanal', 'Durum', 'Gelir', 'Net (a | b)', 'Not']);
    assert.strictEqual(parsed.rows.length, 2);
    assert.deepStrictEqual(parsed.rows[0], ['YZ Turkey', 'AKTİF', '$142,50', '+$24,10', 'Detay']);
    assert.deepStrictEqual(parsed.rows[1], ['Dertli Orman', 'KAPALI', '$18,00', '-$3,20', 'ok | test']);
    // Column 0 explicit left, Column 1 explicit center, Column 2 auto numeric right, Column 3 explicit right, Column 4 default left
    assert.deepStrictEqual(parsed.alignments, ['left', 'center', 'right', 'right', 'left']);

    // Reject invalid blocks
    assert.strictEqual(parseMarkdownTableBlock(['| A | B |', '| 1 | 2 |']), null, 'Missing separator row must return null');
    assert.strictEqual(parseMarkdownTableBlock(['| A | B |', '|---|---|']), null, 'Header-only table with zero data rows must return null');

    // 2. extractTablesFromMarkdown: bare tables + ```text DOM tables + untouched code fences + heading detection
    const sampleMd = [
        'İşte güncel özet:',
        '',
        '### 2. Tüm Serilerin Güncel Performans Özeti',
        '| Seri | Durum | Net |',
        '|------|-------|-----|',
        '| A    | AKTİF | +$5 |',
        '',
        'Kod örneği (dokunulmamalı):',
        '```js',
        'const md = `',
        '| Col1 | Col2 |',
        '|------|------|',
        '| x    | y    |',
        '`;',
        '```',
        '',
        '**DOM Tablosu**',
        '```text',
        '| Metrik | Değer |',
        '| --- | --- |',
        '| Hız | 98% |',
        '```',
        '',
        'Sonuç paragrafı.',
    ].join('\n');

    const extracted = extractTablesFromMarkdown(sampleMd);
    assert.strictEqual(extracted.tables.length, 2, 'Should extract bare table + ```text table, ignoring ```js fence');
    assert.strictEqual(extracted.tables[0].title, '2. Tüm Serilerin Güncel Performans Özeti');
    assert.strictEqual(extracted.tables[1].title, 'DOM Tablosu');

    // Partial replacement: suppose table 1 succeeded and table 2 failed -> table 2 stays intact!
    const partialText = extracted.replaceWithPlaceholders(new Set([1]), (idx) => `[TBL_${idx}]`);
    assert.ok(partialText.includes('[TBL_1]'), 'Rendered table 1 should be replaced with placeholder');
    assert.ok(!partialText.includes('| A    | AKTİF | +$5 |'), 'Rendered table 1 raw rows should be removed');
    assert.ok(partialText.includes('```js\nconst md = `'), 'JS code fence must stay untouched');
    assert.ok(partialText.includes('| Metrik | Değer |'), 'Unrendered table 2 must remain intact as fallback');

    // 3. paginateTableSpec: >30 rows split cleanly with (1/N) titles
    const bigRows = Array.from({ length: 65 }, (_, i) => [`Row ${i + 1}`, `${i * 10}`]);
    const pages = paginateTableSpec({
        headers: ['Name', 'Score'],
        aligns: ['left', 'right'],
        rows: bigRows,
        title: 'Leaderboard',
    });
    assert.strictEqual(MAX_ROWS_PER_IMAGE, 30);
    assert.strictEqual(pages.length, 3);
    assert.strictEqual(pages[0].rows.length, 30);
    assert.strictEqual(pages[1].rows.length, 30);
    assert.strictEqual(pages[2].rows.length, 5);
    assert.strictEqual(pages[0].title, 'Leaderboard (1/3)');
    assert.strictEqual(pages[2].title, 'Leaderboard (3/3)');

    // 4. buildCanvasTableScript produces valid JavaScript expression
    const script = buildCanvasTableScript(extracted.tables[0]);
    assert.ok(script.includes('2500'), 'Canvas script should enforce 2500px Telegram sharpness ceiling');
    // Syntax check via Function constructor
    assert.doesNotThrow(() => new Function(`return ${script};`), 'Generated browser canvas IIFE must be valid JS');

    // 5. extractAndRenderMarkdownTables end-to-end with mock renderFn + fallback safety
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const okRes = await extractAndRenderMarkdownTables(sampleMd, {
        port: 9333,
        renderFn: async () => fakePng,
        placeholderFn: (idx) => `📊 [Tablo ${idx}]`,
    });
    assert.strictEqual(okRes.tableImages.length, 2);
    assert.strictEqual(okRes.tableImages[0].filename, 'table-1.png');
    assert.strictEqual(okRes.tableImages[1].filename, 'table-2.png');
    assert.ok(okRes.text.includes('📊 [Tablo 1]'));
    assert.ok(okRes.text.includes('📊 [Tablo 2]'));

    const fallbackRes = await extractAndRenderMarkdownTables(sampleMd, {
        port: 9333,
        renderFn: async () => null,
        placeholderFn: (idx) => `📊 [Tablo ${idx}]`,
    });
    assert.strictEqual(fallbackRes.tableImages.length, 0);
    assert.strictEqual(fallbackRes.text, sampleMd, 'When CDP render returns null, original Markdown must be preserved verbatim');

    console.log('✅ All table_renderer tests passed!');
}

runTests().catch((err) => {
    console.error('❌ table_renderer test failed:', err);
    process.exit(1);
});
