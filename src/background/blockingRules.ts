/**
 * Declarative Net Request rules for efficient content blocking
 */
import { getFocusState, getUrlPatternOverrides } from "../api/storageApi";
import { UrlPatternOverride } from "../types/index";

// Constants
const RULE_ID_OFFSET = 100;
const MAX_DNR_RULES = 5000;
const BLOCKED_PAGE_URL = chrome.runtime.getURL("blocked.html");

/**
 * Apply allowed contexts as declarative blocking rules
 * 
 * This function takes the current allowed contexts and creates dynamic DNR rules
 * to block all requests to domains that are categorized outside those contexts.
 */
export async function applyAllowedContexts(): Promise<void> {
  try {
    // Get the current focus state
    const focusState = await getFocusState();
    
    // If focus is not active, remove all rules
    if (!focusState.active) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: await getCurrentRuleIds()
      });
      return;
    }
    
    // Get domains classified by context
    const { domainContextMap } = await chrome.storage.local.get('domainContextMap') as { 
      domainContextMap: Record<string, string> 
    };
    
    if (!domainContextMap) {
      console.warn("No domain context map found, cannot create blocking rules");
      return;
    }
    
    // Group domains by context
    const domainsByContext: Record<string, string[]> = {};
    for (const [domain, context] of Object.entries(domainContextMap)) {
      if (!domainsByContext[context]) {
        domainsByContext[context] = [];
      }
      domainsByContext[context].push(domain);
    }
    
    // Create rules for each blocked context
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    const blockedContexts = getAllKnownContexts().filter(
      ctx => !focusState.allowedContexts.includes(ctx)
    );
    
    let ruleId = RULE_ID_OFFSET;
    
    // ──────────────────────────────────────────────────────────────
    // STEP 0 – allow rules for URL‑pattern overrides that map to an
    //          *allowed* context. These rules stop the redirect loop.
    // ──────────────────────────────────────────────────────────────
    const PRIORITY_ALLOW = 1000;   // highest wins

    try {
      const urlPatternOverrides = await getUrlPatternOverrides();

      for (const ov of urlPatternOverrides) {
        if (!focusState.allowedContexts.includes(ov.context)) continue; // only if allowed

        const urlFilter = createDnrUrlFilter(ov);
        if (!urlFilter) continue;

        rules.push({
          id: ruleId++,
          priority: PRIORITY_ALLOW,
          action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
          condition: {
            urlFilter,
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME]
          }
        });
      }
    } catch (err) {
      console.error("[DNR] Error adding allow‑rules:", err);
    }
    
    // 1. First add domain-level rules (lower priority)
    const MULTI_PURPOSE = ["google.com","youtube.com","reddit.com","amazon.com",
                           "twitter.com","facebook.com","instagram.com","linkedin.com",
                           "github.com","medium.com"];

    for (const context of blockedContexts) {
      const domains = (domainsByContext[context] || [])
        .filter(d => !MULTI_PURPOSE.some(mpd => d.endsWith(mpd)));
      
      // Skip if no domains in this context
      if (domains.length === 0) continue;
      
      // Add a rule for this context
      rules.push({
        id: ruleId++,
        priority: 1, // Lower priority than URL pattern rules
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: { url: BLOCKED_PAGE_URL }
        },
        condition: {
          requestDomains: domains,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
          // Exclude all extensions and localhost from blocking
          excludedInitiatorDomains: ['localhost', 'chrome-extension'],
          // Only apply to new navigations, not history navigations
          domainType: chrome.declarativeNetRequest.DomainType.FIRST_PARTY
        }
      });
      
      // DNR has a rule limit, so break if we hit it
      if (rules.length >= MAX_DNR_RULES) {
        console.warn(`Hit DNR rule limit of ${MAX_DNR_RULES}`);
        break;
      }
    }
    
    // 2. Now add URL pattern override rules (higher priority)
    try {
      const urlPatternOverrides = await getUrlPatternOverrides();
      
      // Filter to only include patterns for blocked contexts
      const blockedPatterns = urlPatternOverrides.filter(
        pattern => blockedContexts.includes(pattern.context)
      );
      
      console.log(`[DNR] Processing ${blockedPatterns.length} URL pattern overrides for blocked contexts`);
      
      for (const pattern of blockedPatterns) {
        // Convert the pattern to a RegExp pattern suitable for DNR's urlFilter
        const urlFilter = createDnrUrlFilter(pattern);
        
        if (!urlFilter) {
          console.warn(`[DNR] Could not create valid URL filter for pattern: ${pattern.pattern}`);
          continue;
        }
        
        rules.push({
          id: ruleId++,
          priority: 2, // Higher priority than domain-level rules
          action: { 
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT, 
            redirect: { url: BLOCKED_PAGE_URL } 
          },
          condition: {
            urlFilter,
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME]
          }
        });
        
        // DNR has a rule limit, so break if we hit it
        if (rules.length >= MAX_DNR_RULES) {
          console.warn(`Hit DNR rule limit of ${MAX_DNR_RULES}`);
          break;
        }
      }
    } catch (error) {
      console.error("[DNR] Error processing URL pattern overrides:", error);
    }
    
    // 3. Add legacy path-level overrides if any exist
    try {
      const { pathOverrides = [] } = await chrome.storage.local.get('pathOverrides') as { 
        pathOverrides: string[] 
      };
      
      // Add each path override as a separate rule
      for (const overridePath of pathOverrides) {
        rules.push({
          id: ruleId++,
          priority: 2, // Higher priority than domain rules
          action: { 
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT, 
            redirect: { url: BLOCKED_PAGE_URL } 
          },
          condition: {
            urlFilter: `|${overridePath}|`,
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME]
          }
        });
        
        // DNR has a rule limit, so break if we hit it
        if (rules.length >= MAX_DNR_RULES) {
          console.warn(`Hit DNR rule limit of ${MAX_DNR_RULES}`);
          break;
        }
      }
    } catch (error) {
      console.error("[DNR] Error processing legacy path overrides:", error);
    }
    
    // Apply the rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: await getCurrentRuleIds(),
      addRules: rules
    });
    
    console.log(`[DNR] Applied ${rules.length} blocking rules for ${blockedContexts.length} contexts`);
  } catch (error) {
    console.error("Error applying DNR rules:", error);
  }
}

/**
 * Convert a URL pattern override to a DNR urlFilter
 */
function createDnrUrlFilter(pattern: UrlPatternOverride): string | null {
  try {
    switch (pattern.matchType) {
      case 'exact':
        return `|${pattern.pattern}|`;
      
      case 'startsWith':
        return `|${pattern.pattern}`;
      
      default:
        console.warn(`[DNR] Unsupported match type: ${pattern.matchType}`);
        return null;
    }
  } catch (error) {
    console.error(`[DNR] Error creating URL filter for pattern: ${pattern.pattern}`, error);
    return null;
  }
}

/**
 * Get current active rule IDs
 */
async function getCurrentRuleIds(): Promise<number[]> {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  return rules.map(rule => rule.id);
}

/**
 * Get all known context categories
 */
function getAllKnownContexts(): string[] {
  return [
    "Work", "Development", "Research", "Learning", 
    "Entertainment", "Social", "Shopping", "News"
  ];
} 