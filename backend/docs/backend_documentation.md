# Email Agent Backend Documentation

## 1. Overview
The Email Agent Backend is a FastAPI-based application that scans a user's Gmail inbox, classifies emails using a hybrid AI approach (Rules + Semantic Search + LLM), and stores the results for a frontend dashboard.

## 2. Technology Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | FastAPI | High-performance Async Web API |
| **Language** | Python 3.10+ | Core logic |
| **Database** | SQLite + SQLAlchemy | Local storage for users and emails |
| **Authentication** | Google OAuth2 | Secure login and Gmail API access |
| **Email Source** | Gmail API | Fetching emails securely |
| **AI Inference** | Groq API (Llama 3) | Final classification decision |
| **Vector Search** | FastEmbed + Numpy | Local semantic search for RAG |
| **Task Queue** | Python Threads | Background email syncing |

## 3. Architecture

```mermaid
graph TD
    User[User / Frontend] -->|Auth & API Calls| API[FastAPI Backend]
    API -->|Read/Write| DB[(SQLite Database)]
    API -->|OAuth Flow| Google[Google Identity]
    
    subgraph Background Worker
        Sync[Email Sync Thread] -->|Fetch Emails| Gmail[Gmail API]
        Sync -->|Classify| AIService[AI Classification Service]
        AIService -->|Store Results| DB
    end
    
    subgraph AI Service
        AIService -->|1. Keyword Check| Rules[Rule Engine]
        AIService -->|2. Semantic Search| RAG[Vector DB (RAM)]
        AIService -->|3. Final Verdict| LLM[Groq API (Llama 3)]
    end
```

## 4. Key Components

### 4.1. Authentication (`auth_service.py`)
-   **Protocol**: OAuth 2.0 with Google.
-   **Flow**:
    1.  User clicks "Login" $\rightarrow$ Redirects to Google.
    2.  Google returns `code` to `/auth/google/callback`.
    3.  Backend exchanges `code` for `access_token` and `refresh_token`.
    4.  Backend creates a local session and issues a `session_token` to the frontend.

### 4.2. Database (`models.py`, `database.py`)
-   **User**: Stores email, name, and encrypted Google tokens.
-   **EmailRecord**: Stores scanned emails their labels (`safe`, `suspicious`, `phishing`), and the AI's reasoning.

### 4.3. Email Syncing (`main.py`, `gmail_service.py`)
-   **Trigger**: User clicks "Scan" or backend scheduled job.
-   **Mechanism**: Spawns a background `Thread` to avoid blocking the API.
-   **Fetching**: Uses `gmail_service` to fetch emails in batches. Handles rate limits automatically.

### 4.4. AI Classification Service (`ai_service.py`)
This is the core "brain" of the agent. It uses a **3-Stage Hybrid Pipeline**:

#### Stage 1: Technical & Keyword Analysis (Fast)
-   Checks for known bad patterns (e.g., "Urgent" + "Wire Transfer").
-   Checks for malicious URLs (IP addresses, shorteners like `bit.ly`).
-   **Output**: A baseline risk score (0-100).

#### Stage 2: Semantic Search / RAG (Smart)
-   **Technology**: Uses `fastembed` to convert the email into a vector.
-   **Retrieval**: Searches the database for:
    1.  **Similar Patterns**: "Have I seen a phishing email like this before?"
    2.  **User Feedback**: "Did the user previously say emails from `bank.com` are Safe?"
    -   **Output**: A "Prior Belief" (e.g., "This looks 90% like a known safe email").

#### Stage 3: LLM Verification (Judge)
-   **Input**: Combines findings from Stage 1 & Stage 2 + the email body.
-   **Action**: Sends a structured prompt to **Groq (Llama 3)**.
-   **Output**: Final verdict (`safe`/`suspicious`/`phishing`) + Explanation.

## 5. Directory Structure

```text
backend/
├── app/
│   ├── main.py            # API Routes & App Entrypoint
│   ├── models.py          # Database Schema
│   ├── database.py        # SQLite Connection
│   ├── config.py          # Environment Variables
│   └── services/
│       ├── ai_service.py    # Hybrid AI Logic (Rules + RAG + LLM)
│       ├── auth_service.py  # Google OAuth Handlers
│       └── gmail_service.py # Gmail API Client
├── datasets/              # Training Data (JSONL files)
├── tools/                 # CLI Tools for Fine-tuning
├── email_scanner.db       # Local Database File
└── requirements.txt       # Python Dependencies
```

## 6. Fine-Tuning & Learning
The system learns in two ways:
1.  **Implicit**: By adding more labeled data to `datasets/training_data.jsonl` and restarting, the RAG system gets smarter.
2.  **Explicit**: When a user corrects a label in the UI, it saves to the DB. Future scans will find this "User Override" via Semantic Search and respect it.
