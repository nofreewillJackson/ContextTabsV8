import { groupTabByContext, onTabRemoved, ungroupAllTabs } from "../api/tabsApi";
import { getStorage, setStorage, getFocusState, setFocusState, findMatchingUrlPatternOverride } from "../api/storageApi";
import { checkFocusStatus, showFocusNotification } from "../api/focusApi";
import { classifyPageContext } from "../lib/contextEngine";
import { extractDomain, DOMAIN_CATEGORIES } from "../lib/contextEngine/urlAnalyzer";
import { saveForLater, releaseParkedLinks, goBackOrClose } from "../api/parkedLinksApi";
import * as focusEngine from "../lib/focusEngine";
import { applyAllowedContexts } from "./blockingRules";
import { ClassificationFeedback } from "../types/index";

const tabContextMap: Record<number, string> = {};
const BLOCKED_PAGE_URL = chrome.runtime.getURL("blocked.html");
// Track tabs that just came from the blocked page to prevent redirect loops
const recentlyUnblockedTabs = new Set<number>();

/**
 * Initialize the extension with proper default settings
 */
async function initExtension(): Promise<void> {
  // Always enable the extension
  await setStorage({ extensionEnabled: true });
  
  console.log("[Background] Extension enabled.");
  
  // Pre-seed domain context map with known categories
  await chrome.storage.local.set({ domainContextMap: DOMAIN_CATEGORIES });
  
  // Check for active sessions - now using the new focusState
  const focusState = await getFocusState();
  if (focusState.active) {
    console.log("[Background] Focus session was active at shutdown, verifying...");
    // Verify session is still valid (not expired)
    if (!focusState.endTime || focusState.endTime <= Date.now()) {
      console.log("[Background] Focus session expired during shutdown, cleaning up");
      await setFocusState({ active: false, endTime: undefined });
    } else {
      console.log(`[Background] Focus session continues until ${new Date(focusState.endTime).toLocaleTimeString()}`);
      
      // Apply blocking rules for active focus session
      await applyAllowedContexts();
    }
  } else {
    // Apply blocking rules even if no active session to create initial rules
    await applyAllowedContexts();
  }
  
  // Set up periodic checks
  setupPeriodicChecks();
  
  // one‑time cleanup of multi‑purpose domains in domainContextMap
  (async () => {
    const { domainContextMap = {} } = await chrome.storage.local.get("domainContextMap");
    const MULTI_PURPOSE = ["google.com","youtube.com","reddit.com","amazon.com",
                           "twitter.com","facebook.com","instagram.com","linkedin.com",
                           "github.com","medium.com"];
    let changed = false;
    for (const d of Object.keys(domainContextMap)) {
      if (MULTI_PURPOSE.some(mpd => d.endsWith(mpd))) {
        delete domainContextMap[d];
        changed = true;
      }
    }
    if (changed) await chrome.storage.local.set({ domainContextMap });
  })();
}

/**
 * Set up all periodic checks needed for the extension
 */
function setupPeriodicChecks() {
  // Set up alarms for periodic checks - minimum 1 minute for MV3
  chrome.alarms.create('focusTick', { periodInMinutes: 1 });     // 60s - check session status
  chrome.alarms.create('focusDrift', { periodInMinutes: 2 });    // 120s - check drift (less urgent)
  
  // Handle alarms
  chrome.alarms.onAlarm.addListener(async ({ name }) => {
    try {
      if (name === 'focusTick') {
        await checkFocusSessionStatus();
      } else if (name === 'focusDrift') {
        const isSessionActive = await focusEngine.isActive();
        if (isSessionActive) {
          const focusStatus = await checkFocusStatus();
          if (focusStatus.isLostFocus) {
            // Immediately send a drift warning if focus is lost
            await sendDriftWarning(focusStatus);
          }
        }
      }
      // Update badge for all alarm types
      await updateBadge();
    } catch (err) {
      console.error(`Error in alarm handler (${name}):`, err);
    }
  });
}

/**
 * Handle messages from content scripts and the UI
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "CONTEXT_UPDATE" || request.type === "CONTEXT_DETECTED") {
    const context = request.context as string;
    const tabId = sender.tab?.id;
    
    if (tabId != null) {
      // Check if context has changed
      const previousContext = tabContextMap[tabId];
      if (previousContext !== context) {
        // Notify focus mode about context change
        // handleContextChange(context);
      }
      
      tabContextMap[tabId] = context;
      
      // Store additional context data if available
      const contextData = {
        context,
        confidence: request.confidence,
        secondaryContexts: request.secondaryContexts,
        url: request.url
      };
      
      // Save context data to storage for URL blocking functionality
      chrome.storage.local.set({
        [request.url]: { context: request.context, confidence: request.confidence }
      });
      
      // Handle the context update
      handleContextUpdate(tabId, context, contextData).catch((err) => console.error(err));
    }
    
    return false; // No response needed
  } 
  else if (request.type === "FOCUS_TOGGLE") {
    toggleFocusMode(request.enabled).catch((err) => console.error(err));
    return false; // No response needed
  }
  else if (request.type === "START_FOCUS_SESSION") {
    const { durationMinutes, allowedContexts } = request.payload || {};
    
    // Use allowedContexts directly if provided, otherwise fallback to blockedCategories
    if (allowedContexts) {
      focusEngine.start(allowedContexts, durationMinutes)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error(err);
          sendResponse({ success: false, error: err.message });
        });
    } else {
      // Legacy support: convert blockedCategories to allowedContexts
      const { blockedCategories } = request.payload || {};
      const KNOWN_CONTEXTS = [
        "Work", "Development", "Research", "Learning",
        "Entertainment", "Social", "Shopping", "News"
      ];
      const allowedContexts = KNOWN_CONTEXTS.filter(
        ctx => !blockedCategories?.includes(ctx)
      );
      
      focusEngine.start(allowedContexts, durationMinutes)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error(err);
          sendResponse({ success: false, error: err.message });
        });
    }
    return true; // Indicates async response
  }
  else if (request.type === "END_FOCUS_SESSION") {
    const { saveWorkspaceName } = request.payload || {};
    focusEngine.end(saveWorkspaceName)
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error("Error ending focus session:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Required for async response
  }
  else if (request.type === "GET_FOCUS_TIME_LEFT") {
    focusEngine.getTimeLeft()
      .then(seconds => {
        sendResponse({ seconds });
      })
      .catch(error => {
        console.error("Error getting focus time left:", error);
        sendResponse({ seconds: 0 });
      });
    return true; // Required for async response
  }
  else if (request.type === "RESTORE_WORKSPACE") {
    const { name } = request.payload || {};
    focusEngine.restoreWorkspace(name)
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error(err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Indicates async response
  }
  else if (request.type === "CHECK_FOCUS_STATUS") {
    checkFocusStatus()
      .then(result => sendResponse(result))
      .catch(error => {
        console.error("Error checking focus status:", error);
        sendResponse(null);
      });
    return true; // Required for async response
  }
  else if (request.type === "CONTENT_SCRIPT_READY") {
    // Content script is ready to receive messages
    const tabId = sender.tab?.id;
    // if (tabId && activeTimer && activeTimer.active && activeTimer.endTime > Date.now()) {
    //   console.log(`Tab ${tabId} is ready, sending active timer`);
    //   // Send the timer right away
    //   chrome.tabs.sendMessage(tabId, {
    //     type: "RESTORE_FOCUS_TIMER",
    //     timerState: activeTimer
    //   }).catch(err => {
    //     console.log('Tab not fully ready, will retry');
    //     // Try again after a short delay
    //     setTimeout(() => {
    //       chrome.tabs.sendMessage(tabId, {
    //         type: 'RESTORE_FOCUS_TIMER',
    //         timerState: activeTimer
    //       }).catch(err => console.error('Failed to restore timer after content script ready retry:', err));
    //     }, 500);
    //   });
    // }
    sendResponse({ success: true });
    return true;
  }
  else if (request.type === "TIMER_EXPIRED") {
    // Handle timer expiration from the side panel
    // endFocusTimer();
    // Show a drift warning on the current page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "DRIFT_WARNING",
          message: "Time's up! Return to your primary task now."
        }, (resp) => {
          if (chrome.runtime.lastError || resp === undefined) {
            // Nobody listened - fall back to the blocked page
            chrome.tabs.update(tabs[0].id!, {url: BLOCKED_PAGE_URL});
          }
        });
      }
    });
    sendResponse({ success: true });
    return true;
  }
  else if (request.type === "PARK_LINK") {
    const { url, context, title } = request;
    
    // Handle the parked link asynchronously
    (async () => {
      try {
        await saveForLater(url, context, title);
        console.log(`[Parked Links] Saved for later: ${title || url} (${context})`);
      } catch (error) {
        console.error("Error parking link:", error);
      }
    })();
    
    return false; // No response needed
  }
  else if (request.type === "RELEASE_PARKED_LINKS") {
    // Handle the release of parked links asynchronously
    (async () => {
      try {
        await releaseParkedLinks();
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error releasing parked links:", error);
        sendResponse({ success: false, error: String(error) });
      }
    })();
    
    return true; // Indicates async response
  }
  else if (request.type === "TRAIN_CONTEXT") {
    (async () => {
      const { url, title, actualContext, predictedContext, isFalsePositive } = request;
      
      // Get or create context data for this URL
      const contextData = await getContextData(url);
      
      // Update training data
      if (!contextData.training) {
        contextData.training = {
          falsePositives: [],
          truePositives: []
        };
      }
      
      if (isFalsePositive) {
        contextData.training.falsePositives.push({
          timestamp: Date.now(),
          actualContext,
          predictedContext
        });
      } else {
        contextData.training.truePositives.push({
          timestamp: Date.now(),
          actualContext,
          predictedContext
        });
      }
      
      // Save updated context data
      await saveContextData(url, contextData);
      
      // Recalculate context weights based on training data
      await updateContextWeights(url);
      
      sendResponse({ success: true });
    })();
    return true; // Required for async response
  }
  else if (request.type === "STAY_FOCUSED_ACTION") {
    (async () => {
      const { url, context, title } = request.payload;
      try {
        await saveForLater(url, context, title);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) await goBackOrClose(tab.id);
        sendResponse({ success: true });
      } catch (e: unknown) {
        console.error("Stay‑focused flow failed:", e);
        sendResponse({ 
          success: false, 
          error: e instanceof Error ? e.message : String(e)
        });
      }
    })();
    return true;
  }
  else if (request.type === "FOCUS_STATUS") {
    // Return the current focus state to the popup
    getFocusState()
      .then(focusState => sendResponse(focusState))
      .catch(error => {
        console.error("Error getting focus status:", error);
        sendResponse(null);
      });
    return true; // Required for async response
  }
  else if (request.type === "FEEDBACK_SUBMITTED") {
    (async () => {
      const { url, domain, predictedContext, correctedContext, source, skipDomainOverride } = request.payload;
      console.log(`[Feedback Handler] Received for ${domain}: Predicted=${predictedContext}, Corrected=${correctedContext}`);

      try {
        // 1. Update the domainContextMap (this is the primary "training")
        const storage = await chrome.storage.local.get(["domainContextMap", "classificationFeedbackLog", "urlPatternOverrides"]); // Ensure urlPatternOverrides is fetched if needed
        const domainContextMap = storage.domainContextMap || {};
        
        const MULTI_PURPOSE = [
          "google.com","youtube.com","reddit.com","amazon.com","twitter.com",
          "facebook.com","instagram.com","linkedin.com","github.com","medium.com"
        ];
        
        // Only update the domain map if not explicitly skipped (for URL pattern overrides)
        // AND not a multi-purpose domain
        if (
          !skipDomainOverride &&
          !domain.startsWith(chrome.runtime.id) &&          // chrome‑extension://…
          !domain.startsWith("chrome-extension") &&
          !MULTI_PURPOSE.some(mpd => domain.endsWith(mpd))
        ) {
          domainContextMap[domain] = correctedContext;
          await setStorage({ domainContextMap });
          console.log(`[Feedback Handler] Updated domainContextMap for ${domain} to ${correctedContext}`);
        } else {
          console.log(`[Feedback Handler] Skipping domainContextMap update for ${domain}.`);
        }

        // 2. Log the feedback event (for auditing/future use)
        const feedbackLog: ClassificationFeedback[] = storage.classificationFeedbackLog || [];
        feedbackLog.push({
          url,
          domain,
          timestamp: Date.now(),
          predictedContext,
          correctedContext,
          source
        });
        // Optional: Limit log size
        if (feedbackLog.length > 200) {
            feedbackLog.shift(); // Remove oldest entry
        }
        await setStorage({ classificationFeedbackLog: feedbackLog });

        // 3. *** CRUCIAL: Await rule application ***
        await applyAllowedContexts(); // Wait for the update request to be processed
        console.log(`[Feedback Handler] DNR rule update requested after feedback for ${domain}`);

        // 4. Send success response *after* rule update request
        sendResponse({ success: true });
      } catch (err) {
        console.error("[Feedback Handler] Error processing feedback:", err);
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true; // Indicates async response
  }
  else if (request.type === "CONTEXT_OVERRIDE") {
    (async () => {
      console.log(`Context override message received for domain: ${request.domain}`);
      // The map update and rule application should have happened via FEEDBACK_SUBMITTED.
      // If not, we might need to trigger rule update here too, but let's rely on FEEDBACK_SUBMITTED.
      // await applyAllowedContexts(); // Removed - should be done by FEEDBACK_SUBMITTED handler
      sendResponse({ success: true });
    })();
    return true;
  }
  else if (request.type === "SETTINGS_UPDATED") {
    (async () => {
      console.log("[Settings] Settings updated, re-applying DNR rules.");
      await applyAllowedContexts(); // Rebuild rules based on potentially changed overrides
      sendResponse({ success: true });
    })();
    return true;
  }
  else if (request.type === "REQUEST_NAVIGATION") {
    (async () => {
      const { tabId, url } = request.payload;
      if (!tabId || !url) {
        console.error("[REQUEST_NAVIGATION] Missing tabId or url in request payload:", request.payload);
        sendResponse({ success: false, error: "Missing tabId or url" });
        return;
      }
      console.log(`[REQUEST_NAVIGATION] Received request to navigate tab ${tabId} to ${url}`);
      try {
        // Check if tab still exists before navigating
        await chrome.tabs.get(tabId);
        await chrome.tabs.update(tabId, { url });
        console.log(`[REQUEST_NAVIGATION] Navigation successful for tab ${tabId}`);
        sendResponse({ success: true });
      } catch (error) {
        console.error(`[REQUEST_NAVIGATION] Error navigating tab ${tabId} to ${url}:`, error);
        // Tab might have been closed, or URL might be invalid
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true; // Indicates async response
  }
  return false; // No response needed for other messages
});

/**
 * Handle any focus mode toggle (enable/disable)
 */
async function toggleFocusMode(enabled: boolean): Promise<void> {
  // This is a legacy function, but we'll keep it for compatibility with older UIs
  if (enabled) {
    // Legacy function, start with default settings
    await focusEngine.start(["Work", "Development", "Research", "Learning"]);
    
    // Apply DNR blocking rules
    await applyAllowedContexts();
  } else {
    // Turn off focus mode
    await focusEngine.end();
    
    // Remove all blocking rules
    await applyAllowedContexts();
  }
}

/**
 * Handle context update with enhanced data
 */
async function handleContextUpdate(
  tabId: number, 
  context: string, 
  contextData?: any
): Promise<void> {
  const { autoGroupEnabled = true } = await getStorage(["autoGroupEnabled"]);
  if (!autoGroupEnabled) return;

  const url = contextData?.url || "";
  const domain = extractDomain(url);
  const { domainContextMap = {} } =
    await chrome.storage.local.get("domainContextMap") as { domainContextMap: Record<string,string> };

  // Check for URL pattern override first (highest priority)
  let overriddenContext = context;
  try {
    const urlOverride = await findMatchingUrlPatternOverride(url);
    if (urlOverride) {
      console.log(`[Context] URL pattern override found for ${url}: ${urlOverride.context}`);
      overriddenContext = urlOverride.context;
    } else if (domain && domainContextMap[domain]) {
      // If no URL pattern match, fall back to domain-level override
      overriddenContext = domainContextMap[domain];
    }
  } catch (err) {
    console.error("[Context] Error checking URL pattern overrides:", err);
    // Fall back to domain map if error with pattern matching
    overriddenContext = domain && domainContextMap[domain] ? domainContextMap[domain] : context;
  }

  // Group tab using the correct context (URL override > domain override > detected)
  await groupTabByContext(tabId, overriddenContext);
  updateBadge();
  
  // Check if the context should be blocked
  const focusState = await getFocusState();
  if (focusState.active && !focusState.allowedContexts.includes(overriddenContext)) {
    const blockedUrl = chrome.runtime.getURL("blocked.html") + 
      `?context=${encodeURIComponent(overriddenContext)}&url=${encodeURIComponent(url)}`;
    
    try {
      // Check if tab still exists
      await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { url: blockedUrl });
      console.log(`[Block] Successfully redirected tab ${tabId} to blocked page in handleContextUpdate`);
    } catch (err) {
      console.error(`[Block] Error redirecting in handleContextUpdate:`, err);
    }
  }
}

/**
 * Updates the badge with current focus status
 */
async function updateBadge(): Promise<void> {
  try {
    const focusState = await getFocusState();
    
    // If not in focus mode, clear badge
    if (!focusState.active) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }
    
    // Show a simple indicator
    chrome.action.setBadgeText({ text: "•" });
    chrome.action.setBadgeBackgroundColor({ color: "#1565c0" }); // Blue
  } catch (error) {
    console.error("Error updating badge:", error);
  }
}

/**
 * Send a high-visibility drift warning to the active tab
 */
async function sendDriftWarning(focusStatus: any): Promise<void> {
  try {
    // Always show warnings during focus sessions regardless of notification settings
    // This is critical - users need to be alerted when drifting
    
    // Check if a focus session is active
    const isSessionActive = await focusEngine.isActive();
    if (!isSessionActive) {
      return; // Only show drift warnings during active focus sessions
    }
    
    console.log("[Focus] Sending drift warning to active tab", focusStatus);
    
    // Get the active tab
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tabs.length || !tabs[0].id) return;

    const activeTab = tabs[0];
    const tabId = activeTab.id as number;
    
    // Skip chrome:// pages and extension pages
    if (
      activeTab.url?.startsWith("chrome://") || 
      activeTab.url?.startsWith("chrome-extension://")
    ) {
      return;
    }
    
    // Create a useful message about why focus was lost
    let message = "YOU'RE DRIFTING FROM YOUR FOCUS TASK!";
    
    // If we have context switches, mention the last switch
    if (focusStatus.contextSwitches.length > 0) {
      const lastSwitch = focusStatus.contextSwitches[focusStatus.contextSwitches.length - 1];
      message = `FOCUS LOST: Switched from ${lastSwitch.from} to ${lastSwitch.to}`;
    }
    
    // Send the warning with callback to check if handled
    chrome.tabs.sendMessage(tabId, {
      type: "DRIFT_WARNING",
      message
    }, (resp) => {
      if (chrome.runtime.lastError || resp === undefined) {
        // Nobody listened - fall back to the blocked page
        chrome.tabs.update(tabId, {url: BLOCKED_PAGE_URL});
      }
    });
      
    // Also show a system notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: 'FOCUS ALERT!',
      message: message,
      priority: 2,
      requireInteraction: true
    });
      
    console.log("[Focus] Drift warning sent successfully");
  } catch (error) {
    console.error("Error sending drift warning:", error);
  }
}

/**
 * Sets up blocking when a focus session is active
 * This is a no-op now because we use DNR rules for blocking
 */
function setupFocusSessionUrlBlocking(): void {
  // No action needed - DNR rules handle blocking
}

/**
 * Check if a focus session should be ended
 */
async function checkFocusSessionStatus(): Promise<void> {
  const endTime = (await getFocusState()).endTime;
  if (endTime && Date.now() >= endTime) {
    const active = await focusEngine.isActive();
    if (active) {
      // Focus session time is up
      await focusEngine.end();
      console.log("[Focus] Session ended automatically due to timeout");
      
      // Show notification to user
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: 'Focus Session Complete',
        message: `Your timed focus session has ended.`,
      });
    }
  }
}

/**
 * Cleanup in-memory reference on tab removal
 */
onTabRemoved((removedTabId) => {
  delete tabContextMap[removedTabId];
});

// Function to get context data for a URL
async function getContextData(url: string): Promise<any> {
  const result = await chrome.storage.local.get([url]);
  return result[url] || { contexts: [], training: { falsePositives: [], truePositives: [] } };
}

// Function to save context data for a URL
async function saveContextData(url: string, data: any): Promise<void> {
  await chrome.storage.local.set({ [url]: data });
}

// Function to update context weights based on training data
async function updateContextWeights(url: string): Promise<void> {
  const contextData = await getContextData(url);
  const { training } = contextData;
  
  if (!training) return;
  
  // Calculate weights based on false positives and true positives
  const weights: { [key: string]: number } = {};
  
  // Decrease weight for contexts that frequently cause false positives
  training.falsePositives.forEach((fp: any) => {
    weights[fp.predictedContext] = (weights[fp.predictedContext] || 1) * 0.9;
  });
  
  // Increase weight for contexts that are frequently true positives
  training.truePositives.forEach((tp: any) => {
    weights[tp.predictedContext] = (weights[tp.predictedContext] || 1) * 1.1;
  });
  
  // Update context weights
  contextData.weights = weights;
  await saveContextData(url, contextData);
}

// Add listeners for focus state changes to update DNR rules
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.focusState) {
    // Focus state has changed, update DNR rules
    await applyAllowedContexts();
  }
});

// Block before navigation is committed
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  const { tabId, frameId, url, documentLifecycle } = details as any;
  if (frameId !== 0) return;                     // only top frame
  
  // 🚫  Skip prerender / inactive / discarded documents
  if (documentLifecycle && documentLifecycle !== "active") return;
  
  // Skip extension pages and about:blank
  if (url.startsWith(chrome.runtime.getURL("")) || url === "about:blank") return;
  
  const focusState = await getFocusState();
  if (!focusState.active) return;

  // Check if the domain is already classified and should be blocked
  const domain = extractDomain(url);
  const ctxMap = (await chrome.storage.local.get("domainContextMap")).domainContextMap || {};
  const context = ctxMap[domain];
  
  // Only block if we have a context and it's not allowed
  if (context && !focusState.allowedContexts.includes(context)) {
    console.log(`[Block] Blocking domain ${domain} with context ${context}`);
    // Pass context and original URL as query parameters
    const blockedUrl = chrome.runtime.getURL("blocked.html") + 
      `?context=${encodeURIComponent(context)}&url=${encodeURIComponent(url)}`;
    try {
      await chrome.tabs.update(tabId, { url: blockedUrl });
      console.log(`[Block] Successfully redirected tab ${tabId} to blocked page`);
    } catch (err) {
      console.error(`[Block] Error redirecting tab ${tabId} to blocked page:`, err);
    }
  }
});

// Set default settings on installation/update
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    // First-time install: set defaults
    chrome.storage.local.set({
      extensionEnabled: true,
      autoGroupEnabled: true, // Set auto grouping enabled by default
      focusState: {
        active: false,
        allowedContexts: []
      },
      urlPatternOverrides: [], // Initialize empty URL pattern overrides
      firstRunComplete: false
    });
    
    // Show onboarding page
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  } else if (details.reason === "update") {
    // Handle migration from old storage format to new
    chrome.storage.local.get([
      "autoGroupEnabled", // Check for this setting
      "focusSessionActive", 
      "focusSessionEndTime",
      "blockedCategories",
      "focusState",
      "pathOverrides" // Check for legacy path overrides
    ], async result => {
      // Always set extension to enabled
      const update: Record<string, any> = {
        extensionEnabled: true
      };
      
      // Migration: If we have old format data but no new focusState yet, convert it
      if (!result.focusState && (result.focusSessionActive || result.blockedCategories)) {
        console.log("Migrating from old focus session format to new focusState format");
        
        // Convert to new FocusState format (invert the block logic to allowedContexts)
        const knownContexts = [
          "Work", "Development", "Research", "Learning", 
          "Entertainment", "Social", "Shopping", "News"
        ];
        
        // Calculate allowed contexts by excluding blocked ones
        const blockedCategories = result.blockedCategories || [];
        const allowedContexts = knownContexts.filter(ctx => !blockedCategories.includes(ctx));
        
        update.focusState = {
          active: result.focusSessionActive === true,
          allowedContexts,
          endTime: result.focusSessionEndTime || undefined
        };
        
        // Remove old keys after migration
        chrome.storage.local.remove([
          "focusSessionActive", 
          "focusSessionEndTime", 
          "blockedCategories"
        ]);
      }

      // Migrate legacy pathOverrides to new URL pattern overrides if they exist
      const pathOverrides = result.pathOverrides || [];
      if (pathOverrides.length > 0) {
        console.log(`[Migration] Converting ${pathOverrides.length} path overrides to URL patterns`);
        
        try {
          // Get existing URL pattern overrides or initialize empty array
          const { urlPatternOverrides = [] } = await chrome.storage.local.get('urlPatternOverrides');
          
          // We'll use 'Work' as a default context since these were previously used for blocking
          const defaultContext = "Work";
          
          for (const path of pathOverrides) {
            urlPatternOverrides.push({
              pattern: path,
              matchType: 'startsWith',
              priority: 100,
              createdAt: Date.now(),
              context: defaultContext,
              description: `Migrated from legacy path override: ${path}`
            });
          }
          
          update.urlPatternOverrides = urlPatternOverrides;
          
          // Remove old pathOverrides after migration
          await chrome.storage.local.remove(['pathOverrides']);
          console.log(`[Migration] Successfully migrated ${pathOverrides.length} path overrides`);
        } catch (error) {
          console.error('[Migration] Error migrating path overrides:', error);
        }
      }
      
      // Ensure we have explicit boolean values, not undefined  
      if (result.autoGroupEnabled === undefined) update.autoGroupEnabled = true;
      
      // Apply all updates
      chrome.storage.local.set(update);
    });
  }
});

// Kick off on load
initExtension().catch(console.error);