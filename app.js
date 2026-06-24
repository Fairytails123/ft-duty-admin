// Fairy Tails — Duty Admin (vanilla JS PWA). Talks only to the n8n Admin API, which writes the derived sheet.
const API = 'https://ftmanager.app.n8n.cloud/webhook/ft-duty-admin';
const BOT = 'FTDuties_bot';
const TOKEN_KEY = 'ft_admin_token';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ROLES = ['Core Day Care', 'Groomer', 'Dog Trainer', 'Manager'];

const state = { token: localStorage.getItem(TOKEN_KEY) || '', data: null, week: '' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) { if (k === 'dataset') Object.assign(e.dataset, props[k]); else e[k] = props[k]; }
  for (const k of kids) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return e;
}
function field(label, input) { return el('div', { className: 'field' }, el('div', { className: 'lbl' }, label), input); }
function toast(msg, isErr) { const t = $('#toast'); t.textContent = msg; t.className = 'toast ' + (isErr ? 'err' : 'ok'); t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600); }

async function api(action, payload) {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: state.token, action, payload: payload || {} }) });
  let json; try { json = await res.json(); } catch (e) { json = {}; }
  if (json && json.ok === false && json.error === 'unauthorized') { signOut('Token rejected — please re-enter.'); throw new Error('unauthorized'); }
  return json;
}

function mondayOf(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(12, 0, 0, 0); return x; }
function ymd(d) { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }

function showGate() { $('#gate').hidden = false; $('#main').hidden = true; $('#signout').hidden = true; }
function showMain() { $('#gate').hidden = true; $('#main').hidden = false; $('#signout').hidden = false; }
function signOut(msg) { state.token = ''; localStorage.removeItem(TOKEN_KEY); showGate(); if (msg) { const e = $('#gateErr'); e.textContent = msg; e.hidden = false; } }

async function boot() {
  try {
    const r = await api('bootstrap');
    if (!r || r.ok !== true) throw new Error('bad');
    state.data = r;
    showMain();
    if (!state.week) state.week = ymd(mondayOf(new Date()));
    $('#week').value = state.week;
    renderAll();
  } catch (e) { if (e.message !== 'unauthorized') signOut('Could not connect. Check the token and try again.'); }
}
async function refresh() { const r = await api('bootstrap'); if (r && r.ok) { state.data = r; renderAll(); } }
function renderAll() { renderRota(); renderReminders(); renderStaff(); renderRiskDogs(); }

// ---------- Rota ----------
function activeStaff() { return (state.data.staff || []).filter(s => String(s.active).toLowerCase() === 'y'); }
function shortPatternLabel(p) {
  // The staff name/role is already shown on the row; drop the redundant role prefix
  // ("Core - 07:45 start" -> "07:45 start", "Groomer - AM cover" -> "AM cover").
  const lbl = String(p.label || p.pattern_id || '');
  const i = lbl.indexOf(' - ');
  return i > -1 ? lbl.slice(i + 3) : lbl;
}
function patternOptions() {
  const ps = (state.data.patterns || []).map(p => ({ id: p.pattern_id, label: shortPatternLabel(p) }));
  if (!ps.some(p => p.id === 'off')) ps.push({ id: 'off', label: 'Off / not on duty' });
  return ps;
}
function rotaFor(week) { const m = {}; (state.data.rota || []).filter(r => String(r.week_commencing) === week).forEach(r => { m[r.staff_id] = r.pattern_id; }); return m; }
function patternById() { const m = {}; (state.data.patterns || []).forEach(p => { m[p.pattern_id] = p; }); return m; }
function renderRota() {
  const wrap = $('#rotaList'); wrap.innerHTML = '';
  const assigned = rotaFor(state.week);
  const opts = patternOptions();
  const staff = activeStaff();
  if (!staff.length) { wrap.append(el('p', { className: 'muted' }, 'No active staff yet.')); }
  else staff.forEach(s => {
    const sel = el('select', { className: 'sel' }); sel.dataset.staff = s.staff_id;
    opts.forEach(o => { const op = el('option', { value: o.id }, o.label); if ((assigned[s.staff_id] || 'off') === o.id) op.selected = true; sel.append(op); });
    sel.onchange = updateRotaStatus;
    wrap.append(el('div', { className: 'item' }, el('div', { className: 'item-main' }, el('strong', null, s.name || s.staff_id), el('span', { className: 'muted small' }, s.staff_id)), sel));
  });
  updateRotaStatus();
  renderRotaPanel();
}
// Saved-state badge: compare on-screen selects vs the saved rota for this week (missing => 'off').
function rotaDirty() {
  if (!state.data) return false;
  const saved = rotaFor(state.week);
  const sels = $$('#rotaList select');
  if (!sels.length) return false;
  return sels.some(sel => sel.value !== (saved[sel.dataset.staff] || 'off'));
}
function updateRotaStatus() {
  const b = $('#rotaStatus'); if (!b) return;
  if (rotaDirty()) { b.textContent = '● Unsaved changes'; b.className = 'savebadge dirty'; }
  else { b.textContent = '✓ Saved'; b.className = 'savebadge saved'; }
}
function guardLeaveWeek() { return !rotaDirty() || confirm('You have unsaved rota changes for week ' + state.week + '. Discard them and switch week?'); }
// Read-only printable roster for the SAVED rota of the selected week (one week only).
function fmtRange(p) { const a = String(p && p.daycare_start || '').trim(), b = String(p && p.daycare_end || '').trim(); return (a && b) ? (a + '–' + b) : ''; }
function weekSpanLabel(wk) {
  const pp = String(wk).split('-'); if (pp.length !== 3) return wk;
  const y = +pp[0], m = +pp[1], d = +pp[2];
  const mon = new Date(y, m - 1, d), sun = new Date(y, m - 1, d + 6); // local dates, +6 = Sunday
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return 'w/c ' + DOW[mon.getDay()] + ' ' + mon.getDate() + ' ' + M[mon.getMonth()] + ' – ' + DOW[sun.getDay()] + ' ' + sun.getDate() + ' ' + M[sun.getMonth()];
}
function renderRotaPanel() {
  const body = $('#rotaPrintBody'); if (!body) return;
  const lbl = $('#rotaPanelWeek'); if (lbl) lbl.textContent = weekSpanLabel(state.week);
  body.replaceChildren();
  const assigned = rotaFor(state.week);
  const pm = patternById();
  const staff = activeStaff();
  if (!staff.length) { body.append(el('p', { className: 'muted' }, 'No active staff.')); return; }
  const table = el('div', { className: 'roster' });
  staff.forEach(s => {
    const pid = assigned[s.staff_id] || 'off';
    const p = pm[pid];
    const isOff = pid === 'off' || !p;
    table.append(el('div', { className: 'roster-row' + (isOff ? ' off' : '') },
      el('span', { className: 'r-name' }, s.name || s.staff_id),
      el('span', { className: 'r-role' }, s.role || ''),
      el('span', { className: 'r-pat' }, isOff ? 'Off' : shortPatternLabel(p)),
      el('span', { className: 'r-time' }, isOff ? '—' : (fmtRange(p) || '—'))));
  });
  body.append(table);
}
async function saveRota() {
  const assignments = $$('#rotaList select').map(sel => ({ staff_id: sel.dataset.staff, pattern_id: sel.value }));
  const btn = $('#saveRota'); btn.disabled = true;
  try { const r = await api('saveRota', { week_commencing: state.week, assignments }); if (r.ok) { toast('Rota saved for week ' + state.week); await refresh(); } else toast('Save failed', true); }
  catch (e) { if (e.message !== 'unauthorized') toast('Save failed', true); }
  finally { btn.disabled = false; }
}

// ---------- Condition builder ----------
function mkSelect(options, value) {
  const s = el('select', { className: 'sel' });
  options.forEach(o => { const op = el('option', { value: o.v }, o.label); if (String(value) === String(o.v)) op.selected = true; s.append(op); });
  return s;
}
function parseCondition(str) {
  str = String(str || '').trim(); if (!str) return [];
  return str.split(';').map(c => c.trim()).filter(Boolean).map(c => {
    const i = c.indexOf(':'); if (i < 0) return null;
    const kind = c.slice(0, i).trim().toLowerCase();
    const arg = c.slice(i + 1).trim();
    if (kind === 'onduty') {
      if (/^count/i.test(arg)) { const m = arg.slice(5).match(/^(>=|<=|>|<|=)?\s*(\d+)/); return { kind: 'onduty', sub: 'count', op: (m && m[1]) || '>=', val: (m && m[2]) || '1' }; }
      const eq = arg.indexOf('='); return { kind: 'onduty', sub: eq > -1 ? arg.slice(0, eq).trim().toLowerCase() : 'role', val: eq > -1 ? arg.slice(eq + 1).trim() : '' };
    }
    if (kind === 'date') {
      if (arg.toLowerCase() === 'last-working-day') return { kind: 'date', sub: 'last-working-day' };
      const eq = arg.indexOf('='); return { kind: 'date', sub: eq > -1 ? arg.slice(0, eq).trim().toLowerCase() : 'dom', val: eq > -1 ? arg.slice(eq + 1).trim() : '' };
    }
    if (kind === 'dog') return { kind: 'dog', val: arg };
    return { kind, val: arg };
  }).filter(Boolean);
}
function conditionBuilder(initialStr) {
  const rowsWrap = el('div', { className: 'cond-rows' });
  const rowObjs = [];
  function addRow(clause) {
    const typeSel = mkSelect([{ v: 'onduty', label: 'On duty' }, { v: 'date', label: 'Date' }, { v: 'dog', label: 'Dog in today' }], clause ? clause.kind : 'onduty');
    const paramWrap = el('div', { className: 'cond-params' });
    const rm = el('button', { className: 'ghost small', type: 'button', title: 'Remove' }, '✕');
    const obj = { typeSel, ctrls: {} };
    function renderParams(cl) {
      paramWrap.innerHTML = ''; obj.ctrls = {};
      const t = typeSel.value;
      if (t === 'onduty') {
        const sub = mkSelect([{ v: 'role', label: 'Role' }, { v: 'staff', label: 'Specific person' }, { v: 'pattern', label: 'Shift pattern' }, { v: 'count', label: 'How many on' }], cl ? cl.sub : 'role');
        obj.ctrls.sub = sub; paramWrap.append(sub);
        const valWrap = el('span', { className: 'cond-val' }); paramWrap.append(valWrap);
        const renderVal = (c) => {
          valWrap.innerHTML = '';
          if (sub.value === 'role') { const v = mkSelect(ROLES.map(r => ({ v: r, label: r })), c ? c.val : ''); obj.ctrls.val = v; valWrap.append(v); }
          else if (sub.value === 'staff') { const v = mkSelect((state.data.staff || []).map(s => ({ v: s.staff_id, label: s.name || s.staff_id })), c ? c.val : ''); obj.ctrls.val = v; valWrap.append(v); }
          else if (sub.value === 'pattern') { const v = mkSelect(patternOptions().map(p => ({ v: p.id, label: p.label })), c ? c.val : ''); obj.ctrls.val = v; valWrap.append(v); }
          else { const op = mkSelect([{ v: '>=', label: 'at least' }, { v: '>', label: 'more than' }, { v: '=', label: 'exactly' }, { v: '<=', label: 'at most' }, { v: '<', label: 'fewer than' }], c ? c.op : '>='); const num = el('input', { type: 'number', min: '1', value: (c && c.val) || '1', className: 'num' }); obj.ctrls.op = op; obj.ctrls.val = num; valWrap.append(op, num); }
        };
        renderVal(cl && cl.sub === sub.value ? cl : null);
        sub.onchange = () => renderVal(null);
      } else if (t === 'date') {
        const sub = mkSelect([{ v: 'dom', label: 'Day of month' }, { v: 'nth', label: 'Nth weekday' }, { v: 'on', label: 'Specific date' }, { v: 'last-working-day', label: 'Last working day' }], cl ? cl.sub : 'dom');
        obj.ctrls.sub = sub; paramWrap.append(sub);
        const valWrap = el('span', { className: 'cond-val' }); paramWrap.append(valWrap);
        const renderVal = (c) => {
          valWrap.innerHTML = '';
          if (sub.value === 'dom') { const v = el('input', { type: 'number', min: '1', max: '31', value: (c && c.val) || '1', className: 'num' }); obj.ctrls.val = v; valWrap.append(v); }
          else if (sub.value === 'on') { const v = el('input', { type: 'date', value: (c && c.val) || '' }); obj.ctrls.val = v; valWrap.append(v); }
          else if (sub.value === 'nth') { const parts = (c && c.val ? c.val : '1-Mon').split('-'); const n = mkSelect([1, 2, 3, 4, 5].map(x => ({ v: String(x), label: '#' + x })), parts[0]); const wd = mkSelect(DAYS.map(d => ({ v: d, label: d })), parts[1] || 'Mon'); obj.ctrls.n = n; obj.ctrls.wd = wd; valWrap.append(n, wd); }
        };
        renderVal(cl && cl.sub === sub.value ? cl : null);
        sub.onchange = () => renderVal(null);
      } else {
        const dogs = (state.data.riskDogs || []).filter(d => String(d.active || 'y').toLowerCase() !== 'n').map(d => ({ v: d.dog_name, label: d.dog_name }));
        const v = dogs.length ? mkSelect(dogs, cl ? cl.val : '') : el('input', { placeholder: 'Add a dog in the Risk Dogs tab first', value: cl ? cl.val : '' });
        obj.ctrls.val = v; paramWrap.append(v);
      }
    }
    typeSel.onchange = () => renderParams(null);
    renderParams(clause);
    rm.onclick = () => { const i = rowObjs.indexOf(obj); if (i > -1) rowObjs.splice(i, 1); row.remove(); };
    const row = el('div', { className: 'cond-row' }, typeSel, paramWrap, rm);
    rowsWrap.append(row); rowObjs.push(obj);
  }
  parseCondition(initialStr).forEach(addRow);
  const add = el('button', { className: 'ghost small', type: 'button' }, '+ Add condition');
  add.onclick = () => addRow(null);
  const wrap = el('div', { className: 'cond-builder' }, el('div', { className: 'lbl' }, 'Only fire when ALL of these are true (optional)'), rowsWrap, add);
  function serialize() {
    const parts = [];
    rowObjs.forEach(o => {
      const t = o.typeSel.value;
      if (t === 'onduty') {
        const sub = o.ctrls.sub.value;
        if (sub === 'count') { const n = parseInt(o.ctrls.val.value, 10); if (!isNaN(n)) parts.push('onduty:count' + o.ctrls.op.value + n); }
        else { const v = (o.ctrls.val.value || '').trim(); if (v) parts.push('onduty:' + sub + '=' + v); }
      } else if (t === 'date') {
        const sub = o.ctrls.sub.value;
        if (sub === 'last-working-day') parts.push('date:last-working-day');
        else if (sub === 'nth') parts.push('date:nth=' + o.ctrls.n.value + '-' + o.ctrls.wd.value);
        else { const v = (o.ctrls.val.value || '').trim(); if (v) parts.push('date:' + sub + '=' + v); }
      } else { const v = (o.ctrls.val.value || '').trim(); if (v) parts.push('dog:' + v); }
    });
    return parts.join(';');
  }
  return { wrap, serialize };
}

// ---------- Reminders ----------
function parseDays(spec) {
  spec = String(spec || '').trim(); if (!spec) return DAYS.slice(0, 5);
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const map = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const low = spec.toLowerCase(); if (low === 'daily' || low === 'all') return DAYS.slice();
  const out = [];
  spec.split(',').forEach(part => {
    part = part.trim();
    if (part.includes('-')) {
      const ab = part.split('-').map(x => x.trim().slice(0, 3).toLowerCase());
      let i = order.indexOf(ab[0]), j = order.indexOf(ab[1]);
      if (i > -1 && j > -1) { for (let k = i; ; k = (k + 1) % 7) { out.push(map[order[k]]); if (k === j) break; } }
    } else { const m = map[part.slice(0, 3).toLowerCase()]; if (m && !out.includes(m)) out.push(m); }
  });
  return out;
}
function remCard(r, archived) {
  r = r || { reminder_id: '', title: '', message: '', time: '', days: 'Mon-Fri', condition: '', requires_done: 'n', done_window_mins: '30', active: 'y' };
  archived = !!archived;
  const title = el('input', { value: r.title || '', placeholder: 'e.g. Lunchtime medication check' });
  const msg = el('textarea', { value: r.message || '', placeholder: 'Message sent to staff', rows: 2 });
  const time = el('input', { type: 'time', value: r.time || '' });
  const dwin = el('input', { type: 'number', min: '1', value: r.done_window_mins || '30', className: 'num' });
  const dayWrap = el('div', { className: 'days' });
  const sel = new Set(parseDays(r.days)); const boxes = {};
  DAYS.forEach(d => { const cb = el('input', { type: 'checkbox', checked: sel.has(d) }); boxes[d] = cb; dayWrap.append(el('label', { className: 'chip' }, cb, d)); });
  const reqd = el('input', { type: 'checkbox', checked: String(r.requires_done).toLowerCase() === 'y' });
  const cond = conditionBuilder(r.condition || '');
  // Read this card's live on-screen values (shared by Save / Archive / Duplicate).
  function collect() {
    const days = DAYS.filter(d => boxes[d].checked).join(',');
    return { reminder_id: r.reminder_id, title: title.value.trim(), message: msg.value.trim(), time: time.value, days, condition: cond.serialize(), requires_done: reqd.checked ? 'y' : 'n', done_window_mins: String(dwin.value || '30') };
  }
  async function save(activeVal, btn) {
    const payload = collect(); payload.active = activeVal;
    if (!payload.title || !payload.time) { toast('Title and time are required', true); return; }
    btn.disabled = true;
    try { const res = await api('saveReminder', payload); if (res.ok) { toast('Reminder saved'); await refresh(); } else toast('Save failed', true); }
    catch (e) { if (e.message !== 'unauthorized') toast('Save failed', true); }
    finally { btn.disabled = false; }
  }
  const saveBtn = el('button', { className: 'primary small' }, 'Save');
  const dup = el('button', { className: 'ghost small', title: 'Make a copy to tweak' }, 'Duplicate');
  const arch = el('button', { className: 'ghost small' }, archived ? 'Restore' : 'Archive');
  const card = el('div', { className: 'card rem' },
    el('div', { className: 'rem-grid' }, field('Title', title), field('Time', time), field('Done window (mins)', dwin)),
    field('Message', msg),
    el('div', { className: 'rem-row' },
      el('div', null, el('div', { className: 'lbl' }, 'Days'), dayWrap),
      el('label', { className: 'switch' }, reqd, el('span', null, 'Requires "Done"'))),
    cond.wrap,
    el('div', { className: 'row spread' }, el('span', { className: 'muted small' }, r.reminder_id || '(new)'), el('div', { className: 'row' }, dup, arch, saveBtn))
  );
  saveBtn.onclick = () => save(archived ? 'n' : 'y', saveBtn);
  arch.onclick = () => save(archived ? 'y' : 'n', arch);
  dup.onclick = () => { const copy = collect(); copy.reminder_id = ''; card.after(remCard(copy, false)); toast('Duplicated — change the time and Save'); };
  return card;
}
function renderReminders() {
  renderSyncStatus();
  const wrap = $('#remList'); wrap.innerHTML = '';
  const list = state.data.reminders || [];
  const live = list.filter(r => String(r.active).toLowerCase() === 'y');
  const arch = list.filter(r => String(r.active).toLowerCase() !== 'y');
  if (!live.length && !arch.length) { wrap.append(el('p', { className: 'muted' }, 'No reminders yet — add one.')); return; }
  if (!live.length) wrap.append(el('p', { className: 'muted' }, 'No active reminders — add one or restore an archived one.'));
  else live.forEach(r => wrap.append(remCard(r, false)));
  if (arch.length) {
    const inner = el('div', { className: 'list' });
    arch.forEach(r => inner.append(remCard(r, true)));
    wrap.append(el('details', { className: 'archived' }, el('summary', null, 'Show archived (' + arch.length + ')'), inner));
  }
}
// Distinct HH:MM of active reminders — what the engine schedule should fire at.
function distinctActiveTimes() {
  const set = {};
  (state.data.reminders || []).forEach(r => {
    if (String(r.active).toLowerCase() !== 'y') return;
    const pp = String(r.time || '').trim().split(':');
    if (pp.length < 2) return;
    const h = parseInt(pp[0], 10), mi = parseInt(pp[1], 10);
    if (isNaN(h) || isNaN(mi)) return;
    set[(h < 10 ? '0' + h : '' + h) + ':' + (mi < 10 ? '0' + mi : '' + mi)] = true;
  });
  return Object.keys(set).sort();
}
function renderSyncStatus() {
  const box = $('#syncStatus'); if (!box) return;
  const times = distinctActiveTimes();
  box.textContent = times.length ? ('Active times: ' + times.join(', ')) : 'No active reminders.';
}
// Push the distinct active reminder times to n8n's engine cron (Approach B — manual button).
async function syncSchedule() {
  const btn = $('#syncSched'); const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Syncing…';
  try {
    const r = await api('syncSchedule', {});
    if (r && r.ok) {
      const n = r.count || 0, times = (r.times || []).join(', ');
      if (r.no_active) toast('No active reminders — engine schedule left unchanged.');
      else if (r.changed === false) toast('Already in sync — ' + n + ' time' + (n === 1 ? '' : 's') + (times ? ' (' + times + ')' : '') + '.');
      else toast('Schedule synced — ' + n + ' time' + (n === 1 ? '' : 's') + (times ? ' (' + times + ')' : '') + '.');
    } else { toast('Sync failed', true); }
  } catch (e) { if (e.message !== 'unauthorized') toast('Sync failed — check n8n', true); }
  finally { btn.disabled = false; btn.textContent = label; }
}

// ---------- Staff ----------
function staffCard(s) {
  const name = el('input', { value: s.name || '' });
  const role = el('select', null); ROLES.forEach(R => { const o = el('option', { value: R }, R); if (s.role === R) o.selected = true; role.append(o); });
  const act = el('input', { type: 'checkbox', checked: String(s.active).toLowerCase() === 'y' });
  const onboarded = String(s.telegram_chat_id || '').trim() !== '';
  const link = 'https://t.me/' + BOT + '?start=' + s.staff_id;
  const copy = el('button', { className: 'ghost small' }, 'Copy onboarding link');
  copy.onclick = () => { navigator.clipboard.writeText(link).then(() => toast('Onboarding link copied')); };
  const save = el('button', { className: 'primary small' }, 'Save');
  save.onclick = async () => {
    save.disabled = true;
    try { const r = await api('saveStaff', { staff_id: s.staff_id, name: name.value.trim(), role: role.value, active: act.checked ? 'y' : 'n' }); if (r.ok) { toast('Staff saved'); await refresh(); } else toast('Save failed', true); }
    catch (e) { if (e.message !== 'unauthorized') toast('Save failed', true); }
    finally { save.disabled = false; }
  };
  return el('div', { className: 'card staff' },
    el('div', { className: 'row spread' }, el('strong', null, s.staff_id), el('span', { className: 'badge ' + (onboarded ? 'on' : 'off') }, onboarded ? 'Onboarded' : 'Not onboarded')),
    el('div', { className: 'rem-grid' }, field('Name', name), field('Role', role)),
    el('div', { className: 'row spread' }, el('label', { className: 'switch' }, act, el('span', null, 'Active')), el('div', { className: 'row' }, copy, save))
  );
}
function renderStaff() { const wrap = $('#staffList'); wrap.innerHTML = ''; (state.data.staff || []).forEach(s => wrap.append(staffCard(s))); }

// ---------- Risk Dogs ----------
function riskCard(d, archived) {
  d = d || { dog_name: '', in_today: 'n', risk_notes: '', active: 'y' };
  archived = !!archived;
  const isNew = !d.dog_name;
  const name = el('input', { value: d.dog_name || '', placeholder: 'Dog name (e.g. Bella)' });
  if (!isNew) name.disabled = true; // name is the key; rename = add new
  const inToday = el('input', { type: 'checkbox', checked: String(d.in_today).toLowerCase() === 'y' });
  const notes = el('textarea', { value: d.risk_notes || '', rows: 2, placeholder: 'Risk notes (e.g. muzzle before group play)' });
  function collect() { return { dog_name: name.value.trim(), in_today: inToday.checked ? 'y' : 'n', risk_notes: notes.value.trim() }; }
  async function save(payload, btn) {
    if (!payload.dog_name) { toast('Dog name required', true); return; }
    btn.disabled = true;
    try { const r = await api('saveRiskDog', payload); if (r.ok) { toast('Risk dog saved'); await refresh(); } else toast('Save failed', true); }
    catch (e) { if (e.message !== 'unauthorized') toast('Save failed', true); }
    finally { btn.disabled = false; }
  }
  const saveBtn = el('button', { className: 'primary small' }, 'Save');
  const dup = el('button', { className: 'ghost small', title: 'Copy notes to a new dog' }, 'Duplicate');
  const arch = el('button', { className: 'ghost small' }, archived ? 'Restore' : 'Archive');
  const card = el('div', { className: 'card' },
    field('Dog name', name),
    el('div', { className: 'rem-row' }, el('label', { className: 'switch' }, inToday, el('span', null, 'In today')), el('span', { className: 'muted small' }, 'Use condition dog:' + (d.dog_name || '<name>') + ' on a reminder')),
    field('Risk notes', notes),
    el('div', { className: 'row spread' }, el('span', { className: 'muted small' }, isNew ? '(new)' : d.dog_name), el('div', { className: 'row' }, dup, arch, saveBtn))
  );
  saveBtn.onclick = () => { const p = collect(); p.active = archived ? 'n' : 'y'; save(p, saveBtn); };
  arch.onclick = () => { const p = collect(); if (archived) { p.active = 'y'; } else { p.active = 'n'; p.in_today = 'n'; } save(p, arch); };
  dup.onclick = () => { const c = collect(); card.after(riskCard({ dog_name: '', in_today: c.in_today, risk_notes: c.risk_notes, active: 'y' }, false)); toast('Duplicated — enter a new name and Save'); };
  return card;
}
function renderRiskDogs() {
  const wrap = $('#riskList'); wrap.innerHTML = '';
  const list = state.data.riskDogs || [];
  const vis = list.filter(d => String(d.active || 'y').toLowerCase() !== 'n');
  const arch = list.filter(d => String(d.active || 'y').toLowerCase() === 'n');
  if (!vis.length && !arch.length) { wrap.append(el('p', { className: 'muted' }, 'No risk dogs yet — add one.')); return; }
  if (!vis.length) wrap.append(el('p', { className: 'muted' }, 'No active risk dogs — add one or restore an archived one.'));
  else vis.forEach(d => wrap.append(riskCard(d, false)));
  if (arch.length) {
    const inner = el('div', { className: 'list' });
    arch.forEach(d => inner.append(riskCard(d, true)));
    wrap.append(el('details', { className: 'archived' }, el('summary', null, 'Show archived (' + arch.length + ')'), inner));
  }
}

// ---------- chrome ----------
function setupTabs() {
  $$('.tab').forEach(t => t.onclick = () => {
    $$('.tab').forEach(x => x.classList.remove('active')); t.classList.add('active');
    const id = t.dataset.tab; ['rota', 'reminders', 'staff', 'riskdogs'].forEach(p => { $('#tab-' + p).hidden = (p !== id); });
  });
}
function setWeek(v) { state.week = v; $('#week').value = v; renderRota(); }
function shiftWeek(days) { const d = new Date(state.week + 'T12:00:00'); d.setDate(d.getDate() + days); setWeek(ymd(mondayOf(d))); }

window.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  $('#enter').onclick = () => { const v = $('#token').value.trim(); if (!v) return; state.token = v; localStorage.setItem(TOKEN_KEY, v); $('#gateErr').hidden = true; boot(); };
  $('#token').addEventListener('keydown', e => { if (e.key === 'Enter') $('#enter').click(); });
  $('#signout').onclick = () => signOut();
  $('#saveRota').onclick = saveRota;
  $('#addRem').onclick = () => $('#remList').prepend(remCard());
  $('#syncSched').onclick = syncSchedule;
  $('#addRisk').onclick = () => $('#riskList').prepend(riskCard());
  $('#weekPrev').onclick = () => { if (guardLeaveWeek()) shiftWeek(-7); };
  $('#weekNext').onclick = () => { if (guardLeaveWeek()) shiftWeek(7); };
  $('#week').onchange = () => { if (guardLeaveWeek()) setWeek(ymd(mondayOf($('#week').value + 'T12:00:00'))); else $('#week').value = state.week; };
  $('#printRota').onclick = () => window.print();
  window.addEventListener('beforeunload', e => { if (state.data && rotaDirty()) { e.preventDefault(); e.returnValue = ''; } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (state.token) boot(); else showGate();
});
