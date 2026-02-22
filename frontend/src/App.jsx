import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const PAGE_SIZE = 120;

const FILTERS = [
  { key: "all", label: "All Mail", statKey: "total" },
  { key: "safe", label: "Safe", statKey: "safe" },
  { key: "suspicious", label: "Suspicious", statKey: "suspicious" },
  { key: "phishing", label: "Phishing", statKey: "phishing" },
];

const DENSITIES = ["comfortable", "compact"];
const TRUSTED_DOMAINS = ["linkedin.com", "google.com", "microsoft.com", "github.com", "amazon.com"];
const HIGHLIGHT_TERMS = ["urgent", "verify", "password", "asap", "confirm", "otp", "invoice"];
const PANEL_TRANSITION = { duration: 0.5, ease: [0.19, 1, 0.22, 1] };
const LIST_VARIANTS = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
};
const ANALYSIS_CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
};
const ANALYSIS_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.19, 1, 0.22, 1] } },
};
const ANALYSIS_PANEL_VARIANTS = {
  hidden: { x: "100%", opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { ...PANEL_TRANSITION, staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

function badgeClass(label) {
  if (label === "phishing") return "chip chip-danger";
  if (label === "suspicious") return "chip chip-warn";
  return "chip chip-safe";
}

function panelGlowClass(label) {
  if (label === "phishing") return "glow-danger";
  if (label === "suspicious") return "glow-suspicious";
  if (label === "safe") return "glow-safe";
  return "";
}

function asDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

function extractDomain(sender) {
  const match = (sender || "").match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return match ? match[1].toLowerCase() : "";
}

function inferSignals(mail, blockedDomains = [], blockedSenders = []) {
  const reason = (mail.reason || "").toLowerCase();
  const text = `${mail.subject || ""} ${mail.snippet || ""}`.toLowerCase();
  const sender = (mail.sender || "").toLowerCase();
  const domain = extractDomain(mail.sender);
  return {
    spoof: reason.includes("brand") || reason.includes("lookalike") || reason.includes("domain"),
    link: reason.includes("url") || reason.includes("link") || text.includes("http"),
    attachment: text.includes("attachment") || text.includes(".pdf") || text.includes("invoice"),
    blocked: (domain && blockedDomains.includes(domain)) || blockedSenders.includes(sender),
  };
}

function isRiskyLabel(label) {
  return label === "suspicious" || label === "phishing";
}

function firstIntel(reasonText) {
  const lines = (reasonText || "").split(" | ").map((line) => line.trim()).filter(Boolean);
  return lines.slice(0, 2).join(" | ");
}

function topRiskFactor(reasonText) {
  const lines = (reasonText || "").split(" | ").map((line) => line.trim()).filter(Boolean);
  return lines[0] || "No high-risk factor detected";
}

function domainTrust(domain, domainCounts) {
  if (!domain) return { label: "UNKNOWN", cls: "domain-unknown" };
  if (TRUSTED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { label: "TRUSTED", cls: "domain-trusted" };
  }
  if ((domainCounts[domain] || 0) <= 1) {
    return { label: "NEW DOMAIN", cls: "domain-new" };
  }
  return { label: "OBSERVED", cls: "domain-observed" };
}

function highlightSnippet(snippet) {
  const text = snippet || "";
  if (!text) return "";
  const regex = new RegExp(`\\b(${HIGHLIGHT_TERMS.join("|")})\\b`, "gi");
  const out = [];
  let last = 0;
  let match = regex.exec(text);
  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > last) out.push(text.slice(last, start));
    out.push(<mark key={`${start}-${end}`}>{text.slice(start, end)}</mark>);
    last = end;
    match = regex.exec(text);
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function riskLevel(stats) {
  const total = stats.total || 0;
  if (!total) return { label: "Low", cls: "risk-low" };
  const riskRatio = (stats.phishing + stats.suspicious) / total;
  if (riskRatio >= 0.45) return { label: "High", cls: "risk-high" };
  if (riskRatio >= 0.2) return { label: "Medium", cls: "risk-medium" };
  return { label: "Low", cls: "risk-low" };
}

function timeAgo(isoTs) {
  if (!isoTs) return "No completed scan yet";
  const deltaSec = Math.max(0, Math.floor((Date.now() - new Date(isoTs).getTime()) / 1000));
  if (deltaSec < 60) return `Last scan: ${deltaSec}s ago`;
  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) return `Last scan: ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `Last scan: ${hrs}h ago`;
}

function riskScore(stats) {
  const total = Math.max(1, stats.total || 0);
  const weighted = (stats.phishing * 1.0 + stats.suspicious * 0.62 + stats.safe * 0.08) / total;
  return Math.max(0, Math.min(100, Math.round(weighted * 100)));
}

function groupedFindings(reasonText) {
  const lines = (reasonText || "No details")
    .split(" | ")
    .map((line) => line.trim())
    .filter(Boolean);

  const grouped = {
    sender: [],
    content: [],
    links: [],
    urgency: [],
    other: [],
  };

  for (const line of lines) {
    const l = line.toLowerCase();
    if (l.includes("sender") || l.includes("domain") || l.includes("brand")) grouped.sender.push(line);
    else if (l.includes("url") || l.includes("link") || l.includes("ip")) grouped.links.push(line);
    else if (l.includes("urgent") || l.includes("otp") || l.includes("password")) grouped.urgency.push(line);
    else if (l.includes("lookalike") || l.includes("content") || l.includes("text")) grouped.content.push(line);
    else grouped.other.push(line);
  }

  return grouped;
}

export default function App() {
  const [session, setSession] = useState(localStorage.getItem("session") || "");
  const [authError, setAuthError] = useState("");
  const [emails, setEmails] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState({ status: "idle", processed: 0, saved: 0, error: null });
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ total: 0, safe: 0, suspicious: 0, phishing: 0 });
  const [pageInfo, setPageInfo] = useState({ total: 0, offset: 0, limit: PAGE_SIZE });
  const [profile, setProfile] = useState({ email: "", name: "" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [isMenuAnimating, setIsMenuAnimating] = useState(false);
  const [isAnalysisAnimating, setIsAnalysisAnimating] = useState(false);
  const [actionMenuId, setActionMenuId] = useState(null);
  const [density, setDensity] = useState(localStorage.getItem("density") || "comfortable");
  const [lastScanAt, setLastScanAt] = useState(localStorage.getItem("lastScanAt") || "");
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [analysisConfidence, setAnalysisConfidence] = useState(0);
  const [blockedDomains, setBlockedDomains] = useState(() => {
    try {
      const raw = localStorage.getItem("blockedDomains");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [blockedSenders, setBlockedSenders] = useState(() => {
    try {
      const raw = localStorage.getItem("blockedSenders");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const profileRef = useRef(null);
  const viewRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionFromUrl = params.get("session");
    const authErrorFromUrl = params.get("auth_error");
    if (authErrorFromUrl) setAuthError(authErrorFromUrl);
    if (sessionFromUrl) {
      localStorage.setItem("session", sessionFromUrl);
      setSession(sessionFromUrl);
    }
    if (sessionFromUrl || authErrorFromUrl) window.history.replaceState({}, "", "/");
  }, []);

  useEffect(() => {
    if (!session) return;
    loadEmails({ reset: true, token: session });
    loadStats(session);
    loadProfile(session);
  }, [session, filter]);

  useEffect(() => {
    if (!DENSITIES.includes(density)) {
      setDensity("comfortable");
      return;
    }
    localStorage.setItem("density", density);
  }, [density]);

  useEffect(() => {
    if (lastScanAt) localStorage.setItem("lastScanAt", lastScanAt);
  }, [lastScanAt]);

  useEffect(() => {
    localStorage.setItem("blockedDomains", JSON.stringify(blockedDomains));
  }, [blockedDomains]);

  useEffect(() => {
    localStorage.setItem("blockedSenders", JSON.stringify(blockedSenders));
  }, [blockedSenders]);

  useEffect(() => {
    const onPointerDown = (evt) => {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(evt.target)) setProfileOpen(false);
      if (viewRef.current && !viewRef.current.contains(evt.target)) setViewOpen(false);
      if (!evt.target.closest(".row-actions-wrap")) setActionMenuId(null);
    };
    const onEsc = (evt) => {
      if (evt.key === "Escape") setProfileOpen(false);
      if (evt.key === "Escape") setViewOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    if (!session || !syncing) return undefined;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/emails/sync/status`, {
          headers: { Authorization: `Bearer ${session}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setSyncState(data);
        await loadEmails({ reset: true });
        await loadStats();
        if (data.status === "completed" || data.status === "failed") {
          setSyncing(false);
          if (data.status === "completed") {
            setLastScanAt(new Date().toISOString());
          }
        }
      } catch {
        // ignore transient polling errors
      }
    }, 2000);
    return () => clearInterval(id);
  }, [session, syncing, filter]);

  const visibleEmails = useMemo(() => {
    if (!search) return emails;
    const q = search.toLowerCase();
    return emails.filter((mail) =>
      [mail.subject, mail.sender, mail.snippet, mail.reason].join(" ").toLowerCase().includes(q)
    );
  }, [emails, search]);

  const todayOverview = useMemo(() => {
    const highRisk = emails.filter((m) => m.label === "phishing" || (m.label === "suspicious" && (m.confidence || 0) >= 85)).length;
    const domainFreq = {};
    for (const mail of emails) {
      const d = extractDomain(mail.sender);
      if (!d) continue;
      domainFreq[d] = (domainFreq[d] || 0) + 1;
    }
    const newDomains = Object.values(domainFreq).filter((count) => count === 1).length;
    const lookalike = emails.filter((m) => (m.reason || "").toLowerCase().includes("lookalike")).length;
    return { highRisk, newDomains, lookalike };
  }, [emails]);

  const domainCounts = useMemo(() => {
    const counts = {};
    for (const mail of emails) {
      const d = extractDomain(mail.sender);
      if (!d) continue;
      counts[d] = (counts[d] || 0) + 1;
    }
    return counts;
  }, [emails]);

  const scanStage = useMemo(() => {
    if (!syncing) return "Idle";
    if (syncState.saved < 20) return "Analyzing headers...";
    if (syncState.saved < 80) return "Checking domain reputation...";
    return "Evaluating AI signals...";
  }, [syncing, syncState.saved]);

  useEffect(() => {
    if (!detailsOpen || !selected) {
      setAnalysisConfidence(0);
      return;
    }
    const next = Math.max(0, Math.min(100, selected.confidence || 0));
    setAnalysisConfidence(0);
    const id = window.setTimeout(() => setAnalysisConfidence(next), 40);
    return () => window.clearTimeout(id);
  }, [detailsOpen, selected?.id, selected?.confidence]);

  const scanStepIndex = useMemo(() => {
    if (!syncing) return -1;
    if (syncState.saved < 20) return 0;
    if (syncState.saved < 80) return 1;
    return 2;
  }, [syncing, syncState.saved]);

  useEffect(() => {
    const onHotkeys = (evt) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (!visibleEmails.length) return;

      const currentIdx = selected ? visibleEmails.findIndex((m) => m.id === selected.id) : 0;
      if (evt.key === "j") {
        const next = Math.min(visibleEmails.length - 1, Math.max(0, currentIdx + 1));
        setSelected(visibleEmails[next]);
      } else if (evt.key === "k") {
        const prev = Math.max(0, currentIdx - 1);
        setSelected(visibleEmails[prev]);
      } else if (evt.key === "Enter" && selected) {
        setDetailsOpen(true);
      }
    };

    document.addEventListener("keydown", onHotkeys);
    return () => document.removeEventListener("keydown", onHotkeys);
  }, [visibleEmails, selected]);

  async function loadEmails({ reset = false, token = session } = {}) {
    if (!token) return;
    const nextOffset = reset ? 0 : pageInfo.offset + pageInfo.limit;
    setLoading(true);
    setError("");
    try {
      const labelQuery = filter === "all" ? "" : `&label=${filter}`;
      const res = await fetch(`${API_BASE}/emails?limit=${PAGE_SIZE}&offset=${nextOffset}${labelQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load emails");
      const data = await res.json();
      const rows = data.items || [];
      const merged = reset ? rows : [...emails, ...rows];
      setEmails(merged);
      setSelected((old) => {
        if (reset) return rows[0] || null;
        return old || rows[0] || null;
      });
      setPageInfo({ total: data.total || rows.length, offset: nextOffset, limit: data.limit || PAGE_SIZE });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleMailScroll(evt) {
    const el = evt.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (!nearBottom || loading) return;
    if (emails.length >= pageInfo.total) return;
    loadEmails();
  }

  async function loadStats(token = session) {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/emails/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setStats({
        total: data.total || 0,
        safe: data.safe || 0,
        suspicious: data.suspicious || 0,
        phishing: data.phishing || 0,
      });
    } catch {
      // ignore transient stats failures
    }
  }

  async function loadProfile(token = session) {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setProfile({ email: data.email || "", name: data.name || "" });
    } catch {
      // ignore transient profile failures
    }
  }

  async function signIn() {
    try {
      setAuthError("");
      const redirectTo = window.location.origin;
      const res = await fetch(`${API_BASE}/auth/google/login?redirect_to=${encodeURIComponent(redirectTo)}`);
      if (!res.ok) throw new Error("Failed to start Google sign-in.");
      const data = await res.json();
      if (!data?.auth_url) throw new Error("Google auth URL missing from backend response.");
      window.location.href = data.auth_url;
    } catch (e) {
      setAuthError(e.message || "Google sign-in failed.");
    }
  }

  async function syncEmails() {
    if (!session) return;
    setSyncing(true);
    setSyncState({ status: "running", processed: 0, saved: 0, error: null });
    setError("");
    try {
      const res = await fetch(`${API_BASE}/emails/sync?max_results=500&page_size=250`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session}` },
      });
      if (!res.ok) throw new Error("Sync failed");
      await loadEmails({ reset: true });
      await loadStats();
    } catch (e) {
      setError(e.message);
      setSyncing(false);
    }
  }

  async function logout() {
    if (!session) return;
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session}` },
    });
    localStorage.removeItem("session");
    setSession("");
    setEmails([]);
    setSelected(null);
    setSyncing(false);
    setSyncState({ status: "idle", processed: 0, saved: 0, error: null });
  }

  async function quickRelabel(emailId, label) {
    if (!session || !emailId) return;
    try {
      const res = await fetch(`${API_BASE}/emails/${emailId}/label?label=${label}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session}` },
      });
      if (!res.ok) return;
      setEmails((prev) => prev.map((m) => (m.id === emailId ? { ...m, label } : m)));
      if (selected?.id === emailId) setSelected((old) => ({ ...old, label }));
      loadStats();
    } catch {
      // keep UI non-blocking for quick actions
    }
  }

  function blockSelectedSender() {
    if (!selected) return;
    const domain = extractDomain(selected.sender);
    if (!domain) return;
    setBlockedDomains((prev) => (prev.includes(domain) ? prev : [...prev, domain]));
  }

  function blockDomainFromSender(sender) {
    const domain = extractDomain(sender);
    if (!domain) return;
    setBlockedDomains((prev) => (prev.includes(domain) ? prev : [...prev, domain]));
  }

  function blockSenderAddress(sender) {
    const normalized = (sender || "").toLowerCase().trim();
    if (!normalized) return;
    setBlockedSenders((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-grid-bg" />
        <div className="auth-landing">
          <section className="auth-hero cardish">
            <div className="auth-left">
              <p className="eyebrow">InkTrace Security</p>
              <h1>AI Security Intelligence for Your Gmail</h1>
              <p className="auth-copy">
                InkTrace analyzes domain behavior, AI risk signals, and phishing patterns
                without accessing your private content.
              </p>
              <p className="trust-inline">
                Secure Google OAuth | Read-only analysis | Explainable AI reasoning
              </p>
              {authError && <div className="error-box">{authError}</div>}
              <div className="auth-cta-row">
                <button className="btn btn-primary auth-cta" onClick={signIn}>
                  Continue With Google
                </button>
                <a className="btn btn-ghost auth-cta-secondary" href="#how-it-works">
                  See How It Works
                </a>
              </div>
            </div>
            <div className="auth-right">
              <div className="preview-card">
                <div className="preview-top">
                  <span>Threat Level: Medium</span>
                  <span>AI Engine: Active</span>
                </div>
                <div className="preview-row danger">
                  <strong>HIGH RISK</strong>
                  <span>Brand spoof + external redirect</span>
                </div>
                <div className="preview-row warn">
                  <strong>SUSPICIOUS</strong>
                  <span>New domain + urgency language</span>
                </div>
                <div className="preview-row safe">
                  <strong>SAFE</strong>
                  <span>Trusted domain + normal behavior</span>
                </div>
              </div>
            </div>
          </section>

          <section className="how-it-works cardish" id="how-it-works">
            <p className="section-tag">How It Works</p>
            <h3>How It Works</h3>
            <div className="steps-grid">
              <div><strong>1.</strong> Connect Gmail</div>
              <div><strong>2.</strong> AI analyzes threats</div>
              <div><strong>3.</strong> Block phishing instantly</div>
            </div>
          </section>

          <section className="feature-proof cardish">
            <p className="section-tag">Security Proof</p>
            <h3>Security Proof</h3>
            <div className="proof-grid">
              <p>Confidence scoring for every verdict</p>
              <p>Risk signals and domain trust labels</p>
              <p className="proof-highlight">Containment actions: block sender/domain</p>
              <p>Transparent AI reasoning in one click</p>
            </div>
          </section>

          <section className="security-authority cardish">
            <p className="section-tag">InkTrace Security</p>
            <h3>Built for privacy-first email protection</h3>
            <p>
              InkTrace analyzes behavioral signals, domain trust, and AI reasoning
              without storing your Gmail password.
            </p>
          </section>

        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell premium-grain density-${density} mode-workspace ${syncing ? "is-syncing" : ""}`}>
      <div className={`app-frame ${isSearchFocused ? "search-focused" : ""}`}>
        <header className="topbar">
          <div className="brand-cell">
            <button
              className={navOpen ? "btn btn-ghost burger brand-burger is-open" : "btn btn-ghost burger brand-burger"}
              onClick={() => setNavOpen((open) => !open)}
              aria-label="Toggle menu"
            >
              {"\u2630"}
            </button>
            <div>
              <h2 className={`brand-title ${syncing ? "ai-active" : ""}`}>InkTrace</h2>
              <p className="brand-subtitle">Mail Risk Intelligence</p>
            </div>
          </div>
          <div className="search-cell">
            <motion.input
              placeholder="Search sender, subject, snippet, finding..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              whileFocus={{ scale: 1.02, boxShadow: "0 0 15px rgba(124, 58, 237, 0.1)" }}
            />
          </div>
          <div className="action-cell">
            <motion.button
              className="btn btn-primary scan-btn"
              onClick={syncEmails}
              disabled={syncing}
              animate={
                syncing
                  ? {
                      boxShadow: [
                        "0px 0px 0px rgba(124, 58, 237, 0)",
                        "0px 0px 12px rgba(124, 58, 237, 0.4)",
                        "0px 0px 0px rgba(124, 58, 237, 0)",
                      ],
                    }
                  : { boxShadow: "0 10px 20px rgba(124, 92, 255, 0.22)" }
              }
              transition={
                syncing
                  ? { boxShadow: { repeat: Infinity, duration: 2 } }
                  : { boxShadow: { duration: 0.2 } }
              }
            >
              {syncing && <span className="live-dot" aria-hidden="true" />}
              {syncing ? `Scanning ${syncState.saved}` : "Scan Environment"}
            </motion.button>
            <button className="btn btn-ghost density-toggle" onClick={() => setAnalyticsOpen((v) => !v)}>
              View Analytics
            </button>
            <div className="view-pop-wrap" ref={viewRef}>
              <button
                className="btn btn-ghost density-toggle view-trigger"
                title="View options"
                onClick={() => setViewOpen((v) => !v)}
                aria-label="Open view options"
              >
                {"\u2637"}
              </button>
              <div className={viewOpen ? "view-pop open" : "view-pop"}>
                <button
                  className={density === "comfortable" ? "view-option active" : "view-option"}
                  onClick={() => {
                    setDensity("comfortable");
                    setViewOpen(false);
                  }}
                >
                  Comfortable
                </button>
                <button
                  className={density === "compact" ? "view-option active" : "view-option"}
                  onClick={() => {
                    setDensity("compact");
                    setViewOpen(false);
                  }}
                >
                  Compact
                </button>
                <button className="view-option" disabled>
                  Raw Data (soon)
                </button>
              </div>
            </div>
            <div className="profile-chip" ref={profileRef}>
              <button
                className="avatar"
                onClick={() => setProfileOpen((open) => !open)}
                aria-label="Open profile"
              >
                {(profile.name || "U")
                  .split(" ")
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </button>
              {profileOpen && (
                <div className="profile-pop">
                  <p className="profile-name">{profile.name || "Your Profile"}</p>
                  <span className="profile-meta">{profile.email || "Gmail Connected"}</span>
                  <button className="btn btn-ghost profile-logout" onClick={logout}>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {analyticsOpen && (
          <div className="analytics-pop">
            <p>Threat Level: {riskLevel(stats).label}</p>
            <p>Total: {stats.total}</p>
            <p>Safe: {stats.safe}</p>
            <p>Suspicious: {stats.suspicious}</p>
            <p>Phishing: {stats.phishing}</p>
            <p>Blocked Domains: {blockedDomains.length}</p>
          </div>
        )}

        {(error || (syncState.status === "failed" && syncState.error)) && (
          <div className="error-box">{syncState.status === "failed" ? syncState.error : error}</div>
        )}

        <motion.main layout transition={PANEL_TRANSITION} className={`workspace motion-layout ${detailsOpen ? "details-open" : ""}`}>
          <AnimatePresence initial={false}>
            {navOpen && (
              <motion.aside
                initial={{ x: -32, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -32, opacity: 0 }}
                transition={PANEL_TRANSITION}
                onAnimationStart={() => setIsMenuAnimating(true)}
                onAnimationComplete={() => setIsMenuAnimating(false)}
                className={`left-panel panel-surface card accelerated-panel ink-border panel-open ${!isMenuAnimating ? "butter-surface" : "panel-solid-fallback"}`}
              >
            <div className="panel-title-wrap">
              <h3>Mailbox</h3>
              <span className="total-pill">{stats.total}</span>
            </div>
            <div className="filter-stack">
              {FILTERS.map((entry) => (
                <button
                  key={entry.key}
                  className={
                    filter === entry.key
                      ? `filter-btn active active-${entry.key}`
                      : "filter-btn"
                  }
                  onClick={() => setFilter(entry.key)}
                >
                  <span>{entry.label}</span>
                  <strong>{stats[entry.statKey]}</strong>
                </button>
              ))}
            </div>
            <div className="quick-stats">
              <div>
                <small>Loaded</small>
                <strong>{visibleEmails.length}</strong>
              </div>
              <div>
                <small>Status</small>
                <strong>{syncing ? "Running" : "Idle"}</strong>
              </div>
            </div>
            <div className="threat-overview">
              <strong>Today's Risk</strong>
              <p>High Risk: {todayOverview.highRisk}</p>
              <p>New Domains: {todayOverview.newDomains}</p>
              <p>Lookalike Attacks: {todayOverview.lookalike}</p>
            </div>
            <div className="engine-status">
              <strong>Status</strong>
              <p>AI Engine: Active</p>
              <p>{timeAgo(lastScanAt)}</p>
            </div>
              </motion.aside>
            )}
          </AnimatePresence>

          <motion.section layout transition={PANEL_TRANSITION} className="center-panel panel-surface card accelerated-panel ink-border panel-open">
            <div className="panel-head">
              <h3>Threat Feed</h3>
              <p>
                {visibleEmails.length} shown / {pageInfo.total} filtered
              </p>
            </div>
            <div className="mail-columns">
              <span>Source</span>
              <span>Context</span>
              <span className="status-heading">Actions</span>
            </div>
            {syncing && (
              <div className="sync-banner">
                <span className="sync-system">
                  <span className="system-dot" aria-hidden="true" />
                  System Activity
                </span>
                <span>{syncState.saved} stored</span>
                <div className="scan-steps" aria-label="Scan stages">
                  <span className={scanStepIndex >= 0 ? "active" : ""}>Analyzing headers</span>
                  <span className={scanStepIndex >= 1 ? "active" : ""}>Checking domain reputation</span>
                  <span className={scanStepIndex >= 2 ? "active" : ""}>Evaluating AI signals</span>
                </div>
              </div>
            )}
            <motion.div className="mail-list" onScroll={handleMailScroll} variants={LIST_VARIANTS} initial="hidden" animate="show">
              {visibleEmails.map((mail) => (
                <motion.div
                  key={mail.id}
                  className={[
                    "mail-row threat-row",
                    selected?.id === mail.id ? "selected" : "",
                    `mail-row-${mail.label || "safe"}`,
                  ]
                    .join(" ")
                    .trim()}
                  variants={ITEM_VARIANTS}
                  whileHover={{ x: 6 }}
                  transition={{ duration: 0.16, ease: [0.19, 1, 0.22, 1] }}
                >
                  {(() => {
                    const domain = extractDomain(mail.sender);
                    const trust = domainTrust(domain, domainCounts);
                    const signals = inferSignals(mail, blockedDomains, blockedSenders);
                    return (
                      <>
                  <div className="row-left">
                    <div className="row-verdict">
                      <span className={badgeClass(mail.label)} data-tip={topRiskFactor(mail.reason)}>{mail.label}</span>
                    </div>
                    <div className="signal-icons">
                      {signals.spoof && <span className="sig sig-primary" title="Domain spoof indicator">{"\u26A0"}</span>}
                      {signals.blocked && <span className="sig sig-primary" title="Blocked sender domain">{"\u26D4"}</span>}
                      {signals.link && <span className="sig sig-secondary" title="External link indicator">{"\uD83D\uDD17"}</span>}
                      {signals.attachment && <span className="sig sig-secondary" title="Attachment indicator">{"\uD83D\uDCCE"}</span>}
                      {trust.label === "NEW DOMAIN" && <span className="sig sig-secondary" title="New sender domain">{"\uD83C\uDF10"}</span>}
                    </div>
                    <p className="row-sender">
                      {mail.sender || "Unknown sender"}
                    </p>
                    <p className="domain-context">
                      {domain || "unknown domain"} <span className={`domain-badge ${trust.cls}`}>{trust.label}</span>
                    </p>
                  </div>
                  <div className="mail-main">
                    <p className="subject">{mail.subject || "(No Subject)"}</p>
                    <p className="snippet">{highlightSnippet(mail.snippet)}</p>
                    <p className="hover-intel">{firstIntel(mail.reason)}</p>
                    <div className="row-risk">
                      <div className="row-risk-head">
                        <small className="ai-confidence-label">
                          AI Confidence {syncing && <span className="ai-pulse-dot" aria-hidden="true" />}
                        </small>
                      </div>
                      <div className="row-risk-track">
                        <div
                          className={`${badgeClass(mail.label).replace("chip ", "")} confidence-fill-row`}
                          style={{ "--confidence": `${Math.max(0, Math.min(100, mail.confidence || 0))}%` }}
                        />
                        <small className="risk-percent">{mail.confidence || 0}%</small>
                      </div>
                    </div>
                  </div>
                  <div className="mail-meta">
                    <small>{asDate(mail.scanned_at)}</small>
                    <div className="triage-inline">
                      <button
                        className="mini-action triage-btn triage-inspect"
                        onClick={() => {
                          setSelected(mail);
                          setDetailsOpen(true);
                        }}
                      >
                        Inspect
                      </button>
                      {isRiskyLabel(mail.label) && (
                        <button className="mini-action triage-btn triage-quarantine" onClick={() => blockDomainFromSender(mail.sender)}>
                          Quarantine
                        </button>
                      )}
                      <button className="mini-action triage-btn triage-dismiss" onClick={() => quickRelabel(mail.id, "safe")}>
                        Dismiss
                      </button>
                    </div>
                    <div className="row-actions-wrap">
                      <button
                        className="row-menu-trigger"
                        onClick={() => setActionMenuId((prev) => (prev === mail.id ? null : mail.id))}
                        aria-label="More actions"
                      >
                        ...
                      </button>
                      <div className={actionMenuId === mail.id ? "row-actions open" : "row-actions"}>
                        {isRiskyLabel(mail.label) && (
                          <button className="mini-action action-block" onClick={() => blockDomainFromSender(mail.sender)}>
                            Block Domain
                          </button>
                        )}
                        <button className="mini-action" onClick={() => quickRelabel(mail.id, "safe")}>
                          Mark Safe
                        </button>
                        <button className="mini-action" onClick={() => quickRelabel(mail.id, "suspicious")}>
                          Mark Suspicious
                        </button>
                      </div>
                    </div>
                  </div>
                      </>
                    );
                  })()}
                </motion.div>
              ))}
              {!visibleEmails.length && <p className="empty">No emails available in this view.</p>}
              {loading && emails.length > 0 && <p className="empty">Loading more...</p>}
            </motion.div>
          </motion.section>

          <AnimatePresence initial={false}>
            {detailsOpen && (
              <motion.section
                variants={ANALYSIS_PANEL_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="hidden"
                onAnimationStart={() => setIsAnalysisAnimating(true)}
                onAnimationComplete={() => setIsAnalysisAnimating(false)}
                className={`right-panel panel-surface card open squeeze-panel accelerated-panel ink-border panel-open ink-border-active ${panelGlowClass(selected?.label)} ${!isAnalysisAnimating ? "butter-surface" : "panel-solid-fallback"}`}
              >
                <motion.div
                  className="analysis-shell"
                  animate={{ scale: selected?.label === "phishing" ? 1.01 : 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  <motion.div className="panel-head" variants={ANALYSIS_ITEM_VARIANTS} initial="hidden" animate="show">
                    <h3>Threat Analysis</h3>
                    <button className="close-btn" onClick={() => setDetailsOpen(false)} aria-label="Close details">
                      {"\u00D7"}
                    </button>
                  </motion.div>
                  {!selected && <p className="empty">Select a message to inspect complete findings.</p>}
                  {selected && (
                    <motion.div
                      key={selected.id}
                      className="analysis"
                      variants={ANALYSIS_CONTAINER_VARIANTS}
                      initial="hidden"
                      animate="show"
                    >
                      <motion.h4 variants={ANALYSIS_ITEM_VARIANTS}>{selected.subject}</motion.h4>
                      <motion.div className="investigation-section" variants={ANALYSIS_ITEM_VARIANTS}>
                        <strong>Threat Summary</strong>
                        <p className="meta-line">
                          <strong>From:</strong> {selected.sender}
                        </p>
                        <p className="meta-line">
                          <strong>Verdict:</strong> <span className={badgeClass(selected.label)}>{selected.label}</span>
                        </p>
                        <p className="meta-line">
                          <strong>Confidence:</strong> {selected.confidence}%
                        </p>
                        <div className="confidence-bar">
                          <motion.div
                            className={`confidence-fill confidence-${selected.label || "safe"}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${analysisConfidence}%` }}
                            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                      </motion.div>
                      <motion.div className="investigation-section" variants={ANALYSIS_ITEM_VARIANTS}>
                        <strong>Risk Signals</strong>
                        <div className="signal-stack">
                          {Object.values(groupedFindings(selected.reason))
                            .flat()
                            .slice(0, 4)
                            .map((line, idx) => (
                              <p key={`risk-${idx}`}>{line}</p>
                            ))}
                        </div>
                      </motion.div>
                      <motion.div className="threat-actions" variants={ANALYSIS_ITEM_VARIANTS}>
                        {isRiskyLabel(selected.label) && (
                          <>
                            <span className="containment-label">Contain Threat</span>
                            <button className="mini-action action-block" onClick={() => blockDomainFromSender(selected.sender)}>
                              Block Domain
                            </button>
                            <button className="mini-action action-block" onClick={() => blockSenderAddress(selected.sender)}>
                              Block Sender
                            </button>
                          </>
                        )}
                        <button className="mini-action action-safe" onClick={() => quickRelabel(selected.id, "safe")}>
                          Mark Safe
                        </button>
                        <button className="mini-action action-suspicious" onClick={() => quickRelabel(selected.id, "suspicious")}>
                          Mark Suspicious
                        </button>
                        <button className="mini-action danger action-danger" onClick={() => quickRelabel(selected.id, "phishing")}>
                          Report Phishing
                        </button>
                        <button className="mini-action action-ignore" onClick={() => setDetailsOpen(false)}>
                          Ignore
                        </button>
                      </motion.div>
                      <motion.div className="investigation-section" variants={ANALYSIS_ITEM_VARIANTS}>
                        <strong>AI Reasoning</strong>
                        <div className="findings-card grouped">
                          {Object.entries(groupedFindings(selected.reason)).map(([group, lines]) =>
                            lines.length ? (
                              <div key={group}>
                                <strong className="finding-group">{group}</strong>
                                {lines.map((line, idx) => (
                                  <p key={`${selected.id}-${group}-${idx}`}>{line}</p>
                                ))}
                              </div>
                            ) : null
                          )}
                        </div>
                      </motion.div>
                      <motion.div className="investigation-section" variants={ANALYSIS_ITEM_VARIANTS}>
                        <strong>Technical Indicators</strong>
                        <div className="signal-stack technical-indicators">
                          <p>Sender Domain: {extractDomain(selected.sender) || "Unknown"}</p>
                          <p>SPF Result: Unknown (MVP)</p>
                          <p>Reply-To Mismatch: Not evaluated (MVP)</p>
                        </div>
                      </motion.div>
                      <motion.article variants={ANALYSIS_ITEM_VARIANTS}>{selected.body_text || selected.snippet}</motion.article>
                    </motion.div>
                  )}
                </motion.div>
              </motion.section>
            )}
          </AnimatePresence>
        </motion.main>
      </div>
    </div>
  );
}

