/**
 * Feedback API - Functionality for storing and retrieving user feedback on context classifications
 */

import { getStorage, setStorage, addUrlPatternOverride } from "./storageApi";
import { ClassificationFeedback } from "../types/index";
import { extractDomain } from "../lib/contextEngine/urlAnalyzer";
import { UrlPatternOverride } from "../types/index";

// Multi-purpose domains that should use URL pattern matching rather than domain-wide overrides
const MULTI_PURPOSE_DOMAINS = [
  "google.com", "youtube.com", "reddit.com", "amazon.com", "twitter.com", 
  "facebook.com", "instagram.com", "linkedin.com", "github.com", "medium.com"
];

/**
 * Submit feedback about a classification
 */
export async function submitFeedback(
  url: string,
  predictedContext: string,
  correctedContext: string,
  source: string,
  overrideType?: "domain" | "url-pattern"
): Promise<{ success: boolean, isMultiPurposeDomain?: boolean }> {
  try {
    const domain = extractDomain(url);
    
    // Check if this is a multi-purpose domain
    const isMultiPurposeDomain = MULTI_PURPOSE_DOMAINS.some(
      mpd => domain.includes(mpd)
    );
    
    // If override type isn't explicitly specified and this is a multi-purpose domain
    // only send a feedback event (don't create an override yet)
    if (!overrideType && isMultiPurposeDomain) {
      await chrome.runtime.sendMessage({
        type: "FEEDBACK_SUBMITTED",
        payload: {
          url,
          domain,
          predictedContext,
          correctedContext,
          source,
          skipDomainOverride: true
        }
      });
      
      return { success: true, isMultiPurposeDomain: true };
    }
    
    // If URL pattern override is explicitly requested, create it
    if (overrideType === "url-pattern") {
      // Create a simplified URL pattern based on hostname and pathname only
      try {
        const u = new URL(url);
        let pattern = `${u.origin}${u.pathname}`;
        let matchType: UrlPatternOverride['matchType'] = 'exact';

        if (u.hostname.endsWith('google.com') && u.pathname === '/search') {
          const q = u.searchParams.get('q');
          if (q) {
            // URLSearchParams encodes spaces as "+" – exactly how Chrome emits them
            pattern += `?${new URLSearchParams({ q }).toString()}`;
            // other tracking params (&hl=en, &sourceid=chrome …) may be added later,
            // so use a starts‑with rule instead of exact
            matchType = 'startsWith';
          }
        }
        
        await addUrlPatternOverride({
          pattern,
          context: correctedContext,
          priority: 100,
          matchType,
          description: `Override for ${pattern} (from feedback)`
        });
        
        console.log(`[Feedback] Created URL pattern override: ${pattern} → ${correctedContext}`);
      } catch (err) {
        console.error("[Feedback] Error creating URL pattern:", err);
      }
    }
    
    // Always send the feedback event
    await chrome.runtime.sendMessage({
      type: "FEEDBACK_SUBMITTED",
      payload: {
        url,
        domain,
        predictedContext,
        correctedContext,
        source,
        skipDomainOverride: overrideType === "url-pattern" // Don't update domain map if using pattern
      }
    });
    
    return { success: true, isMultiPurposeDomain };
  } catch (error) {
    console.error("Error submitting feedback:", error);
    return { success: false };
  }
}

/**
 * Get all classification feedback from storage
 * @returns Promise resolving with array of feedback items
 */
export async function getFeedbackHistory(): Promise<ClassificationFeedback[]> {
  const { classificationFeedbackLog = [] } = await getStorage(["classificationFeedbackLog"]);
  return classificationFeedbackLog;
}

/**
 * Clear all feedback history
 * @returns Promise resolving when operation is complete
 */
export async function clearFeedbackHistory(): Promise<void> {
  await setStorage({ classificationFeedbackLog: [] });
}

/**
 * Get a summary of feedback statistics
 * @returns Promise resolving with statistics object
 */
export async function getFeedbackStatistics(): Promise<{
  totalFeedback: number;
  mostCommonCorrections: Array<{
    from: string;
    to: string;
    count: number;
  }>;
  domains: { [domain: string]: number };
  sources: { [source: string]: number };
}> {
  const feedbackItems = await getFeedbackHistory();
  
  // Initialize stats
  const stats = {
    totalFeedback: feedbackItems.length,
    mostCommonCorrections: [] as Array<{ from: string; to: string; count: number }>,
    domains: {} as { [domain: string]: number },
    sources: {} as { [source: string]: number }
  };
  
  // Skip if no feedback
  if (feedbackItems.length === 0) {
    return stats;
  }
  
  // Count occurrences by domain and source
  const corrections: { [key: string]: number } = {};
  
  feedbackItems.forEach(item => {
    // Count domains
    stats.domains[item.domain] = (stats.domains[item.domain] || 0) + 1;
    
    // Count sources
    stats.sources[item.source] = (stats.sources[item.source] || 0) + 1;
    
    // Count corrections (only if they're different)
    if (item.predictedContext !== item.correctedContext) {
      const key = `${item.predictedContext} → ${item.correctedContext}`;
      corrections[key] = (corrections[key] || 0) + 1;
    }
  });
  
  // Sort corrections by count
  stats.mostCommonCorrections = Object.entries(corrections)
    .map(([key, count]) => {
      const [from, to] = key.split(' → ');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5 corrections
  
  return stats;
} 