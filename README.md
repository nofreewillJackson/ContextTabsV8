# Important
For a smoother experience, when Chrome prompts you before removing tab groups, we recommend selecting the 'Do not ask again' option.
# Context Focus

![](readmeIMGs/Pasted%20image%2020250413151945.png)

 Context Focus helps you stay on task by understanding the *type* of content you're viewing and gently (or firmly!) guiding you back when you stray during focused work sessions.

It automatically categorizes web pages (like "Work", "Learning", "Social", "News") and lets you define which categories are allowed when you need to concentrate.

## Key Features

*   **Automatic Context Detection:** Understands the type of content on most web pages.
	* Granularized search context -> Minimize false positives: ![](readmeIMGs/Pasted%20image%2020250413152316.png)
*   **Focus Sessions:** Start sessions where only your chosen "allowed" contexts are permitted.
*   **Site Blocking:** Automatically blocks access to websites belonging to disallowed contexts during a focus session.
*   **Timed Sessions:** Optionally set a duration for your focus session.
*   **Drift Warning:** Get alerted if you switch between allowed tabs too frequently, indicating potential loss of focus.
	*   **Park Links for Later:** Easily save distracting links found during a focus session to review afterward.
		![](readmeIMGs/Pasted%20image%2020250413150622.png)
		*   **Context Feedback:** Correct misclassified pages to improve the extension over time.![](readmeIMGs/Pasted%20image%2020250413150653.png) ![](readmeIMGs/Pasted%20image%2020250413152133.png)
*   **Tab Grouping (Optional):** Automatically group your tabs by their detected context.
*   **Clean Slate Focus (Optional):** Start a focus session with a clean slate – your current tabs are saved and closed, then restored when the session ends.
*   **Side Panel:** View your focus timer and blocked categories easily.

## How to Use

### 1. Starting a Focus Session

1.  Click the Context Focus extension icon in your toolbar.
2.  **Select Allowed Contexts:** Check the boxes next to the categories you need for your current task (e.g., "Work", "Development"). *Everything else will be blocked.*
3.  **(Optional) Set Duration:** Enter a time in minutes if you want the session to end automatically. Leave blank for an unlimited session.
4.  Click **"Start Focus"**.

### 2. During a Focus Session

*   **Browsing Allowed Sites:** You can browse sites matching your selected contexts freely.
*   **Blocked Page:** If you try to visit a site in a *disallowed* context, you'll see the "Focus Check" page instead. Here you can:
    *   **Correct the Context:** If the page was misclassified, select the correct context from the dropdown. If this corrected context *is* allowed in your current session, you can click "This is work-related, continue" to proceed to the original URL. This also helps train the extension!
    *   **Go Back:** If you acknowledge you're off track, click "Go back, I'm off track". This will save the link to your "Later List" (see Options) and attempt to take you back to the previous page or close the tab.
*   **Drift Warning:** If you switch between allowed tabs very rapidly, a subtle overlay might appear warning you that you're "drifting". Click "Back to focus" on the overlay to dismiss it and remind yourself to concentrate. A system notification may also appear.
*   **Side Panel:** You can open the Chrome Side Panel to see your remaining time (if set) and a list of the categories currently being blocked.

### 3. Ending a Focus Session

*   Click the Context Focus extension icon again.
*   Click the **"End Focus"** button.
*   (You can also end the session from the Side Panel).
*   You may be prompted to save your current tab groups as a named "Workspace" for easy restoration later (optional).
*   If you used "Clean Slate Focus", your original tabs will now be restored.
*   Any links you "Parked for Later" (by clicking "Go back, I'm off track" on the blocked page) can be found and opened from the extension's Options page.

### 4. Correcting Contexts

If you think the extension miscategorized a page:

*   **From the Popup:** Click the extension icon, then click the "Correct Context" button. Select the right category and click "Submit Correction".
*   **From the Blocked Page:** Use the dropdown menu and the "This is work-related, continue" button as described above.

## Configuration (Options)

You can customize the extension's behavior:

1.  Right-click the Context Focus extension icon and choose "Options".
2.  Alternatively, go to `chrome://extensions`, find Context Focus, and click "Details", then "Extension options".

Here you can:

*   Enable/Disable the entire extension.
*   Enable/Disable automatic tab grouping.
*   Enable/Disable the "Clean Slate Focus" mode.
*   Adjust the sensitivity of the "Drift Warning" (threshold and time window).
*   View/Manage Context Overrides you've created via feedback.
*   View/Manage your "Later List" (Parked Links) and open or clear them.
*   View your feedback history.

## Installation

1.  **(Manual / Development)**
    *   Download the extension files (e.g., as a ZIP and extract, or clone the repository).
    *   Open Chrome and navigate to `chrome://extensions`.
    *   Enable "Developer mode" (usually a toggle in the top-right corner).
    *   Click "Load unpacked".
    *   Select the `dist` folder (or the main folder containing `manifest.json`) from the extracted/cloned files.


---



### Distinctions between Blocked and Drift Warning

1.  **Blocking Page (Rule Enforcement): Prevents Accessing Disallowed Categories.**
    *   **Trigger:** Navigating to a URL categorized as **outside** your allowed focus contexts.
    *   **Purpose:** To strictly enforce the boundaries you set for your focus session. If you said "No Social Media", this stops you *the moment* you try to go to Facebook. It's about *where* you are going.

2.  **Drift Warning (Behavioral Monitoring): Catches Unfocused Switching Patterns.**
    *   **Trigger:** Rapidly switching between different contexts (or even different pages *within* the same context) frequently within a set time window, exceeding a threshold.
    *   **Purpose:** To identify when you might be **losing deep focus**, even if you are technically staying *within* your allowed categories. It's less about *where* you are going and more about *how* you are working/browsing.

**Here's the key scenario where the Drift Warning is crucial and Blocking isn't triggered:**

Imagine you start a focus session allowing only "Work" and "Development".

*   You have 5 Google Docs tabs open (Work).
*   You have 5 GitHub tabs open (Development).
*   You start rapidly clicking between *all 10 tabs*. You check a doc comment, then a pull request status, then another doc, then a build log on GitHub, then back to the first doc, all within 60 seconds.

In this scenario:

*   **Blocking Page:** Will **never** appear. You are *only* visiting pages classified as "Work" or "Development", both of which you explicitly allowed. You haven't broken the category rules.
*   **Drift Warning:** **Will** likely appear (if you exceed the `switchThreshold`). The extension detects this high frequency of context switching (Work -> Dev -> Work -> Dev -> Work -> Dev...) and flags it as "drifting". Even though the *destinations* are allowed, the *pattern* suggests you're not engaged in deep work on any single task.

**Why is this behavioral monitoring useful?**

*   **Catches "Allowed Distraction":** Sometimes, even allowed sites can be distracting if you bounce between them too much without settling into a task. Think checking work email constantly while trying to code. Both are "Work", but the switching fragments focus.
*   **Early Warning:** It can alert you to focus loss *before* you actually navigate to a disallowed site.
*   **Addresses Multitasking:** It discourages hyperactive multitasking, which is often less productive than focused work.
*   **Handles Edge Cases:** Sometimes, classification might be slightly delayed, or a site might have mixed content. The drift mechanism can catch rapid switching that might occur during these moments.

tldr;

*   **Blocking:** Enforces the *what* (allowed categories).
*   **Drifting:** Monitors the *how* (focused engagement vs. rapid switching).

They work together to provide a more comprehensive focus environment: one that keeps you away from explicitly forbidden zones and also gently reminds you if your activity *within* the allowed zones becomes unfocused.

- **Behavioral Nudge:** The primary warning mechanism is the dismissible overlay in the content script, which aligns perfectly with the idea of a behavioral nudge rather than a hard block.

- **Fallback Blurs the Line:** The fallback redirect to blocked page if the overlay fails does mean the Drift Warning can result in the same outcome as the blocking mechanism. However, this is clearly intended as a fallback to ensure the user is interrupted somehow if the preferred softer warning fails, rather than letting the drift go entirely unnoticed.
