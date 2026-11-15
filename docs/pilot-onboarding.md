# Nivas Pilot Onboarding Runbook (Phase 12.2)

Step-by-step onboarding guide for launching a pilot with an Indian housing society, RWA, or residential community.

---

## 1. Pre-Onboarding Committee Interview

Before touching the database, conduct an interview with the Society Secretary / Facility Manager to gather real operational data:

1. **Existing Baseline**:
   - How are complaints handled today? (WhatsApp group, paper logbook, phone calls)
   - Estimated average resolution time for typical complaints (e.g. 4 days for plumbing, 2 days for electrical).
2. **Real Category List**:
   - Do not invent generic categories. Record their actual vendors:
     - Electrical
     - Plumbing
     - Lifts / Elevators
     - Water Supply / Tankers
     - Civil / Masonry
     - Waste / Housekeeping
     - Security / Gates
3. **Internal Teams & Staff**:
   - Who handles each category? (e.g., In-house electrician vs. third-party annual maintenance contractor).
4. **SLA Expectations**:
   - Target resolution hours per severity:
     - Critical (4 hours)
     - High (24 hours)
     - Medium (72 hours)
     - Low (7 days)

---

## 2. Community Tenant Provisioning (SQL)

Execute the following in the Supabase SQL Editor to seed the community and spaces:

```sql
-- 1. Create Community
insert into communities (id, name, terminology)
values (
  '11111111-1111-1111-1111-111111111111',
  'Gulmohar Greens RWA',
  '{"community_label": "Society", "space_label": "Flat"}'::jsonb
);

-- 2. Create Blocks and Spaces (Flats)
insert into spaces (community_id, name, geo)
values
  ('11111111-1111-1111-1111-111111111111', 'Tower A - 101', 'SRID=4326;POINT(77.2090 28.6139)'),
  ('11111111-1111-1111-1111-111111111111', 'Tower A - 102', 'SRID=4326;POINT(77.2091 28.6140)'),
  ('11111111-1111-1111-1111-111111111111', 'Basement Parking B1', 'SRID=4326;POINT(77.2085 28.6135)');

-- 3. Configure Real Categories
insert into categories (id, community_id, name)
values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Electrical'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Plumbing'),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Housekeeping / Waste'),
  ('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', 'Lift / Elevator');

-- 4. Configure Maintenance Teams
insert into teams (id, community_id, name)
values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', 'In-House Electricians'),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', 'Plumbing Contractors'),
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111111', 'Housekeeping Staff');

-- 5. Wire Team Categories
insert into team_categories (team_id, category_id)
values
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201'),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222202'),
  ('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222203');

-- 6. Seed SLA Policies
insert into sla_policies (community_id, category_id, severity, target_hours)
values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222201', 'critical', 4),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222201', 'high', 24),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222202', 'critical', 4),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222202', 'medium', 72);
```

---

## 3. Resident Roster Upload & Claim Distribution

1. **Upload Roster Rows**:
   Admins upload the resident roster into `resident_roster` with resident name, flat space ID, and phone number (contact field only).
2. **Distribute Claim Links**:
   Each resident receives a one-time pass link:
   `https://[your-app-domain]/auth/claim?token=[claim_token]`
3. **Resident Verification**:
   The resident enters their email on the claim page to receive a secure magic-link session tying their account to their apartment membership.

---

## 4. Committee Training Checklist (15-Minute Onboarding)

Hold a 15-minute walkthrough with the Secretary and Estate Manager:

- [ ] **Morning Health Check**: Review the Community Health score (0-100) on `/dashboard`.
- [ ] **Queue Triage**: Walk through `/incidents`:
  - Show how SLA sorts overdue tickets to the top.
  - Demonstrate one-tap duplicate merging for reports regarding the same issue.
  - Explain left-edge severity color indicators (Brick = Critical, Marigold = High).
- [ ] **Physical Verification Step**:
  - Open `/teams` and show how Before/After photos are inspected with AI reasoning.
  - Emphasize that **AI never resolves on its own** — human approval is required.
- [ ] **Resident Feedback Loop**:
  - Show how closed tickets notify residents with a simple "Was this fixed?" check, and disputing reopens the ticket back to the assigned team.
