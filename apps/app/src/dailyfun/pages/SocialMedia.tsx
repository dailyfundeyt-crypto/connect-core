
import { Card, CardContent } from '../components/ui/card';
import { ExternalLink, Youtube } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const SocialMedia = () => {
  const { t } = useLanguage();

  const handleChannelClick = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-white text-black">      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black mb-6 font-serif">
            {t('social.title')}
          </h1>
          <p className="text-lg text-gray-700 font-serif mb-8">
            {t('social.description')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* English Channel */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-accent rounded-full flex items-center justify-center mx-auto mb-4">
                  <Youtube className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-black font-serif mb-2">
                  Daily Fun EN
                </h2>
                <p className="text-gray-600 mb-6">
                  {t('social.english.description')}
                </p>
              </div>
              
              <button
                onClick={() => handleChannelClick('https://youtube.com/@dailyfunen?feature=shared')}
                className="w-full bg-red-accent hover:bg-red-accent/90 text-white px-6 py-3 rounded-md font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Youtube className="h-5 w-5" />
                {t('social.visit.channel')}
                <ExternalLink className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>

          {/* German Channel */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-accent rounded-full flex items-center justify-center mx-auto mb-4">
                  <Youtube className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-black font-serif mb-2">
                  Daily Fun DE
                </h2>
                <p className="text-gray-600 mb-6">
                  {t('social.german.description')}
                </p>
              </div>
              
              <button
                onClick={() => handleChannelClick('https://youtube.com/@dailyfunde_official?feature=shared')}
                className="w-full bg-blue-accent hover:bg-blue-accent/90 text-white px-6 py-3 rounded-md font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Youtube className="h-5 w-5" />
                {t('social.visit.channel')}
                <ExternalLink className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
        </div>

        {/* Additional Information */}
        <div className="mt-12 text-center">
          <div className="bg-gradient-to-r from-red-accent/5 to-blue-accent/5 rounded-lg shadow-sm border border-gray-200 p-8">
            <h3 className="text-xl font-bold text-black font-serif mb-4">
              {t('social.stay.connected')}
            </h3>
            <p className="text-gray-700 font-serif">
              {t('social.stay.description')}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SocialMedia;
