/* ==========================================================================
   TASK MANAGER
   Works out-of-the-box with localStorage. Fill in the two Supabase values
   below to sync your tasks to the cloud (see the setup steps Darshan was given).
   ========================================================================== */

// ---- 1. SUPABASE CONFIG (leave blank to use this device's local storage) ----
const SUPABASE_URL = 'https://ifcurfhhzzpdvxuyobwo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lhiOaS0ToPQA4s8P3YS0qg_nh4G6Jmc'; // publishable key (safe for browser)

// ---------------------------------------------------------------------------

const TYPE_LABELS = {
    website_change: 'Website Change',
    maintenance: 'Maintenance',
    seo_fix: 'Technical SEO',
    bug: 'Bug Fix',
    content: 'Content',
    other: 'Other'
};

const PRIORITY_COLORS = {
    low: '#64748b', medium: '#3b82f6', high: '#f59e0b', urgent: '#ef4444'
};

const DEFAULT_BRANDS = [
    { name: 'Nif Kondhwa', color: '#22c55e' },
    { name: 'Creed', color: '#f59e0b' },
    { name: 'Hovers', color: '#06b6d4' },
    { name: 'Tupperware India', color: '#e11d48' },
    { name: 'Tupperware Malaysia', color: '#ec4899' },
    { name: 'Total Comfort', color: '#0ea5e9' },
    { name: 'Ease Living', color: '#14b8a6' },
    { name: 'Mind Nutrition', color: '#8b5cf6' }
];

// Old auto-seeded brands that are no longer wanted (cleaned up on load).
const RETIRED_BRANDS = ['Tupperware', 'TOUJOURS'];

// Days a task stays after being marked Done before it auto-deletes.
const AUTO_DELETE_DAYS = 2;

const BRAND_PALETTE = ['#e11d48', '#8b5cf6', '#0ea5e9', '#22c55e', '#f59e0b',
    '#06b6d4', '#ec4899', '#14b8a6', '#a855f7', '#ef4444', '#3b82f6', '#84cc16'];

// ---- State ----
let tasks = [];
let brands = [...DEFAULT_BRANDS];
let currentView = 'list';
let currentScope = 'work';            // 'work' (default) or 'personal'
let editingSubtasks = [];
let sbClient = null;
const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);

const SESSION_UNLOCK_KEY = 'tm_personal_unlocked';
function scopeOf(t) { return t.scope === 'personal' ? 'personal' : 'work'; }
function inScope(t) { return scopeOf(t) === currentScope; }

// ==========================================================================
// STORAGE LAYER (localStorage + optional Supabase)
// ==========================================================================
const LS_TASKS = 'tm_tasks';
const LS_BRANDS = 'tm_brands';

function lsLoad() {
    try {
        tasks = JSON.parse(localStorage.getItem(LS_TASKS)) || [];
        brands = JSON.parse(localStorage.getItem(LS_BRANDS)) || [];
    } catch { tasks = []; brands = []; }
    if (!brands.length) { brands = [...DEFAULT_BRANDS]; lsSaveBrands(); }
}
function lsSaveTasks() { try { localStorage.setItem(LS_TASKS, JSON.stringify(tasks)); } catch (e) { console.warn('Could not save tasks locally', e); } }
function lsSaveBrands() { try { localStorage.setItem(LS_BRANDS, JSON.stringify(brands)); } catch (e) { console.warn('Could not save brands locally', e); } }

async function storeInit() {
    if (useSupabase) {
        sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        try {
            const [{ data: b }, { data: t }] = await Promise.all([
                sbClient.from('brands').select('*').order('name'),
                sbClient.from('tasks').select('*').order('created_at', { ascending: false })
            ]);
            brands = (b && b.length) ? b : [...DEFAULT_BRANDS];
            if (!b || !b.length) { for (const br of brands) await sbClient.from('brands').insert(br); }
            await reconcileBrands();
            tasks = t || [];
            await purgeExpired();
            setConn(true);
            // live sync across devices
            sbClient.channel('tm-tasks')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refreshFromCloud)
                .subscribe();
            return;
        } catch (e) {
            console.warn('Supabase unreachable, using local storage.', e);
            toast('Could not reach Supabase — using local storage.', 'error');
        }
    }
    lsLoad();
    purgeExpiredLocal();
    setConn(false);
}

// Ensure the desired default brands exist and remove retired ones (idempotent).
async function reconcileBrands() {
    const have = new Set(brands.map(b => b.name.toLowerCase()));
    for (const def of DEFAULT_BRANDS) {
        if (!have.has(def.name.toLowerCase())) {
            await sbClient.from('brands').insert(def);
            brands.push(def);
        }
    }
    for (const name of RETIRED_BRANDS) {
        if (have.has(name.toLowerCase())) {
            await sbClient.from('brands').delete().ilike('name', name);
            brands = brands.filter(b => b.name.toLowerCase() !== name.toLowerCase());
        }
    }
}

// Delete tasks that have been Done for more than AUTO_DELETE_DAYS (cloud).
async function purgeExpired() {
    const cutoff = Date.now() - AUTO_DELETE_DAYS * 86400000;
    const expired = tasks.filter(t => t.status === 'done' && t.completed_at && new Date(t.completed_at).getTime() < cutoff);
    for (const t of expired) await sbClient.from('tasks').delete().eq('id', t.id);
    if (expired.length) tasks = tasks.filter(t => !expired.includes(t));
}

// Same purge for local-storage mode.
function purgeExpiredLocal() {
    const cutoff = Date.now() - AUTO_DELETE_DAYS * 86400000;
    const before = tasks.length;
    tasks = tasks.filter(t => !(t.status === 'done' && t.completed_at && new Date(t.completed_at).getTime() < cutoff));
    if (tasks.length !== before) lsSaveTasks();
}

async function refreshFromCloud() {
    if (!sbClient) return;
    const { data } = await sbClient.from('tasks').select('*').order('created_at', { ascending: false });
    tasks = data || [];
    render();
}

// Columns that may not exist yet in older Supabase tables.
const OPTIONAL_COLS = ['completed_at', 'remarks', 'scope'];
async function persistTask(task, isNew) {
    if (!sbClient) { lsSaveTasks(); return; }
    const run = payload => isNew
        ? sbClient.from('tasks').insert(payload)
        : sbClient.from('tasks').update(payload).eq('id', task.id);
    let { error } = await run(task);
    if (error && /(column|schema cache|does not exist)/i.test(error.message || '')) {
        // Personal tasks need the `scope` column to stay hidden from work view —
        // refuse the save rather than strip scope and leak the task.
        if (task.scope === 'personal' && /scope/i.test(error.message || '')) {
            toast('Personal mode needs the `scope` column in Supabase. See CLAUDE.md.', 'error');
            return;
        }
        // A newer column isn't in the table yet — save without the optional ones.
        const rest = { ...task };
        OPTIONAL_COLS.forEach(c => delete rest[c]);
        ({ error } = await run(rest));
        if (!error) toast('Saved. Run the SQL migrations in CLAUDE.md to add new columns.', 'error');
    }
    if (error) { console.error('Supabase write failed', error); toast('Could not save: ' + error.message, 'error'); }
}
async function deleteTaskStore(id) {
    if (sbClient) await sbClient.from('tasks').delete().eq('id', id);
    else lsSaveTasks();
}
async function persistBrand(brand) {
    if (sbClient) await sbClient.from('brands').insert(brand);
    else lsSaveBrands();
}

// ==========================================================================
// HELPERS
// ==========================================================================
const $ = id => document.getElementById(id);
function uid() { return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7); }
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
function brandColor(name) { const b = brands.find(x => x.name === name); return b ? b.color : '#555'; }
function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } }

function dueInfo(due) {
    if (!due) return { cls: '', label: '' };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(due + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (diff < 0) return { cls: 'overdue', label: label + ' (overdue)' };
    if (diff === 0) return { cls: 'soon', label: 'Today' };
    if (diff === 1) return { cls: 'soon', label: 'Tomorrow' };
    if (diff <= 3) return { cls: 'soon', label: label };
    return { cls: '', label };
}

// ==========================================================================
// FILTERS + SORT
// ==========================================================================
function getFiltered() {
    const q = $('searchInput').value.trim().toLowerCase();
    const fb = $('filterBrand').value, ft = $('filterType').value, fp = $('filterPriority').value;
    let list = tasks.filter(t => {
        if (!inScope(t)) return false;
        if (fb && t.brand !== fb) return false;
        if (ft && t.task_type !== ft) return false;
        if (fp && t.priority !== fp) return false;
        if (q) {
            const hay = `${t.title} ${t.brand} ${t.details || ''} ${t.url || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    const sort = $('sortBy').value;
    const prioRank = { urgent: 0, high: 1, medium: 2, low: 3 };
    list.sort((a, b) => {
        if (sort === 'due') return (a.due_date || '9999').localeCompare(b.due_date || '9999');
        if (sort === 'priority') return prioRank[a.priority] - prioRank[b.priority];
        if (sort === 'brand') return (a.brand || '').localeCompare(b.brand || '');
        return (b.created_at || '').localeCompare(a.created_at || '');
    });
    return list;
}

// ==========================================================================
// RENDER
// ==========================================================================
function render() {
    renderStats();
    renderBrandFilter();
    if (currentView === 'board') renderBoard(); else renderList();
}

function renderStats() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const scoped = tasks.filter(inScope);
    const overdue = scoped.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date + 'T00:00:00') < today).length;
    $('statTotal').textContent = scoped.length;
    $('statProgress').textContent = scoped.filter(t => t.status === 'in_progress').length;
    $('statDone').textContent = scoped.filter(t => t.status === 'done').length;
    $('statOverdue').textContent = overdue;
}

function cardHTML(t) {
    const subs = t.subtasks || [];
    const doneSubs = subs.filter(s => s.done).length;
    const di = dueInfo(t.due_date);
    const meta = [`<span class="tm-type-tag">${TYPE_LABELS[t.task_type] || 'Other'}</span>`];
    if (subs.length) meta.push(`<span class="tm-meta-chip">${doneSubs}/${subs.length}</span>`);
    if (di.label) meta.push(`<span class="tm-due ${di.cls}">${di.label}</span>`);
    return `<div class="tm-card status-${t.status}" draggable="true" data-id="${t.id}" style="--brand-color:${brandColor(t.brand)};--prio-color:${PRIORITY_COLORS[t.priority]}">
        <div class="tm-card-main">
            <div class="tm-card-line1">
                <span class="tm-prio-dot" title="${t.priority} priority"></span>
                <span class="tm-card-title">${esc(t.title)}</span>
            </div>
            <div class="tm-card-meta">
                <span class="tm-brand-badge">${esc(t.brand)}</span>
                ${meta.join('')}
            </div>
        </div>
        <div class="tm-card-right">
            <select class="tm-status-select status-${t.status}" data-id="${t.id}" title="Change status">
                <option value="todo" ${t.status === 'todo' ? 'selected' : ''}>To Do</option>
                <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                <option value="done" ${t.status === 'done' ? 'selected' : ''}>Done</option>
            </select>
            <button class="tm-icon-btn" data-act="edit" title="Edit">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="tm-icon-btn danger" data-act="del" title="Delete">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <button class="tm-icon-btn" data-act="view" title="View details">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
        </div>
    </div>`;
}

function renderBoard() {
    $('boardView').style.display = '';
    $('listView').style.display = 'none';
    const list = getFiltered();
    const cols = { todo: [], in_progress: [], done: [] };
    list.forEach(t => (cols[t.status] || cols.todo).push(t));
    const fill = (elId, arr, countId) => {
        $(countId).textContent = arr.length;
        $(elId).innerHTML = arr.length ? arr.map(cardHTML).join('')
            : `<div class="tm-empty" style="padding:24px 8px"><p>Nothing here</p></div>`;
    };
    fill('colTodo', cols.todo, 'countTodo');
    fill('colProgress', cols.in_progress, 'countProgress');
    fill('colDone', cols.done, 'countDone');
    bindCards();
    bindDnD();
}

function renderList() {
    $('boardView').style.display = 'none';
    $('listView').style.display = '';
    const list = getFiltered();
    $('listView').innerHTML = list.length ? list.map(cardHTML).join('')
        : `<div class="tm-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><p>No tasks yet. Hit “New Task” to add one.</p></div>`;
    bindCards();
}

function bindCards() {
    document.querySelectorAll('.tm-card').forEach(card => {
        const id = card.dataset.id;
        card.querySelector('[data-act="edit"]')?.addEventListener('click', e => { e.stopPropagation(); openModal(id); });
        card.querySelector('[data-act="del"]')?.addEventListener('click', e => { e.stopPropagation(); removeTask(id); });
        card.querySelector('[data-act="view"]')?.addEventListener('click', e => { e.stopPropagation(); openView(id); });
        const sel = card.querySelector('.tm-status-select');
        if (sel) {
            sel.addEventListener('click', e => e.stopPropagation());
            sel.addEventListener('change', e => { e.stopPropagation(); quickStatus(id, sel.value); });
        }
        card.addEventListener('click', () => openModal(id));
    });
}

// Set status + manage the completed_at timestamp used for auto-deletion.
function applyStatus(task, status) {
    task.status = status;
    task.completed_at = status === 'done' ? new Date().toISOString() : null;
}

async function quickStatus(id, status) {
    const t = tasks.find(x => x.id === id);
    if (!t || t.status === status) return;
    applyStatus(t, status);
    await persistTask(t, false);
    if (!sbClient) lsSaveTasks();
    render();
    const label = status === 'in_progress' ? 'In Progress' : status === 'done' ? 'Done' : 'To Do';
    toast(`Marked “${t.title}” as ${label}.`, 'success');
}

// ==========================================================================
// DRAG & DROP (board)
// ==========================================================================
let dragId = null;
function bindDnD() {
    document.querySelectorAll('.tm-card[draggable]').forEach(card => {
        card.addEventListener('dragstart', () => { dragId = card.dataset.id; card.classList.add('dragging'); });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    document.querySelectorAll('.tm-column').forEach(col => {
        col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
        col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
        col.addEventListener('drop', async e => {
            e.preventDefault();
            col.classList.remove('drag-over');
            const status = col.dataset.status;
            const t = tasks.find(x => x.id === dragId);
            if (t && t.status !== status) {
                applyStatus(t, status);
                await persistTask(t, false);
                if (!sbClient) lsSaveTasks();
                render();
                toast(`Moved to ${status.replace('_', ' ')}`, 'success');
            }
        });
    });
}

// ==========================================================================
// BRANDS
// ==========================================================================
function renderBrandFilter() {
    const fb = $('filterBrand'), keep = fb.value;
    fb.innerHTML = '<option value="">All Brands</option>' +
        brands.map(b => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');
    fb.value = keep;
}
function renderBrandSelect() {
    const fs = $('fBrand'), keep = fs.value;
    fs.innerHTML = brands.map(b => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');
    if (keep) fs.value = keep;
}
async function addBrand() {
    const name = prompt('New brand / website name:');
    if (!name || !name.trim()) return;
    const clean = name.trim();
    if (brands.some(b => b.name.toLowerCase() === clean.toLowerCase())) { toast('That brand already exists.', 'error'); return; }
    const brand = { name: clean, color: BRAND_PALETTE[brands.length % BRAND_PALETTE.length] };
    brands.push(brand);
    await persistBrand(brand);
    if (!sbClient) lsSaveBrands();
    renderBrandFilter(); renderBrandSelect();
    $('fBrand').value = clean;
    toast(`Added brand “${clean}”`, 'success');
}

// ==========================================================================
// SUBTASKS (modal)
// ==========================================================================
function renderSubtasks() {
    const wrap = $('subtaskList');
    wrap.innerHTML = editingSubtasks.map((s, i) => `
        <div class="tm-subtask-item">
            <input type="checkbox" data-i="${i}" ${s.done ? 'checked' : ''}>
            <span class="${s.done ? 'done' : ''}">${esc(s.text)}</span>
            <button type="button" class="tm-icon-btn danger" data-del="${i}">&times;</button>
        </div>`).join('');
    wrap.querySelectorAll('input[type=checkbox]').forEach(cb =>
        cb.addEventListener('change', () => { editingSubtasks[+cb.dataset.i].done = cb.checked; renderSubtasks(); }));
    wrap.querySelectorAll('[data-del]').forEach(b =>
        b.addEventListener('click', () => { editingSubtasks.splice(+b.dataset.del, 1); renderSubtasks(); }));
}
function addSubtask() {
    const inp = $('subtaskInput'); const v = inp.value.trim();
    if (!v) return;
    editingSubtasks.push({ text: v, done: false });
    inp.value = ''; inp.focus(); renderSubtasks();
}

// ==========================================================================
// MODAL
// ==========================================================================
function openModal(id) {
    const modal = $('taskModal');
    renderBrandSelect();
    if (id) {
        const t = tasks.find(x => x.id === id);
        if (!t) return;
        $('modalTitle').textContent = 'Edit Task';
        $('taskId').value = t.id;
        $('fTitle').value = t.title || '';
        $('fBrand').value = t.brand || (brands[0] && brands[0].name) || '';
        $('fType').value = t.task_type || 'website_change';
        $('fPriority').value = t.priority || 'medium';
        $('fStatus').value = t.status || 'todo';
        $('fDue').value = t.due_date || '';
        $('fUrl').value = t.url || '';
        $('fDetails').value = t.details || '';
        $('fRemarks').value = t.remarks || '';
        $('fAssigned').value = fmtDate(t.created_at || new Date().toISOString());
        editingSubtasks = (t.subtasks || []).map(s => ({ ...s }));
        $('deleteTaskBtn').style.display = '';
    } else {
        $('modalTitle').textContent = 'New Task';
        $('taskForm').reset();
        $('taskId').value = '';
        $('fBrand').value = brands[0] ? brands[0].name : '';
        $('fPriority').value = 'medium';
        $('fStatus').value = 'todo';
        $('fAssigned').value = fmtDate(new Date().toISOString());
        editingSubtasks = [];
        $('deleteTaskBtn').style.display = 'none';
    }
    renderSubtasks();
    modal.classList.add('active');
    setTimeout(() => $('fTitle').focus(), 100);
}
function closeModal() { $('taskModal').classList.remove('active'); }

// ----- Read-only details popup (eye button) -----
const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
function viewRow(label, value) {
    return `<div class="tm-view-row"><span class="tm-view-key">${label}</span><span class="tm-view-val">${value}</span></div>`;
}
function openView(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const di = dueInfo(t.due_date);
    const subs = t.subtasks || [];
    const created = t.created_at ? new Date(t.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

    const rows = [
        viewRow('Brand', `<span class="tm-brand-badge" style="background:${brandColor(t.brand)}">${esc(t.brand)}</span>`),
        viewRow('Type', esc(TYPE_LABELS[t.task_type] || 'Other')),
        viewRow('Priority', `<span style="text-transform:capitalize">${esc(t.priority)}</span>`),
        viewRow('Status', `<span class="tm-view-status status-${t.status}">${STATUS_LABELS[t.status] || esc(t.status)}</span>`),
        viewRow('Due date', di.label || 'No due date'),
        viewRow('Created', created)
    ];
    if (t.url) rows.push(viewRow('URL', `<a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" class="tm-view-link">${esc(t.url)}</a>`));

    let html = `<div class="tm-view-rows">${rows.join('')}</div>`;
    if (t.details) html += `<div class="tm-view-section"><div class="tm-view-label">Additional information</div><div class="tm-view-details">${esc(t.details)}</div></div>`;
    if (t.remarks) html += `<div class="tm-view-section"><div class="tm-view-label">Remarks</div><div class="tm-view-details">${esc(t.remarks)}</div></div>`;
    if (subs.length) {
        const done = subs.filter(s => s.done).length;
        const items = subs.map(s => `<div class="tm-view-sub ${s.done ? 'done' : ''}">${s.done ? '✓' : '○'} ${esc(s.text)}</div>`).join('');
        html += `<div class="tm-view-section"><div class="tm-view-label">Checklist (${done}/${subs.length})</div>${items}</div>`;
    }

    $('viewTitle').textContent = t.title;
    $('viewBody').innerHTML = html;
    $('viewEditBtn').onclick = () => { closeView(); openModal(id); };
    $('viewModal').classList.add('active');
}
function closeView() { $('viewModal').classList.remove('active'); }

// ==========================================================================
// AI ASSISTANT (chat -> task), via the server-side ai.php proxy
// ==========================================================================
let aiMessages = [];
let aiBusy = false;
let aiRecognition = null;

function aiSystemPrompt() {
    const today = new Date().toISOString().slice(0, 10);
    const brandList = brands.map(b => b.name).join(', ');
    return `You are a task-intake assistant for a website-management task manager. The user (Darshan) handles website changes, maintenance and technical SEO across several brands.
Today's date is ${today}.
Available brands: ${brandList}.
Task types (use the value in quotes): "website_change", "maintenance", "seo_fix" (technical SEO), "bug", "content", "other".
Priorities: "low", "medium", "high", "urgent".

The user describes a task in plain language. Ask SHORT clarifying questions only when essential info is missing (which brand/website, what exactly to do, priority, and a due date if relevant). Ask at most two questions at a time and keep replies brief and friendly.

When you have enough information, reply with one short confirmation sentence, then a single block in EXACTLY this format with nothing after it:
<task>
{"title":"...","brand":"<one of the brands above>","task_type":"<one value>","priority":"<one value>","due_date":"YYYY-MM-DD or null","details":"...","remarks":null}
</task>
Rules: "brand" must be one of the available brands (closest match). Output the <task> block only once and only when confident; otherwise keep asking.`;
}

function aiDisplay(content) {
    const txt = content.replace(/<task>[\s\S]*?<\/task>/g, '').trim();
    return txt || '✓ Task prepared below.';
}
function renderAIChat(typing) {
    const box = $('aiChat');
    box.innerHTML = aiMessages.filter(m => m.role !== 'system').map(m =>
        `<div class="tm-ai-msg ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.role === 'user' ? m.content : aiDisplay(m.content))}</div>`
    ).join('') + (typing ? `<div class="tm-ai-msg bot typing">thinking…</div>` : '');
    box.scrollTop = box.scrollHeight;
}
function openAI() {
    aiMessages = [
        { role: 'system', content: aiSystemPrompt() },
        { role: 'assistant', content: 'Hi! Tell me what needs doing — for example “fix the broken contact form on Creed” — and I’ll ask anything I need, then create the task.' }
    ];
    renderAIChat();
    $('aiModal').classList.add('active');
    setTimeout(() => $('aiText').focus(), 100);
}
function closeAI() { $('aiModal').classList.remove('active'); stopMic(); }

async function sendAI(text) {
    text = (text || $('aiText').value).trim();
    if (!text || aiBusy) return;
    $('aiText').value = '';
    aiMessages.push({ role: 'user', content: text });
    renderAIChat(true);
    aiBusy = true;
    try {
        const res = await fetch('ai.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: aiMessages })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));
        const reply = data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content : '';
        aiMessages.push({ role: 'assistant', content: reply || '(no response)' });
        renderAIChat();
        maybeCreateFromReply(reply);
    } catch (e) {
        aiMessages.push({ role: 'assistant', content: '⚠️ ' + (e.message || 'AI request failed') + '\n(The assistant only works on the live site where ai.php runs.)' });
        renderAIChat();
    } finally {
        aiBusy = false;
    }
}

function maybeCreateFromReply(reply) {
    const m = reply.match(/<task>\s*([\s\S]*?)\s*<\/task>/);
    if (!m) return;
    let d;
    try { d = JSON.parse(m[1]); } catch { return; }
    const box = $('aiChat');
    const prev = document.createElement('div');
    prev.className = 'tm-ai-card-preview';
    const due = d.due_date && d.due_date !== 'null' ? ' · due ' + esc(d.due_date) : '';
    prev.innerHTML = `<b>${esc(d.title || 'Task')}</b><br>${esc(d.brand || '')} · ${esc(TYPE_LABELS[d.task_type] || d.task_type || '')} · ${esc(d.priority || '')}${due}<br><span style="opacity:.8">Opening the editor so you can review &amp; save…</span>`;
    box.appendChild(prev);
    box.scrollTop = box.scrollHeight;
    setTimeout(() => { closeAI(); prefillFromAI(d); }, 1100);
}

function prefillFromAI(d) {
    openModal();
    if (d.title) $('fTitle').value = d.title;
    if (d.brand) {
        const match = brands.find(b => b.name.toLowerCase() === String(d.brand).toLowerCase());
        if (match) $('fBrand').value = match.name;
    }
    if (d.task_type && TYPE_LABELS[d.task_type]) $('fType').value = d.task_type;
    if (['low', 'medium', 'high', 'urgent'].includes(d.priority)) $('fPriority').value = d.priority;
    if (d.due_date && /^\d{4}-\d{2}-\d{2}$/.test(d.due_date)) $('fDue').value = d.due_date;
    if (d.details) $('fDetails').value = d.details;
    if (d.remarks) $('fRemarks').value = d.remarks;
    toast('Review the task and hit Save.', 'success');
}

// ----- Mic / speech-to-text for the assistant -----
function initMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { const b = $('aiMic'); if (b) b.style.display = 'none'; return; }
    aiRecognition = new SR();
    aiRecognition.lang = 'en-IN';
    aiRecognition.interimResults = false;
    aiRecognition.maxAlternatives = 1;
    aiRecognition.onresult = e => {
        const t = e.results[0][0].transcript;
        $('aiMic').classList.remove('listening');
        sendAI(t);
    };
    aiRecognition.onend = () => $('aiMic').classList.remove('listening');
    aiRecognition.onerror = () => $('aiMic').classList.remove('listening');
}
function toggleMic() {
    if (!aiRecognition) return;
    if ($('aiMic').classList.contains('listening')) { stopMic(); return; }
    try { aiRecognition.start(); $('aiMic').classList.add('listening'); } catch (_) {}
}
function stopMic() { if (aiRecognition) { try { aiRecognition.stop(); } catch (_) {} } const b = $('aiMic'); if (b) b.classList.remove('listening'); }

async function saveTask(e) {
    e.preventDefault();
    const id = $('taskId').value;
    const existing = id ? tasks.find(x => x.id === id) : null;
    const data = {
        title: $('fTitle').value.trim(),
        brand: $('fBrand').value,
        task_type: $('fType').value,
        priority: $('fPriority').value,
        status: $('fStatus').value,
        due_date: $('fDue').value || null,
        url: $('fUrl').value.trim() || null,
        details: $('fDetails').value.trim() || null,
        remarks: $('fRemarks').value.trim() || null,
        subtasks: editingSubtasks,
        // Preserve scope on edit; otherwise inherit from the active scope.
        scope: existing ? scopeOf(existing) : currentScope
    };
    if (!data.title) { toast('Task needs a title.', 'error'); return; }

    data.completed_at = data.status === 'done'
        ? (existing && existing.completed_at ? existing.completed_at : new Date().toISOString())
        : null;

    if (id) {
        const t = tasks.find(x => x.id === id);
        Object.assign(t, data);
        await persistTask(t, false);
        toast('Task updated.', 'success');
    } else if (sbClient) {
        // Let Postgres generate id + created_at, then reload from cloud.
        await persistTask(data, true);
        await refreshFromCloud();
        toast('Task created.', 'success');
        closeModal();
        return;
    } else {
        tasks.unshift({ id: uid(), created_at: new Date().toISOString(), ...data });
        toast('Task created.', 'success');
    }
    if (!sbClient) lsSaveTasks();
    closeModal();
    render();
}

async function removeTask(id) {
    if (!confirm('Delete this task?')) return;
    tasks = tasks.filter(t => t.id !== id);
    await deleteTaskStore(id);
    if (!sbClient) lsSaveTasks();
    render();
    toast('Task deleted.', 'success');
}

// ==========================================================================
// EXPORT / IMPORT (local backup)
// ==========================================================================
function exportData() {
    const blob = new Blob([JSON.stringify({ tasks, brands }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tasks-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded.', 'success');
}
function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const data = JSON.parse(reader.result);
            if (Array.isArray(data.tasks)) tasks = data.tasks;
            if (Array.isArray(data.brands) && data.brands.length) brands = data.brands;
            if (!sbClient) { lsSaveTasks(); lsSaveBrands(); }
            render();
            toast('Backup imported.', 'success');
        } catch { toast('That file could not be read.', 'error'); }
    };
    reader.readAsText(file);
}

// ==========================================================================
// TOAST + CONNECTION BADGE
// ==========================================================================
function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `tm-toast ${type}`;
    el.textContent = msg;
    $('toastWrap').appendChild(el);
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 300); }, 2600);
}
function setConn(online) {
    const b = $('connBadge');
    b.classList.toggle('online', online);
    $('connText').textContent = online ? 'Synced (Supabase)' : 'Local (this device)';
}

// ==========================================================================
// PERSONAL STUFF (private scope, password-gated)
// ==========================================================================
function isUnlocked() {
    try { return sessionStorage.getItem(SESSION_UNLOCK_KEY) === '1'; } catch { return false; }
}
function markUnlocked() {
    try { sessionStorage.setItem(SESSION_UNLOCK_KEY, '1'); } catch (_) { }
}
function clearUnlocked() {
    try { sessionStorage.removeItem(SESSION_UNLOCK_KEY); } catch (_) { }
}

function openPersonalAuth() {
    // Already unlocked this session — skip the password prompt.
    if (isUnlocked()) { enterPersonalMode(); return; }
    $('personalAuthError').textContent = '';
    $('personalAuthInput').value = '';
    $('personalAuthModal').classList.add('active');
    setTimeout(() => $('personalAuthInput').focus(), 100);
}
function closePersonalAuth() { $('personalAuthModal').classList.remove('active'); }

async function submitPersonalAuth(e) {
    if (e) e.preventDefault();
    const pw = $('personalAuthInput').value;
    const err = $('personalAuthError');
    err.textContent = '';
    if (!pw) { err.textContent = 'Enter your password.'; return; }
    const btn = $('personalAuthSubmit');
    btn.disabled = true; btn.textContent = 'Unlocking…';
    try {
        const res = await fetch('personal-auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
            markUnlocked();
            closePersonalAuth();
            enterPersonalMode();
        } else if (res.status === 500 && data.error) {
            err.textContent = data.error;
        } else {
            err.textContent = 'Wrong password.';
            $('personalAuthInput').select();
        }
    } catch (_) {
        err.textContent = 'Unlock failed — personal-auth.php is only available on the live site.';
    } finally {
        btn.disabled = false; btn.textContent = 'Unlock';
    }
}

function enterPersonalMode() {
    currentScope = 'personal';
    document.body.classList.add('tm-personal-mode');
    $('greetingText').textContent = 'Personal Stuff';
    $('taglineText').textContent = 'Private tasks — never visible from the main task manager';
    // Reset filters so we don't inherit work-mode state.
    $('searchInput').value = '';
    $('filterBrand').value = '';
    $('filterType').value = '';
    $('filterPriority').value = '';
    render();
    toast('Personal mode unlocked.', 'success');
}

function exitPersonalMode() {
    currentScope = 'work';
    document.body.classList.remove('tm-personal-mode');
    $('greetingText').textContent = 'Task Manager';
    $('taglineText').textContent = 'Track website changes, maintenance & technical SEO across your brands';
    $('searchInput').value = '';
    $('filterBrand').value = '';
    $('filterType').value = '';
    $('filterPriority').value = '';
    render();
}

// ==========================================================================
// INIT
// ==========================================================================
function bindEvents() {
    $('newTaskBtn').addEventListener('click', () => openModal());
    $('newTaskNavBtn')?.addEventListener('click', () => openModal());
    $('modalClose').addEventListener('click', closeModal);
    $('cancelBtn').addEventListener('click', closeModal);
    $('taskModal').addEventListener('click', e => { if (e.target === $('taskModal')) closeModal(); });
    $('viewClose').addEventListener('click', closeView);
    $('viewModal').addEventListener('click', e => { if (e.target === $('viewModal')) closeView(); });
    $('aiBtn').addEventListener('click', openAI);
    $('aiClose').addEventListener('click', closeAI);
    $('aiModal').addEventListener('click', e => { if (e.target === $('aiModal')) closeAI(); });
    $('aiSend').addEventListener('click', () => sendAI());
    $('aiText').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendAI(); } });
    $('aiMic').addEventListener('click', toggleMic);
    initMic();
    $('taskForm').addEventListener('submit', saveTask);
    $('deleteTaskBtn').addEventListener('click', () => { const id = $('taskId').value; if (id) { closeModal(); removeTask(id); } });
    $('addBrandBtn').addEventListener('click', addBrand);
    $('addSubtaskBtn').addEventListener('click', addSubtask);
    $('subtaskInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } });

    // Due date = calendar only (open picker on click/focus, block manual typing)
    const due = $('fDue');
    const openPicker = () => { try { due.showPicker(); } catch (_) {} };
    due.addEventListener('focus', openPicker);
    due.addEventListener('click', openPicker);
    due.addEventListener('keydown', e => e.preventDefault());

    ['searchInput', 'filterBrand', 'filterType', 'filterPriority', 'sortBy'].forEach(idv =>
        $(idv).addEventListener('input', render));

    $('viewBoard').addEventListener('click', () => { currentView = 'board'; $('viewBoard').classList.add('active'); $('viewList').classList.remove('active'); render(); });
    $('viewList').addEventListener('click', () => { currentView = 'list'; $('viewList').classList.add('active'); $('viewBoard').classList.remove('active'); render(); });

    $('exportBtn').addEventListener('click', exportData);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); });

    // Personal Stuff (private scope) wiring.
    $('personalOrbBtn').addEventListener('click', openPersonalAuth);
    $('personalAuthClose').addEventListener('click', closePersonalAuth);
    $('personalAuthCancel').addEventListener('click', closePersonalAuth);
    $('personalAuthModal').addEventListener('click', e => { if (e.target === $('personalAuthModal')) closePersonalAuth(); });
    $('personalAuthForm').addEventListener('submit', submitPersonalAuth);
    $('personalExitBtn').addEventListener('click', exitPersonalMode);

    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeView(); closeAI(); closePersonalAuth(); } });
}

document.addEventListener('DOMContentLoaded', () => {
    // Bind UI first so buttons always work, even if data loading fails.
    bindEvents();
    storeInit()
        .then(render)
        .catch(err => {
            console.error('Task manager init failed, falling back to local storage.', err);
            lsLoad();
            render();
        });
});
