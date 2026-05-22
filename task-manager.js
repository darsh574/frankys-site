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
    { name: 'Tupperware', color: '#e11d48' },
    { name: 'Mind Nutrition', color: '#8b5cf6' },
    { name: 'TOUJOURS', color: '#0ea5e9' },
    { name: 'NIF Kondhwa', color: '#22c55e' },
    { name: 'Creed', color: '#f59e0b' },
    { name: 'Hovers', color: '#06b6d4' }
];

const BRAND_PALETTE = ['#e11d48', '#8b5cf6', '#0ea5e9', '#22c55e', '#f59e0b',
    '#06b6d4', '#ec4899', '#14b8a6', '#a855f7', '#ef4444', '#3b82f6', '#84cc16'];

// ---- State ----
let tasks = [];
let brands = [...DEFAULT_BRANDS];
let currentView = 'board';
let editingSubtasks = [];
let supabase = null;
const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);

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
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        try {
            const [{ data: b }, { data: t }] = await Promise.all([
                supabase.from('brands').select('*').order('name'),
                supabase.from('tasks').select('*').order('created_at', { ascending: false })
            ]);
            brands = (b && b.length) ? b : [...DEFAULT_BRANDS];
            if (!b || !b.length) { for (const br of brands) await supabase.from('brands').insert(br); }
            tasks = t || [];
            setConn(true);
            // live sync across devices
            supabase.channel('tm-tasks')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refreshFromCloud)
                .subscribe();
            return;
        } catch (e) {
            console.warn('Supabase unreachable, using local storage.', e);
            toast('Could not reach Supabase — using local storage.', 'error');
        }
    }
    lsLoad();
    setConn(false);
}

async function refreshFromCloud() {
    if (!supabase) return;
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
    tasks = data || [];
    render();
}

async function persistTask(task, isNew) {
    if (supabase) {
        if (isNew) await supabase.from('tasks').insert(task);
        else await supabase.from('tasks').update(task).eq('id', task.id);
    } else { lsSaveTasks(); }
}
async function deleteTaskStore(id) {
    if (supabase) await supabase.from('tasks').delete().eq('id', id);
    else lsSaveTasks();
}
async function persistBrand(brand) {
    if (supabase) await supabase.from('brands').insert(brand);
    else lsSaveBrands();
}

// ==========================================================================
// HELPERS
// ==========================================================================
const $ = id => document.getElementById(id);
function uid() { return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7); }
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
function brandColor(name) { const b = brands.find(x => x.name === name); return b ? b.color : '#555'; }

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
    const overdue = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date + 'T00:00:00') < today).length;
    $('statTotal').textContent = tasks.length;
    $('statProgress').textContent = tasks.filter(t => t.status === 'in_progress').length;
    $('statDone').textContent = tasks.filter(t => t.status === 'done').length;
    $('statOverdue').textContent = overdue;
}

function cardHTML(t) {
    const subs = t.subtasks || [];
    const doneSubs = subs.filter(s => s.done).length;
    const di = dueInfo(t.due_date);
    let progress = '';
    if (subs.length) {
        const pct = Math.round((doneSubs / subs.length) * 100);
        progress = `<div class="tm-progress-wrap">
            <div class="tm-progress-bar"><div class="tm-progress-fill" style="width:${pct}%"></div></div>
            <div class="tm-progress-text">${doneSubs}/${subs.length} steps · ${pct}%</div>
          </div>`;
    }
    const urlHTML = t.url ? `<a class="tm-card-url" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        ${esc(t.url.replace(/^https?:\/\//, ''))}</a>` : '';
    return `<div class="tm-card" draggable="true" data-id="${t.id}" style="--brand-color:${brandColor(t.brand)};--prio-color:${PRIORITY_COLORS[t.priority]}">
        <div class="tm-card-top">
            <span class="tm-brand-badge">${esc(t.brand)}</span>
            <span class="tm-type-tag">${TYPE_LABELS[t.task_type] || 'Other'}</span>
            <span class="tm-prio"><span class="tm-prio-dot"></span>${t.priority}</span>
        </div>
        <div class="tm-card-title">${esc(t.title)}</div>
        ${t.details ? `<div class="tm-card-details">${esc(t.details)}</div>` : ''}
        ${urlHTML}
        ${progress}
        <div class="tm-card-foot">
            ${di.label ? `<span class="tm-due ${di.cls}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${di.label}</span>` : ''}
            <span class="tm-card-actions">
                <button class="tm-icon-btn" data-act="edit" title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="tm-icon-btn danger" data-act="del" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </span>
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
        card.addEventListener('click', () => openModal(id));
    });
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
                t.status = status;
                await persistTask(t, false);
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
    if (!supabase) lsSaveBrands();
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
        editingSubtasks = (t.subtasks || []).map(s => ({ ...s }));
        $('deleteTaskBtn').style.display = '';
    } else {
        $('modalTitle').textContent = 'New Task';
        $('taskForm').reset();
        $('taskId').value = '';
        $('fBrand').value = brands[0] ? brands[0].name : '';
        $('fPriority').value = 'medium';
        $('fStatus').value = 'todo';
        editingSubtasks = [];
        $('deleteTaskBtn').style.display = 'none';
    }
    renderSubtasks();
    modal.classList.add('active');
    setTimeout(() => $('fTitle').focus(), 100);
}
function closeModal() { $('taskModal').classList.remove('active'); }

async function saveTask(e) {
    e.preventDefault();
    const id = $('taskId').value;
    const data = {
        title: $('fTitle').value.trim(),
        brand: $('fBrand').value,
        task_type: $('fType').value,
        priority: $('fPriority').value,
        status: $('fStatus').value,
        due_date: $('fDue').value || null,
        url: $('fUrl').value.trim() || null,
        details: $('fDetails').value.trim() || null,
        subtasks: editingSubtasks
    };
    if (!data.title) { toast('Task needs a title.', 'error'); return; }

    if (id) {
        const t = tasks.find(x => x.id === id);
        Object.assign(t, data);
        await persistTask(t, false);
        toast('Task updated.', 'success');
    } else if (supabase) {
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
    if (!supabase) lsSaveTasks();
    closeModal();
    render();
}

async function removeTask(id) {
    if (!confirm('Delete this task?')) return;
    tasks = tasks.filter(t => t.id !== id);
    await deleteTaskStore(id);
    if (!supabase) lsSaveTasks();
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
            if (!supabase) { lsSaveTasks(); lsSaveBrands(); }
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
// INIT
// ==========================================================================
function bindEvents() {
    $('newTaskBtn').addEventListener('click', () => openModal());
    $('newTaskNavBtn')?.addEventListener('click', () => openModal());
    $('modalClose').addEventListener('click', closeModal);
    $('cancelBtn').addEventListener('click', closeModal);
    $('taskModal').addEventListener('click', e => { if (e.target === $('taskModal')) closeModal(); });
    $('taskForm').addEventListener('submit', saveTask);
    $('deleteTaskBtn').addEventListener('click', () => { const id = $('taskId').value; if (id) { closeModal(); removeTask(id); } });
    $('addBrandBtn').addEventListener('click', addBrand);
    $('addSubtaskBtn').addEventListener('click', addSubtask);
    $('subtaskInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } });

    ['searchInput', 'filterBrand', 'filterType', 'filterPriority', 'sortBy'].forEach(idv =>
        $(idv).addEventListener('input', render));

    $('viewBoard').addEventListener('click', () => { currentView = 'board'; $('viewBoard').classList.add('active'); $('viewList').classList.remove('active'); render(); });
    $('viewList').addEventListener('click', () => { currentView = 'list'; $('viewList').classList.add('active'); $('viewBoard').classList.remove('active'); render(); });

    $('exportBtn').addEventListener('click', exportData);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); });

    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
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
