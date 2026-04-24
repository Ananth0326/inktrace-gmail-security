export const parseReason = (reasonText) => {
  if (!reasonText) return [];
  return reasonText.split(/[|\n]+/).map(s => s.trim()).filter(s => s.length > 0);
};

export const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

export const extractDomainName = (emailAddress) => {
  if (!emailAddress || !emailAddress.includes('@')) return emailAddress;
  return emailAddress.split('@')[1];
};

export const getLabelBadgeCSSClass = (label) => {
  if (!label) return '';
  return label.toLowerCase();
};

export const calculateOverallRiskLevel = (confidence, label) => {
  if (label === 'phishing') return 'High';
  if (label === 'suspicious' && confidence > 75) return 'Medium-High';
  if (label === 'suspicious') return 'Medium';
  return 'Low';
};

export const groupFindingsByCategory = (findingsArray) => {
  return {
    threats: findingsArray.filter(f => f.toLowerCase().includes('phishing') || f.toLowerCase().includes('malicious')),
    warnings: findingsArray.filter(f => !f.toLowerCase().includes('phishing') && !f.toLowerCase().includes('malicious'))
  };
};

export const getUserInitial = (userName) => {
  return userName ? userName.charAt(0).toUpperCase() : 'A';
};
