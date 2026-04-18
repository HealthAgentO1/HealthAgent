# HealthAgent — Autonomous Symptom-to-Care & Medication Safety Platform

An AI-powered health assistant with two autonomous agents: one that triages symptoms and routes patients to appropriate care, and one that monitors medications for interactions, recalls, and safety risks.

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js (for the frontend)
- PostgreSQL (only if you run the backend on the host instead of Docker)
- API keys as described in `.env.example` (for example Deepseek for the Core AI agent)

### Backend setup (host machine)
From the **repository root** (where `manage.py` lives):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

### Frontend setup
```bash
cd frontend
npm install
npm run dev
```

Optional: create `frontend/.env` or `frontend/.env.local` with `VITE_API_URL` (Django API base) and, when you have an LLM gateway for Symptom Check, **`VITE_SYMPTOM_LLM_URL`** (see `docs/sympton-to-care.md`). If `VITE_SYMPTOM_LLM_URL` is omitted, the symptom flow uses built-in mock JSON responses.

### Full stack (Docker: Postgres + Django)
Uses `.env` at the repo root for `DJANGO_SECRET_KEY`, database passwords, `DEEPSEEK_API_KEY`, and other variables. Compose overrides `POSTGRES_HOST` to reach the `db` service; you do not need to change that in `.env` for Docker.

```bash
cp .env.example .env
# Edit .env: set DJANGO_SECRET_KEY and any API keys (never commit .env)

docker compose up --build
```

- API: `http://127.0.0.1:8000` (Django runs `migrate` on startup, then `runserver` with **live reload**; the project directory is bind-mounted into the container).
- Postgres: `localhost:5432` (same credentials as in `.env`).

Run the Vite dev server on your host when you need the UI (`cd frontend && npm run dev`). Point it at the API with `VITE_API_URL=http://127.0.0.1:8000/api` in `frontend/.env` if needed.

---

## Architecture

Two autonomous agents share a Django REST backend and PostgreSQL database, exposed to a React/TypeScript frontend.

```
frontend (React/TS)
    └── Django REST API
            ├── Symptom-to-Care Agent
            │       ├── Infermedica  (triage)
            │       ├── NPPES        (provider search)
            │       ├── Healthcare.gov (insurance)
            │       └── Booking + pre-visit report
            └── Medication Safety Agent
                    ├── Lexigram     (NLP extraction)
                    ├── openFDA      (interactions, recalls)
                    └── Alerts + safer alternatives
```

See `docs/` for detailed docs.

---

## Repo Structure

```
/
├── backend/
│   ├── agents/
│   │   ├── symptom/        Symptom-to-Care agent logic + services
│   │   └── medication/     Medication Safety agent logic + services
│   ├── api/                REST endpoints
│   └── core/               Shared models, auth, DB
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       └── hooks/
├── fixtures/               Mock API responses for local dev
└── docs/
    ├── adr/                Architecture Decision Records
    ├── agents/             Per-agent design docs
    └── etc
```

---

## Contributing

Run tests: `pytest` (backend), `npm test` (frontend).
Branch naming: `feat/`, `fix/`, `chore/` prefixes.
All PRs require one reviewer before merge.