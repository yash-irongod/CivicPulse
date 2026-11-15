# Nivas — User Manual

A guide for residents, committee admins, and maintenance staff.

---

## For Residents

### Reporting an Issue

1. Open the app and tap **Report an Issue** (or go to `/report`)
2. **Describe the problem**: Type a description, or skip if you'll add a photo/voice note
3. **Add a photo** (recommended): Tap "Open Camera" to take a picture of the issue. This helps the maintenance team understand the problem before arriving
4. **Add your location** (optional): Tap "Add your location" to pin where the problem is
5. Tap **Submit Report**
6. You'll see a confirmation with your report reference number

> **Important**: Your report is only confirmed when you see the reference number. If there's an error message, the report was NOT submitted — try again.

### Tracking Your Reports

1. Go to **My Reports** (or `/my-reports`)
2. Each report shows:
   - **Category** — what type of issue (Electrical, Plumbing, etc.)
   - **Status** — where it is in the process (Reported → In Progress → Resolved, etc.)
   - **SLA countdown** — how much time remains for the target resolution
3. Tap **View Progress Details** to see the full timeline of actions taken

### Confirming Resolution

When maintenance staff mark your issue as resolved:

1. You'll see a green button: **"Staff Marked Work Done • Confirm or Dispute"**
2. If the problem IS fixed: Tap and confirm — the ticket closes
3. If the problem is NOT fixed: Tap, select "Dispute", and explain what's still wrong — the ticket reopens and goes back to the maintenance team

---

## For Committee Admins

### Daily Workflow

1. **Check the Dashboard** (`/dashboard`) for a summary of active incidents
2. **Review the Incident Queue** (`/incidents`) — sorted by SLA urgency
   - Overdue tickets appear first with red indicators
   - Critical/High severity tickets have colored left borders

### Managing an Incident

1. Click any incident's reference number (e.g., `#a1b2c3d4`) to open its detail page
2. **Classify**: Set the category and severity using the dropdowns
3. **Assign**: Select the maintenance team from the dropdown
4. **Advance status**:
   - Reported → Validated (you've reviewed it)
   - Validated → Prioritized (severity is set)
   - Prioritized → Assigned (team is assigned)
5. Each action is recorded in the audit trail

### Reviewing Resolution Evidence

When maintenance staff submit their work:

1. The incident shows in the queue with status "Evidence Checked"
2. Open the incident detail page
3. Review the **Before/After Photos** and **Staff Completion Note**
4. If the AI ran, you'll see its confidence assessment (advisory only)
5. Choose:
   - **Approve & Mark Resolved** — advances to Resolved
   - **Request Rework** — sends it back to "Assigned" with your note explaining why

### Handling Duplicates

If the system flags a potential duplicate:

- A yellow banner appears on the incident in the queue
- **Merge Into Target**: Combines both reports into one incident
- **Dismiss Flag**: Keeps them as separate incidents

### Managing Teams

Visit `/teams` to see your maintenance teams and their current workload.

---

## For Maintenance Staff

### Viewing Your Work

1. Go to `/maintenance` (or tap **Staff Work** from the home page)
2. You'll see all incidents assigned to your team, sorted by urgency:
   - **Overdue** items appear first with red badges
   - **Critical/High** severity items have colored indicators

### Working a Job

1. Tap any job to open its detail page
2. Read the description and review any photos from the resident
3. **Start Work**: Tap when you arrive on-site. This records the start time
4. **Do the work**
5. **Submit Resolution**:
   - Tap "Submit Resolution"
   - **Take an after photo** (required) — shows the completed work
   - Add an optional note describing what was done
   - Tap "Submit"
6. Your submission goes to the committee for review

### After Submission

- Your job moves to "Awaiting Committee Review"
- If the committee approves, the ticket proceeds to the resident for final confirmation
- If the committee requests rework, the job returns to your queue with their note

---

## Status Meanings

| Status                     | What It Means                                   |
| -------------------------- | ----------------------------------------------- |
| Reported                   | Resident has submitted the issue                |
| Validated                  | Committee has reviewed and confirmed it's valid |
| Prioritized                | Severity has been set                           |
| Assigned                   | A maintenance team has been assigned            |
| In Progress                | Staff has started work on-site                  |
| Resolution Submitted       | Staff has submitted their completion evidence   |
| Evidence Checked           | AI has assessed the evidence (if enabled)       |
| Resolved                   | Committee has approved the resolution           |
| Awaiting Resident Feedback | Waiting for the resident to confirm it's fixed  |
| Closed                     | Resident confirmed — issue is resolved          |

---

## Getting Help

- **Forgot your login?** Request a new magic link from the admin — they can generate a new claim token
- **Can't find your report?** Check `/my-reports` — all your submissions are listed there
- **Problem not fixed after "Resolved"?** Use the "Dispute" button on your report to reopen it
