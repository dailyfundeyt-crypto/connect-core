
export const incrementViews = (articleId: string): number => {
  const storageKey = 'dailyFun_articleViews';
  
  // Get existing views from localStorage
  const existingViews = localStorage.getItem(storageKey);
  const viewsData = existingViews ? JSON.parse(existingViews) : {};
  
  // Increment view count for this article
  viewsData[articleId] = (viewsData[articleId] || 0) + 1;
  
  // Save back to localStorage
  localStorage.setItem(storageKey, JSON.stringify(viewsData));
  
  return viewsData[articleId];
};

export const getViewCount = (articleId: string): number => {
  const storageKey = 'dailyFun_articleViews';
  const existingViews = localStorage.getItem(storageKey);
  const viewsData = existingViews ? JSON.parse(existingViews) : {};
  
  return viewsData[articleId] || 0;
};

export const getTotalViews = (articleId: string, baseViews: number): number => {
  return baseViews + getViewCount(articleId);
};
