# Project Walkthrough & Technical Flow

This document explains **how the application works step-by-step**, mapping every user action to the code and technology behind it.

## 1. The Technology Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | **React (Vite)** | The user interface. Fast, responsive, and interactive. |
| **Styling** | **Vanilla CSS** | Custom glassmorphism design variables (no heavy frameworks). |
| **Backend** | **FastAPI (Python)** | High-performance API that connects everything. |
| **Database** | **SQLite** | Local, file-based database to store emails and users securely. |
| **Auth** | **Google OAuth2** | Secure login system (we never see the user's password). |
| **AI Engine** | **Groq (Llama 3)** | The "Brain" that decides if an email is phishing. |
| **Vector DB** | **FastEmbed + Numpy** | Local semantic search ("Memory") for personal context. |

---

## 2. The User Journey (Step-by-Step)

### Step 1: The Landing Page (Hero Section)
*   **User Action**: The user opens the app in their browser (`http://localhost:5173`).
*   **What they see**: A beautiful "Hero" section explaining the tool.
*   **Code**: `frontend/src/App.jsx` checks if `session` is empty. If yes, it renders the `<div className="auth-shell">`.
*   **Tech**: React state management (`useState`) controls this view switching.

### Step 2: Clicking "Continue with Google"
*   **User Action**: User clicks the big blue login button.
*   **Frontend**: Calls `signIn()` in `App.jsx`, which fetches the login URL from the backend.
*   **Backend**: 
    1.  Endpoint `/auth/google/login` is hit.
    2.  `auth_service.py` generates a secure Google OAuth URL.
*   **Tech**: **Google Identity Platform**. The user is redirected to Google's secure login page. We never touch their password.

### Step 3: The Callback (Login Success)
*   **User Action**: User approves access on Google's screen.
*   **Backend**: 
    1.  Google redirects back to `/auth/google/callback` with a unique `code`.
    2.  `auth_service.py` exchanges this `code` for an **Access Token** (to read emails).
    3.  A **User Session** is created in SQLite.
*   **Frontend**: The URL now contains `?session=...`. `App.jsx` detects this, saves it to `localStorage`, and switches to the **Dashboard View**.

### Step 4: The Dashboard (Inbox View)
*   **User Action**: The user sees their customized inbox with risk labels (Safe, Suspicious, Phishing).
*   **Frontend**: `useEffect` triggers `loadEmails()`.
*   **Backend**: 
    1.  Endpoint `/emails` queries the `SQLite` database.
    2.  It returns a JSON list of analyzed emails.
*   **Tech**: **SQLAlchemy** turns database rows into Python objects, and **Pydantic** turns them into JSON for React.

### Step 5: Running a Security Scan
*   **User Action**: User clicks "**Run Security Scan**".
*   **Frontend**: Calls `syncEmails()` and shows a "Scanning..." animation.
*   **Backend (The Heavy Lifting)**:
    1.  **Background Thread**: A new thread starts so the UI doesn't freeze.
    2.  **Gmail API**: `gmail_service.py` fetches the latest 500 emails.
    3.  **AI Analysis**: Each email goes through the **3-Stage Pipeline**:
        *   **Rule Engine**: Checks for bad links/IPs.
        *   **Semantic Search**: Uses `fastembed` to check if this looks like a known phishing attack.
        *   **LLM (Groq)**: The AI Judge reviews the evidence and gives a final verdict.
    4.  **Storage**: The result is saved to the database.

### Step 6: Viewing Analysis Details
*   **User Action**: User clicks on a specific suspicious email.
*   **Frontend**: `selected` state updates, opening the "Right Panel" detail view.
*   **What they see**: A breakdown of *why* it was flagged (e.g., "Urgency detected + Spoofed Domain").
*   **Tech**: React conditionally renders the `<aside className="right-panel">` to show the AI's explanation stored in the JSON response.
