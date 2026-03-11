# ADHD Financial App

A local-first personal finance app designed for ADHD brains. Brutally honest, low-friction, and impossible to ignore.

## Stack

- **Electron** — desktop container
- **Node.js** — backend (Electron main process)
- **Mithril.js** — frontend UI (no bundler, no build step)
- **SQLite** via `better-sqlite3` — local database, raw SQL, no ORM
- **Plaid** — account sync (with CSV fallback)
- **Twilio** — optional SMS notifications (user provides API key)
- **Google Calendar API** — bill reminders

## Principles

- All data stays on your machine
- No telemetry, no analytics, no third-party data sharing
- Open source (MIT)

## Status

Project scaffolding in progress.
