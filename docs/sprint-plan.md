# Sprint Plan — 24-Hour Build

## Team

| Person | Role |
|--------|------|
| Dev 1 | Backend engineering |
| Dev 2 | Backend engineering |
| Dev 3 | Frontend engineering |
| Dev 4 | Full-stack engineering |

All four developers work together on each feature in sequence before moving to the next.

---

## Phase 1 — Setup (8 points)

Get everyone unblocked before writing any feature code.

- [ ] Repo created, single `main` branch + `feat/` branches per phase
- [ ] Django project + DRF scaffold running locally for all
- [ ] React/TS app scaffold running locally for all
- [ ] `.env.example` committed with all required keys listed
- [ ] API keys distributed — start Infermedica + Lexigram signups now (can have delays)
- [ ] User model + JWT auth
- [ ] `SymptomSession` and `MedicationProfile` models + migrations
- [ ] Docker Compose: postgres + django + react
- [ ] Agree on API contract shape for Feature 1 before writing any code

---

## Feature 1 — Symptom-to-Care Agent (16 points)

All four work this end-to-end: backend services, API endpoints, and frontend UI ship together.

**Backend:**
- [ ] Infermedica `/parse` + `/interview` integration
- [ ] Triage scoring → urgency level (ER / urgent / routine)
- [ ] NPPES provider search by ZIP + specialty
- [ ] Healthcare.gov insurance check (mock if API is slow to access)
- [ ] Booking stub endpoint (mock confirmation + reference number)
- [ ] `/api/symptom/triage/` endpoint returning full shaped response

**Frontend:**
- [ ] Symptom input form + follow-up question flow
- [ ] Urgency result display (ER / urgent / routine)
- [ ] Provider list with specialty + location
- [ ] Booking confirmation screen

**Done when:** A user can enter symptoms, receive a triage result, see nearby providers, and get a mock booking confirmation — fully working in the browser.

---

## Feature 2 — Medication Safety Agent (16 points)

Same approach — all four move to this feature together.

**Backend:**
- [ ] Lexigram medication extraction from free text
- [ ] openFDA drug label + interaction lookup
- [ ] Interaction risk scoring (critical / moderate / low)
- [ ] openFDA recall check
- [ ] Safer alternatives logic
- [ ] Alert notification stub (email log or webhook)
- [ ] `/api/medication/check/` endpoint returning full shaped response

**Frontend:**
- [ ] Medication input form (free text)
- [ ] Alert cards by severity (critical / moderate / low)
- [ ] Safer alternatives display
- [ ] Recall warning display

**Done when:** A user can enter their medications, see a risk-scored list of interactions and recalls, and view safer alternatives — fully working in the browser.

---

## Feature 3 — Integration (8 points)

Connect the two agents and build the cross-agent flow.

- [ ] Medication list from Feature 2 feeds into pre-visit report in Feature 1
- [ ] Pre-visit report generation (structured summary for doctor)
- [ ] Pre-visit report display in symptom flow UI
- [ ] Shared user context: one profile, both agents aware of it
- [ ] Demo seed data script (sample symptom session + medication profile)

**Done when:** A user who has used both agents gets a pre-visit report that includes their symptom summary and their current medication list.

---

## Phase 4 — Demo Prep (4 points)

- [ ] Error states in UI (API failures, empty results)
- [ ] Loading states on all async calls
- [ ] Full walkthrough of both flows as a team
- [ ] Cut anything not working cleanly — a tight demo of 80% beats a broken demo of 100%
- [ ] README setup instructions verified by someone running it fresh

---

## Velocity & Capacity

**Total points:** 52  
**Team capacity:** ~13 points per 24-hour sprint with breaks and sync overhead  
**Safe scope:** Features complete with margin for API delays and bug fixes

---

## Sync Points

| Checkpoint | Done when |
|-----------|-----------|
| Setup complete | Everyone can run Django + React locally, API keys queued |
| Feature 1 backend | Triage endpoint returning real Infermedica data |
| Feature 1 done | Full symptom flow works end-to-end in browser |
| Feature 2 backend | Medication endpoint returning real openFDA data |
| Feature 2 done | Full medication flow works end-to-end in browser |
| Integration done | Cross-agent pre-visit report generated and displayed |
| Demo ready | Error handling in place, full walkthrough succeeds |

---

## Risk Log

| Risk | Mitigation |
|------|-----------|
| Infermedica API signup delayed | Prepare mock interview fixture, unblock frontend work |
| Lexigram onboarding slow | Regex fallback for common drug name extraction |
| Healthcare.gov API complexity | Mock coverage check with hardcoded response |
| Feature 1 scope creep | Hard scope: triage + providers + booking stub. Cut provider detail if running over. |
| Feature 2 scope creep | Hard scope: extraction + interactions + recalls. Cut safer alternatives if running over. |
| Integration takes longer than expected | Cut Feature 3 polish, ship with basic cross-agent data flow |