# Django Backend Overview

Welcome to the backend representation of this project. If you're an experienced developer but new to Python's Django, this brief guide will introduce you to the framework's core philosophies and the structure you see here.

## General Philosophy

Django follows the **MVT (Model-View-Template)** architecture, which is effectively a variation of MVC (Model-View-Controller):
- **Model**: Data access layer handles the database (Django ORM).
- **View**: Business logic layer that retrieves data, calls functions, and decides what output is generated (Controller in MVC).
- **Template**: Presentation layer (View in MVC). 

Since this backend serves as a JSON API (likely consumed by our React frontend), we won't use the Template layer much. Instead, we use **Django REST Framework (DRF)**, which intercepts models and serializers (object-to-JSON converters) to deliver RESTful endpoints.

## Project Structure

A Django backend is split into two primary concepts: **Projects** and **Apps**.
- **Project**: The overall configuration instance containing shared settings across your entire installation. The top-level `backend/` folder holds the core settings.
- **App**: A self-contained, domain-specific module. For example, `api/` is an app we created to handle API routes. A Django project can have many apps (e.g. `users/`, `billing/`, `api/`). Apps are meant to be modular and reusable.

### Key Files and Directories

Here's an overview of the most critical files in this boilerplate:

#### 1. `manage.py`
Located at the root of the Django installation. This is a command-line script used to interact with the project (e.g. starting the dev server, running tests, migrating databases).
*Common Commands:*
- `python manage.py runserver`: Runs the local development server.
- `python manage.py makemigrations`: Auto-generates SQL migration files based on changes you make to your Python Models.
- `python manage.py migrate`: Executes migrations against your database.
- `python manage.py shell`: Opens an interactive REPL with Django loaded.

#### 2. `settings.py` (inside `backend/`)
The single source of truth for all global configurations. 
- Defines connected databases (`DATABASES`). We are using PostgreSQL mapped via `python-dotenv`.
- Lists registered apps (`INSTALLED_APPS` includes `api` and `rest_framework` here).
- Configures middleware (like `corsheaders` which allows our frontend to communicate during development). 

#### 3. `urls.py` (inside `backend/`)
The main router file. It intercepts all incoming HTTP requests and delegates them to the appropriate app's `urls.py` file or specific view functions based on regex matchers. Here we route `/api/` down to `api/urls.py`.

#### 4. The `api/` App Directory
Inside the app directory, you will commonly find or create:
- **`models.py`**: Where you define database tables as Python schema classes mapping exactly to rows in PostgreSQL tables. 
- **`views.py`**: Where business logic controllers reside. It defines how a request should be processed and formatted.
- **`urls.py`**: Like a nested router file localized to this specific app.
- **`serializers.py`** (You will have to create this): Provided by DRF. Bridges `models.py` to `views.py` by converting raw database objects to and from pure JSON dicts.
- **`admin.py`**: Maps Models into Django's out-of-the-box admin panel UI (`/admin`). It reads your schema instantly and builds a CRUD graphical interface.

### Domain services (this repo)

Beyond thin views, feature logic often lives under **`api/services/`**. Examples: **`symptom_llm.py`** (LLM calls for chat and survey turns), **`report_service.py`** (pre-visit report prompt, parsing, and merging medication lines from survey payloads or `MedicationProfile`), **`nppes_nearby.py`** (facility search), **`survey_session_persist.py`** (append structured survey turns to `SymptomSession.ai_conversation_log`). See **`docs/architecture.md`** for how these pieces connect to the React app.

## Getting Started Workflow

Whenever adding new functionality, you usually follow this loop:
1. Define a class in `models.py`.
2. Generate migrations with `python manage.py makemigrations`.
3. Apply changes to the database with `python manage.py migrate`.
4. Create a serializer class in `serializers.py` based on the model.
5. Create a view/viewset controller in `views.py`.
6. Add an endpoint alias inside `urls.py`.
