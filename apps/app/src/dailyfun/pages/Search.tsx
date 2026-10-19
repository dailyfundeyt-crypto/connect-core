
import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import ArticleCard from '../components/ArticleCard';
import InstallSidebar from '../components/InstallSidebar';
import ProfileShareMenu from '../components/ProfileShareMenu';
import { SEO } from '../components/SEO';
import { articles } from '../data/articles';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useFollows } from '../hooks/useFollows';
import { useAutoFollow } from '../hooks/useAutoFollow';
import { useArticleViews } from '../hooks/useArticleViews';
import { employees } from '../data/employees';
import { supabase } from '../integrations/supabase/client';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Search as SearchIcon, User, MapPin, Calendar, Heart } from 'lucide-react';
import { sortBySimilarity, calculateSimilarity } from '../utils/searchSimilarity';
import { sortArticlesByScore } from '../utils/articleScoring';
import { filterArticlesByLanguage } from '../utils/articleLanguageFilter';
import { useArticleComments } from '../hooks/useArticleComments';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  bio: string | null;
  profession: string | null;
  location: string | null;
  description: string | null;
  avatar_url: string | null;
  alias: string | null;
  website: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  followers_count?: number;
  following_count?: number;
  // Note: email is NOT included in public profiles for security reasons
  aiGenerated?: {
    description: string;
    interests: string[];
    funFacts: string[];
    achievements: string[];
  };
}

const Search = () => {
  const [selectedAuthor, setSelectedAuthor] = useState('all');
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{articles: any[], profiles: UserProfile[]}>({articles: [], profiles: []});
  const [isSearching, setIsSearching] = useState(false);
  const [followingStates, setFollowingStates] = useState<Record<string, boolean>>({});
  const [userArticleCounts, setUserArticleCounts] = useState<Record<string, number>>({});
  const { t, language, enabledLanguages, primaryLanguage } = useLanguage();
  const { user } = useAuth();
  const { followedUserIds, followedAuthors, loading: followsLoading, refetchFollows } = useFollows();
  const { DEFAULT_AUTHORS } = useAutoFollow();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Handle URL parameters for author filtering
  useEffect(() => {
    const authorFromUrl = searchParams.get('author');
    if (authorFromUrl && employees.some(emp => emp.id === authorFromUrl)) {
      setSelectedAuthor(authorFromUrl);
      setShowProfileInfo(true);
    }
    // Scroll to top when page loads or author parameter changes
    window.scrollTo(0, 0);
  }, [searchParams]);

  // Restore scroll position when returning with restore flag
  useEffect(() => {
    const shouldRestore = (location.state as any)?.restoreScroll;
    if (shouldRestore) {
      const key = `scroll:${location.pathname}${location.search}`;
      const y = Number(sessionStorage.getItem(key) || '0');
      requestAnimationFrame(() => window.scrollTo(0, y));
      // Clear the state flag
      navigate('.', { replace: true, state: {} });
    }
  }, [location, navigate]);


  // Check follow status for profiles
  useEffect(() => {
    const states: Record<string, boolean> = {};
    userProfiles.forEach(profile => {
      states[profile.user_id] = followedUserIds.includes(profile.user_id);
    });
    setFollowingStates(states);
  }, [followedUserIds, userProfiles]);

  // Handle follow/unfollow
  const handleFollowToggle = async (profileUserId: string) => {
    if (!user) {
      toast.error('Bitte loggen Sie sich ein, um zu folgen');
      return;
    }

    const isCurrentlyFollowing = followingStates[profileUserId];

    try {
      if (isCurrentlyFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('followed_user_id', profileUserId);

        if (error) throw error;
      } else {
        // Follow
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: user.id,
            followed_user_id: profileUserId
          });

        if (error) throw error;
      }

      setFollowingStates(prev => ({
        ...prev,
        [profileUserId]: !isCurrentlyFollowing
      }));

      await refetchFollows();
      
      // Refetch profiles to update follower counts
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, bio, profession, location, description, avatar_url, alias, website, is_public, created_at, updated_at, followers_count, following_count')
        .eq('is_public', true);

      if (!error && data) {
        const validProfiles = data.filter(profile => 
          profile.display_name && profile.display_name.trim() !== ''
        );
        setUserProfiles(validProfiles);
      }

      toast.success(isCurrentlyFollowing ? 'Nicht mehr gefolgt' : 'Gefolgt!');
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error('Fehler beim Folgen');
    }
  };

  // Search functionality
  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults({articles: [], profiles: []});
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    
    try {
      // Search articles
      const searchTerms = query.toLowerCase().split(' ');
      
      // First apply language filter (pass user authentication status)
      const languageFilteredArticles = filterArticlesByLanguage(articles, enabledLanguages, primaryLanguage, !!user);
      
      const matchingArticles = languageFilteredArticles.filter(article => {
        const title = (language === 'de' ? article.title : (article.titleEn || article.title)).toLowerCase();
        const content = (language === 'de' ? article.content : (article.contentEn || article.content)).toLowerCase();
        const author = article.author.toLowerCase();
        const category = (language === 'de' ? article.category : (article.categoryEn || article.category)).toLowerCase();
        
        return searchTerms.some(term => 
          title.includes(term) || 
          content.includes(term) || 
          author.includes(term) ||
          category.includes(term)
        );
      });

      // Fetch engagement data for matching articles
      const articleIds = matchingArticles.map(a => a.id);
      
      // Fetch view counts
      const { data: viewData } = await supabase
        .from('article_views')
        .select('article_id, view_count')
        .in('article_id', articleIds);
      
      // Fetch comment counts
      const { data: commentData } = await supabase
        .from('article_comments')
        .select('article_id')
        .in('article_id', articleIds);
      
      // Build engagement maps
      const viewMap = new Map<string, number>();
      viewData?.forEach(item => viewMap.set(item.article_id, item.view_count));
      
      const commentMap = new Map<string, number>();
      commentData?.forEach(comment => {
        commentMap.set(comment.article_id, (commentMap.get(comment.article_id) || 0) + 1);
      });

      // Calculate relevance scores for each article
      const relevanceScores = new Map<string, number>();
      matchingArticles.forEach(article => {
        const title = language === 'de' ? article.title : (article.titleEn || article.title);
        relevanceScores.set(article.id, calculateSimilarity(title, query));
      });

      // Add engagement data to articles
      const articlesWithEngagement = matchingArticles.map(article => ({
        ...article,
        viewCount: viewMap.get(article.id) || 0,
        commentCount: commentMap.get(article.id) || 0,
      }));

      // Sort by combined score (relevance + engagement + recency)
      const sortedArticles = sortArticlesByScore(articlesWithEngagement, {
        relevanceScores,
        prioritizeRecency: false,
      });

      // Search user profiles
      const matchingProfiles = userProfiles.filter(profile => {
        const displayName = (profile.display_name || '').toLowerCase();
        const bio = (profile.bio || '').toLowerCase();
        const profession = (profile.profession || '').toLowerCase();
        const location = (profile.location || '').toLowerCase();
        const description = (profile.description || '').toLowerCase();
        const alias = (profile.alias || '').toLowerCase();
        
        return searchTerms.some(term => 
          displayName.includes(term) || 
          bio.includes(term) || 
          profession.includes(term) ||
          location.includes(term) ||
          description.includes(term) ||
          alias.includes(term)
        );
      });

      // Sort profiles by similarity to search query (prioritize display_name)
      const sortedProfiles = sortBySimilarity(
        matchingProfiles,
        query,
        (profile) => profile.display_name || ''
      );

      // Generate AI info for profiles if they don't have much info
      const profilesWithAI = await Promise.all(
        sortedProfiles.map(async (profile) => {
          if (!profile.description || profile.description.length < 50) {
            try {
              const response = await supabase.functions.invoke('generate-user-info', {
                body: {
                  userName: profile.display_name,
                  userBio: profile.bio,
                  userProfession: profile.profession,
                  userLocation: profile.location
                }
              });

              if (response.data?.success && response.data?.data) {
                return {
                  ...profile,
                  aiGenerated: response.data.data
                };
              }
            } catch (error) {
              console.error('Error generating AI info for profile:', error);
            }
          }
          return profile;
        })
      );

      setSearchResults({
        articles: sortedArticles,
        profiles: profilesWithAI
      });
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search input changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, userProfiles, language]);
  useEffect(() => {
    const fetchUserProfiles = async () => {
      try {
        // Use direct query with specific field selection (including follower counts)
        const { data, error } = await supabase
          .from('profiles')
          .select('id, user_id, display_name, bio, profession, location, description, avatar_url, alias, website, is_public, created_at, updated_at, followers_count, following_count')
          .eq('is_public', true);

        if (error) throw error;
        
        // Filter out profiles without a display name on the client side
        const validProfiles = (data || []).filter(profile => 
          profile.display_name && profile.display_name.trim() !== ''
        );
        setUserProfiles(validProfiles);

        // Fetch article counts for each user profile
        const counts: Record<string, number> = {};
        await Promise.all(
          validProfiles.map(async (profile) => {
            const { count, error: countError } = await supabase
              .from('user_articles')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', profile.user_id)
              .eq('is_published', true);
            
            if (!countError) {
              counts[profile.user_id] = count || 0;
            }
          })
        );
        setUserArticleCounts(counts);
      } catch (error) {
        console.error('Error fetching user profiles:', error);
      }
    };

    fetchUserProfiles();
  }, []);

  const filteredArticles = useMemo(() => {
    let filtered = articles;

    // Apply language filter with priority logic (pass user authentication status)
    filtered = filterArticlesByLanguage(filtered, enabledLanguages, primaryLanguage, !!user);

    // For authenticated users: filter by followed authors
    // For unauthenticated users: show all articles
    if (user) {
      if (followedAuthors.length > 0) {
        filtered = filtered.filter(article => 
          followedAuthors.includes(article.author)
        );
      } else if (followedAuthors.length === 0 && followedUserIds.length === 0) {
        // If user has no followed authors yet, show nothing until auto-follow completes
        filtered = [];
      }
    }
    // else: user is not logged in, show all articles (no filtering by author)

    if (selectedAuthor !== 'all') {
      const authorMapping = {
        stefan: 'Stefan Kunc',
        elke: 'Dr. Elke Schneider',
        karl: 'Karl Bergmann',
        jonas: 'Jonas Richter',
      } as const;

      let authorName: string | undefined;

      if (authorMapping[selectedAuthor as keyof typeof authorMapping]) {
        authorName = authorMapping[selectedAuthor as keyof typeof authorMapping];
      } else {
        const prof = userProfiles.find(p => p.user_id === selectedAuthor);
        authorName = prof?.display_name || undefined;
      }

      if (authorName) {
        const [first, last] = authorName.split(' ');
        filtered = filtered.filter(article => 
          article.author === authorName || 
          (first ? article.author.includes(first) : false) ||
          (last ? article.author.includes(last) : false)
        );
      }
    }

    return filtered;
  }, [selectedAuthor, user, followedAuthors, followedUserIds, userProfiles, enabledLanguages, primaryLanguage]);

  // Fetch view counts and comment counts for all articles
  const articleIds = useMemo(() => filteredArticles.map(a => a.id), [filteredArticles]);
  const { viewCounts } = useArticleViews(articleIds);
  const { commentCounts } = useArticleComments(articleIds);

  // Merge view counts and comment counts with articles and apply intelligent sorting
  const articlesWithEngagement = useMemo(() => {
    const withEngagement = filteredArticles.map(article => ({
      ...article,
      views: viewCounts[article.id] || 0,
      viewCount: viewCounts[article.id] || 0,
      commentCount: commentCounts[article.id] || 0
    }));

    // Use intelligent sorting: recency + engagement
    return sortArticlesByScore(withEngagement, {
      strictRecency: true, // Use strict hour-based sorting for All Categories
    });
  }, [filteredArticles, viewCounts, commentCounts]);


  const handleEmployeeClick = (employeeId: string) => {
    setSelectedAuthor(employeeId);
    setShowProfileInfo(true);
  };

  const handleAllClick = () => {
    setSelectedAuthor('all');
    setShowProfileInfo(false);
  };

  // Get employee or user info for profile display
  const getEmployeeInfo = (employeeId: string) => {
    // Check if it's an employee first
    const employee = employees.find(emp => emp.id === employeeId);
    if (employee) {

    const getDescription = (id: string) => {
      switch (id) {
        case 'stefan':
          return t('about.stefan.vision.quote');
        case 'elke':
          return t('about.elke.desc');
        case 'karl':
          return t('about.karl.desc');
        case 'jonas':
          return t('about.jonas.desc');
        default:
          return '';
      }
    };

    const getRole = (id: string) => {
      switch (id) {
        case 'stefan':
          return t('about.founder.title');
        case 'elke':
          return t('about.elke.role');
        case 'karl':
          return t('about.karl.role');
        case 'jonas':
          return t('about.jonas.role');
        default:
          return '';
      }
    };

      return {
        ...employee,
        description: getDescription(employeeId),
        role: getRole(employeeId),
        location: undefined,
        bio: undefined,
        website: undefined,
        created_at: undefined,
        alias: undefined
      };
    }

    // Check if it's a user profile
    const userProfile = userProfiles.find(profile => profile.user_id === employeeId);
    
    if (userProfile) {
      return {
        id: userProfile.user_id,
        name: userProfile.display_name || 'User',
        image: userProfile.avatar_url || '',
        description: userProfile.description || '',
        role: userProfile.profession || 'Community Member',
        location: userProfile.location,
        bio: userProfile.bio,
        website: userProfile.website,
        created_at: userProfile.created_at,
        alias: userProfile.alias
      };
    }

    return null;
  };

  const currentEmployeeInfo = selectedAuthor !== 'all' ? getEmployeeInfo(selectedAuthor) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO 
        title="Daily Fun - Neuigkeiten, AI & Unterhaltung"
        description="Ihre Quelle für aktuelle Nachrichten, AI-Insights und unterhaltsame Inhalte. Bleiben Sie informiert und unterhalten mit unseren kuratierten Artikeln."
        canonical="https://www.daily-fun.org/"
      />
      <InstallSidebar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Input */}
        <div className="mb-8">
          <div className="relative max-w-md mx-auto">
            <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('search.placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-full bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        {/* Search Results */}
        {searchQuery.trim() && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Suchergebnisse für "{searchQuery}"
            </h2>
            
            {isSearching ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-2">Suche läuft...</p>
              </div>
            ) : (
              <>
                {/* User Profile Results */}
                {searchResults.profiles.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
                      <User className="h-5 w-5 mr-2" />
                      Benutzerprofile ({searchResults.profiles.length})
                    </h3>
                    <div className="grid grid-cols-1 gap-8">
                      {searchResults.profiles.map((profile) => (
                        <div
                          key={profile.user_id}
                          className="bg-card border border-border rounded-lg p-8"
                        >
                          {/* Profile Section - matching Profile.tsx design */}
                          <div className="text-center mb-6">
                            {/* Avatar */}
                            <div className="flex justify-center mb-6">
                              <Avatar className="w-24 h-24 ring-4 ring-muted">
                                <AvatarImage src={profile.avatar_url || ''} />
                                <AvatarFallback className="bg-muted text-muted-foreground text-3xl font-bold">
                                  {(profile.display_name || 'U').charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            </div>

                            {/* Stats Row */}
                            <div className="flex items-center justify-center gap-8 mb-6">
                              <div className="text-center">
                                <div className="text-2xl font-bold text-foreground">
                                  {userArticleCounts[profile.user_id] || 0}
                                </div>
                                <div className="text-sm text-muted-foreground">Artikel</div>
                              </div>
                              
                              <div className="text-center">
                                <div className="text-2xl font-bold text-foreground">
                                  {profile.followers_count || 0}
                                </div>
                                <div className="text-sm text-muted-foreground">Follower</div>
                              </div>
                              
                              {profile.location && (
                                <div className="flex items-center gap-2 text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                                  <MapPin className="h-4 w-4" />
                                  <span className="text-sm">{profile.location}</span>
                                </div>
                              )}
                            </div>
                            
                            {/* Name */}
                            <h2 className="text-xl font-bold text-foreground mb-2">
                              {profile.display_name || 'Unbekannter Nutzer'}
                            </h2>
                            
                            {/* Profession as Link */}
                            {profile.profession && (
                              <div className="mb-3">
                                <a 
                                  href={profile.website || '#'} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-red-500 hover:underline font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {profile.profession}
                                </a>
                              </div>
                            )}
                            
                            {/* Bio */}
                            {profile.bio && (
                              <p className="text-foreground/80 mb-4 max-w-md mx-auto">
                                {profile.bio}
                              </p>
                            )}
                            
                            {/* Website Link */}
                            {profile.website && (
                              <div className="mb-4">
                                <a 
                                  href={profile.website} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-blue-500 hover:underline text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Website besuchen
                                </a>
                              </div>
                            )}
                            
                            {/* View Profile Button */}
                            <div className="flex items-center justify-center gap-4">
                              <Link 
                                to={`/profile/${profile.user_id}`}
                                className="inline-block"
                              >
                                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6 py-2">
                                  Profil ansehen
                                </Button>
                              </Link>

                              {user && user.id !== profile.user_id && (
                                <Button 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleFollowToggle(profile.user_id);
                                  }}
                                  className={`rounded-full px-6 py-2 ${
                                    followingStates[profile.user_id]
                                      ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                                      : 'bg-background text-foreground border border-border hover:bg-muted'
                                  }`}
                                >
                                  <Heart className={`h-4 w-4 mr-2 ${followingStates[profile.user_id] ? 'fill-current' : ''}`} />
                                  {followingStates[profile.user_id] ? 'Gefolgt' : 'Folgen'}
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Description Section (if available) */}
                          {profile.description && (
                            <div className="mt-6 p-6 bg-muted/50 rounded-lg">
                              <h4 className="text-lg font-semibold text-foreground mb-3">Über mich</h4>
                              <p className="text-foreground/80 leading-relaxed">{profile.description}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Article Results */}
                {searchResults.articles.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-foreground mb-4">
                      Artikel ({searchResults.articles.length})
                    </h3>
                    <div className="space-y-4">
                      {searchResults.articles.map((article) => (
                        <Link
                          key={article.id}
                          to={`/article/${article.id}`}
                          className="block bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex space-x-4">
                            <img
                              src={article.imageUrl.startsWith('/') ? article.imageUrl : `https://images.unsplash.com/${article.imageUrl}?auto=format&fit=crop&w=200&q=75`}
                              alt={language === 'de' ? article.title : (article.titleEn || article.title)}
                              className="w-20 h-20 object-cover rounded"
                            />
                            <div className="flex-1">
                              <h4 className="font-semibold text-foreground mb-1">
                                {language === 'de' ? article.title : (article.titleEn || article.title)}
                              </h4>
                              <p className="text-sm text-muted-foreground mb-2">
                                {language === 'de' ? article.excerpt : (article.excerptEn || article.excerpt)}
                              </p>
                              <div className="text-xs text-muted-foreground">
                                {article.author} • {new Date(article.publishedAt).toLocaleDateString('de-DE')} • {article.viewCount || 0} Aufrufe
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Results */}
                {searchResults.profiles.length === 0 && searchResults.articles.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Keine Ergebnisse für "{searchQuery}" gefunden.</p>
                    <p className="text-sm text-muted-foreground/70 mt-2">
                      Versuchen Sie andere Suchbegriffe oder schauen Sie sich die verfügbaren Profile an.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Only show profile section when not searching */}
        {!searchQuery.trim() && (
          <>
        {/* Employee Profiles Section */}
        <div className="mb-8 lg:mb-12">
          <div className="flex items-start space-x-4 sm:space-x-6 lg:space-x-8 mb-6 lg:mb-8 overflow-x-auto pb-2 px-4 sm:px-6 lg:justify-center" style={{scrollSnapType: 'x mandatory'}}>
            {/* All Articles Profile */}
            <div 
              className="flex flex-col items-center cursor-pointer group flex-shrink-0"
              onClick={handleAllClick}
            >
              <div className={`w-16 h-16 sm:w-18 sm:h-18 lg:w-20 lg:h-20 rounded-full border-4 flex items-center justify-center text-lg sm:text-xl lg:text-2xl font-bold transition-all ${
                selectedAuthor === 'all' 
                  ? 'border-red-accent bg-red-accent text-white' 
                  : 'border-gray-300 bg-gray-100 text-gray-600 group-hover:border-red-accent/50'
              }`}>
                ALL
              </div>
              <span className="text-xs sm:text-sm font-medium mt-2 text-center max-w-16 sm:max-w-20">{t('search.all')}</span>
            </div>

            {/* Employee Profiles - Always show default authors */}
            {employees.map((employee) => {
              // Map employee names to match follow system
              const authorMapping = {
                'stefan': 'Stefan Kunc',
                'elke': 'Dr. Elke Schneider',
                'karl': 'Karl Bergmann',
                'jonas': 'Jonas Richter'
              };
              const authorName = authorMapping[employee.id];
              const isFollowed = followedAuthors.includes(authorName);
              
              // Always show these default authors
              
              return (
                <div key={employee.id} className="flex flex-col items-center group flex-shrink-0 relative">
                  <div 
                    className="cursor-pointer"
                    onClick={() => handleEmployeeClick(employee.id)}
                  >
                    <div className={`w-16 h-16 sm:w-18 sm:h-18 lg:w-20 lg:h-20 rounded-full border-4 overflow-hidden transition-all ${
                      selectedAuthor === employee.id 
                        ? 'border-red-accent' 
                        : 'border-gray-300 group-hover:border-red-accent/50'
                    }`}>
                      <img 
                        src={employee.image} 
                        alt={employee.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-medium mt-2 text-center max-w-20 sm:max-w-24 leading-tight block break-words line-clamp-2">
                      {employee.name}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* User Profiles - Only show if user is logged in and followed */}
            {user && userProfiles.map((profile) => {
              const isFollowed = followedUserIds.includes(profile.user_id);
              
              // Only show followed profiles for logged-in users
              if (!isFollowed) return null;
              
              return (
                <div key={profile.user_id} className="flex flex-col items-center group flex-shrink-0 relative">
                  <div 
                    className="cursor-pointer"
                    onClick={() => handleEmployeeClick(profile.user_id)}
                  >
                    <div className={`w-16 h-16 sm:w-18 sm:h-18 lg:w-20 lg:h-20 rounded-full border-4 flex items-center justify-center bg-gray-100 overflow-hidden transition-all ${
                      selectedAuthor === profile.user_id 
                        ? 'border-red-accent' 
                        : 'border-gray-300 group-hover:border-red-accent/50'
                    }`}>
                      {profile.avatar_url ? (
                        <img 
                          src={profile.avatar_url} 
                          alt={profile.display_name || 'User'} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-bold text-gray-600">
                          {profile.display_name?.charAt(0)?.toUpperCase() || 'U'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs sm:text-sm font-medium mt-2 text-center max-w-20 sm:max-w-24 leading-tight block break-words line-clamp-2">
                      {profile.display_name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Profile Info Section */}
        {showProfileInfo && currentEmployeeInfo && (
          <div className="relative mb-8 bg-white mx-auto max-w-2xl">
            {/* Share Menu positioned in top right corner */}
            <div className="absolute top-4 right-4">
              <ProfileShareMenu 
                profileName={currentEmployeeInfo.name}
                profileId={currentEmployeeInfo.id}
              />
            </div>

            {/* Profile Section - matching Profile.tsx design exactly */}
            <div className="text-center pt-8 pb-4">
              {/* Avatar */}
              <div className="flex justify-center mb-6">
                <Avatar className="w-24 h-24 ring-4 ring-gray-100">
                  <AvatarImage src={currentEmployeeInfo.image || ''} />
                  <AvatarFallback className="bg-gray-300 text-gray-600 text-3xl font-bold">
                    {currentEmployeeInfo.name?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Stats Row */}
              <div className="flex items-center justify-center gap-8 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-black">
                    {(() => {
                      // Check if it's a user profile or employee
                      const profile = userProfiles.find(p => p.user_id === currentEmployeeInfo.id);
                      if (profile) {
                        // For user profiles, show actual published article count from database
                        return userArticleCounts[currentEmployeeInfo.id] || 0;
                      } else {
                        // For employees, show filtered articles count
                        return filteredArticles.length;
                      }
                    })()}
                  </div>
                  <div className="text-sm text-gray-600">Artikel</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-black">
                    {(() => {
                      const profile = userProfiles.find(p => p.user_id === currentEmployeeInfo.id);
                      return profile?.followers_count || 0;
                    })()}
                  </div>
                  <div className="text-sm text-gray-600">Follower</div>
                </div>
                
                {currentEmployeeInfo.location && (
                  <div className="flex items-center gap-2 text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm">{currentEmployeeInfo.location}</span>
                  </div>
                )}
              </div>
              
              {/* Name */}
              <h2 className="text-xl font-bold text-black mb-1">
                {currentEmployeeInfo.name}
              </h2>
              
              {/* Alias */}
              {currentEmployeeInfo.alias && (
                <p className="text-gray-500 text-sm mb-2">
                  @{currentEmployeeInfo.alias}
                </p>
              )}
              
              {/* Profession as Link */}
              {currentEmployeeInfo.role && (
                <div className="mb-3">
                  {currentEmployeeInfo.website ? (
                    <a 
                      href={currentEmployeeInfo.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-red-500 hover:underline font-medium"
                    >
                      {currentEmployeeInfo.role}
                    </a>
                  ) : (
                    <p className="text-gray-700 font-medium">
                      {currentEmployeeInfo.role}
                    </p>
                  )}
                </div>
              )}
              
              {/* Bio */}
              {currentEmployeeInfo.bio && (
                <p className="text-gray-700 mb-4 max-w-md mx-auto">
                  {currentEmployeeInfo.bio}
                </p>
              )}
              
              {/* Website Link */}
              {currentEmployeeInfo.website && (
                <div className="mb-4">
                  <a 
                    href={currentEmployeeInfo.website} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-500 hover:underline text-sm"
                  >
                    Website besuchen
                  </a>
                </div>
              )}
              
              {/* Join Date */}
              {currentEmployeeInfo.created_at && (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-4">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Mitglied seit {new Date(currentEmployeeInfo.created_at).toLocaleDateString('de-DE', { 
                      day: 'numeric', 
                      month: 'numeric', 
                      year: 'numeric' 
                    })}
                  </span>
                </div>
              )}

              {/* Follow Button - only for user profiles, not employees */}
              {user && currentEmployeeInfo.id && !employees.find(emp => emp.id === currentEmployeeInfo.id) && user.id !== currentEmployeeInfo.id && (
                <Button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleFollowToggle(currentEmployeeInfo.id);
                  }}
                  className={`rounded-full px-6 py-2 mb-6 ${
                    followingStates[currentEmployeeInfo.id]
                      ? 'bg-black text-white hover:bg-gray-800' 
                      : 'bg-white text-black border border-black hover:bg-gray-50'
                  }`}
                >
                  <Heart className={`h-4 w-4 mr-2 ${followingStates[currentEmployeeInfo.id] ? 'fill-current' : ''}`} />
                  {followingStates[currentEmployeeInfo.id] ? 'Gefolgt' : 'Folgen'}
                </Button>
              )}
            </div>

            {/* Description Section - moved to bottom if available */}
            {currentEmployeeInfo.description && (
              <div className="p-6 bg-gray-50 rounded-lg mx-4 mb-4">
                <p className="text-gray-700 leading-relaxed">
                  {currentEmployeeInfo.description}
                </p>
              </div>
            )}
          </div>
        )}



        {/* Articles Grid with alternating backgrounds */}
        <div className="space-y-0">
          {articlesWithEngagement.map((article, index) => (
            <Link
              key={article.id}
              to={`/article/${article.id}`}
              state={{ from: `${location.pathname}${location.search}` }}
              onClick={() => {
                sessionStorage.setItem(`scroll:${location.pathname}${location.search}`, String(window.scrollY));
              }}
              className={`block w-full py-16 transition-all duration-300 hover:scale-[1.02] ${
                index % 2 === 0 ? 'bg-white' : 'bg-[#5E40E3]'
              }`}
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                  {/* Article Image - Left side */}
                  <div className="order-2 lg:order-1">
                    <div className="aspect-video rounded-lg overflow-hidden shadow-lg bg-gray-200">
                      <img
                        src={article.imageUrl.startsWith('/') ? article.imageUrl : `https://images.unsplash.com/${article.imageUrl}?auto=format&fit=crop&w=600&q=75`}
                        alt={language === 'de' ? article.title : (article.titleEn || article.title)}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Article Content - Right side */}
                  <div className={`order-1 lg:order-2 ${
                    index % 2 === 0 ? 'text-[#1A1A1A]' : 'text-[#FFFFFF]'
                  }`}>
                    <h3 className="text-3xl md:text-4xl font-bold mb-4 font-serif">
                      {language === 'de' ? article.title : (article.titleEn || article.title)}
                    </h3>
                    <p className="text-lg mb-6 opacity-90 line-clamp-3">
                      {language === 'de' ? article.excerpt : (article.excerptEn || article.excerpt)}
                    </p>
                    <div className="flex items-center justify-between text-sm opacity-75">
                      <span>
                        {new Date(article.publishedAt).toLocaleDateString('de-DE')} • {language === 'de' ? article.category : (article.categoryEn || article.category)}
                      </span>
                      {article.views > 0 && (
                        <span className="ml-4">
                          {article.views.toLocaleString()} {language === 'de' ? 'Aufrufe' : 'views'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {articlesWithEngagement.length === 0 && (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-black mb-2">{t('search.no.results')}</h3>
            <p className="text-gray-600">
              {selectedAuthor !== 'all' 
                ? `${t('search.no.author.articles')} ${employees.find(emp => emp.id === selectedAuthor)?.name}.`
                : t('search.no.articles.available')
              }
            </p>
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
};

export default Search;
