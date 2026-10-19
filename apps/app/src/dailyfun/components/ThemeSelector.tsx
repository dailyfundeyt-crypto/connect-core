import React from 'react';
import { useTheme } from '@dailyfun/contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@dailyfun/components/ui/card';
import { Palette } from 'lucide-react';

const themes = [
  { id: 'light', name: 'Light Mode', gradient: 'from-white to-gray-100', color: '#FFFFFF' },
  { id: 'dark', name: 'Dark Mode', gradient: 'from-gray-900 to-black', color: '#1A1A1A' },
  { id: 'red', name: 'Passionate Reds', gradient: 'from-red-400 via-red-700 to-black', color: '#FF8080' },
  { id: 'yellow', name: 'Sunny Yellows', gradient: 'from-yellow-300 via-yellow-600 to-black', color: '#FFD700' },
  { id: 'green', name: 'Lush Greens', gradient: 'from-green-300 via-green-600 to-black', color: '#98FB98' },
  { id: 'blue', name: 'Calm Blues', gradient: 'from-blue-300 via-blue-600 to-black', color: '#ADD8E6' },
  { id: 'pink', name: 'Sweet Pinks', gradient: 'from-pink-300 via-pink-600 to-black', color: '#FFC0CB' },
  { id: 'orange', name: 'Orange', gradient: 'from-orange-300 via-orange-600 to-black', color: '#FFA500' },
] as const;

export const ThemeSelector: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <Card className="bg-background border shadow-sm overflow-hidden">
      <CardHeader className="px-4 py-4 sm:px-6 sm:pb-4 border-b bg-muted/30">
        <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <Palette className="w-4 h-4 sm:w-5 sm:h-5" />
          Farbthema
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
        <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
          Wähle ein Farbthema. Farbige Themes zeigen einen schönen Verlauf von hell nach dunkel beim Scrollen.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id as any)}
              className={`
                relative group rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 shadow-md sm:shadow-lg
                ${theme === t.id ? 'ring-2 sm:ring-4 ring-primary ring-offset-2 sm:ring-offset-4 ring-offset-background scale-105 sm:scale-110' : 'hover:scale-105 hover:shadow-lg sm:hover:shadow-xl'}
              `}
            >
              <div className={`w-full h-24 sm:h-32 bg-gradient-to-b ${t.gradient}`} />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent backdrop-blur-sm p-2 sm:p-3">
                <p className="text-white text-xs sm:text-sm font-semibold text-center drop-shadow-lg break-words">{t.name}</p>
              </div>
              {theme === t.id && (
                <div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-primary rounded-full p-1 sm:p-1.5 shadow-lg animate-scale-in">
                  <svg className="w-3 h-3 sm:w-5 sm:h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
