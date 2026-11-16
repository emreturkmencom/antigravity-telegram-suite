const CDP = require('chrome-remote-interface');
const { resolveTargets } = require('./cdp_controller');

const MAX_ROWS_PER_IMAGE = 30;

function stripInlineMarkdown(cellText) {
    return String(cellText || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/\[([^\]]+)\]\([^)\n]+\)/g, '$1')
        .replace(/\*\*([^\*\n]+?)\*\*/g, '$1')
        .replace(/__([^_\n]+?)__/g, '$1')
        .replace(/(?<![A-Za-z0-9\*])\*([^\s\*\n](?:[^\*\n]*?[^\s\*\n])?)\*(?![A-Za-z0-9\*])/g, '$1')
        .replace(/(?<![A-Za-z0-9_])_([^\s_\n](?:[^_\n]*?[^\s_\n])?)_(?![A-Za-z0-9_])/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/\\\|/g, '|')
        .trim();
}

function splitPipeRow(line) {
    let trimmed = String(line || '').trim();
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1);

    const cells = [];
    let current = '';
    for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
            current += '\\|';
            i++;
        } else if (trimmed[i] === '|') {
            cells.push(current);
            current = '';
        } else {
            current += trimmed[i];
        }
    }
    cells.push(current);
    return cells;
}

function isSeparatorRow(line) {
    const t = String(line || '').trim();
    if (!t.includes('|') || !t.includes('-')) return false;
    const cells = splitPipeRow(t);
    if (cells.length < 2) return false;
    return cells.every(c => /^\s*:?-{2,}:?\s*$/.test(c));
}

function parseMarkdownTableBlock(tableBlock) {
    const rawStr = Array.isArray(tableBlock) ? tableBlock.join('\n') : String(tableBlock || '');
    const rawLines = rawStr
        .trim()
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    if (rawLines.length < 3) return null; // header + separator + at least 1 data row
    if (!isSeparatorRow(rawLines[1])) return null;

    const rawHeaders = splitPipeRow(rawLines[0]);
    const sepCells = splitPipeRow(rawLines[1]);
    const colCount = Math.max(rawHeaders.length, sepCells.length);
    if (colCount < 2) return null;

    const headers = [];
    const explicitAligns = [];
    for (let c = 0; c < colCount; c++) {
        headers.push(stripInlineMarkdown(rawHeaders[c] || ''));
        const sep = (sepCells[c] || '').trim();
        if (sep.startsWith(':') && sep.endsWith(':')) explicitAligns.push('center');
        else if (sep.endsWith(':')) explicitAligns.push('right');
        else if (sep.startsWith(':')) explicitAligns.push('left');
        else explicitAligns.push(null);
    }

    const rows = [];
    for (let r = 2; r < rawLines.length; r++) {
        if (!rawLines[r].includes('|')) continue;
        if (isSeparatorRow(rawLines[r])) continue;
        const parsedCells = splitPipeRow(rawLines[r]);
        const row = [];
        for (let c = 0; c < colCount; c++) {
            row.push(stripInlineMarkdown(parsedCells[c] || ''));
        }
        if (row.some(cell => cell.length > 0)) {
            rows.push(row);
        }
    }

    if (rows.length === 0) return null;

    // Auto-detect numeric alignment when column alignment was not explicitly set in Markdown
    const numericLikeRe = /^[+\-]?[$€£₺%]?\s*\d[\d.,\s/%a-zA-Z()]*$/;
    const alignments = headers.map((_, c) => {
        if (explicitAligns[c]) return explicitAligns[c];
        if (c === 0) return 'left';
        const nonEmpty = rows.map(r => r[c]).filter(Boolean);
        if (nonEmpty.length === 0) return 'left';
        const numMatches = nonEmpty.filter(v => numericLikeRe.test(v) && v.length <= 26).length;
        return (numMatches / nonEmpty.length) >= 0.75 ? 'right' : 'left';
    });

    return { headers, rows, alignments };
}

function findPrecedingHeading(textBefore) {
    if (!textBefore) return '';
    const lines = String(textBefore).replace(/\s+$/, '').split(/\r?\n/);
    const lastLine = (lines[lines.length - 1] || '').trim();
    if (!lastLine || lastLine.length > 110 || lastLine.includes('|')) return '';

    const mdHeading = lastLine.match(/^#{1,6}\s+(.+)$/);
    if (mdHeading) return stripInlineMarkdown(mdHeading[1]);

    const boldHeading = lastLine.match(/^(?:\*\*|__)(.+?)(?:\*\*|__):?$/);
    if (boldHeading) return stripInlineMarkdown(boldHeading[1]);

    const numberedHeading = lastLine.match(/^(\d+[\.\)]\s+.+)$/);
    if (numberedHeading && lastLine.length <= 85) return stripInlineMarkdown(numberedHeading[1]);

    return '';
}

function extractTablesFromMarkdown(markdownText) {
    if (!markdownText || !markdownText.includes('|')) {
        return { tables: [], replaceWithPlaceholders: () => markdownText || '' };
    }

    let working = String(markdownText);
    const protectedBlocks = [];
    const fencedTableOriginals = new Map();

    // 1. Unwrap ```text ... ``` blocks ONLY when their entire content is a valid Markdown pipe table
    // (getChatExtractExpr wraps DOM <table> elements in ```text ... ```), while protecting all real code blocks.
    working = working.replace(/```([a-z0-9_-]*)\r?\n([\s\S]*?)```/gi, (fullMatch, lang, inner) => {
        const normLang = (lang || '').trim().toLowerCase();
        if ((normLang === 'text' || normLang === '') && parseMarkdownTableBlock(inner)) {
            const trimmedInner = inner.trim();
            fencedTableOriginals.set(trimmedInner, fullMatch);
            return '\n' + trimmedInner + '\n';
        }
        const token = `\uE010CODE${protectedBlocks.length}\uE011`;
        protectedBlocks.push(fullMatch);
        return token;
    });

    const tables = [];
    const tableRegex = /(?:^[ \t]*\|.+\|[ \t]*$\r?\n?){3,}/gm;

    const tokenized = working.replace(tableRegex, (match, offset, fullStr) => {
        const parsed = parseMarkdownTableBlock(match);
        if (!parsed) return match;

        const title = findPrecedingHeading(fullStr.slice(0, offset));
        const idx = tables.length;
        const token = `\uE010TBL${idx}\uE011`;
        const trimmedMatch = match.trim();
        tables.push({
            index: idx + 1,
            token,
            raw: fencedTableOriginals.get(trimmedMatch) || trimmedMatch,
            title,
            headers: parsed.headers,
            rows: parsed.rows,
            alignments: parsed.alignments,
        });
        return token + '\n';
    });

    const replaceWithPlaceholders = (renderedIndicesSet, placeholderFn) => {
        if (!renderedIndicesSet || renderedIndicesSet.size === 0) {
            return String(markdownText);
        }
        let out = tokenized;
        for (const tbl of tables) {
            const replacement = renderedIndicesSet.has(tbl.index)
                ? String(placeholderFn(tbl.index, tbl))
                : tbl.raw;
            out = out.replace(tbl.token, () => replacement);
        }
        protectedBlocks.forEach((block, i) => {
            out = out.replace(`\uE010CODE${i}\uE011`, () => block);
        });
        return out;
    };

    return { tables, replaceWithPlaceholders };
}

function paginateTableSpec(tableSpec, maxRows = MAX_ROWS_PER_IMAGE) {
    const totalRows = tableSpec.rows.length;
    if (totalRows <= maxRows) {
        return [{
            ...tableSpec,
            partIndex: 1,
            totalParts: 1,
        }];
    }
    const parts = [];
    const totalParts = Math.ceil(totalRows / maxRows);
    for (let p = 0; p < totalParts; p++) {
        const slice = tableSpec.rows.slice(p * maxRows, (p + 1) * maxRows);
        parts.push({
            ...tableSpec,
            title: tableSpec.title
                ? `${tableSpec.title} (${p + 1}/${totalParts})`
                : `(${p + 1}/${totalParts})`,
            rows: slice,
            partIndex: p + 1,
            totalParts,
        });
    }
    return parts;
}

function buildCanvasTableScript(spec) {
    const payloadStr = JSON.stringify({
        title: spec.title || '',
        headers: spec.headers || [],
        rows: spec.rows || [],
        alignments: spec.alignments || [],
        totalRowsCount: spec.totalRowsCount || (spec.rows ? spec.rows.length : 0),
    });

    return `(() => {
        const data = ${payloadStr};
        const headers = data.headers;
        const rows = data.rows;
        const aligns = data.alignments;
        const colCount = headers.length;

        const FONT_FAMILY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Ubuntu, sans-serif';
        const HEADER_FONT = '600 13.5px ' + FONT_FAMILY;
        const CELL_FONT = '400 13px ' + FONT_FAMILY;
        const CELL_BOLD_FONT = '600 13px ' + FONT_FAMILY;
        const TITLE_FONT = '700 15.5px ' + FONT_FAMILY;
        const META_FONT = '500 12px ' + FONT_FAMILY;

        const OUTER_PAD = 18;
        const CELL_PAD_X = 14;
        const CELL_PAD_Y = 10;
        const LINE_H = 18;
        const HEADER_LINE_H = 18;
        const MIN_COL_W = 54;
        const MAX_COL_W = 290;

        const measureCanvas = document.createElement('canvas');
        const mctx = measureCanvas.getContext('2d');

        const wrapLines = (text, font, maxTextW) => {
            mctx.font = font;
            const rawParagraphs = String(text ?? '').split(/\\n/);
            const out = [];
            for (const para of rawParagraphs) {
                const trimmed = para.trim();
                if (!trimmed) { out.push(''); continue; }
                if (mctx.measureText(trimmed).width <= maxTextW) {
                    out.push(trimmed);
                    continue;
                }
                const words = trimmed.split(/\\s+/);
                let line = '';
                for (const word of words) {
                    const test = line ? (line + ' ' + word) : word;
                    if (mctx.measureText(test).width <= maxTextW) {
                        line = test;
                    } else {
                        if (line) out.push(line);
                        if (mctx.measureText(word).width > maxTextW) {
                            let chunk = '';
                            for (const ch of word) {
                                if (mctx.measureText(chunk + ch).width > maxTextW && chunk) {
                                    out.push(chunk);
                                    chunk = ch;
                                } else {
                                    chunk += ch;
                                }
                            }
                            line = chunk;
                        } else {
                            line = word;
                        }
                    }
                }
                if (line) out.push(line);
            }
            return out.length ? out : [''];
        };

        // 1. Compute optimal column widths
        const colWidths = new Array(colCount).fill(MIN_COL_W);
        for (let c = 0; c < colCount; c++) {
            mctx.font = HEADER_FONT;
            let natural = Math.ceil(mctx.measureText(headers[c] || '').width) + CELL_PAD_X * 2 + 6;
            for (let r = 0; r < rows.length; r++) {
                const cellVal = String(rows[r][c] || '');
                mctx.font = (c === 0 || /^[+\\-]/.test(cellVal)) ? CELL_BOLD_FONT : CELL_FONT;
                for (const seg of cellVal.split(/\\n/)) {
                    const w = Math.ceil(mctx.measureText(seg).width) + CELL_PAD_X * 2 + 8;
                    if (w > natural) natural = w;
                }
            }
            colWidths[c] = Math.max(MIN_COL_W, Math.min(MAX_COL_W, natural));
        }

        // 2. Wrap header & body cells and compute row heights
        const wrappedHeaders = headers.map((h, c) => wrapLines(h, HEADER_FONT, colWidths[c] - CELL_PAD_X * 2));
        const maxHeaderLines = Math.max(1, ...wrappedHeaders.map(l => l.length));
        const headerH = maxHeaderLines * HEADER_LINE_H + CELL_PAD_Y * 2 + 4;

        const wrappedRows = rows.map(row =>
            row.map((cell, c) => wrapLines(cell, CELL_FONT, colWidths[c] - CELL_PAD_X * 2))
        );
        const rowHeights = wrappedRows.map(rLines => {
            const maxLines = Math.max(1, ...rLines.map(l => l.length));
            return maxLines * LINE_H + CELL_PAD_Y * 2;
        });

        const titleBarH = data.title ? 46 : 0;
        const tableW = Math.max(360, colWidths.reduce((a, b) => a + b, 0));
        const tableH = titleBarH + headerH + rowHeights.reduce((a, b) => a + b, 0);
        const totalW = tableW + OUTER_PAD * 2;
        const totalH = tableH + OUTER_PAD * 2;

        // Keep max physical dimension <= 2500px so Telegram never applies lossy downscale blur
        const maxDim = Math.max(totalW, totalH);
        const dpr = Math.min(2.2, Math.max(1.25, 2500 / maxDim));

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(totalW * dpr);
        canvas.height = Math.round(totalH * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const roundRectPath = (x, y, w, h, r) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        };

        // Backdrop
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(0, 0, totalW, totalH);

        const cardX = OUTER_PAD;
        const cardY = OUTER_PAD;
        const radius = 12;

        // Card shadow + clip
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 4;
        roundRectPath(cardX, cardY, tableW, tableH, radius);
        ctx.fillStyle = '#111827';
        ctx.fill();
        ctx.restore();

        ctx.save();
        roundRectPath(cardX, cardY, tableW, tableH, radius);
        ctx.clip();

        let curY = cardY;

        // Optional Title Banner
        if (titleBarH > 0) {
            const tGrad = ctx.createLinearGradient(cardX, curY, cardX + tableW, curY);
            tGrad.addColorStop(0, '#162033');
            tGrad.addColorStop(1, '#111827');
            ctx.fillStyle = tGrad;
            ctx.fillRect(cardX, curY, tableW, titleBarH);

            ctx.font = META_FONT;
            const metaLabel = rows.length + '×' + colCount;
            const metaW = ctx.measureText(metaLabel).width + 18;

            ctx.font = TITLE_FONT;
            ctx.fillStyle = '#f8fafc';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            let displayTitle = data.title;
            const maxTitleW = tableW - metaW - 36;
            if (ctx.measureText(displayTitle).width > maxTitleW) {
                while (displayTitle.length > 8 && ctx.measureText(displayTitle + '…').width > maxTitleW) {
                    displayTitle = displayTitle.slice(0, -1);
                }
                displayTitle += '…';
            }
            ctx.fillText(displayTitle, cardX + 16, curY + titleBarH / 2 + 0.5);

            // Right badge (rows x cols)
            const badgeX = cardX + tableW - metaW - 14;
            const badgeY = curY + (titleBarH - 22) / 2;
            roundRectPath(badgeX, badgeY, metaW, 22, 6);
            ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
            ctx.fill();
            ctx.font = META_FONT;
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'center';
            ctx.fillText(metaLabel, badgeX + metaW / 2, curY + titleBarH / 2 + 0.5);

            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cardX, curY + titleBarH - 0.5);
            ctx.lineTo(cardX + tableW, curY + titleBarH - 0.5);
            ctx.stroke();

            curY += titleBarH;
        }

        const classifyCell = (rawVal, colIdx) => {
            const s = String(rawVal || '').trim();
            const upper = s.toLocaleUpperCase('tr-TR');
            if (/^(AKTİF|AKTIF|ACTIVE|AÇIK|ACIK|ON|DONE|PASS|PASSED|OK|BAŞARILI|BASARILI|EVET|YES|TRUE|ONLINE|LIVE)$/.test(upper)) {
                return { pillBg: 'rgba(16, 185, 129, 0.16)', pillBorder: 'rgba(16, 185, 129, 0.35)', color: '#34d399', bold: true };
            }
            if (/^(KAPALI|PASİF|PASIF|CLOSED|INACTIVE|OFF|DISABLED|ARCHIVED|ARŞİV|ARSIV|HAYIR|NO)$/.test(upper)) {
                return { pillBg: 'rgba(148, 163, 184, 0.13)', pillBorder: 'rgba(148, 163, 184, 0.28)', color: '#94a3b8', bold: true };
            }
            if (/^(HATA|ERROR|FAIL|FAILED|BAŞARISIZ|BASARISIZ|CRITICAL|KRİTİK|KRITIK|BLOCKED)$/.test(upper)) {
                return { pillBg: 'rgba(244, 63, 94, 0.16)', pillBorder: 'rgba(244, 63, 94, 0.35)', color: '#fb7185', bold: true };
            }
            if (/^(BEKLEMEDE|PENDING|WAITING|QUEUED|SIRADA|WARN|WARNING|UYARI)$/.test(upper)) {
                return { pillBg: 'rgba(245, 158, 11, 0.16)', pillBorder: 'rgba(245, 158, 11, 0.35)', color: '#fbbf24', bold: true };
            }
            if (/^\\+\\s*[$€£₺%]?\\s*\\d/.test(s)) {
                return { color: '#34d399', bold: true };
            }
            if (/^[-−]\\s*[$€£₺%]?\\s*\\d/.test(s)) {
                return { color: '#fb7185', bold: true };
            }
            if (colIdx === 0) {
                return { color: '#f8fafc', bold: true };
            }
            return { color: '#e2e8f0', bold: false };
        };

        // Table Header Row
        const hGrad = ctx.createLinearGradient(cardX, curY, cardX, curY + headerH);
        hGrad.addColorStop(0, '#1e293b');
        hGrad.addColorStop(1, '#172033');
        ctx.fillStyle = hGrad;
        ctx.fillRect(cardX, curY, tableW, headerH);

        let colX = cardX;
        for (let c = 0; c < colCount; c++) {
            const w = colWidths[c];
            const lines = wrappedHeaders[c];
            let pillCount = 0;
            let nonEmptyCount = 0;
            for (let r = 0; r < rows.length; r++) {
                const cellVal = String(rows[r][c] || '').trim();
                if (!cellVal) continue;
                nonEmptyCount++;
                if (classifyCell(cellVal, c).pillBg) pillCount++;
            }
            const isPillCol = nonEmptyCount > 0 && (pillCount / nonEmptyCount) >= 0.8;
            const align = isPillCol ? 'center' : (aligns[c] || 'left');
            ctx.font = HEADER_FONT;
            ctx.fillStyle = '#f1f5f9';
            ctx.textBaseline = 'middle';
            ctx.textAlign = align;

            const blockH = lines.length * HEADER_LINE_H;
            const startY = curY + (headerH - blockH) / 2 + HEADER_LINE_H / 2;
            const textX = align === 'right' ? (colX + w - CELL_PAD_X)
                : align === 'center' ? (colX + w / 2)
                : (colX + CELL_PAD_X);

            for (let l = 0; l < lines.length; l++) {
                ctx.fillText(lines[l], textX, startY + l * HEADER_LINE_H);
            }

            if (c > 0) {
                ctx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(colX + 0.5, curY + 6);
                ctx.lineTo(colX + 0.5, curY + headerH - 6);
                ctx.stroke();
            }
            colX += w;
        }

        // Header bottom cyan accent line
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.moveTo(cardX, curY + headerH - 0.75);
        ctx.lineTo(cardX + tableW, curY + headerH - 0.75);
        ctx.stroke();

        curY += headerH;

        // Data Rows
        for (let r = 0; r < wrappedRows.length; r++) {
            const rh = rowHeights[r];
            ctx.fillStyle = (r % 2 === 1) ? '#151f32' : '#111827';
            ctx.fillRect(cardX, curY, tableW, rh);

            if (r > 0) {
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cardX, curY + 0.5);
                ctx.lineTo(cardX + tableW, curY + 0.5);
                ctx.stroke();
            }

            let cx = cardX;
            for (let c = 0; c < colCount; c++) {
                const w = colWidths[c];
                const lines = wrappedRows[r][c];
                const rawCell = rows[r][c] || '';
                const style = classifyCell(rawCell, c);
                const align = style.pillBg ? 'center' : (aligns[c] || 'left');

                if (c > 0) {
                    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(cx + 0.5, curY);
                    ctx.lineTo(cx + 0.5, curY + rh);
                    ctx.stroke();
                }

                ctx.font = style.bold ? CELL_BOLD_FONT : CELL_FONT;
                ctx.textBaseline = 'middle';

                if (style.pillBg && lines.length === 1) {
                    const txt = lines[0];
                    const tw = ctx.measureText(txt).width;
                    const pw = Math.min(w - 12, tw + 18);
                    const ph = 22;
                    const px = cx + (w - pw) / 2;
                    const py = curY + (rh - ph) / 2;
                    roundRectPath(px, py, pw, ph, 6);
                    ctx.fillStyle = style.pillBg;
                    ctx.fill();
                    ctx.strokeStyle = style.pillBorder;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.fillStyle = style.color;
                    ctx.textAlign = 'center';
                    ctx.fillText(txt, cx + w / 2, curY + rh / 2 + 0.5);
                } else {
                    ctx.fillStyle = style.color;
                    ctx.textAlign = align;
                    const blockH = lines.length * LINE_H;
                    const startY = curY + (rh - blockH) / 2 + LINE_H / 2;
                    const textX = align === 'right' ? (cx + w - CELL_PAD_X)
                        : align === 'center' ? (cx + w / 2)
                        : (cx + CELL_PAD_X);
                    for (let l = 0; l < lines.length; l++) {
                        ctx.fillText(lines[l], textX, startY + l * LINE_H);
                    }
                }

                cx += w;
            }

            curY += rh;
        }

        ctx.restore();

        // Outer subtle border around card
        roundRectPath(cardX + 0.5, cardY + 0.5, tableW - 1, tableH - 1, radius);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        return canvas.toDataURL('image/png');
    })()`;
}

async function renderTableSpecToPngBuffer(port, spec) {
    if (!port) return null;
    let candidates = [];
    try {
        candidates = await resolveTargets(port, true, { includeDesks: true });
    } catch (_) {
        return null;
    }
    if (!candidates || candidates.length === 0) return null;

    const script = buildCanvasTableScript(spec);
    for (const target of candidates) {
        let client;
        try {
            client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            const res = await Runtime.evaluate({
                expression: script,
                returnByValue: true,
            });
            await client.close();
            const dataUrl = res && res.result && res.result.value;
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,')) {
                return Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
            }
        } catch (_) {
            try { if (client) await client.close(); } catch (__) {}
        }
    }
    return null;
}

async function extractAndRenderMarkdownTables(markdownText, {
    port,
    renderFn = renderTableSpecToPngBuffer,
    placeholderFn = (idx) => `📊 [Table ${idx} attached as image]`,
} = {}) {
    const { tables, replaceWithPlaceholders } = extractTablesFromMarkdown(markdownText);
    if (tables.length === 0) {
        return { text: markdownText, tableImages: [] };
    }

    const renderedIndices = new Set();
    const tableImages = [];

    for (const tbl of tables) {
        const parts = paginateTableSpec(tbl);
        const buffersForTable = [];
        let allPartsSucceeded = true;

        for (const part of parts) {
            const buf = await renderFn(port, part);
            if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
                allPartsSucceeded = false;
                break;
            }
            buffersForTable.push({
                index: tbl.index,
                partIndex: part.partIndex,
                totalParts: part.totalParts,
                title: part.title || '',
                buffer: buf,
                filename: parts.length > 1
                    ? `table-${tbl.index}-part-${part.partIndex}.png`
                    : `table-${tbl.index}.png`,
            });
        }

        if (allPartsSucceeded && buffersForTable.length > 0) {
            renderedIndices.add(tbl.index);
            tableImages.push(...buffersForTable);
        }
    }

    const updatedText = replaceWithPlaceholders(renderedIndices, placeholderFn);
    return { text: updatedText, tableImages };
}

module.exports = {
    MAX_ROWS_PER_IMAGE,
    stripInlineMarkdown,
    splitPipeRow,
    isSeparatorRow,
    parseMarkdownTableBlock,
    extractTablesFromMarkdown,
    paginateTableSpec,
    buildCanvasTableScript,
    renderTableSpecToPngBuffer,
    extractAndRenderMarkdownTables,
};
