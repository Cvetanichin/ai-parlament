# User Guide

## 1. Ten-minute tutorial

1. **Open** `index.html`. The Dashboard shows a Getting Started checklist.
2. **Load sample data**: Settings > Data > Load sample data. This adds one project, five tasks and one document so every screen has content. Delete them when done.
3. **Add a task**: type in the Dashboard quick-add box, optionally set a date, press Add. Open Edit to set effort (hours), priority and project.
4. **Read the Dashboard**
   - *Needs attention*: overdue and due within 48 hours.
   - *Next 14 days*: tasks and imported calendar events.
   - *Workload*: hours due in the next 7 days against your capacity (working hours per weekday x weekdays). Red means overloaded.
5. **Run an agent**: AI agents > Project Drafting Agent. Fill the form.
   - With an API key: *Run agent*, then *Import tasks*.
   - Without: *Prompt Pack (copy)*, paste into Claude, copy the answer back via *Save to Library* (paste into a new document).
6. **Import your calendar**: export `.ics` from your calendar app; Calendar > Import. Events matching `deadline|due|submit` become tasks (change the pattern in Settings).
7. **Version a document**: Library > New document. Save, edit, save again, then History > Compare > Restore.
8. **Back up**: Settings > Data > Export backup (or Export encrypted).

## 2. Daily routine (5 minutes)

1. Open the Dashboard; clear *Needs attention*.
2. Check *Workload*. If red, run the Deadline agent with "Replan my next 7 days", review the proposed changes, press Apply for those you accept.
3. Rate each agent output Yes or No. This feeds Insights.

## 3. Weekly routine (15 minutes)

1. Insights > Generate weekly review document (saved to Library).
2. Fix tasks without dates or effort (listed in Recommendations).
3. Export a backup.

## 4. Feature reference

### Tasks and projects
- Fields: title, due date, effort, priority (1 to 3), status (to do, in progress, done), project, notes.
- Project progress is the share of its tasks marked done.

### Reminders
- Choose lead days (7, 3, 2, 1, on the day) in Settings. An in-app message appears once per task per lead day; overdue tasks remind once per day.
- Browser notifications (optional) work only while the page is open.
- For alerts when the page is closed: Calendar > Export deadlines (.ics) and import into your calendar. Each deadline carries 3-day and 1-day alarms.

### Agents
| Agent | Give it | You get | Does not do |
|---|---|---|---|
| Creative Writing | topic, audience, tone, style, trusted facts | headlines, draft, editor's notes with `[VERIFY]` items | invent facts, quotes or statistics |
| Research and Analysis | question, scope, pasted sources | graded findings, source register, gaps | browse the web; cite anything you did not paste |
| Project Drafting | idea, dates, template | outline, work plan, risks, importable tasks | know your budget or partners unless told |
| Deadline Tracking | request (snapshot is automatic) | priorities, conflicts, day plan, proposed changes | change anything without your Apply |

See `AGENTS.md` for tuning prompts and adding your own.

### Library
- Create, import (`.md`, `.txt`, `.csv`, `.json`) and download documents.
- Every save with changed content creates a version (last 30 kept). History shows a line diff; Restore creates a new version rather than overwriting.
- The search box (top right of every page) searches documents, tasks and projects; titles rank above body text.

### Customisation
- Theme (system, light, dark, high contrast), density, accent colour.
- Dashboard widgets: show, hide, reorder.
- Agents: disable unused ones; add custom agents with your own system prompt.

### Data and privacy
- Stored in IndexedDB in this browser. Nothing leaves it except the request you trigger with *Run agent* (to api.anthropic.com).
- Backups exclude the API key. Encrypted backups use a passphrase you must not lose.

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Run fails with "invalid x-api-key" | Wrong or revoked key | Re-enter in Settings |
| Run fails with "model not found" | Model ID typed wrongly or retired | Update Model ID in Settings |
| Run fails "Failed to fetch" | Offline, ad blocker or corporate proxy | Use Prompt Pack, or allow api.anthropic.com |
| Answer cut off | Max tokens too low | Raise in Settings (up to 16000) |
| Data missing after restart | Private window or cleared site data | Restore from backup; use a normal profile |
| No reminders | Page closed or notifications blocked | Keep a tab open or use the calendar export |
| Calendar events missing | Recurring events are not expanded | Only the first occurrence is imported |
