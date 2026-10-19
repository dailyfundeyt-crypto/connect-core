
import InstallSidebar from '../components/InstallSidebar';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const Products = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#1A1A1A]">
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

          <h1 className="text-3xl font-bold text-[#1A1A1A] mb-6 font-sans">{t('products.title')}</h1>
          
          <p className="text-[#1A1A1A] mb-8 font-sans">
            {t('products.subtitle')}
          </p>
        </div>

        {/* Products Grid - Flexibel für zukünftige Erweiterungen */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-4xl">
          {/* Einzelnes Produktfeld */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300">
            {/* Quadratischer Bild-Platzhalter */}
            <div className="aspect-square bg-gray-100 overflow-hidden">
              <img
                src="/lovable-uploads/d60c8951-db95-4a1b-bd2e-35466f8bb081.png"
                alt="Turtle with cap and sunglasses"
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Produktinhalt */}
            <div className="p-6">
              <h2 className="text-xl font-bold text-[#1A1A1A] mb-4 font-sans">
                {t('products.not.available')}
              </h2>
              
              {/* Produkt-Details */}
              <ul className="text-[#1A1A1A] mb-4 space-y-2 font-sans">
                <li className="flex items-center">
                  <span className="font-medium">{t('products.category')}</span>
                  <span className="ml-2">{t('products.book')}</span>
                </li>
                <li className="flex items-center">
                  <span className="font-medium">{t('products.topic')}</span>
                  <span className="ml-2">{t('products.facts')}</span>
                </li>
                <li className="flex items-center">
                  <span className="font-medium">{t('products.pages')}</span>
                  <span className="ml-2">200</span>
                </li>
              </ul>
              
              {/* Preis */}
              <div className="text-2xl font-bold text-[#2EEAE0] mb-6 font-sans">
                999 €
              </div>
              
              {/* Button */}
              <a
                href="https://youtube.com/@dailyfunen?feature=shared"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-full bg-[#5E40E3] text-[#FFFFFF] px-6 py-3 rounded-md font-medium hover:shadow-[0_0_15px_rgba(46,234,224,0.5)] transition-all duration-300"
              >
                <span>{t('products.learn.more')}</span>
                <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            </div>
          </div>
        </div>

        {/* Zusätzlicher Info-Bereich */}
        <div className="mt-12 bg-gray-50 rounded-lg p-8 border border-gray-200">
          <h3 className="text-2xl font-bold text-[#1A1A1A] mb-4 font-sans">{t('products.coming.soon')}</h3>
          <p className="text-[#1A1A1A] text-lg font-sans">
            {t('products.coming.desc')}
          </p>
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

export default Products;
