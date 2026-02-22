# Interview Guide: "The Why & How"

This guide is designed to help you explain your project confidently, from the high-level story to the deep technical edge cases.

---

## Part 1: The Narrative (Tell me about your project)

**"I built an AI-Powered Email Security Agent that acts as a second pair of eyes for your inbox."**

### How it works (The Flow):
1.  **Ingestion**: "It connects to Gmail via OAuth2 (read-only) and fetches emails in the background using Python threads to avoid blocking the API."
2.  **Analysis (The Hybrid Engine)**:
    *   **Step 1 (Fast)**: "First, it runs regex rules. Is there a known bad URL? Is the IP blacklisted? This is cheap and fast."
    *   **Step 2 (Context)**: "Then, it uses **Local Semantic Search**. It converts the email to a vector (using `fastembed`) and asks: *'Have I seen a similar email from this sender before?'* This helps it understand *your* personal context."
    *   **Step 3 (Reasoning)**: "Finally, if it's still unsure, it constructs a prompt with all this evidence and sends it to **Llama 3 (via Groq)** for a final verdict."
3.  **Action**: "It flags the email in a custom dashboard, explaining *exactly why* it's suspicious (e.g., 'Brand spoofing detected')."

---

## Part 2: Core Architectural Decisions

### Q1: "Why use a Hybrid Approach instead of just sending everything to GPT-4?"
"**Cost and Latency.** Sending every spam email to GPT-4 is a waste of money (~$0.03/email) and takes 2-3 seconds. My rule engine cleans up 80% of the noise in milliseconds for free. I only pay for the LLM when I need 'intelligence'."

### Q2: "Why RAG (Retrieval Augmented Generation)?"
"**Privacy and Personalization.** I don't want to fine-tune a model with my private emails—that's a security risk. With RAG, my past emails stay in my local database. I only retrieve the 3 most relevant snippets at runtime to give the LLM context. It learns instantly without re-training."

### Q3: "Why `fastembed` locally?"
"**To reduce external dependencies.** I generate vector embeddings on the CPU itself. This means even if the internet is flaky, my semantic search works, and I'm not sending email content to OpenAI just to get a vector."

---

## Part 3: The "Twisted" Questions (Senior/Principal Level)

### Q: "Your system relies on the `sender_domain` for trust. What if an attacker spoofs the domain (e.g., `admin@google.com`)?"
**A:** "Great question. In a production environment, I would verify **DKIM and SPF** records in the email headers to ensure the sender is actually authorized to use that domain. Currently, my `gmail_service` extracts headers, and enhancing it to validate DKIM signatures is the next item on my roadmap."

### Q: "What happens if you have 1 million emails? Will your Semantic Search (Cosine Similarity) get too slow?"
**A:** "Currently, I'm doing a linear scan in `numpy` which is fine for ~10k emails. For 1 million, I would switch to **FAISS** or **Qdrant**. These use 'HNSW' (Hierarchical Navigable Small World) indexes to perform approximate nearest neighbor search in $O(log N)$ time instead of $O(N)$."

### Q: "The LLM (Groq) is an external API. What if it goes down? Does email delivery stop?"
**A:** "No. My system is **Fail-Open** for availability but **Fail-Safe** for alerting.
1.  The scanning happens in a background thread, so it never blocks the user interface.
2.  If Groq fails, I have a fallback mechanisms: I rely on the 'Rule Score' and 'Semantic Score'. If both are high, I mark it 'Suspicious' conservatively. I log the error but don't crash the app."

### Q: "How do you handle 'Data Drift'? (e.g., phishers change their tactics next month)"
**A:** "That's why I added **User Feedback Loops**. If a new type of phishing attack slips through and I mark it as 'Phishing' in the UI, that email is added to the Vector Database immediately. The next time a similar attack comes in, the Semantic Search will find that example and flag it, even if the LLM doesn't know about the new trend yet."

### Q: "Why didn't you use Celery for the background workers?"
**A:** "Over-engineering. For a single-user application, adding a Redis broker + Celery worker process doubles the deployment complexity. A simple Python `threading.Thread` or `asyncio.create_task` is sufficient for fetching emails for one user. If I scaled to SaaS for 10,000 users, *then* I would introduce Celery/Kafka."
