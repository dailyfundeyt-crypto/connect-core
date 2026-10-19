import { useState, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { SEO } from '../components/SEO';
import InstallSidebar from '../components/InstallSidebar';
import OptimizedImage from '../components/OptimizedImage';

const AboutUs = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirect authenticated users to Messages page
  useEffect(() => {
    if (user) {
      navigate('/messages');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-white text-black">
      <SEO 
        title={t('about.main.title')}
        description="Erfahren Sie mehr über Daily Fun - Ihr vertrauenswürdiges Portal für Nachrichten, AI und Unterhaltung."
        canonical="https://www.daily-fun.org/about"
      />
      <InstallSidebar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Main Headline */}
        <section className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold text-black mb-6 font-serif">
            {t('about.main.title')}
          </h1>
          <div className="w-32 h-1 bg-gradient-to-r from-red-accent to-blue-accent mx-auto"></div>
        </section>

        {/* Introduction Section */}
        <section className="mb-16">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-lg md:text-xl leading-relaxed text-gray-700 font-serif">
              {t('about.intro')}
            </p>
          </div>
        </section>


        {/* Stefan Kunc's Vision Section */}
        <section className="mb-16">
          <div className="bg-gray-50 rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div className="order-2 lg:order-1">
                <h2 className="text-3xl font-bold text-black font-serif mb-6">{t('about.stefan.vision.title')}</h2>
                <p className="text-lg leading-relaxed text-gray-700 font-serif italic">
                  {t('about.stefan.vision.quote')}
                </p>
              </div>
              <div className="order-1 lg:order-2 flex justify-center">
                <OptimizedImage 
                  src="/lovable-uploads/dd996217-e9c4-456c-af16-469f05791ad2.png" 
                  alt="Stefan Kunc" 
                  className="w-64 h-64 rounded-full object-cover border-4 border-gradient-to-r from-red-accent to-blue-accent shadow-lg"
                  width={256}
                  height={256}
                  sizes="256px"
                />
              </div>
            </div>
          </div>
        </section>

        {/* The Team Behind Daily Fun Section */}
        <section className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-black font-serif mb-4">{t('about.team.behind.title')}</h2>
            <div className="w-32 h-1 bg-gradient-to-r from-red-accent to-blue-accent mx-auto mb-6"></div>
          </div>

          {/* Team Image */}
          <div className="mb-8 flex justify-center">
            <OptimizedImage 
              src="/lovable-uploads/2151975f-6840-4107-86fe-8c20727a7fef.png" 
              alt="Daily Fun Team" 
              className="max-w-full h-auto rounded-lg shadow-lg border border-gray-200"
              sizes="(max-width: 768px) 100vw, 800px"
            />
          </div>

          {/* Team Introduction */}
          <div className="max-w-4xl mx-auto text-center mb-12">
            <p className="text-lg leading-relaxed text-gray-700 font-serif">
              {t('about.team.intro')}
            </p>
          </div>

          {/* Individual Team Members */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Dr. Elke Schneider */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="mb-4 flex justify-center">
                  <OptimizedImage 
                    src="/lovable-uploads/2679b50f-c4f9-40d5-bbce-828296880ba2.png" 
                    alt="Dr. Elke Schneider" 
                    className="w-32 h-32 rounded-full border-4 border-red-accent/20"
                    width={128}
                    height={128}
                    sizes="128px"
                  />
                </div>
                <h3 className="text-xl font-bold text-black font-serif mb-2">{t('about.elke.name')}</h3>
                <p className="text-red-accent font-semibold mb-3">{t('about.elke.role')}</p>
                <p className="text-gray-700 text-sm leading-relaxed">
                  {t('about.elke.desc')}
                </p>
              </CardContent>
            </Card>

            {/* Mr. Karl Bergmann */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="mb-4 flex justify-center">
                  <OptimizedImage 
                    src="/lovable-uploads/afb210bd-6729-403e-857a-9271499984f4.png" 
                    alt="Mr. Karl Bergmann" 
                    className="w-32 h-32 rounded-full border-4 border-blue-accent/20"
                    width={128}
                    height={128}
                    sizes="128px"
                  />
                </div>
                <h3 className="text-xl font-bold text-black font-serif mb-2">{t('about.karl.name')}</h3>
                <p className="text-blue-accent font-semibold mb-3">{t('about.karl.role')}</p>
                <p className="text-gray-700 text-sm leading-relaxed">
                  {t('about.karl.desc')}
                </p>
              </CardContent>
            </Card>

            {/* Mr. Jonas Richter */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="mb-4 flex justify-center">
                  <OptimizedImage 
                    src="/lovable-uploads/3e2b5f3d-bb10-4914-847d-e40fa0928943.png" 
                    alt="Mr. Jonas Richter" 
                    className="w-32 h-32 rounded-full border-4 border-red-accent/20"
                    width={128}
                    height={128}
                    sizes="128px"
                  />
                </div>
                <h3 className="text-xl font-bold text-black font-serif mb-2">{t('about.jonas.name')}</h3>
                <p className="text-red-accent font-semibold mb-3">{t('about.jonas.role')}</p>
                <p className="text-gray-700 text-sm leading-relaxed">
                  {t('about.jonas.desc')}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Our Values Section */}
        <section className="mb-16">
          <div className="bg-gradient-to-r from-red-accent/5 to-blue-accent/5 rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-black font-serif mb-4">{t('about.values.title')}</h2>
              <h3 className="text-xl text-gray-600 font-serif italic">{t('about.values.subtitle')}</h3>
              <div className="w-24 h-1 bg-gradient-to-r from-red-accent to-blue-accent mx-auto mt-4"></div>
            </div>
            <div className="max-w-4xl mx-auto text-center">
              <p className="text-lg leading-relaxed text-gray-700 font-serif">
                {t('about.values.desc')}
              </p>
            </div>
          </div>
        </section>

        {/* Shop Section */}
        <section className="mb-16">
          <div className="bg-gradient-to-br from-red-accent/10 via-purple-500/10 to-blue-accent/10 rounded-xl shadow-lg border border-gray-200 p-8 overflow-hidden relative">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-accent/20 to-blue-accent/20 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-br from-blue-accent/20 to-red-accent/20 rounded-full blur-2xl"></div>
            
            <div className="relative z-10">
              <div className="text-center mb-8">
                <h2 className="text-4xl font-bold text-black font-serif mb-4 flex items-center justify-center gap-3">
                  <span className="text-3xl">🛍️</span>
                  Daily Fun Shop
                </h2>
                <div className="w-32 h-1 bg-gradient-to-r from-red-accent via-purple-500 to-blue-accent mx-auto mb-6"></div>
                <p className="text-xl text-gray-600 font-serif italic max-w-2xl mx-auto leading-relaxed">
                  Entdecken Sie unsere exklusive Kollektion - Humor zum Anfassen!
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-red-accent to-red-accent/80 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                      ✨
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-black mb-2">
                        Exklusive Artikel
                      </h3>
                      <p className="text-gray-600">
                        Einzigartige Produkte, die Sie nur bei uns finden - mit dem unverwechselbaren Daily Fun Humor.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-accent to-blue-accent/80 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                      🎁
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-black mb-2">
                        Perfekte Geschenke
                      </h3>
                      <p className="text-gray-600">
                        Überraschen Sie Ihre Liebsten mit originellen Geschenken, die garantiert für Lächeln sorgen.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-500/80 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                      💝
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-black mb-2">
                        Hochwertige Qualität
                      </h3>
                      <p className="text-gray-600">
                        Alle unsere Produkte werden mit Liebe zum Detail und höchsten Qualitätsstandards hergestellt.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <div className="bg-white rounded-xl p-8 shadow-xl border-2 border-gradient-to-r from-red-accent/20 to-blue-accent/20">
                    <div className="text-6xl mb-4">🛒</div>
                    <h3 className="text-2xl font-bold text-black mb-4 font-serif">
                      Jetzt entdecken!
                    </h3>
                    <p className="text-gray-600 mb-6 leading-relaxed">
                      Tauchen Sie ein in unsere Welt voller humorvoller Überraschungen und finden Sie das perfekte Stück für sich oder Ihre Liebsten.
                    </p>
                    <Link 
                      to="/products"
                      className="inline-flex items-center gap-2 bg-gradient-to-r from-red-accent via-purple-500 to-blue-accent hover:from-red-accent/90 hover:via-purple-500/90 hover:to-blue-accent/90 text-white px-8 py-4 rounded-full font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                    >
                      <span>🛍️</span>
                      Zum Shop
                      <span className="ml-2">→</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Outlook / Call to Action Section */}
        <section className="mb-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-black font-serif mb-6">{t('about.join.title')}</h2>
            <div className="w-32 h-1 bg-gradient-to-r from-red-accent to-blue-accent mx-auto mb-6"></div>
            <div className="max-w-4xl mx-auto">
              <p className="text-lg leading-relaxed text-gray-700 font-serif mb-8">
                {t('about.join.desc')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link 
                  to="/"
                  className="bg-red-accent hover:bg-red-accent/90 text-white px-8 py-3 rounded-md font-semibold transition-colors"
                >
                  {t('about.explore.button')}
                </Link>
                <Link 
                  to="/social-media"
                  className="bg-blue-accent hover:bg-blue-accent/90 text-white px-8 py-3 rounded-md font-semibold transition-colors"
                >
                  {t('about.follow.button')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 text-black py-12 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <h3 className="text-2xl font-bold mb-4 font-serif">Daily Fun</h3>
              <p className="text-gray-600 mb-4 font-serif italic">
                "{t('footer.quote')}"
              </p>
              <p className="text-gray-600 text-sm">
                {t('footer.rights')}
              </p>
            </div>
            
            <div>
              <h4 className="text-lg font-semibold mb-4 text-red-accent">{t('footer.quick')}</h4>
              <ul className="space-y-2 text-gray-600">
                <li><Link to="/about" className="hover:text-black transition-colors">{t('header.about')}</Link></li>
                <li><Link to="/contact" className="hover:text-black transition-colors">{t('common.contact')}</Link></li>
                <li><Link to="/privacy-policy" className="hover:text-black transition-colors">{t('common.privacy')}</Link></li>
                <li><Link to="/terms-of-service" className="hover:text-black transition-colors">{t('common.terms')}</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-lg font-semibold mb-4 text-blue-accent">{t('footer.categories')}</h4>
              <ul className="space-y-2 text-gray-600">
                <li><Link to="/weird" className="hover:text-black transition-colors">{t('header.weird')}</Link></li>
                <li><Link to="/products" className="hover:text-black transition-colors">{t('header.products')}</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AboutUs;