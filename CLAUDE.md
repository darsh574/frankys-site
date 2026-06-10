# CLAUDE.md — Frankys.site workspace

Guidance for Claude Code when working in this repository.

## What this is
A personal static website for Darshan (`https://frankys.site`) plus an
interactive **Task Manager** app. Plain HTML/CSS/JS — no build step, no
framework, no bundler. Pages are served directly.

## Pages & files
- `index.html` — landing page ("Darshan's Workspace"): kinetic-grid canvas
  background, glassmorphic platform cards, client manager, voice search.
- `task-manager.html` / `task-manager.css` / `task-manager.js` — the Task
  Manager app (see below). Lives at `/task-manager`.
- `claude-tips.html`, `porto.html` — other standalone pages.
- `hovers-os-timeline.html` / `.css` / `.js` — Hovers OS build-roadmap
  dashboard (calendar + Gantt views). Served at
  `/task-manager/hovers-os-timeline` via an explicit `.htaccess` rewrite
  (the file lives at repo root — do NOT create a real `task-manager/`
  folder, it would shadow the `/task-manager` page). Asset/nav URLs in
  this page must stay root-absolute (`/styles.css`) because of the
  pseudo-folder URL. CSS/JS namespaced with the `ht-` prefix. Schedule is
  computed in JS from `START_DATE` (11 Jun 2026), default 3 working days
  per section, Sat/Sun skipped; section statuses are derived live from
  today's date. Sections cascade sequentially, so editing one section's
  `duration` or `push_days` (working-day gap before it starts)
  automatically shifts every later section. Every card (and the popup)
  has a status dropdown: `auto` (follow timeline dates) / `todo` /
  `in_progress` / `testing` / `done`. The shipped sections (Accounts,
  Tasks) are stored in `hos_sections` too (positions -2/-1, duration 0)
  so their status is editable; only `auto` is unavailable for them.
  Per-section edits (status, length, push) and comments sync to Supabase
  tables `hos_sections` / `hos_comments` (same project + publishable key
  as the task manager); falls back to localStorage with a toast if the
  tables are missing. Colors/names/order are seeded from
  `DEFAULT_SECTIONS` in the JS — the DB only stores overrides. DB
  migration (**already applied** — tables exist and are seeded; kept for
  reference):
  ```sql
  create table if not exists hos_sections (
    key text primary key,
    name text not null,
    position int not null default 0,
    duration int not null default 3,
    push_days int not null default 0,
    status text not null default 'auto', -- 'auto' | 'done'
    updated_at timestamptz default now()
  );
  create table if not exists hos_comments (
    id uuid primary key default gen_random_uuid(),
    section_key text not null,
    body text not null,
    created_at timestamptz default now()
  );
  alter table hos_sections enable row level security;
  alter table hos_comments enable row level security;
  create policy "hos_sections anon access" on hos_sections
    for all using (true) with check (true);
  create policy "hos_comments anon access" on hos_comments
    for all using (true) with check (true);
  ```
- `script.js` — shared canvas grid + nav behaviour (all classes guard with
  `if (!el) return`, so it's safe to include on any page).
- `styles.css` — base theme + nav + landing-page styles.
- `ai.php` — server-side proxy for the AI assistant (see below).
- `src/` — images and favicon.

URLs are **extensionless** on the host (e.g. `/task-manager`, `/claude-tips`),
so internal links can omit `.html`.

## Theme / conventions
- Dark glassmorphic: backgrounds `rgba(20,20,20,0.6)`, `backdrop-filter:
  blur(8px)`, border `rgba(255,255,255,0.08)`, radius 10–16px.
- Accent blue `#3b82f6` (`59,130,246`). Fonts: `Inter` (body) + `DM Sans`
  (headings).
- Task-manager CSS is namespaced with the `tm-` prefix.
- Vanilla JS only. Keep it dependency-free except the two CDN scripts the
  task manager loads (Supabase JS, used only if configured).

## Task Manager
- Storage: works on `localStorage` by default; syncs to **Supabase** when
  `SUPABASE_URL` + `SUPABASE_ANON_KEY` are set at the top of
  `task-manager.js`. The anon value is the **publishable** key (safe for the
  browser); RLS policies allow anon read/write (no login on this tool).
- Supabase tables: `tasks` and `brands`. Brands are reconciled on load from
  `DEFAULT_BRANDS`; retired brands are removed.
- Features: brand-tagged tasks, task types (website_change, maintenance,
  seo_fix, bug, content, other), priorities, due date (calendar-only),
  read-only auto Assigned date, status (todo/in_progress/done) via a per-card
  dropdown, drag-and-drop board, list view (default), search/filters/sort,
  subtasks, details + remarks, view popup, export/import, auto-delete of Done
  tasks after `AUTO_DELETE_DAYS` (2).
- **Pending DB migration** (run in Supabase SQL editor to enable remarks,
  auto-delete and the Personal Stuff scope; writes are resilient without
  these columns, except personal tasks won't save until `scope` exists):
  ```sql
  alter table tasks add column if not exists remarks text;
  alter table tasks add column if not exists completed_at timestamptz;
  alter table tasks add column if not exists scope text default 'work';
  ```

## Personal Stuff (private scope)
- The toolbar has a "Personal Stuff" abyss orb. Clicking it opens a
  password modal (`personal-auth.php`). On success, the page enters
  personal mode: `body.tm-personal-mode` is added, the title swaps, and
  all reads/writes filter by `scope='personal'`. Personal tasks are
  **never** shown in the main (work) view — `getFiltered` and
  `renderStats` filter by `currentScope`.
- Session unlock is cached in `sessionStorage.tm_personal_unlocked` —
  re-entering personal mode in the same tab skips the prompt.
- Password is stored as a **bcrypt hash** in `ai-config.php`
  (`$PERSONAL_PASSWORD_HASH`). The plaintext password is never in the
  repo, in client JS, or in the page source. Generate the hash on the
  server with:
  ```bash
  php -r "echo password_hash('YOUR-PASSWORD', PASSWORD_DEFAULT);"
  ```
  Then append to `ai-config.php`:
  ```php
  $PERSONAL_PASSWORD_HASH = '$2y$10$...';
  ```
- `personal-auth.php` adds a small `usleep` to slow brute-force and never
  returns the hash to the client — only `{ok: true|false}`.
- Cloud sync for personal tasks requires the `scope` column above; if
  it's missing, saves are refused (with a toast) rather than letting the
  task leak into the work view.

### Known JS gotcha
Do NOT declare a top-level variable named `supabase` — it collides with the
global the Supabase CDN library defines and kills the whole script. The
client is stored in `sbClient`.

## AI assistant
- `task-manager.js` chat UI → `POST ai.php` (same origin) → NVIDIA
  OpenAI-compatible endpoint (`integrate.api.nvidia.com`, model
  `meta/llama-3.3-70b-instruct`).
- The NVIDIA API key is **server-side only**, in `ai-config.php`
  (`$NVIDIA_API_KEY`). That file is **gitignored** and exists only on the
  server with `600` perms — never commit it or put the key in client JS.
- The assistant only works on the live site (needs PHP). It asks clarifying
  questions then emits a `<task>{...}</task>` JSON block that pre-fills the
  editor. Voice input uses the browser SpeechRecognition API.

## Deploy workflow
- Host: **Hostinger shared hosting** (not VPS). Web root:
  `~/domains/frankys.site/public_html`, which is a git checkout of this repo.
- GitHub: `https://github.com/darsh574/frankys-site` (public), branch `main`.
- To ship: commit + push to `main`, then on the server run
  `git pull origin main` in the web root. SSH connection details
  (host/user/port/password) are private — ask the user; do not commit them.
- Line endings: working copy is CRLF on Windows; the repo normalizes to LF.
  Byte-size diffs from CRLF→LF on first commit are expected, not content
  changes.
- `register.reg` is gitignored (machine-specific).

## Security notes
- This repo is **public**. Never commit secrets (API keys, tokens,
  passwords) or SSH host details.
- The Supabase publishable key in `task-manager.js` is intentionally public
  and safe for the browser.
