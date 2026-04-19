<div align="center">

<img src="frontend/public/logo.png" alt="HealthAgent logo" width="200" />

# HealthAgent

**Autonomous symptom-to-care and medication safety**

AI-assisted triage, care routing, and medication monitoring — backed by a Django API and a React dashboard.

<br />

<img src="images/group_photo.png" alt="HealthAgent team" width="720" />

*The team behind HealthAgent*

<br />

</div>

---

## Overview

HealthAgent combines two complementary flows:

| Area | What it does |
|------|----------------|
| **Symptom-to-care** | Guided symptom intake, triage-style assessment, care setting suggestions, and pre-visit context for clinicians. |
| **Medication safety** | Active regimen tracking in the browser, interaction checks (e.g. openFDA), and safety-oriented medication workflows. |

The stack is a **Django REST** backend with **PostgreSQL**, and a **React + TypeScript + Vite** frontend. See `docs/` for deeper architecture and agent notes.

---

## Features

### Symptom-to-care

- **Guided intake** — Structured symptom narrative, insurer context, and LLM-assisted follow-up questions.
- **Triage-style output** — Severity and urgency framing with educational (non-diagnostic) language.
- **Care routing** — Suggested care settings and taxonomy-aware routing hooks (e.g. NUCC-aligned facility search via **NPPES**).
- **Provider & facility discovery** — Search and map-style workflows for nearby care options where integrated.
- **Sessions** — Save, list, resume, and delete triage sessions; deep links from the dashboard.
- **Pre-visit handoff** — Pre-visit report generation and patient-facing summaries where enabled (see `docs/`).

### Medication safety

- **Active regimen** — Add and edit medications in the UI; regimen persisted in **`localStorage`** for quick iteration.
- **LLM extraction** — Optional structured extraction from prescription-style text via the API.
- **openFDA integration** — Drug–drug interaction checks and recall-oriented signals (see `api/tests/` and `docs/medication-safety.md`).
- **Detail views** — Per-medication safety pages with scoring and contextual guidance.

### Account & app shell

- **JWT authentication** — Register, login, access, and refresh tokens (`djangorestframework-simplejwt`).
- **Dashboard** — Care pathway prompts, health snapshot (symptoms + meds), and recent session history.
- **Emergency contacts** — Dedicated area for critical contact information.
- **Reports** — Workspace for exports and report-related flows tied to the symptom journey.

---

## Tech stack

Colored icons below point at **SVG** assets (CDN). Same technologies are spelled out in text for screen readers and offline docs.

<!-- Icon base: Devicons v2.16.0 (SVG). Vite: project logo. -->

<div align="center">

<table>
  <tr>
    <td align="center" width="88">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/python/python-original.svg" alt="Python" title="Python" />
      <div><sub><b>Python</b></sub></div>
    </td>
    <td align="center" width="88">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/django/django-plain.svg" alt="Django" title="Django" />
      <div><sub><b>Django</b></sub></div>
    </td>
    <td align="center" width="88">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/postgresql/postgresql-original.svg" alt="PostgreSQL" title="PostgreSQL" />
      <div><sub><b>PostgreSQL</b></sub></div>
    </td>
    <td align="center" width="88">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/docker/docker-plain.svg" alt="Docker" title="Docker" />
      <div><sub><b>Docker</b></sub></div>
    </td>
    <td align="center" width="88">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/react/react-original.svg" alt="React" title="React" />
      <div><sub><b>React</b></sub></div>
    </td>
    <td align="center" width="88">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/typescript/typescript-original.svg" alt="TypeScript" title="TypeScript" />
      <div><sub><b>TypeScript</b></sub></div>
    </td>
    <td align="center" width="88">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/vite/vite-original.svg" alt="Vite" title="Vite" />
      <div><sub><b>Vite</b></sub></div>
    </td>
    <td align="center" width="88">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/tailwindcss/tailwindcss-original.svg" alt="Tailwind CSS" title="Tailwind CSS" />
      <div><sub><b>Tailwind</b></sub></div>
    </td>
  </tr>
</table>

<sub>Python · Django · PostgreSQL · Docker · React · TypeScript · Vite · Tailwind CSS</sub>

</div>

| Layer | Technologies |
|--------|----------------|
| **Backend** | Django 4.2, **Django REST Framework**, **SimpleJWT**, CORS headers, **Gunicorn**, **WhiteNoise**, **psycopg2**, `dj-database-url` |
| **AI & HTTP** | `openai`, `anthropic`, `requests`, `tiktoken`, `python-dotenv` (provider keys from `.env`) |
| **Frontend** | React 19, React Router 7, **TanStack Query**, **Axios**, Tailwind CSS 4 (`@tailwindcss/vite`), ESLint, TypeScript |
| **Tooling** | Vite 8, ESLint, **`npm run build`** (typecheck + bundle), **pytest** for the API, Docker Compose for local full stack |

---

## Architecture

Two agent areas share the same API and database:

```
frontend (React / TypeScript)
    └── Django REST API
            ├── Symptom-to-Care
            │       ├── Infermedica     (triage)
            │       ├── NPPES           (provider search)
            │       ├── Healthcare.gov (insurance context)
            │       └── Booking + pre-visit report
            └── Medication Safety
                    ├── Lexigram        (NLP extraction)
                    ├── openFDA         (interactions, recalls)
                    └── Alerts + safer alternatives
```

---

## Getting started

### Prerequisites

- Python 3.10+
- Node.js (for the frontend)
- PostgreSQL (if you run the backend on the host instead of Docker)
- API keys as described in `.env.example` (for example DeepSeek for the core AI agent)

### Backend (host)

From the **repository root** (where `manage.py` lives):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Optional: create `frontend/.env` or `frontend/.env.local` with **`VITE_API_URL`** (Django API base URL, e.g. `http://127.0.0.1:8000/api`). Symptom check uses **`POST /api/symptom/survey-llm/`** with JWT auth; see `docs/sympton-to-care.md`. Medication safety uses **`POST /api/medication-profile/extract/`** for LLM extraction when adding a prescription; regimen rows are stored in **`localStorage`** in the browser (see `docs/architecture.md` and `docs/medication-safety.md`).

### Full stack with Docker (Postgres + Django)

Uses `.env` at the repo root for `DJANGO_SECRET_KEY`, database passwords, `DEEPSEEK_API_KEY`, and other variables. Compose sets `POSTGRES_HOST` so the app reaches the `db` service; you do not need to change that in `.env` for Docker.

```bash
cp .env.example .env
# Edit .env: set DJANGO_SECRET_KEY and any API keys (never commit .env)

docker compose up --build
```

- **API:** `http://127.0.0.1:8000` (Django runs `migrate` on startup, then `runserver` with live reload; the project directory is bind-mounted into the container).
- **Postgres:** `localhost:5432` (credentials match `.env`).

For the UI, run Vite on the host (`cd frontend && npm run dev`) and point it at the API with `VITE_API_URL=http://127.0.0.1:8000/api` in `frontend/.env` when needed.

---

## Contributing

- **Tests / quality:** `pytest` (backend); `npm run lint` and `npm run build` in `frontend/` for the UI.
- **Branches:** use `feat/`, `fix/`, or `chore/` prefixes.
- **Pull requests:** require at least one reviewer before merge.
