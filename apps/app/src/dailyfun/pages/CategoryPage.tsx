
import { useMemo, useEffect, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ArticleCard from '../components/ArticleCard';
import InstallSidebar from '../components/InstallSidebar';
import { articles } from '../data/articles';
import { Card, CardContent } from '../components/ui/card';
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from '../components/ui/pagination';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useArticleViews } from '../hooks/useArticleViews';
import { useArticleComments } from '../hooks/useArticleComments';
import { sortArticlesByScore } from '../utils/articleScoring';
import { filterArticlesByLanguage } from '../utils/articleLanguageFilter';
import OptimizedImage from '../components/OptimizedImage';

const CategoryPage = () => {
  const { category } = useParams();
  const [currentPage, setCurrentPage] = useState(1);
  const articlesPerPage = 6;
  const { t, language, enabledLanguages, primaryLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // For the /weird route, we want to show "Weird News" category
  // Map URL paths to actual category names
  const categoryMap: { [key: string]: string } = {
    'comedy': 'Comedy',
    'pets': 'Pets & Animals',
    'food': 'Food & Recipes',
    'travel': 'Travel Adventures',
    'weird': 'Weird News'
  };

  // Handle both parameterized routes and the hardcoded /weird route
  const categoryName = category ? categoryMap[category] : 'Weird News';

  const filteredArticles = useMemo(() => {
    if (!categoryName) return [];
    
    // First filter by category
    const categoryFiltered = articles.filter(article => article.category === categoryName);
    
    // Then apply language filter with priority logic (pass user authentication status)
    return filterArticlesByLanguage(categoryFiltered, enabledLanguages, primaryLanguage, !!user);
  }, [categoryName, enabledLanguages, primaryLanguage, user]);

  // Fetch engagement data
  const articleIds = useMemo(() => filteredArticles.map(a => a.id), [filteredArticles]);
  const { viewCounts } = useArticleViews(articleIds);
  const { commentCounts } = useArticleComments(articleIds);

  // Merge engagement data and sort by intelligent algorithm
  const sortedArticles = useMemo(() => {
    const articlesWithEngagement = filteredArticles.map(article => ({
      ...article,
      viewCount: viewCounts[article.id] || 0,
      commentCount: commentCounts[article.id] || 0,
    }));

    // Sort by: hour first (newest), then engagement within same hour
    return sortArticlesByScore(articlesWithEngagement, {
      strictRecency: true,
    });
  }, [filteredArticles, viewCounts, commentCounts]);

  // Pagination logic
  const totalPages = Math.ceil(sortedArticles.length / articlesPerPage);
  const startIndex = (currentPage - 1) * articlesPerPage;
  const paginatedArticles = sortedArticles.slice(startIndex, startIndex + articlesPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Restore scroll when returning from article via fallback navigation
  useEffect(() => {
    const shouldRestore = (location.state as any)?.restoreScroll;
    if (shouldRestore) {
      const key = `scroll:${location.pathname}${location.search}`;
      const y = Number(sessionStorage.getItem(key) || '0');
      requestAnimationFrame(() => window.scrollTo(0, y));
      navigate('.', { replace: true, state: {} });
    }
  }, [location, navigate]);
  if (!categoryName) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] text-[#1A1A1A]">
        <InstallSidebar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#1A1A1A] mb-4 font-sans">{t('category.not.found')}</h1>
            <Link to="/" className="text-[#5E40E3] hover:text-[#2EEAE0] transition-colors">
              {t('category.return')}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#1A1A1A]">
      <InstallSidebar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center text-[#5E40E3] hover:text-[#2EEAE0] mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('category.back')}
          </Link>

          <h1 className="text-3xl font-bold text-[#1A1A1A] mb-6 font-sans">{categoryName}</h1>
          
          <p className="text-[#1A1A1A] mb-6 font-sans">
            {sortedArticles.length} {t('category.articles')}
          </p>
        </div>

        {/* Articles List - Same style as homepage */}
        <div className="space-y-0">
          {paginatedArticles.map((article, index) => (
            <Link
              key={article.id}
              to={`/article/${article.id}`}
              state={{ from: `${location.pathname}${location.search}` }}
              onClick={() => {
                sessionStorage.setItem(`scroll:${location.pathname}${location.search}`, String(window.scrollY));
              }}
              className={`block w-full py-16 transition-all duration-300 hover:scale-[1.02] ${
                index % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#5E40E3]'
              }`}
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                  {/* Article Image - Left side */}
                  <div className="order-2 lg:order-1">
                    <div className="aspect-video rounded-lg overflow-hidden shadow-lg">
                      <OptimizedImage
                        src={article.imageUrl}
                        alt={language === 'de' ? article.title : (article.titleEn || article.title)}
                        className="w-full h-full object-cover"
                        width={560}
                        height={315}
                        sizes="(max-width: 1024px) 100vw, 50vw"
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
                    <div className="text-sm opacity-75">
                      {new Date(article.publishedAt).toLocaleDateString('de-DE')} • {language === 'de' ? article.category : (article.categoryEn || article.category)}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {sortedArticles.length === 0 && (
          <Card className="mx-auto max-w-md">
            <CardContent className="text-center py-12">
              <h3 className="text-lg font-medium text-[#1A1A1A] mb-2 font-sans">{t('category.no.articles')}</h3>
              <p className="text-[#1A1A1A] font-sans">{t('category.no.articles.desc')} {categoryName} category.</p>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-12 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage > 1) handlePageChange(currentPage - 1);
                    }}
                    className={currentPage <= 1 ? "opacity-50 pointer-events-none" : ""}
                  />
                </PaginationItem>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        handlePageChange(page);
                      }}
                      isActive={currentPage === page}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                
                <PaginationItem>
                  <PaginationNext 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage < totalPages) handlePageChange(currentPage + 1);
                    }}
                    className={currentPage >= totalPages ? "opacity-50 pointer-events-none" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </main>
    </div>
  );
};

export default CategoryPage;
