
import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

const LanguageSwitcher = () => {
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <button
      onClick={toggleLanguage}
      className="apple-toggle inline-flex items-center justify-center px-3 py-2.5 min-w-[100px] sm:min-w-[120px] bg-background/80 backdrop-blur-md border-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-xl hover:shadow-primary/25 hover:scale-105 active:scale-95 transition-all duration-300 ease-apple-spring rounded-xl font-medium text-sm whitespace-nowrap"
      aria-label="Toggle language"
    >
      <span className="mr-2 animate-pulse">🌐</span>
      <span className="animate-fade-in">{language === 'en' ? 'EN' : 'DE'}</span>
    </button>
  );
};

export default LanguageSwitcher;
