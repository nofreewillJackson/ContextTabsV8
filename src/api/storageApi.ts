import { FocusSettings, StorageData as TypesStorageData, FocusState, UrlPatternOverride } from "../types/index";

// Re-export the StorageData interface from types/index.d.ts
export type StorageData = TypesStorageData;

/**
 * Get an object containing the requested keys.
 */
export function getStorage<T extends keyof StorageData>(
  keys: T[]
): Promise<Pick<StorageData, T>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(result as Pick<StorageData, T>);
    });
  });
}

/**
 * Set or update the given keys in storage.
 */
export function setStorage(data: Partial<StorageData>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve();
    });
  });
}

/**
 * Add a context entry to history
 */
export async function addContextToHistory(
  context: string,
  url: string,
  confidence: number
): Promise<void> {
  const { contextHistory } = await getStorage(["contextHistory"]);
  const newHistory = contextHistory || [];
  
  // Add new entry
  newHistory.push({
    context,
    url,
    timestamp: Date.now(),
    confidence
  });
  
  // Limit history size
  if (newHistory.length > 100) {
    newHistory.shift();
  }
  
  await setStorage({ contextHistory: newHistory });
}

/**
 * Get the current focus state
 */
export async function getFocusState(): Promise<FocusState> {
  const { focusState } = await getStorage(["focusState"]);
  
  // Default state if none exists
  const defaultState: FocusState = {
    active: false,
    allowedContexts: []
  };
  
  return { ...defaultState, ...focusState };
}

/**
 * Update the focus state
 */
export async function setFocusState(partialState: Partial<FocusState>): Promise<void> {
  const currentState = await getFocusState();
  await setStorage({ 
    focusState: { ...currentState, ...partialState }
  });
}

/**
 * Get all URL pattern overrides
 */
export async function getUrlPatternOverrides(): Promise<UrlPatternOverride[]> {
  const { urlPatternOverrides = [] } = await getStorage(["urlPatternOverrides"]);
  return urlPatternOverrides;
}

/**
 * Add a new URL pattern override
 */
export async function addUrlPatternOverride(override: Omit<UrlPatternOverride, 'createdAt'>): Promise<void> {
  const overrides = await getUrlPatternOverrides();
  
  const newOverride: UrlPatternOverride = {
    ...override,
    createdAt: Date.now()
  };
  
  // Add the new override and sort by priority (highest first)
  overrides.push(newOverride);
  overrides.sort((a, b) => b.priority - a.priority);
  
  await setStorage({ urlPatternOverrides: overrides });
}

/**
 * Remove a URL pattern override by pattern
 */
export async function removeUrlPatternOverride(pattern: string): Promise<void> {
  const overrides = await getUrlPatternOverrides();
  const filtered = overrides.filter(o => o.pattern !== pattern);
  await setStorage({ urlPatternOverrides: filtered });
}

/**
 * Find a matching URL pattern override for a given URL
 * Returns the highest priority match or null if no match
 */
export async function findMatchingUrlPatternOverride(url: string): Promise<UrlPatternOverride | null> {
  const overrides = await getUrlPatternOverrides();
  
  // Sort by priority (highest first) to ensure we get the highest priority match
  overrides.sort((a, b) => b.priority - a.priority);
  
  for (const override of overrides) {
    if (doesUrlMatchPattern(url, override)) {
      return override;
    }
  }
  
  return null;
}

/**
 * Check if a URL matches a pattern override
 */
function doesUrlMatchPattern(url: string, override: UrlPatternOverride): boolean {
  try {
    const { pattern, matchType } = override;
    
    switch (matchType) {
      case 'exact':
        return url === pattern;
      case 'startsWith':
        // tolerate patterns saved without the scheme
        return (
          url.startsWith(pattern) ||
          url.replace(/^https?:\/\//, '').startsWith(pattern.replace(/^https?:\/\//, ''))
        );
      default:
        console.warn(`Unsupported match type: ${matchType}`);
        return false;
    }
  } catch (e) {
    console.error('Error matching URL pattern:', e);
    return false;
  }
}