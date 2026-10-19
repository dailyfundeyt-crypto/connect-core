import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useToast } from '@dailyfun/hooks/use-toast';

interface SecurityQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSuccess?: () => void;
}

const AVAILABLE_QUESTIONS = [
  'Was ist der Mädchenname Ihrer Mutter?',
  'Wie heißt Ihr erstes Haustier?',
  'In welcher Stadt wurden Sie geboren?',
  'Was ist Ihr Lieblingsessen?',
  'Wie heißt Ihre Lieblingsband?',
];

export const SecurityQuestionsModal: React.FC<SecurityQuestionsModalProps> = ({
  isOpen,
  onClose,
  userId,
  onSuccess,
}) => {
  const [questions, setQuestions] = useState<{ question: string; answer: string }[]>([
    { question: AVAILABLE_QUESTIONS[0], answer: '' },
    { question: AVAILABLE_QUESTIONS[1], answer: '' },
    { question: AVAILABLE_QUESTIONS[2], answer: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (questions.some((q) => !q.answer.trim())) {
      toast({
        title: 'Fehler',
        description: 'Bitte beantworte alle Fragen',
        variant: 'destructive',
      });
      return;
    }

    // Ensure all three selected questions are distinct
    const selected = questions.map((q) => q.question);
    if (new Set(selected).size !== questions.length) {
      toast({
        title: 'Fehler',
        description: 'Bitte wähle 3 unterschiedliche Fragen',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: 'Nicht eingeloggt',
          description: 'Bitte bestätige zuerst deine E-Mail und logge dich ein, um Sicherheitsfragen zu speichern.',
          variant: 'destructive',
        });
        return;
      }
      const { error } = await supabase.functions.invoke('set-security-questions', {
        body: { questions },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast({
        title: 'Erfolg!',
        description: 'Sicherheitsfragen gespeichert',
      });
      onClose();
      onSuccess?.();
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Fehler',
        description: err.message || 'Speichern fehlgeschlagen',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-foreground">Sicherheitsfragen einrichten</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Wähle 3 Fragen und beantworte sie. Diese werden zum Zurücksetzen des Passworts verwendet.
        </p>
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={idx}>
              <label className="block text-sm font-medium text-foreground mb-1">
                Frage {idx + 1}
              </label>
              <select
                value={q.question}
                onChange={(e) => {
                  const newQ = [...questions];
                  newQ[idx].question = e.target.value;
                  setQuestions(newQ);
                }}
                className="w-full mb-2 px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {AVAILABLE_QUESTIONS.map((aq) => (
                  <option key={aq} value={aq}>
                    {aq}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Antwort"
                value={q.answer}
                onChange={(e) => {
                  const newQ = [...questions];
                  newQ[idx].answer = e.target.value;
                  setQuestions(newQ);
                }}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          ))}
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="mt-6 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-lg transition-all disabled:opacity-50"
        >
          {loading ? 'Speichern...' : 'Sicherheitsfragen speichern'}
        </button>
      </div>
    </div>
  );
};
