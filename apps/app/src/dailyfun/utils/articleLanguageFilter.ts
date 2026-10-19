import { Article } from '@dailyfun/data/articles';

/**
 * Checks if an article has content available in a specific language
 */
export const hasLanguageContent = (article: Article, languageCode: string): boolean => {
  if (languageCode === 'de') {
    // German content is in the base fields (title, content, excerpt)
    return !!(article.title && article.content && article.excerpt);
  }
  
  if (languageCode === 'en') {
    // English content is in the *En fields
    return !!(article.titleEn && article.contentEn && article.excerptEn);
  }
  
  // For other languages, we don't have content yet
  return false;
};

/**
 * Filters articles based on enabled languages with priority logic:
 * For unauthenticated users: Show all articles, prefer English if available
 * For authenticated users:
 * 1. Show article if available in primary language
 * 2. If not, show if available in any other enabled language
 * 3. If none match, don't show the article
 * 
 * @param articles - Array of articles to filter
 * @param enabledLanguages - Array of language codes that are enabled
 * @param primaryLanguage - The primary language to prioritize
 * @param isAuthenticated - Whether the user is logged in
 * @returns Filtered array of articles
 */
export const filterArticlesByLanguage = (
  articles: Article[],
  enabledLanguages: string[],
  primaryLanguage: string,
  isAuthenticated: boolean = true
): Article[] => {
  // For unauthenticated users, show all articles (no language filtering)
  if (!isAuthenticated) {
    return articles;
  }

  // If no languages are selected, show all articles (default behavior)
  if (enabledLanguages.length === 0) {
    return articles;
  }

  return articles.filter(article => {
    // First, check if article is available in primary language
    if (hasLanguageContent(article, primaryLanguage)) {
      return true;
    }

    // If not in primary language, check other enabled languages
    const availableInOtherLanguages = enabledLanguages.some(lang => 
      lang !== primaryLanguage && hasLanguageContent(article, lang)
    );

    return availableInOtherLanguages;
  });
};

/**
 * Gets the best available language for an article based on priority
 * For unauthenticated users: Prefer English, fallback to German
 * For authenticated users: Use primary language, fallback to enabled languages
 * 
 * @param article - The article to check
 * @param enabledLanguages - Array of enabled language codes
 * @param primaryLanguage - The primary language to prioritize
 * @param isAuthenticated - Whether the user is logged in
 * @returns The language code to use for display
 */
export const getBestArticleLanguage = (
  article: Article,
  enabledLanguages: string[],
  primaryLanguage: string,
  isAuthenticated: boolean = true
): string => {
  // For unauthenticated users: prefer English, fallback to German
  if (!isAuthenticated) {
    if (hasLanguageContent(article, 'en')) {
      return 'en';
    }
    if (hasLanguageContent(article, 'de')) {
      return 'de';
    }
    return 'en'; // Default fallback
  }

  // First priority: primary language
  if (hasLanguageContent(article, primaryLanguage)) {
    return primaryLanguage;
  }

  // Second priority: any other enabled language
  for (const lang of enabledLanguages) {
    if (lang !== primaryLanguage && hasLanguageContent(article, lang)) {
      return lang;
    }
  }

  // Fallback to primary language (shouldn't happen if filtering is used correctly)
  return primaryLanguage;
};
