import React, { useState, useRef, useEffect } from 'react';
import { X, Mail, Lock, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useToast } from '@dailyfun/hooks/use-toast';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
}

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  isOpen,
  onClose,
  initialEmail = ''
}) => {
  const [step, setStep] = useState<'method' | 'email' | 'code' | 'password' | 'success' | 'security-questions' | 'sq-answers'>('method');
  const [resetMethod, setResetMethod] = useState<'code' | 'security'>('code');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [securityQuestions, setSecurityQuestions] = useState<string[]>([]);
  const [securityAnswers, setSecurityAnswers] = useState<string[]>(['', '', '']);
  const { toast } = useToast();
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === 'code' && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step, timeLeft]);

  useEffect(() => {
    if (isOpen) {
      setEmail(initialEmail);
    }
  }, [isOpen, initialEmail]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSendCode = async () => {
    if (!email) {
      setError('Bitte geben Sie Ihre E-Mail-Adresse ein');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.functions.invoke('send-reset-code', {
        body: { email }
      });

      if (error) throw error;

      toast({
        title: 'Code gesendet!',
        description: 'Bitte überprüfen Sie Ihr E-Mail-Postfach.',
      });

      setStep('code');
      setTimeLeft(300);
    } catch (err: any) {
      setError('Fehler beim Senden des Codes. Bitte versuchen Sie es erneut.');
      toast({
        title: 'Fehler',
        description: 'Der Code konnte nicht gesendet werden.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyCode = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setError('Bitte geben Sie den vollständigen Code ein');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase
        .from('password_reset_codes')
        .select('*')
        .eq('email', email)
        .eq('code', fullCode)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        throw new Error('Ungültiger oder abgelaufener Code');
      }

      setStep('password');
    } catch (err: any) {
      setError('Ungültiger oder abgelaufener Code. Bitte versuchen Sie es erneut.');
      toast({
        title: 'Fehler',
        description: 'Der eingegebene Code ist nicht gültig.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein');
      return;
    }

    if (newPassword.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (resetMethod === 'code') {
        const fullCode = code.join('');
        const { error } = await supabase.functions.invoke('reset-password', {
          body: { email, code: fullCode, newPassword }
        });
        if (error) throw error;
      } else {
        const answers = securityQuestions.map((q, i) => ({
          question: q,
          answer: securityAnswers[i],
        }));
        const { error } = await supabase.functions.invoke('reset-password-by-questions', {
          body: { email, answers, newPassword }
        });
        if (error) throw error;
      }

      setStep('success');
      
      toast({
        title: 'Erfolg!',
        description: 'Ihr Passwort wurde erfolgreich zurückgesetzt.',
      });
      
      setTimeout(() => {
        onClose();
        setStep('method');
        setCode(['', '', '', '', '', '']);
        setNewPassword('');
        setConfirmPassword('');
        setSecurityAnswers(['', '', '']);
      }, 3000);

    } catch (err: any) {
      setError('Fehler beim Zurücksetzen des Passworts. Bitte versuchen Sie es erneut.');
      toast({
        title: 'Fehler',
        description: 'Das Passwort konnte nicht zurückgesetzt werden.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFetchSecurityQuestions = async () => {
    if (!email) {
      setError('Bitte geben Sie Ihre E-Mail-Adresse ein');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('get-security-questions', {
        body: { email }
      });

      if (error) throw error;

      if (data && data.questions) {
        setSecurityQuestions(data.questions);
        setStep('sq-answers');
      } else {
        throw new Error('Keine Sicherheitsfragen gefunden');
      }
    } catch (err: any) {
      setError('Fehler beim Abrufen der Sicherheitsfragen. Bitte versuchen Sie es erneut.');
      toast({
        title: 'Fehler',
        description: 'Die Sicherheitsfragen konnten nicht abgerufen werden.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3">
            {(step !== 'method' && step !== 'success') && (
              <button
                onClick={() => {
                  if (step === 'email' || step === 'security-questions') {
                    setStep('method');
                  } else if (step === 'code') {
                    setStep('email');
                  } else if (step === 'sq-answers') {
                    setStep('security-questions');
                  } else {
                    setStep(resetMethod === 'code' ? 'code' : 'sq-answers');
                  }
                }}
                className="text-white/80 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold text-white">
                {step === 'method' && 'Passwort zurücksetzen'}
                {step === 'email' && 'E-Mail eingeben'}
                {step === 'security-questions' && 'E-Mail eingeben'}
                {step === 'code' && 'Code eingeben'}
                {step === 'sq-answers' && 'Sicherheitsfragen'}
                {step === 'password' && 'Neues Passwort'}
                {step === 'success' && 'Erfolgreich!'}
              </h2>
              <p className="text-white/80 text-sm mt-1">
                {step === 'method' && 'Wähle eine Methode'}
                {step === 'email' && 'Wir senden Ihnen einen Bestätigungscode'}
                {step === 'security-questions' && 'Wir zeigen Ihnen Ihre Sicherheitsfragen'}
                {step === 'code' && 'Geben Sie den 6-stelligen Code ein'}
                {step === 'sq-answers' && 'Beantworte deine Sicherheitsfragen'}
                {step === 'password' && 'Wählen Sie ein neues, sicheres Passwort'}
                {step === 'success' && 'Ihr Passwort wurde aktualisiert'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2 text-sm text-destructive animate-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Method Selection Step */}
          {step === 'method' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Wähle eine Methode zum Zurücksetzen:</p>
              <button
                onClick={() => {
                  setResetMethod('code');
                  setStep('email');
                }}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                Per E-Mail-Code
              </button>
              <button
                onClick={() => {
                  setResetMethod('security');
                  setStep('security-questions');
                }}
                className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium py-3 rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                Per Sicherheitsfragen
              </button>
            </div>
          )}

          {/* Email Step (for code method) */}
          {step === 'email' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  E-Mail-Adresse
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    placeholder="ihre.email@beispiel.de"
                    onKeyPress={(e) => e.key === 'Enter' && handleSendCode()}
                  />
                </div>
              </div>
              <button
                onClick={handleSendCode}
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {loading ? 'Wird gesendet...' : 'Code senden'}
              </button>
            </div>
          )}

          {/* Security Questions Email Step */}
          {step === 'security-questions' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  E-Mail-Adresse
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    placeholder="ihre.email@beispiel.de"
                    onKeyPress={(e) => e.key === 'Enter' && handleFetchSecurityQuestions()}
                  />
                </div>
              </div>
              <button
                onClick={handleFetchSecurityQuestions}
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {loading ? 'Laden...' : 'Sicherheitsfragen abrufen'}
              </button>
            </div>
          )}

          {/* Security Questions Answers Step */}
          {step === 'sq-answers' && (
            <div className="space-y-4">
              {securityQuestions.map((q, idx) => (
                <div key={idx}>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {q}
                  </label>
                  <input
                    type="text"
                    value={securityAnswers[idx]}
                    onChange={(e) => {
                      const newAnswers = [...securityAnswers];
                      newAnswers[idx] = e.target.value;
                      setSecurityAnswers(newAnswers);
                    }}
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    placeholder="Antwort"
                  />
                </div>
              ))}
              <button
                onClick={() => setStep('password')}
                disabled={loading || securityAnswers.some((a) => !a.trim())}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                Weiter
              </button>
            </div>
          )}

          {/* Code Step */}
          {step === 'code' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-sm font-medium text-primary">
                  <span>Code läuft ab in</span>
                  <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
                </div>
              </div>

              <div className="flex justify-center gap-2">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={el => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-12 h-14 text-center text-2xl font-bold bg-background border-2 border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                ))}
              </div>

              <button
                onClick={handleVerifyCode}
                disabled={loading || code.join('').length !== 6}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {loading ? 'Wird überprüft...' : 'Code bestätigen'}
              </button>

              <button
                onClick={handleSendCode}
                disabled={loading || timeLeft > 0}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Code erneut senden
              </button>
            </div>
          )}

          {/* Password Step */}
          {step === 'password' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Neues Passwort
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    placeholder="Mindestens 6 Zeichen"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Passwort bestätigen
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    placeholder="Passwort wiederholen"
                    onKeyPress={(e) => e.key === 'Enter' && handleResetPassword()}
                  />
                </div>
              </div>

              <button
                onClick={handleResetPassword}
                disabled={loading || !newPassword || !confirmPassword}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {loading ? 'Wird gespeichert...' : 'Passwort ändern'}
              </button>
            </div>
          )}

          {/* Success Step */}
          {step === 'success' && (
            <div className="text-center py-8 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full animate-in zoom-in duration-300">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-foreground">Erfolgreich!</h3>
                <p className="text-muted-foreground mt-2">
                  Ihr Passwort wurde erfolgreich zurückgesetzt.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
