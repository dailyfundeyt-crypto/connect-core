import React, { memo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import OptimizedImage from './OptimizedImage';
import type { Article } from '../data/articles';

interface ArticleSectionProps {
  article: Article;
  index: number;
  language: 'en' | 'de';
}

const ArticleSection: React.FC<ArticleSectionProps> = memo(({ article, index, language }) => {
  const location = useLocation();

  return (
    <Link
      to={`/article/${article.id}`}
      state={{ from: `${location.pathname}${location.search}` }}
      onClick={() => {
        sessionStorage.setItem(`scroll:${location.pathname}${location.search}`, String(window.scrollY));
      }}
      className="block w-full py-16 transition-all duration-300 hover:scale-[1.01]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white/40 dark:bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 md:p-12 transition-all duration-300 hover:shadow-3xl hover:border-white/40">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Article Image/Video - Left side */}
            <div className="order-2 lg:order-1">
              <div className="aspect-video rounded-2xl overflow-hidden shadow-xl">
                {article.videoUrl ? (
                  <video
                    src={article.videoUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover pointer-events-none"
                    disablePictureInPicture
                  />
                ) : (
                  <OptimizedImage
                    src={article.imageUrl}
                    alt={article.title}
                    className="w-full h-full"
                  />
                )}
              </div>
            </div>
            
            {/* Article Content - Right side */}
            <div className="order-1 lg:order-2">
               <h3 className="text-3xl md:text-4xl font-bold mb-4 font-serif text-gray-900 dark:text-gray-100">
                 {language === 'de' ? article.title : (article.titleEn || article.title)}
               </h3>
               <p className="text-lg mb-6 line-clamp-3 text-gray-700 dark:text-gray-200">
                 {language === 'de' ? article.excerpt : (article.excerptEn || article.excerpt)}
               </p>
               <div className="text-sm text-gray-600 dark:text-gray-300">
                 {new Date(article.publishedAt).toLocaleDateString('de-DE')} • {language === 'de' ? article.category : (article.categoryEn || article.category)}
               </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
});

ArticleSection.displayName = 'ArticleSection';

export default ArticleSection;