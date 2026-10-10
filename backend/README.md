# AccessiTour Backend

FastAPI + PostgreSQL backend for the AccessiTour mobile app.

- **Live API:** https://accessitour-api.onrender.com
- **Live API docs:** https://accessitour-api.onrender.com/docs
- **Local API docs:** http://127.0.0.1:8000/docs (when running locally)

The free server sleeps after 15 minutes without requests. The first request after that takes about a minute.

## Requirements

- Python 3.12 or newer (`python3 --version`)
- Docker Desktop (`docker --version`)
- Git

## First-time setup

Run these from the `backend` folder.

1. Create and activate a virtual environment:

```bash
   python3 -m venv .venv
   source .venv/bin/activate
```

2. Install packages:

```bash
   pip install -r requirements.txt
```

3. Create your `.env` file from the example:

```bash
   cp .env.example .env
```

4. Generate your own secret key and put it in `.env` as `JWT_SECRET_KEY`:

```bash
   python -c "import secrets; print(secrets.token_hex(32))"
```

5. Open Docker Desktop, wait for it to finish starting, then start the database:

```bash
   docker compose up -d
```

6. Create the tables:

```bash
   alembic upgrade head
```

7. Start the server:

```bash
   uvicorn app.main:app --reload --reload-dir app
```

8. Open http://127.0.0.1:8000/api/v1/health/db. It should show `{"database":"ok"}`.

## Daily routine

```bash
open -a Docker              # wait for the whale icon to settle
source .venv/bin/activate
git pull
pip install -r requirements.txt   # only needed if requirements.txt changed
docker compose up -d
alembic upgrade head
uvicorn app.main:app --reload --reload-dir app
```

Keep one terminal for the server and open a second one for git, docker and pip.

To stop: `Ctrl + C` in the server terminal, then `docker compose down`.

## Changing the database

1. Edit or add a model in `app/models/` (new models also go in `app/models/__init__.py`).
2. Generate a migration:

```bash
   alembic revision --autogenerate -m "describe the change"
```

3. Apply it:

```bash
   alembic upgrade head
```

4. Commit the model and the new file in `alembic/versions/` together.

Agree with the team before changing tables, so two people don't create conflicting migrations.

## Project structure

```
backend/
├── app/
│   ├── main.py          # creates the app and connects the routers
│   ├── config.py        # reads settings from .env
│   ├── database.py      # database connection
│   ├── security.py      # password hashing and login tokens
│   ├── deps.py          # get_current_user: requires a valid token
│   ├── models/          # database tables
│   ├── schemas/         # request and response shapes
│   └── routers/         # endpoints, one file per area
├── alembic/             # database migrations
├── docker-compose.yml   # local PostgreSQL
├── requirements.txt
└── .env.example         # copy to .env
```

## Testing login in /docs

1. `POST /api/v1/auth/register` to create a user.
2. `POST /api/v1/auth/login` and copy the `access_token` (without quotes).
3. Click **Authorize** (top right), paste the token, click Authorize, then Close.
4. Endpoints with a padlock now work, for example `GET /api/v1/users/me`.

## Deployment

- The backend runs on **Render** and the database on **Neon**, both in Singapore.
- Every push to `main` redeploys automatically and runs `alembic upgrade head`.
- Online settings (`DATABASE_URL`, `JWT_SECRET_KEY`) are stored in Render's Environment settings, not in the repo.
- **Never commit `.env`** or paste database passwords into chats.

## Common problems

| Problem | Fix |
|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop isn't open. Run `open -a Docker` and wait |
| `no configuration file provided` | You're not in the `backend` folder. Run `cd backend` |
| `Address already in use` | A server is already running. Stop it with `lsof -ti :8000 \| xargs kill` |
| `/docs` keeps loading forever | The server crashed on reload. Read the last two lines of the error in the server terminal |
| `(.venv)` missing from the prompt | Run `source .venv/bin/activate` |
| `/` shows 404 | Normal. All endpoints start with `/api/v1` |