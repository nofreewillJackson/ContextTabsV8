/**
 * Content script for Context Focus
 * 
 * This script runs on each page and does only one thing:
 * 1. Classify the current page context
 * 2. Send the classification to the background script
 */

import { classifyPageContext } from "../lib/contextEngine";

// Variable to track if we should run the script
let shouldRunScript = true;

// Abort if this page is being prerendered; we'll start after activation
if ((document as any).prerendering) {
  shouldRunScript = false;
  document.addEventListener("prerenderingchange", () => {
    // When it becomes visible we continue as usual
    if (!(document as any).prerendering) {
      shouldRunScript = true;
      initContextDetection();
    }
  });
}

// Keep track of last context (to avoid sending duplicate messages)
let lastContext: string | null = null;

// Reset lastContext when page is restored from bfcache
window.addEventListener('pageshow', (e) => {
  if (e.persisted && shouldRunScript) {
    lastContext = null;          // force a fresh classification
    detectAndSendContext();      // re‑emit the correct context
  }
});

// Also reset on normal load (helps with History API navigation)
window.addEventListener('load', () => {
  if (shouldRunScript) {
    lastContext = null;  // force a fresh classification on every page load
    initContextDetection();
  }
});

// Initialize context detection
async function initContextDetection(): Promise<void> {
  if (!shouldRunScript) return;
  
  // Register for future DOM changes
  setupMutationObserver();
  
  // Initial classification
  await detectAndSendContext();
}

/**
 * Set up a mutation observer to detect and send context when content changes
 */
function setupMutationObserver(): void {
  // Observe changes to the page content
  const observer = new MutationObserver(() => {
    // Skip if document is hidden (tab not visible)
    if (document.hidden) return;
    
    // Use requestIdleCallback for better performance
    if (!contextDetectionTimer) {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => scheduleContextCheck(), { timeout: 2000 });
      } else {
        scheduleContextCheck();
      }
    }
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

// Timer for debouncing context detection
let contextDetectionTimer: number | null = null;

/* ------------------------------------------------------------------ */
/*  ✦  Stop context scans while the user is editing text on the page  */
/* ------------------------------------------------------------------ */

let typing      = false;          // true ⇢ user is actively editing
let typingTimer: number | null = null;

/** activeElement is an <input>, <textarea> or contenteditable? */
function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    (tag === "input"  && !["checkbox","radio","button","submit"].includes((el as HTMLInputElement).type)) ||
    tag === "textarea" ||
    el.isContentEditable
  );
}

/** call when we got *any* editing activity */
function noteTypingActivity(): void {
  typing = true;
  if (typingTimer) clearTimeout(typingTimer);
  // wait 1 s after the *last* activity before allowing scans again
  typingTimer = window.setTimeout(() => { typing = false; scheduleContextCheck(); }, 1000);
}

/* 1 – key presses */
document.addEventListener("keydown", e => {
  if (!isEditing()) return;
  // If user hit Enter we assume they finished the query → allow scan immediately
  if (e.key === "Enter") {
    typing = false;
    if (typingTimer) clearTimeout(typingTimer);
    scheduleContextCheck();
  } else {
    noteTypingActivity();
  }
}, true);                       // use capture to catch early

/* 2 – text actually changed (covers mouse‑paste, IME etc.) */
document.addEventListener("input", () => {
  if (isEditing()) noteTypingActivity();
}, true);

/* 3 – when the field loses focus we're definitely done */
document.addEventListener("blur", () => {
  if (typing) {
    typing = false;
    if (typingTimer) clearTimeout(typingTimer);
    scheduleContextCheck();
  }
}, true);

/**
 * Schedule a context check after a short delay (debouncing)
 */
function scheduleContextCheck(): void {
  // Clear any existing timer
  if (contextDetectionTimer) {
    window.clearTimeout(contextDetectionTimer);
    contextDetectionTimer = null;
  }

  // If user is typing we wait until typing stops (handled in keyup above)
  if (typing || isEditing()) return;

  // Set a new timer
  contextDetectionTimer = window.setTimeout(async () => {
    await detectAndSendContext();
  }, 1000);
}

/**
 * Extract useful data from the current page
 */
function extractPageData() {
  // Get basic page info
  const url = window.location.href;
  const title = document.title;
  
  // Extract metadata
  const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const metaKeywords = document.querySelector('meta[name="keywords"]')?.getAttribute('content')?.split(',').map(k => k.trim()) || [];
  
  // Extract visible text
  const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, a, span, div, li');
  let visibleText = '';
  
  // Get text from the first 100 elements (for performance)
  const maxElements = Math.min(textElements.length, 100);
  for (let i = 0; i < maxElements; i++) {
    const el = textElements[i];
    const style = window.getComputedStyle(el);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      visibleText += el.textContent + ' ';
      if (visibleText.length > 5000) break; // Limit text length
    }
  }
  
  return {
    url,
    title,
    fullText: visibleText.trim(),
    metaDescription,
    metaKeywords
  };
}

/**
 * Detect the context of the current page and send it to the background script
 */
async function detectAndSendContext(): Promise<void> {
  try {
    if (typing || !shouldRunScript) return;                

    // Extract page data
    const pageData = extractPageData();
    
    // Classify context
    const contextResult = await classifyPageContext(pageData);
    
    // Only send if context has changed
    if (contextResult.primaryContext !== lastContext) {
      const previousContext = lastContext;
      lastContext = contextResult.primaryContext;
      
      // Simple message with just the context and confidence
      chrome.runtime.sendMessage({
        type: "CONTEXT_DETECTED",
        context: contextResult.primaryContext,
        confidence: contextResult.confidence,
        url: pageData.url
      });
      
      // If this was a context change due to navigation back,
      // and not the initial page load, show a toast notification
      if (previousContext !== null && document.referrer !== "") {
        // Create a small notification for the user
        const toast = document.createElement("div");
        toast.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          background-color: rgba(0, 102, 204, 0.9);
          color: white;
          padding: 12px 20px;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
          font-family: Arial, sans-serif;
          z-index: 2147483647;
          max-width: 300px;
          transition: opacity 0.3s ease-in-out;
        `;
        toast.textContent = `Returned to ${contextResult.primaryContext} – stay focused!`;
        document.body.appendChild(toast);
        
        // Fade out and remove after 3 seconds
        setTimeout(() => {
          toast.style.opacity = "0";
          setTimeout(() => toast.remove(), 300);
        }, 2700);
      }
    }
  } catch (error) {
    console.error("Error detecting context:", error);
  }
}

// Start context detection when the page is loaded
(function() {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initContextDetection();
  } else {
    document.addEventListener('DOMContentLoaded', initContextDetection);
  }
})();

// Add listener for DRIFT_WARNING messages from background script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "DRIFT_WARNING") {
    // remove any previous overlay
    const old = document.getElementById("__cf_drift_overlay");
    old?.remove();

    // build a full‑screen overlay
    const ov = document.createElement("div");
    ov.id = "__cf_drift_overlay";
    ov.style.cssText = `
      position:fixed;inset:0;z-index:2147483647;
      background:rgba(0,0,0,.85);color:#fff;display:flex;
      flex-direction:column;align-items:center;justify-content:center;
      font:700 32px/1.4 system-ui, sans-serif;text-align:center;
    `;
    ov.textContent = msg.message || "You're drifting!";
    
    // optional "Return" button
    const btn = document.createElement("button");
    btn.textContent = "Back to focus";
    btn.style.cssText = `
      margin-top:24px;padding:12px 24px;font-size:18px;font-weight:700;
      border:none;border-radius:6px;cursor:pointer;background:#d32f2f;color:#fff;
    `;
    btn.onclick = () => ov.remove();
    ov.appendChild(btn);

    document.documentElement.appendChild(ov);

    // let background know we handled it (optional)
    return true;  // keeps the sendResponse channel open
  }
  
  // Handle forced context rescan
  if (msg.type === "FORCE_CONTEXT_RESCAN") {
    lastContext = null;  // Reset the last context to force a fresh scan
    detectAndSendContext();
    return true;
  }
});