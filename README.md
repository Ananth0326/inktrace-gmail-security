# 🖋️ InkTrace: AI-Powered Gmail Security Agent

InkTrace is a sophisticated security platform that uses a hybrid AI pipeline to detect phishing and suspicious activities in real-time. It combines traditional rule-based filtering with modern Semantic Search (RAG) and Large Language Models (LLM) to provide a "second pair of eyes" for your inbox.

---

## 🚀 Key Features

-   **3-Stage Hybrid AI Pipeline**: Combines Regex Rules, Local Semantic Search, and LLM reasoning (Llama 3 via Groq) for maximum accuracy.
-   **Magnetic Intelligence UI**: Physics-based panel transitions using hardware-accelerated transforms that respond to user intent.
-   **Electric Ink Glow System**: Real-time visual risk heuristics (Safe, Suspicious, Phishing) that pulse based on threat severity.
-   **Privacy-First Design**: All vector embeddings are generated locally using `fastembed`. Your email content is never sent to third-party services for training.
-   **Explainable Security**: Every verdict comes with a detailed reasoning breakdown (e.g., "Brand spoofing detected + Urgency signals").

---

## 🛠️ Tech Stack

### Frontend
- **React (Vite)**: Component-based architecture with hooks for state management.
- **Framer Motion**: Hardware-accelerated transforms for high-performance animations.
- **Vanilla CSS**: Custom design system with over 2,700 lines of code for precise layout control.

### Backend
- **FastAPI**: Asynchronous Python framework for high-concurrency email processing.
- **SQLAlchemy + SQLite**: Robust local data storage and ORM.
- **Google OAuth2**: Secure, read-only authentication via Google Identity.

### AI & Machine Learning
- **Groq (Llama 3)**: Ultra-fast LLM inference for final threat classification.
- **FastEmbed**: Local CPU-optimized vector embedding generation.
- **Numpy**: Vector operations for semantic similarity (Cosine Similarity).

---

## 🏗️ Architecture Design
InkTrace follows a Retrieval-Augmented Generation (RAG) architecture:
1.  **Ingestion**: Background threads fetch emails via Gmail API.
2.  **Vectorization**: Content is converted into 384-dimensional vectors locally.
3.  **Retrieval**: The system compares new emails against a local database of known threats using Cosine Similarity.
4.  **Inference**: A context-aware prompt is sent to the LLM (Llama 3) to arrive at the final verdict.

---

## 🎨 Design Philosophy
-   **The Ink Stroke**: We replaced standard shadows with 1.5px solid ink borders to create a "blueprint" technical feel.
-   **Editorial Typography**: High-contrast typography and bold headers (800 weight) ensure clear information hierarchy.
-   **Information Pacing**: Staggered reveals (0.08s delay) ensure the analyst digests risk signals sequentially.

---

## 🚀 Getting Started

### Clone the Repository
```bash
git clone https://github.com/Ananth0326/inktrace-gmail-security.git
```

### Setup Backend
1.  Navigate to `backend`: `cd backend`
2.  Create `.env` file from `.env.example`.
3.  Install dependencies: `pip install -r requirements.txt`
4.  Run server: `uvicorn app.main:app --reload`

### Setup Frontend
1.  Navigate to `frontend`: `cd frontend`
2.  Install dependencies: `npm install`
3.  Run dev server: `npm run dev`

---

## 🛡️ License
Distributed under the MIT License. See `LICENSE` for more information.
