// Levenshtein distance algorithm for string similarity
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len1][len2];
}

// Calculate similarity score (0-1, where 1 is perfect match)
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Perfect match
  if (s1 === s2) return 1;
  
  // Calculate Levenshtein distance
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  
  // Convert distance to similarity score (0-1)
  return 1 - (distance / maxLength);
}

// Check if string starts with query (case insensitive)
export function startsWithQuery(text: string, query: string): boolean {
  return text.toLowerCase().startsWith(query.toLowerCase());
}

// Sort items by similarity to query
export function sortBySimilarity<T>(
  items: T[],
  query: string,
  getSearchableText: (item: T) => string
): T[] {
  const scoredItems = items.map(item => {
    const text = getSearchableText(item);
    const startsWithMatch = startsWithQuery(text, query);
    const similarity = calculateSimilarity(text, query);
    
    // Boost score for items that start with the query
    const finalScore = startsWithMatch ? similarity + 2 : similarity;
    
    return { item, score: finalScore };
  });

  // Sort by score (highest first)
  scoredItems.sort((a, b) => b.score - a.score);
  
  return scoredItems.map(({ item }) => item);
}
