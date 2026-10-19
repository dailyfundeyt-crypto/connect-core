import { Home, MessageCircle, Globe, User, Bot } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useState, useCallback, useEffect } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from '@dailyfun/components/ui/sidebar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { language, toggleLanguage } = useLanguage();
  const { user } = useAuth();
  const [logoText, setLogoText] = useState('Fun');
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  // Listen for logo phase changes from animation
  useEffect(() => {
    const handlePhaseChange = (event: CustomEvent) => {
      if (event.detail === 'conect') {
        setLogoText('Connect');
      } else if (event.detail === 'daily-fun') {
        setLogoText('Fun');
      } else if (event.detail === 'phase4' || event.detail === 'phase3' || event.detail === 'phase2') {
        setLogoText('Fun');
      }
    };

    window.addEventListener('logoPhaseChange', handlePhaseChange as EventListener);
    return () => window.removeEventListener('logoPhaseChange', handlePhaseChange as EventListener);
  }, []);

  const toggleLogo = useCallback(() => {
    const newText = logoText === 'Fun' ? 'Connect' : 'Fun';

    if (newText === 'Connect' && !user) {
      setShowAuthDialog(true);
      return;
    }

    setLogoText(newText);
  }, [logoText, user]);

  const handleAuthConfirm = useCallback(() => {
    setShowAuthDialog(false);
    navigate('/auth');
  }, [navigate]);

  const isAdmin = Boolean(user?.user_metadata?.is_admin || (user as any)?.role === 'admin');

  const navigation = [
    { icon: Home, href: '/search', label: language === 'en' ? 'Home' : 'Startseite' },
    { icon: Bot, href: '/ai', label: language === 'en' ? 'AI Chat' : 'AI Chat' },
    { icon: User, href: '/weird', label: language === 'en' ? 'My Page' : 'Meine Seite' },
    { icon: MessageCircle, href: '/messages', label: language === 'en' ? 'Messages' : 'Nachrichten' },
  ];

  const isActive = (href: string) => {
    if (href === '/search') {
      return location.pathname === '/' || location.pathname === '/search';
    }
    return location.pathname === href;
  };

  return (
    <>
      <AlertDialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <AlertDialogContent className="max-w-md bg-background/95 backdrop-blur-xl border shadow-2xl rounded-3xl p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-muted to-background p-8">
            <AlertDialogHeader className="space-y-4">
              <AlertDialogTitle className="text-2xl font-semibold text-center text-foreground tracking-tight">
                Anmeldung erforderlich
              </AlertDialogTitle>
              <AlertDialogDescription className="text-center text-muted-foreground text-base leading-relaxed">
                Sie müssen sich anmelden, um Connect zu nutzen und alle Funktionen freizuschalten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-col gap-2 mt-6">
              <AlertDialogAction
                onClick={handleAuthConfirm}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                Zur Anmeldung
              </AlertDialogAction>
              <AlertDialogCancel className="w-full mt-0 border-0 bg-muted hover:bg-muted/80 text-foreground font-medium py-3 rounded-xl transition-all duration-200">
                Abbrechen
              </AlertDialogCancel>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Sidebar
        className={`!relative !left-auto !right-auto !inset-y-auto !h-full !w-64 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] border-r-0 !flex ${state === 'collapsed' ? '!w-[72px]' : '!w-64'}`}
        collapsible="icon"
      >
        <SidebarContent className="glass-nav rounded-r-2xl pt-6 px-3 border-r border-border/20">
          {/* Fun/Connect Logo */}
          <div className="px-4 mb-6">
            <button
              onClick={toggleLogo}
              className={`text-2xl font-bold text-foreground hover:text-primary transition-all duration-500 cursor-pointer ${logoText === 'Connect' ? 'animate-glow-text' : ''
                }`}
            >
              {state !== 'collapsed' ? logoText : logoText.charAt(0)}
            </button>
          </div>

          <style>{`
            @keyframes glow-text {
              0%, 100% {
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.8), 0 0 20px rgba(220, 220, 220, 0.6);
              }
              50% {
                text-shadow: 0 0 20px rgba(255, 255, 255, 1), 0 0 40px rgba(220, 220, 220, 1), 0 0 60px rgba(255, 255, 255, 0.8);
              }
            }
            
            .animate-glow-text {
              animation: glow-text 2s ease-in-out infinite;
            }
          `}</style>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <NavLink
                        to={item.href}
                        className={`
                        flex items-center gap-3.5 px-4 py-3 rounded-2xl 
                        transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
                        ${active
                            ? 'glass-strong text-primary shadow-lg shadow-primary/10 scale-[1.02]'
                            : 'text-muted-foreground hover:glass hover:text-foreground hover:scale-[1.01]'
                          }
                        active:scale-[0.98]
                      `}
                      >
                        <Icon className={`h-5 w-5 transition-all duration-300 ${active ? 'scale-110' : ''}`} />
                        {state !== 'collapsed' && (
                          <span className="font-medium tracking-tight">{item.label}</span>
                        )}
                      </NavLink>
                    </SidebarMenuItem>
                  );
                })}

                <SidebarMenuItem>
                  <button
                    onClick={toggleLanguage}
                    className="
                    flex items-center gap-3.5 px-4 py-3 rounded-2xl w-full
                    text-muted-foreground transition-all duration-300 
                    ease-[cubic-bezier(0.32,0.72,0,1)]
                    hover:glass hover:text-foreground hover:scale-[1.01]
                    active:scale-[0.98]
                  "
                  >
                    <Globe className="h-5 w-5" />
                    {state !== 'collapsed' && (
                      <span className="font-medium tracking-tight">
                        {language === 'en' ? 'EN - English' : 'DE - Deutsch'}
                      </span>
                    )}
                  </button>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </>
  );
}
