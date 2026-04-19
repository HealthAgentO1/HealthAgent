## Architectural alignment

**What matches the docs**

- **Survey-first flow** described in `docs/architecture.md` and `docs/sympton-to-care.md` is implemented: the SPA posts `{ phase, system_prompt, user_payload }` to `POST /api/symptom/survey-llm/`, Django calls the LLM via direct SDK usage in `api/services/symptom_llm.py` (no LangChain in the codebase; only mentioned in `docs/sprint-plan.md`), and returns `{ raw_text, phase, session_id }` for client-side JSON validation (`frontend/src/symptomCheck/symptomLlmClient.ts`, `validatePayloads.ts`, `parseLlmJson.ts`).
- **`SymptomSession`** aligns with the design sketch: `ai_conversation_log`, `triage_level` (choices `emergency` / `urgent` / `routine`), `provider_npi`, `insurance_details`, `booking_status`, `pre_visit_report`, timestamps (`api/models.py`). Survey turns are appended as structured `survey_turn` entries; chat uses `user` / `assistant` roles (`api/services/survey_session_persist.py`, `api/views_symptom.py`).
- **JWT on protected symptom routes**: `SymptomChatView` and `SymptomSurveyLlmView` set `permission_classes = [IsAuthenticated]` (`api/views_symptom.py`). `REST_FRAMEWORK` defaults to `JWTAuthentication` and `IsAuthenticated` (`backend/settings.py`). The frontend attaches `Authorization: Bearer` via `frontend/src/api/client.ts` and retries once on 401 with `refreshAccessToken` (`frontend/src/api/auth.ts`).
- **Dashboard history** matches the “user session history” direction: `GET /api/sessions/` and `GET /api/sessions/<uuid>/` are scoped to `request.user` (`api/views.py`, `api/serializers.py`, `api/services/session_resume.py`). The dashboard links to `/symptom-check?session=…` (`frontend/src/pages/DashboardPage.tsx`).
- **NPPES proxy** exists server-side: `GET /api/providers/` calls CMS NPI Registry through `api/services/nppes_service.py` and maps results with `ProviderDataMapper` (`api/views.py`), consistent with the contract’s intent.

**Gaps vs architecture / API contract**

- **`POST /api/symptom/triage/`** is specified in `docs/api-contract-feature-1-symptom.md` (structured triage, `provider_recommendations`, transcript snapshot) but **is not registered** in `api/urls.py`. There is no server-side “submit session for triage + routing” step; survey triage is inferred only when persisting `condition_assessment` (`apply_condition_assessment_summary` maps `overall_patient_severity` → `triage_level` in `api/services/survey_session_persist.py`).
- **Chat contract vs product**: The backend implements **`POST /api/symptom/chat/`** with server-owned transcript and JSON parsing (`api/views_symptom.py`, `api/prompts/symptom_chat_system.txt`). The **React app does not call this endpoint** (no references under `frontend/`). Feature 1 UX is **survey-only** in the browser; conversational chat is an orphan API surface relative to the shipped UI.
- **Contract response fields**: The contract’s chat example omits `triage_level` / `reasoning` on the wire; the implementation returns both (`api/views_symptom.py`). Harmless for clients that ignore extra keys, but the doc and payload should be reconciled.
- **`SymptomSessionViewSet`** (router: `/api/symptom-sessions/`) is **not aligned** with “users only see their sessions”: `get_queryset` returns **all** rows and `perform_create` does not attach `user` (`api/views.py`). This contradicts the docstring on the same file’s list/detail views and breaks the multi-tenant model assumed elsewhere.
- **Pre-visit report shape**: `apply_condition_assessment_summary` writes a **minimal** `pre_visit_report` (`patient_summary`, `reported_symptoms`, `triage_level`, `overall_patient_severity`) and does not populate fields from `docs/sympton-to-care.md` (`duration`, `questions_for_provider`, `current_medications`, etc.).
- **NPPES in the product path**: `useProviders` exists in `frontend/src/api/queries.ts` but **no page imports it**; Symptom Check uses **static mock hospitals** (`frontend/src/pages/SymptomCheckPage.tsx`). Care Matches uses **hardcoded providers** and `sessionId = 1` (`frontend/src/pages/CareMatchesPage.tsx`). So NPPES is implemented as a backend capability, not wired end-to-end through Feature 1 UI.
- **Sprint “Done when”** (`docs/sprint-plan.md`) requires insurance capture, provider list, and mock booking in the full flow; the **survey page** has insurer selection and mocks; **booking / care matches** remain disconnected from real `SymptomSession` public IDs and live provider data.

---

## Discovered bugs / edge cases

**P0 — security / data integrity**

1. **Cross-user access to all symptom sessions (IDOR)**  
   `SymptomSessionViewSet` uses `return self.queryset` and `serializer.save()` without `user=request.user` (`api/views.py` lines 58–68). Any authenticated client can list, retrieve, update, or delete **every** `SymptomSession` and call `book` on arbitrary numeric `pk`. This violates the same-file guarantees used by `UserSymptomSessionsListView` / `UserSymptomSessionRetrieveView`.  
   *Follow-up:* Reinstate `IsAuthenticated` explicitly, `get_queryset().filter(user=request.user)`, `perform_create` / `perform_update` enforcing ownership, and add regression tests.

**P1 — correctness / UX**

2. **Booking mutation uses integer PK vs dashboard UUID**  
   `useBookAppointment` posts to `/symptom-sessions/${sessionId}/book/` with a **numeric** id (`frontend/src/api/queries.ts`). Sessions are identified in the product by **`public_id` (UUID)** on the dashboard and survey client. Care Matches hardcodes `sessionId = 1` (`frontend/src/pages/CareMatchesPage.tsx`), so booking is not tied to the user’s actual session.  
   *Follow-up:* Add `book` by `public_id` or align router and UI on one identifier.

3. **Resume deep-link sets `surveyBackendSessionId` to URL param**  
   In `SymptomCheckPage.tsx`, after `fetchSymptomSessionResume`, `setSurveyBackendSessionId(sid)` uses the **URL** value. For `resume_step === "results"`, the second survey phase may still need the same server row; today it matches `public_id`, so this is OK, but any future mismatch between query param and server `session_id` would break condition assessment. Worth a comment or explicit use of `data.session_id` from the API.

4. **`pre_visit_report` parsing failures are silent**  
   If `condition_assessment` JSON cannot be parsed, `apply_condition_assessment_summary` logs and returns without updating triage or report (`api/services/survey_session_persist.py`). The API still returns **200** with `raw_text`; only the client may show an error. Dashboard may show **“Triage pending”** despite a completed UI step.

5. **Chat `triage_level` overwritten every assistant turn**  
   Each chat response sets `session.triage_level` from the model (`api/views_symptom.py`). The last model-assigned level wins; there is no separate “final triage” state as described for `POST /symptom/triage/`.

**P2 — resilience / abuse**

6. **Survey LLM: broad exception mapping**  
   `SymptomSurveyLlmView` maps generic `Exception` to **502** (`api/views_symptom.py`). Malformed model JSON or client issues are indistinguishable from transport errors; no `ValueError` path like chat’s JSON handling.

7. **Very large `user_payload` / `system_prompt`**  
   Serializer allows `system_prompt` up to **200_000** characters and arbitrary `user_payload` JSON. Token trimming in `complete_symptom_survey_turn` only trims a **single** user message; if that one message still exceeds provider limits, the call fails with a generic upstream error. Risk: **cost / DoS** from authenticated users posting huge prompts (mitigate with stricter caps, allowlisting templates server-side, or rate limits).

8. **Anthropic path lacks JSON mode**  
   OpenAI-compatible path uses `response_format={"type": "json_object"}` with retry without (`api/services/symptom_llm.py`). Anthropic branch does not, so **parse failures** are more likely under `LLM_PROVIDER=anthropic`.

9. **NPPES taxonomy code branch**  
   When `specialty` matches `^\d{10}X?$`, the code sets `taxonomy_description` to that value (`api/services/nppes_service.py`). The NPI Registry API may expect a different parameter for taxonomy **code** vs description; worth verifying against CMS docs to avoid empty or wrong results.

10. **Auth shell vs token expiry**  
    `AuthContext` treats presence of `access_token` in `localStorage` as authenticated (`frontend/src/context/AuthContext.tsx`) without parsing JWT expiry. Users can appear signed-in until the first API call returns 401; the axios interceptor then refreshes or redirects to login.

11. **401 on refresh race**  
    Failed refresh clears session and redirects (`frontend/src/api/client.ts`). Concurrent requests could trigger multiple refresh attempts; `_retry` guards per config instance but burst traffic can still produce noisy failures.

**Stub / not implemented vs docs**

12. **`POST /symptom/triage/`**, **chat history endpoint** (sprint plan), **insurance validation**, and **pre-visit report engine** beyond minimal survey summary are absent or stubbed relative to `docs/sprint-plan.md` and `docs/api-contract-feature-1-symptom.md`.

---

## Security & validation gaps

| Area | Issue | References |
|------|--------|-------------|
| **IDOR** | `SymptomSessionViewSet` exposes and mutates all sessions; `perform_create` omits `user`. | `api/views.py` (`SymptomSessionViewSet`) |
| **Public provider API** | `ProvidersView` uses `AllowAny`; unauthenticated clients can proxy NPPES through your infrastructure (cost, abuse). Consider auth or rate limiting for production. | `api/views.py` |
| **Prompt injection / cost** | Authenticated users can send arbitrary `system_prompt` (by design for dev); production should **not** trust client-supplied system text without signing, hashing, or server-side template IDs. | `api/views_symptom.py` (`SymptomSurveyLlmView`), `docs/architecture.md` |
| **Secrets / debug** | Default `SECRET_KEY` and `DEBUG=True` fallback in `backend/settings.py` are unsafe if deployed as-is. | `backend/settings.py` |
| **PII in logs** | Survey `append_survey_turn` stores `user_payload` and truncated `raw_text` in `ai_conversation_log`; ensure retention and log access policies match compliance goals. | `api/services/survey_session_persist.py` |

---

## Recommendations for Feature 2

1. **Close P0 before Feature 2**: Fix `SymptomSessionViewSet` scoping and user assignment; add API tests that prove user A cannot access user B’s `symptom-sessions` or `book` action. Optionally remove or hide the ViewSet from the public router until it is secure.

2. **Either implement or defer `/symptom/triage/`**: If triage + NPPES routing stays client-driven, update `docs/api-contract-feature-1-symptom.md` with a “deferred” changelog. If server-side triage is still desired, implement the contract (including disclaimers and `provider_recommendations`) and have the SPA call it after survey completion instead of only logging `care_taxonomy`.

3. **Unify session identifiers**: Standardize on `public_id` (UUID) for booking, resume, and ViewSet detail routes so dashboard → care → booking shares one ID shape (`frontend/src/api/queries.ts`, `CareMatchesPage.tsx`).

4. **Medication / pre-visit handoff**: Feature 3 expects medication data in pre-visit reports (`docs/sprint-plan.md`). Extend `pre_visit_report` (or a new join model) so Feature 2’s `MedicationProfile` can be linked without overloading `SymptomSession.ai_conversation_log` (`api/models.py`).

5. **Operational hardening for LLM routes**: Rate limits, structured logging (request id, user id, phase), and separate metrics for 502 vs 503. Consider server-side prompt templates keyed by `phase` to remove free-form `system_prompt` in production.

6. **Frontend contract tests**: Add integration tests or MSW fixtures asserting `symptom/survey-llm/` request/response shapes match `docs/api-contract-feature-1-symptom.md` so drift is caught in CI.

7. **NPPES UX**: Wire `useProviders` into Symptom Check or Care Matches with ZIP from user input and specialty hints from `care_taxonomy` (once consumed server-side), replacing static lists for the demo path described in the sprint plan.
