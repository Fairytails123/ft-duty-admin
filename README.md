# Fairy Tails — Duty Admin

A small vanilla-JS PWA to manage the day-care duty **rota**, **reminders** and **staff** for the
[FT Duty Reminder System](../RUNBOOK.md). Hosted on GitHub Pages.

## How it works
- Static site (no build step). It calls **one n8n webhook "Admin API"** which reads/writes the
  derived Google Sheet (`FT Duty Reminders`). The site never holds Google credentials.
- Access is gated by an **admin token** you enter once (stored in `localStorage`, sent to the API on each request).
- API endpoint: `POST https://ftmanager.app.n8n.cloud/webhook/ft-duty-admin`
  body `{ token, action, payload }`, actions: `bootstrap`, `saveRota`, `saveReminder`, `saveStaff`, `saveRiskDog`.

## Tabs
- **Rota** — pick a week (Monday) and set each active staff member's shift pattern; Save.
- **Reminders** — add/edit reminders (title, message, time, days, "requires Done", done-window, active) **plus a Conditions builder**: dropdowns/checkboxes that gate firing on *who's on duty* (role/person/pattern/count), *date* (day-of-month/nth-weekday/specific date/last-working-day), and *dog in today*. Composes the `condition` string the engine evaluates (`onduty:` / `date:` / `dog:`, `;`-joined = AND).
- **Staff** — edit names/roles/active; copy each person's onboarding link (`t.me/FTDuties_bot?start=<staff_id>`).
  Chat IDs are captured automatically when staff tap their link (onboarding only sets the chat_id, never `active`).
- **Risk Dogs** — list risk-assessed dogs (`dog_name`, *In today*, risk notes). A reminder with condition `dog:<name>` fires only on days that dog is ticked **In today** — e.g. a muzzling reminder.

## Note on new reminder *times*
The engine fires from per-time schedules in n8n. Editing an existing reminder's content takes effect
immediately, but a reminder at a **brand-new time of day** also needs a matching schedule added in n8n.

## Changing the admin token
Edit the `Auth` node in the n8n "FT Duty Reminders - Admin API" workflow, then re-enter the new token in the site.

## Local preview
Any static server, e.g. `npx serve .` — but the API only allows the deployed origin via CORS (`*` by default).
