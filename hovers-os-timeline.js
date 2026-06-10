/* ============================================================
   Hovers OS — Build Timeline
   Schedule engine: N working days per section, weekends off.
   Dates cascade from START_DATE through the section queue, so
   pushing/extending one section automatically shifts the rest.

   Section status: 'auto' follows the timeline dates; or set it
   manually to todo / in_progress / testing / done (dropdown on
   each card + in the popup). Shipped sections (Accounts, Tasks)
   are off the timeline but their status is editable too.

   Works on localStorage out of the box; syncs to Supabase when
   the hos_sections / hos_comments tables exist (SQL in CLAUDE.md).
   ============================================================ */

(function () {
    'use strict';

    // ---- Supabase (same project as the task manager) ----
    const SUPABASE_URL = 'https://ifcurfhhzzpdvxuyobwo.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_lhiOaS0ToPQA4s8P3YS0qg_nh4G6Jmc'; // publishable key (safe for browser)

    // ---------- Config ----------
    const START_DATE = new Date(2026, 5, 11); // Thu 11 Jun 2026 — day 1 of the roadmap
    const DEFAULT_DURATION = 3;
    const LS_SECTIONS = 'hos_sections_local';
    const LS_COMMENTS = 'hos_comments_local';

    const ICONS = {
        calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        creative: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
        capacity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        hr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        knowledge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
        wins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>',
        me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        accounts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
        tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l3 3 5-6"/></svg>'
    };

    // Already shipped — off the working-day timeline, but status is editable
    const DEFAULT_SHIPPED = [
        { key: 'accounts', name: 'Accounts', color: '#22c55e', position: -2, status: 'testing' },
        { key: 'tasks', name: 'Tasks', color: '#4ade80', position: -1, status: 'testing' }
    ];

    // Default build queue — seeds the DB / localStorage on first run
    const DEFAULT_SECTIONS = [
        { key: 'calendar', name: 'Calendar', color: '#3b82f6' },
        { key: 'creative', name: 'Creative', color: '#d946ef' },
        { key: 'capacity', name: 'Capacity', color: '#f59e0b' },
        { key: 'hr', name: 'HR', color: '#10b981' },
        { key: 'knowledge', name: 'Knowledge Base', color: '#06b6d4' },
        { key: 'wins', name: 'Wins Wall', color: '#f43f5e' },
        { key: 'me', name: 'Me', color: '#a78bfa' },
        { key: 'admin', name: 'Admin', color: '#94a3b8' }
    ].map((s, i) => Object.assign(s, { position: i, duration: DEFAULT_DURATION, push_days: 0, status: 'auto' }));

    // Manual statuses (the dropdown). 'auto' = follow the timeline dates.
    const MANUAL_STATUSES = ['todo', 'in_progress', 'testing', 'done'];
    const STATUS_LABEL = {
        auto: 'Auto (timeline)', todo: 'To Do', in_progress: 'In Progress', testing: 'In Testing', done: 'Done',
        past: 'Built · testing', building: 'Building now', next: 'Up next', queued: 'Queued'
    };
    const STATUS_CLASS = {
        todo: 's-queued', in_progress: 's-building', testing: 's-testing', done: 's-done',
        past: 's-testing', building: 's-building', next: 's-next', queued: 's-queued'
    };

    // ---------- Date helpers ----------
    const DAY_MS = 86400000;
    const fmtLong = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const fmtShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
    const fmtMonth = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
    const fmtDow = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
    const fmtStamp = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    const stripTime = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const isWorkday = d => d.getDay() !== 0 && d.getDay() !== 6;
    const keyOf = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    const today = stripTime(new Date());
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---------- State ----------
    let sections = [];          // live timeline queue (from DB or localStorage)
    let shipped = [];           // Accounts/Tasks with live status
    let comments = [];          // [{id, section_key, body, created_at}]
    let schedule = [];          // computed: [{...section, days, start, end, liveStatus}]
    let dayMap = {};            // 'y-m-d' -> { section, phase }
    let allDays = [], lastDay = null, lastDayKey = '';
    let sbClient = null;
    let cloudOk = false;        // true once the hos_* tables responded
    const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
    if (useSupabase) sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ---------- Storage layer ----------
    function applyRows(rows) {
        sections = DEFAULT_SECTIONS.map(def => {
            const row = (rows || []).find(r => r.key === def.key);
            return Object.assign({}, def, row ? {
                position: row.position ?? def.position,
                duration: Math.max(1, row.duration ?? DEFAULT_DURATION),
                push_days: Math.max(0, row.push_days ?? 0),
                status: MANUAL_STATUSES.includes(row.status) ? row.status : 'auto'
            } : {});
        }).sort((a, b) => a.position - b.position);

        shipped = DEFAULT_SHIPPED.map(def => {
            const row = (rows || []).find(r => r.key === def.key);
            return Object.assign({}, def, row && MANUAL_STATUSES.includes(row.status) ? { status: row.status } : {});
        });
    }

    function loadLocal() {
        let rows = [];
        try {
            const saved = JSON.parse(localStorage.getItem(LS_SECTIONS) || 'null');
            rows = Array.isArray(saved) ? saved : (saved && saved.rows) || [];
            comments = JSON.parse(localStorage.getItem(LS_COMMENTS) || '[]');
        } catch (e) { comments = []; }
        applyRows(rows);
    }

    function saveLocal() {
        localStorage.setItem(LS_SECTIONS, JSON.stringify({ rows: sections.concat(shipped) }));
        localStorage.setItem(LS_COMMENTS, JSON.stringify(comments));
    }

    async function loadCloud() {
        const [secRes, comRes] = await Promise.all([
            sbClient.from('hos_sections').select('*'),
            sbClient.from('hos_comments').select('*').order('created_at', { ascending: true })
        ]);
        if (secRes.error || comRes.error) throw (secRes.error || comRes.error);
        cloudOk = true;
        comments = comRes.data || [];
        // seed missing rows so every device sees the same queue
        const defaults = DEFAULT_SECTIONS.concat(
            DEFAULT_SHIPPED.map(s => ({ key: s.key, name: s.name, position: s.position, duration: 0, push_days: 0, status: s.status })));
        const missing = defaults.filter(d => !(secRes.data || []).some(r => r.key === d.key))
            .map(d => ({ key: d.key, name: d.name, position: d.position, duration: d.duration, push_days: d.push_days, status: d.status }));
        if (missing.length) await sbClient.from('hos_sections').insert(missing);
        applyRows((secRes.data || []).concat(missing));
    }

    async function saveSection(sec) {
        if (cloudOk) {
            const { error } = await sbClient.from('hos_sections')
                .update({ duration: sec.duration ?? 0, push_days: sec.push_days ?? 0, status: sec.status, updated_at: new Date().toISOString() })
                .eq('key', sec.key);
            if (error) { toast('Cloud save failed — change kept on this device'); saveLocal(); return; }
        } else saveLocal();
    }

    async function addComment(sectionKey, body) {
        if (cloudOk) {
            const { data, error } = await sbClient.from('hos_comments')
                .insert({ section_key: sectionKey, body }).select().single();
            if (!error && data) { comments.push(data); return; }
            toast('Cloud save failed — comment kept on this device');
        }
        comments.push({ id: 'local-' + Math.random().toString(36).slice(2), section_key: sectionKey, body, created_at: new Date().toISOString() });
        saveLocal();
    }

    async function deleteComment(id) {
        comments = comments.filter(c => c.id !== id);
        if (cloudOk && !String(id).startsWith('local-')) {
            const { error } = await sbClient.from('hos_comments').delete().eq('id', id);
            if (error) toast('Cloud delete failed');
        } else saveLocal();
    }

    const commentsFor = key => comments.filter(c => c.section_key === key);
    const findAnySection = key => sections.find(s => s.key === key) || shipped.find(s => s.key === key);

    // ---------- Schedule engine ----------
    // Sequential cascade: each section starts after the previous one ends
    // (+ its own push_days working-day gap), so any edit shifts everything after it.
    function buildSchedule() {
        schedule = []; dayMap = {};
        let cursor = new Date(START_DATE);
        sections.forEach(sec => {
            let pushed = 0;
            while (pushed < sec.push_days) { if (isWorkday(cursor)) pushed++; cursor = new Date(cursor.getTime() + DAY_MS); }
            const days = [];
            while (days.length < sec.duration) {
                if (isWorkday(cursor)) days.push(new Date(cursor));
                cursor = new Date(cursor.getTime() + DAY_MS);
            }
            const entry = Object.assign({}, sec, { days, start: days[0], end: days[days.length - 1] });
            schedule.push(entry);
            days.forEach((d, i) => { dayMap[keyOf(d)] = { section: entry, phase: i + 1 }; });
        });

        allDays = schedule.flatMap(s => s.days);
        lastDay = allDays[allDays.length - 1];
        lastDayKey = keyOf(lastDay);

        let nextFlagged = false;
        schedule.forEach(s => {
            if (s.status !== 'auto') { s.liveStatus = s.status; return; }
            if (today > s.end) s.liveStatus = 'past';
            else if (today >= s.start) s.liveStatus = 'building';
            else if (!nextFlagged) { s.liveStatus = 'next'; nextFlagged = true; }
            else s.liveStatus = 'queued';
        });
    }

    const isBuilt = st => st === 'done' || st === 'testing' || st === 'past';

    function progressPct() {
        let done = 0;
        schedule.forEach(s => {
            if (isBuilt(s.liveStatus)) done += s.days.length;
            else done += s.days.filter(d => d < today).length;
        });
        return { done, pct: Math.round((done / allDays.length) * 100) };
    }

    // ---------- DOM refs ----------
    const $ = id => document.getElementById(id);
    const railEl = $('htRail'), statsEl = $('htStats'), chipsEl = $('htHeroChips'),
        calGrid = $('htCalGrid'), calMonthEl = $('htCalMonth'), footEl = $('htFoot'),
        ganttEl = $('htGantt'), tooltipEl = $('htTooltip'),
        backdrop = $('htModalBackdrop'), modalEl = $('htModal'), modalBody = $('htModalBody');

    let viewMonth, minMonth, lastMonth;
    const todayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    let openSectionKey = null;   // section currently shown in the modal
    let spotlight = null;        // section key spotlighted on the calendar

    // Status dropdown markup ('auto' option only for timeline sections)
    function statusSelect(sec, isTimeline) {
        const opts = (isTimeline ? ['auto'] : []).concat(MANUAL_STATUSES);
        return `<select class="ht-select" data-status-key="${sec.key}" title="Change status">
            ${opts.map(o => `<option value="${o}" ${sec.status === o ? 'selected' : ''}>${STATUS_LABEL[o]}</option>`).join('')}
        </select>`;
    }

    // ---------- Hero ----------
    function renderHero() {
        const building = schedule.find(s => s.liveStatus === 'building' || s.liveStatus === 'in_progress');
        const next = schedule.find(s => s.liveStatus === 'next');
        const startsTomorrow = stripTime(new Date(START_DATE)).getTime() - today.getTime() === DAY_MS;

        let liveChip;
        if (building) liveChip = `Building: ${building.name}`;
        else if (today < START_DATE) liveChip = startsTomorrow ? 'Kick-off tomorrow' : 'Kick-off ' + fmtShort.format(START_DATE);
        else liveChip = 'All sections built 🎉';

        const sync = cloudOk
            ? '<span class="ht-chip"><span class="ht-chip-dot" style="background:#22c55e;box-shadow:0 0 8px #22c55e"></span>Cloud sync on</span>'
            : '<span class="ht-chip"><span class="ht-chip-dot" style="background:#f59e0b;box-shadow:0 0 8px #f59e0b"></span>Saving on this device only</span>';

        chipsEl.innerHTML = `
            <span class="ht-chip is-live"><span class="ht-chip-dot"></span>${liveChip}</span>
            ${next ? `<span class="ht-chip"><span class="ht-chip-dot" style="background:${next.color};box-shadow:0 0 8px ${next.color}"></span>Up next: ${next.name}</span>` : ''}
            ${sync}`;

        const { pct } = progressPct();
        const doneCount = shipped.filter(s => isBuilt(s.status)).length + schedule.filter(s => isBuilt(s.liveStatus)).length;
        statsEl.innerHTML = [
            [doneCount + '<small> / ' + (shipped.length + schedule.length) + '</small>', 'Sections built'],
            [allDays.length, 'Working days'],
            [allDays.filter(d => d >= today).length, 'Days remaining'],
            [fmtShort.format(lastDay), 'Finish date']
        ].map(([v, k]) => `<div><div class="ht-stat-val">${v}</div><div class="ht-stat-key">${k}</div></div>`).join('');

        const C = 2 * Math.PI * 52;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            $('htRingFill').style.strokeDashoffset = C - (C * pct / 100);
        }));
        $('htRingPct').textContent = pct + '%';
    }

    // ---------- Section rail ----------
    function renderRail() {
        const card = (s, status, dates, i, badge) => `
            <article class="ht-card ${spotlight === s.key ? 'is-focused' : ''}" data-key="${s.key}" style="--c:${s.color};--d:${0.05 * i}s" tabindex="0">
                <div class="ht-card-top">
                    <span class="ht-card-icon">${ICONS[s.key] || ICONS.admin}</span>
                    <span class="ht-card-name">${s.name}</span>
                    ${badge ? `<span class="ht-card-badge" title="${badge} comment(s)">💬 ${badge}</span>` : ''}
                </div>
                <div class="ht-card-dates">${dates}</div>
                <div class="ht-card-foot">
                    <span class="ht-status ${STATUS_CLASS[status] || 's-queued'}">${STATUS_LABEL[status] || status}</span>
                    ${statusSelect(s, !!s.duration)}
                </div>
            </article>`;

        railEl.innerHTML =
            shipped.map((s, i) => card(s, s.status, 'Build complete', i, commentsFor(s.key).length)).join('') +
            schedule.map((s, i) => card(s, s.liveStatus,
                fmtShort.format(s.start) + ' → ' + fmtShort.format(s.end) + (s.duration !== DEFAULT_DURATION ? ` · ${s.duration}d` : '') + (s.push_days ? ` · pushed +${s.push_days}d` : ''),
                i + shipped.length, commentsFor(s.key).length)).join('');
    }

    // ---------- Calendar ----------
    function renderCalendar() {
        calMonthEl.textContent = fmtMonth.format(viewMonth);
        $('htPrevMonth').disabled = viewMonth.getTime() <= minMonth.getTime();
        $('htNextMonth').disabled = viewMonth.getTime() >= lastMonth.getTime();

        const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first offset

        let html = '';
        for (let i = 0; i < lead; i++) html += '<div class="ht-day is-out"></div>';

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(y, m, d);
            const k = keyOf(date);
            const hit = dayMap[k];
            const cls = ['ht-day'];
            if (!isWorkday(date)) cls.push('is-weekend');
            if (date.getTime() === today.getTime()) cls.push('is-today');
            if (hit) {
                cls.push('has-work');
                if (hit.section.liveStatus === 'done') cls.push('is-completed');
                if (spotlight && hit.section.key === spotlight) cls.push('is-focused');
                if (spotlight && hit.section.key !== spotlight) cls.push('is-dim');
            }
            const style = hit ? `--c:${hit.section.color};` : '';
            let inner = `<span class="ht-day-num">${d}</span>`;
            if (date.getTime() === today.getTime()) inner += '<span class="ht-today-tag">Today</span>';
            if (hit) {
                if (hit.phase === 1) inner += `<span class="ht-day-pill">${hit.section.name}</span>`;
                inner += `<span class="ht-day-phase">Day ${hit.phase}/${hit.section.duration}</span>`;
                if (date < today || isBuilt(hit.section.liveStatus)) inner += '<span class="ht-day-done-tick">✓</span>';
                if (k === lastDayKey) inner += '<span class="ht-day-flag">🏁</span>';
            }
            html += `<div class="${cls.join(' ')}" style="${style}--d:${0.012 * (lead + d)}s" data-key="${k}">${inner}</div>`;
        }
        calGrid.innerHTML = html;
    }

    // ---------- Gantt ----------
    function renderGantt() {
        ganttEl.style.setProperty('--cols', allDays.length);
        let html = '<div class="ht-g-corner"></div>';

        allDays.forEach((d, i) => {
            const gap = i > 0 && (d - allDays[i - 1]) > DAY_MS;
            const cls = ['ht-g-datehead'];
            if (gap) cls.push('is-gap');
            if (d.getTime() === today.getTime()) cls.push('is-today');
            html += `<div class="${cls.join(' ')}"><span class="dow">${fmtDow.format(d)}</span>${fmtShort.format(d)}</div>`;
        });

        schedule.forEach((s, row) => {
            html += `<div class="ht-g-label" style="--c:${s.color};grid-row:${row + 2}"><span class="swatch"></span>${s.name}</div>`;
            allDays.forEach((d, i) => {
                const gap = i > 0 && (d - allDays[i - 1]) > DAY_MS;
                const cls = ['ht-g-cell'];
                if (gap) cls.push('is-gap');
                if (d.getTime() === today.getTime()) cls.push('is-today');
                html += `<div class="${cls.join(' ')}" style="grid-row:${row + 2};grid-column:${i + 2}"></div>`;
            });
            const startIdx = allDays.findIndex(d => d.getTime() === s.start.getTime());
            html += `<div class="ht-g-bar ${s.liveStatus === 'done' ? 'is-completed' : ''}" data-key="${s.key}"
                style="--c:${s.color};--row:${row + 2};--col-start:${startIdx + 2};--col-end:${startIdx + 2 + s.duration};grid-row:${row + 2};--d:${0.07 * row}s">
                ${s.liveStatus === 'done' ? '✓ ' : ''}${s.name}</div>`;
        });
        ganttEl.innerHTML = html;
    }

    // ---------- Footer ----------
    function renderFoot() {
        footEl.innerHTML = `<strong>${schedule.length} sections</strong> · <strong>${allDays.length} build days</strong>
            · ${fmtLong.format(START_DATE)} → <strong>${fmtLong.format(lastDay)}</strong> · Sat &amp; Sun off · testing days excluded`;
    }

    function renderAll() {
        buildSchedule();
        clampMonths();
        renderHero();
        renderRail();
        renderCalendar();
        renderGantt();
        renderFoot();
    }

    // ---------- Modal ----------
    function openSectionModal(key, activePhase) {
        openSectionKey = key;
        renderModal(activePhase);
        backdrop.hidden = false;
    }

    function renderModal(activePhase) {
        const sec = schedule.find(s => s.key === openSectionKey);
        const ship = !sec && shipped.find(s => s.key === openSectionKey);
        const item = sec || ship;
        if (!item) return;
        modalEl.style.setProperty('--c', item.color);
        const list = commentsFor(item.key);
        const status = sec ? sec.liveStatus : ship.status;

        modalBody.innerHTML = `
            <div class="ht-m-eyebrow">${STATUS_LABEL[status] || 'Section'}</div>
            <div class="ht-m-title">
                <span class="ht-card-icon" style="--c:${item.color}">${ICONS[item.key] || ICONS.admin}</span>
                ${item.name}
            </div>
            ${sec ? `
            <div class="ht-m-sub">${fmtLong.format(sec.start)} → ${fmtLong.format(sec.end)} · ${sec.duration} working day${sec.duration > 1 ? 's' : ''}${sec.push_days ? ` · start pushed +${sec.push_days}d` : ''}</div>
            <div class="ht-m-days">
                ${sec.days.map((d, i) => `
                    <div class="ht-m-day ${activePhase === i + 1 ? 'is-active' : ''}">
                        <b>Day ${i + 1}</b>${fmtShort.format(d)} · ${fmtDow.format(d)}
                    </div>`).join('')}
            </div>` : `
            <div class="ht-m-sub">Build complete — not on the working-day timeline.</div>`}

            <div class="ht-m-controls">
                <div class="ht-stepper">
                    <span class="ht-stepper-label">Status</span>
                    ${statusSelect(item, !!sec)}
                </div>
                ${sec ? `
                <div class="ht-stepper">
                    <span class="ht-stepper-label">Length</span>
                    <button class="ht-step" data-act="dur-minus" ${sec.duration <= 1 ? 'disabled' : ''}>−</button>
                    <b>${sec.duration}d</b>
                    <button class="ht-step" data-act="dur-plus">+</button>
                </div>
                <div class="ht-stepper">
                    <span class="ht-stepper-label">Push start</span>
                    <button class="ht-step" data-act="push-minus" ${sec.push_days <= 0 ? 'disabled' : ''}>−</button>
                    <b>+${sec.push_days}d</b>
                    <button class="ht-step" data-act="push-plus">+</button>
                </div>` : ''}
            </div>
            ${sec ? `<div class="ht-m-cascade">Length / push changes automatically shift every section after <b>${sec.name}</b>.</div>` : ''}

            <div class="ht-m-comments">
                <div class="ht-m-comments-head">Comments <span>${list.length}</span></div>
                <div class="ht-comment-list">
                    ${list.length ? list.map(c => `
                        <div class="ht-comment">
                            <div class="ht-comment-body">${esc(c.body)}</div>
                            <div class="ht-comment-meta">
                                ${fmtStamp.format(new Date(c.created_at))}
                                <button class="ht-comment-del" data-del="${c.id}" title="Delete">✕</button>
                            </div>
                        </div>`).join('') : '<div class="ht-comment-empty">No comments yet — add a note, blocker or update.</div>'}
                </div>
                <div class="ht-comment-add">
                    <input type="text" id="htCommentInput" maxlength="500" placeholder="Write a comment…">
                    <button class="ht-ctrl-btn" data-act="add-comment">Add</button>
                </div>
            </div>`;

        const input = $('htCommentInput');
        input.addEventListener('keydown', e => { if (e.key === 'Enter') submitComment(); });
    }

    async function submitComment() {
        const input = $('htCommentInput');
        const body = (input.value || '').trim();
        if (!body) return;
        input.disabled = true;
        await addComment(openSectionKey, body);
        renderModal();
        renderRail();
        $('htCommentInput').focus();
    }

    // Status change — applies anywhere a .ht-select lives (cards + modal)
    async function changeStatus(key, value) {
        const sec = findAnySection(key);
        if (!sec) return;
        sec.status = value;
        await saveSection(sec);
        renderAll();
        if (!backdrop.hidden && openSectionKey === key) renderModal();
    }

    railEl.addEventListener('change', e => {
        const sel = e.target.closest('.ht-select');
        if (sel) changeStatus(sel.dataset.statusKey, sel.value);
    });

    modalBody.addEventListener('change', e => {
        const sel = e.target.closest('.ht-select');
        if (sel) changeStatus(sel.dataset.statusKey, sel.value);
    });

    modalBody.addEventListener('click', async e => {
        const del = e.target.closest('.ht-comment-del');
        if (del) { await deleteComment(del.dataset.del); renderModal(); renderRail(); return; }

        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const sec = sections.find(s => s.key === openSectionKey);

        switch (btn.dataset.act) {
            case 'add-comment': return submitComment();
            case 'dur-plus': if (sec) sec.duration += 1; break;
            case 'dur-minus': if (sec) sec.duration = Math.max(1, sec.duration - 1); break;
            case 'push-plus': if (sec) sec.push_days += 1; break;
            case 'push-minus': if (sec) sec.push_days = Math.max(0, sec.push_days - 1); break;
            default: return;
        }
        if (!sec) return;
        await saveSection(sec);
        renderAll();
        renderModal();
    });

    function closeModal() {
        backdrop.hidden = true;
        openSectionKey = null;
        if (spotlight) { spotlight = null; renderRail(); renderCalendar(); }
    }
    $('htModalClose').addEventListener('click', closeModal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !backdrop.hidden) closeModal(); });

    // ---------- Rail / calendar / gantt interactions ----------
    railEl.addEventListener('click', e => {
        if (e.target.closest('.ht-select')) return; // dropdown clicks shouldn't open the popup
        const el = e.target.closest('.ht-card');
        if (!el) return;
        const sec = schedule.find(s => s.key === el.dataset.key);
        if (sec) {
            spotlight = sec.key;
            viewMonth = new Date(sec.start.getFullYear(), sec.start.getMonth(), 1);
            renderRail();
            renderCalendar();
        }
        openSectionModal(el.dataset.key);
    });

    calGrid.addEventListener('click', e => {
        const cell = e.target.closest('.ht-day.has-work');
        if (!cell) return;
        const hit = dayMap[cell.dataset.key];
        if (hit) openSectionModal(hit.section.key, hit.phase);
    });

    calGrid.addEventListener('mousemove', e => {
        const cell = e.target.closest('.ht-day.has-work');
        if (!cell) { tooltipEl.hidden = true; return; }
        const hit = dayMap[cell.dataset.key];
        const d = hit.section.days[hit.phase - 1];
        tooltipEl.innerHTML = `<b style="color:${hit.section.color}">${hit.section.name}</b> — Day ${hit.phase} of ${hit.section.duration} · ${fmtLong.format(d)}`;
        tooltipEl.hidden = false;
        tooltipEl.style.left = e.clientX + 'px';
        tooltipEl.style.top = e.clientY + 'px';
    });
    calGrid.addEventListener('mouseleave', () => { tooltipEl.hidden = true; });

    ganttEl.addEventListener('click', e => {
        const bar = e.target.closest('.ht-g-bar');
        if (bar) openSectionModal(bar.dataset.key);
    });

    // ---------- Month nav ----------
    function clampMonths() {
        const firstMonth = new Date(START_DATE.getFullYear(), START_DATE.getMonth(), 1);
        lastMonth = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
        minMonth = todayMonth < firstMonth ? todayMonth : firstMonth;
        if (!viewMonth || viewMonth < minMonth) viewMonth = todayMonth < minMonth ? minMonth : todayMonth;
        if (viewMonth > lastMonth) viewMonth = lastMonth;
    }

    $('htPrevMonth').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderCalendar(); });
    $('htNextMonth').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderCalendar(); });

    // ---------- View switch ----------
    const switchEl = $('htSwitch'), pillEl = $('htSwitchPill');
    function setView(view) {
        switchEl.querySelectorAll('.ht-switch-btn').forEach(b => {
            const on = b.dataset.view === view;
            b.classList.toggle('is-active', on);
            if (on) { pillEl.style.left = b.offsetLeft + 'px'; pillEl.style.width = b.offsetWidth + 'px'; }
        });
        $('htCalWrap').hidden = view !== 'calendar';
        $('htCalNav').style.visibility = view === 'calendar' ? 'visible' : 'hidden';
        $('htGanttWrap').hidden = view !== 'gantt';
        if (view === 'gantt') scrollGanttToToday();
    }
    switchEl.addEventListener('click', e => {
        const b = e.target.closest('.ht-switch-btn');
        if (b) setView(b.dataset.view);
    });

    function scrollGanttToToday() {
        const t = ganttEl.querySelector('.ht-g-datehead.is-today');
        if (t) $('htGanttScroll').scrollLeft = Math.max(0, t.offsetLeft - 260);
    }

    // ---------- Today button ----------
    $('htTodayBtn').addEventListener('click', () => {
        if (!$('htGanttWrap').hidden) { scrollGanttToToday(); return; }
        viewMonth = todayMonth < minMonth ? minMonth : (todayMonth > lastMonth ? lastMonth : todayMonth);
        renderCalendar();
        const cell = calGrid.querySelector('.ht-day.is-today');
        if (cell) {
            cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cell.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 600 });
        }
    });

    // ---------- Toast ----------
    let toastTimer = null;
    function toast(msg) {
        let el = $('htToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'htToast';
            el.className = 'ht-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('is-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('is-show'), 3200);
    }

    // ---------- Init ----------
    (async function init() {
        if (useSupabase) {
            try { await loadCloud(); }
            catch (e) { loadLocal(); toast('Cloud tables not found — run the hos_* SQL. Using this device only.'); }
        } else loadLocal();

        renderAll();
        const initialView = new URLSearchParams(location.search).get('view') === 'gantt' ? 'gantt' : 'calendar';
        requestAnimationFrame(() => setView(initialView));
    })();
})();
