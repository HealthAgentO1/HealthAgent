# Sprint Plan — 24-Hour Build

## Team

| Person                 | Role                        | Owner Slice                         |
| ---------------------- | --------------------------- | ----------------------------------- |
| Carl (@carlgombert)    | Infrastructure & Backend AI | Core Setup & Backend LLM Triage/API |
| Zander (@zandermcg)    | Frontend Product Eng.       | AI Symptom Chat UI & Session State  |
| Nico (@nico-gb)        | Full-Stack Product Eng.     | Care Matches & NPPES Search         |
| Peter (@petermckinley) | Full-Stack Product Eng.     | Insurance & Appointment Workflows   |

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
- [ ] context window handling & extraction of urgency level (ER / urgent / routine)
- [ ] NPPES provider search by ZIP + specialty
- [ ] NPPES Data Mapping & Sanitization (Nico)
- [ ] Endpoint to validate manual insurance entry
- [ ] Booking stub endpoint (mock confirmation + reference number)
- [ ] Pre-visit Report Generation Engine (Peter)
- [ ] Chat history endpoint & `/api/symptom/triage/` submission
- [ ] User Session History on Dashboard (Carl)

**Frontend:**

- [ ] Symptom survey UI (free-text symptoms, insurer selection, structured follow-ups—not a chat transcript layout)
- [ ] AI Chat Interface (conversational symptom gathering)
- [ ] Add loading screens/shimmers for AI prompt responses (Carl)
- [ ] Edit AI Chat context management (Peter)
- [ ] Frontend Session Persistence & Recovery (Zander)
- [ ] Manual Insurance Info capture form (aligned with survey; prototype may use a fixed carrier list)
- [ ] Urgency result display (ER / urgent / routine)
- [ ] Provider list with specialty + location
- [ ] Booking confirmation screen

**Done when:** A user can complete the symptom survey, receive a triage result, enter or select insurance context, see nearby providers, and get a mock booking confirmation.

---

## Feature 2 — Medication Safety Agent (16 points)

Same approach — all four move to this feature together.

**Backend:**

- [ ] Lexigram medication extraction from free text (Nico) — [#37](https://github.com/HealthAgentO1/HealthAgent/issues/37)
- [ ] openFDA drug label + interaction lookup (Carl) — [#38](https://github.com/HealthAgentO1/HealthAgent/issues/38)
- [ ] Interaction risk scoring (critical / moderate / low) (Peter) — [#40](https://github.com/HealthAgentO1/HealthAgent/issues/40)
- [ ] openFDA recall check (Nico) — [#39](https://github.com/HealthAgentO1/HealthAgent/issues/39)
- [ ] Safer alternatives logic (Peter) — [#40](https://github.com/HealthAgentO1/HealthAgent/issues/40)
- [ ] Alert notification stub (email log or webhook) (Peter) — [#40](https://github.com/HealthAgentO1/HealthAgent/issues/40)
- [ ] `/api/medication/check/` endpoint returning full shaped response (Carl) — [#41](https://github.com/HealthAgentO1/HealthAgent/issues/41)

**Frontend:**

- [ ] Medication input form (free text) (Zander) — [#42](https://github.com/HealthAgentO1/HealthAgent/issues/42)
- [ ] Alert cards by severity (critical / moderate / low) (Zander) — [#43](https://github.com/HealthAgentO1/HealthAgent/issues/43)
- [ ] Safer alternatives display (Zander) — [#43](https://github.com/HealthAgentO1/HealthAgent/issues/43)
- [ ] Recall warning display (Zander) — [#43](https://github.com/HealthAgentO1/HealthAgent/issues/43)

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

| Checkpoint        | Done when                                                   |
| ----------------- | ----------------------------------------------------------- |
| Setup complete    | Everyone can run Django + React locally, API keys queued    |
| Feature 1 backend | Core AI Chat loop successfully resolving triage context     |
| Feature 1 done    | Full conversational flow + insurance entry works end-to-end |
| Feature 2 backend | Medication endpoint returning real openFDA data             |
| Feature 2 done    | Full medication flow works end-to-end in browser            |
| Integration done  | Cross-agent pre-visit report generated and displayed        |
| Demo ready        | Error handling in place, full walkthrough succeeds          |

---

## Risk Log

| Risk                                   | Mitigation                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| LLM Hallucinations / Latency           | Implement strict JSON schema parsing and fallback triage scores                          |
| Lexigram onboarding slow               | Regex fallback for common drug name extraction                                           |
| Feature 1 scope creep                  | Hard scope: AI chat + insurance form + providers + booking stub.                         |
| Feature 2 scope creep                  | Hard scope: extraction + interactions + recalls. Cut safer alternatives if running over. |
| Integration takes longer than expected | Cut Feature 3 polish, ship with basic cross-agent data flow                              |
