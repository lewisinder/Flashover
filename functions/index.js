const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const os = require('os');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sharp = require('sharp');
const Busboy = require('busboy');
const {
    buildReportExportFilename,
    buildReportExportPdf,
} = require('./reportExportPdf');

// --- Local Emulator Support (Admin SDK) ---
// When running locally, point the Admin SDK at the emulators so it doesn't require prod credentials
// and can accept Auth Emulator tokens.
const isFunctionsEmulator =
  process.env.FUNCTIONS_EMULATOR === 'true' || !!process.env.FIREBASE_EMULATOR_HUB;

if (isFunctionsEmulator) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  console.log('Admin SDK: Using emulators', {
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
  });
}

// --- Firebase Admin SDK Initialization ---
admin.initializeApp();

// --- SMTP Initialization (Gmail/Outlook via nodemailer) ---
const smtpConfig = functions.config().smtp || {};
const transporter = nodemailer.createTransport({
  host: smtpConfig.host,
  port: Number(smtpConfig.port),
  secure: Number(smtpConfig.port) === 465,
  auth: {
    user: smtpConfig.user,
    pass: smtpConfig.pass,
  },
});
const DEFAULT_FROM_EMAIL = smtpConfig.from || "hello@theblueprintcollective.co.nz";
const REPORT_EXPORT_DOWNLOAD_TTL_MS = 10 * 60 * 1000;
const USER_IDENTIFIER_PREFIX = 'U';
const BRIGADE_IDENTIFIER_PREFIX = 'B';
const CHECK_LOCK_TTL_MS = 12 * 60 * 60 * 1000;
const CHECK_EDITOR_LEASE_MS = 15 * 60 * 1000;
const IMAGE_UPLOAD_PREFIX = 'uploads';
const ROLES = Object.freeze({
    ADMIN: 'admin',
    GEAR_MANAGER: 'gearManager',
    MEMBER: 'member',
    VIEWER: 'viewer',
});

// --- Firestore/Storage References ---
const bucket = admin.storage().bucket();
const db = admin.firestore();

// ===================================================================
// SECURITY HELPERS
// ===================================================================
async function getBrigadeDoc(brigadeId) {
    if (!brigadeId) return null;
    const ref = db.collection('brigades').doc(brigadeId);
    const doc = await ref.get();
    if (!doc.exists) return null;
    return { ref, data: doc.data() };
}

async function getBrigadeMember(brigadeId, userId) {
    if (!brigadeId || !userId) return null;
    const ref = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);
    const doc = await ref.get();
    if (!doc.exists) return null;
    return { ref, data: doc.data() };
}

function normalizeRole(role) {
    const raw = String(role || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (raw === 'admin') return ROLES.ADMIN;
    if (raw === 'gearmanager') return ROLES.GEAR_MANAGER;
    if (raw === 'member') return ROLES.MEMBER;
    if (raw === 'viewer') return ROLES.VIEWER;
    return null;
}

function roleLabel(role) {
    const normalized = normalizeRole(role);
    if (normalized === ROLES.ADMIN) return 'Admin';
    if (normalized === ROLES.GEAR_MANAGER) return 'Gear Manager';
    if (normalized === ROLES.VIEWER) return 'Viewer';
    return 'Member';
}

function isAdminRole(role) {
    return normalizeRole(role) === ROLES.ADMIN;
}

function canManageMembers(role) {
    return normalizeRole(role) === ROLES.ADMIN;
}

function canDeleteBrigade(role) {
    return normalizeRole(role) === ROLES.ADMIN;
}

function canEditSetup(role) {
    const normalized = normalizeRole(role);
    return normalized === ROLES.ADMIN || normalized === ROLES.GEAR_MANAGER;
}

function canRunChecks(role) {
    const normalized = normalizeRole(role);
    return normalized === ROLES.ADMIN || normalized === ROLES.GEAR_MANAGER || normalized === ROLES.MEMBER;
}

function canViewReports(role) {
    return !!normalizeRole(role);
}

function displayNameFromProfile(profile, fallback = 'Unknown') {
    return cleanOptionalText(
        (profile && (profile.fullName || profile.name || profile.displayName)) || fallback,
        'Display name',
        160
    ) || fallback;
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanControlChars(value, { allowNewlines = false } = {}) {
    const raw = typeof value === 'string' ? value : '';
    const pattern = allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
    return raw.replace(pattern, '').replace(/[<>]/g, '').trim();
}

function cleanRequiredText(value, label, maxLength) {
    const cleaned = cleanControlChars(value);
    if (!cleaned) {
        const error = new Error(`${label} is required.`);
        error.status = 400;
        throw error;
    }
    if (cleaned.length > maxLength) {
        const error = new Error(`${label} must be ${maxLength} characters or fewer.`);
        error.status = 400;
        throw error;
    }
    return cleaned;
}

function cleanOptionalText(value, label, maxLength, options = {}) {
    if (value == null) return '';
    const cleaned = cleanControlChars(value, options);
    if (cleaned.length > maxLength) {
        const error = new Error(`${label} must be ${maxLength} characters or fewer.`);
        error.status = 400;
        throw error;
    }
    return cleaned;
}

function cleanId(value, label) {
    const cleaned = cleanControlChars(value);
    if (!cleaned || cleaned.length > 80 || !/^[A-Za-z0-9_-]+$/.test(cleaned)) {
        const error = new Error(`${label} must be a safe identifier.`);
        error.status = 400;
        throw error;
    }
    return cleaned;
}

function allowedStorageBuckets() {
    return new Set([
        bucket.name,
        'flashoverapplication.appspot.com',
        'flashoverapplication.firebasestorage.app',
    ].filter(Boolean));
}

function projectStorageObjectPathFromUrl(rawUrl) {
    const url = new URL(rawUrl);
    const isLocalStorageEmulator =
        isFunctionsEmulator &&
        url.protocol === 'http:' &&
        (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    if (url.protocol !== 'https:' && !isLocalStorageEmulator) return '';

    const allowedBuckets = allowedStorageBuckets();

    if (url.hostname === 'storage.googleapis.com') {
        const parts = decodeURIComponent(url.pathname).replace(/^\/+/, '').split('/');
        const bucketName = parts.shift();
        const objectPath = parts.join('/');
        return allowedBuckets.has(bucketName) ? objectPath : '';
    }

    if (url.hostname === 'firebasestorage.googleapis.com' || isLocalStorageEmulator) {
        const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
        if (!match) return '';
        const bucketName = decodeURIComponent(match[1]);
        const objectPath = decodeURIComponent(match[2]).replace(/^\/+/, '');
        return allowedBuckets.has(bucketName) ? objectPath : '';
    }

    if (allowedBuckets.has(url.hostname)) {
        return decodeURIComponent(url.pathname).replace(/^\/+/, '');
    }

    return '';
}

function normalizeUploadStoragePath(brigadeId, value) {
    const raw = cleanControlChars(value);
    if (!raw) return '';
    const expectedPrefix = `${IMAGE_UPLOAD_PREFIX}/${brigadeId}/`;
    if (raw.startsWith(expectedPrefix) && /^uploads\/[^/]+\/image-[A-Za-z0-9._-]+\.webp$/.test(raw)) {
        return raw;
    }

    try {
        const objectPath = projectStorageObjectPathFromUrl(raw);
        if (!objectPath) return null;
        const uploadsIndex = objectPath.indexOf(expectedPrefix);
        if (uploadsIndex === -1) return null;
        const storagePath = objectPath.slice(uploadsIndex);
        if (/^uploads\/[^/]+\/image-[A-Za-z0-9._-]+\.webp$/.test(storagePath)) {
            return storagePath;
        }
    } catch (e) {
        return null;
    }
    return null;
}

function isImageUploadPath(value) {
    return /^uploads\/(?:[^/]+\/)?image-[A-Za-z0-9._-]+\.webp$/.test(value);
}

function isLegacyProjectStorageUrl(value) {
    const raw = cleanControlChars(value);
    if (!raw) return false;
    try {
        const objectPath = projectStorageObjectPathFromUrl(raw);
        return isImageUploadPath(objectPath);
    } catch (e) {
        return false;
    }
    return false;
}

function normalizeImageRef(brigadeId, value, existingValue = '') {
    if (!value) return '';
    const raw = cleanControlChars(value);
    if (!raw) return '';
    if (/^\/design_assets\/[^<>"'\\]+$/.test(raw)) return raw;

    const storagePath = normalizeUploadStoragePath(brigadeId, raw);
    if (storagePath) return storagePath;

    const existingRaw = cleanControlChars(existingValue);
    if (existingRaw && raw === existingRaw && isLegacyProjectStorageUrl(raw)) {
        return raw;
    }
    if (existingRaw && raw === existingRaw) {
        console.warn('Clearing existing unsupported item image reference during setup save.');
        return '';
    }

    console.warn('Clearing unsupported item image reference during setup save.');
    return '';
}

function normalizeCheckStatus(value) {
    if (!isPlainObject(value) || value.inProgress !== true) return null;
    const uid = cleanOptionalText(value.uid, 'Check lock user id', 128);
    if (!uid) return null;
    const user = cleanOptionalText(value.user, 'Check lock user', 160) || 'Unknown';
    const timestamp = cleanOptionalText(value.timestamp, 'Check lock timestamp', 80) || new Date().toISOString();
    const timestampMs = Date.parse(timestamp);
    const baseMs = Number.isFinite(timestampMs) ? timestampMs : Date.now();
    const expiresAt = cleanOptionalText(value.expiresAt, 'Check lock expiry', 80) || new Date(baseMs + CHECK_LOCK_TTL_MS).toISOString();
    const lock = { inProgress: true, user, uid, timestamp, expiresAt };
    const sessionId = cleanOptionalText(value.sessionId, 'Check session id', 128);
    if (sessionId) lock.sessionId = sessionId;
    if (isPlainObject(value.previousLock)) {
        lock.previousLock = {
            uid: cleanOptionalText(value.previousLock.uid, 'Previous lock user id', 128),
            user: cleanOptionalText(value.previousLock.user, 'Previous lock user', 160),
            timestamp: cleanOptionalText(value.previousLock.timestamp, 'Previous lock timestamp', 80),
            expiresAt: cleanOptionalText(value.previousLock.expiresAt, 'Previous lock expiry', 80),
            overriddenAt: cleanOptionalText(value.previousLock.overriddenAt, 'Previous lock overridden time', 80),
            overriddenBy: cleanOptionalText(value.previousLock.overriddenBy, 'Previous lock override user id', 128),
        };
    }
    return lock;
}

function isCheckLockActive(lock, nowMs = Date.now()) {
    if (!lock || lock.inProgress !== true || !lock.uid) return false;
    const expiresAtMs = Date.parse(lock.expiresAt || '');
    if (Number.isFinite(expiresAtMs)) return expiresAtMs > nowMs;
    const timestampMs = Date.parse(lock.timestamp || '');
    if (!Number.isFinite(timestampMs)) return false;
    return timestampMs + CHECK_LOCK_TTL_MS > nowMs;
}

function makeCheckLock(user, previousLock = null) {
    const now = new Date();
    const lock = {
        inProgress: true,
        user: user.name || user.email || 'Unknown',
        uid: user.uid,
        timestamp: now.toISOString(),
        expiresAt: new Date(now.getTime() + CHECK_LOCK_TTL_MS).toISOString(),
    };
    if (previousLock) {
        lock.previousLock = {
            uid: previousLock.uid || '',
            user: previousLock.user || 'Unknown',
            timestamp: previousLock.timestamp || '',
            expiresAt: previousLock.expiresAt || '',
            overriddenAt: now.toISOString(),
            overriddenBy: user.uid,
        };
    }
    return lock;
}

function checkLockResponse(lock, requesterUid) {
    if (!lock || !isCheckLockActive(lock)) return { inProgress: false };
    return {
        inProgress: true,
        user: lock.user,
        uid: lock.uid,
        timestamp: lock.timestamp,
        expiresAt: lock.expiresAt,
        sessionId: lock.sessionId,
        isMine: lock.uid === requesterUid,
        previousLock: lock.previousLock,
    };
}

function findApplianceIndex(applianceData, applianceId) {
    const appliances = applianceData && Array.isArray(applianceData.appliances) ? applianceData.appliances : [];
    return appliances.findIndex(a => a && a.id === applianceId);
}

function cloneItemTree(item) {
    if (!isPlainObject(item)) return null;
    const clone = { ...item };
    if (Array.isArray(item.subItems)) {
        clone.subItems = item.subItems.map((subItem) => cloneItemTree(subItem)).filter(Boolean);
    } else {
        delete clone.subItems;
    }
    return clone;
}

function cloneShelfShape(shelf, fallbackId = '1') {
    if (!isPlainObject(shelf)) return null;
    return {
        ...shelf,
        id: shelf.id || fallbackId,
        items: (Array.isArray(shelf.items) ? shelf.items : []).map((item) => cloneItemTree(item)).filter(Boolean),
    };
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
        visitor(item);
    });
}

function normalizeLockerShape(locker = {}, { includeShelves = false } = {}) {
    const normalized = isPlainObject(locker) ? { ...locker } : {};
    const items = lockerItems(locker).map((item) => cloneItemTree(item)).filter(Boolean);
    normalized.items = items;
    if (includeShelves) {
        if (!Array.isArray(locker && locker.items) && Array.isArray(locker && locker.shelves)) {
            normalized.shelves = locker.shelves.map((shelf, index) => cloneShelfShape(shelf, String(index + 1))).filter(Boolean);
        } else {
            normalized.shelves = items.length > 0
                ? [{ id: '1', name: 'Shelf 1', items: items.map((item) => cloneItemTree(item)).filter(Boolean) }]
                : [];
        }
    } else {
        delete normalized.shelves;
    }
    return normalized;
}

function validateApplianceData(brigadeId, incomingData, existingData = {}) {
    if (!isPlainObject(incomingData) || !Array.isArray(incomingData.appliances)) {
        const error = new Error('Appliance data must contain an appliances array.');
        error.status = 400;
        throw error;
    }

    const allowedTopLevel = new Set(['appliances']);
    Object.keys(incomingData).forEach((key) => {
        if (!allowedTopLevel.has(key)) {
            const error = new Error(`Unexpected appliance data field: ${key}`);
            error.status = 400;
            throw error;
        }
    });

    const existingById = new Map(
        (Array.isArray(existingData.appliances) ? existingData.appliances : []).map((appliance) => [appliance && appliance.id, appliance])
    );
    const existingImageByItemId = new Map();
    (Array.isArray(existingData.appliances) ? existingData.appliances : []).forEach((appliance) => {
        (Array.isArray(appliance && appliance.lockers) ? appliance.lockers : []).forEach((locker) => {
            visitLockerItems(locker, (item) => {
                if (item && item.id && item.img) existingImageByItemId.set(String(item.id), item.img);
                (Array.isArray(item && item.subItems) ? item.subItems : []).forEach((subItem) => {
                    if (subItem && subItem.id && subItem.img) existingImageByItemId.set(String(subItem.id), subItem.img);
                });
            });
        });
    });
    const total = { items: 0 };

    function cleanItem(rawItem, pathLabel, isSubItem = false) {
        if (!isPlainObject(rawItem)) {
            const error = new Error(`${pathLabel} must be an object.`);
            error.status = 400;
            throw error;
        }
        total.items += 1;
        if (total.items > 2000) {
            const error = new Error('Appliance setup contains too many items.');
            error.status = 400;
            throw error;
        }
        const type = cleanOptionalText(rawItem.type, `${pathLabel} type`, 40) || 'item';
        if (type !== 'item' && type !== 'container') {
            const error = new Error(`${pathLabel} has an invalid type.`);
            error.status = 400;
            throw error;
        }
        const itemId = cleanId(rawItem.id, `${pathLabel} id`);
        const item = {
            id: itemId,
            name: cleanRequiredText(rawItem.name, `${pathLabel} name`, 100),
            desc: cleanOptionalText(rawItem.desc, `${pathLabel} description`, 1000, { allowNewlines: true }),
            type,
            img: normalizeImageRef(brigadeId, rawItem.img, existingImageByItemId.get(itemId)),
        };
        if (!isSubItem && type === 'container') {
            const subItems = Array.isArray(rawItem.subItems) ? rawItem.subItems : [];
            if (subItems.length > 200) {
                const error = new Error(`${pathLabel} has too many sub-items.`);
                error.status = 400;
                throw error;
            }
            item.subItems = subItems.map((sub, idx) => cleanItem(sub, `${pathLabel} sub-item ${idx + 1}`, true));
        }
        return item;
    }

    const appliances = incomingData.appliances.map((rawAppliance, applianceIndex) => {
        if (!isPlainObject(rawAppliance)) {
            const error = new Error(`Appliance ${applianceIndex + 1} must be an object.`);
            error.status = 400;
            throw error;
        }
        const applianceId = cleanId(rawAppliance.id, `Appliance ${applianceIndex + 1} id`);
        const lockers = Array.isArray(rawAppliance.lockers) ? rawAppliance.lockers : [];
        if (lockers.length > 80) {
            const error = new Error('Appliance contains too many lockers.');
            error.status = 400;
            throw error;
        }
        const appliance = {
            id: applianceId,
            name: cleanRequiredText(rawAppliance.name, `Appliance ${applianceIndex + 1} name`, 80),
            lockers: lockers.map((rawLocker, lockerIndex) => {
                if (!isPlainObject(rawLocker)) {
                    const error = new Error(`Locker ${lockerIndex + 1} must be an object.`);
                    error.status = 400;
                    throw error;
                }
                const rawItems = Array.isArray(rawLocker.items)
                    ? rawLocker.items
                    : lockerItems(rawLocker);
                if (rawItems.length > 2000) {
                    const error = new Error('Locker contains too many items.');
                    error.status = 400;
                    throw error;
                }
                return {
                    id: cleanId(rawLocker.id, `Locker ${lockerIndex + 1} id`),
                    name: cleanRequiredText(rawLocker.name, `Locker ${lockerIndex + 1} name`, 80),
                    items: rawItems.map((item, itemIndex) => cleanItem(item, `Locker ${lockerIndex + 1} item ${itemIndex + 1}`)),
                };
            }),
        };
        const existing = existingById.get(applianceId);
        const existingLock = normalizeCheckStatus(existing && existing.checkStatus);
        if (existingLock) appliance.checkStatus = existingLock;
        return appliance;
    });

    if (appliances.length > 30) {
        const error = new Error('Too many appliances.');
        error.status = 400;
        throw error;
    }

    return { appliances };
}

function applianceRef(brigadeId, applianceId) {
    return db.collection('brigades').doc(brigadeId).collection('appliances').doc(applianceId);
}

function applianceDataFromDoc(doc) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        name: data.name || 'Appliance',
        order: Number.isFinite(Number(data.order)) ? Number(data.order) : 0,
        version: Number.isFinite(Number(data.version)) ? Number(data.version) : 1,
        lockers: Array.isArray(data.lockers) ? data.lockers.map((locker) => normalizeLockerShape(locker, { includeShelves: true })) : [],
        checkStatus: normalizeCheckStatus(data.checkStatus),
    };
}

async function loadApplianceDataForBrigade(brigade) {
    if (!brigade) return { appliances: [] };
    const snapshot = await brigade.ref.collection('appliances').orderBy('order', 'asc').get();
    if (!snapshot.empty) {
        return {
            appliances: snapshot.docs
                .map(applianceDataFromDoc)
                .sort((a, b) => (a.order || 0) - (b.order || 0)),
        };
    }
    const legacy = brigade.data && brigade.data.applianceData;
    if (legacy && Array.isArray(legacy.appliances)) {
        return {
            appliances: legacy.appliances.map((appliance) => ({
                ...appliance,
                lockers: Array.isArray(appliance && appliance.lockers)
                    ? appliance.lockers.map((locker) => normalizeLockerShape(locker, { includeShelves: true }))
                    : [],
            })),
        };
    }
    return { appliances: [] };
}

async function getApplianceForBrigade(brigadeId, applianceId, brigade = null) {
    const doc = await applianceRef(brigadeId, applianceId).get();
    if (doc.exists) {
        return { ref: doc.ref, data: applianceDataFromDoc(doc) };
    }
    if (brigade) {
        const applianceData = await loadApplianceDataForBrigade(brigade);
        const appliance = applianceData.appliances.find((item) => item && item.id === applianceId);
        if (appliance) return { ref: applianceRef(brigadeId, applianceId), data: appliance };
    }
    return null;
}

async function saveApplianceDataForBrigade(brigade, brigadeId, incomingData) {
    const existingData = await loadApplianceDataForBrigade(brigade);
    const newData = validateApplianceData(brigadeId, incomingData, existingData);
    const existingSnapshot = await brigade.ref.collection('appliances').get();
    const incomingIds = new Set(newData.appliances.map((appliance) => appliance.id));
    const existingVersions = new Map(
        existingSnapshot.docs.map((doc) => [doc.id, Number(doc.data().version || 1)])
    );
    const batch = db.batch();
    newData.appliances.forEach((appliance, index) => {
        const currentVersion = existingVersions.get(appliance.id) || 0;
        const docRef = brigade.ref.collection('appliances').doc(appliance.id);
        const payload = {
            name: appliance.name,
            order: index,
            lockers: appliance.lockers || [],
            version: currentVersion + 1,
            updatedAt: FieldValue.serverTimestamp(),
        };
        if (appliance.checkStatus) payload.checkStatus = appliance.checkStatus;
        else payload.checkStatus = FieldValue.delete();
        if (!existingVersions.has(appliance.id)) payload.createdAt = FieldValue.serverTimestamp();
        batch.set(docRef, payload, { merge: true });
    });
    existingSnapshot.docs.forEach((doc) => {
        if (!incomingIds.has(doc.id)) batch.delete(doc.ref);
    });
    batch.set(brigade.ref, { applianceDataMigratedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
    return newData;
}

function checkSessionsRef(brigadeId) {
    return db.collection('brigades').doc(brigadeId).collection('checkSessions');
}

function checkSessionRef(brigadeId, sessionId) {
    return checkSessionsRef(brigadeId).doc(sessionId);
}

function activeSessionIdFromAppliance(appliance) {
    const lock = normalizeCheckStatus(appliance && appliance.checkStatus);
    return lock && lock.sessionId ? lock.sessionId : null;
}

function normalizeAnswer(raw, fallback = {}) {
    const status = cleanOptionalText(raw && raw.status, 'Answer status', 40) || fallback.status || '';
    const allowedStatuses = new Set(['present', 'missing', 'defect', 'note', 'partial', 'untouched']);
    if (status && !allowedStatuses.has(status)) {
        const error = new Error('Invalid check answer status.');
        error.status = 400;
        throw error;
    }
    return {
        lockerId: cleanOptionalText(raw && raw.lockerId, 'Locker id', 80) || fallback.lockerId || '',
        lockerName: cleanOptionalText(raw && raw.lockerName, 'Locker name', 120) || fallback.lockerName || '',
        itemId: cleanOptionalText(raw && raw.itemId, 'Item id', 80) || fallback.itemId || '',
        itemName: cleanOptionalText(raw && raw.itemName, 'Item name', 160) || fallback.itemName || '',
        itemImg: cleanOptionalText(raw && raw.itemImg, 'Item image', 500) || fallback.itemImg || '',
        parentItemId: cleanOptionalText(raw && raw.parentItemId, 'Parent item id', 80) || fallback.parentItemId || '',
        status,
        note: cleanOptionalText(raw && raw.note, 'Note', 1200, { allowNewlines: true }),
        noteImage: cleanOptionalText(raw && raw.noteImage, 'Note image', 500),
    };
}

function applyAnswersToReportLockers(appliance, answerDocs) {
    const answerByItemId = new Map(answerDocs.map((answer) => [String(answer.itemId), answer]));
    const lockers = JSON.parse(JSON.stringify(
        Array.isArray(appliance.lockers) ? appliance.lockers.map((locker) => normalizeLockerShape(locker)) : []
    ));
    lockers.forEach((locker) => {
        (locker.items || []).forEach((item) => {
            const answer = answerByItemId.get(String(item.id));
            if (answer) {
                item.status = answer.status;
                item.note = answer.note || '';
                if (answer.noteImage) item.noteImage = answer.noteImage;
            }
            (item.subItems || []).forEach((subItem) => {
                const subAnswer = answerByItemId.get(String(subItem.id));
                if (subAnswer) {
                    subItem.status = subAnswer.status;
                    subItem.note = subAnswer.note || '';
                    if (subAnswer.noteImage) subItem.noteImage = subAnswer.noteImage;
                }
            });
        });
    });
    return lockers;
}

async function loadSessionAnswers(brigadeId, sessionId) {
    const snapshot = await checkSessionRef(brigadeId, sessionId).collection('answers').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
}

async function createOrClaimCheckSession({ brigadeId, appliance, requester, force = false }) {
    const userName = displayNameFromProfile(requester.profile, requester.email || requester.uid);
    const appRef = applianceRef(brigadeId, appliance.id);
    const sessions = checkSessionsRef(brigadeId);
    return db.runTransaction(async (transaction) => {
        const appDoc = await transaction.get(appRef);
        if (!appDoc.exists) {
            const error = new Error('Appliance not found.');
            error.status = 404;
            throw error;
        }
        const freshAppliance = applianceDataFromDoc(appDoc);
        const existingLock = normalizeCheckStatus(freshAppliance.checkStatus);
        const activeLock = isCheckLockActive(existingLock) ? existingLock : null;
        if (activeLock && activeLock.uid !== requester.uid && !force) {
            return { appliance: freshAppliance, lock: activeLock, sessionId: activeLock.sessionId, alreadyActive: true };
        }
        const replacingActiveSession = !!(activeLock && force);
        const sessionRef = activeLock && activeLock.sessionId && !replacingActiveSession
            ? sessions.doc(activeLock.sessionId)
            : sessions.doc();
        const now = new Date();
        const sessionId = sessionRef.id;
        const nextLock = makeCheckLock({ uid: requester.uid, name: userName, email: requester.email }, activeLock && activeLock.uid !== requester.uid ? activeLock : null);
        nextLock.sessionId = sessionId;
        const sessionPayload = {
            brigadeId,
            applianceId: freshAppliance.id,
            applianceName: freshAppliance.name,
            applianceVersion: freshAppliance.version || 1,
            status: 'inProgress',
            startedByUid: activeLock && activeLock.uid ? activeLock.uid : requester.uid,
            startedByName: activeLock && activeLock.user ? activeLock.user : userName,
            currentEditorUid: requester.uid,
            currentEditorName: userName,
            editorLeaseExpiresAt: Timestamp.fromDate(new Date(now.getTime() + CHECK_EDITOR_LEASE_MS)),
            lastSavedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };
        if (!activeLock || replacingActiveSession) {
            sessionPayload.startedAt = FieldValue.serverTimestamp();
        }
        if (replacingActiveSession && activeLock.sessionId) {
            transaction.set(sessions.doc(activeLock.sessionId), {
                status: 'cancelled',
                cancelledAt: FieldValue.serverTimestamp(),
                replacedBySessionId: sessionId,
                currentEditorUid: FieldValue.delete(),
                currentEditorName: FieldValue.delete(),
                editorLeaseExpiresAt: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        transaction.set(sessionRef, sessionPayload, { merge: true });
        transaction.set(appRef, { checkStatus: nextLock, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { appliance: freshAppliance, lock: nextLock, sessionId, alreadyActive: false };
    });
}

function checkSessionResponse(sessionDoc, answers = []) {
    const data = sessionDoc && typeof sessionDoc.data === 'function' ? sessionDoc.data() || {} : sessionDoc || {};
    return { session: { id: sessionDoc.id || data.id, ...data }, answers };
}

function identifierPrefix(ownerType) {
    return ownerType === 'brigade' ? BRIGADE_IDENTIFIER_PREFIX : USER_IDENTIFIER_PREFIX;
}

function normalizeSixDigitIdentifier(value, ownerType) {
    const identifier = String(value || '').trim().toUpperCase();
    const prefix = identifierPrefix(ownerType);
    return new RegExp(`^${prefix}\\d{6}$`).test(identifier) ? identifier : null;
}

function generateSixDigitIdentifier(ownerType) {
    return `${identifierPrefix(ownerType)}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;
}

function isAlreadyExistsError(error) {
    const code = error && error.code;
    const message = String((error && error.message) || '');
    return code === 6 || code === 'already-exists' || message.includes('ALREADY_EXISTS');
}

async function reserveUniqueIdentifier(ownerType, ownerId) {
    const registry = db.collection('identifierRegistry');
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const identifier = generateSixDigitIdentifier(ownerType);
        try {
            await registry.doc(identifier).create({
                identifier,
                ownerType,
                ownerId,
                createdAt: FieldValue.serverTimestamp(),
            });
            return identifier;
        } catch (error) {
            if (isAlreadyExistsError(error)) continue;
            throw error;
        }
    }
    throw new Error('Could not allocate a unique identifier. Please try again.');
}

async function reserveExistingIdentifier(identifier, ownerType, ownerId) {
    try {
        await db.collection('identifierRegistry').doc(identifier).create({
            identifier,
            ownerType,
            ownerId,
            createdAt: FieldValue.serverTimestamp(),
        });
        return identifier;
    } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;
        const existing = await db.collection('identifierRegistry').doc(identifier).get();
        const data = existing.exists ? existing.data() || {} : {};
        if (data.ownerType === ownerType && data.ownerId === ownerId) {
            return identifier;
        }
        return null;
    }
}

async function ensureDocumentIdentifier(ref, data, ownerType, ownerId) {
    const existing = normalizeSixDigitIdentifier(data && data.identifier, ownerType);
    if (existing) {
        const reserved = await reserveExistingIdentifier(existing, ownerType, ownerId);
        if (reserved) return reserved;
    }

    const identifier = await reserveUniqueIdentifier(ownerType, ownerId);
    await ref.set({ identifier }, { merge: true });
    return identifier;
}

async function ensureUserIdentifier(userId) {
    if (!userId) return null;
    const ref = db.collection('users').doc(userId);
    const doc = await ref.get();
    return ensureDocumentIdentifier(ref, doc.exists ? doc.data() : {}, 'user', userId);
}

async function ensureUserProfile(user) {
    if (!user || !user.uid) return null;
    const ref = db.collection('users').doc(user.uid);
    const doc = await ref.get();
    const current = doc.exists ? doc.data() || {} : {};
    const identifier = await ensureDocumentIdentifier(ref, current, 'user', user.uid);
    const email = cleanOptionalText(user.email || current.email, 'Email', 254);
    const fullName = cleanOptionalText(
        current.fullName || current.name || user.name || user.displayName || '',
        'Full name',
        160
    );
    const patch = {
        identifier,
        email,
        updatedAt: FieldValue.serverTimestamp(),
    };
    if (fullName) patch.fullName = fullName;
    if (!doc.exists) patch.createdAt = FieldValue.serverTimestamp();
    await ref.set(patch, { merge: true });
    return { id: user.uid, ...current, fullName, email, identifier };
}

async function getUserProfile(userId, authUser = null) {
    if (!userId) return null;
    const ref = db.collection('users').doc(userId);
    const doc = await ref.get();
    if (!doc.exists && authUser) return ensureUserProfile(authUser);
    const data = doc.exists ? doc.data() || {} : {};
    const identifier = await ensureDocumentIdentifier(ref, data, 'user', userId);
    let email = cleanOptionalText(data.email, 'Email', 254);
    let fullName = cleanOptionalText(data.fullName || data.name || data.displayName, 'Full name', 160);
    if ((!email || !fullName) && !authUser) {
        try {
            const userRecord = await admin.auth().getUser(userId);
            email = email || cleanOptionalText(userRecord.email, 'Email', 254);
            fullName = fullName || cleanOptionalText(userRecord.displayName, 'Full name', 160);
        } catch (error) {
            // The Firestore profile can outlive Auth during local testing; keep best-effort data.
        }
    }
    const patch = { identifier };
    if (email && data.email !== email) patch.email = email;
    if (fullName && data.fullName !== fullName) patch.fullName = fullName;
    if (Object.keys(patch).length > 1) {
        patch.updatedAt = FieldValue.serverTimestamp();
        await ref.set(patch, { merge: true });
    }
    return { id: userId, ...data, fullName, email, identifier };
}

async function ensureBrigadeIdentifier(brigadeId, ref, data) {
    if (!brigadeId) return null;
    const brigadeRef = ref || db.collection('brigades').doc(brigadeId);
    let brigadeData = data;
    if (!brigadeData) {
        const doc = await brigadeRef.get();
        brigadeData = doc.exists ? doc.data() : {};
    }
    return ensureDocumentIdentifier(brigadeRef, brigadeData || {}, 'brigade', brigadeId);
}

async function ensureUserBrigadeMembershipIdentifier(userId, membershipDoc, userIdentifier, batch, writeState) {
    const data = membershipDoc.data() || {};
    const brigadeRef = db.collection('brigades').doc(membershipDoc.id);
    const brigadeDoc = await brigadeRef.get();
    if (!brigadeDoc.exists) return { id: membershipDoc.id, ...data };

    const brigadeData = brigadeDoc.data() || {};
    const brigadeIdentifier = await ensureBrigadeIdentifier(membershipDoc.id, brigadeRef, brigadeData);
    const updates = {};
    if (normalizeSixDigitIdentifier(data.brigadeIdentifier, 'brigade') !== brigadeIdentifier) {
        updates.brigadeIdentifier = brigadeIdentifier;
    }
    const expectedName = brigadeData.stationNumber
        ? `${brigadeData.name || data.brigadeName || 'Brigade'} (${brigadeData.stationNumber})`
        : (brigadeData.name || data.brigadeName || 'Brigade');
    if (!data.brigadeName && brigadeData.name) {
        updates.brigadeName = expectedName;
    }
    const normalizedRole = normalizeRole(data.role) || ROLES.MEMBER;
    if (data.role !== normalizedRole) {
        updates.role = normalizedRole;
    }
    const profile = await getUserProfile(userId);
    const memberName = data.memberName || displayNameFromProfile(profile, userId);
    if (!data.memberName && memberName) {
        updates.memberName = memberName;
    }
    if (Object.keys(updates).length > 0) {
        if (batch) {
            batch.set(membershipDoc.ref, updates, { merge: true });
            writeState.count += 1;
        } else {
            await membershipDoc.ref.set(updates, { merge: true });
        }
    }

    if (userIdentifier) {
        const memberRef = brigadeRef.collection('members').doc(userId);
        if (batch) {
            batch.set(memberRef, { userIdentifier }, { merge: true });
            writeState.count += 1;
        } else {
            await memberRef.set({ userIdentifier }, { merge: true });
        }
    }

    return {
        id: membershipDoc.id,
        ...data,
        ...updates,
        role: normalizedRole,
        roleLabel: roleLabel(normalizedRole),
        memberName,
        brigadeIdentifier,
    };
}

async function getUserBrigadesWithIdentifiers(userId) {
    if (!userId) return [];
    const userIdentifier = await ensureUserIdentifier(userId);
    const snapshot = await db.collection('users').doc(userId).collection('userBrigades').get();
    const batch = db.batch();
    const writeState = { count: 0 };
    const brigades = await Promise.all(snapshot.docs.map((membershipDoc) => (
        ensureUserBrigadeMembershipIdentifier(userId, membershipDoc, userIdentifier, batch, writeState)
    )));
    if (writeState.count > 0) {
        await batch.commit();
    }
    return brigades;
}

async function ensureUserBrigadesHaveIdentifiers(userId) {
    await getUserBrigadesWithIdentifiers(userId);
}

exports.createUserIdentifier = functions.region("australia-southeast1").auth.user().onCreate(async (user) => {
    if (!user || !user.uid) return null;
    try {
        await ensureUserProfile(user);
    } catch (error) {
        console.error(`Error creating identifier for user ${user.uid}:`, error);
    }
    return null;
});

exports.createBrigadeIdentifier = functions.region("australia-southeast1").firestore
    .document("brigades/{brigadeId}")
    .onCreate(async (snap, context) => {
        const brigadeId = context.params.brigadeId;
        try {
            await ensureBrigadeIdentifier(brigadeId, snap.ref, snap.data() || {});
        } catch (error) {
            console.error(`Error creating identifier for brigade ${brigadeId}:`, error);
        }
        return null;
    });

// ===================================================================
// NEW EMAIL TRIGGER FUNCTION
// ===================================================================
exports.processEmail = functions.region("australia-southeast1").firestore
    .document("mail/{documentId}")
    .onCreate(async (snap, context) => {
      const mailData = snap.data();
      const msg = {
        to: mailData.to,
        from: mailData.from || DEFAULT_FROM_EMAIL,
        subject: mailData.message.subject,
        text: mailData.message.text,
        html: mailData.message.html,
      };
      try {
        await transporter.sendMail(msg);
        console.log("Email sent successfully to:", msg.to);
        return snap.ref.set({status: "sent"}, {merge: true});
      } catch (error) {
        console.error("Error sending email:", error);
        return snap.ref.set({status: "error", error: error.toString()}, {merge: true});
      }
    });

// ===================================================================
// API EXPRESS APP
// ===================================================================
const app = express();

// --- Middleware ---
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ message: 'Unauthorized: No token provided.' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
        res.status(403).json({ message: 'Unauthorized: Invalid token.' });
    }
};

const apiRouter = express.Router();
apiRouter.use(verifyToken);

// --- Dev helpers (emulator only) ---
apiRouter.post('/dev/seed-demo', async (req, res) => {
    if (!isFunctionsEmulator) {
        return res.status(404).json({ message: 'Not found.' });
    }
    try {
        const uid = req.user.uid;
        const profile = await ensureUserProfile(req.user);
        const displayName = displayNameFromProfile(profile, req.user.email || 'Demo User');

        const brigadeId = 'demo-brigade';
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const memberRef = brigadeRef.collection('members').doc(uid);
        const userBrigadeRef = db.collection('users').doc(uid).collection('userBrigades').doc(brigadeId);
        const brigadeIdentifier = await ensureBrigadeIdentifier(brigadeId, brigadeRef);
        const userIdentifier = await ensureUserIdentifier(uid);

        const demoApplianceData = {
            appliances: [
                {
                    id: 'demo-rav281',
                    name: 'RAV281 (Demo)',
                    lockers: [
                        {
                            id: 'locker-ns-transverse',
                            name: 'NS Transverse Locker',
                            items: [
                                {
                                    id: 'item-broom',
                                    name: 'Broom',
                                    desc: 'General purpose broom.',
                                    img: '/design_assets/Gear Icon.png',
                                },
                                {
                                    id: 'item-mop',
                                    name: 'Mop',
                                    desc: 'Standard mop head.',
                                    img: '/design_assets/Gear Icon.png',
                                },
                                {
                                    id: 'item-milwaukee-box',
                                    name: 'Milwaukee Box',
                                    desc: 'Power tool kit container.',
                                    img: '/design_assets/Gear Icon.png',
                                    type: 'container',
                                    subItems: [
                                        {
                                            id: 'sub-batteries',
                                            name: 'Batteries',
                                            desc: '2x charged batteries.',
                                            img: '/design_assets/Gear Icon.png',
                                        },
                                        {
                                            id: 'sub-drill',
                                            name: 'Drill',
                                            desc: '18V drill.',
                                            img: '/design_assets/Gear Icon.png',
                                        },
                                        {
                                            id: 'sub-recsaw',
                                            name: 'Rec Saw',
                                            desc: 'Reciprocating saw.',
                                            img: '/design_assets/Gear Icon.png',
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            id: 'locker-os-1',
                            name: 'OS Locker #1',
                            items: [
                                {
                                    id: 'item-first-aid',
                                    name: 'First Aid Kit',
                                    desc: 'Primary first aid kit.',
                                    img: '/design_assets/Gear Icon.png',
                                },
                                {
                                    id: 'item-traffic-cones',
                                    name: 'Road Cones',
                                    desc: '4x road cones.',
                                    img: '/design_assets/Gear Icon.png',
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const demoAppliance = validateApplianceData(brigadeId, demoApplianceData).appliances[0];
        const demoApplianceRef = brigadeRef.collection('appliances').doc(demoAppliance.id);

        await db.runTransaction(async (tx) => {
            const brigadeDoc = await tx.get(brigadeRef);
            if (!brigadeDoc.exists) {
                tx.set(brigadeRef, {
                    name: 'Demo Brigade',
                    stationNumber: '000',
                    region: 'Te Hiku',
                    creatorId: uid,
                    identifier: brigadeIdentifier,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            } else {
                tx.set(
                    brigadeRef,
                    {
                        name: 'Demo Brigade',
                        stationNumber: '000',
                        region: 'Te Hiku',
                        identifier: brigadeIdentifier,
                        updatedAt: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );
            }
            tx.set(
                demoApplianceRef,
                {
                    name: demoAppliance.name,
                    order: 0,
                    version: 1,
                    lockers: demoAppliance.lockers,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            tx.set(
                memberRef,
                {
                    role: ROLES.ADMIN,
                    joinedAt: FieldValue.serverTimestamp(),
                    fullName: displayName,
                    name: displayName,
                    email: profile.email || req.user.email || '',
                    userIdentifier,
                },
                { merge: true }
            );

            tx.set(
                userBrigadeRef,
                {
                    brigadeName: 'Demo Brigade (000)',
                    brigadeIdentifier,
                    role: ROLES.ADMIN,
                    memberName: displayName,
                },
                { merge: true }
            );
        });

        res.status(200).json({ message: 'Seeded demo brigade.', brigadeId, applianceId: 'demo-rav281' });
    } catch (error) {
        console.error('Error seeding demo brigade:', error);
        res.status(500).json({ message: 'Failed to seed demo brigade.' });
    }
});

// --- Image Upload & Delete Routes ---
async function authorizeImageUpload(req, res, { adminOnly = false } = {}) {
    const brigadeId = String(req.get('x-brigade-id') || '').trim();
    if (!brigadeId) {
        res.status(400).json({ message: 'Missing brigade id (x-brigade-id).' });
        return null;
    }

    try {
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
            return null;
        }
        if (!canEditSetup(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: Admin or Gear Manager role required.' });
        }
        return { brigadeId, member };
    } catch (error) {
        console.error('Upload auth check failed:', error);
        res.status(500).json({ message: 'Failed to authorize upload.' });
        return null;
    }
}

function handleImageUploadRequest(req, res, brigadeId) {
    if (!req.rawBody) {
        console.error('Request did not have a rawBody.');
        return res.status(400).json({ message: 'Missing request body.' });
    }
    const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 } });
    const tmpdir = os.tmpdir();
    const uploads = {};
    const fileWrites = [];
    let fileTooLarge = false;
    let invalidFileType = false;

    busboy.on('file', (fieldname, file, info) => {
        const { filename, mimeType } = info || {};

        if (!mimeType || !String(mimeType).toLowerCase().startsWith('image/')) {
            invalidFileType = true;
            file.resume();
            return;
        }

        file.on('limit', () => {
            fileTooLarge = true;
            file.resume();
        });

        const safeFilename = path.basename(filename || `upload-${Date.now()}`);
        const filepath = path.join(tmpdir, `${Date.now()}-${safeFilename}`);
        uploads.filepath = filepath;
        const writeStream = fsSync.createWriteStream(filepath);
        file.pipe(writeStream);
        const promise = new Promise((resolve, reject) => {
            file.on('end', () => { writeStream.end(); });
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        fileWrites.push(promise);
    });
    busboy.on('finish', async () => {
        await Promise.all(fileWrites);
        if (fileTooLarge) {
            return res.status(413).json({ message: 'File too large.' });
        }
        if (invalidFileType) {
            return res.status(400).json({ message: 'Only image uploads are supported.' });
        }
        if (!uploads.filepath) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }
        try {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
            const newFilename = `image-${uniqueSuffix}.webp`;
            const processedTmpPath = path.join(tmpdir, newFilename);
            await sharp(uploads.filepath)
                .resize(800, 800, { fit: 'cover', withoutEnlargement: true })
                .toFormat('webp', { quality: 80 })
                .toFile(processedTmpPath);
            const destination = `uploads/${brigadeId}/${newFilename}`;
            await bucket.upload(processedTmpPath, {
                destination: destination,
                metadata: {
                    contentType: 'image/webp',
                    cacheControl: 'private, max-age=0, no-store',
                    metadata: {
                        brigadeId,
                        uploadedBy: req.user.uid,
                    },
                },
            });
            await fs.unlink(uploads.filepath);
            await fs.unlink(processedTmpPath);
            res.status(200).json({
                message: 'File uploaded successfully!',
                filePath: destination,
                fileName: newFilename,
                storagePath: destination,
            });
        } catch (error) {
            console.error('Upload process failed:', error);
            res.status(500).json({ message: 'Failed to process and upload image.' });
        }
    });
    busboy.end(req.rawBody);
}

apiRouter.post('/upload', async (req, res) => {
    const authz = await authorizeImageUpload(req, res, { adminOnly: true });
    if (!authz) return;
    handleImageUploadRequest(req, res, authz.brigadeId);
});

apiRouter.post('/check-note-image', async (req, res) => {
    const authz = await authorizeImageUpload(req, res, { adminOnly: false });
    if (!authz) return;
    handleImageUploadRequest(req, res, authz.brigadeId);
});

apiRouter.delete('/image/:fileName', async (req, res) => {
    try {
        const brigadeId = String(req.get('x-brigade-id') || '').trim();
        if (!brigadeId) {
            return res.status(400).json({ message: 'Missing brigade id (x-brigade-id).' });
        }

        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        if (!canEditSetup(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: Admin or Gear Manager role required.' });
        }

        const { fileName } = req.params;
        if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
            return res.status(400).json({ message: 'Invalid filename.' });
        }
        const file = bucket.file(`uploads/${brigadeId}/${fileName}`);
        await file.delete();
        res.status(200).json({ message: 'Image deleted successfully.' });
    } catch (err) {
        if (err.code === 404) {
            return res.status(200).json({ message: 'Image already deleted or not found.' });
        }
        console.error('Error deleting image from storage:', err);
        res.status(500).json({ message: 'Error deleting image.' });
    }
});

apiRouter.use(express.json({ limit: '2mb' }));
apiRouter.use((err, req, res, next) => {
    // Handle body-parser / express.json size and parse errors explicitly so clients get a useful status.
    if (err) {
        const status = Number(err.status || err.statusCode || 0);
        const type = String(err.type || '');
        if (status === 413 || type === 'entity.too.large') {
            return res.status(413).json({ message: 'Request payload too large.' });
        }
        if (status === 400) {
            return res.status(400).json({ message: 'Invalid JSON payload.' });
        }
    }
    return next(err);
});

// --- User Data Routes ---
const userRouter = express.Router();
userRouter.get('/:userId/brigades', async (req, res) => {
    try {
        if (req.params.userId !== req.user.uid) {
            return res.status(403).json({ message: 'Forbidden: You can only load your own brigades.' });
        }
        const brigades = await getUserBrigadesWithIdentifiers(req.user.uid);
        return res.json(brigades);
    } catch (err) {
        console.error(`Error loading user brigades for ${req.user.uid}:`, err);
        return res.status(500).json({ message: 'Error loading brigades.' });
    }
});

userRouter.get('/:userId', async (req, res) => {
    try {
        if (req.params.userId !== req.user.uid) {
            return res.status(403).json({ message: 'Forbidden: You can only load your own profile.' });
        }
        const profile = await ensureUserProfile(req.user);
        await ensureUserBrigadesHaveIdentifiers(req.user.uid);
        return res.json({
            ...profile,
            fullName: profile.fullName || '',
            email: profile.email || req.user.email || '',
            serverTime: new Date().toISOString(),
        });
    } catch (err) {
        console.error('Error in get-data route:', err);
        res.status(500).json({ message: 'Error loading data.' });
    }
});
userRouter.post('/:userId', async (req, res) => {
    try {
        if (req.params.userId !== req.user.uid) {
            return res.status(403).json({ message: 'Forbidden: You can only save your own profile.' });
        }
        const userDocRef = db.collection('users').doc(req.user.uid);
        const doc = await userDocRef.get();
        const identifier = await ensureDocumentIdentifier(
            userDocRef,
            doc.exists ? doc.data() : {},
            'user',
            req.user.uid
        );
        const body = isPlainObject(req.body) ? req.body : {};
        const patch = { identifier, updatedAt: FieldValue.serverTimestamp() };
        const fullName = cleanOptionalText(body.fullName || body.name, 'Full name', 160);
        if (fullName) patch.fullName = fullName;
        const email = cleanOptionalText(body.email || req.user.email, 'Email', 254);
        if (email) patch.email = email;
        if (isPlainObject(body.termsAcceptance)) {
            const version = cleanOptionalText(body.termsAcceptance.version, 'Terms version', 40);
            if (version) {
                patch.termsAcceptance = {
                    version,
                    acceptedAt: cleanOptionalText(body.termsAcceptance.acceptedAt, 'Terms accepted time', 80) || new Date().toISOString(),
                    blurb: cleanOptionalText(body.termsAcceptance.blurb, 'Terms acknowledgement', 1000),
                };
            }
        }
        if (Object.keys(patch).length <= 2) {
            return res.status(400).json({ message: 'No supported profile fields were provided.' });
        }
        await userDocRef.set(patch, { merge: true });
        res.json({ message: 'Data saved successfully!' });
    } catch (err) {
        console.error('Error writing data to Firestore:', err);
        res.status(500).json({ message: 'Error saving data.' });
    }
});
apiRouter.use('/data', userRouter);

const usersRouter = express.Router();
usersRouter.post('/me/terms', async (req, res) => {
    try {
        const body = isPlainObject(req.body) ? req.body : {};
        const version = cleanRequiredText(body.version, 'Terms version', 40);
        const blurb = cleanOptionalText(body.blurb, 'Terms acknowledgement', 1000);
        const userDocRef = db.collection('users').doc(req.user.uid);
        const doc = await userDocRef.get();
        const identifier = await ensureDocumentIdentifier(
            userDocRef,
            doc.exists ? doc.data() : {},
            'user',
            req.user.uid
        );
        await userDocRef.set(
            {
                identifier,
                termsAcceptance: {
                    version,
                    acceptedAt: new Date().toISOString(),
                    blurb,
                },
            },
            { merge: true }
        );
        res.status(200).json({ message: 'Terms accepted.' });
    } catch (err) {
        console.error('Error saving terms acceptance:', err);
        const status = err.status || 500;
        res.status(status).json({ message: status === 500 ? 'Error saving terms acceptance.' : err.message });
    }
});
apiRouter.use('/users', usersRouter);

// --- Brigade Routes ---
const brigadeRouter = express.Router();
brigadeRouter.get('/region/:regionName', async (req, res) => {
    try {
        const { regionName } = req.params;
        const brigadesRef = db.collection('brigades');
        const snapshot = await brigadesRef.where('region', '==', regionName).get();
        if (snapshot.empty) return res.json([]);
        // Only return safe public fields so non-members can't see brigade inventory data.
        const brigades = await Promise.all(snapshot.docs.map(async (doc) => {
            const data = doc.data() || {};
            const identifier = await ensureBrigadeIdentifier(doc.id, doc.ref, data);
            return {
                id: doc.id,
                name: data.name,
                stationNumber: data.stationNumber,
                region: data.region,
                identifier,
            };
        }));
        res.json(brigades);
    } catch (error) {
        console.error(`Error fetching brigades for region ${req.params.regionName}:`, error);
        res.status(500).json({ message: 'Failed to fetch brigades.' });
    }
});
brigadeRouter.get('/:brigadeId/images/:fileName', async (req, res) => {
    try {
        const { brigadeId, fileName } = req.params;
        if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || !/^image-[A-Za-z0-9._-]+\.webp$/.test(fileName)) {
            return res.status(400).json({ message: 'Invalid filename.' });
        }
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        const storagePath = `${IMAGE_UPLOAD_PREFIX}/${brigadeId}/${fileName}`;
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (!exists) {
            return res.status(404).json({ message: 'Image not found.' });
        }

        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'private, max-age=300');
        const stream = file.createReadStream();
        stream.on('error', (error) => {
            console.error(`Error streaming image ${storagePath}:`, error);
            if (!res.headersSent) res.status(500).json({ message: 'Failed to load image.' });
            else res.destroy(error);
        });
        stream.pipe(res);
    } catch (error) {
        console.error(`Error loading image for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to load image.' });
    }
});
brigadeRouter.get('/:brigadeId/join-requests', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const adminId = req.user.uid;
        const adminMemberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(adminId);
        const adminDoc = await adminMemberRef.get();
        if (!adminDoc.exists || !canManageMembers(adminDoc.data().role)) {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to view join requests.' });
        }
        const requestsSnapshot = await db.collection('brigades').doc(brigadeId).collection('joinRequests').where('status', '==', 'pending').get();
        const requests = await Promise.all(requestsSnapshot.docs.map(async (doc) => {
            const data = doc.data() || {};
            const userIdentifier = normalizeSixDigitIdentifier(data.userIdentifier, 'user') || await ensureUserIdentifier(doc.id);
            if (!normalizeSixDigitIdentifier(data.userIdentifier, 'user') && userIdentifier) {
                await doc.ref.set({ userIdentifier }, { merge: true });
            }
            return { id: doc.id, ...data, userName: data.userName || data.fullName || doc.id, userIdentifier };
        }));
        res.json(requests);
    } catch (error) {
        console.error(`Error fetching join requests for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to fetch join requests.' });
    }
});
brigadeRouter.post('/:brigadeId/join-requests', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const { uid: userId } = req.user;
        const profile = await ensureUserProfile(req.user);
        const userName = displayNameFromProfile(profile, req.user.email || userId);
        const email = profile.email || req.user.email || '';

        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }

        const existingMember = await getBrigadeMember(brigadeId, userId);
        if (existingMember) {
            return res.status(400).json({ message: 'You are already a member of this brigade.' });
        }

        const joinRequestRef = db.collection('brigades').doc(brigadeId).collection('joinRequests').doc(userId);
        const doc = await joinRequestRef.get();
        if (doc.exists) {
            return res.status(400).json({ message: 'You have already sent a join request to this brigade.' });
        }
        const userIdentifier = await ensureUserIdentifier(userId);
        await joinRequestRef.set({
            status: 'pending',
            requestedAt: FieldValue.serverTimestamp(),
            userName: userName || email,
            fullName: userName || '',
            email,
            userIdentifier,
        });
        res.status(201).json({ message: 'Your request to join has been sent.' });
    } catch (error) {
        console.error(`Error creating join request for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to send join request.' });
    }
});
brigadeRouter.post('/:brigadeId/join-requests/:userId', async (req, res) => {
    try {
        const { brigadeId, userId } = req.params;
        const { action } = req.body;
        const adminId = req.user.uid;
        const adminMemberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(adminId);
        const adminDoc = await adminMemberRef.get();
        if (!adminDoc.exists || !canManageMembers(adminDoc.data().role)) {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to handle join requests.' });
        }
        const requestRef = db.collection('brigades').doc(brigadeId).collection('joinRequests').doc(userId);
        if (action === 'accept') {
            const requestDoc = await requestRef.get();
            if (!requestDoc.exists) {
                return res.status(404).json({ message: 'Join request not found.' });
            }
            const requestData = requestDoc.data() || {};
            const userProfile = await getUserProfile(userId);
            const userName = requestData.fullName || requestData.userName || displayNameFromProfile(userProfile, userId);
            const brigadeRef = db.collection('brigades').doc(brigadeId);
            const newMemberRef = brigadeRef.collection('members').doc(userId);
            const userBrigadeRef = db.collection('users').doc(userId).collection('userBrigades').doc(brigadeId);
            const brigadeDoc = await brigadeRef.get();
            const brigadeData = brigadeDoc.data();
            const brigadeIdentifier = await ensureBrigadeIdentifier(brigadeId, brigadeRef, brigadeData);
            const userIdentifier = normalizeSixDigitIdentifier(requestData.userIdentifier, 'user') || await ensureUserIdentifier(userId);
            await db.runTransaction(async (transaction) => {
                transaction.set(newMemberRef, {
                    role: ROLES.MEMBER,
                    joinedAt: FieldValue.serverTimestamp(),
                    fullName: userName,
                    name: userName,
                    email: requestData.email || (userProfile && userProfile.email) || '',
                    userIdentifier,
                });
                transaction.set(userBrigadeRef, {
                    brigadeName: `${brigadeData.name} (${brigadeData.stationNumber})`,
                    brigadeIdentifier,
                    role: ROLES.MEMBER,
                    memberName: userName,
                });
                transaction.delete(requestRef);
            });
            res.status(200).json({ message: `User ${userName} has been added to the brigade.` });
        } else if (action === 'deny') {
            await requestRef.delete();
            res.status(200).json({ message: 'Join request has been denied.' });
        } else {
            res.status(400).json({ message: 'Invalid action.' });
        }
    } catch (error) {
        console.error(`Error handling join request for user ${req.params.userId}:`, error);
        res.status(500).json({ message: 'Failed to handle join request.' });
    }
});
brigadeRouter.post('/:brigadeId/members', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const { email: newMemberEmail } = req.body;
        const adminId = req.user.uid;
        if (!newMemberEmail) {
            return res.status(400).json({ message: 'Email is required.' });
        }
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const adminMemberRef = brigadeRef.collection('members').doc(adminId);
        const adminMemberDoc = await adminMemberRef.get();
        if (!adminMemberDoc.exists || !canManageMembers(adminMemberDoc.data().role)) {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to add members.' });
        }
        const newMemberUserRecord = await admin.auth().getUserByEmail(newMemberEmail);
        const newMemberId = newMemberUserRecord.uid;
        const newMemberProfile = await getUserProfile(newMemberId);
        const newMemberName = displayNameFromProfile(newMemberProfile, newMemberUserRecord.displayName || newMemberEmail);
        const newMemberRef = brigadeRef.collection('members').doc(newMemberId);
        const userRef = db.collection('users').doc(newMemberId);
        const userBrigadeRef = userRef.collection('userBrigades').doc(brigadeId);
        const brigadeDoc = await brigadeRef.get();
        const brigadeData = brigadeDoc.data();
        const brigadeIdentifier = await ensureBrigadeIdentifier(brigadeId, brigadeRef, brigadeData);
        const userIdentifier = await ensureUserIdentifier(newMemberId);
        await db.runTransaction(async (transaction) => {
            transaction.set(newMemberRef, {
                role: ROLES.MEMBER,
                joinedAt: FieldValue.serverTimestamp(),
                fullName: newMemberName,
                name: newMemberName,
                email: newMemberProfile?.email || newMemberEmail,
                userIdentifier,
            });
            transaction.set(userBrigadeRef, {
                brigadeName: `${brigadeData.name} (${brigadeData.stationNumber})`,
                brigadeIdentifier,
                role: ROLES.MEMBER,
                memberName: newMemberName,
            });
        });
        res.status(201).json({ message: `User ${newMemberName} added to brigade successfully.` });
    } catch (error) {
        console.error(`Error adding member to brigade ${req.params.brigadeId}:`, error);
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ message: 'User with that email address does not exist.' });
        }
        res.status(500).json({ message: 'Failed to add member.' });
    }
});
brigadeRouter.put('/:brigadeId/members/:memberId', async (req, res) => {
    try {
        const { brigadeId, memberId } = req.params;
        const { role } = req.body;
        const adminId = req.user.uid;
        if (!role) {
            return res.status(400).json({ message: 'Role is required.' });
        }
        const normalizedRole = normalizeRole(role);
        if (!normalizedRole) {
            return res.status(400).json({ message: 'Invalid role. Allowed roles: Admin, Gear Manager, Member, Viewer.' });
        }
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const adminMemberRef = brigadeRef.collection('members').doc(adminId);
        const targetMemberRef = brigadeRef.collection('members').doc(memberId);
        const targetUserBrigadeRef = db.collection('users').doc(memberId).collection('userBrigades').doc(brigadeId);
        const adminMemberDoc = await adminMemberRef.get();
        if (!adminMemberDoc.exists || !canManageMembers(adminMemberDoc.data().role)) {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to update roles.' });
        }

        const targetMemberDoc = await targetMemberRef.get();
        if (!targetMemberDoc.exists) {
            return res.status(404).json({ message: 'Member not found.' });
        }

        // Safety: prevent demoting the last remaining admin (including yourself).
        const targetIsAdmin = isAdminRole(targetMemberDoc.data().role);
        const wouldRemoveAdmin = targetIsAdmin && normalizedRole !== ROLES.ADMIN;
        if (wouldRemoveAdmin) {
            const membersSnapshot = await brigadeRef.collection('members').get();
            const adminCount = membersSnapshot.docs.filter((doc) => isAdminRole((doc.data() || {}).role)).length;
            if (adminCount <= 1) {
                return res.status(400).json({
                    message: 'You cannot demote the last admin. Promote another member to Admin first.',
                });
            }
        }

        await db.runTransaction(async (transaction) => {
            transaction.update(targetMemberRef, { role: normalizedRole });
            transaction.update(targetUserBrigadeRef, { role: normalizedRole });
        });
        res.status(200).json({ message: 'Role updated successfully.' });
    } catch (error) {
        console.error(`Error updating role for member ${req.params.memberId}:`, error);
        res.status(500).json({ message: 'Failed to update role.' });
    }
});
brigadeRouter.delete('/:brigadeId/members/:memberId', async (req, res) => {
    try {
        const { brigadeId, memberId } = req.params;
        const adminId = req.user.uid;
        if (adminId === memberId) {
            return res.status(400).json({ message: 'An admin cannot remove themselves.' });
        }
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const adminMemberRef = brigadeRef.collection('members').doc(adminId);
        const targetMemberRef = brigadeRef.collection('members').doc(memberId);
        const targetUserBrigadeRef = db.collection('users').doc(memberId).collection('userBrigades').doc(brigadeId);
        const adminMemberDoc = await adminMemberRef.get();
        if (!adminMemberDoc.exists || !canManageMembers(adminMemberDoc.data().role)) {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to remove members.' });
        }

        const targetMemberDoc = await targetMemberRef.get();
        if (!targetMemberDoc.exists) {
            return res.status(404).json({ message: 'Member not found.' });
        }

        // Safety: prevent removing the last remaining admin.
        const targetIsAdmin = isAdminRole(targetMemberDoc.data().role);
        if (targetIsAdmin) {
            const membersSnapshot = await brigadeRef.collection('members').get();
            const adminCount = membersSnapshot.docs.filter((doc) => isAdminRole((doc.data() || {}).role)).length;
            if (adminCount <= 1) {
                return res.status(400).json({
                    message: 'You cannot remove the last admin. Promote another member to Admin first.',
                });
            }
        }

        await db.runTransaction(async (transaction) => {
            transaction.delete(targetMemberRef);
            transaction.delete(targetUserBrigadeRef);
        });
        res.status(200).json({ message: 'Member removed successfully.' });
    } catch (error) {
        console.error(`Error removing member ${req.params.memberId}:`, error);
        res.status(500).json({ message: 'Failed to remove member.' });
    }
});
brigadeRouter.post('/:brigadeId/leave', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const userId = req.user.uid;
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const memberRef = brigadeRef.collection('members').doc(userId);
        const userBrigadeRef = db.collection('users').doc(userId).collection('userBrigades').doc(brigadeId);
        const memberDoc = await memberRef.get();
        if (memberDoc.exists && isAdminRole(memberDoc.data().role)) {
            const membersSnapshot = await brigadeRef.collection('members').get();
            const adminCount = membersSnapshot.docs.filter((doc) => isAdminRole((doc.data() || {}).role)).length;
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'You cannot leave as you are the last admin. Please promote another member to Admin first.' });
            }
        }
        await db.runTransaction(async (transaction) => {
            transaction.delete(memberRef);
            transaction.delete(userBrigadeRef);
        });
        res.status(200).json({ message: 'You have successfully left the brigade.' });
    } catch (error) {
        console.error(`Error leaving brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to leave brigade.' });
    }
});
brigadeRouter.get('/:brigadeId/data', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const userId = req.user.uid;
        const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);
        const memberDoc = await memberRef.get();
        if (!memberDoc.exists) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const brigadeDoc = await brigadeRef.get();
        if (!brigadeDoc.exists) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }
        const applianceData = await loadApplianceDataForBrigade({ ref: brigadeRef, data: brigadeDoc.data() || {} });
        res.status(200).json(applianceData);
    } catch (error) {
        console.error(`Error fetching appliance data for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to fetch appliance data.' });
    }
});
brigadeRouter.get('/:brigadeId/reports/:reportId', async (req, res) => {
    try {
        const { brigadeId, reportId } = req.params;
        const userId = req.user.uid;
        const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);
        const memberDoc = await memberRef.get();
        if (!memberDoc.exists) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        const reportRef = db.collection('brigades').doc(brigadeId).collection('reports').doc(reportId);
        const reportDoc = await reportRef.get();
        if (!reportDoc.exists) {
            return res.status(404).json({ message: 'Report not found.' });
        }
        let signature = null;
        try {
            const signoffDoc = await reportRef.collection('meta').doc('signoff').get();
            if (signoffDoc.exists) {
                const signoffData = signoffDoc.data() || {};
                if (signoffData && signoffData.signature) signature = signoffData.signature;
            }
        } catch (e) {
            // If the signature doc is missing or unreadable, still return the report.
        }
        const reportData = reportDoc.data() || {};
        res.status(200).json({
            id: reportDoc.id,
            ...reportData,
            lockers: Array.isArray(reportData.lockers)
                ? reportData.lockers.map((locker) => normalizeLockerShape(locker, { includeShelves: true }))
                : [],
            signature,
        });
    } catch (error) {
        console.error(`Error fetching report ${req.params.reportId}:`, error);
        res.status(500).json({ message: 'Failed to fetch report.' });
    }
});
brigadeRouter.post('/:brigadeId/data', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const userId = req.user.uid;
        const incomingData = req.body;
        const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);
        const memberDoc = await memberRef.get();
        if (!memberDoc.exists) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        if (!canEditSetup(memberDoc.data().role)) {
            return res.status(403).json({ message: 'Forbidden: Admin or Gear Manager role required to edit appliance setup.' });
        }

        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }

        await saveApplianceDataForBrigade(brigade, brigadeId, incomingData);
        res.status(200).json({ message: 'Appliance data saved successfully!' });
    } catch (error) {
        console.error(`Error saving appliance data for brigade ${req.params.brigadeId}:`, error);
        const status = error.status || 500;
        res.status(status).json({ message: status === 500 ? 'Failed to save appliance data.' : error.message });
    }
});
brigadeRouter.post('/', async (req, res) => {
    try {
        const { name, stationNumber, region } = req.body;
        const creatorId = req.user.uid;
        const profile = await ensureUserProfile(req.user);
        const creatorName = displayNameFromProfile(profile, req.user.email || creatorId);
        if (!name || !stationNumber || !region) {
            return res.status(400).json({ message: 'Missing required fields: name, stationNumber, and region are required.' });
        }
        const newBrigadeRef = db.collection('brigades').doc();
        const brigadeId = newBrigadeRef.id;
        const brigadeIdentifier = await reserveUniqueIdentifier('brigade', brigadeId);
        const userIdentifier = await ensureUserIdentifier(creatorId);
        const newBrigadeData = {
            name: name,
            stationNumber: stationNumber,
            region: region,
            creatorId: creatorId,
            identifier: brigadeIdentifier,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };
        const adminMemberRef = newBrigadeRef.collection('members').doc(creatorId);
        const userBrigadeRef = db.collection('users').doc(creatorId).collection('userBrigades').doc(brigadeId);
        await db.runTransaction(async (transaction) => {
            transaction.set(newBrigadeRef, newBrigadeData);
            transaction.set(adminMemberRef, {
                role: ROLES.ADMIN,
                joinedAt: FieldValue.serverTimestamp(),
                fullName: creatorName,
                name: creatorName,
                email: profile.email || req.user.email || '',
                userIdentifier,
            });
            transaction.set(userBrigadeRef, {
                brigadeName: `${name} (${stationNumber})`,
                brigadeIdentifier,
                role: ROLES.ADMIN,
                memberName: creatorName,
            });
        });
        res.status(201).json({ message: 'Brigade created successfully!', brigadeId: brigadeId, identifier: brigadeIdentifier });
    } catch (error) {
        console.error('Error creating brigade:', error);
        res.status(500).json({ message: 'Failed to create brigade.' });
    }
});
brigadeRouter.get('/:brigadeId/appliances/:applianceId/check-status', async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }

        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }
        const appliance = await getApplianceForBrigade(brigadeId, applianceId, brigade);
        if (!appliance) {
            return res.status(404).json({ message: 'Appliance not found.' });
        }
        const lock = normalizeCheckStatus(appliance.data && appliance.data.checkStatus);
        const response = checkLockResponse(lock, req.user.uid);
        if (lock && lock.sessionId) response.sessionId = lock.sessionId;
        res.json(response);
    } catch (error) {
        console.error('Error getting check status:', error);
        res.status(500).json({ message: 'Failed to get check status.' });
    }
});
brigadeRouter.post('/:brigadeId/appliances/:applianceId/start-check', async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        if (!canRunChecks(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: Viewer role cannot start checks.' });
        }
        const force = !!(req.body && req.body.force);
        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }
        const appliance = await getApplianceForBrigade(brigadeId, applianceId, brigade);
        if (!appliance) {
            return res.status(404).json({ message: 'Appliance not found.' });
        }
        const profile = await ensureUserProfile(req.user);
        const result = await createOrClaimCheckSession({
            brigadeId,
            appliance: appliance.data,
            requester: {
                uid: req.user.uid,
                email: profile.email || req.user.email || '',
                profile,
            },
            force,
        });
        if (result.alreadyActive && result.lock && result.lock.uid !== req.user.uid) {
            return res.status(409).json({
                message: 'A check is already in progress for this appliance.',
                code: 'CHECK_LOCKED',
                lock: checkLockResponse(result.lock, req.user.uid),
                sessionId: result.sessionId,
            });
        }
        res.status(200).json({
            message: 'Check started successfully.',
            alreadyOwned: !!(result.lock && result.lock.uid === req.user.uid),
            forced: !!force,
            sessionId: result.sessionId,
            lock: checkLockResponse(result.lock, req.user.uid),
        });
    } catch (error) {
        console.error('Error starting check:', error);
        const status = error.status || 500;
        res.status(status).json({
            message: status === 500 ? 'Failed to start check.' : error.message,
            code: error.code,
            lock: error.lock ? checkLockResponse(error.lock, req.user.uid) : undefined,
        });
    }
});
brigadeRouter.post('/:brigadeId/appliances/:applianceId/complete-check', async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        if (!canRunChecks(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: Viewer role cannot complete checks.' });
        }

        const force = !!(req.body && req.body.force);
        const requesterCanForce = isAdminRole(member.data.role) || normalizeRole(member.data.role) === ROLES.GEAR_MANAGER;
        const appRef = applianceRef(brigadeId, applianceId);
        const result = await db.runTransaction(async (transaction) => {
            const appDoc = await transaction.get(appRef);
            if (!appDoc.exists) {
                const error = new Error('Appliance not found.');
                error.status = 404;
                throw error;
            }
            const appliance = applianceDataFromDoc(appDoc);
            const existingLock = normalizeCheckStatus(appliance.checkStatus);
            const activeLock = isCheckLockActive(existingLock) ? existingLock : null;
            if (!activeLock) {
                if (appliance.checkStatus) {
                    transaction.set(appRef, { checkStatus: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
                }
                return { cleared: false, idempotent: true };
            }
            if (activeLock.uid !== req.user.uid) {
                if (!requesterCanForce) {
                    const error = new Error("You cannot complete another member's active check.");
                    error.status = 403;
                    error.code = 'CHECK_LOCKED';
                    error.lock = activeLock;
                    throw error;
                }
                if (!force) {
                    const error = new Error("Admin force is required to complete another member's active check.");
                    error.status = 409;
                    error.code = 'CHECK_LOCKED';
                    error.lock = activeLock;
                    throw error;
                }
            }
            transaction.set(appRef, { checkStatus: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            if (activeLock.sessionId) {
                transaction.set(checkSessionRef(brigadeId, activeLock.sessionId), {
                    status: 'paused',
                    currentEditorUid: FieldValue.delete(),
                    currentEditorName: FieldValue.delete(),
                    editorLeaseExpiresAt: FieldValue.delete(),
                    updatedAt: FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            return { cleared: true, forced: activeLock.uid !== req.user.uid };
        });
        res.status(200).json({ message: 'Check completed successfully.', ...result });
    } catch (error) {
        console.error('Error completing check:', error);
        const status = error.status || 500;
        res.status(status).json({
            message: status === 500 ? 'Failed to complete check.' : error.message,
            code: error.code,
            lock: error.lock ? checkLockResponse(error.lock, req.user.uid) : undefined,
        });
    }
});

brigadeRouter.get('/:brigadeId/appliances/:applianceId/check-sessions/active', async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member || !canViewReports(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        const appliance = await getApplianceForBrigade(brigadeId, applianceId);
        if (!appliance) return res.status(404).json({ message: 'Appliance not found.' });
        const lock = normalizeCheckStatus(appliance.data.checkStatus);
        if (!lock || !lock.sessionId) return res.json({ session: null, answers: [] });
        const sessionDoc = await checkSessionRef(brigadeId, lock.sessionId).get();
        if (!sessionDoc.exists) return res.json({ session: null, answers: [] });
        const answers = await loadSessionAnswers(brigadeId, lock.sessionId);
        res.json(checkSessionResponse(sessionDoc, answers));
    } catch (error) {
        console.error('Error loading active check session:', error);
        res.status(500).json({ message: 'Failed to load active check session.' });
    }
});

brigadeRouter.post('/:brigadeId/appliances/:applianceId/check-sessions', async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        if (!canRunChecks(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: Viewer role cannot start checks.' });
        }
        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) return res.status(404).json({ message: 'Brigade not found.' });
        const appliance = await getApplianceForBrigade(brigadeId, applianceId, brigade);
        if (!appliance) return res.status(404).json({ message: 'Appliance not found.' });
        const profile = await ensureUserProfile(req.user);
        const result = await createOrClaimCheckSession({
            brigadeId,
            appliance: appliance.data,
            requester: {
                uid: req.user.uid,
                email: profile.email || req.user.email || '',
                profile,
            },
            force: !!(req.body && req.body.force),
        });
        if (result.alreadyActive && result.lock && result.lock.uid !== req.user.uid) {
            return res.status(409).json({
                message: 'A check is already in progress for this appliance.',
                code: 'CHECK_LOCKED',
                sessionId: result.sessionId,
                lock: checkLockResponse(result.lock, req.user.uid),
            });
        }
        const sessionDoc = await checkSessionRef(brigadeId, result.sessionId).get();
        const answers = await loadSessionAnswers(brigadeId, result.sessionId);
        res.status(200).json({ ...checkSessionResponse(sessionDoc, answers), sessionId: result.sessionId });
    } catch (error) {
        console.error('Error creating check session:', error);
        const status = error.status || 500;
        res.status(status).json({ message: status === 500 ? 'Failed to create check session.' : error.message });
    }
});

brigadeRouter.get('/:brigadeId/check-sessions/:sessionId', async (req, res) => {
    try {
        const { brigadeId, sessionId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member || !canViewReports(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        const sessionDoc = await checkSessionRef(brigadeId, sessionId).get();
        if (!sessionDoc.exists) return res.status(404).json({ message: 'Check session not found.' });
        const answers = await loadSessionAnswers(brigadeId, sessionId);
        res.json(checkSessionResponse(sessionDoc, answers));
    } catch (error) {
        console.error('Error loading check session:', error);
        res.status(500).json({ message: 'Failed to load check session.' });
    }
});

brigadeRouter.post('/:brigadeId/check-sessions/:sessionId/claim', async (req, res) => {
    try {
        const { brigadeId, sessionId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member || !canRunChecks(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: You cannot resume checks.' });
        }
        const profile = await ensureUserProfile(req.user);
        const editorName = displayNameFromProfile(profile, req.user.email || req.user.uid);
        const ref = checkSessionRef(brigadeId, sessionId);
        await ref.set({
            status: 'inProgress',
            currentEditorUid: req.user.uid,
            currentEditorName: editorName,
            editorLeaseExpiresAt: Timestamp.fromDate(new Date(Date.now() + CHECK_EDITOR_LEASE_MS)),
            lastSavedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        const sessionDoc = await ref.get();
        const answers = await loadSessionAnswers(brigadeId, sessionId);
        res.json(checkSessionResponse(sessionDoc, answers));
    } catch (error) {
        console.error('Error claiming check session:', error);
        res.status(500).json({ message: 'Failed to resume check session.' });
    }
});

brigadeRouter.post('/:brigadeId/check-sessions/:sessionId/pause', async (req, res) => {
    try {
        const { brigadeId, sessionId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member || !canRunChecks(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: You cannot pause checks.' });
        }
        await checkSessionRef(brigadeId, sessionId).set({
            status: 'paused',
            currentEditorUid: FieldValue.delete(),
            currentEditorName: FieldValue.delete(),
            editorLeaseExpiresAt: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        res.json({ message: 'Check paused.' });
    } catch (error) {
        console.error('Error pausing check session:', error);
        res.status(500).json({ message: 'Failed to pause check session.' });
    }
});

brigadeRouter.post('/:brigadeId/check-sessions/:sessionId/answers/:itemId', async (req, res) => {
    try {
        const { brigadeId, sessionId, itemId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member || !canRunChecks(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: You cannot edit checks.' });
        }
        const profile = await ensureUserProfile(req.user);
        const updatedByName = displayNameFromProfile(profile, req.user.email || req.user.uid);
        const answer = normalizeAnswer(req.body || {}, { itemId });
        answer.itemId = itemId;
        await checkSessionRef(brigadeId, sessionId).collection('answers').doc(itemId).set({
            ...answer,
            updatedByUid: req.user.uid,
            updatedByName,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await checkSessionRef(brigadeId, sessionId).set({
            status: 'inProgress',
            currentEditorUid: req.user.uid,
            currentEditorName: updatedByName,
            editorLeaseExpiresAt: Timestamp.fromDate(new Date(Date.now() + CHECK_EDITOR_LEASE_MS)),
            lastSavedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        res.json({ message: 'Answer saved.' });
    } catch (error) {
        console.error('Error saving check answer:', error);
        const status = error.status || 500;
        res.status(status).json({ message: status === 500 ? 'Failed to save check answer.' : error.message });
    }
});

brigadeRouter.post('/:brigadeId/check-sessions/:sessionId/cancel', async (req, res) => {
    try {
        const { brigadeId, sessionId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member || !canRunChecks(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: You cannot cancel checks.' });
        }
        const ref = checkSessionRef(brigadeId, sessionId);
        const sessionDoc = await ref.get();
        if (!sessionDoc.exists) return res.status(404).json({ message: 'Check session not found.' });
        const session = sessionDoc.data() || {};
        const appRef = applianceRef(brigadeId, session.applianceId);
        await db.runTransaction(async (transaction) => {
            transaction.set(ref, {
                status: 'cancelled',
                cancelledAt: FieldValue.serverTimestamp(),
                currentEditorUid: FieldValue.delete(),
                currentEditorName: FieldValue.delete(),
                editorLeaseExpiresAt: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            transaction.set(appRef, { checkStatus: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
        res.json({ message: 'Check cancelled.' });
    } catch (error) {
        console.error('Error cancelling check session:', error);
        res.status(500).json({ message: 'Failed to cancel check session.' });
    }
});

brigadeRouter.post('/:brigadeId/check-sessions/:sessionId/complete', async (req, res) => {
    try {
        const { brigadeId, sessionId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member || !canRunChecks(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: You cannot complete checks.' });
        }
        const sessionRef = checkSessionRef(brigadeId, sessionId);
        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) return res.status(404).json({ message: 'Check session not found.' });
        const session = sessionDoc.data() || {};
        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) return res.status(404).json({ message: 'Brigade not found.' });
        const appliance = await getApplianceForBrigade(brigadeId, session.applianceId, brigade);
        if (!appliance) return res.status(404).json({ message: 'Appliance not found.' });
        const profile = await ensureUserProfile(req.user);
        const completedBy = displayNameFromProfile(profile, req.user.email || req.user.uid);
        const signedName = normalizeSignedName(req.body && req.body.signedName);
        const signature = sanitizeSignatureData(req.body && req.body.signature);
        const answers = await loadSessionAnswers(brigadeId, sessionId);
        const lockers = applyAnswersToReportLockers(appliance.data, answers);
        const checkedAt = new Date().toISOString();
        const safeReportData = {
            brigadeId,
            applianceId: appliance.data.id,
            applianceName: appliance.data.name,
            applianceVersion: appliance.data.version || session.applianceVersion || 1,
            date: checkedAt,
            checkedAt,
            createdAt: FieldValue.serverTimestamp(),
            uid: req.user.uid,
            username: completedBy,
            createdByUid: req.user.uid,
            createdByName: completedBy,
            signedName,
            hasSignature: !!signature,
            resumedFromSessionId: sessionId,
            contributors: Array.from(new Set([
                session.startedByName,
                session.currentEditorName,
                completedBy,
                ...answers.map((answer) => answer.updatedByName),
            ].filter(Boolean))),
            lockers,
        };
        const reportRef = brigade.ref.collection('reports').doc();
        await reportRef.set(safeReportData);
        if (signature) {
            await reportRef.collection('meta').doc('signoff').set({
                signature,
                signedName,
                username: completedBy,
                uid: req.user.uid,
                createdAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        await db.runTransaction(async (transaction) => {
            transaction.set(sessionRef, {
                status: 'completed',
                reportId: reportRef.id,
                completedAt: FieldValue.serverTimestamp(),
                currentEditorUid: FieldValue.delete(),
                currentEditorName: FieldValue.delete(),
                editorLeaseExpiresAt: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            transaction.set(appliance.ref, { checkStatus: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
        try {
            const membersSnapshot = await db.collection('brigades').doc(brigadeId).collection('members').get();
            const recipients = [];
            for (const memberDoc of membersSnapshot.docs) {
                const memberProfile = await getUserProfile(memberDoc.id);
                if (memberProfile && memberProfile.email) recipients.push(memberProfile.email);
            }
            if (recipients.length > 0) {
                const emailHtml = generateReportHtml(safeReportData);
                await Promise.all(recipients.map((email) => db.collection('mail').add({
                    to: email,
                    message: {
                        subject: `New Report Submitted for ${safeReportData.applianceName}`,
                        html: emailHtml,
                    },
                    createdAt: FieldValue.serverTimestamp(),
                })));
            }
        } catch (emailError) {
            console.error('Failed to queue report emails:', emailError);
        }
        res.status(201).json({ message: 'Report saved successfully.', reportId: reportRef.id });
    } catch (error) {
        console.error('Error completing check session:', error);
        const status = error.status || 500;
        res.status(status).json({ message: status === 500 ? 'Failed to complete check session.' : error.message });
    }
});

brigadeRouter.get('/:brigadeId', async (req, res) => {
    try {
        const brigadeId = req.params.brigadeId;
        const userId = req.user.uid;
        const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);
        const memberDoc = await memberRef.get();
        if (!memberDoc.exists) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const brigadeDoc = await brigadeRef.get();
        if (!brigadeDoc.exists) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }
        const brigadeData = brigadeDoc.data();
        const identifier = await ensureBrigadeIdentifier(brigadeId, brigadeRef, brigadeData);
        const membersCollectionRef = brigadeRef.collection('members');
        const membersSnapshot = await membersCollectionRef.get();
        const members = await Promise.all(membersSnapshot.docs.map(async (doc) => {
            const data = doc.data() || {};
            const userIdentifier = normalizeSixDigitIdentifier(data.userIdentifier, 'user') || await ensureUserIdentifier(doc.id);
            const memberProfile = await getUserProfile(doc.id);
            const fullName = data.fullName || data.name || displayNameFromProfile(memberProfile, doc.id);
            const role = normalizeRole(data.role) || ROLES.MEMBER;
            if (!normalizeSixDigitIdentifier(data.userIdentifier, 'user') && userIdentifier) {
                await doc.ref.set({ userIdentifier }, { merge: true });
            }
            if (data.role !== role || data.fullName !== fullName) {
                await doc.ref.set({ role, fullName, name: fullName, email: data.email || memberProfile?.email || '' }, { merge: true });
            }
            return { id: doc.id, ...data, role, roleLabel: roleLabel(role), fullName, name: fullName, email: data.email || memberProfile?.email || '', userIdentifier };
        }));
        res.status(200).json({ ...brigadeData, identifier, members: members });
    } catch (error) {
        console.error(`Error fetching brigade data for ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to fetch brigade data.' });
    }
});
brigadeRouter.delete('/:brigadeId', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const adminId = req.user.uid;
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const adminMemberRef = brigadeRef.collection('members').doc(adminId);
        const adminMemberDoc = await adminMemberRef.get();
        if (!adminMemberDoc.exists || !canDeleteBrigade(adminMemberDoc.data().role)) {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to delete a brigade.' });
        }

        const membersSnapshot = await brigadeRef.collection('members').get();
        const memberIds = membersSnapshot.docs.map((doc) => doc.id);

        // Delete cross-collection membership references first (these are not under the brigade doc).
        const USER_BRIGADE_BATCH_LIMIT = 450;
        for (let i = 0; i < memberIds.length; i += USER_BRIGADE_BATCH_LIMIT) {
            const batch = db.batch();
            const chunk = memberIds.slice(i, i + USER_BRIGADE_BATCH_LIMIT);
            chunk.forEach((memberId) => {
                const userBrigadeRef = db.collection('users').doc(memberId).collection('userBrigades').doc(brigadeId);
                batch.delete(userBrigadeRef);
            });
            await batch.commit();
        }

        // Now delete the brigade doc and all nested subcollections (members, joinRequests, reports, etc).
        if (typeof db.recursiveDelete === 'function') {
            await db.recursiveDelete(brigadeRef);
        } else {
            // Fallback for older SDKs: manually delete known subcollections.
            const deleteCollection = async (collectionRef, batchSize = 450) => {
                while (true) {
                    const snapshot = await collectionRef
                        .orderBy(admin.firestore.FieldPath.documentId())
                        .limit(batchSize)
                        .get();
                    if (snapshot.empty) return;
                    const batch = db.batch();
                    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
                    await batch.commit();
                    if (snapshot.size < batchSize) return;
                }
            };

            await deleteCollection(brigadeRef.collection('reports'));
            await deleteCollection(brigadeRef.collection('appliances'));
            await deleteCollection(brigadeRef.collection('checkSessions'));
            await deleteCollection(brigadeRef.collection('members'));
            await deleteCollection(brigadeRef.collection('joinRequests'));
            await brigadeRef.delete();
        }

        res.status(200).json({ message: 'Brigade deleted successfully.' });
    } catch (error) {
        console.error(`Error deleting brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to delete brigade.' });
    }
});
apiRouter.use('/brigades', brigadeRouter);

function normalizeSignedName(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    // Avoid control chars / obvious HTML injection in downstream email rendering.
    const cleaned = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').replace(/[<>]/g, '');
    return cleaned.slice(0, 120);
}

function clamp01Number(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

function sanitizeSignatureData(data) {
    if (!data || typeof data !== 'object') return null;
    const rawStrokes = Array.isArray(data.strokes) ? data.strokes : null;
    if (!rawStrokes) return null;

    // Firestore does not allow arrays containing arrays. Keep strokes as arrays of objects.
    const MAX_STROKES = 12;
    const MAX_POINTS_TOTAL = 800;
    let pointsTotal = 0;
    const cleanedStrokes = [];

    for (const rawStroke of rawStrokes.slice(0, MAX_STROKES)) {
        let points = [];

        // Accept either legacy array points ([[x,y], ...]) or object points ({points:[{x,y}, ...]})
        if (rawStroke && typeof rawStroke === 'object' && Array.isArray(rawStroke.points)) {
            points = rawStroke.points;
        } else if (Array.isArray(rawStroke)) {
            points = rawStroke;
        } else {
            continue;
        }

        const cleanedPoints = [];
        for (const pt of points) {
            if (pointsTotal >= MAX_POINTS_TOTAL) break;
            let x = null;
            let y = null;
            if (pt && typeof pt === 'object' && !Array.isArray(pt)) {
                x = pt.x;
                y = pt.y;
            } else if (Array.isArray(pt) && pt.length >= 2) {
                x = pt[0];
                y = pt[1];
            }
            if (x == null || y == null) continue;
            const cx = clamp01Number(x);
            const cy = clamp01Number(y);
            cleanedPoints.push({ x: Number(cx.toFixed(4)), y: Number(cy.toFixed(4)) });
            pointsTotal += 1;
        }

        if (cleanedPoints.length > 0) cleanedStrokes.push({ points: cleanedPoints });
        if (pointsTotal >= MAX_POINTS_TOTAL) break;
    }

    if (cleanedStrokes.length === 0) return null;
    return { version: 1, strokes: cleanedStrokes };
}

function parseExportDate(value, { endOfDay = false } = {}) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    let parsed;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        parsed = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
    } else {
        parsed = new Date(raw);
    }

    if (Number.isNaN(parsed.getTime())) return null;
    if (endOfDay && !/[T ]\d{2}:/.test(raw)) {
        parsed.setUTCHours(23, 59, 59, 999);
    }
    return parsed;
}

function getExportDateRange(source) {
    const from = parseExportDate(source && source.from);
    const to = parseExportDate(source && source.to, { endOfDay: true });
    if (!from || !to) {
        const error = new Error('Choose a valid from and to date for the export.');
        error.status = 400;
        throw error;
    }
    if (from.getTime() > to.getTime()) {
        const error = new Error('The export from date must be before the to date.');
        error.status = 400;
        throw error;
    }
    return {
        from,
        to,
    };
}

function parseReportDateMs(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.getTime();
}

async function loadReportExportPayload({ brigade, brigadeId, applianceId, range }) {
    const applianceDoc = await getApplianceForBrigade(brigadeId, applianceId, brigade);
    const appliance = applianceDoc && applianceDoc.data;
    if (!appliance) {
        const error = new Error('Appliance not found.');
        error.status = 404;
        throw error;
    }

    const snapshot = await brigade.ref.collection('reports')
        .where('date', '>=', range.from.toISOString())
        .where('date', '<=', range.to.toISOString())
        .orderBy('date', 'asc')
        .get();
    const fromMs = range.from.getTime();
    const toMs = range.to.getTime();
    const reports = snapshot.docs
        .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
        .filter((report) => {
            const reportMs = parseReportDateMs(report.date);
            return report.applianceId === applianceId && reportMs != null && reportMs >= fromMs && reportMs <= toMs;
        })
        .sort((a, b) => {
            const aMs = parseReportDateMs(a.date) || 0;
            const bMs = parseReportDateMs(b.date) || 0;
            return aMs - bMs;
        });

    if (reports.length === 0) {
        const error = new Error('No reports found for that appliance and date range.');
        error.status = 404;
        throw error;
    }

    return {
        brigadeId,
        brigadeName: brigade.data && brigade.data.name,
        applianceId,
        applianceName: appliance.name,
        from: range.from,
        to: range.to,
        reports,
    };
}

function sendExportError(res, error, logMessage, fallbackMessage = 'Failed to export reports.') {
    const status = Number(error && error.status) || 500;
    if (status >= 500) console.error(logMessage, error);
    const message = status >= 500 ? fallbackMessage : (error && error.message ? error.message : fallbackMessage);
    res.status(status).json({ message });
}

function reportExportDownloadPath(token) {
    return `/api/report-export-downloads/${encodeURIComponent(token)}.pdf`;
}

function pdfContentDisposition(filename) {
    const fallback = String(filename || 'report-export.pdf').replace(/["\\\r\n]/g, '_');
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fallback)}`;
}

function setPdfDownloadHeaders(res, filename, contentLength) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', pdfContentDisposition(filename));
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (contentLength != null) {
        res.setHeader('Content-Length', String(contentLength));
    }
}

function timestampToMillis(value) {
    if (!value) return null;
    if (typeof value.toMillis === 'function') return value.toMillis();
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
}

// --- Report Routes ---
const reportRouter = express.Router();
reportRouter.get('/brigade/:brigadeId/export.pdf', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const applianceId = String(req.query.applianceId || '').trim();
        if (!applianceId) {
            return res.status(400).json({ message: 'Choose an appliance to export.' });
        }

        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        if (!canRunChecks(member.data.role)) {
            return res.status(403).json({ message: 'Forbidden: Viewer role cannot submit reports.' });
        }

        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }

        const range = getExportDateRange(req.query);
        const payload = await loadReportExportPayload({ brigade, brigadeId, applianceId, range });
        const profile = await ensureUserProfile(req.user);
        payload.exportedBy = displayNameFromProfile(profile, req.user.email || 'Unknown');
        const pdfBuffer = await buildReportExportPdf(payload);
        const filename = buildReportExportFilename(payload);

        setPdfDownloadHeaders(res, filename, pdfBuffer.length);
        res.status(200).send(pdfBuffer);
    } catch (error) {
        sendExportError(res, error, `Error exporting reports for brigade ${req.params.brigadeId}:`);
    }
});

reportRouter.post('/brigade/:brigadeId/export/download-link', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const applianceId = String((req.body && req.body.applianceId) || '').trim();
        if (!applianceId) {
            return res.status(400).json({ message: 'Choose an appliance to export.' });
        }

        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }

        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }

        const range = getExportDateRange(req.body || {});
        await loadReportExportPayload({ brigade, brigadeId, applianceId, range });

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAtDate = new Date(Date.now() + REPORT_EXPORT_DOWNLOAD_TTL_MS);
        await db.collection('reportExportDownloads').doc(token).set({
            uid: req.user.uid,
            brigadeId,
            applianceId,
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            exportedBy: displayNameFromProfile(await ensureUserProfile(req.user), req.user.email || 'Unknown'),
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromDate(expiresAtDate),
        });

        res.status(201).json({
            url: reportExportDownloadPath(token),
            expiresAt: expiresAtDate.toISOString(),
        });
    } catch (error) {
        sendExportError(
            res,
            error,
            `Error creating report export download link for brigade ${req.params.brigadeId}:`,
            'Failed to prepare report export download.'
        );
    }
});

reportRouter.post('/brigade/:brigadeId/export/email', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const applianceId = String((req.body && req.body.applianceId) || '').trim();
        if (!applianceId) {
            return res.status(400).json({ message: 'Choose an appliance to export.' });
        }
        if (!req.user.email) {
            return res.status(400).json({ message: 'Your account does not have an email address to send to.' });
        }

        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }

        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }

        const range = getExportDateRange(req.body || {});
        const payload = await loadReportExportPayload({ brigade, brigadeId, applianceId, range });
        const profile = await ensureUserProfile(req.user);
        payload.exportedBy = displayNameFromProfile(profile, req.user.email || 'Unknown');
        const pdfBuffer = await buildReportExportPdf(payload);
        const filename = buildReportExportFilename(payload);

        await transporter.sendMail({
            to: req.user.email,
            from: DEFAULT_FROM_EMAIL,
            subject: `Report export for ${payload.applianceName}`,
            text: `Attached is your Flashover report export for ${payload.applianceName}.`,
            html: `<p>Attached is your Flashover report export for <strong>${payload.applianceName}</strong>.</p>`,
            attachments: [
                {
                    filename,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                },
            ],
        });

        res.status(200).json({ message: `Report export emailed to ${req.user.email}.` });
    } catch (error) {
        sendExportError(
            res,
            error,
            `Error emailing report export for brigade ${req.params.brigadeId}:`,
            'Failed to email report export.'
        );
    }
});

reportRouter.get('/brigade/:brigadeId', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }

        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }

        const reportsRef = db.collection('brigades').doc(brigadeId).collection('reports');
        const snapshot = await reportsRef.orderBy('date', 'desc').get();
        if (snapshot.empty) {
            return res.json([]);
        }
        // Return only summary fields here (the full report can be fetched by ID).
        const reports = snapshot.docs.map(doc => {
            const data = doc.data() || {};
            return {
                id: doc.id,
                applianceId: data.applianceId,
                applianceName: data.applianceName,
                date: data.date,
                username: data.username || data.creatorName,
                signedName: data.signedName,
                uid: data.uid,
            };
        });
        res.json(reports);
    } catch (error) {
        console.error(`Error fetching reports for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to fetch reports.' });
    }
});
// A helper function to generate a clearer HTML email for the report
const generateReportHtml = (reportData) => {
    const {
        applianceName = 'Unknown Appliance',
        date,
        username = 'Unknown User',
        signedName,
        lockers = [],
    } = reportData || {};

    const completedBy = String(signedName || '').trim() || username;

    let formattedDate = 'an unknown date';
    try {
        if (date) {
            formattedDate = new Date(date).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
        }
    } catch (e) {
        console.error('Could not parse date:', date);
    }

    const styles = {
        body: `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2933; background: #f7f9fc; padding: 16px;`,
        card: `max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); padding: 20px;`,
        header: `margin: 0 0 12px 0; color: #111827;`,
        sub: `margin: 4px 0 16px 0; color: #4b5563;`,
        summary: `display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px 0;`,
        pill: `background: #e5e7eb; border-radius: 999px; padding: 6px 10px; font-size: 13px; color: #111827;`,
        section: `margin: 16px 0; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;`,
        sectionHeader: `background: #111827; padding: 12px 14px; font-weight: 800; color: #ffffff; font-size: 15px; letter-spacing: 0.2px;`,
        table: `width: 100%; border-collapse: collapse;`,
        td: `padding: 10px 14px; font-size: 14px; color: #111827; border-bottom: 1px solid #eef2f7; vertical-align: top;`,
        name: `font-weight: 700;`,
        subtle: `color: #6b7280; font-weight: 600; font-size: 12px;`,
        note: `display: inline-block; background: #fff7ed; color: #9a3412; padding: 4px 8px; border-radius: 8px; font-size: 13px; border: 1px solid #fed7aa;`,
        rowAlt: `background: #fafbfc;`,
        rowIssue: `background: #fff5f5;`,
        rowContainer: `background: #f2f6ff;`,
        rowSubItem: `background: #f8fafc;`,
        subItemPad: `padding-left: 36px;`,
        statusTagBase: `display: inline-block; width: 6px; height: 14px; border-radius: 999px; margin-right: 10px; vertical-align: -2px;`,
        statusTag: {
            present: `background: #22c55e;`,
            missing: `background: #ef4444;`,
            defect: `background: #ef4444;`,
            untouched: `background: #6366f1;`,
            na: `background: #9ca3af;`,
        },
        badge: {
            base: `display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700;`,
            present: `background: #ecfdf3; color: #166534; border: 1px solid #bbf7d0;`,
            missing: `background: #fef2f2; color: #b91c1c; border: 1px solid #fecdd3;`,
            defect: `background: #fef2f2; color: #b91c1c; border: 1px solid #fecdd3;`,
            untouched: `background: #eef2ff; color: #312e81; border: 1px solid #c7d2fe;`,
            na: `background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;`
        }
    };

    const statusBadge = (status) => {
        const s = (status || 'N/A').toLowerCase();
        let style = styles.badge.na;
        let label = 'N/A';
        if (s === 'present') { style = styles.badge.present; label = 'Present'; }
        else if (s === 'missing') { style = styles.badge.missing; label = 'Missing'; }
        else if (s === 'defect') { style = styles.badge.defect; label = 'Defect'; }
        else if (s === 'untouched') { style = styles.badge.untouched; label = 'Untouched'; }
        return `<span style="${styles.badge.base} ${style}">${label}</span>`;
    };

    const isIssueStatus = (status) => {
        const s = (status || '').toLowerCase();
        return s === 'missing' || s === 'defect';
    };

    const effectiveContainerStatus = (item) => {
        const type = (item && item.type || '').toLowerCase();
        if (type !== 'container') return item && item.status;

        const raw = (item && item.status || 'untouched').toLowerCase();
        if (raw === 'missing' || raw === 'defect') return raw;

        // In the app UX, "check contents" implies the container itself is present,
        // even if the container item wasn't explicitly marked.
        return 'present';
    };

    const statusTagHtml = (status) => {
        const s = (status || 'N/A').toLowerCase();
        let style = styles.statusTag.na;
        if (s === 'present') style = styles.statusTag.present;
        else if (s === 'missing') style = styles.statusTag.missing;
        else if (s === 'defect') style = styles.statusTag.defect;
        else if (s === 'untouched') style = styles.statusTag.untouched;
        return `<span style="${styles.statusTagBase} ${style}"></span>`;
    };

    let issuesCount = 0;
    let itemsCount = 0;
    if (Array.isArray(lockers)) {
        lockers.forEach(locker => {
            lockerItems(locker).forEach(item => {
                if (!item) return;
                itemsCount += 1;
                const itemStatus = effectiveContainerStatus(item);
                if (isIssueStatus(itemStatus)) issuesCount += 1;

                (item.subItems || []).forEach(sub => {
                    if (!sub) return;
                    itemsCount += 1;
                    if (isIssueStatus(sub.status)) issuesCount += 1;
                });
            });
        });
    }

    let html = `<div style="${styles.body}"><div style="${styles.card}">`;
    html += `<h2 style="${styles.header}">Report for ${applianceName}</h2>`;
    html += `<p style="${styles.sub}">Completed by <strong>${completedBy}</strong> on ${formattedDate}<br/><span style="${styles.subtle}">app username: ${username}</span></p>`;
    html += `<div style="${styles.summary}">`;
    html += `<span style="${styles.pill}">Issues: ${issuesCount}</span>`;
    html += `<span style="${styles.pill}">Items: ${itemsCount}</span>`;
    html += `<span style="${styles.pill}">Lockers: ${Array.isArray(lockers) ? lockers.length : 0}</span>`;
    html += `</div>`;

    if (Array.isArray(lockers) && lockers.length > 0) {
        lockers.forEach(locker => {
            html += `<div style="${styles.section}">`;
            html += `<div style="${styles.sectionHeader}">${locker.name || 'Locker'}</div>`;

            const orderedItems = lockerItems(locker);
            if (orderedItems.length === 0) {
                html += `<div style="padding: 12px 14px; color: #6b7280; font-size: 13px;">No items recorded.</div>`;
            } else {
                html += `<table style="${styles.table}"><tbody>`;

                orderedItems.forEach((item, itemIndex) => {
                    if (!item) return;

                    const status = effectiveContainerStatus(item);
                    const itemIsIssue = isIssueStatus(status);
                    const rowStyleParts = [];
                    if (itemIndex % 2 === 1) rowStyleParts.push(styles.rowAlt);
                    if (itemIsIssue) rowStyleParts.push(styles.rowIssue);
                    if ((item.type || '').toLowerCase() === 'container') rowStyleParts.push(styles.rowContainer);
                    const rowStyle = rowStyleParts.length ? ` style="${rowStyleParts.join(' ')}"` : '';

                    const noteLabel = item.noteImage ? `${item.note || ''}${item.note ? ' ' : ''}Image attached.` : item.note;
                    const noteHtml = noteLabel ? `<span style="${styles.note}">${noteLabel}</span>` : '';
                    const tagHtml = statusTagHtml(status);

                    html += `<tr${rowStyle}>`;
                    html += `<td style="${styles.td}">${tagHtml}<span style="${styles.name}">${item.name || 'Item'}</span></td>`;
                    html += `<td style="${styles.td}">${statusBadge(status)}</td>`;
                    html += `<td style="${styles.td}">${noteHtml}</td>`;
                    html += `</tr>`;

                    if (item.type === 'container' && Array.isArray(item.subItems) && item.subItems.length > 0) {
                        item.subItems.forEach((sub, subIndex) => {
                            if (!sub) return;
                            const subIsIssue = isIssueStatus(sub.status);
                            const subRowStyleParts = [styles.rowSubItem];
                            if (subIsIssue) subRowStyleParts.push(styles.rowIssue);
                            if ((subIndex + itemIndex) % 2 === 1) subRowStyleParts.push(styles.rowAlt);
                            const subRowStyle = ` style="${subRowStyleParts.join(' ')}"`;
                            const subNoteLabel = sub.noteImage ? `${sub.note || ''}${sub.note ? ' ' : ''}Image attached.` : sub.note;
                            const subNoteHtml = subNoteLabel ? `<span style="${styles.note}">${subNoteLabel}</span>` : '';
                            const subTagHtml = statusTagHtml(sub.status);
                            html += `<tr${subRowStyle}>`;
                            html += `<td style="${styles.td} ${styles.subItemPad}"><span style="${styles.subtle}">↳</span> ${subTagHtml}<span style="${styles.name}">${sub.name || 'Sub-item'}</span></td>`;
                            html += `<td style="${styles.td}">${statusBadge(sub.status)}</td>`;
                            html += `<td style="${styles.td}">${subNoteHtml}</td>`;
                            html += `</tr>`;
                        });
                    }
                });

                html += `</tbody></table>`;
            }
            html += `</div>`;
        });
    } else {
        html += `<p>No checklist items in this report.</p>`;
    }

    html += `</div></div>`;
    return html;
};

reportRouter.post('/', async (req, res) => {
    try {
        const reportData = req.body || {};
        const { brigadeId, applianceId } = reportData;
        if (!brigadeId || !applianceId) {
            return res.status(400).json({ message: 'Missing required report data.' });
        }

        const member = await getBrigadeMember(brigadeId, req.user.uid);
        if (!member) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }

        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }

        const applianceDoc = await getApplianceForBrigade(brigadeId, applianceId, brigade);
        const appliance = applianceDoc && applianceDoc.data;
        if (!appliance) {
            return res.status(404).json({ message: 'Appliance not found.' });
        }

        const signedName = normalizeSignedName(reportData.signedName);
        const signature = sanitizeSignatureData(reportData.signature);
        const profile = await ensureUserProfile(req.user);
        const createdByName = displayNameFromProfile(profile, req.user.email || reportData.username || 'Unknown');

        const safeReportData = {
            brigadeId,
            applianceId,
            applianceName: reportData.applianceName || appliance.name,
            date: reportData.date || new Date().toISOString(),
            checkedAt: reportData.date || new Date().toISOString(),
            createdAt: FieldValue.serverTimestamp(),
            applianceVersion: appliance.version || 1,
            lockers: Array.isArray(reportData.lockers) ? reportData.lockers.map((locker) => normalizeLockerShape(locker)) : [],
            uid: req.user.uid,
            username: createdByName,
            createdByUid: req.user.uid,
            createdByName,
            signedName,
            hasSignature: !!signature,
        };

        const reportRef = brigade.ref.collection('reports').doc();
        await reportRef.set(safeReportData);
        const reportId = reportRef.id;

        // Store the signature separately so large reports don't risk hitting Firestore's 1MiB document limit.
        if (signature) {
            await reportRef.collection('meta').doc('signoff').set(
                {
                    signature,
                    signedName,
                    username: safeReportData.username,
                    uid: safeReportData.uid,
                    createdAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );
        }
        try {
            await db.runTransaction(async (transaction) => {
                const freshApplianceDoc = await transaction.get(applianceDoc.ref);
                if (!freshApplianceDoc.exists) return;
                const freshAppliance = applianceDataFromDoc(freshApplianceDoc);
                const activeLock = normalizeCheckStatus(freshAppliance.checkStatus);
                if (!isCheckLockActive(activeLock) || activeLock.uid !== req.user.uid) return;
                transaction.set(applianceDoc.ref, { checkStatus: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            });
        } catch (lockError) {
            console.error('Failed to clear report author check lock:', lockError);
        }
        try {
            const membersSnapshot = await db.collection('brigades').doc(brigadeId).collection('members').get();
            if (!membersSnapshot.empty) {
                const memberIds = membersSnapshot.docs.map(doc => doc.id);
                const profiles = await Promise.all(memberIds.map(uid => getUserProfile(uid)));
                const recipients = profiles.map(userProfile => userProfile && userProfile.email).filter(email => !!email);
                if (recipients.length > 0) {
                    
                    // Generate the rich HTML content for the email
                    const emailHtml = generateReportHtml(safeReportData);

                    const mailCollection = db.collection('mail');
                    const emailPromises = recipients.map(email => {
                        return mailCollection.add({
                            to: email,
                            message: {
                                subject: `New Report Submitted for ${safeReportData.applianceName}`,
                                html: emailHtml, // Use the new, detailed HTML
                            },
                        });
                    });
                    await Promise.all(emailPromises);
                    console.log(`Successfully queued emails for ${recipients.length} brigade members.`);
                }
            }
        } catch (emailError) {
            console.error("Failed to send email notifications:", emailError);
        }
        res.status(201).json({ message: 'Report saved successfully.', reportId: reportId });
    } catch (err) {
        console.error('Error saving report:', err);
        const detail = (err && err.message) ? String(err.message) : '';
        const safeDetail = detail.replace(/[\r\n\t]+/g, ' ').slice(0, 220);
        res.status(500).json({ message: `Error saving report.${safeDetail ? ` ${safeDetail}` : ''}` });
    }
});
apiRouter.use('/reports', reportRouter);

// --- Final App Setup ---
app.get('/api/report-export-downloads/:token.pdf', async (req, res) => {
    const token = String(req.params.token || '').trim();
    if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(404).json({ message: 'Report export download link not found.' });
    }

    try {
        const tokenRef = db.collection('reportExportDownloads').doc(token);
        const tokenDoc = await tokenRef.get();
        if (!tokenDoc.exists) {
            return res.status(404).json({ message: 'Report export download link not found.' });
        }

        const tokenData = tokenDoc.data() || {};
        const expiresAtMs = timestampToMillis(tokenData.expiresAt);
        if (!expiresAtMs || expiresAtMs <= Date.now()) {
            return res.status(404).json({ message: 'Report export download link has expired.' });
        }

        const brigadeId = String(tokenData.brigadeId || '').trim();
        const applianceId = String(tokenData.applianceId || '').trim();
        const range = {
            from: parseExportDate(tokenData.from),
            to: parseExportDate(tokenData.to),
        };
        if (!brigadeId || !applianceId || !range.from || !range.to) {
            return res.status(404).json({ message: 'Report export download link is invalid.' });
        }

        const brigade = await getBrigadeDoc(brigadeId);
        if (!brigade) {
            return res.status(404).json({ message: 'Report export download link not found.' });
        }

        const payload = await loadReportExportPayload({ brigade, brigadeId, applianceId, range });
        payload.exportedBy = tokenData.exportedBy || 'Unknown';
        const pdfBuffer = await buildReportExportPdf(payload);
        const filename = buildReportExportFilename(payload);

        setPdfDownloadHeaders(res, filename, pdfBuffer.length);
        await tokenRef.set({ lastDownloadedAt: FieldValue.serverTimestamp() }, { merge: true });
        return res.status(200).send(pdfBuffer);
    } catch (error) {
        const status = Number(error && error.status) || 500;
        if (status >= 500) {
            console.error(`Error serving report export download token ${token}:`, error);
        }
        const message = status >= 500
            ? 'Failed to download report export.'
            : (error && error.message ? error.message : 'Report export download link is no longer available.');
        return res.status(status).json({ message });
    }
});

app.use('/api', apiRouter);
exports.api = functions.https.onRequest(app);
