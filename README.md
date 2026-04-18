# HealthAgent — Autonomous Symptom-to-Care & Medication Safety Platform

An AI-powered health assistant with two autonomous agents: one that triages symptoms and routes patients to appropriate care, and one that monitors medications for interactions, recalls, and safety risks.

---

## Getting Started

### Prerequisites
- Python 
- Node.js 
- PostgreSQL
- API keys: Infermedica, Lexigram, openFDA (free), Healthcare.gov

### Backend setup
```bash
cd backend
python -m venv venv && source venv/bin/activate
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

### Full stack (Docker)
```bash
cp .env.example .env
docker compose up
```

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