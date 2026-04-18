# Sprint Plan — 24-Hour Build

## Team

| Person | Role | Owner Slice |
|--------|------|-------------|
| Carl (@carlgombert) | Infrastructure / Backend Build | Core Models, Auth, APIs Contract |
| Zander (@zandermmcg) | Full-Stack Product Eng. | Symptom-to-Care AI Chat |
| Nico (@nico-gb) | Full-Stack Product Eng. | Care Matches & NPPES Search |
| Peter (@petermckinley) | Full-Stack Product Eng. | Insurance & Appointment Workflows |

Rather than blocking on strictly sequential phases, developers own end-to-end "Vertical Slices" and use the API Contract to mock dependencies while running in parallel.

---

## Phase 1 — Setup (8 points)

Get everyone unblocked before writing any feature code.

- [x] Repo created, single `main` branch + `feat/` branches per phase
- [x] Django project + DRF scaffold running locally for all
- [x] React/TS app scaffold running locally for all
- [x] Frontend API connection layer (TanStack React Query + Axios) configured
- [x] `.env.example` committed with all required keys listed

---

## Feature 1 — Symptom-to-Care Agent (16 points)

All four work this end-to-end: backend services, API endpoints, and frontend UI ship together.

**Backend:**
- [ ] LLM Integration (LangChain / SDK) + System Prompt Engineering for Triage
- [ ] Context window handling & extraction of urgency level (ER / urgent / routine)
- [ ] NPPES provider search by ZIP + specialty
- [ ] Endpoint to validate manual insurance entry
- [ ] Booking stub endpoint (mock confirmation + reference number)
- [ ] Chat history endpoint & `/api/symptom/triage/` submission

**Frontend:**
- [ ] AI Chat Interface (conversational symptom gathering)
- [ ] Manual Insurance Info capture form
- [ ] Urgency result display (ER / urgent / routine)
- [ ] Provider list with specialty + location
- [ ] Booking confirmation screen

**Done when:** A user can chat with the AI to describe symptoms, receive a triage result, manually enter insurance, see nearby providers, and get a mock booking confirmation.

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
| Feature 1 backend | Core AI Chat loop successfully resolving triage context |
| Feature 1 done | Full conversational flow + insurance entry works end-to-end |
| Feature 2 backend | Medication endpoint returning real openFDA data |
| Feature 2 done | Full medication flow works end-to-end in browser |
| Integration done | Cross-agent pre-visit report generated and displayed |
| Demo ready | Error handling in place, full walkthrough succeeds |

---

## Risk Log

| Risk | Mitigation |
|------|-----------|
| LLM Hallucinations / Latency | Implement strict JSON schema parsing and fallback triage scores |
| Lexigram onboarding slow | Regex fallback for common drug name extraction |
| Feature 1 scope creep | Hard scope: AI chat + insurance form + providers + booking stub. |
| Feature 2 scope creep | Hard scope: extraction + interactions + recalls. Cut safer alternatives if running over. |
| Integration takes longer than expected | Cut Feature 3 polish, ship with basic cross-agent data flow |