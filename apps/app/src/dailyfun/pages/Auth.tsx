import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@dailyfun/components/ui/button';
import { Input } from '@dailyfun/components/ui/input';
import { Label } from '@dailyfun/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@dailyfun/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dailyfun/components/ui/tabs';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useToast } from '@dailyfun/hooks/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '@dailyfun/contexts/LanguageContext';
import { PasswordResetModal } from '@dailyfun/components/PasswordResetModal';
import AnimatedLogoTransition from '@dailyfun/components/AnimatedLogoTransition';
import googleLogo from '@dailyfun/assets/google-logo.png';
import dailyFunLogo from '@dailyfun/assets/daily-fun-logo.png';
import { CircleCaptcha } from '@dailyfun/components/CircleCaptcha';
import { SecurityQuestionsModal } from '@dailyfun/components/SecurityQuestionsModal';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [loginAttemptFailed, setLoginAttemptFailed] = useState(false);
  const [isGlimmer, setIsGlimmer] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaPassed, setCaptchaPassed] = useState(false);
  const [showSecurityQuestionsModal, setShowSecurityQuestionsModal] = useState(false);
  const [newUserId, setNewUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    const handlePhaseChange = (event: CustomEvent) => {
      if (event.detail === 'conect') {
        // Trigger glimmer effect for 59 seconds (ends shortly before animation restarts)
        setIsGlimmer(true);
        setTimeout(() => setIsGlimmer(false), 59000); // 59 Sekunden
      } else if (event.detail === 'daily-fun') {
        // Ensure glimmer is off when returning to phase 1
        setIsGlimmer(false);
      }
    };

    window.addEventListener('logoPhaseChange', handlePhaseChange as EventListener);
    return () => window.removeEventListener('logoPhaseChange', handlePhaseChange as EventListener);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate('/');
      }
    };
    checkUser();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginAttemptFailed(false);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoginAttemptFailed(true);
        const desc = error.message === 'Invalid login credentials'
          ? 'Ungültige Zugangsdaten. Bitte Passwort neu setzen oder erneut versuchen.'
          : error.message;
        toast({
          title: t('auth.login.failed'),
          description: desc,
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('auth.login.success'),
          description: t('auth.login.welcome'),
        });
        navigate('/');
      }
    } catch (error) {
      setLoginAttemptFailed(true);
      toast({
        title: t('auth.error'),
        description: t('auth.error.unexpected'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });

      if (error) {
        toast({
          title: t('auth.login.failed'),
          description: error.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('auth.error'),
        description: t('auth.error.unexpected'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!captchaPassed) {
      setShowCaptcha(true);
      return;
    }

    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        toast({
          title: t('auth.signup.failed'),
          description: error.message,
          variant: 'destructive',
        });
      } else {
        if (data?.session && data.user) {
          toast({
            title: t('auth.signup.success'),
            description: 'Registrierung erfolgreich! Richte jetzt deine Sicherheitsfragen ein.',
          });
          setNewUserId(data.user.id);
          setShowSecurityQuestionsModal(true);
        } else {
          toast({
            title: t('auth.signup.success'),
            description: 'Account erstellt! Du kannst dich jetzt einloggen.',
          });
          setActiveTab('login');
        }
      }
    } catch (error) {
      toast({
        title: t('auth.error'),
        description: t('auth.error.unexpected'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCaptchaSuccess = () => {
    setCaptchaPassed(true);
    setShowCaptcha(false);
    toast({
      title: 'Captcha bestanden!',
      description: 'Du kannst dich jetzt registrieren.',
    });
  };

  const handleCaptchaFail = () => {
    setShowCaptcha(false);
    toast({
      title: 'Captcha fehlgeschlagen',
      description: 'Zu viele Fehlversuche. Bitte versuche es später erneut.',
      variant: 'destructive',
    });
  };

  return (
    <>
      <PasswordResetModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        initialEmail={email}
      />
      {showCaptcha && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl p-6 max-w-lg">
            <CircleCaptcha onSuccess={handleCaptchaSuccess} onFail={handleCaptchaFail} />
          </div>
        </div>
      )}
      {newUserId && (
        <SecurityQuestionsModal
          isOpen={showSecurityQuestionsModal}
          onClose={() => {
            setShowSecurityQuestionsModal(false);
            setNewUserId(null);
          }}
          onSuccess={() => {
            navigate('/');
          }}
          userId={newUserId}
        />
      )}
      
      <div className={`min-h-screen flex items-center justify-center p-3 transition-all duration-300 ${
        isGlimmer ? 'bg-black' : 'bg-background'
      }`}>
        <div className="w-full max-w-md">
        {/* Header with Logo */}
        <div className="text-center mb-4">
          <div className="mb-3">
            <AnimatedLogoTransition />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Welcome
          </h1>
          <p className="text-muted-foreground text-sm">
            Sign in or create an account
          </p>
        </div>

        <Card className={`shadow-xl border border-border bg-card transition-all duration-300 ${
          isGlimmer ? 'shadow-[0_0_50px_rgba(255,255,255,0.8)]' : ''
        }`}>
          <CardContent className="pt-4 pb-4 px-6 space-y-4">
            {/* Google Sign In Button */}
            <Button
              type="button"
              variant="outline"
              className="apple-button w-full h-10 bg-background text-foreground border-2 border-border hover:bg-accent rounded-lg font-medium transition-all duration-200 ease-apple active:scale-95"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <img src={googleLogo} alt="Google" className="mr-2 h-4 w-4" />
              <span className="text-sm">Continue with Google</span>
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-card text-foreground font-semibold">Daily Fun / Conect</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Custom Tab Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('login')}
                  className={`apple-button h-9 rounded-lg font-semibold text-sm transition-all duration-200 ease-apple active:scale-95 ${
                    activeTab === 'login'
                      ? 'bg-foreground text-background shadow-lg'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('signup')}
                  className={`apple-button h-9 rounded-lg font-semibold text-sm transition-all duration-200 ease-apple active:scale-95 ${
                    activeTab === 'signup'
                      ? 'bg-foreground text-background shadow-lg'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {/* Login Form */}
              {activeTab === 'login' && (
                <form onSubmit={handleLogin} className="space-y-3 animate-fade-in">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-semibold text-foreground">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10 bg-background border-2 border-border focus:border-foreground rounded-lg transition-all duration-200 text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-semibold text-foreground">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-10 bg-background border-2 border-border focus:border-foreground rounded-lg transition-all duration-200 pr-10 text-sm"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="apple-button w-full h-10 bg-foreground text-background hover:bg-foreground/90 font-semibold text-sm rounded-lg shadow-lg transition-all duration-200 ease-apple active:scale-95 mt-2"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign In
                  </Button>

                  {loginAttemptFailed && (
                    <button
                      type="button"
                      onClick={() => setShowResetModal(true)}
                      className="w-full text-sm text-primary hover:text-primary/80 font-medium transition-colors mt-3 animate-in fade-in slide-in-from-top-2"
                    >
                      Passwort vergessen? Hier zurücksetzen
                    </button>
                  )}
                </form>
              )}

              {/* Sign Up Form */}
              {activeTab === 'signup' && (
                <form onSubmit={handleSignUp} className="space-y-3 animate-fade-in">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email" className="text-xs font-semibold text-foreground">
                      Email
                    </Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10 bg-background border-2 border-border focus:border-foreground rounded-lg transition-all duration-200 text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password" className="text-xs font-semibold text-foreground">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-10 bg-background border-2 border-border focus:border-foreground rounded-lg transition-all duration-200 pr-10 text-sm"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="apple-button w-full h-10 bg-foreground text-background hover:bg-foreground/90 font-semibold text-sm rounded-lg shadow-lg transition-all duration-200 ease-apple active:scale-95 mt-2"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign Up
                  </Button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer text */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Daily Fun © 2025
        </p>
        </div>
      </div>
    </>
  );
};

export default Auth;