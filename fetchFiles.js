#!/usr/bin/env node

const requireAuth = require('firebase-tools/lib/requireAuth');
const api = require('firebase-tools/lib/api');
const fs = require('fs-extra');
const request = require('request');

if (!process.argv[2]) {
    console.error(`
ERROR: Must supply a site name. Usage:

  node fetchFiles.js <site_name>`);
  process.exit(1);
}

const site = process.argv[2];

async function getLatestVersionName() {
  const result = await api.request('GET', `/v1beta1/sites/${site}/releases?pageSize=1`, {
    auth: true,
    origin: api.hostingApiOrigin,
  });
  const release = (result.body.releases || [])[0];
  if (release) {
    return release.version.name;
  }
  return null;
}

const LIST_PAGE_SIZE = 1000;
async function listFiles(versionName, existing = [], pageToken = null) {
  const result = await api.request('GET', `/v1beta1/${versionName}/files?pageSize=${LIST_PAGE_SIZE}${pageToken ? `&pageToken=${pageToken}` : ''}`, {auth: true, origin: api.hostingApiOrigin});
  result.body.files.forEach(file => existing.push(file.path));
  if (result.body.nextPageToken) {
    return await listFiles(versionName, existing, result.body.nextPageToken);
  }
  return existing;
}

const MAX_FETCHES = 100;

function escapePathForURL(path){return path.split("/").map(encodeURIComponent).join("/");}

(async function() {
  try {
    await requireAuth({}, ['https://www.googleapis.com/auth/cloud-platform']);
    const v = await getLatestVersionName();
    const vid = v.split('/')[v.split('/').length - 1];
    const toFetch = await listFiles(v);
    const dirName = `${site}_${vid}`;
    let fetchesOutstanding = 0;
    let fetchCount = 0;
    function fetch() {
      if (fetchesOutstanding >= MAX_FETCHES) {
        return;
      } else if (toFetch.length === 0) {
        console.log();
        console.log("Complete. Fetched", fetchCount, "files.");
        return;
      }

      const f = toFetch.shift();
      console.log('Fetching', f);
      fetchesOutstanding++;
      fetchCount++;
      fs.ensureFileSync(dirName + f);
      const q = request(`https://${site}.firebaseapp.com${escapePathForURL(f)}`)
      const ws = fs.createWriteStream(dirName + f);
      q.pipe(ws);
      ws.on('finish', () => {
        console.log('Fetched ', f);
        fetchesOutstanding--;
        fetch();
      });
    }

    fetch();
  } catch (e) {
    console.error("ERROR:", e.stack);
    process.exit(1);
  }
})();
