import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@dailyfun/components/ui/dialog';
import { Input } from '@dailyfun/components/ui/input';
import { Search, Globe, Check } from 'lucide-react';
import { cn } from '@dailyfun/lib/utils';

interface Language {
  code: string;
  name: string;
  nativeName: string;
}

const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
];

interface LanguageSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLanguages: string[];
  onLanguageSelect: (languageCode: string) => void;
  title?: string;
  description?: string;
}

export const LanguageSelectionDialog = ({
  open,
  onOpenChange,
  selectedLanguages,
  onLanguageSelect,
  title = 'Sprache hinzufügen',
  description = 'Wähle eine oder mehrere Sprachen für deinen Artikel',
}: LanguageSelectionDialogProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLanguages = AVAILABLE_LANGUAGES.filter(
    (lang) =>
      lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lang.nativeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lang.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 bg-card border-2 border-border rounded-3xl overflow-hidden shadow-2xl">
        <DialogHeader className="px-8 pt-8 pb-6 border-b border-border bg-muted/30">
          <DialogTitle className="text-2xl font-semibold">{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground mt-2">{description}</p>
          )}
        </DialogHeader>

        {/* Search Bar */}
        <div className="px-8 pt-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Sprache suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 pr-4 py-6 text-base rounded-2xl border-2 bg-background"
            />
          </div>
        </div>

        {/* Language List */}
        <div className="h-[50vh] overflow-y-auto px-8 py-4">
          <div className="space-y-2">
            {filteredLanguages.map((lang) => {
              const isSelected = selectedLanguages.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  onClick={() => onLanguageSelect(lang.code)}
                  className={cn(
                    'w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all duration-200 group',
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-md'
                      : 'border-border bg-card hover:border-primary/30 hover:bg-accent'
                  )}
                >
                  <div className="flex items-center gap-4">
                    <Globe className={cn(
                      'h-5 w-5 transition-colors',
                      isSelected ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                    )} />
                    <div className="text-left">
                      <div className={cn(
                        'font-medium text-base',
                        isSelected ? 'text-primary' : 'text-foreground'
                      )}>
                        {lang.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {lang.nativeName}
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    'px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground group-hover:bg-muted/80'
                  )}>
                    {lang.code.toUpperCase()}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
