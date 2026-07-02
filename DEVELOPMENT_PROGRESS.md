# Codex H5 Remote Controller Development Progress

Last updated: 2026-07-02

This document is the shared alignment board for phased development. Each phase records the goal, acceptance criteria, current status, and important decisions or risks.

## Current Delivery State

Status: Complete

Summary:
- Phase 1 through Phase 5 are complete.
- The H5 controller can connect to the local Fastify server, authorize a browser session, upload real files and images, and stream either mock adapter output or real Codex CLI terminal output.
- The current live validation mode uses `CODEX_ADAPTER=pty CODEX_WORKSPACE=/path/to/workspace CODEX_CLI_ARGS="--no-alt-screen --sandbox read-only --ask-for-approval never" npm run dev:server`.
- The web client runs at `http://localhost:5173/` and the server runs at `http://localhost:8787/`.
- The server keeps one active Codex adapter per authorized device session. WebSocket disconnects detach from the adapter instead of killing it immediately; reconnects within the keep-alive window attach to the same Codex session and receive the latest output snapshot.
- Pairing is now server-initiated. The H5 page no longer creates or consumes a pairing token automatically; a phone must scan a server-generated QR code and confirm authorization before it can enter the controller.

Recent real-Codex fixes:
- Replaced Codex TUI Markdown rendering with headless terminal snapshots using `@xterm/headless`.
- Fixed Codex slash-command submission by using bracketed paste plus Enter, because ordinary pty writes left `/status` in the prompt buffer without executing it.
- Cleared stale Codex prompt input before each H5 send, preventing command concatenation such as `status/review`.
- Added raw key passthrough for Codex TUI menus. H5 inputs `1`-`9`, `enter`/`回车`, `esc`, `up`/`down`/`left`/`right`, arrow symbols, and Chinese direction words are sent as pty keypresses instead of prompt text.
- Token display now remains `Token --` until real `/status` output contains a usage percentage; when Codex returns a line such as `5h limit: ... 57% left`, the token pill updates to `Token 57%`.
- Moved the Codex icon to the left side of the status bar.
- Removed `/help` from quick commands because the current Codex CLI does not support it; `/review` is now used instead.
- Replaced mock upload generation with real browser file inputs for images and files. Uploaded attachments go through `POST /api/uploads`, are persisted in SQLite, and are passed to Codex as authorized local `@path` references.
- Floating controls now dismiss automatically on outside click, Escape, scroll, input focus, send, or selection. This covers the upload menu, slash command menu, and token details popover.
- Added a lightweight backend session manager for single-active Codex pty reuse. `CODEX_SESSION_KEEPALIVE_MS` controls how long an idle adapter is retained after the last H5 WebSocket disconnects; the default is 10 minutes.
- Added server-side pairing and device management commands: `npm run pair -- http://host:5173`, `npm run devices:list`, and `npm run devices:revoke -- <sessionId>`.
- Added admin APIs for pairing and device management. They are loopback-only by default, or protected by `CODEX_ADMIN_TOKEN` when that environment variable is set.
- Public `/api/auth/qr-session` no longer creates pairing tokens. Pairing sessions must be created from the server CLI or admin API.
- Device revocation marks the session revoked, closes active controller WebSockets when using the admin API, and active sockets also re-check authorization periodically.
- Added a virtual key strip for real Codex TUI prompts. Users can send Up, Down, Enter, Esc, and numeric choices without typing raw key aliases; the slash-command wheel now lives in the same strip so 320px screens keep the composer full-width.
- Added an input mode badge so the composer clearly distinguishes `PROMPT`, `CMD`, `KEY`, and `ATTACH` sends before submission.
- Added terminal output display modes: `Fit` for dense mobile viewing, `Wrap` for readable narrow screens, and `Raw` for faithful terminal layout with horizontal scroll.
- H5 input is no longer blocked during `thinking` or `streaming` status, because real Codex TUI prompts can request numeric or keyboard input while output is still active.
- Polished the mobile TUI control layer: slash commands now show descriptions with a lighter selected state, virtual keys have pressed feedback and mobile haptic feedback, and terminal output has edge fades plus light prompt/status line highlighting.
- Applied a dark cockpit UI refresh based on the taste-skill review direction: double-bezel controller shell, telemetry status bar, terminal material output surface, command Dock input, unified popover material, and low-profile virtual key rail.
- Removed numeric `1`-`4` buttons from the virtual key rail. Codex TUI menu selection now favors `Up`/`Down` plus `Enter`, keeping the mobile control strip simpler and less error-prone.
- Virtual keys, slash-command buttons, and upload controls no longer focus the textarea. Mobile keyboards should only open when the user explicitly taps the prompt input.
- Added non-intrusive Token telemetry refresh. The backend probes `/status` through a separate short-lived Codex process and pushes the parsed percentage to H5, avoiding writes into the active Codex TUI session.
- Adjusted terminal layout toward a Termius-like dense canvas: reduced output side padding, increased terminal font readability, and expanded the virtual key rail with Tab, Shift+Tab, and Ctrl+C while keeping it horizontally scrollable.
- Moved the virtual key rail above the composer, restored a denser terminal font size, and fixed the slash command dots interaction after the key rail layout change.
- Switched the terminal default from Raw to Wrap and reduced terminal padding/font size so mobile screens show more content per line with less horizontal scrolling.
- Hardened the background Token probe by delaying and retrying the isolated `/status` request, because the first write can be ignored while Codex TUI is still starting.

Latest verification:
- `npm run check:web`
- `npm run check:server`
- `npm run build:web`
- `npm run build:server`
- Real Codex `/status` H5 test: one send executes immediately and updates the token pill when limit percentages are present.
- Real Codex `/review` menu test: numeric selection and arrow-key navigation work through raw pty key passthrough.
- Real upload H5 test: uploaded `real-notes.md` and `real-pixel.png`; both appeared as attachment chips and went through the server upload API.
- Floating popover H5 test: token details, slash command menu, and upload menu all close when interacting outside them.
- Session keep-alive smoke test: using the same session token, a WebSocket reconnect received the previous output snapshot instead of starting a new adapter.
- Mobile UI polish test: slash command descriptions render, virtual key press state is applied, Fit/Wrap/Raw modes still switch correctly, and 320px/390px/480px responsive screenshots stay within the viewport.
- Pairing CLI test: `npm run pair -- http://127.0.0.1:5173` prints a terminal QR code, pairing URL, QR ID, and expiration time.
- Pairing API injection test: public QR creation returns `403`, admin pairing creation returns `200`, scanned-token authorization returns `200`, device listing includes the new session, revocation returns `200`, and the revoked session returns `401`.
- H5 auth flow test: default page renders the unpaired state; `/mobile?token=...` renders an explicit device authorization confirmation.

## Phase 6: Taste-Skill UI Refresh

Status: Complete

Goal:
- Upgrade the H5 controller from a plain dark utility screen to a more polished mobile Codex cockpit.
- Preserve current Codex TUI behavior and avoid changing business logic.
- Reduce the bottom virtual key strip to the controls that matter most on mobile.

Acceptance criteria:
- The app keeps the same auth, upload, WebSocket, and Codex input behavior.
- Header, output panel, input dock, virtual key strip, and popovers share one coherent dark terminal design language.
- The virtual key strip keeps slash command entry, Up, Down, Enter, and Esc, and removes numeric shortcuts from the default row.
- 320px, 390px, and 480px widths remain usable without horizontal page scroll.

Completion:
- [x] Taste-skill review direction applied to the current product context.
- [x] Status bar refreshed with Codex identity, status, session chip, and Token telemetry popover.
- [x] Terminal output surface refreshed with subtle scanlines, stronger edge fades, and a pill-style Fit/Wrap/Raw control.
- [x] Input area refreshed into a command Dock with improved add/send hardware-key treatment.
- [x] Virtual key rail simplified to slash commands, Up, Down, Enter, and Esc.
- [x] Upload, slash command, and token popovers aligned to one translucent control material.

Notes:
- The numeric raw key aliases are still supported if typed manually. Only the visible mobile shortcut buttons were removed.
- This phase intentionally avoids adding heavy animation libraries or decorative marketing visuals, because the product is an operational Codex control tool.
- Verification completed with `npm run check:web`, `npm run build:web`, and `npm --workspace apps/web run verify:responsive -- http://localhost:5173/`.
- Controller-state browser metrics were checked at 320px, 390px, and 480px. Document width matched viewport width, and the output panel did not overlap the input panel.

## Phase 1: Static H5 Prototype

Status: Complete

Goal:
- Initialize a React + TypeScript + Vite mobile H5 app.
- Implement the single-screen controller shell from the PRD and visual design.
- Use mock data to show Codex status, token remaining, streaming-style output, attachments, input, and slash command selection.

Acceptance criteria:
- The app opens to one mobile-first screen with status bar, output panel, and fixed bottom input area.
- The output panel renders Markdown-like content, code blocks, logs, and supports native text selection.
- The output panel scrolls independently and does not overlap the input area.
- The input area includes upload entry, multiline textarea, enter-send icon, attachment chip, and slash command wheel.
- The slash command list includes `/status`, `/review`, `/compact`, `/model`, `/clear`, and `/resume`.
- The layout works at 320px, 390px, and 480px widths with no horizontal page scroll.

Completion:
- [x] Project skeleton created.
- [x] Core controller screen implemented.
- [x] Mock output and interactions implemented.
- [x] TypeScript and production build verification completed.
- [x] Responsive browser review completed.

Notes:
- The project root currently has no existing app code.
- `docs` is a symlink to an external workspace, so this progress file lives in the project root.
- Phase 1 intentionally does not connect to a real server or Codex CLI.
- Verification completed with `npm run check:web` and `npm run build:web`.
- Dev server verified with `curl -I http://localhost:5173/` returning `HTTP/1.1 200 OK`.
- Responsive verification completed with `npm --workspace apps/web run verify:responsive -- http://localhost:5174/`.
- Responsive screenshots were generated under `/tmp/codex-remote-responsive`.
- Small fix applied: slash command popover now defaults to collapsed, matching the PRD default state.
- Header update applied: Codex text brand was replaced with the provided top-right Codex icon asset.

## Phase 2: Local Server Skeleton

Status: Complete

Goal:
- Add a Fastify + TypeScript server app.
- Define REST and WebSocket protocol skeletons from the technical design.
- Mock authorization, command list, upload metadata, status updates, and output chunks.

Acceptance criteria:
- `POST /api/auth/qr-session` returns a mock QR session.
- `GET /api/commands` returns the MVP slash commands.
- `POST /api/uploads` accepts file metadata or multipart upload in a controlled path.
- `/ws/controller` accepts an authorized mock session and streams mock status/output events.

Completion:
- [x] Server app initialized.
- [x] REST routes implemented.
- [x] WebSocket route implemented.
- [x] Web app can consume mock server data.

Notes:
- SQLite and real auth can be introduced after protocol shape is stable.
- Fastify server app added under `apps/server`.
- Implemented `/health`, `POST /api/auth/qr-session`, `GET /api/auth/qr-session/:qrId`, `GET /api/commands`, `POST /api/uploads`, and `/ws/controller`.
- WebSocket mock validates `sessionToken=dev`, sends initial status/output, accepts `input.send` and `command.send`, and streams mock chunks.
- Web app now fetches slash commands, uploads mock attachments through the server, and consumes controller WebSocket events.
- Development WebSocket connections bypass Vite's WS proxy on `517x` ports and connect directly to the local server on `8787`; production/non-Vite ports keep same-origin `/ws/controller`.
- Verification completed with `npm run check:web`, `npm run check:server`, `npm run build:web`, and `npm run build:server`.
- Smoke tests completed for `/health`, `/api/commands`, `POST /api/auth/qr-session`, `POST /api/uploads`, direct `/ws/controller`, and H5 rendering at `390x844`.

## Phase 3: Codex Session Adapter

Status: Complete

Goal:
- Introduce a `CodexAdapter` boundary.
- Use `node-pty` to start and drive a local Codex CLI session.
- Stream Codex output back through WebSocket.

Acceptance criteria:
- User input from H5 reaches Codex CLI.
- Slash commands can be sent to the Codex session.
- Codex output streams back to the H5 output panel.
- Adapter reports `idle`, `thinking`, `streaming`, `offline`, or `error`.

Completion:
- [x] Adapter interface defined.
- [x] Mock adapter implemented.
- [x] node-pty adapter implemented.
- [x] Output streaming verified locally.

Risks:
- Codex CLI output and token/status formats may change. Parsing must remain isolated inside the adapter.

Notes:
- Added `CodexAdapter` boundary under `apps/server/src/modules/codex`.
- WebSocket route now delegates all Codex session behavior to the adapter and only handles auth, parsing client messages, forwarding server events, and disposal on close.
- Default adapter remains mock-backed for stable local development and demos.
- `CODEX_ADAPTER=pty` enables the node-pty adapter. By default it launches `codex --no-alt-screen`; override with `CODEX_CLI_COMMAND`, `CODEX_CLI_ARGS`, and `CODEX_WORKSPACE`.
- node-pty adapter forwards terminal output as `output.chunk`, writes `input.send` and `command.send` payloads into the pty, reports `thinking`, `streaming`, `idle`, `offline`, and `error`, and normalizes basic ANSI terminal output inside the adapter.
- Real Codex TUI output now uses a headless terminal buffer and sends `terminal` snapshots to the H5 client instead of treating ANSI output as Markdown.
- Codex TUI input is submitted with bracketed paste plus Enter. This prevents slash commands from sitting in the prompt buffer, removes stale prompt input before each send, and avoids command concatenation such as `status/review`.
- Codex TUI menu selections use raw pty key passthrough for numeric choices, Enter, Escape, and arrow navigation.
- `/status` output is parsed for real usage percentages such as `5h limit: ... 57% left`; the H5 token pill stays `Token --` until a real percentage appears.
- Verification completed with `npm run check:server` and `npm run build:server`.
- Smoke tests completed for the default mock WebSocket flow and for the pty flow using `/bin/sh` as a lightweight stand-in process.
- Real Codex verification completed with `codex --no-alt-screen --sandbox read-only --ask-for-approval never`: startup, terminal rendering, `/status` execution, token percentage extraction, and H5 display were verified.
- Added `CodexSessionManager` so each authorized device session can reuse one active adapter across short H5 disconnects. When the last socket detaches, the adapter is kept alive for `CODEX_SESSION_KEEPALIVE_MS` milliseconds, defaulting to 10 minutes.
- Reconnects receive the latest status and output snapshot before new events stream in. This is intentionally smaller than full historical session browsing.

## Phase 4: Authorization And Uploads

Status: Complete

Goal:
- Implement real one-time QR tokens and session tokens.
- Add SQLite persistence for auth sessions, device sessions, command catalog, and attachments.
- Save uploaded files into an isolated local upload directory.
- Require server-initiated QR pairing before a phone can open the controller.
- Support server-side device listing and authorization revocation.

Acceptance criteria:
- QR token expires after a short window and can be used only once.
- Pairing tokens can only be created from the server CLI or admin API, not by an arbitrary H5 page load.
- Unauthorized REST and WebSocket requests do not expose Codex output.
- Session token is checked during WebSocket handshake.
- Revoked sessions cannot continue using REST APIs and active WebSockets are closed or rejected on authorization re-check.
- Uploaded files are renamed server-side and size/type limited.
- Attachments can be sent with user input.

Completion:
- [x] SQLite schema added.
- [x] QR session lifecycle implemented.
- [x] Device session lifecycle implemented.
- [x] Server-initiated QR pairing implemented.
- [x] Device list and revoke implemented.
- [x] Upload storage implemented.
- [x] Attachment handoff to Codex input implemented.

Risks:
- Production deployments must set `PUBLIC_CONTROLLER_URL` to a phone-reachable URL before printing pairing QR codes. Admin HTTP APIs should set `CODEX_ADMIN_TOKEN` if exposed beyond loopback.

Notes:
- Added SQLite persistence through `better-sqlite3`; default database path is `data/controller.sqlite`, override with `CONTROLLER_DATA_DIR` or `CONTROLLER_DATABASE_PATH`.
- Added `qr_sessions`, `device_sessions`, and `attachments` tables.
- `npm run pair -- http://host:5173` creates a short-lived one-time token and prints a terminal QR code plus fallback URL.
- `POST /api/admin/pairing-sessions` creates pairing sessions for API-driven workflows. It is loopback-only by default, or Bearer-token protected when `CODEX_ADMIN_TOKEN` is set.
- `POST /api/auth/authorize` consumes a scanned pairing token once and issues a device session token.
- `GET /api/auth/session`, `GET /api/commands`, `POST /api/uploads`, attachment preview, and `/ws/controller` now require a valid session token.
- The H5 app stores the session token in `localStorage`, sends Bearer auth for REST calls, and passes the token to WebSocket handshakes.
- The H5 app no longer auto-authorizes. Without a valid session it shows an unpaired state; when opened with `/mobile?token=...`, it shows an explicit "authorize this device" confirmation before entering the controller.
- `npm run devices:list` shows recent paired devices, with `--all` or `--limit N` for larger lists.
- `npm run devices:revoke -- <sessionId>` revokes a device session in SQLite. Admin API revocation also closes active sockets and disposes the active Codex session.
- Uploads are server-renamed, stored under the isolated upload directory, size-limited to 20 MB, MIME-limited, and persisted in SQLite.
- H5 upload controls now use real hidden file inputs for images and files. The previous mock `new File(...)` upload path was removed.
- WebSocket input maps authorized attachment IDs to local `@path` references before passing input to the Codex adapter.
- Verification completed with `npm run check:web`, `npm run check:server`, `npm run build:web`, and `npm run build:server`.
- Smoke tests completed for unauthorized REST rejection, CLI QR creation, admin QR creation, one-time authorization, device listing, device revocation, authorized commands, authorized multipart upload, authorized WebSocket output streaming, H5 pairing screens, H5 command interaction, real file upload, real image upload, and H5 upload UI.

## Phase 5: Mobile Experience Hardening

Status: Complete

Goal:
- Polish mobile behavior, error states, reconnect behavior, token display, and responsive layout.

Acceptance criteria:
- Auto-scroll resumes only when the user is near the bottom.
- Manual upward scroll pauses auto-scroll and shows a small return-to-bottom control.
- Offline, error, thinking, streaming, and idle states are visually distinct.
- Token display degrades to `Token --` when unknown.
- Small screen token text can shrink to `T 72%`.
- Playwright screenshots pass at 320px, 390px, and 480px.

Completion:
- [x] Auto-scroll behavior hardened.
- [x] Reconnect/offline UI implemented.
- [x] Token details interaction implemented.
- [x] Responsive screenshots verified.

Risks:
- Mobile browser lock-screen behavior may interrupt WebSocket connections frequently.

Notes:
- Output panel now tracks whether the user is near the bottom. New output auto-scrolls only while pinned to the bottom.
- Manual upward scrolling pauses auto-scroll and shows a compact return-to-bottom control.
- WebSocket hook now reconnects automatically with capped backoff after unexpected close while a session token is available.
- Backend WebSocket reconnects now reattach to the retained Codex adapter for the same authorized device session when still inside the keep-alive window.
- Unauthorized, offline, error, thinking, streaming, and idle states have distinct status and inline treatment.
- Token display already degrades to `Token --` when unknown and now exposes a compact token details popover.
- Small screens use the short `T 72%` token label.
- Verification completed with `npm run check:web`, `npm run build:web`, and `npm --workspace apps/web run verify:responsive -- http://localhost:5173/`.
- Playwright interaction checks completed for paused auto-scroll, return-to-bottom, token details, H5 auto-auth, command selection, and upload UI.
- Floating controls close on outside click, Escape, scroll, input focus, send, and menu selection.
- Added Codex TUI mobile controls: virtual key strip, composer input mode badge, Fit/Wrap/Raw terminal output modes, and full-width composer constraints for 320px screens.
- Responsive screenshots were generated under `/tmp/codex-remote-responsive` for 320px, 390px, and 480px widths.
