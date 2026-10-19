
import InstallSidebar from '../components/InstallSidebar';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { useLanguage } from '../contexts/LanguageContext';
import { SEO } from '../components/SEO';

const Contact = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-white text-black">
      <SEO 
        title={t('contact.title')}
        description="Kontaktieren Sie uns bei Daily Fun. Wir freuen uns auf Ihre Nachricht."
        canonical="https://www.daily-fun.org/contact"
      />
      <InstallSidebar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center text-red-accent hover:text-blue-accent mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Link>

          <h1 className="text-3xl font-bold text-black mb-6 font-serif">{t('contact.title')}</h1>
          
          <p className="text-gray-600 mb-8">
            {t('contact.subtitle')}
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="grid gap-6 md:grid-cols-2">
            {/* German Inquiries */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="mb-4">
                  <Mail className="h-12 w-12 text-red-accent mx-auto" />
                </div>
                <h2 className="text-xl font-bold text-black mb-4 font-serif">
                  {t('contact.german')}
                </h2>
                <a 
                  href="mailto:dailyfunde.kontakt@gmail.com"
                  className="text-red-accent hover:text-blue-accent text-lg font-medium transition-colors"
                >
                  dailyfunde.kontakt@gmail.com
                </a>
              </CardContent>
            </Card>

            {/* English Inquiries */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="mb-4">
                  <Mail className="h-12 w-12 text-blue-accent mx-auto" />
                </div>
                <h2 className="text-xl font-bold text-black mb-4 font-serif">
                  {t('contact.english')}
                </h2>
                <a 
                  href="mailto:dailyfunen.contact@gmail.com"
                  className="text-blue-accent hover:text-red-accent text-lg font-medium transition-colors"
                >
                  dailyfunen.contact@gmail.com
                </a>
              </CardContent>
            </Card>
          </div>

          {/* Additional Contact Information */}
          <div className="mt-12 bg-gray-50 rounded-lg p-8 border border-gray-200">
            <h3 className="text-2xl font-bold text-black mb-4 font-serif text-center">{t('contact.love.to.hear')}</h3>
            <p className="text-gray-700 text-center text-lg">
              {t('contact.love.desc')}
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 text-black py-12 border-t border-gray-200 mt-16">
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

export default Contact;
