import { getStorage, setStorage } from "../api/storageApi";
import { FocusSettings } from "../types/index";
import { getParkedLinks, releaseParkedLinks, clearParkedLinks } from "../api/parkedLinksApi";
import { getFeedbackHistory, clearFeedbackHistory, getFeedbackStatistics } from "../api/feedbackApi";

// DOM Elements
const extensionEnabledCheckbox = document.getElementById("extensionEnabledCheckbox") as HTMLInputElement;
const notificationsCheckbox = document.getElementById("notificationsCheckbox") as HTMLInputElement;
const autoGroupCheckbox = document.getElementById("autoGroupCheckbox") as HTMLInputElement;
const switchThresholdInput = document.getElementById("switchThresholdInput") as HTMLInputElement;
const timeWindowInput = document.getElementById("timeWindowInput") as HTMLInputElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const subUrlOverridesList = document.getElementById("subUrlOverridesList") as HTMLDivElement;
const overrideUrlInput = document.getElementById("overrideUrlInput") as HTMLInputElement;
const overrideContextSelect = document.getElementById("overrideContextSelect") as HTMLSelectElement;
const addOverrideBtn = document.getElementById("addOverrideBtn") as HTMLButtonElement;
const contextOverridesList = document.getElementById("contextOverridesList") as HTMLDivElement;

// Parked Links UI Elements
const parkedLinksList = document.getElementById("parkedLinksList") as HTMLDivElement;
const releaseParkedBtn = document.getElementById("releaseParkedBtn") as HTMLButtonElement;
const clearParkedBtn = document.getElementById("clearParkedBtn") as HTMLButtonElement;

// Feedback UI Elements
const feedbackStats = document.getElementById("feedbackStats") as HTMLDivElement;
const feedbackHistory = document.getElementById("feedbackHistory") as HTMLDivElement;
const clearFeedbackBtn = document.getElementById("clearFeedbackBtn") as HTMLButtonElement;

// Default focus settings
const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  enabled: true,
  notificationsEnabled: true,
  switchThreshold: 3,
  timeWindowMinutes: 30
};

// Initialize UI
document.addEventListener("DOMContentLoaded", initializeOptions);

async function initializeOptions() {
  const storage = await getStorage([
    "extensionEnabled", 
    "autoGroupEnabled",
    "focusSettings",
    "subUrlOverrides",
    "parkedLinks",
    "domainContextMap" // Fetch the domain overrides map
  ]);
  
  // Extension enabled/disabled
  extensionEnabledCheckbox.checked = storage.extensionEnabled ?? true;
  
  // Auto-grouping enabled/disabled
  autoGroupCheckbox.checked = storage.autoGroupEnabled ?? false;
  
  // Focus Settings
  const focusSettings = storage.focusSettings || DEFAULT_FOCUS_SETTINGS;
  notificationsCheckbox.checked = focusSettings.notificationsEnabled ?? true;
  switchThresholdInput.value = focusSettings.switchThreshold?.toString() || "3";
  timeWindowInput.value = focusSettings.timeWindowMinutes?.toString() || "30";
  
  // Add event listeners
  saveBtn.addEventListener("click", saveOptions);
  resetBtn.addEventListener("click", resetOptions);
  
  // Load URL overrides (renamed to subUrlOverrides for clarity)
  displaySubUrlOverrides(storage.subUrlOverrides || {});
  addOverrideBtn.addEventListener("click", addNewSubUrlOverride);
  
  // Load domain context overrides
  displayContextOverrides(storage.domainContextMap || {});
  
  // Load parked links
  await displayParkedLinks(storage.parkedLinks || []);
  
  // Setup parked links actions
  if (releaseParkedBtn) {
    releaseParkedBtn.addEventListener("click", handleReleaseParkedLinks);
  }
  
  if (clearParkedBtn) {
    clearParkedBtn.addEventListener("click", handleClearParkedLinks);
  }
  
  // Load feedback history and statistics
  await displayFeedbackStats();
  await displayFeedbackHistory();
  
  // Setup feedback actions
  if (clearFeedbackBtn) {
    clearFeedbackBtn.addEventListener("click", handleClearFeedback);
  }
}

function getDefaultFocusSettings(): FocusSettings {
  return {
    enabled: true,
    notificationsEnabled: true,
    switchThreshold: 3,
    timeWindowMinutes: 30
  };
}

async function saveOptions() {
  const focusSettings: FocusSettings = {
    enabled: true,
    notificationsEnabled: notificationsCheckbox.checked,
    switchThreshold: parseInt(switchThresholdInput.value) || 3,
    timeWindowMinutes: parseInt(timeWindowInput.value) || 30
  };
  
  // Collect Sub-URL Overrides from UI
  const subUrlOverrides: Record<string, string> = {};
  const subUrlOverrideItems = subUrlOverridesList.querySelectorAll(".override-item");
  subUrlOverrideItems.forEach(item => {
    const urlSpan = item.querySelector(".override-url") as HTMLSpanElement;
    const contextSpan = item.querySelector(".override-context") as HTMLSpanElement;
    if (urlSpan && contextSpan) {
      subUrlOverrides[urlSpan.textContent || ""] = contextSpan.textContent || "";
    }
  });
  
  // Collect Domain Context Overrides from UI
  const domainContextMap: Record<string, string> = {};
  const contextOverrideItems = contextOverridesList.querySelectorAll(".override-item");
  contextOverrideItems.forEach(item => {
    const domain = (item as HTMLElement).dataset.domain;
    const contextSpan = item.querySelector(".override-context") as HTMLSpanElement;
    if (domain && contextSpan?.textContent) {
      domainContextMap[domain] = contextSpan.textContent;
    }
  });
  
  // Update storage with new settings
  await setStorage({
    extensionEnabled: extensionEnabledCheckbox.checked,
    autoGroupEnabled: autoGroupCheckbox.checked,
    focusSettings,
    subUrlOverrides,
    domainContextMap // Save the updated domain overrides
  });
  
  // Notify background to update rules based on saved overrides
  await chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
  
  // Show success notification
  showNotification("Options saved!");
}

function showNotification(message: string, duration = 2000) {
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.style.position = "fixed";
  notification.style.bottom = "20px";
  notification.style.right = "20px";
  notification.style.backgroundColor = "#4CAF50";
  notification.style.color = "white";
  notification.style.padding = "10px 20px";
  notification.style.borderRadius = "4px";
  notification.style.zIndex = "1000";
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, duration);
}

async function resetOptions() {
  if (!confirm("Are you sure you want to reset all settings to their defaults? This will remove all your context overrides.")) {
    return;
  }

  // Reset UI to defaults
  extensionEnabledCheckbox.checked = true;
  autoGroupCheckbox.checked = false;
  const defaultSettings = getDefaultFocusSettings();
  notificationsCheckbox.checked = defaultSettings.notificationsEnabled;
  switchThresholdInput.value = defaultSettings.switchThreshold.toString();
  timeWindowInput.value = defaultSettings.timeWindowMinutes.toString();
  
  // Clear URL overrides
  subUrlOverridesList.innerHTML = '';
  displaySubUrlOverrides({});
  
  // Clear Context Overrides
  contextOverridesList.innerHTML = '';
  displayContextOverrides({});
  
  // Save defaults
  await setStorage({
    extensionEnabled: true,
    autoGroupEnabled: false,
    focusSettings: defaultSettings,
    subUrlOverrides: {},
    domainContextMap: {} // Reset domain overrides
  });
  
  // Notify background to update rules based on reset overrides
  await chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
  
  showNotification("Options reset to defaults");
}

// Sub-URL Overrides UI Functions (renamed for clarity)
function displaySubUrlOverrides(overrides: Record<string, string>) {
  subUrlOverridesList.innerHTML = '';
  
  if (Object.keys(overrides).length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-state';
    emptyMsg.textContent = 'No Sub-URL overrides configured yet.';
    subUrlOverridesList.appendChild(emptyMsg);
    return;
  }
  
  Object.entries(overrides).forEach(([url, context]) => {
    addOverrideItem(url, context);
  });
}

function addNewSubUrlOverride() {
  const url = overrideUrlInput.value.trim();
  const context = overrideContextSelect.value;
  
  if (!url) {
    showNotification("Please enter a Sub-URL path (e.g., reddit.com/r/something)", 3000);
    return;
  }
  
  addOverrideItem(url, context);
  overrideUrlInput.value = '';
}

function addOverrideItem(url: string, context: string) {
  const item = document.createElement('div');
  item.className = 'override-item';
  
  const urlSpan = document.createElement('span');
  urlSpan.className = 'override-url';
  urlSpan.textContent = url;
  
  const contextSpan = document.createElement('span');
  contextSpan.className = 'override-context';
  contextSpan.textContent = context;
  
  const deleteButton = document.createElement('button');
  deleteButton.innerHTML = '&times;';
  deleteButton.className = 'link-remove';
  deleteButton.addEventListener('click', () => {
    item.remove();
  });
  
  item.appendChild(urlSpan);
  item.appendChild(contextSpan);
  item.appendChild(deleteButton);
  
  subUrlOverridesList.appendChild(item);
}

// Context Overrides (Domain-Level) UI Functions
function displayContextOverrides(domainMap: Record<string, string>) {
  contextOverridesList.innerHTML = ''; // Clear previous content

  const domains = Object.keys(domainMap);

  if (domains.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-state';
    emptyMsg.textContent = 'No context overrides have been set.';
    contextOverridesList.appendChild(emptyMsg);
    return;
  }

  // Sort domains alphabetically for consistent display
  domains.sort().forEach(domain => {
    const context = domainMap[domain];
    const item = document.createElement('div');
    item.className = 'override-item';
    item.dataset.domain = domain; // Store domain for removal

    const domainSpan = document.createElement('span');
    domainSpan.className = 'override-domain';
    domainSpan.textContent = domain;
    domainSpan.title = domain; // Tooltip for long domains

    const contextSpan = document.createElement('span');
    contextSpan.className = 'override-context';
    contextSpan.textContent = context;

    const removeButton = document.createElement('button');
    removeButton.className = 'override-remove-btn';
    removeButton.innerHTML = '×';
    removeButton.title = `Remove override for ${domain}`;
    removeButton.addEventListener('click', () => {
      item.remove(); // Remove from UI immediately
      // Save will happen when the main Save button is clicked
      showNotification(`Override for ${domain} marked for removal. Save settings to confirm.`, 2500);
      // Check if the list becomes empty
      if (contextOverridesList.querySelectorAll('.override-item').length === 0) {
        displayContextOverrides({}); // Show empty state
      }
    });

    item.appendChild(domainSpan);
    item.appendChild(contextSpan);
    item.appendChild(removeButton);
    contextOverridesList.appendChild(item);
  });
}

// Parked Links UI Functions
async function displayParkedLinks(parkedLinks: Array<{url: string, title?: string, timestamp: number}>) {
  if (!parkedLinksList) return;
  
  parkedLinksList.innerHTML = '';
  
  if (!parkedLinks || parkedLinks.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-state';
    emptyMsg.textContent = 'No links have been parked yet.';
    parkedLinksList.appendChild(emptyMsg);
    return;
  }
  
  parkedLinks.forEach(link => {
    const linkItem = document.createElement('div');
    linkItem.className = 'parked-link-item';
    
    const linkInfo = document.createElement('div');
    
    const title = document.createElement('div');
    title.className = 'link-title';
    title.textContent = link.title || 'Untitled';
    
    const url = document.createElement('div');
    url.className = 'link-url';
    url.textContent = link.url;
    
    linkInfo.appendChild(title);
    linkInfo.appendChild(url);
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'link-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', async () => {
      await removeParkedLink(link.url);
      linkItem.remove();
    });
    
    linkItem.appendChild(linkInfo);
    linkItem.appendChild(removeBtn);
    
    parkedLinksList.appendChild(linkItem);
  });
}

async function removeParkedLink(url: string) {
  const { parkedLinks } = await getStorage(['parkedLinks']);
  
  if (parkedLinks) {
    const updatedLinks = parkedLinks.filter(link => link.url !== url);
    await setStorage({ parkedLinks: updatedLinks });
  }
}

async function handleReleaseParkedLinks() {
  try {
    await releaseParkedLinks();
    await displayParkedLinks([]);
    showNotification("All links have been opened in new tabs");
  } catch (error) {
    console.error("Error releasing parked links:", error);
    showNotification("Error opening links", 3000);
  }
}

async function handleClearParkedLinks() {
  if (confirm("Are you sure you want to clear all parked links?")) {
    await clearParkedLinks();
    await displayParkedLinks([]);
    showNotification("All parked links have been cleared");
  }
}

// Feedback UI Functions
async function displayFeedbackStats() {
  if (!feedbackStats) return;
  
  feedbackStats.innerHTML = '';
  
  try {
    const stats = await getFeedbackStatistics();
    
    if (stats.totalFeedback === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'empty-state';
      emptyMsg.textContent = 'No feedback has been provided yet.';
      feedbackStats.appendChild(emptyMsg);
      return;
    }
    
    // Create stats display
    const summaryDiv = document.createElement('div');
    summaryDiv.style.display = 'flex';
    summaryDiv.style.justifyContent = 'space-between';
    summaryDiv.style.flexWrap = 'wrap';
    
    // Total feedback count
    const countDiv = document.createElement('div');
    countDiv.style.textAlign = 'center';
    countDiv.style.margin = '0 10px 15px 0';
    
    const countTitle = document.createElement('h3');
    countTitle.style.margin = '0 0 5px 0';
    countTitle.textContent = stats.totalFeedback.toString();
    
    const countLabel = document.createElement('div');
    countLabel.style.fontSize = '14px';
    countLabel.style.color = '#666';
    countLabel.textContent = 'Total Corrections';
    
    countDiv.appendChild(countTitle);
    countDiv.appendChild(countLabel);
    summaryDiv.appendChild(countDiv);
    
    // Top corrections
    if (stats.mostCommonCorrections.length > 0) {
      const correctionsDiv = document.createElement('div');
      correctionsDiv.style.flexGrow = '1';
      
      const correctionsTitle = document.createElement('h4');
      correctionsTitle.style.margin = '0 0 10px 0';
      correctionsTitle.textContent = 'Common Corrections';
      correctionsDiv.appendChild(correctionsTitle);
      
      const correctionsList = document.createElement('ul');
      correctionsList.style.margin = '0';
      correctionsList.style.padding = '0 0 0 20px';
      
      stats.mostCommonCorrections.forEach(correction => {
        const item = document.createElement('li');
        item.textContent = `${correction.from} → ${correction.to} (${correction.count} times)`;
        correctionsList.appendChild(item);
      });
      
      correctionsDiv.appendChild(correctionsList);
      summaryDiv.appendChild(correctionsDiv);
    }
    
    feedbackStats.appendChild(summaryDiv);
    
  } catch (error) {
    console.error("Error displaying feedback stats:", error);
    const errorMsg = document.createElement('div');
    errorMsg.textContent = 'Error loading feedback statistics';
    errorMsg.style.color = '#f44336';
    feedbackStats.appendChild(errorMsg);
  }
}

async function displayFeedbackHistory() {
  if (!feedbackHistory) return;
  
  feedbackHistory.innerHTML = '';
  
  try {
    const history = await getFeedbackHistory();
    
    if (history.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'empty-state';
      emptyMsg.textContent = 'No feedback history available.';
      feedbackHistory.appendChild(emptyMsg);
      return;
    }
    
    // Create table layout
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    
    // Table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    ['URL', 'From', 'To', 'Date'].forEach(headerText => {
      const th = document.createElement('th');
      th.textContent = headerText;
      th.style.textAlign = 'left';
      th.style.padding = '8px';
      th.style.borderBottom = '1px solid #ddd';
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    // Sort by most recent first
    history.sort((a, b) => b.timestamp - a.timestamp).forEach(item => {
      const row = document.createElement('tr');
      
      // URL column
      const urlCell = document.createElement('td');
      urlCell.textContent = item.domain;
      urlCell.title = item.url;
      urlCell.style.padding = '8px';
      row.appendChild(urlCell);
      
      // From context
      const fromCell = document.createElement('td');
      fromCell.textContent = item.predictedContext;
      fromCell.style.padding = '8px';
      row.appendChild(fromCell);
      
      // To context
      const toCell = document.createElement('td');
      toCell.textContent = item.correctedContext;
      toCell.style.padding = '8px';
      row.appendChild(toCell);
      
      // Date
      const dateCell = document.createElement('td');
      dateCell.textContent = new Date(item.timestamp).toLocaleDateString();
      dateCell.style.padding = '8px';
      row.appendChild(dateCell);
      
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    feedbackHistory.appendChild(table);
    
  } catch (error) {
    console.error("Error displaying feedback history:", error);
    const errorMsg = document.createElement('div');
    errorMsg.textContent = 'Error loading feedback history';
    errorMsg.style.color = '#f44336';
    feedbackHistory.appendChild(errorMsg);
  }
}

async function handleClearFeedback() {
  if (confirm("Are you sure you want to clear all feedback history?")) {
    try {
      await clearFeedbackHistory();
      await displayFeedbackStats();
      await displayFeedbackHistory();
      showNotification("Feedback history has been cleared");
    } catch (error) {
      console.error("Error clearing feedback:", error);
      showNotification("Error clearing feedback history", 3000);
    }
  }
}