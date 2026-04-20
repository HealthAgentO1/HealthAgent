<div align="center">

<img src="frontend/public/icon.png" alt="HealthOS logo" width="200" />

# HealthOS

**Symptom-to-care and medication safety**

**Autonomous AI** runs guided symptom-to-care interviews, care-setting suggestions, nearby facility lookup, regimen tracking, and **openFDA**-backed interaction and recall checks. Under the hood this is a **React** + **TypeScript** App on a **Django REST** API and **PostgreSQL**. **Educational tooling only**—not emergency care, not a diagnosis, and not a replacement for a clinician.

Live site: https://health-guardian-frontend-875209953481.us-central1.run.app/89099bfc-93b8-4a9a-be53-ded2bf0ac17d

</div>

---

## Team behind HealthOS

<div align="center">

<table>
  <tr>
    <td align="center" width="50%">
      <a href="https://www.linkedin.com/in/nicolas-garcia-bompadre/"><img src="images/team/nico-garcia-bompadre.jpg" width="120" height="120" alt="Nico García-Bompadre" /></a>
      <br /><br />
      <a href="https://www.linkedin.com/in/nicolas-garcia-bompadre/"><b>Nico García-Bompadre</b></a>
      <br /><sub><b>Full-stack engineer</b><br />Provider data, reports &amp; medication services</sub>
    </td>
    <td align="center" width="50%">
      <a href="https://www.linkedin.com/in/zandermmcg/"><img src="images/team/zander-mcginley.jpg" width="120" height="120" alt="Zander McGinley" /></a>
      <br /><br />
      <a href="https://www.linkedin.com/in/zandermmcg/"><b>Zander McGinley</b></a>
      <br /><sub><b>Full-stack and product engineer</b><br />Symptom stack UI-to-API, medication safety flows</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <a href="https://www.linkedin.com/in/cgombert/"><img src="images/team/carl-gombert.jpg" width="120" height="120" alt="Carl Gombert" /></a>
      <br /><br />
      <a href="https://www.linkedin.com/in/cgombert/"><b>Carl Gombert</b></a>
      <br /><sub><b>Platform &amp; AI engineer</b><br />Core APIs, AI clinical intake &amp; medication checks</sub>
    </td>
    <td align="center" width="50%">
      <a href="https://www.linkedin.com/in/peter-mckinley-2b4b46294/"><img src="images/team/peter-mckinley.jpg" width="120" height="120" alt="Peter McKinley" /></a>
      <br /><br />
      <a href="https://www.linkedin.com/in/peter-mckinley-2b4b46294/"><b>Peter McKinley</b></a>
      <br /><sub><b>Full-stack engineer</b><br />Clinical summaries &amp; medication safety logic</sub>
    </td>
  </tr>
</table>

</div>

---

## Tech stack

<div align="center">

<table>
  <tr>
    <td align="center" width="82">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/python/python-original.svg" alt="Python" title="Python" />
      <div><sub><b>Python</b></sub></div>
    </td>
    <td align="center" width="82">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/django/django-plain.svg" alt="Django" title="Django" />
      <div><sub><b>Django</b></sub></div>
    </td>
    <td align="center" width="82">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/postgresql/postgresql-original.svg" alt="PostgreSQL" title="PostgreSQL" />
      <div><sub><b>PostgreSQL</b></sub></div>
    </td>
    <td align="center" width="82">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/googlecloud/googlecloud-original.svg" alt="Google Cloud" title="Google Cloud" />
      <div><sub><b>Google Cloud</b></sub></div>
    </td>
    <td align="center" width="82">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/docker/docker-plain.svg" alt="Docker" title="Docker" />
      <div><sub><b>Docker</b></sub></div>
    </td>
    <td align="center" width="82">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/react/react-original.svg" alt="React" title="React" />
      <div><sub><b>React</b></sub></div>
    </td>
    <td align="center" width="82">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/typescript/typescript-original.svg" alt="TypeScript" title="TypeScript" />
      <div><sub><b>TypeScript</b></sub></div>
    </td>
    <td align="center" width="82">
      <img height="44" width="44" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/tailwindcss/tailwindcss-original.svg" alt="Tailwind CSS" title="Tailwind CSS" />
      <div><sub><b>Tailwind</b></sub></div>
    </td>
    <td align="center" width="88">
      <img height="44" width="44" src="images/tech/deepseek-whale.svg" alt="DeepSeek" title="DeepSeek" />
      <div><sub><b>DeepSeek</b></sub></div>
    </td>
  </tr>
</table>

</div>

| Area | Technologies |
|------|----------------|
| **Backend** | Python, Django, PostgreSQL, Gunicorn |
| **Infra** | Google Cloud, Docker, Docker Compose, GitHub Actions |
| **Frontend** | TypeScript, React, Tailwind CSS |
| **AI** | DeepSeek (OpenAI-compatible API) |

---

## What it does

**Problem.** People with new or changing symptoms often lack a straightforward way to judge how urgently they need care, which setting is appropriate, and how to find and prepare for a visit. Separately, keeping an accurate medication picture and sharing the right context with a clinician is easy to get wrong. The result is unnecessary friction from first symptoms through booking and the clinical encounter.

**What we are building.** HealthOS addresses that gap with structured, AI-assisted **symptom-to-care** (educational triage-style guidance, routing hooks, and pre-visit summaries) and **medication safety** (regimen tracking and interaction-oriented checks). The product aims to reduce friction on the path from symptoms to appropriate care and safer medication use — not to replace emergency services, definitive diagnosis, or the clinician–patient relationship.

---

## Overview

HealthOS combines two complementary flows:

| Area | What it does |
|------|----------------|
| **Symptom-to-care** | Guided symptom intake, triage-style assessment, care setting suggestions, and pre-visit context for clinicians. |
| **Medication safety** | Active regimen tracking in the browser, interaction checks (e.g. openFDA), and safety-oriented medication workflows. |

---

## Features

### Symptom-to-care

- **Guided intake** — Structured symptom narrative, insurer context, and LLM-assisted follow-up questions.
- **Prior diagnoses for the LLM** — Optional context from **My prior diagnoses** and official labels saved after past symptom checks; when enabled on intake, deduplicated diagnosis text is sent to the first survey LLM call (`prior_official_diagnoses`) so follow-up questions and assessment can account for documented history.
- **Post-visit doctor diagnosis** — On completed checks, record the clinician’s official diagnosis after a visit (including post-operative follow-up when that is what was documented) as **post-visit diagnosis**, so it appears on Reports and can be reused as prior context on future symptom checks.
- **Triage-style output** — Severity and urgency framing with educational (non-diagnostic) language.
- **Care routing** — Suggested care settings and taxonomy-aware routing hooks (e.g. NUCC-aligned facility search via **NPPES**).
- **Provider & facility discovery** — Search and map-style workflows for nearby care options where integrated.
- **Sessions** — Save, list, resume, and delete triage sessions; deep links from the dashboard.
- **Pre-visit handoff** — After the structured survey finishes, Django generates a clinician-oriented **`pre_visit_report`** on the symptom session. The report’s medication list prefers the user’s **Medication Safety** active regimen (dosage, frequency, time, refill) sent from the browser on the final LLM step; it can fall back to the latest server **`MedicationProfile`** when needed. Patient-facing copy and PDF export live on **Reports** (`/reports`); **View report** refetches session history, opens the matching check via **`?session=`**, and scrolls the app shell to the top (see `docs/architecture.md`).

### Medication safety

- **Active regimen** — Add and edit medications in the UI.
- **LLM extraction** — Optional structured extraction from prescription-style text via the API.
- **openFDA integration** — Drug–drug interaction checks and recall-oriented signals (see `api/tests/` and `docs/medication-safety.md`).
- **Detail views** — Per-medication safety pages with scoring and contextual guidance.

### Account & app shell

- **JWT authentication** — Register, login, access, and refresh tokens (`djangorestframework-simplejwt`). The SPA **`AuthProvider`** validates access token **expiry** on load and refreshes or clears the session before treating the user as signed in (see `docs/architecture.md`).
- **Dashboard** — Care pathway prompts, health snapshot (symptoms + meds), and recent session history.
- **Emergency contacts** — Dedicated area for critical contact information.
- **Reports** — Workspace for exports and report-related flows tied to the symptom journey.

---

## Architecture

Two agent areas share the same API and database. **Locally, Compose runs Postgres and Django**; the React app usually talks to the API from the host.

```
Docker Compose (docker compose up)
├── db          PostgreSQL — port 5432, persistent volume
└── django      Django REST API — port 8000, migrate on start, bind-mounted source

frontend (Vite dev server on host) ──HTTP──► django:8000

Django REST API
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

Local development is **Compose-first for the backend and database**: one command brings up **PostgreSQL** and **Django** with the right wiring (`POSTGRES_HOST=db`, health-checked `depends_on`, etc.). Run the **frontend** separately with Node so you get a normal Vite HMR workflow.

### Prerequisites

- **Docker Engine** and the **Docker Compose** plugin (`docker compose`)
- **Node.js** (current LTS is fine) for the Vite frontend
- A root **`.env`** copied from **`.env.example`** and filled in (`DJANGO_SECRET_KEY`, Postgres variables, **`DEEPSEEK_API_KEY`** / **`OPENAI_*`** for the LLM, and any other keys your features need). Never commit `.env`.

Optional: **Python 3.11+** on the host only if you want to run **`manage.py`** or **`pytest`** outside the container (see below; aligns with **`Dockerfile`**).

### 1. Backend and database (Docker Compose)

From the **repository root** (where `docker-compose.yml` and `manage.py` live):

```bash
cp .env.example .env
# Edit .env — secrets, DB names, API keys (never commit .env)

docker compose up --build
```

This starts two services (see **`docker-compose.yml`**):

| Service | Role |
|---------|------|
| **`db`** | **PostgreSQL 14** — published on **`localhost:5432`**, data in the `postgres_data` volume, healthcheck for clean startup order. |
| **`django`** | **Django REST API** — image built from the repo **`Dockerfile`**, runs **`migrate --noinput`** then **`runserver 0.0.0.0:8000`**, published on **`http://127.0.0.1:8000`**, loads **`env_file: .env`**, and sets **`POSTGRES_HOST=db`** so the app uses the Compose network (you normally do **not** point `POSTGRES_HOST` at `localhost` for this stack). |

The repo is **bind-mounted** into the `django` container (`volumes: - .:/app`), so code changes on the host are picked up by the dev server inside the container.

### 2. Frontend (host)

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Point the UI at the Compose-backed API by setting **`VITE_API_URL=http://127.0.0.1:8000/api`** in **`frontend/.env`** or **`frontend/.env.local`**.

- Symptom check: **`POST /api/symptom/survey-llm/`** with JWT — see **`docs/sympton-to-care.md`**.
- Medication extraction: **`POST /api/medication-profile/extract/`**; active regimen rows live in **`localStorage`** — see **`docs/architecture.md`** and **`docs/medication-safety.md`**.

### Backend without Docker (optional)

If you need Django or tests directly on the host: create a virtualenv, **`pip install -r requirements.txt`**, configure **`POSTGRES_*`** (or `DATABASE_URL`) to reach a Postgres instance (for example the **`db`** container while Compose is running), then run **`python manage.py migrate`** and **`python manage.py runserver`** from the repo root. Match the Python version to the **`Dockerfile`** (currently **3.11**) when debugging environment-specific issues.

---

## Contributing

- **Tests / quality:** `pytest` for the API (usually from a **host virtualenv** with `requirements.txt` and `pytest` installed); `npm run lint` and `npm run build` in `frontend/` for the UI. For one-off Django commands against the Compose stack: **`docker compose exec django python manage.py …`** while `django` is running.
- **Branches:** use `feat/`, `fix/`, or `chore/` prefixes.
- **Pull requests:** require at least one reviewer before merge.
