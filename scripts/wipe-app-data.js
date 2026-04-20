#!/usr/bin/env node

'use strict';

const path = require('path');

const FIRESTORE_COLLECTIONS = [
  'brigades',
  'users',
  'identifierRegistry',
  'mail',
  'reportExportDownloads',
];

const STORAGE_PREFIX = 'uploads/';
const DEFAULT_PROJECT_ID = 'flashoverapplication';
const DEFAULT_STORAGE_BUCKET = `${DEFAULT_PROJECT_ID}.firebasestorage.app`;
const DEFAULT_EMULATOR_HOSTS = {
  firestore: '127.0.0.1:8080',
  auth: '127.0.0.1:9099',
  storage: '127.0.0.1:9199',
};

function usage() {
  return `
Usage:
  node scripts/wipe-app-data.js --env <emulator|production> --project <project-id> [options]

Dry-run examples:
  node scripts/wipe-app-data.js --env emulator --project ${DEFAULT_PROJECT_ID}
  node scripts/wipe-app-data.js --env production --project ${DEFAULT_PROJECT_ID} --auth

Actual deletion examples:
  node scripts/wipe-app-data.js --env emulator --project ${DEFAULT_PROJECT_ID} --confirm
  node scripts/wipe-app-data.js --env production --project ${DEFAULT_PROJECT_ID} --confirm --confirm-project ${DEFAULT_PROJECT_ID} --auth

What is wiped:
  Firestore collections: ${FIRESTORE_COLLECTIONS.join(', ')}
  Storage prefix:         gs://<bucket>/${STORAGE_PREFIX}**
  Auth users:             only when --auth is passed

Safety:
  The script is dry-run by default.
  Actual deletion requires --confirm.
  Production deletion also requires --confirm-project <project-id>.
  Credentials come from Firebase Admin SDK defaults / application default credentials.
  No service account keys or secrets should be passed to this script.

Options:
  --env <value>                 Required. "emulator" or "production".
  --project <project-id>        Required Firebase project ID.
  --bucket <bucket-name>        Storage bucket. Defaults to ${DEFAULT_STORAGE_BUCKET}.
  --auth                        Include Firebase Auth users in the wipe.
  --confirm                     Perform deletion. Omit for dry-run.
  --confirm-project <project>   Required for production deletion; must equal --project.
  --dry-run                     Explicit dry-run. Cannot be combined with --confirm.
  --firestore-host <host:port>  Emulator Firestore host. Default ${DEFAULT_EMULATOR_HOSTS.firestore}.
  --auth-host <host:port>       Emulator Auth host. Default ${DEFAULT_EMULATOR_HOSTS.auth}.
  --storage-host <host:port>    Emulator Storage host. Default ${DEFAULT_EMULATOR_HOSTS.storage}.
  --batch-size <number>         Fallback Firestore delete batch size. Default 250.
  --help                        Show this help text.
`;
}

function parseArgs(argv) {
  const options = {
    env: null,
    projectId: null,
    bucketName: null,
    includeAuth: false,
    confirm: false,
    confirmProject: null,
    explicitDryRun: false,
    firestoreHost: DEFAULT_EMULATOR_HOSTS.firestore,
    authHost: DEFAULT_EMULATOR_HOSTS.auth,
    storageHost: DEFAULT_EMULATOR_HOSTS.storage,
    batchSize: 250,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length || argv[i].startsWith('--')) {
        throw new Error(`${arg} requires a value.`);
      }
      return argv[i];
    };

    switch (arg) {
      case '--env':
        options.env = next();
        break;
      case '--project':
        options.projectId = next();
        break;
      case '--bucket':
        options.bucketName = next();
        break;
      case '--auth':
        options.includeAuth = true;
        break;
      case '--confirm':
        options.confirm = true;
        break;
      case '--confirm-project':
        options.confirmProject = next();
        break;
      case '--dry-run':
        options.explicitDryRun = true;
        break;
      case '--firestore-host':
        options.firestoreHost = next();
        break;
      case '--auth-host':
        options.authHost = next();
        break;
      case '--storage-host':
        options.storageHost = next();
        break;
      case '--batch-size':
        options.batchSize = Number.parseInt(next(), 10);
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.env) {
    throw new Error('Missing required --env <emulator|production>.');
  }
  if (!['emulator', 'production'].includes(options.env)) {
    throw new Error('--env must be "emulator" or "production".');
  }
  if (!options.projectId) {
    throw new Error('Missing required --project <project-id>.');
  }
  if (options.confirm && options.explicitDryRun) {
    throw new Error('--confirm cannot be combined with --dry-run.');
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 500) {
    throw new Error('--batch-size must be an integer from 1 to 500.');
  }
  if (options.env === 'production' && options.confirm) {
    if (options.confirmProject !== options.projectId) {
      throw new Error('Production deletion requires --confirm-project with the exact --project value.');
    }
  }
}

function loadFirebaseAdmin() {
  try {
    return require('firebase-admin');
  } catch (rootError) {
    try {
      return require(path.join('..', 'functions', 'node_modules', 'firebase-admin'));
    } catch (functionsError) {
      throw new Error(
        'Unable to load firebase-admin. Run npm install in the repo root or functions/ first.',
      );
    }
  }
}

function configureEmulators(options) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || options.firestoreHost;
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || options.authHost;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST =
    process.env.FIREBASE_STORAGE_EMULATOR_HOST || options.storageHost;
}

function assertProductionIsNotPointingAtEmulators() {
  const emulatorEnvVars = [
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
  ];
  const configuredVars = emulatorEnvVars.filter((name) => process.env[name]);

  if (configuredVars.length > 0) {
    throw new Error(
      `Production mode cannot run while emulator environment variables are set: ${configuredVars.join(', ')}`,
    );
  }
}

function initializeFirebase(admin, options) {
  const bucketName = options.bucketName || DEFAULT_STORAGE_BUCKET.replace(DEFAULT_PROJECT_ID, options.projectId);
  admin.initializeApp({
    projectId: options.projectId,
    storageBucket: bucketName,
  });

  return {
    db: admin.firestore(),
    auth: admin.auth(),
    bucket: admin.storage().bucket(bucketName),
    bucketName,
  };
}

async function countCollectionRecursive(collectionRef) {
  let count = 0;
  const documentRefs = await collectionRef.listDocuments();

  for (const documentRef of documentRefs) {
    const snapshot = await documentRef.get();
    if (snapshot.exists) {
      count += 1;
    }

    const subcollections = await documentRef.listCollections();
    for (const subcollectionRef of subcollections) {
      count += await countCollectionRecursive(subcollectionRef);
    }
  }

  return count;
}

async function deleteCollectionFallback(collectionRef, batchSize) {
  let deleted = 0;
  const documentRefs = await collectionRef.listDocuments();

  for (const documentRef of documentRefs) {
    const subcollections = await documentRef.listCollections();
    for (const subcollectionRef of subcollections) {
      deleted += await deleteCollectionFallback(subcollectionRef, batchSize);
    }
  }

  for (let i = 0; i < documentRefs.length; i += batchSize) {
    const batch = collectionRef.firestore.batch();
    const chunk = documentRefs.slice(i, i + batchSize);
    for (const documentRef of chunk) {
      batch.delete(documentRef);
    }
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
}

async function deleteCollection(db, collectionName, batchSize) {
  const collectionRef = db.collection(collectionName);

  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(collectionRef);
    return { method: 'recursiveDelete', deleted: null };
  }

  const deleted = await deleteCollectionFallback(collectionRef, batchSize);
  return { method: 'fallback', deleted };
}

async function countStorageObjects(bucket, prefix) {
  let count = 0;
  let nextQuery = { prefix, autoPaginate: false, maxResults: 1000 };

  do {
    const [files, query] = await bucket.getFiles(nextQuery);
    count += files.length;
    nextQuery = query;
  } while (nextQuery);

  return count;
}

async function deleteStorageObjects(bucket, prefix) {
  let deleted = 0;

  do {
    const [files] = await bucket.getFiles({ prefix, autoPaginate: false, maxResults: 1000 });
    if (files.length === 0) {
      break;
    }

    for (let i = 0; i < files.length; i += 25) {
      const chunk = files.slice(i, i + 25);
      await Promise.all(chunk.map((file) => file.delete({ ignoreNotFound: true })));
      deleted += chunk.length;
    }
  } while (true);

  return deleted;
}

async function listAuthUserIds(auth) {
  const uids = [];
  let pageToken;

  do {
    const result = await auth.listUsers(1000, pageToken);
    uids.push(...result.users.map((user) => user.uid));
    pageToken = result.pageToken;
  } while (pageToken);

  return uids;
}

async function deleteAuthUsers(auth, uids) {
  let deleted = 0;

  for (let i = 0; i < uids.length; i += 1000) {
    const chunk = uids.slice(i, i + 1000);
    if (chunk.length === 0) {
      continue;
    }
    const deleteResult = await auth.deleteUsers(chunk);
    deleted += deleteResult.successCount;
    if (deleteResult.failureCount > 0) {
      for (const failure of deleteResult.errors) {
        console.error(`Auth delete failed for index ${failure.index}: ${failure.error.message}`);
      }
      throw new Error(`Failed to delete ${deleteResult.failureCount} Auth user(s).`);
    }
  }

  return deleted;
}

function printHeader(options, bucketName, dryRun) {
  console.log('Flashover app data wipe');
  console.log('------------------------');
  console.log(`Mode:        ${dryRun ? 'DRY RUN' : 'DELETE'}`);
  console.log(`Environment: ${options.env}`);
  console.log(`Project:     ${options.projectId}`);
  console.log(`Bucket:      ${bucketName}`);
  console.log(`Auth wipe:   ${options.includeAuth ? 'included' : 'skipped'}`);

  if (options.env === 'emulator') {
    console.log(`Firestore:   ${process.env.FIRESTORE_EMULATOR_HOST}`);
    console.log(`Auth:        ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
    console.log(`Storage:     ${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`);
  }

  console.log('');
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  validateOptions(options);

  if (options.help) {
    console.log(usage().trim());
    return;
  }

  if (options.env === 'emulator') {
    configureEmulators(options);
  } else {
    assertProductionIsNotPointingAtEmulators();
  }

  const dryRun = !options.confirm;
  const admin = loadFirebaseAdmin();
  const { db, auth, bucket, bucketName } = initializeFirebase(admin, options);

  printHeader(options, bucketName, dryRun);

  console.log('Counting Firestore documents...');
  const firestoreCounts = {};
  for (const collectionName of FIRESTORE_COLLECTIONS) {
    firestoreCounts[collectionName] = await countCollectionRecursive(db.collection(collectionName));
  }

  console.log('Counting Storage objects...');
  const storageCount = await countStorageObjects(bucket, STORAGE_PREFIX);

  let authUserIds = [];
  if (options.includeAuth) {
    console.log('Counting Auth users...');
    authUserIds = await listAuthUserIds(auth);
  }

  console.log('');
  console.log('Planned wipe:');
  for (const collectionName of FIRESTORE_COLLECTIONS) {
    console.log(`  Firestore ${collectionName}: ${firestoreCounts[collectionName]} document(s) including nested subcollections`);
  }
  console.log(`  Storage ${STORAGE_PREFIX}**: ${storageCount} object(s)`);
  console.log(`  Auth users: ${options.includeAuth ? `${authUserIds.length} user(s)` : 'skipped'}`);
  console.log('');

  if (dryRun) {
    console.log('Dry run only. Add --confirm to delete these resources.');
    if (options.env === 'production') {
      console.log(`Production deletion also requires --confirm-project ${options.projectId}.`);
    }
    return;
  }

  console.log('Deleting Firestore collections...');
  for (const collectionName of FIRESTORE_COLLECTIONS) {
    const result = await deleteCollection(db, collectionName, options.batchSize);
    const detail = result.deleted === null ? result.method : `${result.method}, ${result.deleted} delete(s)`;
    console.log(`  Deleted ${collectionName} (${detail})`);
  }

  console.log('Deleting Storage objects...');
  const deletedStorageCount = await deleteStorageObjects(bucket, STORAGE_PREFIX);
  console.log(`  Deleted ${deletedStorageCount} Storage object(s) under ${STORAGE_PREFIX}`);

  if (options.includeAuth) {
    console.log('Deleting Auth users...');
    const deletedAuthCount = await deleteAuthUsers(auth, authUserIds);
    console.log(`  Deleted ${deletedAuthCount} Auth user(s)`);
  }

  console.log('');
  console.log('Wipe complete.');
}

run().catch((error) => {
  console.error('');
  console.error(`Error: ${error.message}`);
  console.error('');
  console.error(usage().trim());
  process.exitCode = 1;
});
