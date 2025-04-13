// DOM element references
const timerEl = document.getElementById("timer") as HTMLElement;
const endBtn = document.getElementById("endBtn") as HTMLButtonElement;
const allowedList = document.getElementById("allowedList") as HTMLElement;

import { getFocusState } from '../api/storageApi';
import { initParkedLinksUI } from './parkedLinks';

interface FocusTimeResponse {
  seconds: number;
}

/**
 * Update timer display every second
 */
async function updateTimer(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage<any, FocusTimeResponse>({ 
      type: "GET_FOCUS_TIME_LEFT" 
    });
    
    const seconds = response?.seconds || 0;
    
    if (seconds <= 0) {
      timerEl.textContent = "COMPLETE";
      timerEl.style.color = "#4caf50"; // Green
      return;
    }
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    // Visual warning when time is low
    if (seconds < 300) { // Less than 5 minutes (300 seconds)
      timerEl.style.color = "#ff9800"; // Orange
    }
  } catch (error) {
    console.error("Error fetching time left:", error);
    timerEl.textContent = "ERROR";
    timerEl.style.color = "#f44336"; // Red
  }
}

/**
 * Display the session status showing allowed contexts
 */
async function displaySessionStatus(): Promise<void> {
  try {
    const focusState = await getFocusState();
    
    if (!allowedList) return;
    
    if (focusState.active && focusState.allowedContexts.length > 0) {
      allowedList.innerHTML = '';
      
      // Display ALLOWED contexts
      focusState.allowedContexts.forEach((context: string) => {
        const div = document.createElement('div');
        div.className = 'context-item allowed';
        div.textContent = context;
        allowedList.appendChild(div);
      });
    } else {
      allowedList.innerHTML = '<div class="context-item">No specific contexts allowed</div>';
    }
  } catch (error) {
    console.error("Error loading session status:", error);
    if (allowedList) {
      allowedList.innerHTML = '<div class="context-item">Error loading contexts</div>';
    }
  }
}

/**
 * Handle ending the focus session
 */
async function handleEndSession(): Promise<void> {
  try {
    const saveWorkspace = confirm("Save current workspace before ending?");
    let workspaceName = '';
    
    if (saveWorkspace) {
      workspaceName = prompt("Enter workspace name:", `Workspace_${new Date().toLocaleDateString()}`) || '';
      if (!workspaceName) return; // User cancelled
    }
    
    await chrome.runtime.sendMessage({
      type: "END_FOCUS_SESSION",
      payload: {
        saveWorkspaceName: workspaceName
      }
    });
    
    timerEl.textContent = "ENDED";
    timerEl.style.color = "#f44336"; // Red
    endBtn.disabled = true;
    endBtn.textContent = "Session Ended";
  } catch (error) {
    console.error("Error ending session:", error);
    alert("Error ending session. Please try again.");
  }
}

/**
 * Initialize the sidepanel
 */
function initialize(): void {
  // Add event listener to end button
  endBtn?.addEventListener("click", handleEndSession);
  
  // Load initial data
  displaySessionStatus().catch(console.error);
  updateTimer().catch(console.error);
  
  // Initialize Parked Links UI
  const parkedLinksContainer = document.getElementById('parkedLinks');
  if (parkedLinksContainer) {
    initParkedLinksUI('parkedLinks');
  } else {
    console.warn("Parked links container not found in sidepanel HTML.");
  }
  
  // Set up timer interval
  setInterval(() => {
    updateTimer().catch(console.error);
  }, 1000);
}

// Start everything when page loads
document.addEventListener("DOMContentLoaded", initialize); 