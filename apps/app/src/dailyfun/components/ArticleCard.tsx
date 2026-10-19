
import { useState, memo, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { incrementViews } from '../utils/viewTracker';
import { useLanguage } from '../contexts/LanguageContext';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { getEmployeeByAuthor } from '../data/employees';
import OptimizedImage from './OptimizedImage';

interface Article {
  id: string;
  title: string;
  titleEn?: string;
  excerpt: string;
  excerptEn?: string;
  author: string;
  publishedAt: string;
  category: string;
  categoryEn?: string;
  imageUrl: string;
  views: number;
}

interface ArticleCardProps {
  article: Article;
  featured?: boolean;
}

const ArticleCard = memo(({ article, featured = false }: ArticleCardProps) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = useCallback(() => {
    incrementViews(article.id);
  }, [article.id]);

  const handleAuthorClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const employee = getEmployeeByAuthor(article.author);
    if (employee) {
      navigate(`/search?author=${employee.id}`);
    }
  }, [article.author, navigate]);

  const employee = getEmployeeByAuthor(article.author);

  // Get translated title for display
  const translatedTitle = language === 'de' ? article.title : (article.titleEn || article.title);
  
  // Optimize image URL with smaller size for faster loading
  const optimizedImageUrl = article.imageUrl.startsWith('/') 
    ? article.imageUrl 
    : `https://images.unsplash.com/${article.imageUrl}?auto=format&fit=crop&w=600&q=75`;

  return (
    <Link 
      to={`/article/${article.id}`}
      state={{ from: `${location.pathname}${location.search}` }}
      onClick={() => {
        handleClick();
        sessionStorage.setItem(`scroll:${location.pathname}${location.search}`, String(window.scrollY));
      }}
    >
      <article className={`apple-popup-animation glass-card rounded-2xl overflow-hidden cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${featured ? 'md:flex' : ''}`}>
        <div className={`relative overflow-hidden rounded-t-2xl ${featured ? 'md:w-1/2 md:rounded-l-2xl md:rounded-tr-none' : ''}`}>
          <div className="aspect-video bg-muted overflow-hidden">
            <OptimizedImage
              src={article.imageUrl}
              alt={translatedTitle}
              className={`w-full h-full object-cover transform hover:scale-110 transition-all duration-700 ease-apple ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              width={560}
              height={315}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            {!imageLoaded && (
              <div className="absolute inset-0 bg-muted animate-pulse" />
            )}
          </div>
          <div className="absolute top-4 left-4">
            <span className="bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide shadow-lg backdrop-blur-sm">
              {language === 'de' ? article.category : (article.categoryEn || article.category)}
            </span>
          </div>
        </div>
        
        <div className={`p-6 ${featured ? 'md:w-1/2 flex flex-col justify-center' : ''}`}>
          <h3 className={`font-bold text-foreground mb-3 hover:text-primary transition-all duration-300 ease-apple font-serif ${
            featured ? 'text-xl md:text-2xl' : 'text-lg'
          }`}>
            {translatedTitle}
          </h3>
          
          <p className="text-muted-foreground mb-4 line-clamp-3 font-serif leading-relaxed">
            {language === 'de' ? article.excerpt : (article.excerptEn || article.excerpt)}
          </p>
          
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center">
              {employee && (
                <Avatar className="h-6 w-6 mr-2 ring-2 ring-primary/20 transition-all duration-300 ease-apple hover:ring-primary/40">
                  <AvatarImage src={employee.image} alt={employee.name} />
                  <AvatarFallback>{employee.name.charAt(0)}</AvatarFallback>
                </Avatar>
              )}
              <button 
                onClick={handleAuthorClick}
                className="font-medium text-foreground hover:text-primary transition-all duration-300 ease-apple cursor-pointer"
              >
                {article.author}
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
              {article.views > 0 && (
                <span className="text-xs text-muted-foreground/70">
                  {article.views.toLocaleString()} {language === 'de' ? 'Aufrufe' : 'views'}
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
});

ArticleCard.displayName = 'ArticleCard';

export default ArticleCard;
