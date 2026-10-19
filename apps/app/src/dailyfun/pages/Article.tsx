import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, Bot } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { getEmployeeByAuthor } from '../data/employees';
import ReactMarkdown from 'react-markdown';
import InstallSidebar from '../components/InstallSidebar';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ArticleShareButton from '../components/ArticleShareButton';
import AuthorFollowButton from '../components/AuthorFollowButton';
import AnimatedParagraph from '../components/AnimatedParagraph';
import { SEO } from '../components/SEO';
import { useLanguage } from '../contexts/LanguageContext';
import { articles } from '../data/articles';
import { incrementViews } from '../utils/viewTracker';
import OptimizedImage from '../components/OptimizedImage';
import { supabase } from '../integrations/supabase/client';
import ArticleComments from '../components/ArticleComments';

// Professional images for article detail pages
import article1Professional from '../assets/article-1-professional.jpg';
import article2Professional from '../assets/article-2-professional.jpg';
import article3Professional from '../assets/article-3-professional.jpg';
import article4Professional from '../assets/article-4-professional.jpg';
import article5Professional from '../assets/article-5-professional.jpg';
import article6Professional from '../assets/article-6-professional.jpg';
import article7Professional from '../assets/article-7-professional.jpg';
import article8Professional from '../assets/article-8-dream.jpg';
import article9Professional from '../assets/article-9-professional.jpg';

const Article = () => {
  const { id } = useParams();
  const article = articles.find(a => a.id === id);
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [viewCount, setViewCount] = useState<number>(0);

  const handleAuthorClick = () => {
    if (article) {
      const employee = getEmployeeByAuthor(article.author);
      if (employee) {
        navigate(`/search?author=${employee.id}`);
      }
    }
  };

  const employee = article ? getEmployeeByAuthor(article.author) : null;

  useEffect(() => {
    // Scroll to top when article loads
    window.scrollTo(0, 0);
    
    if (article) {
      // Increment view count in database for all articles and get updated count
      const incrementAndGetViews = async () => {
        try {
          const { data, error } = await supabase.rpc('increment_article_view_count', { 
            p_article_id: article.id 
          });
          
          if (!error && data !== null) {
            setViewCount(data);
          }
        } catch (error) {
          console.error('Error incrementing views:', error);
        }
      };
      
      incrementAndGetViews();
    }
  }, [article]);

  if (!article) {
    return (
      <div className="min-h-screen bg-white text-black">
        <InstallSidebar />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-black mb-4">{t('article.not.found')}</h1>
            <Link to="/" className="text-red-accent hover:text-blue-accent">
              {t('common.back')}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Get translated title and excerpt
  const translatedTitle = language === 'de' ? article.title : (article.titleEn || article.title);
  const translatedExcerpt = language === 'de' ? article.excerpt : (article.excerptEn || article.excerpt);

  // Get professional image for article detail page
  const getProfessionalImage = (articleId: string) => {
    const imageMap: { [key: string]: string } = {
      '1': article1Professional,
      '2': article2Professional,
      '3': article3Professional,
      '4': article4Professional,
      '5': article5Professional,
      '6': article6Professional,
      '7': article7Professional,
      '8': article8Professional,
      '9': article9Professional,
    };
    return imageMap[articleId] || article.imageUrl;
  };

  const handleAIClick = () => {
    const translatedContent = language === 'de' ? article.content : (article.contentEn || article.content);
    const fullArticleText = `${translatedTitle}\n\n${translatedExcerpt}\n\n${translatedContent}`;
    
    navigate('/ai', {
      state: {
        articleContent: fullArticleText,
        articleTitle: translatedTitle
      }
    });
  };

  const navigateToAI = () => {
    navigate('/ai');
  };

  const handleBack = () => {
    const idx = (window.history.state && (window.history.state as any).idx) ?? 0;
    const canGoBack = idx > 0 || window.history.length > 1;
    const before = window.location.pathname + window.location.search;
    if (canGoBack) {
      navigate(-1);
      // Fallback if history back doesn't trigger (mobile edge cases)
      setTimeout(() => {
        const after = window.location.pathname + window.location.search;
        if (after === before) {
          const from = (location.state as any)?.from as string | undefined;
          if (from) navigate(from, { state: { restoreScroll: true } });
          else navigate('/search', { state: { restoreScroll: true } });
        }
      }, 300);
    } else {
      const from = (location.state as any)?.from as string | undefined;
      if (from) navigate(from, { state: { restoreScroll: true } });
      else navigate('/search', { state: { restoreScroll: true } });
    }
  };

  return (
    <div className="min-h-screen bg-white text-black relative">
      <SEO 
        title={article ? translatedTitle : 'Artikel nicht gefunden'}
        description={article ? translatedExcerpt : 'Der gesuchte Artikel konnte nicht gefunden werden.'}
        canonical={article ? `https://www.daily-fun.org/article/${article.id}` : undefined}
        noindex={!article}
      />
      <InstallSidebar />
      
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-6 relative z-10">
          <button
            onClick={handleBack}
            className="inline-flex items-center text-red-accent hover:text-blue-accent transition-colors bg-transparent border-none cursor-pointer self-start"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </button>
          
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-start sm:justify-end">
            <button
              onClick={handleAIClick}
              className="apple-toggle inline-flex items-center justify-center px-3 py-2.5 min-w-[100px] sm:min-w-[120px] bg-background/80 backdrop-blur-md border-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-xl hover:shadow-primary/25 hover:scale-105 active:scale-95 transition-all duration-300 ease-apple-spring rounded-xl font-medium text-sm whitespace-nowrap"
            >
              <Bot className="h-4 w-4 mr-2" />
              <span>{language === 'de' ? 'Mit AI sprechen' : 'Ask AI'}</span>
            </button>
            <ArticleShareButton 
              articleId={article.id} 
              title={translatedTitle}
              excerpt={translatedExcerpt}
              imageUrl={getProfessionalImage(article.id)}
              category={language === 'de' ? article.category : (article.categoryEn || article.category)}
            />
            <LanguageSwitcher />
          </div>
        </div>

        <article className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden apple-popup-animation">
          <div className="relative">
            <div className="aspect-video bg-gray-100 overflow-hidden">
              {article.id === '10' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/samsung-note7-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === '16' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/missing-person-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === 'google-vs-apple-poop-emoji' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/emoji-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === 'hunger-games-schweinehund' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/hunger-games-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === 'gta-vs-driving-license' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/gta-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === 'doner-paradox' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/doner-paradox-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === 'no-legs-no-excuses' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/no-legs-no-excuses-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === '1' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/whiskers-mayor-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === '8' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/grok-dream-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === '9' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/shutdown-test-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === '2' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/ketchup-recipe-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === '7' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/childhood-2-0-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === '3' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/narnia-phenomenon-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === '4' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/basement-metropolis-video.mp4" type="video/mp4" />
                </video>
                ) : article.id === '5' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/basement-goldmine-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === '6' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                >
                  <source src="/lazy-life-hacks-video.mp4" type="video/mp4" />
                </video>
              ) : article.id === '11' ? (
                <video 
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  style={{ pointerEvents: 'none' }}
                 >
                   <source src="/cat-matrix-video.mp4" type="video/mp4" />
                 </video>
               ) : article.id === 'coffee-superhero' ? (
                 <video 
                   className="w-full h-full object-cover"
                   autoPlay
                   loop
                   muted
                   playsInline
                   disablePictureInPicture
                   style={{ pointerEvents: 'none' }}
                 >
                   <source src="/coffee-superhero-video.mp4" type="video/mp4" />
                 </video>
               ) : (
                <OptimizedImage
                  src={getProfessionalImage(article.id)}
                  alt={translatedTitle}
                  className="w-full h-full object-cover"
                  width={800}
                  height={450}
                  sizes="(max-width: 768px) 100vw, 800px"
                />
              )}
            </div>
            <div className="absolute top-4 left-4">
              <span className="bg-red-accent text-white px-3 py-1 rounded text-sm font-bold">
                {article.category}
              </span>
            </div>
          </div>

          <div className="p-8">
            <h1 className="text-3xl md:text-4xl font-bold text-black mb-6 font-serif leading-tight">
              {translatedTitle}
            </h1>

            <div className="flex items-center justify-between text-sm text-gray-600 mb-8 pb-6 border-b border-gray-200">
              <div className="flex items-center">
                {employee && (
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarImage src={employee.image} alt={employee.name} />
                    <AvatarFallback>{employee.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                <button 
                  onClick={handleAuthorClick}
                  className="font-medium text-gray-800 hover:text-red-accent transition-colors cursor-pointer flex items-center"
                >
                  {article.author}
                </button>
                <AuthorFollowButton authorName={article.author} />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />
                  <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                </div>
                {viewCount > 0 && (
                  <div className="flex items-center text-muted-foreground/80">
                    <span className="text-sm">
                      {viewCount.toLocaleString()} {language === 'de' ? 'Aufrufe' : 'views'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="prose prose-lg max-w-none">
              <div className="particle-container">
                <p className="text-xl text-[#1A1A1A] mb-8 sans-serif italic leading-relaxed glow-text">
                  {translatedExcerpt}
                </p>
                <div className="particles"></div>
              </div>
              
              <div className="text-[#1A1A1A] space-y-6 sans-serif leading-relaxed">
                {article.content ? (
                  // Get the translated content
                  (() => {
                    const content = language === 'de' ? article.content : (article.contentEn || article.content);
                    // Split content into paragraphs but preserve HTML
                    const paragraphs = content.split('\n\n');
                    return paragraphs.map((paragraph, index) => {
                      // Check if paragraph contains HTML img tag
                      if (paragraph.includes('<img')) {
                        // Extract image src and alt from HTML
                        const imgMatch = paragraph.match(/<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/);
                        if (imgMatch) {
                          const [, src, alt] = imgMatch;
                          return (
                            <div key={index} className="mb-6">
                              <OptimizedImage
                                src={src}
                                alt={alt}
                                className="w-full max-w-md mx-auto rounded-lg"
                                width={300}
                                height={200}
                              />
                            </div>
                          );
                        }
                        // Fallback to dangerouslySetInnerHTML if parsing fails
                        return (
                          <div 
                            key={index} 
                            className="mb-6 text-lg leading-relaxed particle-container"
                          >
                            <div dangerouslySetInnerHTML={{ __html: paragraph }} className="glow-text" />
                            <div className="particles"></div>
                          </div>
                        );
                      } else {
                        return (
                          <div key={index} className="mb-6 text-lg leading-relaxed particle-container">
                            <p className="glow-text">
                              {paragraph.replace(/\*\*(.*?)\*\*/g, '$1')}
                            </p>
                            <div className="particles"></div>
                          </div>
                        );
                      }
                    });
                  })()
                ) : (
                  // Fallback to generic content without animation
                  <>
                    <div className="particle-container">
                      <p className="mb-6 text-lg leading-relaxed glow-text">
                        {t('article.content.paragraph1')}
                      </p>
                      <div className="particles"></div>
                    </div>
                    
                    <div className="particle-container">
                      <p className="mb-6 text-lg leading-relaxed glow-text">
                        {t('article.content.paragraph2')}
                      </p>
                      <div className="particles"></div>
                    </div>
                    
                    <div className="particle-container">
                      <p className="mb-6 text-lg leading-relaxed glow-text">
                        {t('article.content.paragraph3')}
                      </p>
                      <div className="particles"></div>
                    </div>
                    
                    <div className="particle-container">
                      <p className="mb-6 text-lg leading-relaxed glow-text">
                        {t('article.content.paragraph4')}
                      </p>
                      <div className="particles"></div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Comments Section */}
          <ArticleComments articleId={article.id} />
        </article>
      </main>
    </div>
  );
};

export default Article;
