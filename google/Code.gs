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
 *
 * Optional AI writing: add a Script Property ANTHROPIC_API_KEY (your Claude API key). The key stays
 * here in your Google account and is never sent to the app. CLAUDE_MODEL overrides the model.
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
  aiWrite: { lock: false, fn: aiWrite_ },
  geocode: { lock: false, fn: geocode_ },
};

// ---------------------------------------------------------------- actions

function info_() {
  return { sheetUrl: spreadsheet_().getUrl(), folderUrl: root_().getUrl(), now: Date.now(), ai: aiEnabled_() };
}

// Records changed on the server after `since` (server clock), including deletions.
function pull_(req) {
  var since = Number(req.since) || 0;
  var now = Date.now();
  return {
    now: now,
    ai: aiEnabled_(),
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

// ---------------------------------------------------------------- AI writing (Claude API)

var AI_DEFAULT_MODEL = 'claude-opus-5';

var AI_SYSTEM = [
  'You write social media copy for home-service contractors — electricians, plumbers, HVAC techs, roofers,',
  'remodelers and similar trades — who post photos of jobs they just finished.',
  'Write like a proud, trustworthy local tradesperson: clear, specific, plain English. Avoid hype and clichés.',
  'Only state facts that are in the contractor\'s notes or clearly visible in the photos. Never invent brands,',
  'model numbers, prices, timelines, permits, warranties or customer quotes; if something is unclear, stay general.',
].join(' ');

var AI_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Headline for the graphic, 2-6 words' },
    description: { type: 'string', description: '1-3 sentences, under 220 characters' },
    category: { type: 'string', description: 'Short job type, e.g. "Panel Upgrade"' },
    caption: { type: 'string', description: 'Social media caption without phone number or hashtags' },
    hashtags: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'description', 'category', 'caption', 'hashtags'],
  additionalProperties: false,
};

function aiEnabled_() {
  return !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
}

function aiPrompt_(req) {
  var c = req.client || {}, p = req.project || {};
  var lines = [
    'Business: ' + (c.name || 'a local contractor') + (c.trade ? ' (' + c.trade + ')' : '') + (c.serviceArea ? ', serving ' + c.serviceArea : ''),
  ];
  if (p.location) lines.push('Job location: ' + p.location);
  if (p.category) lines.push('Job type so far: ' + p.category);
  if (p.title) lines.push('Current title: ' + p.title);
  if (p.description) lines.push('Current description: ' + p.description);
  lines.push('Contractor\'s notes: ' + (req.notes || '(none — rely on the photos and the details above)'));
  lines.push('Tone: ' + (req.tone || 'professional'));
  lines.push('');
  lines.push('Write the copy for this before-and-after post:');
  lines.push('- title: 2-6 words, headline style (it is printed large on the graphic).');
  lines.push('- description: 1-3 sentences under 220 characters: what was done and why it matters to the homeowner.');
  lines.push('- category: a short job type.');
  lines.push('- caption: 2-4 short paragraphs for Instagram/Facebook, up to 3 emojis, ending with an invitation to get in touch. Do not include a phone number, website or hashtags — the app adds those.');
  lines.push('- hashtags: 8-12 relevant hashtags, each starting with #, lowercase, including the trade, the job type and the town if known.');
  return lines.join('\n');
}

// Writes a title, description, caption and hashtags from a few words of notes and (optionally) the photos.
function aiWrite_(req) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('AI writing is off. Add your Claude API key (ANTHROPIC_API_KEY) to the Google script — see the setup guide.');
  var model = props.getProperty('CLAUDE_MODEL') || AI_DEFAULT_MODEL;

  var content = [];
  (req.images || []).slice(0, 2).forEach(function (img) {
    content.push({ type: 'text', text: (img.label || 'Job') + ' photo:' });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mime || 'image/jpeg', data: img.data } });
  });
  content.push({ type: 'text', text: aiPrompt_(req) });

  var body = {
    model: model,
    max_tokens: 8000,
    system: AI_SYSTEM,
    messages: [{ role: 'user', content: content }],
    output_config: { format: { type: 'json_schema', schema: AI_SCHEMA } },
  };
  var headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  // Short copy doesn't need deep reasoning: low effort keeps it fast and cheap (Haiku doesn't take effort).
  if (!/haiku/.test(model)) body.output_config.effort = 'low';
  // If the model declines, let the API retry on its recommended fallback model instead of failing.
  if (model === 'claude-opus-5' || model === 'claude-fable-5-1') {
    body.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', headers: headers,
    payload: JSON.stringify(body), muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var data = parse_(res.getContentText());
  if (code !== 200) {
    var msg = (data && data.error && data.error.message) || ('Claude API error ' + code);
    if (code === 401) msg = 'Your Claude API key was rejected. Check ANTHROPIC_API_KEY in the Google script.';
    if (code === 429 || code === 529) msg = 'Claude is busy right now. Try again in a minute.';
    throw new Error(msg);
  }
  if (data.stop_reason === 'refusal') throw new Error('Claude declined to write this one. Try rewording your notes.');
  if (data.stop_reason === 'max_tokens') throw new Error('The AI reply was cut off. Please try again.');
  var text = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  var copy = parse_(text);
  if (!copy) throw new Error('Could not read the AI reply. Please try again.');
  return { copy: copy, model: data.model };
}

/** Run this once from the editor after adding ANTHROPIC_API_KEY to check AI writing works. */
function testAi() {
  var out = aiWrite_({
    notes: 'swapped old 100 amp fuse box for a 200 amp breaker panel, added whole-house surge protector',
    tone: 'friendly',
    client: { name: 'Test Electric', trade: 'Electrical', serviceArea: 'Chester County, PA' },
    project: { location: 'West Chester, PA' },
  });
  Logger.log(JSON.stringify(out, null, 2));
}

// ---------------------------------------------------------------- place names

// Turns coordinates into "Town, ST" with Google's geocoder (no street address is returned to the app).
function geocode_(req) {
  var r = Maps.newGeocoder().reverseGeocode(Number(req.lat), Number(req.lon));
  var city = '', region = '', county = '';
  ((r && r.results) || []).forEach(function (res) {
    (res.address_components || []).forEach(function (c) {
      if (!city && (c.types.indexOf('locality') >= 0 || c.types.indexOf('postal_town') >= 0)) city = c.long_name;
      if (!region && c.types.indexOf('administrative_area_level_1') >= 0) region = c.short_name;
      if (!county && c.types.indexOf('administrative_area_level_2') >= 0) county = c.long_name;
    });
  });
  return { place: [city || county, region].filter(Boolean).join(', ') };
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
