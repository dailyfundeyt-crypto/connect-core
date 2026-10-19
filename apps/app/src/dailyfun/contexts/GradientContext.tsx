import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTheme } from './ThemeContext';

interface GradientSettings {
  enabled: boolean;
  startColor: string;
  endColor: string;
  direction: 'vertical' | 'horizontal';
  scrollTriggerPoint: number;
  transitionSpeed: number;
  adjustButtonColors: boolean;
  backgroundImageDesktop?: string;
  backgroundImageMobile?: string;
}

interface GradientContextType {
  settings: GradientSettings;
  updateSettings: (newSettings: Partial<GradientSettings>) => void;
}

const defaultSettings: GradientSettings = {
  enabled: true,
  startColor: '#ADD8E6',
  endColor: '#000000',
  direction: 'vertical',
  scrollTriggerPoint: 50,
  transitionSpeed: 0.8,
  adjustButtonColors: true,
  backgroundImageDesktop: undefined,
  backgroundImageMobile: undefined,
};

const themeColorMap: Record<string, string> = {
  red: '#FF8080',
  yellow: '#FFD700',
  green: '#98FB98',
  blue: '#ADD8E6',
  pink: '#FFC0CB',
  orange: '#FFA500',
  dark: '#1A1A1A',
  light: '#FFFFFF',
};

const GradientContext = createContext<GradientContextType | undefined>(undefined);

export const GradientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const [settings, setSettings] = useState<GradientSettings>(() => {
    try {
      const saved = localStorage.getItem('gradientSettings');
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  // Update gradient start color when theme changes
  useEffect(() => {
    if (theme in themeColorMap) {
      setSettings(prev => ({
        ...prev,
        startColor: themeColorMap[theme],
        enabled: theme !== 'light' && theme !== 'dark',
      }));
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('gradientSettings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    
    if (!settings.enabled) {
      root.style.removeProperty('--gradient-start');
      root.style.removeProperty('--gradient-end');
      root.style.removeProperty('--gradient-direction');
      root.style.removeProperty('--gradient-transition');
      root.classList.remove('scroll-gradient-enabled');
      return;
    }

    root.style.setProperty('--gradient-start', settings.startColor);
    root.style.setProperty('--gradient-end', settings.endColor);
    root.style.setProperty('--gradient-direction', settings.direction);
    root.style.setProperty('--gradient-transition', `${settings.transitionSpeed}s`);
    root.classList.add('scroll-gradient-enabled');

    const handleScroll = () => {
      const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      const opacity = Math.min(scrollPercentage / settings.scrollTriggerPoint, 1);
      root.style.setProperty('--scroll-opacity', opacity.toString());
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial call

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [settings]);

  const updateSettings = (newSettings: Partial<GradientSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <GradientContext.Provider value={{ settings, updateSettings }}>
      {children}
    </GradientContext.Provider>
  );
};

export const useGradient = () => {
  const context = useContext(GradientContext);
  if (context === undefined) {
    throw new Error('useGradient must be used within a GradientProvider');
  }
  return context;
};
