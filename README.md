# Email Scanner (Google OAuth + Gmail + AI)

MVP stack:
- Backend: FastAPI + SQLite
- Frontend: React (Vite)
- Auth: Google OAuth 2.0
- Mail source: Gmail API (`gmail.readonly`)
- AI scan: Groq (with heuristic fallback)

## What is implemented
- Google Sign-In flow.
- Fetch inbox emails from Gmail API.
- AI classification into `safe`, `suspicious`, `phishing`.
- 3-column responsive UI (filters, mail list, details).
- SQLite persistence per user.
- On logout: user row is deleted, and all related scanned email records are deleted automatically.

## Backend setup
1. `cd backend`
2. `python -m venv .venv`
3. Windows PowerShell: `.\\.venv\\Scripts\\Activate.ps1`
4. `pip install -r requirements.txt`
5. `Copy-Item .env.example .env`
6. Fill `.env` with Google OAuth + Groq keys.
7. `uvicorn app.main:app --reload --port 8000`

## Frontend setup
1. `cd frontend`
2. `npm install`
3. `npm run dev`
4. Open `http://localhost:5173`

## Google Cloud config
1. Create OAuth client credentials (Web application).
2. Add redirect URI: `http://localhost:8000/auth/google/callback`
3. Enable Gmail API in the project.
4. Put client ID/secret in `backend/.env`.

## Notes
- This is a college-level MVP. Session storage is in-memory.
- For production:
  - Use Redis/DB-backed sessions.
  - Encrypt tokens at rest.
  - Add background scanning queue.
  - Add proper token refresh handling.

## Model quality workflow
- Label corrections API: `PATCH /emails/{id}/label?label=safe|suspicious|phishing`
- Export labeled dataset: `python tools/export_dataset.py ...` (run from `backend/`)
- Evaluate current classifier: `python tools/evaluate_classifier.py ...`
- Full guide: `backend/TRAINING.md`
