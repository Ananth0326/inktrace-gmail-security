import { useEffect, useRef, useState } from "react";
import {
  getLabelBadgeCSSClass,
  getPanelGlowCSSClass,
  formatDate,
  extractDomainName,
  inferRiskSignals,
  isHighRiskLabel,
  getFirstReasonLine,
  getHighestRiskFactor,
  getDomainTrustStatus,
  highlightImportantWords,
  calculateOverallRiskLevel,
  calculateTimeAgoText,
  groupFindingsByCategory,
} from "./utils/helpers";

const API_BASE_URL = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const NUMBER_OF_EMAILS_PER_PAGE = 120;

const FILTER_OPTIONS = [
  { key: "all", label: "All Mail", statKey: "total" },
  { key: "safe", label: "Safe", statKey: "safe" },
  { key: "suspicious", label: "Suspicious", statKey: "suspicious" },
  { key: "phishing", label: "Phishing", statKey: "phishing" },
];

export default function App() {
  // Using fully spelled-out names for state variables so a beginner can understand them easily
  const [sessionTokenString, setSessionTokenString] = useState(localStorage.getItem("session") || "");
  const [authenticationErrorMessage, setAuthenticationErrorMessage] = useState("");
  
  const [allEmailsList, setAllEmailsList] = useState([]);
  const [selectedEmailRecord, setSelectedEmailRecord] = useState(null);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [isNavigationMenuOpen, setIsNavigationMenuOpen] = useState(true);
  
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [isCurrentlySyncing, setIsCurrentlySyncing] = useState(false);
  const [backgroundSyncStatusDictionary, setBackgroundSyncStatusDictionary] = useState({ status: "idle", processed: 0, saved: 0, error: null });
  
  const [currentFilterKeyText, setCurrentFilterKeyText] = useState("all");
  const [searchQueryText, setSearchQueryText] = useState("");
  const [generalErrorMessage, setGeneralErrorMessage] = useState("");
  
  const [emailStatisticsDictionary, setEmailStatisticsDictionary] = useState({ total: 0, safe: 0, suspicious: 0, phishing: 0 });
  const [paginationInfoDictionary, setPaginationInfoDictionary] = useState({ total: 0, offset: 0, limit: NUMBER_OF_EMAILS_PER_PAGE });
  
  const [userProfileDictionary, setUserProfileDictionary] = useState({ email: "", name: "" });
  const [isUserProfileMenuOpen, setIsUserProfileMenuOpen] = useState(false);
  
  const [isViewOptionsMenuOpen, setIsViewOptionsMenuOpen] = useState(false);
  const [openActionMenuEmailIdNumber, setOpenActionMenuEmailIdNumber] = useState(null);
  const [displayDensityString, setDisplayDensityString] = useState(localStorage.getItem("density") || "comfortable");
  
  const [lastCompletedScanTimeString, setLastCompletedScanTimeString] = useState(localStorage.getItem("lastScanAt") || "");
  const [isAnalyticsPopupOpen, setIsAnalyticsPopupOpen] = useState(false);
  const [isSearchBarFocused, setIsSearchBarFocused] = useState(false);
  
  const [blockedDomainsList, setBlockedDomainsList] = useState(() => {
    try {
      const storedDataString = localStorage.getItem("blockedDomains");
      if (storedDataString) {
        return JSON.parse(storedDataString);
      }
      return [];
    } catch (errorParsingData) {
      return [];
    }
  });
  
  const [blockedSendersList, setBlockedSendersList] = useState(() => {
    try {
      const storedDataString = localStorage.getItem("blockedSenders");
      if (storedDataString) {
        return JSON.parse(storedDataString);
      }
      return [];
    } catch (errorParsingData) {
      return [];
    }
  });

  const profileMenuHTMLReference = useRef(null);
  const viewOptionsMenuHTMLReference = useRef(null);

  // Read URL parameters on first load (for example, when Google redirects back after login)
  useEffect(() => {
    const urlParametersList = new URLSearchParams(window.location.search);
    const sessionTokenFromUrlVariable = urlParametersList.get("session");
    const authenticationErrorFromUrlVariable = urlParametersList.get("auth_error");
    
    if (authenticationErrorFromUrlVariable) {
      setAuthenticationErrorMessage(authenticationErrorFromUrlVariable);
    }
    
    if (sessionTokenFromUrlVariable) {
      localStorage.setItem("session", sessionTokenFromUrlVariable);
      setSessionTokenString(sessionTokenFromUrlVariable);
    }
    
    // Clean up the URL so it looks nice and doesn't have the token in the address bar
    if (sessionTokenFromUrlVariable || authenticationErrorFromUrlVariable) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // When session token or filter selection changes, load fresh data from the backend
  useEffect(() => {
    if (sessionTokenString) {
      fetchEmailsFromBackendFunction({ resetList: true, tokenString: sessionTokenString });
      fetchEmailStatisticsFromBackendFunction(sessionTokenString);
      fetchUserProfileFromBackendFunction(sessionTokenString);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionTokenString, currentFilterKeyText]);

  // Automatically save certain preference settings to local storage when they change
  useEffect(() => {
    localStorage.setItem("density", displayDensityString);
  }, [displayDensityString]);

  useEffect(() => {
    if (lastCompletedScanTimeString) {
      localStorage.setItem("lastScanAt", lastCompletedScanTimeString);
    }
  }, [lastCompletedScanTimeString]);

  useEffect(() => {
    localStorage.setItem("blockedDomains", JSON.stringify(blockedDomainsList));
  }, [blockedDomainsList]);

  useEffect(() => {
    localStorage.setItem("blockedSenders", JSON.stringify(blockedSendersList));
  }, [blockedSendersList]);

  // Add listeners for clicking outside menus (to close them) or hitting the Escape key
  useEffect(() => {
    function handleMouseClickEvent(mouseClickEvent) {
      if (profileMenuHTMLReference.current && !profileMenuHTMLReference.current.contains(mouseClickEvent.target)) {
        setIsUserProfileMenuOpen(false);
      }
      if (viewOptionsMenuHTMLReference.current && !viewOptionsMenuHTMLReference.current.contains(mouseClickEvent.target)) {
        setIsViewOptionsMenuOpen(false);
      }
      if (!mouseClickEvent.target.closest(".row-actions-wrap")) {
        setOpenActionMenuEmailIdNumber(null);
      }
    }
    
    function handleKeyDownEvent(keyboardEvent) {
      if (keyboardEvent.key === "Escape") {
        setIsUserProfileMenuOpen(false);
        setIsViewOptionsMenuOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleMouseClickEvent);
    document.addEventListener("keydown", handleKeyDownEvent);
    
    return () => {
      document.removeEventListener("mousedown", handleMouseClickEvent);
      document.removeEventListener("keydown", handleKeyDownEvent);
    };
  }, []);

  // Poll the backend every 2 seconds to check scan progress while a sync is running
  useEffect(() => {
    if (!sessionTokenString || !isCurrentlySyncing) {
      return;
    }
    
    const pollingIntervalId = setInterval(async () => {
      try {
        const responseFromBackend = await fetch(`${API_BASE_URL}/emails/sync/status`, {
          headers: { Authorization: `Bearer ${sessionTokenString}` },
        });
        
        if (!responseFromBackend.ok) {
          return;
        }
        
        const statusDataDictionary = await responseFromBackend.json();
        setBackgroundSyncStatusDictionary(statusDataDictionary);
        
        // Refresh the lists to show latest found emails safely
        await fetchEmailsFromBackendFunction({ resetList: true });
        await fetchEmailStatisticsFromBackendFunction(sessionTokenString);
        
        if (statusDataDictionary.status === "completed" || statusDataDictionary.status === "failed") {
          setIsCurrentlySyncing(false);
          if (statusDataDictionary.status === "completed") {
            setLastCompletedScanTimeString(new Date().toISOString());
          }
        }
      } catch (networkError) {
        // We ignore temporary network issues during polling to preserve the app workflow
      }
    }, 2000);
    
    return () => clearInterval(pollingIntervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionTokenString, isCurrentlySyncing, currentFilterKeyText]);

  // Derive visible emails using search text in regular readable code
  let currentlyVisibleEmailsList = allEmailsList;
  if (searchQueryText !== "") {
    const lowercaseSearchQueryText = searchQueryText.toLowerCase();
    currentlyVisibleEmailsList = allEmailsList.filter((emailRecordObject) => {
      const combinedSearchableText = `${emailRecordObject.subject} ${emailRecordObject.sender} ${emailRecordObject.snippet} ${emailRecordObject.reason}`.toLowerCase();
      return combinedSearchableText.includes(lowercaseSearchQueryText);
    });
  }

  // Calculate today's overview stats manually in clear code instead of complex iterations
  let highRiskEmailCountNumber = 0;
  let lookalikeAttackCountNumber = 0;
  const observedDomainCountsDictionary = {};

  for (let indexNumber = 0; indexNumber < allEmailsList.length; indexNumber++) {
    const currentEmailRecordObject = allEmailsList[indexNumber];
    
    if (currentEmailRecordObject.label === "phishing" || (currentEmailRecordObject.label === "suspicious" && currentEmailRecordObject.confidence >= 85)) {
      highRiskEmailCountNumber = highRiskEmailCountNumber + 1;
    }
    
    if (currentEmailRecordObject.reason && currentEmailRecordObject.reason.toLowerCase().includes("lookalike")) {
      lookalikeAttackCountNumber = lookalikeAttackCountNumber + 1;
    }
    
    const singleDomainNameString = extractDomainName(currentEmailRecordObject.sender);
    if (singleDomainNameString !== "") {
      if (observedDomainCountsDictionary[singleDomainNameString] !== undefined) {
        observedDomainCountsDictionary[singleDomainNameString] = observedDomainCountsDictionary[singleDomainNameString] + 1;
      } else {
        observedDomainCountsDictionary[singleDomainNameString] = 1;
      }
    }
  }

  let newlyObservedDomainCountNumber = 0;
  for (const domainKey in observedDomainCountsDictionary) {
    if (observedDomainCountsDictionary[domainKey] === 1) {
      newlyObservedDomainCountNumber = newlyObservedDomainCountNumber + 1;
    }
  }

  // Calculate display parameters based on sync state
  let currentScanStageText = "Idle";
  let scanStepIndexNumber = -1;
  if (isCurrentlySyncing) {
    if (backgroundSyncStatusDictionary.saved < 20) {
      currentScanStageText = "Analyzing headers...";
      scanStepIndexNumber = 0;
    } else if (backgroundSyncStatusDictionary.saved < 80) {
      currentScanStageText = "Checking domain reputation...";
      scanStepIndexNumber = 1;
    } else {
      currentScanStageText = "Evaluating AI signals...";
      scanStepIndexNumber = 2;
    }
  }
  
  // Custom Keyboard Shortcuts (J to go down, K to go up, Enter to open emails)
  useEffect(() => {
    function handleKeyboardHotkeysEvent(keyboardEvent) {
      // Don't trigger hotkeys if typing in the search box
      if (document.activeElement !== null && (document.activeElement.tagName.toLowerCase() === "input" || document.activeElement.tagName.toLowerCase() === "textarea")) {
        return; 
      }
      
      if (currentlyVisibleEmailsList.length === 0) {
        return;
      }

      let currentSelectionIndexNumber = 0;
      if (selectedEmailRecord !== null) {
        currentSelectionIndexNumber = currentlyVisibleEmailsList.findIndex((emailRecordItem) => emailRecordItem.id === selectedEmailRecord.id);
        if (currentSelectionIndexNumber === -1) {
            currentSelectionIndexNumber = 0;
        }
      }

      if (keyboardEvent.key === "j") {
        let nextIndexNumber = currentSelectionIndexNumber + 1;
        if (nextIndexNumber >= currentlyVisibleEmailsList.length) {
          nextIndexNumber = currentlyVisibleEmailsList.length - 1;
        }
        setSelectedEmailRecord(currentlyVisibleEmailsList[nextIndexNumber]);
      } else if (keyboardEvent.key === "k") {
        let previousIndexNumber = currentSelectionIndexNumber - 1;
        if (previousIndexNumber < 0) {
          previousIndexNumber = 0;
        }
        setSelectedEmailRecord(currentlyVisibleEmailsList[previousIndexNumber]);
      } else if (keyboardEvent.key === "Enter" && selectedEmailRecord !== null) {
        setIsDetailsPanelOpen(true);
      }
    }

    document.addEventListener("keydown", handleKeyboardHotkeysEvent);
    return () => document.removeEventListener("keydown", handleKeyboardHotkeysEvent);
  }, [currentlyVisibleEmailsList, selectedEmailRecord]);

  // --- Backend communication functions ---

  async function fetchEmailsFromBackendFunction({ resetList = false, tokenString = sessionTokenString } = {}) {
    if (!tokenString) {
        return;
    }
    
    let nextOffsetAmountNumber = paginationInfoDictionary.offset + paginationInfoDictionary.limit;
    if (resetList === true) {
      nextOffsetAmountNumber = 0;
    }
    
    setIsLoadingEmails(true);
    setGeneralErrorMessage("");
    
    try {
      let labelFilterUrlParameter = "";
      if (currentFilterKeyText !== "all") {
        labelFilterUrlParameter = `&label=${currentFilterKeyText}`;
      }
      
      const responseFromBackend = await fetch(`${API_BASE_URL}/emails?limit=${NUMBER_OF_EMAILS_PER_PAGE}&offset=${nextOffsetAmountNumber}${labelFilterUrlParameter}`, {
        headers: { Authorization: `Bearer ${tokenString}` },
      });
      
      if (!responseFromBackend.ok) {
        throw new Error("Failed to load emails from the server.");
      }
      
      const responseDataDictionary = await responseFromBackend.json();
      const loadedEmailRowsList = responseDataDictionary.items || [];
      
      if (resetList === true) {
        setAllEmailsList(loadedEmailRowsList);
        
        if (loadedEmailRowsList.length > 0) {
            setSelectedEmailRecord(loadedEmailRowsList[0]);
        } else {
            setSelectedEmailRecord(null);
        }
        
      } else {
        // Add new emails to the end of the list
        setAllEmailsList([...allEmailsList, ...loadedEmailRowsList]);
      }
      
      setPaginationInfoDictionary({ 
        total: responseDataDictionary.total || loadedEmailRowsList.length, 
        offset: nextOffsetAmountNumber, 
        limit: responseDataDictionary.limit || NUMBER_OF_EMAILS_PER_PAGE 
      });
      
    } catch (networkOrSystemError) {
      setGeneralErrorMessage(networkOrSystemError.message);
    } finally {
      setIsLoadingEmails(false);
    }
  }

  function handleMailListScrollEvent(scrollEvent) {
    const scrollableElementHTML = scrollEvent.currentTarget;
    const distanceToBottomNumber = scrollableElementHTML.scrollHeight - scrollableElementHTML.scrollTop - scrollableElementHTML.clientHeight;
    
    const isNearBottomBoolean = distanceToBottomNumber < 80;
    
    if (isNearBottomBoolean === false || isLoadingEmails === true) {
      return;
    }
    
    // Stop trying to load more if we've already loaded everything
    if (allEmailsList.length >= paginationInfoDictionary.total) {
      return;
    }
    
    fetchEmailsFromBackendFunction();
  }

  async function fetchEmailStatisticsFromBackendFunction(tokenString = sessionTokenString) {
    if (!tokenString) {
        return;
    }
    
    try {
      const responseFromBackend = await fetch(`${API_BASE_URL}/emails/stats`, {
        headers: { Authorization: `Bearer ${tokenString}` },
      });
      
      if (!responseFromBackend.ok) {
        return;
      }
      
      const responseDataDictionary = await responseFromBackend.json();
      
      setEmailStatisticsDictionary({
        total: responseDataDictionary.total || 0,
        safe: responseDataDictionary.safe || 0,
        suspicious: responseDataDictionary.suspicious || 0,
        phishing: responseDataDictionary.phishing || 0,
      });
    } catch (networkError) {
      // Ignore network errors so the app doesn't break if one request fails momentarily
    }
  }

  async function fetchUserProfileFromBackendFunction(tokenString = sessionTokenString) {
    if (!tokenString) {
        return;
    }
        
    try {
      const responseFromBackend = await fetch(`${API_BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${tokenString}` },
      });
      
      if (!responseFromBackend.ok) {
        return;
      }
      
      const responseDataDictionary = await responseFromBackend.json();
      setUserProfileDictionary({ 
          email: responseDataDictionary.email || "", 
          name: responseDataDictionary.name || "" 
      });
    } catch (networkError) {
      // Ignore network errors gently
    }
  }

  async function handleGoogleSignInButtonClick() {
    try {
      setAuthenticationErrorMessage("");
      const redirectTargetUrlString = window.location.origin;
      const responseFromBackend = await fetch(`${API_BASE_URL}/auth/google/login?redirect_to=${encodeURIComponent(redirectTargetUrlString)}`);
      
      if (!responseFromBackend.ok) {
        throw new Error("Failed to start Google sign-in process.");
      }
      
      const responseDataDictionary = await responseFromBackend.json();
      if (!responseDataDictionary || !responseDataDictionary.auth_url) {
        throw new Error("Google auth URL is missing from backend response.");
      }
      
      // Navigate to Google Login page directly
      window.location.href = responseDataDictionary.auth_url;
      
    } catch (authenticationError) {
      setAuthenticationErrorMessage(authenticationError.message || "Google sign-in failed unexpectedly.");
    }
  }

  async function startEmailSyncProcessFunction() {
    if (!sessionTokenString) {
        return;
    }
    
    setIsCurrentlySyncing(true);
    setBackgroundSyncStatusDictionary({ status: "running", processed: 0, saved: 0, error: null });
    setGeneralErrorMessage("");
    
    try {
      const responseFromBackend = await fetch(`${API_BASE_URL}/emails/sync?max_results=500&page_size=250`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionTokenString}` },
      });
      
      if (!responseFromBackend.ok) {
        throw new Error("Sync failed to start correctly.");
      }
      
      await fetchEmailsFromBackendFunction({ resetList: true });
      await fetchEmailStatisticsFromBackendFunction();
      
    } catch (syncError) {
      setGeneralErrorMessage(syncError.message);
      setIsCurrentlySyncing(false);
    }
  }

  async function handleUserLogoutButtonClick() {
    if (!sessionTokenString) {
        return;
    }
    
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionTokenString}` },
    });
    
    localStorage.removeItem("session");
    setSessionTokenString("");
    setAllEmailsList([]);
    setSelectedEmailRecord(null);
    setIsCurrentlySyncing(false);
    setBackgroundSyncStatusDictionary({ status: "idle", processed: 0, saved: 0, error: null });
  }

  async function quickRelabelEmailToProvideFeedbackFunction(emailIdNumber, newLabelTextString) {
    if (!sessionTokenString || !emailIdNumber) {
        return;
    }
        
    try {
      const responseFromBackend = await fetch(`${API_BASE_URL}/emails/${emailIdNumber}/label?label=${newLabelTextString}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${sessionTokenString}` },
      });
      
      if (!responseFromBackend.ok) {
        return;
      }
      
      // Update local state without waiting for a full fetch to appear fast
      setAllEmailsList((previousEmailsList) => {
        return previousEmailsList.map((individualEmailRecord) => {
          if (individualEmailRecord.id === emailIdNumber) {
            return { ...individualEmailRecord, label: newLabelTextString };
          }
          return individualEmailRecord;
        });
      });
      
      if (selectedEmailRecord && selectedEmailRecord.id === emailIdNumber) {
        setSelectedEmailRecord({ ...selectedEmailRecord, label: newLabelTextString });
      }
      
      fetchEmailStatisticsFromBackendFunction();
      
    } catch (relabelError) {
      // Keep UI quick and ignore temporary API issues
    }
  }

  function blockSenderDomainImmediatelyFunction(senderAddressString) {
    const extractedDomainNameString = extractDomainName(senderAddressString);
    if (!extractedDomainNameString) {
        return;
    }
    
    setBlockedDomainsList((previousList) => {
      if (previousList.includes(extractedDomainNameString)) {
        return previousList;
      }
      return [...previousList, extractedDomainNameString];
    });
  }

  function blockSenderAddressImmediatelyFunction(senderAddressString) {
    if (!senderAddressString) {
        return;
    }
    
    const normalizedSenderTextString = senderAddressString.toLowerCase().trim();
    if (!normalizedSenderTextString) {
        return;
    }
    
    setBlockedSendersList((previousList) => {
      if (previousList.includes(normalizedSenderTextString)) {
        return previousList;
      }
      return [...previousList, normalizedSenderTextString];
    });
  }

  // --- Rendering Functions ---

  // Show "Landing Screen" if not logged in
  if (!sessionTokenString) {
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
              
              {authenticationErrorMessage && <div className="error-box">{authenticationErrorMessage}</div>}
              
              <div className="auth-cta-row">
                <button className="btn btn-primary auth-cta" onClick={handleGoogleSignInButtonClick}>
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

  // Calculate some state classes for visual layout effects
  let appShellClassesString = "app-shell premium-grain mode-workspace";
  if (displayDensityString === "compact") {
      appShellClassesString = appShellClassesString + " density-compact";
  } else {
      appShellClassesString = appShellClassesString + " density-comfortable";
  }
  
  if (isCurrentlySyncing) {
      appShellClassesString = appShellClassesString + " is-syncing";
  }

  let appFrameClassesString = "app-frame";
  if (isSearchBarFocused) {
      appFrameClassesString = appFrameClassesString + " search-focused";
  }
  
  let workspaceClassesString = "workspace motion-layout";
  if (isDetailsPanelOpen) {
      workspaceClassesString = workspaceClassesString + " details-open";
  }

  // RENDER MAIN APPLICATION 
  return (
    <div className={appShellClassesString}>
      <div className={appFrameClassesString}>
        
        {/* --- TOP NAVIGATION BAR --- */}
        <header className="topbar">
          <div className="brand-cell">
            <button
              className={isNavigationMenuOpen ? "btn btn-ghost burger brand-burger is-open" : "btn btn-ghost burger brand-burger"}
              onClick={() => setIsNavigationMenuOpen(!isNavigationMenuOpen)}
              aria-label="Toggle menu"
            >
              {"\u2630"}
            </button>
            <div>
              <h2 className={`brand-title ${isCurrentlySyncing ? "ai-active" : ""}`}>InkTrace</h2>
              <p className="brand-subtitle">Mail Risk Intelligence</p>
            </div>
          </div>
          
          <div className="search-cell">
            <input
              placeholder="Search sender, subject, snippet, finding..."
              value={searchQueryText}
              onChange={(e) => setSearchQueryText(e.target.value)}
              onFocus={() => setIsSearchBarFocused(true)}
              onBlur={() => setIsSearchBarFocused(false)}
            />
          </div>
          
          <div className="action-cell">
            <button
              className="btn btn-primary scan-btn"
              onClick={startEmailSyncProcessFunction}
              disabled={isCurrentlySyncing}
            >
              {isCurrentlySyncing && <span className="live-dot" aria-hidden="true" />}
              {isCurrentlySyncing ? `Scanning ${backgroundSyncStatusDictionary.saved}` : "Scan Environment"}
            </button>
            
            <button className="btn btn-ghost density-toggle" onClick={() => setIsAnalyticsPopupOpen(!isAnalyticsPopupOpen)}>
              View Analytics
            </button>
            
            <div className="view-pop-wrap" ref={viewOptionsMenuHTMLReference}>
              <button
                className="btn btn-ghost density-toggle view-trigger"
                title="View options"
                onClick={() => setIsViewOptionsMenuOpen(!isViewOptionsMenuOpen)}
                aria-label="Open view options"
              >
                {"\u2637"}
              </button>
              
              <div className={isViewOptionsMenuOpen ? "view-pop open" : "view-pop"}>
                <button
                  className={displayDensityString === "comfortable" ? "view-option active" : "view-option"}
                  onClick={() => {
                    setDisplayDensityString("comfortable");
                    setIsViewOptionsMenuOpen(false);
                  }}
                >
                  Comfortable
                </button>
                <button
                  className={displayDensityString === "compact" ? "view-option active" : "view-option"}
                  onClick={() => {
                    setDisplayDensityString("compact");
                    setIsViewOptionsMenuOpen(false);
                  }}
                >
                  Compact
                </button>
                <button className="view-option" disabled>
                  Raw Data (soon)
                </button>
              </div>
            </div>
            
            <div className="profile-chip" ref={profileMenuHTMLReference}>
              <button
                className="avatar"
                onClick={() => setIsUserProfileMenuOpen(!isUserProfileMenuOpen)}
                aria-label="Open profile"
              >
                {(userProfileDictionary.name || "U")
                  .split(" ")
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join("")
                  .toUpperCase()}
              </button>
              
              {isUserProfileMenuOpen && (
                <div className="profile-pop">
                  <p className="profile-name">{userProfileDictionary.name || "Your Profile"}</p>
                  <span className="profile-meta">{userProfileDictionary.email || "Gmail Connected"}</span>
                  <button className="btn btn-ghost profile-logout" onClick={handleUserLogoutButtonClick}>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {isAnalyticsPopupOpen && (
          <div className="analytics-pop">
            <p>Threat Level: {calculateOverallRiskLevel(emailStatisticsDictionary).label}</p>
            <p>Total: {emailStatisticsDictionary.total}</p>
            <p>Safe: {emailStatisticsDictionary.safe}</p>
            <p>Suspicious: {emailStatisticsDictionary.suspicious}</p>
            <p>Phishing: {emailStatisticsDictionary.phishing}</p>
            <p>Blocked Domains: {blockedDomainsList.length}</p>
          </div>
        )}

        {generalErrorMessage && (
          <div className="error-box">{generalErrorMessage}</div>
        )}
        
        {backgroundSyncStatusDictionary.status === "failed" && backgroundSyncStatusDictionary.error && (
          <div className="error-box">{backgroundSyncStatusDictionary.error}</div>
        )}

        {/* --- MAIN WORKSPACE AREA --- */}
        <main className={workspaceClassesString}>
          
          {/* --- LEFT SIDEBAR PANEL --- */}
          {isNavigationMenuOpen && (
            <aside className="left-panel panel-surface card accelerated-panel ink-border panel-open butter-surface">
              <div className="panel-title-wrap">
                <h3>Mailbox</h3>
                <span className="total-pill">{emailStatisticsDictionary.total}</span>
              </div>
              
              <div className="filter-stack">
                {FILTER_OPTIONS.map((filterOptionItem) => (
                  <button
                    key={filterOptionItem.key}
                    className={
                      currentFilterKeyText === filterOptionItem.key
                        ? `filter-btn active active-${filterOptionItem.key}`
                        : "filter-btn"
                    }
                    onClick={() => setCurrentFilterKeyText(filterOptionItem.key)}
                  >
                    <span>{filterOptionItem.label}</span>
                    <strong>{emailStatisticsDictionary[filterOptionItem.statKey]}</strong>
                  </button>
                ))}
              </div>
              
              <div className="quick-stats">
                <div>
                  <small>Loaded</small>
                  <strong>{currentlyVisibleEmailsList.length}</strong>
                </div>
                <div>
                  <small>Status</small>
                  <strong>{isCurrentlySyncing ? "Running" : "Idle"}</strong>
                </div>
              </div>
              
              <div className="threat-overview">
                <strong>Today's Risk</strong>
                <p>High Risk: {highRiskEmailCountNumber}</p>
                <p>New Domains: {newlyObservedDomainCountNumber}</p>
                <p>Lookalike Attacks: {lookalikeAttackCountNumber}</p>
              </div>
              
              <div className="engine-status">
                <strong>Status</strong>
                <p>AI Engine: Active</p>
                <p>{calculateTimeAgoText(lastCompletedScanTimeString)}</p>
              </div>
            </aside>
          )}

          {/* --- CENTER EMAIL LIST PANEL --- */}
          <section className="center-panel panel-surface card accelerated-panel ink-border panel-open">
            <div className="panel-head">
              <h4>Feed</h4>
              <p>
                {currentlyVisibleEmailsList.length} shown / {paginationInfoDictionary.total} filtered
              </p>
            </div>
            
            <div className="mail-columns">
              <span>Source</span>
              <span>Context</span>
              <span className="status-heading">Actions</span>
            </div>
            
            {isCurrentlySyncing && (
              <div className="sync-banner">
                <span className="sync-system">
                  <span className="system-dot" aria-hidden="true" />
                  System Activity
                </span>
                <span>{backgroundSyncStatusDictionary.saved} stored</span>
                <div className="scan-steps" aria-label="Scan stages">
                  <span className={scanStepIndexNumber >= 0 ? "active" : ""}>{currentScanStageText === "Analyzing headers..." ? "Analyzing headers..." : "Done"}</span>
                  <span className={scanStepIndexNumber >= 1 ? "active" : ""}>{currentScanStageText === "Evaluating AI signals..." ? "Done" : (scanStepIndexNumber === 1 ? currentScanStageText : "Pending")}</span>
                  <span className={scanStepIndexNumber >= 2 ? "active" : ""}>Evaluating AI signals</span>
                </div>
              </div>
            )}
            
            <div className="mail-list" onScroll={handleMailListScrollEvent}>
              {currentlyVisibleEmailsList.map((emailRecordItem) => {
                const senderDomainString = extractDomainName(emailRecordItem.sender);
                const domainTrustInformationObject = getDomainTrustStatus(senderDomainString, observedDomainCountsDictionary);
                const inferredRiskSignalsObject = inferRiskSignals(emailRecordItem, blockedDomainsList, blockedSendersList);
                
                let rowClassesString = "mail-row threat-row ";
                if (selectedEmailRecord && selectedEmailRecord.id === emailRecordItem.id) {
                  rowClassesString = rowClassesString + "selected ";
                }
                rowClassesString = rowClassesString + `mail-row-${emailRecordItem.label || "safe"}`;
                
                return (
                  <div key={emailRecordItem.id} className={rowClassesString}>
                    
                    <div className="row-left">
                      <div className="row-verdict">
                        <span className={getLabelBadgeCSSClass(emailRecordItem.label)} data-tip={getHighestRiskFactor(emailRecordItem.reason)}>
                          {emailRecordItem.label}
                        </span>
                      </div>
                      
                      <div className="signal-icons">
                        {inferredRiskSignalsObject.isSpoofing && <span className="sig sig-primary" title="Domain spoof indicator">{"\u26A0"}</span>}
                        {inferredRiskSignalsObject.isBlocked && <span className="sig sig-primary" title="Blocked sender domain">{"\u26D4"}</span>}
                        {inferredRiskSignalsObject.containsLink && <span className="sig sig-secondary" title="External link indicator">{"\uD83D\uDD17"}</span>}
                        {inferredRiskSignalsObject.hasAttachment && <span className="sig sig-secondary" title="Attachment indicator">{"\uD83D\uDCCE"}</span>}
                        {domainTrustInformationObject.label === "NEW DOMAIN" && <span className="sig sig-secondary" title="New sender domain">{"\uD83C\uDF10"}</span>}
                      </div>
                      
                      <p className="row-sender">
                        {emailRecordItem.sender || "Unknown sender"}
                      </p>
                      <p className="domain-context">
                        {senderDomainString || "unknown domain"} <span className={`domain-badge ${domainTrustInformationObject.cssClass}`}>{domainTrustInformationObject.label}</span>
                      </p>
                    </div>
                    
                    <div className="mail-main">
                      <p className="subject">{emailRecordItem.subject || "(No Subject)"}</p>
                      <p className="snippet">{highlightImportantWords(emailRecordItem.snippet)}</p>
                      <p className="hover-intel">{getFirstReasonLine(emailRecordItem.reason)}</p>
                      <div className="row-risk">
                        <div className="row-risk-head">
                          <small className="ai-confidence-label">
                            AI Confidence {isCurrentlySyncing && <span className="ai-pulse-dot" aria-hidden="true" />}
                          </small>
                        </div>
                        <div className="row-risk-track">
                          <div
                            className={`${getLabelBadgeCSSClass(emailRecordItem.label).replace("chip ", "")} confidence-fill-row`}
                            style={{ "--confidence": `${Math.max(0, Math.min(100, emailRecordItem.confidence || 0))}%` }}
                          />
                          <small className="risk-percent">{emailRecordItem.confidence || 0}%</small>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mail-meta">
                      <small>{formatDate(emailRecordItem.scanned_at)}</small>
                      <div className="triage-inline">
                        <button
                          className="mini-action triage-btn triage-inspect"
                          onClick={() => {
                            setSelectedEmailRecord(emailRecordItem);
                            setIsDetailsPanelOpen(true);
                          }}
                        >
                          Inspect
                        </button>
                        {isHighRiskLabel(emailRecordItem.label) && (
                          <button className="mini-action triage-btn triage-quarantine" onClick={() => blockSenderDomainImmediatelyFunction(emailRecordItem.sender)}>
                            Quarantine
                          </button>
                        )}
                        <button className="mini-action triage-btn triage-dismiss" onClick={() => quickRelabelEmailToProvideFeedbackFunction(emailRecordItem.id, "safe")}>
                          Dismiss
                        </button>
                      </div>
                      
                      <div className="row-actions-wrap">
                        <button
                          className="row-menu-trigger"
                          onClick={() => setOpenActionMenuEmailIdNumber(openActionMenuEmailIdNumber === emailRecordItem.id ? null : emailRecordItem.id)}
                          aria-label="More actions"
                        >
                          ...
                        </button>
                        <div className={openActionMenuEmailIdNumber === emailRecordItem.id ? "row-actions open" : "row-actions"}>
                          {isHighRiskLabel(emailRecordItem.label) && (
                            <button className="mini-action action-block" onClick={() => blockSenderDomainImmediatelyFunction(emailRecordItem.sender)}>
                              Block Domain
                            </button>
                          )}
                          <button className="mini-action" onClick={() => quickRelabelEmailToProvideFeedbackFunction(emailRecordItem.id, "safe")}>
                            Mark Safe
                          </button>
                          <button className="mini-action" onClick={() => quickRelabelEmailToProvideFeedbackFunction(emailRecordItem.id, "suspicious")}>
                            Mark Suspicious
                          </button>
                        </div>
                      </div>
                    </div>
                    
                  </div>
                );
              })}
              
              {currentlyVisibleEmailsList.length === 0 && <p className="empty">No emails available in this view.</p>}
              {isLoadingEmails && allEmailsList.length > 0 && <p className="empty">Loading more...</p>}
            </div>
          </section>

          {/* --- RIGHT DETAILS PANEL --- */}
          {isDetailsPanelOpen && (
            <section className={`right-panel panel-surface card open squeeze-panel accelerated-panel ink-border panel-open ink-border-active butter-surface ${getPanelGlowCSSClass(selectedEmailRecord?.label)}`}>
              <div className="analysis-shell">
                <div className="panel-head">
                  <h3>Threat Analysis</h3>
                  <button className="close-btn" onClick={() => setIsDetailsPanelOpen(false)} aria-label="Close details">
                    {"\u00D7"}
                  </button>
                </div>
                
                {!selectedEmailRecord && <p className="empty">Select a message to inspect complete findings.</p>}
                
                {selectedEmailRecord && (
                  <div className="analysis">
                    <h4>{selectedEmailRecord.subject}</h4>
                    
                    <div className="investigation-section">
                      <strong>Threat Summary</strong>
                      <p className="meta-line">
                        <strong>From:</strong> {selectedEmailRecord.sender}
                      </p>
                      <p className="meta-line">
                        <strong>Verdict:</strong> <span className={getLabelBadgeCSSClass(selectedEmailRecord.label)}>{selectedEmailRecord.label}</span>
                      </p>
                      <p className="meta-line">
                        <strong>Confidence:</strong> {selectedEmailRecord.confidence}%
                      </p>
                      <div className="confidence-bar">
                        <div
                          className={`confidence-fill confidence-${selectedEmailRecord.label || "safe"}`}
                          style={{ width: `${selectedEmailRecord.confidence || 0}%` }}
                        />
                      </div>
                    </div>
                    
                    <div className="investigation-section">
                      <strong>Risk Signals</strong>
                      <div className="signal-stack">
                        {Object.values(groupFindingsByCategory(selectedEmailRecord.reason))
                          .flat()
                          .slice(0, 4)
                          .map((lineText, arrayIndexNumber) => (
                            <p key={`risk-${arrayIndexNumber}`}>{lineText}</p>
                          ))}
                      </div>
                    </div>
                    
                    <div className="threat-actions">
                      {isHighRiskLabel(selectedEmailRecord.label) && (
                        <>
                          <span className="containment-label">Contain Threat</span>
                          <button className="mini-action action-block" onClick={() => blockSenderDomainImmediatelyFunction(selectedEmailRecord.sender)}>
                            Block Domain
                          </button>
                          <button className="mini-action action-block" onClick={() => blockSenderAddressImmediatelyFunction(selectedEmailRecord.sender)}>
                            Block Sender
                          </button>
                        </>
                      )}
                      <button className="mini-action action-safe" onClick={() => quickRelabelEmailToProvideFeedbackFunction(selectedEmailRecord.id, "safe")}>
                        Mark Safe
                      </button>
                      <button className="mini-action action-suspicious" onClick={() => quickRelabelEmailToProvideFeedbackFunction(selectedEmailRecord.id, "suspicious")}>
                        Mark Suspicious
                      </button>
                      <button className="mini-action danger action-danger" onClick={() => quickRelabelEmailToProvideFeedbackFunction(selectedEmailRecord.id, "phishing")}>
                        Report Phishing
                      </button>
                      <button className="mini-action action-ignore" onClick={() => setIsDetailsPanelOpen(false)}>
                        Ignore
                      </button>
                    </div>
                    
                    <div className="investigation-section">
                      <strong>AI Reasoning</strong>
                      <div className="findings-card grouped">
                        {Object.entries(groupFindingsByCategory(selectedEmailRecord.reason)).map(([categoryNameString, findingLinesArray]) =>
                          findingLinesArray.length > 0 ? (
                            <div key={categoryNameString}>
                              <strong className="finding-group">{categoryNameString}</strong>
                              {findingLinesArray.map((lineTextString, indexNumber) => (
                                <p key={`${selectedEmailRecord.id}-${categoryNameString}-${indexNumber}`}>{lineTextString}</p>
                              ))}
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                    
                    <div className="investigation-section">
                      <strong>Technical Indicators</strong>
                      <div className="signal-stack technical-indicators">
                        <p>Sender Domain: {extractDomainName(selectedEmailRecord.sender) || "Unknown"}</p>
                        <p>SPF Result: Unknown (MVP)</p>
                        <p>Reply-To Mismatch: Not evaluated (MVP)</p>
                      </div>
                    </div>
                    
                    <article>
                      {selectedEmailRecord.body_text || selectedEmailRecord.snippet}
                    </article>
                  </div>
                )}
              </div>
            </section>
          )}
          
        </main>
      </div>
    </div>
  );
}
