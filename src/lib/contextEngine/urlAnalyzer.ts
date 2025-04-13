// Known domain categories
export const DOMAIN_CATEGORIES: Record<string, string> = {
  // Work/Productivity
  "docs.google.com": "Work",
  "sheets.google.com": "Work",
  "slides.google.com": "Work",
  "drive.google.com": "Work",
  "office.com": "Work",
  "microsoft365.com": "Work",
  "linkedin.com": "Work",
  "slack.com": "Work",
  "teams.microsoft.com": "Work",
  "asana.com": "Work",
  "trello.com": "Work",
  "notion.so": "Work",
  "monday.com": "Work",
  "atlassian.com": "Work",
  "jira.com": "Work",
  "basecamp.com": "Work",
  "zoom.us": "Work",
  
  // Learning
  "coursera.org": "Learning",
  "udemy.com": "Learning",
  "edx.org": "Learning",
  "khanacademy.org": "Learning",
  "duolingo.com": "Learning",
  "canvas.instructure.com": "Learning",
  "blackboard.com": "Learning",
  "quizlet.com": "Learning",
  "chegg.com": "Learning",
  "brilliant.org": "Learning",
  "codecademy.com": "Learning",
  "freecodecamp.org": "Learning",
  "lynda.com": "Learning",
  "skillshare.com": "Learning",
  "pluralsight.com": "Learning",
  
  // Entertainment
  "netflix.com": "Entertainment",
  "hulu.com": "Entertainment",
  "disneyplus.com": "Entertainment",
  "hbomax.com": "Entertainment",
  "youtube.com": "Entertainment",
  "twitch.tv": "Entertainment",
  "spotify.com": "Entertainment",
  "pandora.com": "Entertainment",
  "tidal.com": "Entertainment",
  "soundcloud.com": "Entertainment",
  "steam.com": "Entertainment",
  "epicgames.com": "Entertainment",
  "ign.com": "Entertainment",
  "imdb.com": "Entertainment",
  "rottentomatoes.com": "Entertainment",
  
  // News
  "cnn.com": "News",
  "bbc.com": "News",
  "nytimes.com": "News",
  "washingtonpost.com": "News",
  "reuters.com": "News",
  "apnews.com": "News",
  "foxnews.com": "News",
  "nbcnews.com": "News",
  "abcnews.go.com": "News",
  "cbsnews.com": "News",
  "politico.com": "News",
  "economist.com": "News",
  "wsj.com": "News",
  "bloomberg.com": "News",
  "theguardian.com": "News",
  
  // Development
  "github.com": "Development",
  "gitlab.com": "Development",
  "bitbucket.org": "Development",
  "stackoverflow.com": "Development",
  "developer.mozilla.org": "Development",
  "w3schools.com": "Development",
  "codepen.io": "Development",
  "replit.com": "Development",
  "codesandbox.io": "Development",
  "jsfiddle.net": "Development",
  "npmjs.com": "Development",
  "pypi.org": "Development",
  "docker.com": "Development",
  "kubernetes.io": "Development",
  "digitalocean.com": "Development",
  
  // Shopping
  "amazon.com": "Shopping",
  "ebay.com": "Shopping",
  "walmart.com": "Shopping",
  "target.com": "Shopping",
  "bestbuy.com": "Shopping",
  "etsy.com": "Shopping",
  "aliexpress.com": "Shopping",
  "wayfair.com": "Shopping",
  "costco.com": "Shopping",
  "newegg.com": "Shopping",
  "homedepot.com": "Shopping",
  "lowes.com": "Shopping",
  "macys.com": "Shopping",
  "nordstrom.com": "Shopping",
  "zappos.com": "Shopping",
  
  // Social
  "facebook.com": "Social",
  "twitter.com": "Social",
  "instagram.com": "Social",
  "reddit.com": "Social",
  "pinterest.com": "Social",
  "tumblr.com": "Social",
  "tiktok.com": "Social",
  "snapchat.com": "Social",
  "discord.com": "Social",
  "messenger.com": "Social",
  "telegram.org": "Social",
  "whatsapp.com": "Social",
  "signal.org": "Social",
  "medium.com": "Social",
  "quora.com": "Social",
  
  // Research
  "scholar.google.com": "Research",
  "pubmed.ncbi.nlm.nih.gov": "Research",
  "researchgate.net": "Research",
  "academia.edu": "Research",
  "jstor.org": "Research",
  "springer.com": "Research",
  "sciencedirect.com": "Research",
  "ieee.org": "Research",
  "ncbi.nlm.nih.gov": "Research",
  "arxiv.org": "Research",
  "sciencemag.org": "Research",
  "nature.com": "Research",
  "webofknowledge.com": "Research",
  "scopus.com": "Research",
  "mendeley.com": "Research"
};

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error("Error extracting domain:", error);
    return "";
  }
}

/**
 * Get domain category from predefined list
 */
export function getDomainCategory(domain: string): string | undefined {
  // Try exact match
  if (DOMAIN_CATEGORIES[domain]) {
    return DOMAIN_CATEGORIES[domain];
  }
  
  // Try with 'www.' prefix removed
  if (domain.startsWith('www.')) {
    const withoutWww = domain.substring(4);
    if (DOMAIN_CATEGORIES[withoutWww]) {
      return DOMAIN_CATEGORIES[withoutWww];
    }
  }
  
  // Try parent domain
  const parts = domain.split('.');
  if (parts.length > 2) {
    const parentDomain = parts.slice(parts.length - 2).join('.');
    return DOMAIN_CATEGORIES[parentDomain];
  }
  
  return undefined;
}

/**
 * Extract path keywords from URL
 */
export function extractPathKeywords(url: string): string[] {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname
      .split('/')
      .filter(Boolean)
      .flatMap(segment => 
        segment
          .split(/[-_]/)
          .filter(word => word.length > 2)
      );
  } catch (error) {
    console.error("Error extracting path keywords:", error);
    return [];
  }
}

/** If this is a Google (or Bing, DuckDuckGo …) /search page,
 *  look at the query string and guess a context from the terms. */
function guessSearchContext(q: string): string | undefined {
  const query = q.toLowerCase();

  const researchTerms = /(?:research|study|case\s*report|clinical|procedure|surgery|medical|anatomy|pathology|diagnosis|journal|pubmed)/;
  const devTerms      = /(?:api|code|github|stackoverflow|library|npm|python|javascript|typescript)/;
  const newsTerms     = /(?:breaking|headline|election|war|crisis|covid|biden|trump|senate|congress)/;
  const shoppingTerms = /(?:buy|price|review|discount|deal|amazon|walmart|best\s*buy)/;
  const entertainment = /(?:movie|tv|trailer|lyrics|song|album|celebrity|kardashian|netflix|spotify)/;

  if (researchTerms.test(query))      return "Research";
  if (devTerms.test(query))           return "Development";
  if (newsTerms.test(query))          return "News";
  if (shoppingTerms.test(query))      return "Shopping";
  if (entertainment.test(query))      return "Entertainment";
  return undefined;                   // fall back to normal scoring
}

/**
 * Analyze URL for context clues
 */
export function analyzeUrl(url: string): Record<string, number> {
  const domain = extractDomain(url);
  const scores: Record<string, number> = {};

  // ── special‑case search pages ─────────────────────────────────────
  if (/\.google\./.test(domain) && url.includes("/search")) {
    const q = new URL(url).searchParams.get("q") ?? "";
    const guessed = guessSearchContext(q);
    if (guessed) scores[guessed] = 0.9;   // very confident
  }
  
  const domainCategory = getDomainCategory(domain);
  const pathKeywords = extractPathKeywords(url);
  
  // Set base score from domain if not already set by search context
  if (domainCategory && !scores[domainCategory]) {
    scores[domainCategory] = 0.8;
  }
  
  // Add scores from path keywords (could be enhanced with TF-IDF against keywords)
  // This is a simplified implementation
  
  return scores;
}