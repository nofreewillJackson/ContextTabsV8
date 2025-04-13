export interface ClassificationFeedback {
  url: string;
  domain: string;
  timestamp: number;
  predictedContext: string;
  correctedContext: string;
  source: string;
}

export interface UrlPatternOverride {
  pattern: string;      // The URL pattern to match (can include path, query, etc.)
  context: string;      // The context to apply if URL matches this pattern
  priority: number;     // Higher priority overrides take precedence (useful for more specific patterns)
  createdAt: number;    // When this override was created
  matchType: 'startsWith' | 'exact';  // How to match the pattern - simplified to reliable options
  description?: string; // Optional user-friendly description of what this override does
}

export interface FocusState {
  active: boolean;
  allowedContexts: string[];
  endTime?: number;
}

export interface PageData {
  url: string;
  title: string;
  fullText: string;
  metaDescription: string;
  metaKeywords: string[];
  domainCategory?: string;
}

export interface ContextResult {
  primaryContext: string;
  confidence: number;
  secondaryContexts: Array<{context: string, confidence: number}>;
  features?: Record<string, number>;
}

export interface ContextSwitch {
  from: string;
  to: string;
  timestamp: number;
  fromUrl: string;
  toUrl: string;
}

export interface FocusStatus {
  isLostFocus: boolean;
  contextSwitches: ContextSwitch[];
  currentStreak: number;
  currentContext: string;
}

export interface ParkedLink {
  url: string;
  title?: string;
  context: string;      // Entertainment, Social, …
  timestamp: number;    // when it was parked
}

export interface FocusSettings {
  enabled: boolean;
  notificationsEnabled: boolean;
  switchThreshold: number;
  timeWindowMinutes: number;
  focusWindowEnabled?: boolean;
}

export interface StorageData {
  extensionEnabled: boolean;
  autoGroupEnabled: boolean;
  focusState: FocusState;
  domainContextMap: Record<string, string>;
  urlPatternOverrides: UrlPatternOverride[];
  classificationFeedbackLog: ClassificationFeedback[];
  contextHistory: Array<{
    context: string;
    url: string;
    timestamp: number;
    confidence: number;
  }>;
  focusSettings?: FocusSettings;
  subUrlOverrides?: Record<string, string>;
  parkedLinks?: ParkedLink[];
  blockedCategories?: string[];
  contextKeywords?: Record<string, Record<string, number>>;
  savedWorkspaces?: Array<{
    name: string;
    tabGroups: Array<{
      groupId: number;
      title: string;
      color: chrome.tabGroups.ColorEnum;
      tabUrls: string[];
    }>;
    timestamp: number;
  }>;
  pathOverrides?: string[]; // Legacy - will be migrated to urlPatternOverrides
} 