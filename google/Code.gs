/**
 * Project Spotlight — Google Sheets + Google Drive sync backend.
 *
 * Paste this file into the Apps Script editor of a Google Sheet (Extensions → Apps Script),
 * run `setup` once, then deploy it as a web app. Full steps: google/README.md in the repository.
 *
 * Storage:
 *   - Sheet "Projects" and "Clients": one row per record. The `json` column holds the full record
 *     (the source of truth); the other columns are there so the data is readable in the Sheet.
 *   - Sheet "Files": photo/logo id → Google Drive file.
 *   - Drive folder "Project Spotlight": Photos/ (originals used by the app) and Graphics/ (exported posts).
 *
 * The app talks to this script with POST requests carrying a secret key created by `setup`.
 */

var PROJECT_COLS = ['id', 'title', 'client', 'category', 'location', 'description', 'template', 'size', 'before', 'after', 'updated', 'deleted', 'serverTime', 'json'];
var CLIENT_COLS = ['id', 'name', 'trade', 'phone', 'website', 'serviceArea', 'logo', 'updated', 'deleted', 'serverTime', 'json'];
var FILE_COLS = ['id', 'fileId', 'mime', 'bytes', 'name', 'url', 'created'];
var MAX_JSON = 49000; // a Sheets cell holds 50,000 characters

// ---------------------------------------------------------------- one-time setup

function setup() {
  var props = PropertiesService.getScriptProperties();
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) props.setProperty('SHEET_ID', active.getId());
  var token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('TOKEN', token);
  }
  sheet_('Projects', PROJECT_COLS);
  sheet_('Clients', CLIENT_COLS);
  sheet_('Files', FILE_COLS);
  folder_('Photos');
  folder_('Graphics');
  Logger.log('Setup complete.\n\nYour secret key:\n\n    %s\n\nNext: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).', token);
  return token;
}

/** Creates a new secret key. Every device must reconnect with the new key afterwards. */
function resetSecretKey() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  return setup();
}

// ---------------------------------------------------------------- web app entry points

function doGet() {
  return json_({ ok: true, app: 'project-spotlight', message: 'Project Spotlight sync is running. Paste this URL into the app\'s Settings.' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Bad request' });
  }
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || !req || req.token !== token) return json_({ ok: false, code: 401, error: 'Wrong secret key. Check Settings in the app.' });
  var action = ACTIONS[req.action];
  if (!action) return json_({ ok: false, error: 'Unknown action: ' + req.action });
  var lock = null;
  if (action.lock) {
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
  }
  try {
    var out = action.fn(req) || {};
    out.ok = true;
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

var ACTIONS = {
  info: { lock: false, fn: info_ },
  pull: { lock: true, fn: pull_ },
  push: { lock: true, fn: push_ },
  hasBlobs: { lock: false, fn: hasBlobs_ },
  putBlob: { lock: true, fn: putBlob_ },
  getBlob: { lock: false, fn: getBlob_ },
  putGraphic: { lock: false, fn: putGraphic_ },
};

// ---------------------------------------------------------------- actions

function info_() {
  return { sheetUrl: spreadsheet_().getUrl(), folderUrl: root_().getUrl(), now: Date.now() };
}

// Records changed on the server after `since` (server clock), including deletions.
function pull_(req) {
  var since = Number(req.since) || 0;
  var now = Date.now();
  return {
    now: now,
    projects: changedSince_(sheet_('Projects', PROJECT_COLS), since),
    clients: changedSince_(sheet_('Clients', CLIENT_COLS), since),
  };
}

// Upserts records; a record older than the one already stored is skipped and reported as stale.
function push_(req) {
  var files = fileMap_();
  var stale = [];
  var clients = table_(sheet_('Clients', CLIENT_COLS), CLIENT_COLS);
  var projects = table_(sheet_('Projects', PROJECT_COLS), PROJECT_COLS);

  (req.clients || []).forEach(function (c) {
    if (!upsert_(clients, c, clientRow_(c, files))) stale.push(c.id);
  });
  var names = clientNames_(clients);
  (req.projects || []).forEach(function (p) {
    if (!upsert_(projects, p, projectRow_(p, names, files))) stale.push(p.id);
  });
  (req.deleted || []).forEach(function (d) {
    var rec = { id: d.id, updated: d.updated, deleted: true };
    if (!upsert_(d.kind === 'client' ? clients : projects, rec, { id: d.id })) stale.push(d.id);
  });
  return { stale: stale, now: Date.now() };
}

function hasBlobs_(req) {
  var files = fileMap_();
  return { missing: (req.ids || []).filter(function (id) { return !files[id]; }) };
}

function putBlob_(req) {
  if (!req.id || !req.data) throw new Error('Missing photo data');
  var files = fileMap_();
  if (files[req.id]) return { url: files[req.id].url, existed: true };
  var mime = req.mime || 'image/jpeg';
  var ext = mime.indexOf('png') >= 0 ? '.png' : '.jpg';
  var name = safeName_(req.name || 'photo') + ' (' + String(req.id).slice(0, 8) + ')' + ext;
  var blob = Utilities.newBlob(Utilities.base64Decode(req.data), mime, name);
  var file = folder_('Photos').createFile(blob);
  sheet_('Files', FILE_COLS).appendRow([req.id, file.getId(), mime, blob.getBytes().length, name, file.getUrl(), new Date()]);
  return { url: file.getUrl() };
}

function getBlob_(req) {
  var f = fileMap_()[req.id];
  if (!f) return { missing: true };
  var blob = DriveApp.getFileById(f.fileId).getBlob();
  return { mime: f.mime || blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function putGraphic_(req) {
  if (!req.data) throw new Error('Missing image data');
  var name = safeName_(req.name || 'project-spotlight') + '.jpg';
  var file = folder_('Graphics').createFile(Utilities.newBlob(Utilities.base64Decode(req.data), req.mime || 'image/jpeg', name));
  return { url: file.getUrl(), folderUrl: folder_('Graphics').getUrl() };
}

// ---------------------------------------------------------------- rows

function projectRow_(p, clientNames, files) {
  return {
    id: p.id,
    title: p.title || '',
    client: clientNames[p.clientId] || '',
    category: p.category || '',
    location: p.location || '',
    description: p.description || '',
    template: p.template || '',
    size: p.size || '',
    before: link_(files, p.photos && p.photos.before, 'Before photo'),
    after: link_(files, p.photos && p.photos.after, 'After photo'),
  };
}

function clientRow_(c, files) {
  return {
    id: c.id,
    name: c.name || '',
    trade: c.trade || '',
    phone: c.phone || '',
    website: c.website || '',
    serviceArea: c.serviceArea || '',
    logo: link_(files, c.logo, 'Logo'),
  };
}

function link_(files, id, label) {
  var f = id && files[id];
  return f ? '=HYPERLINK("' + f.url + '","' + label + '")' : '';
}

// Loads a sheet once so many records can be upserted without re-reading it.
function table_(sheet, cols) {
  var data = sheet.getDataRange().getValues();
  var rows = {};
  for (var i = 1; i < data.length; i++) rows[String(data[i][0])] = i;
  return { sheet: sheet, cols: cols, data: data, rows: rows };
}

// Writes a record if it is at least as new as the stored one. Returns false when the stored copy is newer.
function upsert_(t, rec, row) {
  if (!rec || !rec.id) return true;
  var json = JSON.stringify(rec);
  if (json.length > MAX_JSON) throw new Error('Record ' + rec.id + ' is too large to store');
  var cols = t.cols, jsonCol = cols.indexOf('json');
  var rowIndex = t.rows[String(rec.id)];
  if (rowIndex) {
    var existing = parse_(t.data[rowIndex][jsonCol]);
    if (existing && Number(existing.updated) > Number(rec.updated)) return false;
    // A deletion keeps the row readable (title, client…) and just flags it.
    if (rec.deleted) cols.forEach(function (c, i) { if (row[c] === undefined) row[c] = t.data[rowIndex][i]; });
  }
  row.updated = new Date(Number(rec.updated) || Date.now());
  row.deleted = rec.deleted ? true : '';
  row.serverTime = Date.now();
  row.json = json;
  var values = cols.map(function (c) { return row[c] === undefined ? '' : row[c]; });
  if (rowIndex) {
    t.sheet.getRange(rowIndex + 1, 1, 1, cols.length).setValues([values]);
    t.data[rowIndex] = values;
  } else {
    t.sheet.appendRow(values);
    t.data.push(values);
    t.rows[String(rec.id)] = t.data.length - 1;
  }
  return true;
}

function changedSince_(sheet, since) {
  var data = sheet.getDataRange().getValues();
  var head = data[0] || [];
  var st = head.indexOf('serverTime'), js = head.indexOf('json');
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (Number(data[i][st]) > since) {
      var rec = parse_(data[i][js]);
      if (rec) out.push(rec);
    }
  }
  return out;
}

function clientNames_(t) {
  var names = {}, js = t.cols.indexOf('json');
  for (var i = 1; i < t.data.length; i++) {
    var c = parse_(t.data[i][js]);
    if (c && !c.deleted) names[c.id] = c.name || '';
  }
  return names;
}

function fileMap_() {
  var data = sheet_('Files', FILE_COLS).getDataRange().getValues();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) map[data[i][0]] = { fileId: data[i][1], mime: data[i][2], url: data[i][5] };
  }
  return map;
}

// ---------------------------------------------------------------- helpers

function parse_(s) {
  try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

function safeName_(s) {
  return String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function spreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) { props.setProperty('SHEET_ID', active.getId()); return active; }
  var created = SpreadsheetApp.create('Project Spotlight');
  props.setProperty('SHEET_ID', created.getId());
  return created;
}

function sheet_(name, cols) {
  var ss = spreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    var first = ss.getSheets()[0];
    if (first.getName() === 'Sheet1' && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  }
  return sh;
}

function root_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* folder was deleted; recreate */ }
  }
  var folder = DriveApp.createFolder('Project Spotlight');
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function folder_(name) {
  var root = root_();
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}
