const PDFDocument = require('pdfkit');

const MAX_REPORT_COLUMNS = 10;
const PAGE_SIZE = 'A4';
const PAGE_LAYOUT = 'landscape';
const MARGIN = 28;
const TABLE_TOP = 104;
const TABLE_BOTTOM = 430;
const FOOTNOTE_TOP = 448;
const ROW_HEIGHT = 17;
const SECTION_HEIGHT = 18;
const HEADER_HEIGHT = 72;
const ITEM_COL_WIDTH = 250;

function safeText(value, fallback = '') {
    const text = String(value == null ? fallback : value)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text || fallback;
}

function sanitizeFilenamePart(value, fallback = 'reports') {
    const text = safeText(value, fallback)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return text || fallback;
}

function formatDate(value, options = {}) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return safeText(value);
    return date.toLocaleDateString('en-NZ', {
        timeZone: 'Pacific/Auckland',
        day: '2-digit',
        month: '2-digit',
        year: options.shortYear ? '2-digit' : 'numeric',
    });
}

function formatDateTime(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return safeText(value);
    return date.toLocaleString('en-NZ', {
        timeZone: 'Pacific/Auckland',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function effectiveStatus(item) {
    const raw = safeText(item && item.status).toLowerCase();
    if ((item && item.type || '').toLowerCase() === 'container') {
        if (raw === 'present' || raw === 'missing' || raw === 'defect') return raw;
        return '';
    }
    return raw;
}

function isMissingStatus(status) {
    return safeText(status).toLowerCase() === 'missing';
}

function isIssueStatus(status) {
    const normalized = safeText(status).toLowerCase();
    return normalized === 'note' || normalized === 'defect' || normalized === 'partial';
}

function noteTextForCell(cell) {
    if (!cell) return '';
    const status = safeText(cell.status).toLowerCase();
    if (isMissingStatus(status)) return '';
    if (cell.note) return cell.note;
    if (status === 'defect') return 'Defect marked.';
    if (status === 'partial') return 'Container has item issues.';
    if (status === 'note') return 'Issue marked.';
    return '';
}

function shouldShowIssueRef(cell) {
    if (!cell) return false;
    const status = safeText(cell.status).toLowerCase();
    if (isMissingStatus(status)) return false;
    return isIssueStatus(status) || !!safeText(cell.note);
}

function itemKey(lockerKey, item, parentItem) {
    const parentKey = parentItem ? safeText(parentItem.id || parentItem.name, 'parent') : '';
    const ownKey = safeText(item && (item.id || item.name), 'item');
    return `${lockerKey}::${parentKey}::${ownKey}`;
}

function visitLockerItems(locker, visitor) {
    const shelves = Array.isArray(locker && locker.shelves) ? locker.shelves : [];
    shelves.forEach((shelf) => {
        const items = Array.isArray(shelf && shelf.items) ? shelf.items : [];
        items.forEach((item) => {
            if (!item) return;
            visitor(item, null);
            if ((item.type || '').toLowerCase() === 'container' && Array.isArray(item.subItems)) {
                item.subItems.forEach((subItem) => {
                    if (subItem) visitor(subItem, item);
                });
            }
        });
    });
}

function collectExportRows(reports) {
    const lockerMap = new Map();
    const lockers = [];

    const ensureLocker = (locker) => {
        const key = safeText(locker && (locker.id || locker.name), `locker-${lockers.length + 1}`);
        if (!lockerMap.has(key)) {
            const group = {
                key,
                name: safeText(locker && locker.name, 'Locker'),
                rowMap: new Map(),
                rows: [],
            };
            lockerMap.set(key, group);
            lockers.push(group);
        }
        return lockerMap.get(key);
    };

    reports.forEach((report) => {
        const reportId = report.id;
        const reportLockers = Array.isArray(report.lockers) ? report.lockers : [];
        reportLockers.forEach((locker) => {
            const group = ensureLocker(locker);
            visitLockerItems(locker, (item, parentItem) => {
                const key = itemKey(group.key, item, parentItem);
                if (!group.rowMap.has(key)) {
                    const row = {
                        key,
                        name: safeText(item.name, 'Item'),
                        parentName: parentItem ? safeText(parentItem.name) : '',
                        cells: new Map(),
                    };
                    group.rowMap.set(key, row);
                    group.rows.push(row);
                }
                group.rowMap.get(key).cells.set(reportId, {
                    status: effectiveStatus(item),
                    note: safeText(item.note),
                });
            });
        });
    });

    return lockers.map((group) => ({
        key: group.key,
        name: group.name,
        rows: group.rows,
    }));
}

function pageCapacity() {
    return Math.floor((TABLE_BOTTOM - TABLE_TOP - HEADER_HEIGHT) / ROW_HEIGHT);
}

function buildPages(groups, reportChunks) {
    const capacity = pageCapacity();
    const pages = [];

    reportChunks.forEach((reportChunk, chunkIndex) => {
        let page = null;

        const newPage = () => {
            page = {
                reportChunk,
                chunkIndex,
                units: [],
            };
            pages.push(page);
        };

        const remaining = () => {
            if (!page) return 0;
            const used = page.units.reduce((sum, unit) => sum + (unit.type === 'section' ? 1 : 1), 0);
            return capacity - used;
        };

        newPage();

        groups.forEach((group) => {
            const rows = group.rows || [];
            if (rows.length === 0) return;
            let index = 0;

            while (index < rows.length) {
                if (!page || remaining() < 2) newPage();

                page.units.push({
                    type: 'section',
                    name: `${group.name}${index > 0 ? ' (continued)' : ''}`,
                });

                while (index < rows.length && remaining() > 0) {
                    page.units.push({
                        type: 'row',
                        row: rows[index],
                    });
                    index += 1;
                }

                if (index < rows.length) newPage();
            }
        });

        if (page && page.units.length === 0) {
            page.units.push({ type: 'empty' });
        }
    });

    return pages;
}

function buildNoteRefs(page) {
    const refs = new Map();
    const notes = [];
    page.units.forEach((unit) => {
        if (unit.type !== 'row') return;
        page.reportChunk.forEach((report) => {
            const cell = unit.row.cells.get(report.id);
            if (!shouldShowIssueRef(cell)) return;
            const noteText = noteTextForCell(cell);
            if (!noteText) return;
            const ref = notes.length + 1;
            const key = `${unit.row.key}:${report.id}`;
            refs.set(key, ref);
            notes.push({
                ref,
                date: formatDate(report.date, { shortYear: true }),
                item: unit.row.parentName ? `${unit.row.parentName} - ${unit.row.name}` : unit.row.name,
                note: noteText,
            });
        });
    });
    return { refs, notes };
}

function drawTick(doc, x, y, size) {
    doc.save()
        .strokeColor('#111111')
        .lineWidth(1.8)
        .moveTo(x + size * 0.18, y + size * 0.52)
        .lineTo(x + size * 0.42, y + size * 0.76)
        .lineTo(x + size * 0.84, y + size * 0.22)
        .stroke()
        .restore();
}

function drawCross(doc, x, y, size) {
    doc.save()
        .strokeColor('#111111')
        .lineWidth(1.7)
        .moveTo(x + size * 0.25, y + size * 0.25)
        .lineTo(x + size * 0.75, y + size * 0.75)
        .moveTo(x + size * 0.75, y + size * 0.25)
        .lineTo(x + size * 0.25, y + size * 0.75)
        .stroke()
        .restore();
}

function drawIssueMark(doc, x, y, size, ref) {
    doc.save()
        .fillColor('#111111')
        .font('Helvetica-Bold')
        .fontSize(size + 5)
        .text('!', x, y - 3, { width: size, align: 'center' })
        .fontSize(6)
        .text(String(ref), x + size - 1, y - 1, { width: 10, align: 'left' })
        .restore();
}

function drawPageHeader(doc, payload, page, pageIndex, totalPages) {
    const pageWidth = doc.page.width;
    const totalReports = Array.isArray(payload.reports) ? payload.reports.length : page.reportChunk.length;
    const groupStart = page.chunkIndex * MAX_REPORT_COLUMNS + 1;
    const groupEnd = Math.min(groupStart + page.reportChunk.length - 1, totalReports);
    const groupLabel = totalReports > 0
        ? `Reports ${groupStart}-${groupEnd} of ${totalReports}`
        : 'Reports';

    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(15)
        .text('Appliance Check Export', MARGIN, 24, { width: pageWidth - MARGIN * 2 });
    doc.fillColor('#222222').font('Helvetica').fontSize(9)
        .text(`Appliance: ${safeText(payload.applianceName, 'Appliance')}`, MARGIN, 46)
        .text(`Range: ${formatDate(payload.from)} to ${formatDate(payload.to)}`, MARGIN, 59);
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(10)
        .text(groupLabel, MARGIN, 80, { width: pageWidth - MARGIN * 2 - 180 });
    doc.fillColor('#444444').fontSize(8)
        .text(`Generated: ${formatDateTime(new Date())}`, pageWidth - MARGIN - 170, 48, { width: 170, align: 'right' })
        .text(`Page ${pageIndex + 1} of ${totalPages}`, pageWidth - MARGIN - 170, 62, { width: 170, align: 'right' });
}

function drawTableHeader(doc, page, metrics) {
    const { tableLeft, tableWidth, dateColWidth } = metrics;
    doc.save()
        .rect(tableLeft, TABLE_TOP, tableWidth, HEADER_HEIGHT)
        .fill('#eeeeee')
        .restore();

    doc.strokeColor('#111111').lineWidth(1.1).rect(tableLeft, TABLE_TOP, tableWidth, HEADER_HEIGHT).stroke();

    page.reportChunk.forEach((report, index) => {
        const x = tableLeft + ITEM_COL_WIDTH + index * dateColWidth;
        const checkedBy = reportUserName(report);
        doc.strokeColor('#666666').lineWidth(0.6)
            .moveTo(x, TABLE_TOP)
            .lineTo(x, TABLE_TOP + HEADER_HEIGHT)
            .stroke();
        doc.save()
            .translate(x + dateColWidth / 2, TABLE_TOP + HEADER_HEIGHT - 16)
            .rotate(-90)
            .fillColor('#111111')
            .font('Helvetica-Bold')
            .fontSize(7)
            .text(formatDate(report.date, { shortYear: true }), 0, -dateColWidth / 2 + 3, {
                width: HEADER_HEIGHT - 22,
                align: 'center',
            })
            .restore();
        doc.fillColor('#222222')
            .font('Helvetica')
            .fontSize(5.6)
            .text(checkedBy, x + 3, TABLE_TOP + HEADER_HEIGHT - 13, {
                width: dateColWidth - 6,
                height: 9,
                align: 'center',
                ellipsis: true,
            });
    });
}

function drawSection(doc, y, text, metrics) {
    const { tableLeft, tableWidth } = metrics;
    doc.save()
        .rect(tableLeft, y, tableWidth, SECTION_HEIGHT)
        .fill('#747474')
        .restore();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
        .text(text, tableLeft + 6, y + 5, { width: tableWidth - 12 });
}

function drawRow(doc, y, row, page, metrics, refs, rowIndex) {
    const { tableLeft, tableWidth, dateColWidth } = metrics;
    const fill = rowIndex % 2 === 0 ? '#ffffff' : '#f7f7f7';
    doc.save().rect(tableLeft, y, tableWidth, ROW_HEIGHT).fill(fill).restore();
    doc.strokeColor('#cfcfcf').lineWidth(0.4)
        .rect(tableLeft, y, tableWidth, ROW_HEIGHT)
        .stroke();

    const label = row.parentName ? `  ${row.name}` : row.name;
    doc.fillColor(row.parentName ? '#444444' : '#111111')
        .font(row.parentName ? 'Helvetica' : 'Helvetica-Bold')
        .fontSize(8)
        .text(label, tableLeft + 5, y + 5, {
            width: ITEM_COL_WIDTH - 10,
            height: ROW_HEIGHT - 4,
            ellipsis: true,
        });

    page.reportChunk.forEach((report, index) => {
        const x = tableLeft + ITEM_COL_WIDTH + index * dateColWidth;
        doc.strokeColor('#cfcfcf').lineWidth(0.35)
            .moveTo(x, y)
            .lineTo(x, y + ROW_HEIGHT)
            .stroke();

        const cell = row.cells.get(report.id);
        if (!cell) return;

        const status = safeText(cell.status).toLowerCase();
        const markSize = 12;
        const markX = x + (dateColWidth - markSize) / 2;
        const markY = y + 2.5;
        const noteRef = refs.get(`${row.key}:${report.id}`);
        if (noteRef) {
            drawIssueMark(doc, markX, markY, markSize, noteRef);
        } else if (status === 'present') {
            drawTick(doc, markX, markY, markSize);
        } else if (status === 'missing') {
            drawCross(doc, markX, markY, markSize);
        }
    });
}

function drawFootnotes(doc, notes, metrics) {
    const { tableLeft, tableWidth } = metrics;
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(9)
        .text('Issue notes', tableLeft, FOOTNOTE_TOP, { width: tableWidth });

    if (notes.length === 0) {
        doc.fillColor('#444444').font('Helvetica').fontSize(8)
            .text('No issue notes recorded on this page.', tableLeft, FOOTNOTE_TOP + 14, { width: tableWidth });
        return;
    }

    let y = FOOTNOTE_TOP + 14;
    const bottom = doc.page.height - MARGIN;
    notes.forEach((note, index) => {
        if (y > bottom - 12) {
            if (index < notes.length) {
                doc.fillColor('#444444').font('Helvetica').fontSize(7)
                    .text('Additional notes continue in the source reports.', tableLeft, y, { width: tableWidth });
            }
            return;
        }
        const text = `${note.ref}. ${note.date} - ${note.item}: ${note.note}`;
        doc.fillColor('#222222').font('Helvetica').fontSize(7.4)
            .text(text, tableLeft, y, {
                width: tableWidth,
                height: 11,
                ellipsis: true,
            });
        y += 11;
    });
}

function reportUserName(report) {
    return safeText(report && (report.signedName || report.username || report.creatorName), 'Unknown');
}

function drawEmptyPage(doc, metrics) {
    doc.fillColor('#444444').font('Helvetica').fontSize(10)
        .text('No checklist items were recorded for these reports.', metrics.tableLeft, TABLE_TOP + 44, {
            width: metrics.tableWidth,
            align: 'center',
        });
}

function drawExport(doc, payload) {
    const reports = Array.isArray(payload.reports) ? payload.reports : [];
    const groups = collectExportRows(reports);
    const reportChunks = chunkArray(reports, MAX_REPORT_COLUMNS);
    const pages = buildPages(groups, reportChunks);
    const pageWidth = doc.page.width;
    const tableLeft = MARGIN;
    const tableWidth = pageWidth - MARGIN * 2;

    pages.forEach((page, pageIndex) => {
        if (pageIndex > 0) doc.addPage();

        const dateColWidth = (tableWidth - ITEM_COL_WIDTH) / Math.max(1, page.reportChunk.length);
        const metrics = { tableLeft, tableWidth, dateColWidth };
        const { refs, notes } = buildNoteRefs(page);

        drawPageHeader(doc, payload, page, pageIndex, pages.length);
        drawTableHeader(doc, page, metrics);

        let y = TABLE_TOP + HEADER_HEIGHT;
        let rowIndex = 0;
        page.units.forEach((unit) => {
            if (unit.type === 'section') {
                drawSection(doc, y, unit.name, metrics);
                y += SECTION_HEIGHT;
            } else if (unit.type === 'row') {
                drawRow(doc, y, unit.row, page, metrics, refs, rowIndex);
                y += ROW_HEIGHT;
                rowIndex += 1;
            } else if (unit.type === 'empty') {
                drawEmptyPage(doc, metrics);
            }
        });

        drawFootnotes(doc, notes, metrics);
    });
}

function buildReportExportPdf(payload) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: PAGE_SIZE,
            layout: PAGE_LAYOUT,
            margin: 0,
            bufferPages: false,
            autoFirstPage: true,
            info: {
                Title: 'Appliance Check Export',
                Author: 'Flashover',
                Subject: safeText(payload.applianceName, 'Appliance reports'),
            },
        });

        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        try {
            drawExport(doc, payload);
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

function buildReportExportFilename({ applianceName, from, to } = {}) {
    const appliance = sanitizeFilenamePart(applianceName, 'appliance');
    const fromPart = sanitizeFilenamePart(formatDate(from), 'from');
    const toPart = sanitizeFilenamePart(formatDate(to), 'to');
    return `${appliance}-check-export-${fromPart}-to-${toPart}.pdf`;
}

module.exports = {
    MAX_REPORT_COLUMNS,
    buildReportExportFilename,
    buildReportExportPdf,
    collectExportRows,
};
