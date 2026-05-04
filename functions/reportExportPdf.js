const PDFDocument = require('pdfkit');

const MAX_REPORT_COLUMNS = 10;
const PAGE_SIZE = 'A4';
const PAGE_LAYOUT = 'portrait';
const MARGIN = 28;
const TABLE_TOP = 96;
const TABLE_BOTTOM = 650;
const FOOTNOTE_TOP = 668;
const ROW_HEIGHT = 17;
const SECTION_HEIGHT = 18;
const HEADER_HEIGHT = 56;
const ITEM_COL_WIDTH = 180;

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
        if (raw === 'present' || raw === 'missing' || raw === 'defect' || raw === 'note' || raw === 'partial') return raw;
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
    if (cell.note && cell.noteImage) return `${cell.note} Image attached.`;
    if (cell.note) return cell.note;
    if (cell.noteImage) return 'Image attached.';
    if (status === 'defect') return 'Defect marked.';
    if (status === 'partial') return 'Container has item issues.';
    if (status === 'note') return 'Issue marked.';
    return '';
}

function shouldShowIssueRef(cell) {
    if (!cell) return false;
    const status = safeText(cell.status).toLowerCase();
    if (isMissingStatus(status)) return false;
    if (status === 'not-in-setup') return false;
    return isIssueStatus(status) || !!safeText(cell.note) || !!safeText(cell.noteImage);
}

function rawItemIdentity(item, parentItem, locker) {
    const id = safeText(item && item.id);
    if (id) return `id:${id}`;

    const lockerKey = safeText(locker && (locker.id || locker.name), 'locker');
    const parentKey = parentItem ? safeText(parentItem.id || parentItem.name, 'parent') : '';
    const name = safeText(item && item.name, 'item');
    return `legacy:${lockerKey}:${parentKey}:${name}`;
}

function itemKey(identity, item, parentItem, locker, duplicateIdentity = false) {
    if (!duplicateIdentity) return identity;

    const lockerKey = safeText(locker && (locker.id || locker.name), 'locker');
    const parentKey = parentItem ? safeText(parentItem.id || parentItem.name, 'parent') : '';
    return `${identity}:${lockerKey}:${parentKey}`;
}

function lockerItems(locker) {
    if (Array.isArray(locker && locker.items)) return locker.items;
    if (Array.isArray(locker && locker.shelves)) {
        return locker.shelves.flatMap((shelf) => Array.isArray(shelf && shelf.items) ? shelf.items : []);
    }
    return [];
}

function visitLockerItems(locker, visitor) {
    lockerItems(locker).forEach((item) => {
        if (!item) return;
        visitor(item, null);
        if ((item.type || '').toLowerCase() === 'container' && Array.isArray(item.subItems)) {
            item.subItems.forEach((subItem) => {
                if (subItem) visitor(subItem, item);
            });
        }
    });
}

function reportHasSetupSnapshot(report) {
    return Array.isArray(report && report.lockers);
}

function reportSnapshotItems(report) {
    const appearances = [];
    const reportLockers = reportHasSetupSnapshot(report) ? report.lockers : [];

    reportLockers.forEach((locker) => {
        const lockerKey = safeText(locker && (locker.id || locker.name), `locker-${appearances.length + 1}`);
        const lockerName = safeText(locker && locker.name, 'Locker');
        visitLockerItems(locker, (item, parentItem) => {
            const parentName = parentItem ? safeText(parentItem.name, 'Container') : '';
            const locationLabel = parentName ? `${lockerName} / ${parentName}` : lockerName;
            const identity = rawItemIdentity(item, parentItem, locker);
            appearances.push({
                identity,
                item,
                parentItem,
                locker,
                lockerKey,
                lockerName,
                parentName,
                locationLabel,
            });
        });
    });

    return appearances;
}

function buildSnapshotAppearances(reports) {
    return reports.map((report, reportIndex) => {
        const appearances = reportSnapshotItems(report);
        const identityCounts = new Map();
        appearances.forEach((appearance) => {
            identityCounts.set(appearance.identity, (identityCounts.get(appearance.identity) || 0) + 1);
        });

        return {
            report,
            reportIndex,
            hasSetupSnapshot: reportHasSetupSnapshot(report),
            appearances,
            identityCounts,
        };
    });
}

function collectExportRows(reports) {
    const orderedReports = Array.isArray(reports) ? reports : [];
    const snapshots = buildSnapshotAppearances(orderedReports);
    const rowMap = new Map();
    const rowOrder = [];
    const latestSnapshotIndex = snapshots.reduce((latest, snapshot) => (
        snapshot.hasSetupSnapshot ? snapshot.reportIndex : latest
    ), -1);

    const ensureRow = (key, appearance, snapshot) => {
        if (!rowMap.has(key)) {
            const row = {
                key,
                identity: appearance.identity,
                name: safeText(appearance.item && appearance.item.name, 'Item'),
                parentName: appearance.parentName,
                groupKey: appearance.lockerKey,
                groupName: appearance.lockerName,
                firstSeenIndex: snapshot.reportIndex,
                lastSeenIndex: snapshot.reportIndex,
                firstLocationLabel: appearance.locationLabel,
                latestLocationLabel: appearance.locationLabel,
                latestName: safeText(appearance.item && appearance.item.name, 'Item'),
                latestParentName: appearance.parentName,
                latestGroupKey: appearance.lockerKey,
                latestGroupName: appearance.lockerName,
                cells: new Map(),
                setupNotes: [],
                seenLocationLabels: new Set([appearance.locationLabel]),
                seenNames: new Set([safeText(appearance.item && appearance.item.name, 'Item')]),
            };
            rowMap.set(key, row);
            rowOrder.push(row);
        }
        return rowMap.get(key);
    };

    snapshots.forEach((snapshot) => {
        const reportId = snapshot.report.id;
        snapshot.appearances.forEach((appearance) => {
            const duplicateIdentity = (snapshot.identityCounts.get(appearance.identity) || 0) > 1;
            const key = itemKey(appearance.identity, appearance.item, appearance.parentItem, appearance.locker, duplicateIdentity);
            const row = ensureRow(key, appearance, snapshot);
            const itemName = safeText(appearance.item && appearance.item.name, 'Item');

            if (row.latestLocationLabel !== appearance.locationLabel) {
                row.setupNotes.push({
                    reportId,
                    date: snapshot.report.date,
                    item: itemName,
                    note: `Moved from ${row.latestLocationLabel} to ${appearance.locationLabel}.`,
                });
                row.seenLocationLabels.add(appearance.locationLabel);
            }
            if (row.latestName !== itemName) {
                row.setupNotes.push({
                    reportId,
                    date: snapshot.report.date,
                    item: itemName,
                    note: `Renamed from ${row.latestName} to ${itemName}.`,
                });
                row.seenNames.add(itemName);
            }

            row.lastSeenIndex = snapshot.reportIndex;
            row.name = itemName;
            row.parentName = appearance.parentName;
            row.latestName = itemName;
            row.latestParentName = appearance.parentName;
            row.latestLocationLabel = appearance.locationLabel;
            row.latestGroupKey = appearance.lockerKey;
            row.latestGroupName = appearance.lockerName;
            row.cells.set(reportId, {
                status: effectiveStatus(appearance.item),
                note: safeText(appearance.item && appearance.item.note),
                noteImage: safeText(appearance.item && appearance.item.noteImage),
                name: itemName,
                parentName: appearance.parentName,
                locationLabel: appearance.locationLabel,
            });
        });
    });

    rowOrder.forEach((row) => {
        snapshots.forEach((snapshot) => {
            const reportId = snapshot.report.id;
            if (snapshot.hasSetupSnapshot && !row.cells.has(reportId)) {
                row.cells.set(reportId, {
                    status: 'not-in-setup',
                    note: '',
                    noteImage: '',
                    locationLabel: '',
                });
            }
        });
    });

    const groupMap = new Map();
    const groups = [];
    const archivedRows = [];
    const ensureGroup = (key, name) => {
        if (!groupMap.has(key)) {
            const group = { key, name, rows: [] };
            groupMap.set(key, group);
            groups.push(group);
        }
        return groupMap.get(key);
    };

    rowOrder.forEach((row) => {
        const archived = latestSnapshotIndex >= 0 && row.lastSeenIndex < latestSnapshotIndex;
        if (archived) {
            archivedRows.push(row);
            return;
        }

        row.groupKey = row.latestGroupKey;
        row.groupName = row.latestGroupName;
        row.parentName = row.latestParentName;
        ensureGroup(row.groupKey, row.groupName).rows.push(row);
    });

    if (archivedRows.length > 0) {
        groups.push({
            key: '__archived__',
            name: 'Archived / historical items',
            rows: archivedRows,
        });
    }

    return groups.map((group) => ({
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
    page.units.forEach((unit) => {
        if (unit.type !== 'row' || !Array.isArray(unit.row.setupNotes)) return;
        unit.row.setupNotes.forEach((setupNote) => {
            if (!page.reportChunk.some((report) => report.id === setupNote.reportId)) return;
            notes.push({
                ref: notes.length + 1,
                date: formatDate(setupNote.date, { shortYear: true }),
                item: setupNote.item || unit.row.name,
                note: setupNote.note,
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

function drawIssueMark(doc, cellX, cellY, cellWidth, cellHeight, size, ref) {
    const centerX = cellX + cellWidth / 2;
    const centerY = cellY + cellHeight / 2;
    doc.save()
        .strokeColor('#111111')
        .fillColor('#111111')
        .lineWidth(2.2)
        .moveTo(centerX - size * 0.5, centerY)
        .lineTo(centerX + size * 0.5, centerY)
        .stroke()
        .font('Helvetica-Bold')
        .fontSize(6)
        .text(String(ref), cellX + cellWidth - 12, cellY + 2, { width: 9, align: 'right' })
        .restore();
}

function drawNotInSetupMark(doc, cellX, cellY, cellWidth, cellHeight) {
    const centerY = cellY + cellHeight / 2;
    doc.save()
        .strokeColor('#9ca3af')
        .lineWidth(1)
        .moveTo(cellX + cellWidth * 0.35, centerY)
        .lineTo(cellX + cellWidth * 0.65, centerY)
        .stroke()
        .restore();
}

function drawVerticalHeaderText(doc, text, x, y, width, height, options = {}) {
    doc.save()
        .translate(x + width / 2, y + height)
        .rotate(-90)
        .fillColor(options.color || '#111111')
        .font(options.font || 'Helvetica')
        .fontSize(options.fontSize || 7)
        .text(text, 0, -width / 2 + 3, {
            width: height,
            height: width - 6,
            align: 'center',
            ellipsis: true,
        })
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
    doc.fillColor('#666666').font('Helvetica').fontSize(7.5)
        .text('Export uses the appliance layout saved with each report.', MARGIN, 72, { width: pageWidth - MARGIN * 2 - 180 });
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(10)
        .text(groupLabel, MARGIN, 84, { width: pageWidth - MARGIN * 2 - 180 });
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
        const dateLaneWidth = dateColWidth * 0.43;
        const userLaneWidth = dateColWidth - dateLaneWidth;
        drawVerticalHeaderText(doc, formatDate(report.date, { shortYear: true }), x + 2, TABLE_TOP + 6, dateLaneWidth, HEADER_HEIGHT - 12, {
            font: 'Helvetica-Bold',
            fontSize: 6.4,
        });
        drawVerticalHeaderText(doc, checkedBy, x + dateLaneWidth, TABLE_TOP + 6, userLaneWidth - 2, HEADER_HEIGHT - 12, {
            color: '#222222',
            font: 'Helvetica',
            fontSize: 5.3,
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
        const markY = y + (ROW_HEIGHT - markSize) / 2;
        const noteRef = refs.get(`${row.key}:${report.id}`);
        if (noteRef) {
            drawIssueMark(doc, x, y, dateColWidth, ROW_HEIGHT, markSize, noteRef);
        } else if (status === 'present') {
            drawTick(doc, markX, markY, markSize);
        } else if (status === 'missing') {
            drawCross(doc, markX, markY, markSize);
        } else if (status === 'not-in-setup') {
            drawNotInSetupMark(doc, x, y, dateColWidth, ROW_HEIGHT);
        }
    });
}

function drawFootnotes(doc, notes, metrics) {
    const { tableLeft, tableWidth } = metrics;
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(9)
        .text('Issue and setup notes', tableLeft, FOOTNOTE_TOP, { width: tableWidth });

    if (notes.length === 0) {
        doc.fillColor('#444444').font('Helvetica').fontSize(8)
            .text('No issue or setup notes recorded on this page.', tableLeft, FOOTNOTE_TOP + 14, { width: tableWidth });
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
