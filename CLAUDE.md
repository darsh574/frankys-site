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
- **Pending DB migration** (run in Supabase SQL editor to enable remarks +
  auto-delete; writes are resilient without them):
  ```sql
  alter table tasks add column if not exists remarks text;
  alter table tasks add column if not exists completed_at timestamptz;
  ```

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
