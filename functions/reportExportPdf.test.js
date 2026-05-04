const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildReportExportPdf,
    collectExportRows,
} = require('./reportExportPdf');

function report(id, date, lockers) {
    return { id, date, lockers };
}

function locker(id, name, items) {
    return { id, name, items };
}

function item(id, name, status = 'present', extra = {}) {
    return { id, name, status, ...extra };
}

function allRows(groups) {
    return groups.flatMap((group) => group.rows.map((row) => ({ group, row })));
}

function rowFor(groups, identity) {
    return allRows(groups).find(({ row }) => row.identity === `id:${identity}`);
}

test('collectExportRows keeps a moved item on one row and records setup movement', () => {
    const groups = collectExportRows([
        report('r1', '2026-01-01T00:00:00.000Z', [
            locker('rear', 'Rear Locker', [item('hose', 'Hose', 'present')]),
        ]),
        report('r2', '2026-02-01T00:00:00.000Z', [
            locker('cab', 'Cab Locker', [item('hose', 'Hose', 'missing')]),
        ]),
    ]);

    const matches = allRows(groups).filter(({ row }) => row.identity === 'id:hose');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].group.name, 'Cab Locker');
    assert.equal(matches[0].row.cells.get('r1').status, 'present');
    assert.equal(matches[0].row.cells.get('r2').status, 'missing');
    assert.equal(matches[0].row.cells.get('r1').locationLabel, 'Rear Locker');
    assert.equal(matches[0].row.cells.get('r2').locationLabel, 'Cab Locker');
    assert.match(matches[0].row.setupNotes[0].note, /Moved from Rear Locker to Cab Locker/);
});

test('collectExportRows marks added and deleted items as not-in-setup', () => {
    const groups = collectExportRows([
        report('r1', '2026-01-01T00:00:00.000Z', [
            locker('rear', 'Rear Locker', [item('branch', 'Branch')]),
        ]),
        report('r2', '2026-02-01T00:00:00.000Z', [
            locker('rear', 'Rear Locker', [item('torch', 'Torch')]),
        ]),
    ]);

    const branch = rowFor(groups, 'branch');
    const torch = rowFor(groups, 'torch');

    assert.equal(branch.group.name, 'Archived / historical items');
    assert.equal(branch.row.cells.get('r1').status, 'present');
    assert.equal(branch.row.cells.get('r2').status, 'not-in-setup');
    assert.equal(torch.group.name, 'Rear Locker');
    assert.equal(torch.row.cells.get('r1').status, 'not-in-setup');
    assert.equal(torch.row.cells.get('r2').status, 'present');
});

test('collectExportRows handles container sub-item addition and deletion', () => {
    const groups = collectExportRows([
        report('r1', '2026-01-01T00:00:00.000Z', [
            locker('cab', 'Cab Locker', [
                item('kit', 'Medical Kit', 'present', {
                    type: 'container',
                    subItems: [
                        item('bandage', 'Bandage'),
                        item('old-splint', 'Old Splint'),
                    ],
                }),
            ]),
        ]),
        report('r2', '2026-02-01T00:00:00.000Z', [
            locker('cab', 'Cab Locker', [
                item('kit', 'Medical Kit', 'present', {
                    type: 'container',
                    subItems: [
                        item('bandage', 'Bandage'),
                        item('mask', 'Mask'),
                    ],
                }),
            ]),
        ]),
    ]);

    const bandage = rowFor(groups, 'bandage');
    const mask = rowFor(groups, 'mask');
    const oldSplint = rowFor(groups, 'old-splint');

    assert.equal(bandage.row.parentName, 'Medical Kit');
    assert.equal(bandage.row.cells.get('r1').status, 'present');
    assert.equal(bandage.row.cells.get('r2').status, 'present');
    assert.equal(mask.row.cells.get('r1').status, 'not-in-setup');
    assert.equal(mask.row.cells.get('r2').status, 'present');
    assert.equal(oldSplint.group.name, 'Archived / historical items');
    assert.equal(oldSplint.row.cells.get('r2').status, 'not-in-setup');
});

test('collectExportRows keeps renamed items together but recreated items separate', () => {
    const groups = collectExportRows([
        report('r1', '2026-01-01T00:00:00.000Z', [
            locker('rear', 'Rear Locker', [
                item('bar', 'Old Name'),
                item('foam-1', 'Foam'),
            ]),
        ]),
        report('r2', '2026-02-01T00:00:00.000Z', [
            locker('rear', 'Rear Locker', [
                item('bar', 'New Name'),
                item('foam-2', 'Foam'),
            ]),
        ]),
    ]);

    const renamed = rowFor(groups, 'bar');
    const foamRows = allRows(groups).filter(({ row }) => row.name === 'Foam');

    assert.equal(allRows(groups).filter(({ row }) => row.identity === 'id:bar').length, 1);
    assert.equal(renamed.row.name, 'New Name');
    assert.match(renamed.row.setupNotes[0].note, /Renamed from Old Name to New Name/);
    assert.equal(foamRows.length, 2);
    assert.equal(rowFor(groups, 'foam-1').group.name, 'Archived / historical items');
    assert.equal(rowFor(groups, 'foam-2').group.name, 'Rear Locker');
});

test('buildReportExportPdf renders a version-aware export PDF', async () => {
    const buffer = await buildReportExportPdf({
        applianceName: 'Truck 1',
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: new Date('2026-02-28T23:59:59.999Z'),
        reports: [
            report('r1', '2026-01-01T00:00:00.000Z', [
                locker('rear', 'Rear Locker', [item('hose', 'Hose')]),
            ]),
            report('r2', '2026-02-01T00:00:00.000Z', [
                locker('cab', 'Cab Locker', [item('hose', 'Hose')]),
            ]),
        ],
    });

    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 1000);
});
