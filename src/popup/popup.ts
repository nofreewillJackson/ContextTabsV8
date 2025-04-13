/**
 * Simplified popup for the Focus extension
 * 
 * This popup allows users to select which contexts they want to focus on
 * and optionally set a timer duration. Everything else is blocked.
 */

import { getFocusState } from "../api/storageApi";

// DOM Elements
const inactiveUI = document.getElementById('inactiveUI') as HTMLElement;
const activeUI = document.getElementById('activeUI') as HTMLElement;
const contextList = document.getElementById('contextList') as HTMLElement;
const durationInput = document.getElementById('duration') as HTMLInputElement;
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const endBtn = document.getElementById('endBtn') as HTMLButtonElement;
const allowedTags = document.getElementById('allowedTags') as HTMLElement;
const countdown = document.getElementById('countdown') as HTMLElement;

// Feedback UI Elements
const feedbackSection = document.getElementById('feedbackSection') as HTMLElement;
const showFeedbackBtn = document.getElementById('showFeedbackBtn') as HTMLButtonElement;
const feedbackForm = document.getElementById('feedbackForm') as HTMLElement;
const correctContextSelect = document.getElementById('correctContextSelect') as HTMLSelectElement;
const submitFeedbackBtn = document.getElementById('submitFeedbackBtn') as HTMLButtonElement;

// Available contexts
const AVAILABLE_CONTEXTS = [
  'Work',
  'Development',
  'Research',
  'Learning',
  'Entertainment',
  'Social', 
  'Shopping',
  'News'
];

// Initialize the popup
async function initPopup() {
  // Render context checkboxes
  renderContextList();
  
  // Check current focus state
  const focusState = await getFocusState();
  
  if (focusState.active) {
    // Show active UI
    renderActive(focusState);
  } else {
    // Show inactive UI
    renderInactive();
  }
  
  // Setup event listeners
  setupEventListeners();
  
  // Start polling for updates (to update the countdown)
  startPolling();
}

// Render the list of contexts as checkboxes
function renderContextList() {
  contextList.innerHTML = '';
  
  AVAILABLE_CONTEXTS.forEach(context => {
    const wrapper = document.createElement('div');
    wrapper.className = 'context-checkbox';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = context;
    input.id = `context-${context}`;
    input.className = 'context-checkbox-input';
    
    const label = document.createElement('label');
    label.textContent = context;
    label.htmlFor = `context-${context}`;
    
    wrapper.appendChild(input);
    wrapper.appendChild(label);
    contextList.appendChild(wrapper);
  });
}

// Show the inactive UI (start focus)
function renderInactive() {
  inactiveUI.hidden = false;
  activeUI.hidden = true;
}

// Show the active UI (end focus)
function renderActive(focusState: any) {
  inactiveUI.hidden = true;
  activeUI.hidden = false;
  
  // Show allowed contexts
  allowedTags.textContent = focusState.allowedContexts.join(', ');
  
  // Show countdown if there's a timer
  updateCountdown(focusState);
}

// Update the countdown timer
function updateCountdown(focusState: any) {
  if (!focusState.endTime) {
    countdown.textContent = 'No time limit';
    return;
  }
  
  const now = Date.now();
  const timeLeft = Math.max(0, focusState.endTime - now);
  
  if (timeLeft <= 0) {
    countdown.textContent = 'Time expired';
    return;
  }
  
  // Format as MM:SS
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  
  countdown.textContent = `${minutes}:${seconds.toString().padStart(2, '0')} remaining`;
}

// Populate the feedback context selector
function populateFeedbackSelector() {
  correctContextSelect.innerHTML = '<option value="" disabled selected>Select correct context...</option>';
  AVAILABLE_CONTEXTS.forEach(context => {
    const option = document.createElement('option');
    option.value = context;
    option.textContent = context;
    correctContextSelect.appendChild(option);
  });
}

// Setup event listeners
function setupEventListeners() {
  // Start Focus button
  startBtn.addEventListener('click', () => {
    // Get selected contexts
    const selectedCheckboxes = document.querySelectorAll<HTMLInputElement>('.context-checkbox-input:checked');
    const allowedContexts = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    if (allowedContexts.length === 0) {
      alert('Please select at least one context to focus on');
      return;
    }
    
    // Get duration (if any)
    const duration = durationInput.value ? parseInt(durationInput.value, 10) : undefined;
    
    // Start focus session with allowed contexts directly
    chrome.runtime.sendMessage({
      type: 'START_FOCUS_SESSION',
      payload: {
        allowedContexts: allowedContexts,
        durationMinutes: duration
      }
    }, () => {
      // Refresh the popup after starting
      window.location.reload();
    });
  });
  
  // End Focus button
  endBtn.addEventListener('click', async () => {
    try {
      // --- Add the confirmation and prompt logic here ---
      const saveWorkspace = confirm("Save current workspace before ending?");
      let workspaceName: string | undefined = undefined;

      if (saveWorkspace) {
        // Prompt returns null if cancelled, empty string if OK with no input
        const nameInput = prompt("Enter workspace name:", `Workspace_${new Date().toLocaleDateString()}`);
        if (nameInput === null) {
          console.log("User cancelled saving workspace.");
          return; // Stop the end process if user cancels the prompt
        }
        workspaceName = nameInput || `Workspace_${Date.now()}`; // Use timestamp if name is empty
      }
      // --- End of added logic ---

      console.log(`[Popup] Ending session. Save workspace: ${saveWorkspace}, Name: ${workspaceName}`);

      // Send the message with the correct payload
      await chrome.runtime.sendMessage({
        type: "END_FOCUS_SESSION",
        payload: { // Ensure payload structure matches background expectation
          saveWorkspaceName: workspaceName // Send name if provided, otherwise undefined
        }
      });

      // Close the popup after sending the message successfully
      window.close();

    } catch (error) {
      console.error("Error ending session from popup:", error);
      // Provide feedback to the user in the popup itself before it closes
      alert("Error ending session. Please try again.");
    }
  });

  // Feedback listeners
  showFeedbackBtn.addEventListener('click', () => {
    feedbackForm.hidden = !feedbackForm.hidden; // Toggle visibility
    if (!feedbackForm.hidden) {
      populateFeedbackSelector(); // Populate dropdown when shown
    }
  });

  submitFeedbackBtn.addEventListener('click', async () => {
    const correctedContext = correctContextSelect.value;
    if (!correctedContext) {
      alert('Please select the correct context.');
      return;
    }

    try {
      // Get current tab info
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        alert("Could not get current tab URL.");
        return;
      }
      
      let targetUrl = tab.url!;               // current tab
      let predicted = "Unknown (Popup)";      // fallback

      // If we're on the extension's blocked page, pull the real data from its query‑string
      const blockedPrefix = chrome.runtime.getURL("blocked.html");
      if (targetUrl.startsWith(blockedPrefix)) {
        const blockedUrl = new URL(targetUrl);
        const original = blockedUrl.searchParams.get("url");
        const ctx = blockedUrl.searchParams.get("context");

        if (original) targetUrl = decodeURIComponent(original);
        if (ctx) predicted = ctx;       // what the classifier thought
      }

      const domain = new URL(targetUrl).hostname;

      // Send feedback
      await chrome.runtime.sendMessage({
        type: "FEEDBACK_SUBMITTED",
        payload: {
          url: targetUrl,
          domain: domain,
          predictedContext: predicted,
          correctedContext: correctedContext,
          source: 'popup'
        }
      });

      alert(`Feedback submitted for ${domain} as ${correctedContext}.`);
      feedbackForm.hidden = true; // Hide form after submission

    } catch (error) {
      console.error("Error submitting feedback from popup:", error);
      alert("Error submitting feedback.");
    }
  });
}

// Poll for updates (for countdown)
function startPolling() {
  setInterval(async () => {
    const focusState = await getFocusState();
    
    if (focusState.active && !activeUI.hidden) {
      updateCountdown(focusState);
    }
  }, 1000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPopup);