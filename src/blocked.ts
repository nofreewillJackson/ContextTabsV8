// blocked.ts (CSP-compliant external script for blocked.html)
import { submitFeedback } from "./api/feedbackApi";

const urlParams = new URLSearchParams(window.location.search);
const detectedContext = urlParams.get("context") || "Unknown";
const originalUrl = urlParams.get("url") || "";
const domain = originalUrl ? new URL(originalUrl).hostname : "";

document.addEventListener("DOMContentLoaded", () => {
  const detectedEl = document.getElementById("detected-context");
  if (detectedEl) {
    detectedEl.textContent = detectedContext;
  }

  updateCountdown();
  setInterval(updateCountdown, 5000);

  const selector = document.getElementById("context-selector") as HTMLSelectElement;
  if (selector && detectedContext !== "Unknown") {
    for (let i = 0; i < selector.options.length; i++) {
      if (selector.options[i].value === detectedContext) {
        selector.selectedIndex = i;
        break;
      }
    }
  }

  const saveBtn = document.getElementById("save-continue") as HTMLButtonElement;
  const backBtn = document.getElementById("back-button") as HTMLButtonElement;

  saveBtn?.addEventListener("click", async () => {
    const selectedContext = selector.value;
    if (!selectedContext) {
      alert("Please select a context category first");
      return;
    }

    try {
      const focusState = await chrome.runtime.sendMessage({ type: "FOCUS_STATUS" });
      if (focusState?.allowedContexts && !focusState.allowedContexts.includes(selectedContext)) {
        document.body.classList.add("off-track");
        alert(`${selectedContext} context is not allowed during your current focus session`);
        return;
      }

      // Disable button while processing
      saveBtn.disabled = true;
      saveBtn.textContent = "Processing...";
      
      let feedbackSuccess = true;
      if (domain && detectedContext !== selectedContext) {
        console.log(`[blocked.ts] Submitting feedback - originalUrl: ${originalUrl}, domain: ${domain}, predicted: ${detectedContext}, corrected: ${selectedContext}`);
        const result = await submitFeedback(
          originalUrl,
          detectedContext,
          selectedContext,
          'blockedPage'
        );
        
        let finalFeedbackResult = { success: result.success };
        
        if (result.isMultiPurposeDomain) {
          const overrideType = await promptForOverrideType(domain);
          if (overrideType) {
            // Submit again with the chosen override type
            finalFeedbackResult = await submitFeedback(
              originalUrl,
              detectedContext,
              selectedContext,
              'blockedPage',
              overrideType
            );
          } else {
            // User cancelled the prompt
            console.log("[blocked.ts] User cancelled override type selection.");
            feedbackSuccess = false;
          }
        }
        
        feedbackSuccess = finalFeedbackResult.success; // Update success based on final call
        console.log(`[blocked.ts] Feedback submission result: ${feedbackSuccess}`);
      }

      if (feedbackSuccess) {
        // *** NEW: Request background to navigate ***
        console.log(`[blocked.ts] Requesting navigation to: ${originalUrl}`);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id && originalUrl) {
          try {
            const navResponse = await chrome.runtime.sendMessage({
              type: "REQUEST_NAVIGATION",
              payload: {
                tabId: tab.id,
                url: originalUrl
              }
            });
            if (!navResponse?.success) {
              console.error("[blocked.ts] Background navigation request failed.");
              alert("Could not navigate back automatically. Please try again.");
              // Re-enable button on failure
              saveBtn.disabled = false;
              saveBtn.textContent = "This is work-related, continue";
            }
            // If successful, the background handles navigation, this page might close or change.
          } catch (error) {
            console.error("[blocked.ts] Error sending navigation request:", error);
            alert("An error occurred trying to navigate back. Please try again.");
            saveBtn.disabled = false;
            saveBtn.textContent = "This is work-related, continue";
          }
        } else {
          console.warn("[blocked.ts] Could not get tab ID or original URL for navigation request.");
          alert("Cannot navigate back automatically (missing info).");
          saveBtn.disabled = false;
          saveBtn.textContent = "This is work-related, continue";
        }
      } else {
        // Re-enable button if feedback submission failed or was cancelled
        alert("Could not process feedback. Please try again.");
        saveBtn.disabled = false;
        saveBtn.textContent = "This is work-related, continue";
      }

    } catch (err) {
      console.error("[blocked.ts] Error processing feedback and continuing:", err);
      alert("There was an error saving your selection. Please try again.");
      // Re-enable button on error
      saveBtn.disabled = false;
      saveBtn.textContent = "This is work-related, continue";
    }
  });

  backBtn?.addEventListener("click", async () => {
    try {
      await chrome.runtime.sendMessage({
        type: "STAY_FOCUSED_ACTION",
        payload: {
          url: originalUrl,
          context: detectedContext,
          title: domain
        }
      });
    } catch (err) {
      console.error("Error going back:", err);
      window.location.href = "https://google.com";
    }
  });
});

/**
 * Prompt the user to choose how to apply the context override
 */
async function promptForOverrideType(domain: string): Promise<"domain" | "url-pattern" | null> {
  // Create a modal dialog
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  modal.style.display = "flex";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";
  modal.style.zIndex = "1000";
  
  const dialog = document.createElement("div");
  dialog.style.backgroundColor = "white";
  dialog.style.borderRadius = "8px";
  dialog.style.padding = "20px";
  dialog.style.maxWidth = "450px";
  dialog.style.color = "#333";
  dialog.style.textAlign = "left";
  
  dialog.innerHTML = `
    <h3 style="margin-top: 0; color: #1976d2;">Apply this correction</h3>
    <p>${domain} can have different contexts on different pages.</p>
    <div style="display: flex; flex-direction: column; gap: 10px; margin: 15px 0;">
      <button id="this-page-btn" style="padding: 10px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">
        Just this page (recommended)
      </button>
      <button id="all-pages-btn" style="padding: 10px; background: #e0e0e0; color: #333; border: none; border-radius: 4px; cursor: pointer;">
        All ${domain} pages
      </button>
      <button id="cancel-btn" style="padding: 10px; background: transparent; color: #666; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">
        Cancel
      </button>
    </div>
  `;
  
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  
  return new Promise((resolve) => {
    document.getElementById("this-page-btn")?.addEventListener("click", () => {
      document.body.removeChild(modal);
      resolve("url-pattern");
    });
    
    document.getElementById("all-pages-btn")?.addEventListener("click", () => {
      document.body.removeChild(modal);
      resolve("domain");
    });
    
    document.getElementById("cancel-btn")?.addEventListener("click", () => {
      document.body.removeChild(modal);
      resolve(null);
    });
  });
}

async function safeGetTimeLeft(): Promise<{ seconds: number }> {
  try {
    return await chrome.runtime.sendMessage({ type: "GET_FOCUS_TIME_LEFT" });
  } catch {
    await new Promise((res) => setTimeout(res, 100));
    return chrome.runtime.sendMessage({ type: "GET_FOCUS_TIME_LEFT" });
  }
}

async function updateCountdown(): Promise<void> {
  const resp = await safeGetTimeLeft();
  const secs = Math.floor(resp?.seconds ?? 0);
  const countdown = document.getElementById("countdown");
  if (!countdown) return;

  if (secs === -1) {
    countdown.textContent = "∞ (unlimited)";
  } else if (secs > 0) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    countdown.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  } else {
    // Focus session has ended but user is still on blocked page
    countdown.textContent = "Session ended";
    
    // Show message that they can continue if they want
    const remaining = document.getElementById("remaining");
    if (remaining) {
      remaining.innerHTML = "Focus session has ended. <span style='color:#ffeb3b'>You may continue if you wish.</span>";
    }
  }
}

function navigateToContextSite(context: string): string {
  const contextSites: Record<string, string> = {
    Work: "https://docs.google.com",
    Development: "https://github.com",
    Research: "https://scholar.google.com",
    Learning: "https://coursera.org",
    News: "https://news.google.com",
    Social: "https://linkedin.com",
    Shopping: "https://google.com",
    Entertainment: "https://google.com",
  };
  return contextSites[context] || "https://google.com";
}
