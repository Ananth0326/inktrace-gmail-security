import React from "react";

const TRUSTED_DOMAINS = ["linkedin.com", "google.com", "microsoft.com", "github.com", "amazon.com"];
const HIGHLIGHT_WORDS = ["urgent", "verify", "password", "asap", "confirm", "otp", "invoice"];

export function getLabelBadgeCSSClass(label) {
  if (label === "phishing") {
    return "chip chip-danger";
  }
  if (label === "suspicious") {
    return "chip chip-warn";
  }
  return "chip chip-safe";
}

export function getPanelGlowCSSClass(label) {
  if (label === "phishing") {
    return "glow-danger";
  }
  if (label === "suspicious") {
    return "glow-suspicious";
  }
  if (label === "safe") {
    return "glow-safe";
  }
  return "";
}

export function formatDate(dateString) {
  if (!dateString) {
    return "";
  }
  const dateObject = new Date(dateString);
  return dateObject.toLocaleDateString();
}

export function extractDomainName(senderEmailString) {
  if (!senderEmailString) {
    return "";
  }
  const regularExpressionMatch = senderEmailString.match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  if (regularExpressionMatch) {
    return regularExpressionMatch[1].toLowerCase();
  }
  return "";
}

export function inferRiskSignals(emailObject, blockedDomainsList = [], blockedSendersList = []) {
  const reasonText = (emailObject.reason || "").toLowerCase();
  const fullText = `${emailObject.subject || ""} ${emailObject.snippet || ""}`.toLowerCase();
  const senderEmail = (emailObject.sender || "").toLowerCase();
  const domainName = extractDomainName(emailObject.sender);
  
  return {
    isSpoofing: reasonText.includes("brand") || reasonText.includes("lookalike") || reasonText.includes("domain"),
    containsLink: reasonText.includes("url") || reasonText.includes("link") || fullText.includes("http"),
    hasAttachment: fullText.includes("attachment") || fullText.includes(".pdf") || fullText.includes("invoice"),
    isBlocked: blockedDomainsList.includes(domainName) || blockedSendersList.includes(senderEmail),
  };
}

export function isHighRiskLabel(label) {
  return label === "suspicious" || label === "phishing";
}

export function getFirstReasonLine(reasonText) {
  if (!reasonText) {
    return "";
  }
  const allLines = reasonText.split(" | ");
  
  // A simple way to clean up the lines
  const cleanedLines = [];
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (line !== "") {
      cleanedLines.push(line);
    }
  }
  
  // Return the first two lines separated by a pipe
  const firstTwoLines = cleanedLines.slice(0, 2);
  return firstTwoLines.join(" | ");
}

export function getHighestRiskFactor(reasonText) {
  if (!reasonText) {
    return "No high-risk factor detected";
  }
  const allLines = reasonText.split(" | ");
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (line !== "") {
      return line;
    }
  }
  return "No high-risk factor detected";
}

export function getDomainTrustStatus(domainName, observedDomainCounts) {
  if (!domainName) {
    return { label: "UNKNOWN", cssClass: "domain-unknown" };
  }
  
  // Check if it's one of our predefined trusted domains
  let isTrusted = false;
  for (let i = 0; i < TRUSTED_DOMAINS.length; i++) {
    const trustedDomain = TRUSTED_DOMAINS[i];
    if (domainName === trustedDomain || domainName.endsWith(`.${trustedDomain}`)) {
      isTrusted = true;
      break;
    }
  }
  
  if (isTrusted) {
    return { label: "TRUSTED", cssClass: "domain-trusted" };
  }
  
  const timesObserved = observedDomainCounts[domainName] || 0;
  if (timesObserved <= 1) {
    return { label: "NEW DOMAIN", cssClass: "domain-new" };
  }
  
  return { label: "OBSERVED", cssClass: "domain-observed" };
}

export function highlightImportantWords(snippetText) {
  if (!snippetText) {
    return "";
  }
  
  const joinedWordsToHighlight = HIGHLIGHT_WORDS.join("|");
  // This regular expression finds any of our highlight words as distinct whole words
  const searchRegex = new RegExp(`\\b(${joinedWordsToHighlight})\\b`, "gi");
  
  const outputElements = [];
  let lastMatchedIndex = 0;
  
  let currentMatch = searchRegex.exec(snippetText);
  while (currentMatch !== null) {
    const matchStartIndex = currentMatch.index;
    const matchEndIndex = matchStartIndex + currentMatch[0].length;
    
    // Add text before the highlighted word
    if (matchStartIndex > lastMatchedIndex) {
      const normalText = snippetText.slice(lastMatchedIndex, matchStartIndex);
      outputElements.push(normalText);
    }
    
    // Add the highlighted word wrapped in a mark tag so it turns yellow
    const highlightedWord = snippetText.slice(matchStartIndex, matchEndIndex);
    outputElements.push(<mark key={`${matchStartIndex}-${matchEndIndex}`}>{highlightedWord}</mark>);
    
    lastMatchedIndex = matchEndIndex;
    currentMatch = searchRegex.exec(snippetText);
  }
  
  // Add any remaining text
  if (lastMatchedIndex < snippetText.length) {
    const remainingText = snippetText.slice(lastMatchedIndex);
    outputElements.push(remainingText);
  }
  
  return outputElements;
}

export function calculateOverallRiskLevel(statisticsObject) {
  const totalEmailsCount = statisticsObject.total || 0;
  if (totalEmailsCount === 0) {
    return { label: "Low", cssClass: "risk-low" };
  }
  
  const combinedRiskCount = statisticsObject.phishing + statisticsObject.suspicious;
  const riskRatio = combinedRiskCount / totalEmailsCount;
  
  if (riskRatio >= 0.45) {
    return { label: "High", cssClass: "risk-high" };
  }
  if (riskRatio >= 0.2) {
    return { label: "Medium", cssClass: "risk-medium" };
  }
  
  return { label: "Low", cssClass: "risk-low" };
}

export function calculateTimeAgoText(isoTimeString) {
  if (!isoTimeString) {
    return "No completed scan yet";
  }
  
  const pastTimeInMilliseconds = new Date(isoTimeString).getTime();
  const currentTimeInMilliseconds = Date.now();
  const differenceInSeconds = Math.max(0, Math.floor((currentTimeInMilliseconds - pastTimeInMilliseconds) / 1000));
  
  if (differenceInSeconds < 60) {
    return `Last scan: ${differenceInSeconds}s ago`;
  }
  
  const differenceInMinutes = Math.floor(differenceInSeconds / 60);
  if (differenceInMinutes < 60) {
    return `Last scan: ${differenceInMinutes}m ago`;
  }
  
  const differenceInHours = Math.floor(differenceInMinutes / 60);
  return `Last scan: ${differenceInHours}h ago`;
}

export function groupFindingsByCategory(reasonText) {
  if (!reasonText) {
    reasonText = "No details";
  }
  
  const allLines = reasonText.split(" | ");
  
  const groupedFindingsObject = {
    sender: [],
    content: [],
    links: [],
    urgency: [],
    other: [],
  };

  for (let i = 0; i < allLines.length; i++) {
    const currentLine = allLines[i].trim();
    if (currentLine === "") {
      continue;
    }
    
    const lowercaseLine = currentLine.toLowerCase();
    
    // Simple rules to sort the findings into their respectful buckets
    if (lowercaseLine.includes("sender") || lowercaseLine.includes("domain") || lowercaseLine.includes("brand")) {
      groupedFindingsObject.sender.push(currentLine);
    } else if (lowercaseLine.includes("url") || lowercaseLine.includes("link") || lowercaseLine.includes("ip")) {
      groupedFindingsObject.links.push(currentLine);
    } else if (lowercaseLine.includes("urgent") || lowercaseLine.includes("otp") || lowercaseLine.includes("password")) {
      groupedFindingsObject.urgency.push(currentLine);
    } else if (lowercaseLine.includes("lookalike") || lowercaseLine.includes("content") || lowercaseLine.includes("text")) {
      groupedFindingsObject.content.push(currentLine);
    } else {
      groupedFindingsObject.other.push(currentLine);
    }
  }

  return groupedFindingsObject;
}
