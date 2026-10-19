import React, { useState, useRef, useEffect } from 'react';
import { Send, Home, Globe, Search, X, ArrowLeft, QrCode, MessageCircle, Copy, Download, ChevronDown, Brain, Mic, Image as ImageIcon, Newspaper, Calendar, Clock, CalendarDays } from 'lucide-react';
import { Button } from '@dailyfun/components/ui/button';
import { Input } from '@dailyfun/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@dailyfun/components/ui/dropdown-menu';
import { SEO } from '@dailyfun/components/SEO';
import { useLanguage } from '@dailyfun/contexts/LanguageContext';
import { articles } from '@dailyfun/data/articles';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import { useToast } from '@dailyfun/hooks/use-toast';
import { supabase } from '@dailyfun/integrations/supabase/client';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  feedback?: 'positive' | 'negative' | null;
  qrCode?: string;
  articleSearch?: boolean;
  showQRGenerator?: boolean;
  quizData?: {
    question: string;
    answers: string[];
    correctAnswer: string;
    explanation: string;
    selectedAnswer?: string;
    showResults?: boolean;
    topic?: string;
    originalSource?: string;
    quizCount?: number;
    sourceType?: 'local' | 'internet' | 'article';
  };
  endConversationAvailable?: boolean;
  isSelected?: boolean;
  showSummaryButton?: boolean;
  showQuizButton?: boolean;
  showPdfDownloadButton?: boolean;
  quizCount?: number; // Add quizCount to Message interface for multi-question quizzes
}

interface ActionCard {
  id: 'summarize-info' | 'information-quiz';
  titleDe: string;
  titleEn: string;
  icon: React.ComponentType<any>;
  promptDe: string;
  promptEn: string;
}

const actionCards: ActionCard[] = [
  {
    id: 'summarize-info',
    titleDe: 'Informationen zusammenfassen',
    titleEn: 'Summarize information',
    icon: MessageCircle,
    promptDe: 'Ich kann Ihnen dabei helfen, Informationen aus unserem Gespräch zusammenzufassen. Wählen Sie die Nachrichten aus, die Sie zusammenfassen möchten, und ich erstelle eine übersichtliche Zusammenfassung für Sie.',
    promptEn: 'I can help you summarize information from our conversation. Select the messages you want to summarize, and I\'ll create a clear summary for you.'
  },
  {
    id: 'information-quiz',
    titleDe: 'Informations-Quiz',
    titleEn: 'Information Quiz',
    icon: Brain,
    promptDe: 'Ich kann ein Quiz basierend auf den Informationen aus unserem Gespräch erstellen. Wählen Sie die Nachrichten aus, die Sie für das Quiz verwenden möchten, und ich erstelle interessante Fragen dazu.',
    promptEn: 'I can create a quiz based on information from our conversation. Select the messages you want to use for the quiz, and I\'ll create interesting questions about them.'
  }
];

// Create enhanced article database with sources and detailed info
const createArticleDatabase = () => {
  const database: { [key: string]: { sources: string[], detailedInfo: string } } = {};
  
  articles.forEach(article => {
    database[article.title] = {
      sources: [
        `${article.author} - ${new Date(article.publishedAt).toLocaleDateString()}`,
        `Daily Fun ${article.category} Section`,
        `Article Views: ${article.views.toLocaleString()}`
      ],
      detailedInfo: `${article.excerpt} This article has been viewed ${article.views.toLocaleString()} times and belongs to our ${article.category} category. Published by ${article.author}, it represents the quality journalism that Daily Fun is known for.`
    };
  });
  
  return database;
};

// Company and team information database
const createCompanyDatabase = () => {
  return {
    contact: {
      german: 'dailyfunde.kontakt@gmail.com',
      english: 'dailyfunen.contact@gmail.com'
    },
    company: {
      name: 'Daily Fun',
      mission: 'Your daily dose of trustworthy entertainment and absurd insights, proving that staying informed can actually be a blast!',
      vision: 'Daily Fun steps in to change the overwhelming nature of news. We master the balance between serious reporting and genuine entertainment value.',
      values: ['Trust', 'Humor', 'Innovation', 'Curiosity', 'Never boring']
    },
    founder: {
      name: 'Stefan Kunc',
      role: 'Founder & Vision Leader',
      vision: 'I launched Daily Fun because I firmly believe that information doesn\'t have to be dry and tedious. My goal was to create a platform that masters the balance between serious reporting and genuine entertainment value – with a passionate and dedicated team.'
    },
    team: [
      {
        name: 'Dr. Elke Schneider',
        role: 'Head of Humour & Creativity',
        type: 'AI',
        description: 'Elke is our master of good vibes. With her sharp mind and unparalleled wit, she ensures that every article and every video has that typical Daily Fun charm.'
      },
      {
        name: 'Mr. Karl Bergmann', 
        role: 'Lead Story Weaver',
        type: 'AI',
        description: 'Karl is our fact-checker and storyteller all in one. He dives deep into subjects, packaging even complex topics into understandable, captivating, and often astonishing narratives.'
      },
      {
        name: 'Mr. Jonas Richter',
        role: 'Content Alchemist', 
        type: 'AI',
        description: 'Jonas transforms ideas into visual magic. Whether it\'s designing our videos or preparing infographics – he makes sure our content is not only funny but also visually impressive.'
      }
    ]
  };
};

const SUGGESTIONS = {
  de: [
    'Zeig mir alle Artikel',
    'Finde Artikel über Humor',
    'Find Pages about Technologie',
    'Wer ist Stefan Kunc?',
    'Wie kann ich euch kontaktieren?',
    'Was ist die Mission von Daily Fun?',
  ],
  en: [
    'Show me all articles',
    'Find articles about humor',
    'Find Pages about Technology',
    'Who is Stefan Kunc?',
    'How can I contact you?',
    "What is Daily Fun's mission?",
  ]
} as const;

const QUIZ_SUGGESTIONS = {
  de: [
    'Katzen Quiz',
    'Hunde Quiz',
    'Random Quiz',
    'Quiz über Geschichte',
    'Quiz über Wissenschaft',
    'Quiz über Sport',
    'Quiz über Filme',
    'Quiz über Musik'
  ],
  en: [
    'Cat Quiz',
    'Dog Quiz',
    'Random Quiz',
    'History Quiz',
    'Science Quiz',
    'Sports Quiz',
    'Movie Quiz',
    'Music Quiz'
  ]
} as const;

const AI = () => {
  const { language, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const articleDatabase = createArticleDatabase();
  const companyDatabase = createCompanyDatabase();
  const { toast } = useToast();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [searchMode, setSearchMode] = useState<'local' | 'internet'>('internet');
  
  // News Intelligence States
  const [newsTimeframe, setNewsTimeframe] = useState<'today' | 'week' | 'month'>('today');
  const [currentArticleContent, setCurrentArticleContent] = useState<string>('');
  const [currentArticleSource, setCurrentArticleSource] = useState<string>('');
  const [isInDetailMode, setIsInDetailMode] = useState(false);
  
  // News Intelligence Functions
  const cycleTimeframe = () => {
    const timeframes: ('today' | 'week' | 'month')[] = ['today', 'week', 'month'];
    const currentIndex = timeframes.indexOf(newsTimeframe);
    const nextIndex = (currentIndex + 1) % timeframes.length;
    const newTimeframe = timeframes[nextIndex];
    setNewsTimeframe(newTimeframe);
    
    // Set predefined input text based on timeframe
    const predefinedTexts = {
      today: language === 'de' ? 'Was ist heute passiert?' : 'What happened today?',
      week: language === 'de' ? 'Was ist diese Woche passiert?' : 'What happened this week?',
      month: language === 'de' ? 'Was ist diesen Monat passiert?' : 'What happened this month?'
    };
    
    setInputValue(predefinedTexts[newTimeframe]);
  };

  const getTimeframeLabel = () => {
    switch (newsTimeframe) {
      case 'today': return language === 'de' ? 'Heute' : 'Today';
      case 'week': return language === 'de' ? 'Woche' : 'Week';
      case 'month': return language === 'de' ? 'Monat' : 'Month';
    }
  };

  const getTimeframeIcon = () => {
    switch (newsTimeframe) {
      case 'today': return Clock;
      case 'week': return Calendar;
      case 'month': return CalendarDays;
    }
  };

  const handleNewsIntelligence = async () => {
    setIsTyping(true);
    try {
      const { data, error } = await supabase.functions.invoke('news-intelligence', {
        body: { 
          action: 'aggregate_news', 
          timeframe: newsTimeframe,
          language: language
        }
      });

      if (error) throw error;

      const newMessage: Message = {
        id: Date.now().toString(),
        text: language === 'de'
          ? `**📰 News Intelligence - ${getTimeframeLabel()}**\n\n${data.summary}\n\n*${data.articlesFound} Artikel analysiert*\n\n> **Stellen Sie weitere Fragen zu den Themen für detailliertere Informationen!**`
          : `**📰 News Intelligence - ${getTimeframeLabel()}**\n\n${data.summary}\n\n*Analyzed ${data.articlesFound} articles*\n\n> **Ask follow-up questions for more details!**`,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, newMessage]);
      setIsInDetailMode(true);
    } catch (error) {
      console.error('News Intelligence error:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        text: language === 'de' 
          ? `Fehler beim Laden der News: ${(error as any)?.message || 'Unbekannter Fehler'}`
          : `Error loading news: ${(error as any)?.message || 'Unknown error'}`,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleDetailedQuestion = async (question: string) => {
    setIsTyping(true);
    try {
      // Check if user is requesting a quiz based on the current article
      const quizRequestPatterns = {
        de: ['erstelle', 'informations', 'quiz', 'weiteres', 'quiz'],
        en: ['create', 'information', 'quiz', 'another', 'quiz']
      };
      
      const lowerQuestion = question.toLowerCase();
      const patterns = language === 'de' ? quizRequestPatterns.de : quizRequestPatterns.en;
      const isQuizRequest = patterns.some(pattern => lowerQuestion.includes(pattern));
      
      if (isQuizRequest && currentArticleContent) {
        // Generate quiz strictly based on current article content
        // Collect previous quiz questions to avoid repetition - get ALL previous quiz questions from this session
        const previousQuizQuestions = messages
          .filter(m => !m.isUser && typeof m.text === 'string' && m.text.startsWith('SEMICOLON_QUIZ:'))
          .map(m => {
            const content = m.text.replace('SEMICOLON_QUIZ:', '').trim();
            const line = content.split('\n').find(l => l.includes(';') && l.split(';').length === 6) || content;
            return line.split(';')[0].trim();
          });

        // Simple keyword extraction from article content
        const deStop = ['der','die','das','ein','eine','und','oder','für','von','mit','zu','auf','in','an','bei','nach','über','unter','vor','zwischen','durch','gegen','ohne','um','während','wegen','trotz','statt','außerhalb','innerhalb','oberhalb','unterhalb','ist','sind','war','waren'];
        const enStop = ['the','and','or','for','of','with','to','on','in','at','by','from','about','into','through','during','before','after','above','below','between','among','against','without','within','is','are','was','were'];
        const stop = language === 'de' ? deStop : enStop;
        const extractKeywords = (text: string) => Array.from(new Set(
          text
            .toLowerCase()
            .replace(/[^a-zA-ZÄÖÜäöüß0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 5 && !stop.includes(w))
        )).slice(0, 50);
        const contextKeywords = extractKeywords(currentArticleContent);
        const contextNumbers = Array.from(currentArticleContent.match(/\d[\d.,]*/g) || []);

        const validateQuestion = (q: string) => {
          const qLower = q.toLowerCase();
          const hasKeyword = contextKeywords.some(kw => qLower.includes(kw));
          const hasNumber = contextNumbers.some(n => qLower.includes(n.replace(/[.,]/g, '')) || qLower.includes(n));
          return hasKeyword || hasNumber;
        };

        const basePromptDe = `Du bist eine strenge Quiz-Erstellungs-Engine. Erstelle GENAU EIN Quiz NUR aus dem folgenden Artikel-Kontext.

Format: Frage;Antwort1;Antwort2;Antwort3;Antwort4;Richtige_Antwort
- Verwende ausschließlich Fakten (Zahlen, Namen, Orte, Daten), die im Kontext stehen
- Keine Erfindungen, keine externen Kenntnisse
- Die richtige Antwort MUSS eine der vier Optionen sein
- Wenn der Kontext nicht ausreicht, antworte exakt: NO_QUIZ_POSSIBLE
${previousQuizQuestions.length ? `\nBereits behandelte Quizzes (verwende ANDERE Fragen): ${previousQuizQuestions.map((q, i) => `${i + 1}. ${q}`).join(' ')}` : ''}
${currentArticleSource ? `\nQuelle: ${currentArticleSource}` : ''}
\nArtikel-Kontext:\n"""\n${currentArticleContent}\n"""`;

        const basePromptEn = `You are a strict quiz-generation engine. Create EXACTLY ONE quiz ONLY from the article context below.

Format: Question;Option1;Option2;Option3;Option4;Correct_Answer
- Use only facts (numbers, names, places, dates) present in the context
- No inventions, no outside knowledge
- The correct answer MUST be one of the four options
- If the context is insufficient, reply exactly: NO_QUIZ_POSSIBLE
${previousQuizQuestions.length ? `\nPrevious quizzes covered (use DIFFERENT questions): ${previousQuizQuestions.map((q, i) => `${i + 1}. ${q}`).join(' ')}` : ''}
${currentArticleSource ? `\nSource: ${currentArticleSource}` : ''}
\nArticle context:\n"""\n${currentArticleContent}\n"""`;

        const prompt = language === 'de' ? basePromptDe : basePromptEn;

        const callOpenRouter = async (p: string, temp = 0.2) => {
          const { data, error } = await supabase.functions.invoke('openrouter-proxy', {
            body: { 
              prompt: p, 
              temperature: temp,
              model: 'google/gemini-2.0-flash-exp:free',
              max_tokens: 400
            }
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          return data?.content || '';
        };

        try {
          let quizText = await callOpenRouter(prompt, 0.2);

          // Early stop if model refused
          if (/^NO_QUIZ_POSSIBLE$/i.test(quizText)) {
            throw new Error(language === 'de' ? 'Nicht genug Informationen im Artikel für ein weiteres Quiz.' : 'Not enough information in the article for another quiz.');
          }

          // Ensure we pick the valid semicolon line
          const lines = quizText.split('\n').map(l => l.trim());
          let quizLine = lines.find(l => l.includes(';') && l.split(';').length === 6) || '';

          // Retry once with stricter instruction if validation fails
          const needsRetry = !quizLine || !validateQuestion(quizLine.split(';')[0] || '');
          if (needsRetry) {
            const stricter = prompt + (language === 'de'
              ? `\n\nSTRIKT: Die Frage MUSS mindestens eine Zahl, ein Datum, einen Namen oder Ort aus dem Artikel enthalten.`
              : `\n\nSTRICT: The question MUST include at least one number, date, name, or place from the article.`);
            quizText = await callOpenRouter(stricter, 0.1);
            if (/^NO_QUIZ_POSSIBLE$/i.test(quizText)) {
              throw new Error(language === 'de' ? 'Nicht genug Informationen im Artikel für ein weiteres Quiz.' : 'Not enough information in the article for another quiz.');
            }
            const lines2 = quizText.split('\n').map(l => l.trim());
            quizLine = lines2.find(l => l.includes(';') && l.split(';').length === 6) || '';
          }

          if (!quizLine) throw new Error('Invalid quiz response');
          const qPart = quizLine.split(';')[0];
          if (!validateQuestion(qPart)) throw new Error('Quiz passt nicht zum Artikelkontext');

          const quizMessage: Message = {
            id: Date.now().toString(),
            text: `SEMICOLON_QUIZ:${quizLine}`,
            isUser: false,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, quizMessage]);

          // Persist seed for follow-up quizzes (article-based)
          if (!infoQuizSeedContent) {
            setInfoQuizSeedContent(currentArticleContent);
            setInfoQuizSeedSource(currentArticleSource || (language === 'de' ? 'Artikel' : 'Article'));
            setInfoQuizActive(true);
          }
          console.log('✅ Successfully created strict article-based quiz');
        } catch (error) {
          console.error('Article quiz generation failed:', error);
          const errorMessage: Message = {
            id: Date.now().toString(),
            text: language === 'de'
              ? '❌ Quiz konnte nicht kontexttreu erstellt werden. Stellen Sie eine inhaltliche Frage zum Artikel oder wählen Sie ein anderes Thema.'
              : '❌ Could not create a context-faithful quiz. Ask a content question about the article or choose another topic.',
            isUser: false,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, errorMessage]);
        }
        
        setIsTyping(false);
        return;
      }

      // Normal detailed question handling for non-quiz requests
      // First convert question to search terms
      const { data: searchData, error: searchError } = await supabase.functions.invoke('news-intelligence', {
        body: { 
          action: 'query_to_search', 
          query: question,
          language: language
        }
      });

      if (searchError) throw searchError;

      // Then get detailed article
      const { data: articleData, error: articleError } = await supabase.functions.invoke('news-intelligence', {
        body: { 
          action: 'detailed_search', 
          query: searchData.searchTerms,
          language: language
        }
      });

      if (articleError) throw articleError;

      setCurrentArticleContent(articleData.articleContent);
      setCurrentArticleSource(articleData.articleTitle || 'Unbekannte Quelle');

      // Answer the question based on the article
      const { data: answerData, error: answerError } = await supabase.functions.invoke('news-intelligence', {
        body: { 
          action: 'answer_question', 
          query: question,
          articleContent: articleData.articleContent,
          language: language
        }
      });

      if (answerError) throw answerError;

      const responseMessage: Message = {
        id: Date.now().toString(),
        text: language === 'de'
          ? `**📖 Detaillierte Antwort**\n\n${answerData.answer}\n\n*Quelle: [${articleData.articleTitle}](${articleData.articleUrl})*\n\n> **Stellen Sie weitere Fragen zu diesem Artikel!**`
          : `**📖 Detailed answer**\n\n${answerData.answer}\n\n*Source: [${articleData.articleTitle}](${articleData.articleUrl})*\n\n> **Ask more questions about this article!**`,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, responseMessage]);
    } catch (error) {
      console.error('Detailed question error:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        text: language === 'de'
          ? `Fehler bei der detaillierten Suche: ${(error as any)?.message || 'Unbekannter Fehler'}`
          : `Error during detailed search: ${(error as any)?.message || 'Unknown error'}`,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };
  
  
  // PDF download function
  const downloadSummaryAsPDF = (messageText: string) => {
    try {
      const doc = new jsPDF();
      
      // Remove markdown formatting and extract clean text
      const cleanText = messageText
        .replace(/^\*\*.*?\*\*/g, '') // Remove bold headers
        .replace(/📝/g, '') // Remove emojis
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
        .trim();
      
      // Extract topic from the summary content for dynamic title
      const extractTopicFromSummary = (text: string): string => {
        const lines = text.split('\n');
        
        // Look for key topics in the first few lines of content
        for (const line of lines.slice(0, 5)) {
          const trimmed = line.trim();
          if (trimmed.length > 10 && trimmed.length < 80) {
            // Extract potential topic keywords
            const words = trimmed.split(' ').filter(word => 
              word.length > 2 && 
              !['der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'für', 'von', 'mit', 'zu', 'auf', 'in', 'an', 'bei', 'nach', 'über', 'unter', 'vor', 'zwischen', 'durch', 'gegen', 'ohne', 'um', 'während', 'wegen', 'trotz', 'statt', 'außerhalb', 'innerhalb', 'oberhalb', 'unterhalb', 'the', 'and', 'or', 'for', 'of', 'with', 'to', 'on', 'in', 'at', 'by', 'from', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'among', 'against', 'without', 'within'].includes(word.toLowerCase())
            );
            
            if (words.length >= 2) {
              // Return first few meaningful words as topic
              return words.slice(0, 3).join(' ');
            }
          }
        }
        
        // Fallback to looking for quoted terms or capitalized words
        const quotedMatch = text.match(/"([^"]{3,50})"/);
        if (quotedMatch) return quotedMatch[1];
        
        const capitalizedWords = text.match(/\b[A-Z][a-zA-Z]{2,}\s+[A-Z][a-zA-Z]{2,}/);
        if (capitalizedWords) return capitalizedWords[0];
        
        // Final fallback
        return language === 'de' ? 'Zusammenfassung' : 'Summary';
      };
      
      // Extract title and content
      const lines = cleanText.split('\n');
      const summaryContent = lines
        .filter(line => 
          !line.includes('Zusammenfassung') && 
          !line.includes('Summary') && 
          !line.includes('(') && 
          line.trim().length > 0
        )
        .join('\n')
        .trim();
      
      // Generate dynamic title based on content
      const topicFromContent = extractTopicFromSummary(summaryContent);
      const dynamicTitle = `${topicFromContent} - ${language === 'de' ? 'Zusammenfassung' : 'Summary'}`;
      
      // Add title
      doc.setFontSize(18);
      doc.text(dynamicTitle, 20, 30);
      
      // Add date
      doc.setFontSize(12);
      const dateStr = new Date().toLocaleDateString();
      doc.text(`${language === 'de' ? 'Erstellt am' : 'Created on'}: ${dateStr}`, 20, 45);
      
      // Add content
      doc.setFontSize(11);
      const splitText = doc.splitTextToSize(summaryContent, 170);
      doc.text(splitText, 20, 65);
      
      // Generate filename with topic
      const safeTopicName = topicFromContent.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      const filename = `${safeTopicName}_${language === 'de' ? 'Zusammenfassung' : 'Summary'}_${dateStr.replace(/\//g, '-')}.pdf`;
      
      // Create blob and open PDF in new tab automatically
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      // Open in new tab
      const newWindow = window.open(pdfUrl, '_blank');
      if (newWindow) {
        newWindow.focus();
      }
      
      // Also trigger download
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up URL after some time
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
      
      // Show success toast
      toast({
        title: language === 'de' ? 'PDF erstellt und geöffnet' : 'PDF created and opened',
        description: language === 'de' ? 'Die Zusammenfassung wurde als PDF heruntergeladen und automatisch geöffnet.' : 'The summary has been downloaded as PDF and opened automatically.',
      });
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast({
        title: language === 'de' ? 'Fehler' : 'Error',
        description: language === 'de' ? 'PDF konnte nicht erstellt werden.' : 'PDF could not be created.',
        variant: 'destructive',
      });
    }
  };
  const [lastAIResponse, setLastAIResponse] = useState<string>('');
  const [searchResults, setSearchResults] = useState<{ [messageId: string]: any[] }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [articleContext, setArticleContext] = useState<string | null>(null);
  const [contextArticleId, setContextArticleId] = useState<string | null>(null);
  const [autoAsk, setAutoAsk] = useState<{ question: string } | null>(null);
  const [qrMode, setQrMode] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [visibleCopyButtons, setVisibleCopyButtons] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [internetSeed, setInternetSeed] = useState<{ firstQuery: string; title?: string; lang: 'de' | 'en'; link?: string } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const [puterReady, setPuterReady] = useState(false);
  const [summaryMode, setSummaryMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [quizInfoMode, setQuizInfoMode] = useState(false);
  const [isArticleMode, setIsArticleMode] = useState(false);
  const [userSuggestions, setUserSuggestions] = useState<string[]>([]);

  // Persistent Information-Quiz seed (keeps the first context for all subsequent quizzes)
  const [infoQuizSeedContent, setInfoQuizSeedContent] = useState<string>('');
  const [infoQuizSeedSource, setInfoQuizSeedSource] = useState<string>('');
  const [infoQuizActive, setInfoQuizActive] = useState<boolean>(false);

  const handleQuizAnswer = (messageId: string, selectedAnswer: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && msg.quizData) {
        return {
          ...msg,
          quizData: {
            ...msg.quizData,
            selectedAnswer,
            showResults: true
          }
        };
      }
      return msg;
    }));
  };

  // Handle article content from navigation state (Ask AI from article)
  useEffect(() => {
    if (location.state?.articleContent) {
      const articleContent = location.state.articleContent;
      const articleTitle = location.state.articleTitle;
      
      // Set to internet search mode and enable article mode
      setSearchMode('internet');
      setIsArticleMode(true);
      
      // Store article context without sending it
      setArticleContext(articleContent);
      
      // Clear the navigation state first
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Add a welcome message asking what the user wants to know
      const welcomeMessage: Message = {
        id: Date.now().toString(),
        text: language === 'de' 
          ? `📄 **Artikel geladen:** ${articleTitle}\n\nIch habe den Artikel gelesen. Was möchten Sie dazu wissen?`
          : `📄 **Article loaded:** ${articleTitle}\n\nI have read the article. What would you like to know about it?`,
        isUser: false,
        timestamp: new Date(),
        endConversationAvailable: false
      };
      
      setMessages([welcomeMessage]);
    }
  }, [location.state, language]);

  // Check for article/articleId/prefill parameters in URL and initialize context
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const articleParam = urlParams.get('article');
    const articleIdParam = urlParams.get('articleId');
    const prefillParam = urlParams.get('prefill') || urlParams.get('prompt');

    let ctxTitle: string | null = null;
    let ctxId: string | null = null;

    if (articleIdParam) {
      const byId = articles.find(a => a.id === articleIdParam);
      if (byId) {
        ctxId = byId.id;
        ctxTitle = language === 'de' ? byId.title : (byId.titleEn || byId.title);
      }
    } else if (articleParam && articleParam.length <= 500 && !/[<>"'&]/.test(articleParam)) {
      const decoded = decodeURIComponent(articleParam).trim();
      ctxTitle = decoded;
      const matched = articles.find(a => [a.title?.toLowerCase(), a.titleEn?.toLowerCase()].includes(decoded.toLowerCase()));
      if (matched) ctxId = matched.id;
    }

    if (ctxTitle) {
      setArticleContext(ctxTitle);
      if (ctxId) setContextArticleId(ctxId);

      const defaultPrefill = language === 'de'
        ? `Bitte gib mir eine klare, kurze Zusammenfassung von "${ctxTitle}" in 3-5 Sätzen und nenne 3 wichtige Erkenntnisse.`
        : `Please give me a clear, concise 3-5 sentence summary of "${ctxTitle}" and list 3 key takeaways.`;
      const question = (prefillParam && prefillParam.length < 300 ? prefillParam : defaultPrefill);
      setInputValue(question);
      setSearchMode('local');
      setAutoAsk({ question });

      // Clear the URL parameters
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [language]);

  // Auto-run prefilled question when provided via URL
  useEffect(() => {
    if (!autoAsk) return;
    const question = autoAsk.question;
    const send = async () => {
      const userMessage: Message = {
        id: Date.now().toString(),
        text: question,
        isUser: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      setInputValue('');
      setIsTyping(true);
      try {
        const response = await processAIResponse(question);
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: response.text,
          isUser: false,
          timestamp: new Date(),
          qrCode: response.qrCode,
          quizData: response.quizData,
          endConversationAvailable: response.endConversationAvailable
        };
        setTimeout(() => {
          setMessages(prev => [...prev, aiMessage]);
          setIsTyping(false);
        }, 600);
      } catch (e) {
        setIsTyping(false);
      } finally {
        setAutoAsk(null);
      }
    };
    send();
  }, [autoAsk]);

  // Initialize welcome message based on language and context
  useEffect(() => {
    // Clear internet seed when language changes to prevent context mixing
    setInternetSeed(null);
    
    if (articleContext) {
      const contextMessage = {
        id: '1',
        text: language === 'de' 
          ? `👋 Hallo! Ich sehe, Sie kommen von einem Artikel. Ich bin im Kontext-Modus und kann spezielle Fragen zu "${articleContext}" beantworten. Fragen Sie mich alles über diesen Artikel!`
          : `👋 Hello! I see you came from an article. I'm in context mode and can answer specific questions about "${articleContext}". Ask me anything about this article!`,
        isUser: false,
        timestamp: new Date()
      };
      setMessages([contextMessage]);
    } else {
      const welcomeMessage = {
        id: '1',
        text: language === 'de' 
          ? 'Hallo! Ich bin Daily Fun AI. Ich kann Ihnen bei Kontaktinformationen, Team-Details, Firmen-Informationen und Artikeln helfen. Fragen Sie mich zum Beispiel: "Wer ist Stefan Kunc?" oder "Wie kann ich euch kontaktieren?"'
          : 'Hello! I\'m Daily Fun AI. I can help you with contact information, team details, company information and articles. Try asking me: "Who is Stefan Kunc?" or "How can I contact you?"',
        isUser: false,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [language, articleContext]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let base: readonly string[];
    
    if (quizMode) {
      base = language === 'de' ? QUIZ_SUGGESTIONS.de : QUIZ_SUGGESTIONS.en;
    } else {
      base = language === 'de' ? SUGGESTIONS.de : SUGGESTIONS.en;
    }
    
    const ctx = articleContext;
    const contextual = ctx && !quizMode
      ? (
          language === 'de'
            ? [
                `Fasse mir "${ctx}" in 3-5 Sätzen zusammen`,
                `Nenne 3 wichtige Erkenntnisse aus "${ctx}"`,
                `Wer ist der Autor von "${ctx}"?`,
                `Wann wurde "${ctx}" veröffentlicht?`,
                `In welcher Kategorie ist "${ctx}"?`,
              ]
            : [
                `Summarize "${ctx}" in 3-5 sentences`,
                `List 3 key takeaways from "${ctx}"`,
                `Who is the author of "${ctx}"?`,
                `When was "${ctx}" published?`,
                `Which category is "${ctx}" in?`,
              ]
        )
      : [];
    const merged = [...contextual, ...base];
    const q = inputValue.trim().toLowerCase();
    const list = q ? merged.filter(s => s.toLowerCase().includes(q)) : merged;
    setFilteredSuggestions(list.slice(0, 6));
  }, [inputValue, language, articleContext, quizMode]);

  // Load Puter AI SDK for chat and TTS
  useEffect(() => {
    const scriptId = 'puter-sdk-v2';
    if (document.getElementById(scriptId)) {
      setPuterReady(true);
      return;
    }
    const s = document.createElement('script');
    s.id = scriptId;
    s.src = 'https://js.puter.com/v2/';
    s.async = true;
    s.onload = () => setPuterReady(true);
    s.onerror = () => setPuterReady(false);
    document.body.appendChild(s);
  }, []);

  const generateQRCode = async (url: string): Promise<string> => {
    try {
      return await QRCode.toDataURL(url, {
        width: 200,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  };

  const handleMessageClick = (messageId: string) => {
    if (summaryMode || quizInfoMode) {
      setSelectedMessages(prev => 
        prev.includes(messageId)
          ? prev.filter(id => id !== messageId)
          : [...prev, messageId]
      );
    } else {
      setVisibleCopyButtons(prev => 
        prev.includes(messageId) 
          ? prev.filter(id => id !== messageId)
          : [...prev, messageId]
      );
      
      // Hide after 3 seconds
      setTimeout(() => {
        setVisibleCopyButtons(prev => prev.filter(id => id !== messageId));
      }, 3000);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const downloadQRCode = (qrCodeDataUrl: string) => {
    const link = document.createElement('a');
    link.download = 'qr-code.png';
    link.href = qrCodeDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateGermanQuiz = async (userInput: string): Promise<{ text: string; quizData?: any }> => {
    const input = userInput.toLowerCase();
    
    // Random topic pool for variety
    const randomTopics = [
      'Geschichte', 'Wissenschaft', 'Sport', 'Filme', 'Musik', 'Geographie', 
      'Technik', 'Kunst', 'Literatur', 'Politik', 'Medizin', 'Natur und Umwelt',
      'Essen und Kochen', 'Automobile', 'Weltraum', 'Mathematik', 'Tiere',
      'Architektur', 'Psychologie', 'Philosophie', 'Wirtschaft', 'Mode',
      'Fotografie', 'Reisen', 'Sprachen', 'Erfindungen', 'Kulturgeschichte'
    ];
    
    // Enhanced topic detection using AI-like approach
    let topic = 'Allgemeinwissen';
    
    // Check for random quiz request
    if (input.includes('random quiz') || input.includes('zufällig')) {
      topic = randomTopics[Math.floor(Math.random() * randomTopics.length)];
    }
    // Direct topic matching
    else if (input.includes('katzen') || input.includes('cat')) topic = 'Katzen';
    else if (input.includes('hunde') || input.includes('dog')) topic = 'Hunde';
    else if (input.includes('geschichte') || input.includes('history')) topic = 'Geschichte';
    else if (input.includes('wissenschaft') || input.includes('science')) topic = 'Wissenschaft';
    else if (input.includes('sport')) topic = 'Sport';
    else if (input.includes('filme') || input.includes('movie')) topic = 'Filme';
    else if (input.includes('musik') || input.includes('music')) topic = 'Musik';
    else if (input.includes('geographie') || input.includes('länder') || input.includes('städte')) topic = 'Geographie';
    else if (input.includes('technik') || input.includes('technologie')) topic = 'Technik';
    else if (input.includes('kunst')) topic = 'Kunst';
    else if (input.includes('literatur') || input.includes('bücher')) topic = 'Literatur';
    else if (input.includes('politik')) topic = 'Politik';
    else if (input.includes('medizin') || input.includes('gesundheit')) topic = 'Medizin';
    else if (input.includes('natur') || input.includes('umwelt')) topic = 'Natur und Umwelt';
    else if (input.includes('essen') || input.includes('kochen')) topic = 'Essen und Kochen';
    else if (input.includes('auto') || input.includes('fahrzeug')) topic = 'Automobile';
    else if (input.includes('weltraum') || input.includes('astronomie')) topic = 'Weltraum';
    else if (input.includes('mathematik') || input.includes('mathe')) topic = 'Mathematik';
    else {
      // Try to extract topic from free-form text
      const words = input.split(' ');
      for (const word of words) {
        if (word.length > 4 && !['quiz', 'frage', 'über', 'einem', 'eine', 'einem', 'random'].includes(word)) {
          topic = word.charAt(0).toUpperCase() + word.slice(1);
          break;
        }
      }
    }
    
    try {
      console.log('Generating German quiz for topic:', topic);
      
      // Generate unique seed for variation
      const uniqueSeed = Date.now() + Math.floor(Math.random() * 1000);
      
      // Use OpenRouter API directly for better reliability (same as information quiz)
      const prompt = `Du bist ein Experte für die Erstellung von deutschen Quiz-Fragen. Erstelle ein EINZIGARTIGES Multiple-Choice-Quiz zum Thema "${topic}".

WICHTIGE REGELN:
1. Die Frage muss auf Deutsch sein und spezifisch sein (keine vagen Fragen)
2. Alle 4 Antwortmöglichkeiten müssen auf Deutsch sein
3. Genau eine Antwort muss korrekt sein
4. Die anderen 3 Antworten müssen plausibel aber eindeutig falsch sein
5. Verwende konkrete Fakten, Zahlen, Namen oder Daten (keine Meinungen oder subjektive Aussagen)
6. Vermeide vage Antworten wie "ist interessant", "ist wichtig", "ist komplex"
7. Stelle sicher, dass die falschen Antworten nicht auch richtig sein könnten
8. Füge eine kurze, präzise Erklärung zur richtigen Antwort hinzu
9. ERSTELLE JEDES MAL EINE ANDERE FRAGE - verwende verschiedene Aspekte des Themas
10. Variation-ID: ${uniqueSeed} (verwende diese für Einzigartigkeit)

BEISPIEL FÜR GUTE FRAGEN:
- "Wie viele Stunden schlafen Katzen durchschnittlich pro Tag?" mit spezifischen Zahlen
- "In welchem Jahr wurde die Berliner Mauer errichtet?" mit konkreten Jahreszahlen
- "Welches ist das größte Organ des menschlichen Körpers?" mit eindeutigen Antworten

FORMAT (verwende genau dieses JSON-Format):
{
  "question": "Die Quiz-Frage hier",
  "answers": ["Antwort 1", "Antwort 2", "Antwort 3", "Antwort 4"],
  "correctAnswer": "Die richtige Antwort (muss exakt eine der 4 Antworten sein)",
  "explanation": "Kurze Erklärung zur richtigen Antwort"
}`;

      // Try multiple AI models for better reliability
      const aiModels = [
        { name: 'Grok 4 Fast', model: 'x-ai/grok-4-fast:free' },
        { name: 'Grok 4', model: 'x-ai/grok-4' }
      ];

      let quiz = null;
      let successfulModel = null;

      // Try each model sequentially until one succeeds
      for (const aiModel of aiModels) {
        try {
          console.log(`Trying AI model: ${aiModel.name}`);
          
          const { data, error } = await supabase.functions.invoke('openrouter-proxy', {
            body: { 
              prompt: prompt,
              temperature: 0.8,
              model: aiModel.model,
              max_tokens: 600
            }
          });

          if (error) {
            console.error(`${aiModel.name} API error:`, error);
            throw error;
          }

          if (data?.error) {
            console.error(`${aiModel.name} API error:`, data.error);
            throw new Error(data.error);
          }

          const quizContent = data?.content?.trim() || '';
          
          console.log(`Raw AI response from ${aiModel.name}:`, quizContent);

          if (!quizContent) {
            throw new Error(`No content from ${aiModel.name}`);
          }

          // Try to extract JSON from the response
          let parsedQuiz;
          try {
            // Look for JSON in the response
            const jsonMatch = quizContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsedQuiz = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('No JSON found in response');
            }
          } catch (parseError) {
            console.error(`JSON parsing failed for ${aiModel.name}:`, parseError);
            
            // Fallback: try to parse line by line
            const lines = quizContent.split('\n').map(line => line.trim()).filter(Boolean);
            
            let question = '';
            let answers = [];
            let correctAnswer = '';
            let explanation = '';
            
            for (const line of lines) {
              if (line.includes('?') && !question) {
                question = line.replace(/["':]/g, '').trim();
              } else if (line.match(/^[A-D]\)|^\d+\.|^-/) && answers.length < 4) {
                const answer = line.replace(/^[A-D]\)|^\d+\.|^-\s*/, '').replace(/["',]/g, '').trim();
                if (answer) answers.push(answer);
              }
            }
            
            if (question && answers.length === 4) {
              correctAnswer = answers[0]; // Assume first answer is correct as fallback
              explanation = `Die richtige Antwort ist "${correctAnswer}".`;
              
              parsedQuiz = {
                question,
                answers,
                correctAnswer,
                explanation
              };
            } else {
              throw new Error(`Could not parse quiz from ${aiModel.name} response`);
            }
          }

          // Validate quiz structure
          if (!parsedQuiz.question || !Array.isArray(parsedQuiz.answers) || parsedQuiz.answers.length !== 4) {
            throw new Error(`Invalid quiz structure from ${aiModel.name}`);
          }
          
          if (!parsedQuiz.answers.includes(parsedQuiz.correctAnswer)) {
            console.warn(`Correct answer not found in answers array for ${aiModel.name}, fixing...`);
            parsedQuiz.correctAnswer = parsedQuiz.answers[0];
          }

          // Ensure all fields are strings and clean
          parsedQuiz.question = String(parsedQuiz.question).trim();
          parsedQuiz.answers = parsedQuiz.answers.map(answer => String(answer).trim());
          parsedQuiz.correctAnswer = String(parsedQuiz.correctAnswer).trim();
          parsedQuiz.explanation = String(parsedQuiz.explanation || `Die richtige Antwort ist "${parsedQuiz.correctAnswer}".`).trim();

          quiz = parsedQuiz;
          successfulModel = aiModel.name;
          console.log(`✅ Successfully generated quiz using ${aiModel.name}:`, quiz);
          break;

        } catch (modelError) {
          console.error(`❌ ${aiModel.name} failed:`, modelError);
        }
      }

      // If all AI models failed, create a fallback quiz
      if (!quiz) {
        console.log('All AI models failed, creating fallback quiz');
        
        // Better fallback quizzes with multiple variations per topic
        const katzenQuizzes = [
          {
            question: 'Wie viele Stunden schlafen Katzen durchschnittlich pro Tag?',
            answers: ['12-16 Stunden', '8-10 Stunden', '18-20 Stunden', '6-8 Stunden'],
            correctAnswer: '12-16 Stunden',
            explanation: 'Katzen schlafen durchschnittlich 12-16 Stunden pro Tag, da sie Raubtiere sind und Energie für die Jagd sparen müssen.'
          },
          {
            question: 'Wie viele Zehen haben Katzen normalerweise an den Vorderpfoten?',
            answers: ['5 Zehen', '4 Zehen', '6 Zehen', '3 Zehen'],
            correctAnswer: '5 Zehen',
            explanation: 'Katzen haben normalerweise 5 Zehen an den Vorderpfoten und 4 Zehen an den Hinterpfoten.'
          },
          {
            question: 'Wie heißt das Geräusch, das Katzen machen, wenn sie zufrieden sind?',
            answers: ['Schnurren', 'Miauen', 'Fauchen', 'Knurren'],
            correctAnswer: 'Schnurren',
            explanation: 'Das Schnurren ist ein Zeichen von Zufriedenheit und Entspannung bei Katzen.'
          }
        ];

        const hundeQuizzes = [
          {
            question: 'Welche Hunderasse gilt als die intelligenteste?',
            answers: ['Border Collie', 'Golden Retriever', 'Deutscher Schäferhund', 'Labrador'],
            correctAnswer: 'Border Collie',
            explanation: 'Border Collies gelten als die intelligenteste Hunderasse und sind besonders gut im Befolgen von Kommandos und beim Problemlösen.'
          },
          {
            question: 'Wie viele Zähne hat ein erwachsener Hund?',
            answers: ['42 Zähne', '32 Zähne', '36 Zähne', '48 Zähne'],
            correctAnswer: '42 Zähne',
            explanation: 'Ein erwachsener Hund hat 42 Zähne, während Welpen nur 28 Milchzähne haben.'
          },
          {
            question: 'Welcher Sinn ist bei Hunden am stärksten ausgeprägt?',
            answers: ['Geruchssinn', 'Gehör', 'Sehkraft', 'Tastsinn'],
            correctAnswer: 'Geruchssinn',
            explanation: 'Der Geruchssinn von Hunden ist etwa 10.000 bis 100.000 Mal stärker als der von Menschen.'
          }
        ];

        const geschichteQuizzes = [
          {
            question: 'In welchem Jahr fiel die Berliner Mauer?',
            answers: ['1989', '1987', '1991', '1985'],
            correctAnswer: '1989',
            explanation: 'Die Berliner Mauer fiel am 9. November 1989, was ein wichtiger Moment in der deutschen Geschichte war.'
          },
          {
            question: 'Wer war der erste Kaiser des Deutschen Reiches?',
            answers: ['Wilhelm I.', 'Otto von Bismarck', 'Friedrich III.', 'Wilhelm II.'],
            correctAnswer: 'Wilhelm I.',
            explanation: 'Wilhelm I. wurde 1871 zum ersten Kaiser des Deutschen Reiches proklamiert.'
          },
          {
            question: 'In welchem Jahr begann der Zweite Weltkrieg?',
            answers: ['1939', '1938', '1940', '1941'],
            correctAnswer: '1939',
            explanation: 'Der Zweite Weltkrieg begann am 1. September 1939 mit dem deutschen Überfall auf Polen.'
          }
        ];

        const wissenschaftQuizzes = [
          {
            question: 'Welches ist das häufigste Element im Universum?',
            answers: ['Wasserstoff', 'Sauerstoff', 'Kohlenstoff', 'Helium'],
            correctAnswer: 'Wasserstoff',
            explanation: 'Wasserstoff ist das häufigste Element im Universum und macht etwa 75% der sichtbaren Materie aus.'
          },
          {
            question: 'Wie viele Knochen hat ein erwachsener Mensch?',
            answers: ['206 Knochen', '195 Knochen', '220 Knochen', '180 Knochen'],
            correctAnswer: '206 Knochen',
            explanation: 'Ein erwachsener Mensch hat 206 Knochen. Babys werden mit etwa 270 Knochen geboren, die während des Wachstums zusammenwachsen.'
          },
          {
            question: 'Welcher Planet ist der Erde am nächsten?',
            answers: ['Venus', 'Mars', 'Merkur', 'Jupiter'],
            correctAnswer: 'Venus',
            explanation: 'Venus ist durchschnittlich der erdnächste Planet, obwohl sich dies aufgrund der Umlaufbahnen ändert.'
          }
        ];

        const sportQuizzes = [
          {
            question: 'Wie oft finden die Olympischen Sommerspiele statt?',
            answers: ['Alle 4 Jahre', 'Alle 2 Jahre', 'Alle 3 Jahre', 'Alle 5 Jahre'],
            correctAnswer: 'Alle 4 Jahre',
            explanation: 'Die Olympischen Sommerspiele finden alle vier Jahre statt, genau wie die Winterspiele.'
          },
          {
            question: 'Wie viele Spieler hat eine Fußballmannschaft auf dem Feld?',
            answers: ['11 Spieler', '10 Spieler', '12 Spieler', '9 Spieler'],
            correctAnswer: '11 Spieler',
            explanation: 'Eine Fußballmannschaft hat 11 Spieler auf dem Feld, einschließlich des Torwarts.'
          },
          {
            question: 'In welcher Sportart verwendet man einen Shuttlecock?',
            answers: ['Badminton', 'Tennis', 'Tischtennis', 'Squash'],
            correctAnswer: 'Badminton',
            explanation: 'Ein Shuttlecock (Federball) wird beim Badminton verwendet.'
          }
        ];

        const fallbackQuizzes = {
          'Katzen': katzenQuizzes,
          'Hunde': hundeQuizzes, 
          'Geschichte': geschichteQuizzes,
          'Wissenschaft': wissenschaftQuizzes,
          'Sport': sportQuizzes
        };
        
        const normalizedTopic = topic.toLowerCase();
        let selectedQuiz = null;
        
        // Find matching topic and select random quiz from available options
        for (const topicKey of Object.keys(fallbackQuizzes)) {
          if (normalizedTopic.includes(topicKey.toLowerCase())) {
            const quizOptions = fallbackQuizzes[topicKey];
            selectedQuiz = quizOptions[Math.floor(Math.random() * quizOptions.length)];
            break;
          }
        }
        
        // If no specific topic found, create a better default
        if (!selectedQuiz) {
          selectedQuiz = {
            question: `Entschuldigung, ich konnte kein spezifisches Quiz für "${topic}" erstellen. Hier ist eine allgemeine Wissensfrage:`,
            answers: ['Die Antwort konnte nicht generiert werden', 'Bitte versuchen Sie ein anderes Thema', 'AI-System hat einen Fehler', 'Quiz nicht verfügbar'],
            correctAnswer: 'Bitte versuchen Sie ein anderes Thema',
            explanation: `Bitte versuchen Sie es mit einem der folgenden Themen: Katzen, Hunde, Geschichte, Wissenschaft, oder Sport.`
          };
        }
        
        quiz = selectedQuiz;
        successfulModel = 'Fallback Quiz Database';
        console.log(`Generated fallback quiz for topic "${topic}":`, quiz);
      }
      
      if (quiz) {
        console.log('Successfully generated quiz:', quiz);
        
        return {
          text: 'INTERACTIVE_QUIZ',
          quizData: {
            question: quiz.question,
            answers: quiz.answers,
            correctAnswer: quiz.correctAnswer,
            explanation: quiz.explanation,
            topic: topic,
            originalSource: userInput, // Store original user input as source
            quizCount: 0, // Start with 0, will be incremented for next quizzes
            sourceType: 'local' as const
          }
        };
      } else {
        throw new Error('No quiz data generated');
      }
    } catch (error) {
      console.error('German quiz generation failed:', error);
      
      // Enhanced fallback message
      const fallbackMessage = `❌ Entschuldigung, ich konnte kein Quiz zum Thema "${topic}" generieren. Das kann verschiedene Gründe haben:

🔄 **Versuchen Sie:**
- Ein anderes Thema (z.B. "Geschichte", "Sport", "Wissenschaft")
- Eine spezifischere Formulierung
- Es in ein paar Minuten erneut

💡 **Beliebte Quiz-Themen:**
- Tiere (Hunde, Katzen)
- Geschichte
- Geographie
- Filme & Musik
- Wissenschaft & Technik`;

      return { text: fallbackMessage };
    }
  };

  const generateEnglishQuizWithTranslation = async (userInput: string): Promise<{ text: string; quizData?: any }> => {
    const input = userInput.toLowerCase();
    
    // Determine quiz category and topic name
    let category = '';
    let topic = 'Random';
    
    if (input.includes('katzen') || input.includes('cat')) {
      category = '27'; // Animals
      topic = language === 'de' ? 'Katzen' : 'Cats';
    } else if (input.includes('hunde') || input.includes('dog')) {
      category = '27'; // Animals  
      topic = language === 'de' ? 'Hunde' : 'Dogs';
    } else if (input.includes('geschichte') || input.includes('history')) {
      category = '23'; // History
      topic = language === 'de' ? 'Geschichte' : 'History';
    } else if (input.includes('wissenschaft') || input.includes('science')) {
      category = '17'; // Science & Nature
      topic = language === 'de' ? 'Wissenschaft' : 'Science';
    } else if (input.includes('sport')) {
      category = '21'; // Sports
      topic = 'Sport';
    } else if (input.includes('filme') || input.includes('movie')) {
      category = '11'; // Movies
      topic = language === 'de' ? 'Filme' : 'Movies';
    } else if (input.includes('musik') || input.includes('music')) {
      category = '12'; // Music
      topic = 'Musik';
    }
    
    // Try multiple quiz sources with fallback system
    const quizSources = [
      {
        name: 'Open Trivia Database',
        method: async () => {
          console.log('🎯 Trying Open Trivia Database for English quiz:', topic);
          
          const apiUrl = `https://opentdb.com/api.php?amount=1&type=multiple${category ? `&category=${category}` : ''}`;
          const response = await fetch(apiUrl);
          const data = await response.json();
          
          if (data.response_code !== 0 || !data.results.length) {
            throw new Error('No quiz data from Open Trivia Database');
          }
          
          const quiz = data.results[0];
          
          // Decode HTML entities
          const decodeHtml = (html: string) => {
            const txt = document.createElement('textarea');
            txt.innerHTML = html;
            return txt.value;
          };
          
          const question = decodeHtml(quiz.question);
          const correctAnswer = decodeHtml(quiz.correct_answer);
          const incorrectAnswers = quiz.incorrect_answers.map((ans: string) => decodeHtml(ans));
          
          return { question, correctAnswer, incorrectAnswers };
        }
      },
      {
        name: 'Fallback Quiz Database',
        method: async () => {
          console.log('🎲 Using fallback English quiz database for topic:', topic);
          
          const fallbackQuizzes = {
            'Cats': {
              question: 'How many hours do cats sleep on average per day?',
              correctAnswer: '12-16 hours',
              incorrectAnswers: ['8-10 hours', '18-20 hours', '6-8 hours']
            },
            'Dogs': {
              question: 'Which dog breed is considered the most intelligent?',
              correctAnswer: 'Border Collie',
              incorrectAnswers: ['Golden Retriever', 'German Shepherd', 'Labrador']
            },
            'History': {
              question: 'In which year did World War II end?',
              correctAnswer: '1945',
              incorrectAnswers: ['1944', '1946', '1943']
            },
            'Science': {
              question: 'What is the chemical symbol for gold?',
              correctAnswer: 'Au',
              incorrectAnswers: ['Go', 'Gd', 'Ag']
            },
            'Default': {
              question: `What is an interesting fact about ${topic}?`,
              correctAnswer: `${topic} is fascinating`,
              incorrectAnswers: [`${topic} is important`, `${topic} is complex`, `${topic} is interesting`]
            }
          };
          
          return fallbackQuizzes[topic] || fallbackQuizzes['Default'];
        }
      }
    ];
    
    // Try each quiz source sequentially
    for (const source of quizSources) {
      try {
        const quizData = await source.method();
        
        if (quizData && quizData.question && quizData.correctAnswer && quizData.incorrectAnswers) {
          // Improved translation for German
          const translatedContent = language === 'de' ? 
            await improvedTranslateToGerman(quizData.question, quizData.correctAnswer, quizData.incorrectAnswers) : 
            {
              question: quizData.question,
              correct: quizData.correctAnswer,
              incorrect: quizData.incorrectAnswers
            };
          
          const allAnswers = [translatedContent.correct, ...translatedContent.incorrect].sort(() => Math.random() - 0.5);
          
          console.log(`✅ Successfully generated English quiz using ${source.name}`);
          
          // Create quiz data for interactive display
          const finalQuizData = {
            question: translatedContent.question,
            answers: allAnswers,
            correctAnswer: translatedContent.correct,
            explanation: language === 'de' 
              ? `Die richtige Antwort ist "${translatedContent.correct}".`
              : `The correct answer is "${translatedContent.correct}".`,
            topic: topic,
            originalSource: userInput, // Store original user input as source
            quizCount: 0, // Start with 0, will be incremented for next quizzes
            sourceType: 'local' as const
          };
          
          return { 
            text: 'INTERACTIVE_QUIZ',
            quizData: finalQuizData
          };
        }
      } catch (error) {
        console.error(`❌ ${source.name} failed:`, error);
      }
    }
    
    // If all sources failed
    console.error('❌ All English quiz sources failed');
    const errorText = language === 'de'
      ? '❌ Entschuldigung, ich konnte kein Quiz für dieses Thema generieren. Versuchen Sie es mit einem anderen Thema oder später erneut!'
      : '❌ Sorry, I couldn\'t generate a quiz for this topic. Try another topic or try again later!';
    return { text: errorText };
  };

  const generateQuiz = async (userInput: string): Promise<{ text: string; quizData?: any }> => {
    if (language === 'de') {
      return generateGermanQuiz(userInput);
    } else {
      return generateEnglishQuizWithTranslation(userInput);
    }
  };

  const improvedTranslateToGerman = async (question: string, correct: string, incorrect: string[]) => {
    // Enhanced translation dictionary
    const translations: { [key: string]: string } = {
      // Question words
      'What': 'Was', 'Who': 'Wer', 'Where': 'Wo', 'When': 'Wann', 'Why': 'Warum', 'How': 'Wie',
      'Which': 'Welche', 'Whose': 'Wessen',
      
      // Common quiz terms
      'the smallest': 'die kleinste', 'the largest': 'die größte', 'the first': 'die erste',
      'the last': 'die letzte', 'the most': 'die meisten', 'the least': 'die wenigsten',
      'smallest': 'kleinste', 'largest': 'größte', 'biggest': 'größte', 'tiniest': 'winzigste',
      
      // Animals
      'dog': 'Hund', 'cat': 'Katze', 'dogs': 'Hunde', 'cats': 'Katzen',
      'breed': 'Rasse', 'breeds': 'Rassen', 'animal': 'Tier', 'animals': 'Tiere',
      
      // Science terms
      'temperature': 'Temperatur', 'degree': 'Grad', 'degrees': 'Grad',
      'Celsius': 'Celsius', 'Fahrenheit': 'Fahrenheit',
      
      // Common words
      'is': 'ist', 'are': 'sind', 'was': 'war', 'were': 'waren',
      'in': 'in', 'on': 'auf', 'at': 'bei', 'by': 'von',
      'world': 'Welt', 'country': 'Land', 'countries': 'Länder',
      'year': 'Jahr', 'years': 'Jahre', 'century': 'Jahrhundert',
      
      // Verbs
      'considered': 'gilt als', 'known': 'bekannt', 'called': 'genannt',
      'reach': 'erreichen', 'produce': 'produzieren', 'burn': 'brennen',
      
      // Adjectives
      'bright': 'hell', 'white': 'weiß', 'small': 'klein', 'large': 'groß',
      'high': 'hoch', 'low': 'niedrig', 'hot': 'heiß', 'cold': 'kalt'
    };

    const translateText = (text: string): string => {
      let translated = text;
      
      // Replace whole words only
      Object.entries(translations).forEach(([en, de]) => {
        const regex = new RegExp(`\\b${en}\\b`, 'gi');
        translated = translated.replace(regex, de);
      });
      
      return translated;
    };

    return {
      question: translateText(question),
      correct: translateText(correct),
      incorrect: incorrect.map(translateText)
    };
  };

  // Helpers to create nicer, more logical answers
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const toSentences = (text: string) => text.split(/(?<=\p{L}[.!?])\s+/u).filter(Boolean);
  const summarize = (text: string, maxSentences = 4) => {
    const s = toSentences(text);
    return s.slice(0, Math.min(maxSentences, s.length)).join(' ');
  };
  const keyPoints = (text: string, tags?: string[], count = 3) => {
    const s = toSentences(text).slice(1, 10);
    const unique = Array.from(new Set(s.map(v => v.trim()))).filter(Boolean);
    const pts = unique.slice(0, count);
    if (pts.length < count && tags && tags.length) {
      const filler = tags.slice(0, count - pts.length).map(tag => language === 'de' ? `Thema: ${tag}` : `Topic: ${tag}`);
      return [...pts, ...filler];
    }
    return pts;
  };

  // Internet mode helpers (Wikipedia deep-dive for follow-up questions)
  const STOPWORDS = {
    de: ['der','die','das','und','ist','eine','einen','einem','den','des','im','in','am','an','auf','mit','für','von','oder','nicht','auch','wie','was','wer','wo','warum'],
    en: ['the','and','is','are','a','an','in','on','at','for','with','from','to','of','or','not','also','how','what','who','where','why']
  } as const;

  const getWikiExtract = async (title: string, lang: 'de' | 'en'): Promise<string> => {
    try {
      // Use correct German Wikipedia API endpoint
      const apiUrl = lang === 'de' 
        ? `https://de.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*&exsectionformat=plain`
        : `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*&exsectionformat=plain`;
      
      const res = await fetch(apiUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      const pages = data?.query?.pages;
      const page = pages ? pages[Object.keys(pages)[0]] : null;
      
      if (page && page.pageid && page.extract) {
        return page.extract;
      }
      
      return '';
    } catch (error) {
      console.error('Wikipedia API error:', error);
      return '';
    }
  };

  const pickRelevantSentences = (extract: string, question: string, lang: 'de' | 'en', max = 4): string[] => {
    const sentences = toSentences(extract);
    const words = question.toLowerCase().split(/[^\p{L}0-9]+/u).filter(Boolean);
    const keywords = words.filter(w => w.length >= 4 && !STOPWORDS[lang].includes(w as any));
    const ranked = sentences
      .map(s => ({ s, score: keywords.reduce((acc, kw) => acc + (s.toLowerCase().includes(kw) ? 1 : 0), 0) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map(r => r.s.trim());
    if (ranked.length > 0) return ranked;
    return sentences.slice(0, max).map(s => s.trim());
  };

  const answerInternetFollowUp = async (question: string): Promise<string> => {
    if (!internetSeed?.title) {
      return language === 'de' ? 'Bitte nenne erst ein Thema, dann kann ich Nachfragen beantworten.' : 'Please provide a topic first, then I can answer follow-ups.';
    }
    try {
      // Use current UI language instead of seed language for better user experience
      const currentLang = language === 'de' ? 'de' : 'en';
      const extract = await getWikiExtract(internetSeed.title, currentLang);
      const rel = pickRelevantSentences(extract, question, currentLang, 4);
      const header = language === 'de'
        ? `🤖 Vertiefung zum Thema "${internetSeed.title}"\n\nAusgehend von deiner Erstfrage: "${internetSeed.firstQuery}"\nNeue Frage: "${question}"`
        : `🤖 Deep dive on "${internetSeed.title}"\n\nFrom your initial question: "${internetSeed.firstQuery}"\nNew question: "${question}"`;
      const link = internetSeed.link ? `\n\n🔗 ${internetSeed.link}` : '';
      return `${header}\n\n${rel.map(s => `• ${s}`).join('\n')}${link}`;
    } catch (e) {
      return language === 'de' ? 'Es gab ein Problem bei der vertieften Antwort.' : 'There was a problem generating the deepened answer.';
    }
  };

  // Parse 'Weitere Treffer' or 'Other results' lines from a Wikipedia message
  const parseWikiOtherResults = (text: string): string[] => {
    const markerDe = 'Weitere Treffer:';
    const markerEn = 'Other results:';
    const idx = text.indexOf(markerDe) !== -1 ? text.indexOf(markerDe) : text.indexOf(markerEn);
    if (idx === -1) return [];
    const after = text.slice(idx).split('\n').slice(1); // lines after the marker
    const titles = after
      .map(l => l.trim())
      .filter(l => l.startsWith('- '))
      .map(l => l.replace(/^-\s+/, '').trim())
      .filter(Boolean);
    return titles;
  };

  // Fetch a Wikipedia summary for a given title and build the same formatted message
  const fetchWikiSummaryForTitle = async (title: string): Promise<{ text: string; title: string; link: string; lang: 'de' | 'en' }> => {
    const langCode: 'de' | 'en' = language === 'de' ? 'de' : 'en';
    
    try {
      // Search again to get a fresh related list with better error handling
      const searchUrl = `https://${langCode}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&utf8=&format=json&origin=*`;
      const sRes = await fetch(searchUrl);
      
      if (!sRes.ok) {
        throw new Error(`Search failed: ${sRes.status}`);
      }
      
      const sData = await sRes.json() as any;
      const first = sData?.query?.search?.[0];
      
      if (!first) {
        const notFound = language === 'de' ? 'Keine Ergebnisse auf Wikipedia gefunden.' : 'No results found on Wikipedia.';
        return { text: `🌐 ${notFound}`, title, link: '', lang: langCode };
      }
      
      const finalTitle = first.title as string;
      
      // Try REST API first, fallback to extract API
      let extract = '';
      let link = `https://${langCode}.wikipedia.org/wiki/${encodeURIComponent(finalTitle)}`;
      
      try {
        const sumUrl = `https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(finalTitle)}`;
        const sumRes = await fetch(sumUrl);
        
        if (sumRes.ok) {
          const sumData = await sumRes.json() as any;
          extract = sumData?.extract || '';
          link = sumData?.content_urls?.desktop?.page || link;
        }
      } catch (restError) {
        console.warn('REST API failed, trying extract API:', restError);
      }
      
      // Fallback to extract API if REST failed
      if (!extract) {
        extract = await getWikiExtract(finalTitle, langCode);
      }
      
      const summary = extract ? summarize(extract, 3) : (language === 'de' ? 'Keine Zusammenfassung verfügbar.' : 'No summary available.');
      const heading = language === 'de' ? `🌐 Wikipedia: ${finalTitle}\n\nKurzfassung:` : `🌐 Wikipedia: ${finalTitle}\n\nSummary:`;
      const others = (sData?.query?.search || []).slice(1, 3).map((r: any) => `- ${r.title}`).join('\n');
      const othersHeader = others ? (language === 'de' ? '\n\nWeitere Treffer:\n' : '\n\nOther results:\n') : '';
      
      return { text: `${heading}\n${summary}\n\n🔗 ${link}${othersHeader}${others}`, title: finalTitle, link, lang: langCode };
    } catch (error) {
      console.error('fetchWikiSummaryForTitle error:', error);
      const errorText = language === 'de' ? 'Fehler beim Laden der Wikipedia-Daten.' : 'Error loading Wikipedia data.';
      return { text: `🌐 ${errorText}`, title, link: '', lang: langCode };
    }
  };

  // Handle clicks on 'Weitere Treffer' buttons: only Wikipedia, no AI, and update seed for follow-ups
  const handleWikiResultClick = async (title: string) => {
    try {
      const res = await fetchWikiSummaryForTitle(title);
      // Update seed so that follow-up questions refer to this latest topic
      setInternetSeed({ firstQuery: res.title, title: res.title, lang: res.lang, link: res.link });
      const aiMessage: Message = {
        id: (Date.now()).toString(),
        text: res.text,
        isUser: false,
        timestamp: new Date(),
        endConversationAvailable: true,
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (e) {
      const errText = language === 'de' ? 'Fehler beim Laden des Wikipedia-Artikels.' : 'Error loading Wikipedia article.';
      setMessages(prev => [...prev, { id: Date.now().toString(), text: `❌ ${errText}`, isUser: false, timestamp: new Date() }]);
    }
  };

  // Speak mode helpers (speech recognition + AI chat + TTS)
  const getSpeechLanguage = (): string => (language === 'de' ? 'de-DE' : 'en-GB');

  const playTTSGerman = async (text: string) => {
    try {
      await waitForPuterReady();
      const puter = (window as any).puter;
      if (!puter?.ai?.txt2speech) {
        console.warn('TTS not available');
        return;
      }
      
      // Remove markdown and clean text
      const cleanText = text.replace(/[*_#`]/g, '').replace(/\n+/g, ' ').trim();
      if (!cleanText) return;
      
      const audio = await puter.ai.txt2speech(cleanText, {
        language: "de-DE",
        engine: "neural"
      });
      
      if (audio && typeof audio.play === 'function') {
        audio.play();
      }
    } catch (error) {
      console.error('German TTS error:', error);
    }
  };

  const playTTSEnglish = async (text: string) => {
    try {
      await waitForPuterReady();
      const puter = (window as any).puter;
      if (!puter?.ai?.txt2speech) {
        console.warn('TTS not available');
        return;
      }
      
      // Remove markdown and clean text
      const cleanText = text.replace(/[*_#`]/g, '').replace(/\n+/g, ' ').trim();
      if (!cleanText) return;
      
      const audio = await puter.ai.txt2speech(cleanText, {
        voice: "Joanna",
        language: "en-US",
        engine: "neural"
      });
      
      if (audio && typeof audio.play === 'function') {
        audio.play();
      }
    } catch (error) {
      console.error('English TTS error:', error);
    }
  };

  const playTTS = async (text: string) => {
    if (language === 'de') {
      await playTTSGerman(text);
    } else {
      await playTTSEnglish(text);
    }
  };

  // Ensure Puter SDK is ready before using it
  const waitForPuterReady = async (timeoutMs = 10000): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const puter = (window as any).puter;
      if (puter?.ai?.chat) return;
      await new Promise(r => setTimeout(r, 150));
    }
    throw new Error('Puter SDK not ready within timeout');
  };

  // Extract topic from user query using Claude 4 Sonnet for better accuracy
  const extractTopicFromQuery = async (userQuery: string): Promise<string> => {
    try {
      await waitForPuterReady();
      const puter = (window as any).puter;
      
      const prompt = language === 'de' 
        ? `Extrahiere das Hauptthema aus dieser Frage für eine Wikipedia-Suche. Antworte nur mit dem Namen oder Begriff, keine Erklärung.

Beispiele:
"Wer ist Albert Einstein?" → "Albert Einstein"
"Was ist die Relativitätstheorie?" → "Relativitätstheorie" 
"Erzähl mir von Paris" → "Paris"
"Wer ist Olaf Scholz?" → "Olaf Scholz"
"Was war die Ampelkoalition?" → "Ampelkoalition"

Frage: "${userQuery}"
Antwort:`
        : `Extract the main topic from this question for a Wikipedia search. Answer only with the name or term, no explanation.

Examples:
"Who is Albert Einstein?" → "Albert Einstein"
"What is relativity theory?" → "relativity theory"
"Tell me about Paris" → "Paris"

Question: "${userQuery}"
Answer:`;
        
      const response = await puter.ai.chat(prompt, { model: 'claude-sonnet-4' });
      const topic = typeof response === 'string' ? response.trim() : (response?.text ?? userQuery).trim();
      const cleanTopic = topic.replace(/["""''`]/g, '').replace(/^(der|die|das|the|a|an)\s+/i, '').trim();
      
      console.log('Extracted topic:', cleanTopic, 'from query:', userQuery);
      return cleanTopic || userQuery;
    } catch (e) {
      console.error('Topic extraction failed:', e);
      // Fallback extraction
      const words = userQuery.toLowerCase().split(' ');
      for (let i = 0; i < words.length; i++) {
        if (['ist', 'is', 'war', 'was', 'wer', 'who', 'what', 'wie', 'how'].includes(words[i]) && words[i + 1]) {
          return words.slice(i + 1).join(' ');
        }
      }
      return userQuery;
    }
  };

  // Search for news articles about a topic
  const searchNewsArticles = async (topic: string): Promise<string[]> => {
    try {
      const searchQuery = encodeURIComponent(`${topic} news article`);
      // Simple web search for news mentions
      const searches = [
        `site:spiegel.de ${topic}`,
        `site:zeit.de ${topic}`,
        `site:faz.net ${topic}`,
        `site:bbc.com ${topic}`,
        `site:cnn.com ${topic}`
      ];
      
      const newsLinks: string[] = [];
      for (const search of searches.slice(0, 3)) { // Limit to avoid rate limits
        try {
          // This is a simplified approach - in reality you'd use a proper news API
          const url = `https://www.google.com/search?q=${encodeURIComponent(search)}`;
          newsLinks.push(`🔗 ${search.split(' ')[0].replace('site:', '')}`);
        } catch (e) {
          console.error('News search error:', e);
        }
      }
      return newsLinks;
    } catch (e) {
      console.error('News search failed:', e);
      return [];
    }
  };

  // Ask the AI using Puter AI
  const askPuterAI = async (prompt: string): Promise<string> => {
    try {
      const puter = (window as any).puter;
      if (!puter?.ai?.chat) {
        throw new Error('Puter AI not available');
      }

      // Nudge language explicitly
      const localizedPrompt = language === 'de'
        ? `Antworte auf Deutsch. Frage: ${prompt}`
        : `Answer in English. Question: ${prompt}`;

      const response = await puter.ai.chat(localizedPrompt, { 
        model: 'claude-sonnet-4'
      });
      
      // Fix the [object] [object] issue by properly extracting the response text
      let responseText = '';
      if (typeof response === 'string') {
        responseText = response;
      } else if (response?.message?.content) {
        responseText = response.message.content;
      } else if (response?.text) {
        responseText = response.text;
      } else if (response?.content) {
        responseText = response.content;
      } else {
        responseText = JSON.stringify(response) || 'No response';
      }
      
      return responseText;
    } catch (e) {
      console.error('askPuterAI failed', e);
      return language === 'de' ? '❌ Fehler bei der KI-Antwort.' : '❌ Error getting AI response.';
    }
  };

  const stopListening = () => {
    setIsListening(false);
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
  };

  const startListening = async () => {
    try { 
      // Request microphone permission with enhanced mobile settings
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      }); 
      // Stop the stream immediately as we just needed permission
      stream.getTracks().forEach(track => track.stop());
    } catch (e) {
      alert(language === 'de' 
        ? 'Mikrofon-Zugriff verweigert. Bitte erlauben Sie den Mikrofon-Zugriff in den Browser-Einstellungen.'
        : 'Microphone access denied. Please allow microphone access in browser settings.'
      );
      return;
    }
    
    const SpeechRecognition: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages(prev => [...prev, { id: Date.now().toString(), text: language === 'de' ? 'Spracherkennung wird von deinem Browser nicht unterstützt.' : 'Speech recognition is not supported by your browser.', isUser: false, timestamp: new Date() }]);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = getSpeechLanguage();
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;
    
    // Mobile specific settings
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      recognition.continuous = false;
      recognition.interimResults = false;
    }
    
    recognitionRef.current = recognition;
    setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      setInputValue(transcript);
      
      // If final result, send it
      if (event.results[event.results.length - 1].isFinal || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        stopListening();
        sendSpeakPrompt(transcript);
      }
    };
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      stopListening();
    };
    recognition.onend = () => {};
    recognition.start();
  };

  const toggleSpeakMode = async () => {
    if (!puterReady) return;
    
    if (isListening) {
      stopListening();
    } else {
      await startListening();
    }
  };

  const sendSpeakPrompt = async (promptText: string) => {
    const text = promptText.trim();
    if (!text) return;
    
    // Speech mode: Pass text directly to processAIResponse like the input field
    const userMessage: Message = { id: Date.now().toString(), text, isUser: true, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    
    try {
      const response = await processAIResponse(text);
      const aiMessage: Message = { 
        id: (Date.now()+1).toString(), 
        text: response.text, 
        isUser: false, 
        timestamp: new Date(), 
        qrCode: response.qrCode,
        quizData: response.quizData,
        endConversationAvailable: response.endConversationAvailable || (searchMode === 'internet' && !isArticleMode)
      };
      setTimeout(() => {
        setMessages(prev => [...prev, aiMessage]);
        setIsTyping(false);
        // Always play TTS when using speech mode
        if (response.text && response.text.trim()) {
          playTTS(response.text);
        }
      }, 600);
    } catch (e) {
      setIsTyping(false);
    }
  };

  const searchArticles = (query: string) => {
    const lowerQuery = query.toLowerCase();
    const filtered = articles.filter(article => {
      const titleDe = article.title || '';
      const titleEn = article.titleEn || '';
      const excerptDe = article.excerpt || '';
      const excerptEn = article.excerptEn || '';
      const contentDe = article.content || '';
      const contentEn = article.contentEn || '';
      const categoryDe = article.category || '';
      const categoryEn = article.categoryEn || '';
      const haystack = [
        titleDe, titleEn, excerptDe, excerptEn, contentDe, contentEn,
        categoryDe, categoryEn, article.author, ...(article.tags || [])
      ].join(' ').toLowerCase();
      return haystack.includes(lowerQuery);
    });
    return filtered.slice(0, 8);
  };
  const detectLanguage = (text: string): 'de' | 'en' => {
    const germanWords = ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'ich', 'sie', 'er', 'wir', 'für', 'auf', 'mit', 'von', 'zu', 'am', 'im', 'über', 'dass', 'können', 'haben', 'werden', 'sein', 'nicht'];
    const englishWords = ['the', 'and', 'is', 'a', 'an', 'i', 'you', 'he', 'she', 'we', 'for', 'on', 'with', 'from', 'to', 'at', 'in', 'about', 'that', 'can', 'have', 'will', 'be', 'not'];
    
    const words = text.toLowerCase().split(/\s+/);
    let germanScore = 0;
    let englishScore = 0;
    
    words.forEach(word => {
      if (germanWords.includes(word)) germanScore++;
      if (englishWords.includes(word)) englishScore++;
    });
    
    return germanScore > englishScore ? 'de' : 'en';
  };

  const summarizeSelectedMessages = async () => {
    if (selectedMessages.length === 0) return;
    
    const messagesToSummarize = messages
      .filter(msg => selectedMessages.includes(msg.id))
      .map(msg => `${msg.isUser ? (language === 'de' ? 'Benutzer' : 'User') : 'AI'}: ${msg.text}`)
      .join('\n\n');
    
    try {
      setIsTyping(true);
      
      const prompt = language === 'de' 
        ? `Du bist ein Experte für die präzise Zusammenfassung von Texten. Deine Aufgabe ist es, den folgenden Text klar, strukturiert und verständlich zusammenzufassen. Stelle sicher, dass alle wesentlichen Informationen und Kernaussagen erhalten bleiben, aber entferne Füllwörter und unwichtige Details. Gib nur die Zusammenfassung aus.

Der zusammenzufassende Text lautet:
"${messagesToSummarize}"`
        : `You are an expert at precise text summarization. Your task is to summarize the following text clearly, structurally and comprehensibly. Make sure all essential information and key statements are preserved, but remove filler words and unimportant details. Only output the summary.

The text to be summarized is:
"${messagesToSummarize}"`;
      
      // Enhanced AI models - try kostenlosen models first, AIML as last resort
      const aiModels = [
        { name: 'OpenRouter Llama 3.1 405B', model: 'openrouter-llama', isOpenRouter: true },
        { name: 'GPT-5', model: 'gpt-5' },
        { name: 'Claude Sonnet 4', model: 'claude-sonnet-4' },
        { name: 'GPT-4.1', model: 'gpt-4.1' },
        { name: 'Claude Opus 4', model: 'claude-opus-4' },
        { name: 'GPT-4o', model: 'gpt-4o' },
        { name: 'o3-mini', model: 'o3-mini' },
        { name: 'o1-mini', model: 'o1-mini' },
        { name: 'Deepseek Chat', model: 'deepseek-chat' },
        { name: 'Deepseek Reasoner', model: 'deepseek-reasoner' },
        { name: 'Gemini 2.0 Flash', model: 'gemini-2.0-flash' },
        { name: 'Meta Llama 3.1 70B', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo' },
        { name: 'Mistral Large', model: 'mistral-large-latest' },
        { name: 'Grok Beta', model: 'grok-beta' }
      ];

      // Custom OpenRouter API function  
      const callOpenRouterAPI = async (promptText: string): Promise<string> => {
        try {
          const systemPrompt = language === 'de' 
            ? 'Du bist ein Experte für präzise Textzusammenfassung. Deine Aufgabe ist es, Texte klar, strukturiert und verständlich zusammenzufassen.'
            : 'You are an expert at precise text summarization. Your task is to summarize texts clearly, structurally and comprehensibly.';
          
          const fullPrompt = `${systemPrompt}\n\n${promptText}`;
          
          const { data, error } = await supabase.functions.invoke('openrouter-proxy', {
            body: { 
              prompt: fullPrompt,
              temperature: 0.7,
              model: 'x-ai/grok-4-fast:free',
              max_tokens: 400
            }
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          return data?.content || '';
        } catch (error) {
          console.error('OpenRouter API call failed:', error);
          throw error;
        }
      };
      
      const puter = (window as any).puter;
      let summaryText = '';
      let successfulModel = null;
      let lastError = null;
      
      // Try all AI models sequentially until one succeeds
      for (const aiModel of aiModels) {
        try {
          console.log(`🤖 Trying AI model for summary: ${aiModel.name} (${aiModel.model})`);
          
          let aiResponse;
          
          if (aiModel.isOpenRouter) {
            aiResponse = await callOpenRouterAPI(prompt);
          } else {
            if (!puter?.ai?.chat) {
              throw new Error('Puter AI not available');
            }
            aiResponse = await puter.ai.chat(prompt, {
              model: aiModel.model,
              max_tokens: 400,
              temperature: 0.7
            });
          }
          
          // Parse response
          let extractedText = '';
          if (typeof aiResponse === 'string') {
            extractedText = aiResponse.trim();
          } else if (aiResponse?.message?.content) {
            extractedText = aiResponse.message.content.trim();
          } else if (aiResponse?.text) {
            extractedText = aiResponse.text.trim();
          }
          
          // Validate response quality
          if (extractedText && 
              extractedText.length > 10 && 
              !extractedText.includes('[object Object]') &&
              extractedText !== 'undefined' &&
              extractedText !== 'null') {
            
            summaryText = extractedText;
            successfulModel = aiModel.name;
            console.log(`✅ Successfully got summary from ${aiModel.name}`);
            break;
          } else {
            console.log(`❌ Invalid response from ${aiModel.name}`);
            lastError = new Error(`Invalid response from ${aiModel.name}`);
          }
          
        } catch (modelError) {
          console.error(`❌ Model ${aiModel.name} failed:`, modelError);
          lastError = modelError;
        }
      }
      
      if (!successfulModel) {
        throw new Error('All AI models failed for summarization');
      }
      
      const summaryMessage: Message = {
        id: Date.now().toString(),
        text: language === 'de' 
          ? `📝 **Zusammenfassung ausgewählter Nachrichten** (${successfulModel})\n\n${summaryText}`
          : `📝 **Summary of Selected Messages** (${successfulModel})\n\n${summaryText}`,
        isUser: false,
        timestamp: new Date(),
        showPdfDownloadButton: true
      };
      
      setMessages(prev => [...prev, summaryMessage]);
      setSelectedMessages([]);
      setSummaryMode(false);
    } catch (error) {
      console.error('Summarization failed:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        text: language === 'de' 
          ? '❌ Fehler beim Zusammenfassen der Nachrichten. Alle verfügbaren AI-Modelle sind momentan nicht erreichbar. Versuchen Sie es später erneut.'
          : '❌ Error summarizing messages. All available AI models are currently unreachable. Try again later.',
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const checkForSummaryCommand = (text: string): boolean => {
    const normalizedText = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
    
    // German keywords
    if (language === 'de') {
      const germanWords = ['fasse', 'informationen', 'zusammen'];
      const hasAllGermanWords = germanWords.every(word => 
        normalizedText.includes(word) || normalizedText.includes(word.replace('ß', 'ss'))
      );
      if (hasAllGermanWords) return true;
    }
    
    // English keywords
    const englishWords = ['summarize', 'information'];
    const hasAllEnglishWords = englishWords.every(word => normalizedText.includes(word));
    
    return hasAllEnglishWords;
  };

  const checkForQuizCommand = (text: string): boolean => {
    const normalizedText = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
    
    // German keywords
    if (language === 'de') {
      const germanWords = ['erstelle', 'informations', 'quiz'];
      const hasAllGermanWords = germanWords.every(word => normalizedText.includes(word));
      if (hasAllGermanWords) return true;
    }
    
    // English keywords
    const englishWords = ['create', 'information', 'quiz'];
    const hasAllEnglishWords = englishWords.every(word => normalizedText.includes(word));
    
    return hasAllEnglishWords;
  };

  const generateInformationQuiz = async () => {
    if (selectedMessages.length === 0) return;
    
    const messagesToQuiz = messages
      .filter(msg => selectedMessages.includes(msg.id))
      .map(msg => `${msg.isUser ? (language === 'de' ? 'Benutzer' : 'User') : 'AI'}: ${msg.text}`)
      .join('\n\n');

    // Persist the first Information-Quiz context (only once)
    if (!infoQuizSeedContent) {
      setInfoQuizSeedContent(messagesToQuiz);
      setInfoQuizSeedSource(language === 'de' ? 'Ausgewählte Nachrichten' : 'Selected messages');
      setInfoQuizActive(true);
    }
    
    try {
      setIsTyping(true);
      
      const prompt = language === 'de' 
        ? `Du bist eine Quiz-Erstellungs-Engine. Erstelle aus dem gegebenen Kontext ein Quiz im folgenden Format:
Frage;Antwort1;Antwort2;Antwort3;Antwort4;Richtige_Antwort

Beispiel:
Was ist die Hauptstadt von Deutschland?;München;Hamburg;Berlin;Köln;Berlin

**Kontext für das zu erstellende Quiz:**
"${messagesToQuiz}"

Wichtig: Erstelle GENAU ein Quiz basierend auf dem bereitgestellten Kontext. Gib NUR das Quiz im exakten Format "Frage;Option1;Option2;Option3;Option4;Richtige_Antwort" aus, ohne zusätzlichen Text, Erklärungen oder Kommentare. Die richtige Antwort muss eine der vier Optionen sein.`
        : `You are a quiz creation engine. Create a quiz from the given context in the following format:
Question;Option1;Option2;Option3;Option4;Correct_Answer

Example:
What is the capital of Germany?;Munich;Hamburg;Berlin;Cologne;Berlin

**Context for the quiz to be created:**
"${messagesToQuiz}"

Important: Create EXACTLY one quiz based on the provided context. Output ONLY the quiz in the exact format "Question;Option1;Option2;Option3;Option4;Correct_Answer", without additional text, explanations, or comments. The correct answer must be one of the four options.`;
      
      try {
        console.log('🤖 Using OpenRouter API for quiz generation');
        
        const { data, error } = await supabase.functions.invoke('openrouter-proxy', {
          body: { 
            prompt: prompt,
            temperature: 0.7,
            model: 'x-ai/grok-4-fast:free',
            max_tokens: 500
          }
        });

        if (error) {
          throw error;
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        const quizText = data?.content?.trim() || '';
        
        if (quizText && quizText.length > 10) {
          // Parse the semicolon-separated format
          const quizMessage: Message = {
            id: Date.now().toString(),
            text: `SEMICOLON_QUIZ:${quizText}`,
            isUser: false,
            timestamp: new Date()
          };
          
          setMessages(prev => [...prev, quizMessage]);
          console.log('✅ Successfully created quiz');
        } else {
          throw new Error('Invalid quiz response');
        }
        
      } catch (error) {
        console.error('OpenRouter API failed:', error);
        throw error;
      }
      
      setSelectedMessages([]);
      setQuizInfoMode(false);
    } catch (error) {
      console.error('Quiz generation failed:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        text: language === 'de' 
          ? '❌ Fehler beim Erstellen des Quiz. Versuchen Sie es später erneut.'
          : '❌ Error creating quiz. Try again later.',
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const parseSemicolonQuiz = (text: string) => {
    if (!text.startsWith('SEMICOLON_QUIZ:')) return null;
    
    const quizContent = text.replace('SEMICOLON_QUIZ:', '').trim();
    
    // Handle potential extra text from AI - find the line with semicolons
    const lines = quizContent.split('\n');
    let quizLine = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      // Look for a line with exactly 5 semicolons (6 parts total)
      if (trimmedLine.includes(';') && trimmedLine.split(';').length === 6) {
        quizLine = trimmedLine;
        break;
      }
    }
    
    if (!quizLine) {
      console.error('Could not find valid quiz format in response:', quizContent);
      return null;
    }
    
    const parts = quizLine.split(';').map(part => part.trim());
    
    if (parts.length !== 6) {
      console.error('Invalid quiz format - expected 6 parts, got:', parts.length, parts);
      return null;
    }
    
    const [question, option1, option2, option3, option4, correctAnswer] = parts;
    
    // Validate that correct answer is one of the options
    const options = [option1, option2, option3, option4];
    if (!options.includes(correctAnswer)) {
      console.error('Correct answer not found in options:', correctAnswer, options);
      return null;
    }
    
    return [{
      question: question,
      answers: options,
      correctAnswer: correctAnswer,
      selectedAnswer: null,
      showResult: false
    }];
  };

  // Generate a strict Information-Quiz from the persisted seed context
  const generateStrictInfoQuizFromSeed = async () => {
    if (!infoQuizSeedContent) {
      console.warn('No infoQuizSeedContent set. Falling back.');
      return;
    }
    setIsTyping(true);
    try {
      // Gather all previous quiz questions (avoid repeats)
      const previousQuizQuestions = messages
        .filter(m => !m.isUser && typeof m.text === 'string' && m.text.startsWith('SEMICOLON_QUIZ:'))
        .map(m => {
          const content = m.text.replace('SEMICOLON_QUIZ:', '').trim();
          const line = content.split('\n').find(l => l.includes(';') && l.split(';').length === 6) || content;
          return line.split(';')[0].trim();
        });

      const promptDe = `Du bist eine strenge Quiz-Erstellungs-Engine. Erstelle GENAU EIN Quiz NUR aus dem folgenden Kontext.

Format: Frage;Antwort1;Antwort2;Antwort3;Antwort4;Richtige_Antwort
- Verwende ausschließlich Fakten (Zahlen, Namen, Orte, Daten) aus dem Kontext
- Keine Erfindungen, keine externen Kenntnisse
- Die richtige Antwort MUSS eine der vier Optionen sein
- Wenn der Kontext nicht ausreicht, antworte exakt: NO_QUIZ_POSSIBLE
${previousQuizQuestions.length ? `\nBereits behandelte Quizzes (verwende ANDERE Fragen): ${previousQuizQuestions.map((q, i) => `${i + 1}. ${q}`).join(' ')}` : ''}
${infoQuizSeedSource ? `\nQuelle: ${infoQuizSeedSource}` : ''}
\nKontext:\n"""\n${infoQuizSeedContent}\n"""`;

      const promptEn = `You are a strict quiz-generation engine. Create EXACTLY ONE quiz ONLY from the context below.

Format: Question;Option1;Option2;Option3;Option4;Correct_Answer
- Use only facts (numbers, names, places, dates) from the context
- No inventions, no outside knowledge
- The correct answer MUST be one of the four options
- If the context is insufficient, reply exactly: NO_QUIZ_POSSIBLE
${previousQuizQuestions.length ? `\nPrevious quizzes covered (use DIFFERENT questions): ${previousQuizQuestions.map((q, i) => `${i + 1}. ${q}`).join(' ')}` : ''}
${infoQuizSeedSource ? `\nSource: ${infoQuizSeedSource}` : ''}
\nContext:\n"""\n${infoQuizSeedContent}\n"""`;

      const prompt = language === 'de' ? promptDe : promptEn;

      const { data, error } = await supabase.functions.invoke('openrouter-proxy', {
        body: { 
          prompt: prompt,
          temperature: 0.2,
          model: 'x-ai/grok-4-fast:free',
          max_tokens: 400
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      const raw = data?.content?.trim() || '';
      if (/^NO_QUIZ_POSSIBLE$/i.test(raw)) {
        throw new Error(language === 'de' ? 'Nicht genug Informationen im Kontext für ein weiteres Quiz.' : 'Not enough information in the context for another quiz.');
      }

      const lines = raw.split('\n').map(l => l.trim());
      const quizLine = lines.find(l => l.includes(';') && l.split(';').length === 6) || '';
      if (!quizLine) throw new Error('Invalid quiz response');

      const quizMessage: Message = {
        id: Date.now().toString(),
        text: `SEMICOLON_QUIZ:${quizLine}`,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, quizMessage]);
    } catch (error) {
      console.error('generateStrictInfoQuizFromSeed failed:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        text: language === 'de'
          ? '❌ Quiz konnte nicht aus dem ersten Kontext erstellt werden. '
          + (infoQuizSeedSource ? `Quelle: ${infoQuizSeedSource}` : '')
          : '❌ Failed to create quiz from the initial context.',
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };
  const parseInteractiveQuiz = (text: string) => {
    if (!text.startsWith('INTERACTIVE_INFO_QUIZ:')) return null;
    
    const quizContent = text.replace('INTERACTIVE_INFO_QUIZ:', '');
    const quizStart = quizContent.indexOf('QUIZ_START');
    const quizEnd = quizContent.indexOf('QUIZ_END');
    
    if (quizStart === -1 || quizEnd === -1) return null;
    
    const quizData = quizContent.substring(quizStart + 10, quizEnd);
    const questions: any[] = [];
    
    for (let i = 1; i <= 3; i++) {
      const questionMatch = quizData.match(new RegExp(`QUESTION_${i}: (.+?)(?=A\\))`));
      const answersMatch = quizData.match(new RegExp(`A\\) (.+?)\\s*B\\) (.+?)\\s*C\\) (.+?)\\s*D\\) (.+?)\\s*CORRECT_${i}:`));
      const correctMatch = quizData.match(new RegExp(`CORRECT_${i}: ([ABCD])`));
      const explanationMatch = quizData.match(new RegExp(`EXPLANATION_${i}: (.+?)(?=QUESTION_|QUIZ_END|$)`));
      
      if (questionMatch && answersMatch && correctMatch && explanationMatch) {
        questions.push({
          question: questionMatch[1].trim(),
          answers: [
            answersMatch[1].trim(),
            answersMatch[2].trim(),
            answersMatch[3].trim(),
            answersMatch[4].trim()
          ],
          correctAnswer: correctMatch[1],
          explanation: explanationMatch[1].trim(),
          selectedAnswer: null,
          showResult: false
        });
      }
    }
    
    return questions.length === 3 ? questions : null;
  };

  const [quizStates, setQuizStates] = useState<{ [messageId: string]: any[] }>({});

  const processAIResponse = async (userInput: string): Promise<{ text: string; qrCode?: string; quizData?: any; endConversationAvailable?: boolean }> => {
    const input = userInput.toLowerCase();
    const detectedLanguage = detectLanguage(userInput);

    // Explicit "Next Quiz" typed by user (DE/EN)
    const typedNextQuiz = (
      input.includes('nächstes quiz') ||
      input.includes('weiteres quiz') ||
      input.includes('next quiz')
    );
    if (typedNextQuiz && (searchMode === 'internet' || isArticleMode || isInDetailMode)) {
      if (infoQuizSeedContent) {
        await generateStrictInfoQuizFromSeed();
        return { text: '' };
      }
      if (isInDetailMode && currentArticleContent) {
        await handleDetailedQuestion(userInput);
        return { text: '' };
      }
      // Fallback to normal flow if no seed/context
    }
    
    // Check for "show me all articles" in local mode
    if (searchMode === 'local' && (
      input.includes('zeig mir alle artikel') || 
      input.includes('show me all articles') ||
      input.includes('alle artikel zeigen') ||
      input.includes('show all articles')
    )) {
      // Navigate to homepage (which shows all articles)
      navigate('/');
      const responseText = language === 'de' 
        ? '📰 Perfekt! Ich bringe Sie zur Startseite mit allen Artikeln. Dort können Sie alle verfügbaren Artikel durchstöbern.'
        : '📰 Perfect! I\'ll take you to the homepage with all articles. There you can browse through all available articles.';
      return { text: responseText };
    }
    
    // Check for user search in local mode
    if (searchMode === 'local') {
      const userSearchPatterns = [
        /how\s+is\s+(.+)/i,
        /who\s+is\s+(.+)/i,
        /wie\s+ist\s+(.+)/i,
        /wer\s+ist\s+(.+)/i
      ];
      
      let searchUser = null;
      for (const pattern of userSearchPatterns) {
        const match = userInput.match(pattern);
        if (match && match[1]) {
          searchUser = match[1].trim().replace(/[?.!]+$/, '');
          break;
        }
      }
      
      if (searchUser) {
        console.log('Searching for user:', searchUser);
        
        // Import employees data
        const { employees } = await import('@dailyfun/data/employees');
        
        // Find matching user by name
        const matchingUser = employees.find(employee => {
          const nameParts = employee.name.toLowerCase().split(' ');
          const searchParts = searchUser.toLowerCase().split(' ');
          
          // Remove titles for comparison
          const cleanNameParts = nameParts.filter(part => !['herr', 'dr.', 'dr'].includes(part));
          const cleanSearchParts = searchParts.filter(part => !['herr', 'dr.', 'dr'].includes(part));
          
          // Check if search matches any part of the name
          return cleanSearchParts.some(searchPart => 
            cleanNameParts.some(namePart => 
              namePart.includes(searchPart) || searchPart.includes(namePart)
            )
          );
        });
        
        if (matchingUser) {
          const description = language === 'de' ? matchingUser.descriptionDe : matchingUser.descriptionEn;
          const categories = language === 'de' ? matchingUser.categories : matchingUser.categoriesEn;
          
          // Get additional profile information from company database
          let additionalInfo = '';
          if (matchingUser.name === 'Stefan Kunc') {
            additionalInfo = `\n> *"${companyDatabase.founder.vision}"*\n\n`;
          } else {
            // Find team member info
            const teamMember = companyDatabase.team.find(member => 
              member.name === matchingUser.name || 
              member.name === `Mr. ${matchingUser.name}` ||
              member.name === `Dr. ${matchingUser.name}` ||
              matchingUser.name.includes(member.name.replace('Mr. ', '').replace('Dr. ', ''))
            );
            
            if (teamMember) {
              additionalInfo = `\n> *"${teamMember.description}"*\n\n`;
            }
          }
          
          let result = `
# 👤 ${language === 'de' ? 'Profil' : 'Profile'}: ${matchingUser.name}

[![${matchingUser.name}](${matchingUser.image})](javascript:window.location.href='/search?author=${matchingUser.id}')

---

## 💼 ${language === 'de' ? 'Berufliche Rolle' : 'Professional Role'}

${description}

## 🏷️ ${language === 'de' ? 'Fachbereiche' : 'Expertise Areas'}

${categories.map(category => `\`${category}\``).join(' • ')}
${additionalInfo}
---

**[🔍 ${language === 'de' ? 'Vollständiges Profil anzeigen' : 'View Full Profile'}](/search?author=${matchingUser.id})**`;
          
          return { text: result, endConversationAvailable: false };
        } else {
          const availableUsers = employees.map(emp => emp.name).join(', ');
          const noResultsText = language === 'de'
            ? `🔍 Keine Person namens "${searchUser}" gefunden.\n\n👥 **Verfügbare Personen:** ${availableUsers}\n\n💡 **Tipp:** Versuchen Sie es mit "How is Stefan" oder "How is Elke"`
            : `🔍 No person named "${searchUser}" found.\n\n👥 **Available people:** ${availableUsers}\n\n💡 **Tip:** Try "How is Stefan" or "How is Elke"`;
          
          return { text: noResultsText, endConversationAvailable: false };
        }
      }
    }
    
    // Check for category search in local mode
    if (searchMode === 'local') {
      const categorySearchPatterns = [
        /(?:search|find|show)\s+articles?\s+by\s+category\s+(.+)/i,
        /(?:suche|finde|zeige?)\s+artikel\s+(?:der|in|nach)\s+kategorie\s+(.+)/i,
        /(?:find|show)\s+pages?\s+about\s+(.+)/i,
        /(?:finde|zeige?)\s+seiten?\s+(?:über|zu|zum\s+thema)\s+(.+)/i
      ];
      
      let searchCategory = null;
      for (const pattern of categorySearchPatterns) {
        const match = userInput.match(pattern);
        if (match && match[1]) {
          searchCategory = match[1].trim().toLowerCase();
          break;
        }
      }
      
      if (searchCategory) {
        console.log('Searching by category:', searchCategory);
        
        // Import employees data
        const { employees } = await import('@dailyfun/data/employees');
        
        // Find matching authors by category
        const matchingAuthors = employees.filter(employee => {
          const categories = language === 'de' ? employee.categories : employee.categoriesEn;
          return categories.some(cat => cat.toLowerCase().includes(searchCategory));
        });
        
        if (matchingAuthors.length > 0) {
          let result = `# 🎯 ${language === 'de' ? 'Kategorie-Experten' : 'Category Experts'}: "${searchCategory}"\n\n`;
          result += `*${language === 'de' ? 'Unsere Fachexperten in diesem Bereich' : 'Our subject matter experts in this field'}*\n\n`;
          result += `---\n\n`;
          
          matchingAuthors.forEach((author, index) => {
            const description = language === 'de' ? author.descriptionDe : author.descriptionEn;
            const categories = language === 'de' ? author.categories : author.categoriesEn;
            
            result += `## 👤 [${author.name}](/search?author=${author.id})\n\n`;
            result += `[![${author.name}](${author.image})](/search?author=${author.id})\n\n`;
            result += `${description}\n\n`;
            result += `**🏷️ ${language === 'de' ? 'Fachbereiche' : 'Expertise Areas'}:** ${categories.map(cat => `\`${cat}\``).join(' • ')}\n\n`;
            
            if (index < matchingAuthors.length - 1) {
              result += `---\n\n`;
            }
          });
          
          result += `\n\n> **🔍 ${matchingAuthors.length} ${language === 'de' ? 'Experten gefunden' : 'Experts Found'}**\n\n`;
          result += `*${language === 'de' ? 'Klicken Sie auf einen Namen oder ein Bild, um das vollständige Profil zu öffnen!' : 'Click on a name or image to open the full profile!'}*`;
          
          return { text: result, endConversationAvailable: false };
        } else {
          const noResultsText = language === 'de'
            ? `🔍 Keine Experten oder Artikel für Kategorie "${searchCategory}" gefunden.\n\n💡 **Verfügbare Kategorien:** Technology, Wissenschaft, Humor, Gesellschaft, Politik, Innovation, Gaming`
            : `🔍 No experts or articles found for category "${searchCategory}".\n\n💡 **Available categories:** Technology, Science, Humor, Society, Politics, Innovation, Gaming`;
          
          return { text: noResultsText, endConversationAvailable: false };
        }
      }
      
      const articleSearchPatterns = [
        /(?:finde|suche|zeige?)\s+artikel\s+(?:über|zu|von|mit|zum\s+thema)\s+(.+)/i,
        /(?:find|search|show)\s+articles?\s+(?:about|on|with|for|regarding)\s+(.+)/i,
        /artikel\s+(?:über|zu|zum\s+thema)\s+(.+)/i,
        /articles?\s+(?:about|on|regarding)\s+(.+)/i
      ];
      
      let searchTopic = null;
      for (const pattern of articleSearchPatterns) {
        const match = userInput.match(pattern);
        if (match && match[1]) {
          searchTopic = match[1].trim().toLowerCase();
          break;
        }
      }
      
      if (searchTopic) {
        console.log('Searching articles for topic:', searchTopic);
        
        // Search through articles
        const matchingArticles = articles.filter(article => {
          const titleDe = article.title?.toLowerCase() || '';
          const titleEn = article.titleEn?.toLowerCase() || '';
          const categoryDe = article.category?.toLowerCase() || '';
          const categoryEn = article.categoryEn?.toLowerCase() || '';
          const excerptDe = article.excerpt?.toLowerCase() || '';
          const excerptEn = article.excerptEn?.toLowerCase() || '';
          const tags = article.tags?.map(tag => tag.toLowerCase()) || [];
          const contentDe = article.content?.toLowerCase() || '';
          const contentEn = article.contentEn?.toLowerCase() || '';
          
          // Check for matches in various fields
          return titleDe.includes(searchTopic) ||
                 titleEn.includes(searchTopic) ||
                 categoryDe.includes(searchTopic) ||
                 categoryEn.includes(searchTopic) ||
                 excerptDe.includes(searchTopic) ||
                 excerptEn.includes(searchTopic) ||
                 tags.some(tag => tag.includes(searchTopic)) ||
                 contentDe.includes(searchTopic) ||
                 contentEn.includes(searchTopic);
        });
        
        if (matchingArticles.length > 0) {
          let result = `# 📰 ${language === 'de' ? 'Artikel-Sammlung' : 'Article Collection'}: "${searchTopic}"\n\n`;
          result += `*${language === 'de' ? 'Passende Artikel aus unserer Redaktion' : 'Matching articles from our editorial team'}*\n\n`;
          result += `---\n\n`;
          
          matchingArticles.forEach((article, index) => {
            const title = language === 'de' ? article.title : (article.titleEn || article.title);
            const excerpt = language === 'de' ? article.excerpt : (article.excerptEn || article.excerpt);
            const category = language === 'de' ? article.category : (article.categoryEn || article.category);
            
            result += `## [${title}](/article/${article.id})\n\n`;
            result += `[![${title}](${article.imageUrl})](/article/${article.id})\n\n`;
            result += `${excerpt.substring(0, 150)}${excerpt.length > 150 ? '...' : ''}\n\n`;
            result += `📂 **${category}** | ✍️ **${article.author}** | 👁️ ${article.views.toLocaleString()} ${language === 'de' ? 'Aufrufe' : 'views'}\n\n`;
            
            if (index < matchingArticles.length - 1) {
              result += `---\n\n`;
            }
          });
          
          result += `\n\n> **🔍 ${matchingArticles.length} ${language === 'de' ? 'Artikel gefunden' : 'Articles Found'}**\n\n`;
          result += `*${language === 'de' ? 'Klicken Sie auf einen Titel oder ein Bild, um den vollständigen Artikel zu lesen!' : 'Click on a title or image to read the full article!'}*`;
          
          return { text: result, endConversationAvailable: false };
        } else {
          const noResultsText = language === 'de'
            ? `📰 Leider keine Artikel zum Thema "${searchTopic}" gefunden.\n\n💡 **Verfügbare Kategorien:** Wissenschaft, Technology, Humor, Gesellschaft, Politik\n\n🔍 **Tipp:** Versuchen Sie es mit anderen Suchbegriffen oder [zeigen Sie alle Artikel](/) an.`
            : `📰 Unfortunately, no articles found about "${searchTopic}".\n\n💡 **Available categories:** Science, Technology, Humor, Society, Politics\n\n🔍 **Tip:** Try different search terms or [view all articles](/).`;
          
          return { text: noResultsText, endConversationAvailable: false };
        }
      }
    }
    
    // Check for summary command
    if (checkForSummaryCommand(userInput)) {
      await summarizeSelectedMessages();
      return { text: '' }; // Return empty to prevent duplicate message
    }
    
    // Check for quiz command - but handle "next quiz" scenario differently
    if (checkForQuizCommand(userInput)) {
      // Check if this is a "next quiz" request in internet search or article mode (case-insensitive)
      const isNextQuizRequest = input.includes('weiteres') && input.includes('quiz') && 
                               (searchMode === 'internet' || isArticleMode);
      
      if (isNextQuizRequest) {
        // If we have a persisted seed, always use it for follow-up quizzes
        if (infoQuizSeedContent) {
          await generateStrictInfoQuizFromSeed();
          return { text: '' };
        }
        // Else if we're in detail mode with a stored article, use the detailed handler
        if (isInDetailMode && currentArticleContent) {
          await handleDetailedQuestion(userInput);
          return { text: '' };
        }
        // Otherwise continue with normal flow below
      } else {
        // Regular quiz generation from selected messages
        await generateInformationQuiz();
        return { text: '' }; // Return empty to prevent duplicate message
      }
    }
    
    // Quiz generation - auto-detect quiz requests
    if (quizMode || input.includes('quiz') || 
        (language === 'de' && (input.includes('erstell') || input.includes('frag'))) ||
        (language === 'en' && (input.includes('create') || input.includes('generat')))) {
      // Prefer strict information-quiz from the persisted seed when available
      if (infoQuizSeedContent && (searchMode === 'internet' || isArticleMode || isInDetailMode)) {
        await generateStrictInfoQuizFromSeed();
        setQuizMode(false);
        return { text: '' };
      }
      setQuizMode(false);
      return await generateQuiz(userInput);
    }

    // QR Code generation
    if (qrMode) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = userInput.match(urlRegex);
      
      if (urls && urls.length > 0) {
        const url = urls[0];
        try {
          const qrCodeDataUrl = await generateQRCode(url);
          const responseText = language === 'de' 
            ? `QR Code erfolgreich erstellt für: ${url}\n\nSie können den QR Code herunterladen oder direkt verwenden!`
            : `QR Code successfully created for: ${url}\n\nYou can download the QR code or use it directly!`;
          setQrMode(false);
          return { text: responseText, qrCode: qrCodeDataUrl };
        } catch (error) {
          const errorText = language === 'de'
            ? 'Fehler beim Erstellen des QR Codes. Bitte überprüfen Sie den Link.'
            : 'Error creating QR code. Please check the link.';
          setQrMode(false);
          return { text: errorText };
        }
      } else {
        const helpText = language === 'de'
          ? 'Bitte senden Sie mir einen gültigen Link (beginnend mit http:// oder https://), um einen QR Code zu erstellen.\n\nBeispiel: https://www.example.com'
          : 'Please send me a valid link (starting with http:// or https://) to create a QR code.\n\nExample: https://www.example.com';
        return { text: helpText };
      }
    }

    // If we have article context, use it with the user's question
    if (articleContext && searchMode === 'internet') {
      try {
        // Clean article content by removing image filenames and prompts
        const cleanArticleContent = articleContext
          .replace(/<img[^>]*>/g, '') // Remove img tags
          .replace(/\/lovable-uploads\/[^"'\s]*/g, '') // Remove image paths
          .replace(/>>.*?<</g, '') // Remove >>prompt<< patterns
          .replace(/\n\s*\n/g, '\n') // Clean up extra newlines
          .trim();

        // Combine user question with clean article content
        const combinedPrompt = language === 'de' 
          ? `Basierend auf folgendem Artikel-Inhalt: "${cleanArticleContent}"\n\nBitte beantworte diese Frage: ${userInput}`
          : `Based on the following article content: "${cleanArticleContent}"\n\nPlease answer this question: ${userInput}`;

        // Use Lovable AI Gateway with Gemini for article-based analysis
        console.log('🤖 Using Lovable AI Gateway with Gemini for article analysis');
        
        const systemPrompt = language === 'de' 
          ? 'Du bist ein hilfreicher AI-Assistent, der Fragen zu Artikeln beantwortet. Gib fundierte, informative Antworten basierend auf dem bereitgestellten Artikel-Inhalt.'
          : 'You are a helpful AI assistant that answers questions about articles. Provide well-informed, informative answers based on the provided article content.';
        
        const { data, error } = await supabase.functions.invoke('lovable-ai-proxy', {
          body: { 
            prompt: combinedPrompt,
            systemPrompt: systemPrompt,
            temperature: 0.7,
            model: 'google/gemini-2.5-flash',
            max_tokens: 500
          }
        });

        if (error) {
          throw error;
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        const aiResponse = data?.content || '';
        
        if (aiResponse && aiResponse.trim().length > 10) {
          const responseHeader = language === 'de' ? '🤖 **AI-Antwort basierend auf dem Artikel:**' : '🤖 **AI Answer based on the article:**';
          return { text: `${responseHeader}\n\n${aiResponse.trim()}`, endConversationAvailable: false };
        } else {
          throw new Error('Invalid response from OpenRouter API');
        }
      } catch (error) {
        console.error('❌ Article analysis failed:', error);
        const errorText = language === 'de' 
          ? 'Entschuldigung, die Artikel-Analyse ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut.'
          : 'Sorry, article analysis is currently unavailable. Please try again later.';
        return { text: errorText };
      }
    }

    // Internet search mode (Wikipedia + AI analysis + News search)
    if (searchMode === 'internet') {
      const langCode: 'de' | 'en' = language === 'de' ? 'de' : 'en'
      try {
        // REMOVED DEEP DIVE FUNCTIONALITY - Always start fresh search
        // No more follow-up context to prevent unwanted deep dives

        // Extract main topic from user's question using AI
        const extractedTopic = await extractTopicFromQuery(userInput);
        console.log('Searching Wikipedia for:', extractedTopic);
        
        // Search Wikipedia using extracted topic with better error handling
        const searchUrl = `https://${langCode}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(extractedTopic)}&utf8=&format=json&origin=*&srlimit=3`
        let sRes, sData, first;
        
        try {
          sRes = await fetch(searchUrl);
          if (!sRes.ok) throw new Error(`Search failed: ${sRes.status}`);
          sData = await sRes.json() as any;
          first = sData?.query?.search?.[0];
        } catch (searchError) {
          console.error('Wikipedia search error:', searchError);
          // Try fallback search with simpler query
          const fallbackUrl = `https://${langCode}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(extractedTopic.split(' ')[0])}&utf8=&format=json&origin=*&srlimit=1`
          try {
            sRes = await fetch(fallbackUrl);
            sData = await sRes.json() as any;
            first = sData?.query?.search?.[0];
          } catch (fallbackError) {
            console.error('Fallback search also failed:', fallbackError);
          }
        }
        
        if (first) {
          const title = first.title as string
          console.log('Found Wikipedia article:', title);
          
          // Get full article summary with better error handling
          const sumUrl = `https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
          let sumRes, sumData;
          
          try {
            sumRes = await fetch(sumUrl);
            if (!sumRes.ok) throw new Error(`Summary fetch failed: ${sumRes.status}`);
            sumData = await sumRes.json() as any;
          } catch (summaryError) {
            console.error('Wikipedia summary error:', summaryError);
            // Use search snippet as fallback
            sumData = { extract: first.snippet?.replace(/<[^>]*>/g, '') || 'Keine Zusammenfassung verfügbar.' };
          }
          const extract = sumData?.extract || (language === 'de' ? 'Keine Zusammenfassung verfügbar.' : 'No summary available.');
          console.log('Wikipedia extract:', extract);
          
          // Set seed for future questions
          setInternetSeed({ 
            firstQuery: userInput, 
            title, 
            lang: langCode, 
            link: `https://${langCode}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` 
          });
          
          // Use the optimized three-part response format
          await waitForPuterReady();
          const puter = (window as any).puter;
          
          // First show Wikipedia content
          const wikipediaHeader = language === 'de' ? '🌐 **Wikipedia:**' : '🌐 **Wikipedia:**';
          let wikipediaContent = `${wikipediaHeader}\n${extract}`;
          
          // Add Wikipedia source link
          const linkText = language === 'de' 
            ? `\n\n🔗 **Wikipedia-Quelle:** [${title}](https://${langCode}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))})`
            : `\n\n🔗 **Wikipedia Source:** [${title}](https://${langCode}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))})`;
          
          // Fetch articles first to get URLs for additional context
          let firstArticleContent = '';
          let firstArticleUrl = '';
          let relatedArticles = [];

          // Fetch related articles using Guardian API first
          let articlesSection = '';
          let successfulNewsAPI = null;
          let lastNewsError = null;
          
          // Try Guardian API first
          try {
            console.log('🗞️ Trying Guardian API for:', extractedTopic);
            const guardianApiKey = '0be420a7-af7b-45e9-b5cb-04afb863e15c';
            const guardianUrl = `https://content.guardianapis.com/search?q=${encodeURIComponent(extractedTopic)}&api-key=${guardianApiKey}&show-fields=headline,trailText&page-size=5&order-by=relevance`;
            
            const guardianResponse = await fetch(guardianUrl);
            if (guardianResponse.ok) {
              const guardianData = await guardianResponse.json();
              const articles = guardianData.response?.results || [];
              
              if (articles.length > 0) {
                console.log('✅ Guardian API successful, found', articles.length, 'articles');
                
                // Store first article for AI context
                firstArticleUrl = articles[0].webUrl;
                relatedArticles = articles;
                
                // Try to fetch content from first article using web scraping
                try {
                  console.log('🔍 Fetching content from first article:', firstArticleUrl);
                  const proxyResponse = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(firstArticleUrl)}`);
                  if (proxyResponse.ok) {
                    const proxyData = await proxyResponse.json();
                    const htmlContent = proxyData.contents;
                    
                    // Extract text content from HTML
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(htmlContent, 'text/html');
                    
                    // Try to find article content (Guardian-specific selectors)
                    const articleContent = doc.querySelector('[data-gu-name="body"]') || 
                                         doc.querySelector('.content__article-body') ||
                                         doc.querySelector('.article-body');
                    
                    if (articleContent) {
                      firstArticleContent = articleContent.textContent?.substring(0, 1500) || '';
                      console.log('✅ First article content fetched successfully');
                    }
                  }
                } catch (fetchError) {
                  console.log('❌ Could not fetch article content:', fetchError);
                }
                
                const articlesHeader = language === 'de' ? '\n\n**📰 Weitere Artikel zu diesem Thema:**' : '\n\n**📰 More Articles on this Topic:**';
                const articleButtons = articles.map((article: any, index: number) => {
                  const headline = article.fields?.headline || article.webTitle;
                  const shortTitle = headline.length > 60 ? headline.substring(0, 57) + '...' : headline;
                  return `[${shortTitle}](${article.webUrl})`;
                }).join('\n');
                
                articlesSection = `${articlesHeader}\n${articleButtons}`;
                successfulNewsAPI = 'Guardian';
              } else {
                throw new Error('No articles found in Guardian API');
              }
            } else {
              throw new Error(`Guardian API error: ${guardianResponse.status}`);
            }
          } catch (guardianError) {
            console.error('❌ Guardian API failed:', guardianError);
            lastNewsError = guardianError;
            
            // Fallback to secure news API edge function
            try {
              console.log('🗞️ Trying secure news API for:', extractedTopic);
              
              const newsResponse = await supabase.functions.invoke('fetch-news', {
                body: { 
                  topic: extractedTopic,
                  language: language === 'de' ? 'de' : 'en'
                }
              });
              
              if (newsResponse.error) {
                throw new Error(newsResponse.error.message || 'News API error');
              }
              
              const newsData = await newsResponse.data;
              const articles = newsData?.articles || [];
                
                if (articles.length > 0) {
                  console.log(`✅ News API successful (${newsData.source}), found`, articles.length, 'articles');
                  
                  // Store first article for AI context if not already set
                  if (!firstArticleUrl) {
                    firstArticleUrl = articles[0].url;
                    relatedArticles = articles;
                    
                    // Try to fetch content from first article
                    try {
                      console.log('🔍 Fetching content from first article:', firstArticleUrl);
                      const proxyResponse = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(firstArticleUrl)}`);
                      if (proxyResponse.ok) {
                        const proxyData = await proxyResponse.json();
                        const htmlContent = proxyData.contents;
                        
                        // Extract text content from HTML
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(htmlContent, 'text/html');
                        
                        // Try common article selectors
                        const articleContent = doc.querySelector('article') || 
                                             doc.querySelector('.article-content') ||
                                             doc.querySelector('.post-content') ||
                                             doc.querySelector('[role="main"]') ||
                                             doc.querySelector('main');
                        
                        if (articleContent) {
                          firstArticleContent = articleContent.textContent?.substring(0, 1500) || '';
                          console.log('✅ First article content fetched successfully');
                        }
                      }
                    } catch (fetchError) {
                      console.log('❌ Could not fetch article content:', fetchError);
                    }
                  }
                  
                  const articlesHeader = language === 'de' ? '\n\n**📰 Weitere Artikel zu diesem Thema:**' : '\n\n**📰 More Articles on this Topic:**';
                  const articleButtons = articles.map((article: any, index: number) => {
                    const title = article.title;
                    const shortTitle = title.length > 60 ? title.substring(0, 57) + '...' : title;
                    return `[${shortTitle}](${article.url})`;
                  }).join('\n');
                  
                  articlesSection = `${articlesHeader}\n${articleButtons}`;
                  successfulNewsAPI = newsData.source || 'News API';
                } else {
                  throw new Error('No articles found in News API');
                }
            } catch (newsError) {
              console.error('❌ News API also failed:', newsError);
              lastNewsError = newsError;
              
              // Both APIs failed, provide manual search links
              const fallbackText = language === 'de'
                ? '\n\n**📰 Weitere Artikel zu diesem Thema:**\n[Artikel auf The Guardian suchen](https://www.theguardian.com/search?q=' + encodeURIComponent(extractedTopic) + ') | [Google News](https://news.google.com/search?q=' + encodeURIComponent(extractedTopic) + ')'
                : '\n\n**📰 More Articles on this Topic:**\n[Search articles on The Guardian](https://www.theguardian.com/search?q=' + encodeURIComponent(extractedTopic) + ') | [Google News](https://news.google.com/search?q=' + encodeURIComponent(extractedTopic) + ')';
              articlesSection = fallbackText;
            }
          }
          
          // Log which API was successful
          if (successfulNewsAPI) {
            console.log(`🎉 Articles fetched successfully using ${successfulNewsAPI} API`);
          } else {
            console.error('🚨 All news APIs failed. Last error:', lastNewsError);
          }
          
          // Generate AI Analysis using multiple AI models with fallback system (after articles are fetched)
          const basePrompt = language === 'de' 
            ? `Basierend auf der Wikipedia-Information über "${title}", beantworte folgende Frage umfassend und fundiert: ${userInput}. Nutze die bereitgestellten Informationen und dein Wissen, um eine detaillierte Antwort in 2-3 ausführlichen Sätzen zu geben.`
            : `Based on the Wikipedia information about "${title}", answer the following question comprehensively and well-founded: ${userInput}. Use the provided information and your knowledge to give a detailed answer in 2-3 comprehensive sentences.`;
          
          const aiAnalysisPrompt = firstArticleContent ? 
            (language === 'de' 
              ? `${basePrompt}\n\nZusätzliche aktuelle Informationen (verwende nur bei Bedarf): ${firstArticleContent}\nQuelle: ${firstArticleUrl}`
              : `${basePrompt}\n\nAdditional current information (use only if needed): ${firstArticleContent}\nSource: ${firstArticleUrl}`) 
            : basePrompt;
          
          let aiAnalysisContent = '';
          let successfulAIModel = null;
          
          // Enhanced AI models array with multiple fallbacks - Using Lovable AI (Gemini) first
          const aiModels = [
            { name: 'Gemini 2.5 Flash', type: 'lovable', model: 'google/gemini-2.5-flash' },
            { name: 'Gemini 2.5 Pro', type: 'lovable', model: 'google/gemini-2.5-pro' },
            { name: 'GPT-5', type: 'puter', model: 'gpt-5' },
            { name: 'Claude Sonnet 4', type: 'puter', model: 'claude-sonnet-4' },
            { name: 'GPT-4.1', type: 'puter', model: 'gpt-4.1' },
            { name: 'Claude Opus 4', type: 'puter', model: 'claude-opus-4' },
            { name: 'Gemini 2.0 Flash', type: 'puter', model: 'gemini-2.0-flash' },
            { name: 'Deepseek Chat', type: 'puter', model: 'deepseek-chat' }
          ];
          
          // Try AI models sequentially until one succeeds
          for (const aiModel of aiModels) {
            try {
              console.log(`🤖 Trying AI model for internet analysis: ${aiModel.name}`);
              
              let modelResponse = '';
              
              if (aiModel.type === 'lovable') {
                const systemPrompt = language === 'de' 
                  ? `Du bist ein KI-Assistant mit fundiertem Wissen. Analysiere die gegebenen Wikipedia-Informationen und beantworte die Frage präzise. Wikipedia-Information: ${extract}`
                  : `You are an AI assistant with solid knowledge. Analyze the given Wikipedia information and answer the question precisely. Wikipedia information: ${extract}`;
                
                const { data, error } = await supabase.functions.invoke('lovable-ai-proxy', {
                  body: { 
                    prompt: aiAnalysisPrompt,
                    systemPrompt: systemPrompt,
                    temperature: 0.7,
                    model: aiModel.model,
                    max_tokens: 400
                  }
                });

                if (error) {
                  console.error(`${aiModel.name} API error:`, error);
                  throw error;
                }

                if (data?.error) {
                  console.error(`${aiModel.name} API error:`, data.error);
                  throw new Error(data.error);
                }

                modelResponse = data?.content || '';
              } else if (aiModel.type === 'puter') {
                await waitForPuterReady();
                const puter = (window as any).puter;
                
                if (!puter?.ai?.chat) {
                  throw new Error('Puter AI not available');
                }
                
                const contextualPrompt = language === 'de' 
                  ? `Kontext aus Wikipedia: ${extract}\n\nFrage: ${aiAnalysisPrompt}`
                  : `Context from Wikipedia: ${extract}\n\nQuestion: ${aiAnalysisPrompt}`;
                
                const aiResponse = await puter.ai.chat(contextualPrompt, {
                  model: aiModel.model,
                  max_tokens: 400,
                  temperature: 0.7
                });
                
                if (typeof aiResponse === 'string') {
                  modelResponse = aiResponse.trim();
                } else if (aiResponse?.text) {
                  modelResponse = aiResponse.text.trim();
                } else {
                  throw new Error('Invalid AI response format');
                }
              }

              if (modelResponse && modelResponse.length > 10) {
                aiAnalysisContent = modelResponse;
                successfulAIModel = aiModel.name;
                console.log(`✅ AI analysis successful with ${aiModel.name}`);
                break;
              } else {
                console.log(`❌ ${aiModel.name} returned empty or invalid response`);
              }
            } catch (error) {
              console.log(`❌ ${aiModel.name} failed:`, error);
              continue;
            }
          }
          
          // Create AI analysis section after processing
          const aiAnalysisHeader = language === 'de' ? `\n\n🤖 **KI-Analyse** (${successfulAIModel}):` : `\n\n🤖 **AI Analysis** (${successfulAIModel}):`;
          const aiAnalysisSection = `${aiAnalysisHeader}\n${aiAnalysisContent}`;
          
          // Add external sources section
          const externalSourcesText = language === 'de'
            ? '\n\n**🌐 Externe Quellen:**\n[News suchen](https://news.google.com/search?q=' + encodeURIComponent(extractedTopic) + ') | [Google Scholar](https://scholar.google.com/scholar?q=' + encodeURIComponent(extractedTopic) + ') | [Academic Papers](https://www.researchgate.net/search?q=' + encodeURIComponent(extractedTopic) + ')'
            : '\n\n**🌐 External Sources:**\n[Search News](https://news.google.com/search?q=' + encodeURIComponent(extractedTopic) + ') | [Google Scholar](https://scholar.google.com/scholar?q=' + encodeURIComponent(extractedTopic) + ') | [Academic Papers](https://www.researchgate.net/search?q=' + encodeURIComponent(extractedTopic) + ')';
          
          const result = `${wikipediaContent}${linkText}${aiAnalysisSection}${articlesSection}${externalSourcesText}`;
          
          return { text: result }
        } else {
          // No Wikipedia results, but still provide AI analysis and external sources
          console.log('⚠️ No Wikipedia results found, but continuing with AI analysis and external sources');
          
          const noWikipediaText = language === 'de' 
            ? '🌐 **Wikipedia:**\nKeine spezifischen Ergebnisse auf Wikipedia gefunden.' 
            : '🌐 **Wikipedia:**\nNo specific results found on Wikipedia.';
          
          // Fetch articles first to get URLs for additional context
          let firstArticleContent = '';
          let firstArticleUrl = '';
          let relatedArticles = [];

          // Fetch related articles using Guardian API first
          let articlesSection = '';
          let successfulNewsAPI = null;
          let lastNewsError = null;
          
          // Try Guardian API first
          try {
            console.log('🗞️ Trying Guardian API for:', extractedTopic);
            const guardianApiKey = '0be420a7-af7b-45e9-b5cb-04afb863e15c';
            const guardianUrl = `https://content.guardianapis.com/search?q=${encodeURIComponent(extractedTopic)}&api-key=${guardianApiKey}&show-fields=headline,trailText&page-size=5&order-by=relevance`;
            
            const guardianResponse = await fetch(guardianUrl);
            if (guardianResponse.ok) {
              const guardianData = await guardianResponse.json();
              const articles = guardianData.response?.results || [];
              
              if (articles.length > 0) {
                console.log('✅ Guardian API successful, found', articles.length, 'articles');
                
                // Store first article for AI context
                firstArticleUrl = articles[0].webUrl;
                relatedArticles = articles;
                
                // Try to fetch content from first article using web scraping
                try {
                  console.log('🔍 Fetching content from first article:', firstArticleUrl);
                  const proxyResponse = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(firstArticleUrl)}`);
                  if (proxyResponse.ok) {
                    const proxyData = await proxyResponse.json();
                    const htmlContent = proxyData.contents;
                    
                    // Extract text content from HTML
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(htmlContent, 'text/html');
                    
                    // Try to find article content (Guardian-specific selectors)
                    const articleContent = doc.querySelector('[data-gu-name="body"]') || 
                                         doc.querySelector('.content__article-body') ||
                                         doc.querySelector('.article-body');
                    
                    if (articleContent) {
                      firstArticleContent = articleContent.textContent?.substring(0, 1500) || '';
                      console.log('✅ First article content fetched successfully');
                    }
                  }
                } catch (fetchError) {
                  console.log('❌ Could not fetch article content:', fetchError);
                }
                
                const articlesHeader = language === 'de' ? '\n\n**📰 Weitere Artikel zu diesem Thema:**' : '\n\n**📰 More Articles on this Topic:**';
                const articleButtons = articles.map((article: any, index: number) => {
                  const headline = article.fields?.headline || article.webTitle;
                  const shortTitle = headline.length > 60 ? headline.substring(0, 57) + '...' : headline;
                  return `[${shortTitle}](${article.webUrl})`;
                }).join('\n');
                
                articlesSection = `${articlesHeader}\n${articleButtons}`;
                successfulNewsAPI = 'Guardian';
              } else {
                throw new Error('No articles found in Guardian API');
              }
            } else {
              throw new Error(`Guardian API error: ${guardianResponse.status}`);
            }
          } catch (guardianError) {
            console.error('❌ Guardian API failed:', guardianError);
            lastNewsError = guardianError;
            
            // Fallback to secure news API edge function
            try {
              console.log('🗞️ Trying secure news API for:', extractedTopic);
              
              const newsResponse = await supabase.functions.invoke('fetch-news', {
                body: { 
                  topic: extractedTopic,
                  language: language === 'de' ? 'de' : 'en'
                }
              });
              
              if (newsResponse.error) {
                throw new Error(newsResponse.error.message || 'News API error');
              }
              
              const newsData = await newsResponse.data;
              const articles = newsData?.articles || [];
              
              if (articles.length > 0) {
                console.log(`✅ News API successful (${newsData.source}), found`, articles.length, 'articles');
                  
                  // Store first article for AI context if not already set
                  if (!firstArticleUrl) {
                    firstArticleUrl = articles[0].url;
                    relatedArticles = articles;
                    
                    // Try to fetch content from first article
                    try {
                      console.log('🔍 Fetching content from first article:', firstArticleUrl);
                      const proxyResponse = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(firstArticleUrl)}`);
                      if (proxyResponse.ok) {
                        const proxyData = await proxyResponse.json();
                        const htmlContent = proxyData.contents;
                        
                        // Extract text content from HTML
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(htmlContent, 'text/html');
                        
                        // Try common article selectors
                        const articleContent = doc.querySelector('article') || 
                                             doc.querySelector('.article-content') ||
                                             doc.querySelector('.post-content') ||
                                             doc.querySelector('[role="main"]') ||
                                             doc.querySelector('main');
                        
                        if (articleContent) {
                          firstArticleContent = articleContent.textContent?.substring(0, 1500) || '';
                          console.log('✅ First article content fetched successfully');
                        }
                      }
                    } catch (fetchError) {
                      console.log('❌ Could not fetch article content:', fetchError);
                    }
                  }
                  
                  const articlesHeader = language === 'de' ? '\n\n**📰 Weitere Artikel zu diesem Thema:**' : '\n\n**📰 More Articles on this Topic:**';
                  const articleButtons = articles.map((article: any, index: number) => {
                    const title = article.title;
                    const shortTitle = title.length > 60 ? title.substring(0, 57) + '...' : title;
                    return `[${shortTitle}](${article.url})`;
                  }).join('\n');
                  
                  articlesSection = `${articlesHeader}\n${articleButtons}`;
                  successfulNewsAPI = newsData.source || 'News API';
                } else {
                  throw new Error('No articles found in News API');
                }
            } catch (newsError) {
              console.error('❌ News API also failed:', newsError);
              lastNewsError = newsError;
              
              // Both APIs failed, provide manual search links
              const fallbackText = language === 'de'
                ? '\n\n**📰 Weitere Artikel zu diesem Thema:**\n[Artikel auf The Guardian suchen](https://www.theguardian.com/search?q=' + encodeURIComponent(extractedTopic) + ') | [Google News](https://news.google.com/search?q=' + encodeURIComponent(extractedTopic) + ')'
                : '\n\n**📰 More Articles on this Topic:**\n[Search articles on The Guardian](https://www.theguardian.com/search?q=' + encodeURIComponent(extractedTopic) + ') | [Google News](https://news.google.com/search?q=' + encodeURIComponent(extractedTopic) + ')';
              articlesSection = fallbackText;
            }
          }
          
          // Generate AI Analysis using multiple AI models with fallback system
          const basePrompt = language === 'de' 
            ? `Beantworte folgende Frage umfassend und fundiert: ${userInput}. Da keine spezifischen Wikipedia-Informationen verfügbar sind, nutze dein allgemeines Wissen und die verfügbaren aktuellen Informationen, um eine detaillierte Antwort in 2-3 ausführlichen Sätzen zu geben.`
            : `Answer the following question comprehensively and well-founded: ${userInput}. Since no specific Wikipedia information is available, use your general knowledge and available current information to give a detailed answer in 2-3 comprehensive sentences.`;
          
          const aiAnalysisPrompt = firstArticleContent ? 
            (language === 'de' 
              ? `${basePrompt}\n\nAktuelle Informationen aus den Nachrichten (verwende nur bei Bedarf): ${firstArticleContent}\nQuelle: ${firstArticleUrl}`
              : `${basePrompt}\n\nCurrent information from news (use only if needed): ${firstArticleContent}\nSource: ${firstArticleUrl}`) 
            : basePrompt;
          
          let aiAnalysisContent = '';
          let successfulAIModel = null;
          
          // Enhanced AI models array with multiple fallbacks - Using Lovable AI (Gemini) first
          const aiModels = [
            { name: 'Gemini 2.5 Flash', type: 'lovable', model: 'google/gemini-2.5-flash' },
            { name: 'Gemini 2.5 Pro', type: 'lovable', model: 'google/gemini-2.5-pro' },
            { name: 'GPT-5', type: 'puter', model: 'gpt-5' },
            { name: 'Claude Sonnet 4', type: 'puter', model: 'claude-sonnet-4' },
            { name: 'GPT-4.1', type: 'puter', model: 'gpt-4.1' },
            { name: 'Claude Opus 4', type: 'puter', model: 'claude-opus-4' },
            { name: 'Gemini 2.0 Flash', type: 'puter', model: 'gemini-2.0-flash' },
            { name: 'Deepseek Chat', type: 'puter', model: 'deepseek-chat' }
          ];
          
          // Try AI models sequentially until one succeeds
          for (const aiModel of aiModels) {
            try {
              console.log(`🤖 Trying AI model for analysis without Wikipedia: ${aiModel.name}`);
              
              let modelResponse = '';
              
              if (aiModel.type === 'lovable') {
                const systemPrompt = language === 'de' 
                  ? `Du bist ein KI-Assistant mit fundiertem Wissen. Beantworte die Frage präzise basierend auf deinem Wissen und verfügbaren aktuellen Informationen.`
                  : `You are an AI assistant with solid knowledge. Answer the question precisely based on your knowledge and available current information.`;
                
                const { data, error } = await supabase.functions.invoke('lovable-ai-proxy', {
                  body: { 
                    prompt: aiAnalysisPrompt,
                    systemPrompt: systemPrompt,
                    temperature: 0.7,
                    model: aiModel.model,
                    max_tokens: 400
                  }
                });

                if (error) {
                  console.error(`${aiModel.name} API error:`, error);
                  throw error;
                }

                if (data?.error) {
                  console.error(`${aiModel.name} API error:`, data.error);
                  throw new Error(data.error);
                }

                modelResponse = data?.content || '';
              } else if (aiModel.type === 'puter') {
                await waitForPuterReady();
                const puter = (window as any).puter;
                
                if (!puter?.ai?.chat) {
                  throw new Error('Puter AI not available');
                }
                
                const aiResponse = await puter.ai.chat(aiAnalysisPrompt, {
                  model: aiModel.model,
                  max_tokens: 400,
                  temperature: 0.7
                });
                
                if (typeof aiResponse === 'string') {
                  modelResponse = aiResponse.trim();
                } else if (aiResponse?.text) {
                  modelResponse = aiResponse.text.trim();
                } else {
                  throw new Error('Invalid AI response format');
                }
              }

              if (modelResponse && modelResponse.length > 10) {
                aiAnalysisContent = modelResponse;
                successfulAIModel = aiModel.name;
                console.log(`✅ AI analysis successful with ${aiModel.name}`);
                break;
              } else {
                console.log(`❌ ${aiModel.name} returned empty or invalid response`);
              }
            } catch (error) {
              console.log(`❌ ${aiModel.name} failed:`, error);
              continue;
            }
          }
          
          // Create AI analysis section
          const aiAnalysisHeader = language === 'de' ? `\n\n🤖 **KI-Analyse** (${successfulAIModel || 'Fallback Summary'}):` : `\n\n🤖 **AI Analysis** (${successfulAIModel || 'Fallback Summary'}):`;
          const aiAnalysisSection = aiAnalysisContent 
            ? `${aiAnalysisHeader}\n${aiAnalysisContent}`
            : (language === 'de' 
              ? `${aiAnalysisHeader}\nKI-Analyse derzeit nicht verfügbar. Bitte versuchen Sie es später erneut oder nutzen Sie die unten stehenden Quellen für weitere Informationen.`
              : `${aiAnalysisHeader}\nAI analysis currently unavailable. Please try again later or use the sources below for more information.`);
          
          // Add external sources section
          const externalSourcesText = language === 'de'
            ? '\n\n**🌐 Externe Quellen:**\n[News suchen](https://news.google.com/search?q=' + encodeURIComponent(extractedTopic) + ') | [Google Scholar](https://scholar.google.com/scholar?q=' + encodeURIComponent(extractedTopic) + ') | [Academic Papers](https://www.researchgate.net/search?q=' + encodeURIComponent(extractedTopic) + ')'
            : '\n\n**🌐 External Sources:**\n[Search News](https://news.google.com/search?q=' + encodeURIComponent(extractedTopic) + ') | [Google Scholar](https://scholar.google.com/scholar?q=' + encodeURIComponent(extractedTopic) + ') | [Academic Papers](https://www.researchgate.net/search?q=' + encodeURIComponent(extractedTopic) + ')';
          
          const result = `${noWikipediaText}${aiAnalysisSection}${articlesSection}${externalSourcesText}`;
          
          return { text: result }
        }
      } catch (e) {
        console.error('Wikipedia search error:', e);
        const err = language === 'de' ? 'Fehler bei der Wikipedia-Suche.' : 'Error during Wikipedia search.'
        return { text: `❌ ${err}` }
      }
    }


    // Article-specific Q&A and summarization when context is present
    if (searchMode === 'local' && (contextArticleId || articleContext)) {
      const ctxArticle = contextArticleId
        ? articles.find(a => a.id === contextArticleId)
        : articles.find(a => {
            const ctx = (articleContext || '').toLowerCase();
            const titles = [a.title || '', a.titleEn || ''].map(t => t.toLowerCase());
            return titles.includes(ctx) || titles.some(t => t.includes(ctx));
          });
      if (ctxArticle) {
        const title = language === 'de' ? ctxArticle.title : (ctxArticle.titleEn || ctxArticle.title);
        const raw = language === 'de' ? (ctxArticle.content || ctxArticle.excerpt) : (ctxArticle.contentEn || ctxArticle.excerptEn || ctxArticle.excerpt);
        const clean = stripHtml(raw || '');
        const sum = summarize(clean, 4);
        const points = keyPoints(clean, ctxArticle.tags, 3);
        const ask = input;
        if (ask.includes('autor') || ask.includes('author')) {
          const res = language === 'de' ? `Autor: ${ctxArticle.author}` : `Author: ${ctxArticle.author}`;
          return { text: `🧑‍💻 ${res}\n\n🔗 /article/${ctxArticle.id}` };
        }
        if (ask.includes('datum') || ask.includes('date')) {
          const dateStr = new Date(ctxArticle.publishedAt).toLocaleDateString();
          const res = language === 'de' ? `Veröffentlichungsdatum: ${dateStr}` : `Published on: ${dateStr}`;
          return { text: `📅 ${res}\n\n🔗 /article/${ctxArticle.id}` };
        }
        if (ask.includes('kategorie') || ask.includes('category')) {
          const cat = language === 'de' ? (ctxArticle.category) : (ctxArticle.categoryEn || ctxArticle.category);
          const res = language === 'de' ? `Kategorie: ${cat}` : `Category: ${cat}`;
          return { text: `🏷️ ${res}\n\n🔗 /article/${ctxArticle.id}` };
        }
        const header = language === 'de' ? `📰 ${title}\n\nKurz zusammengefasst:` : `📰 ${title}\n\nIn short:`;
        const pointsHeader = language === 'de' ? '\n\nWichtige Punkte:' : '\n\nKey takeaways:';
        const factsHeader = language === 'de' ? '\n\nFakten:' : '\n\nFacts:';
        const facts = [
          language === 'de' ? `Autor: ${ctxArticle.author}` : `Author: ${ctxArticle.author}`,
          language === 'de' ? `Kategorie: ${ctxArticle.category}` : `Category: ${ctxArticle.categoryEn || ctxArticle.category}`,
          `${language === 'de' ? 'Datum' : 'Date'}: ${new Date(ctxArticle.publishedAt).toLocaleDateString()}`,
        ].join('\n- ');
        const link = `\n\n🔗 ${language === 'de' ? 'Zum Artikel' : 'Open article'}: /article/${ctxArticle.id}`;
        return { text: `${header}\n${sum}${pointsHeader}\n${points.map(p => `- ${p}`).join('\n')}${factsHeader}\n- ${facts}${link}` };
      }
    }

    // Local article search for search mode (all articles)
    if (searchMode === 'local') {
      const results = searchArticles(userInput);
      if (results.length > 0) {
        const resultText = language === 'de' 
          ? `📰 Ich habe ${results.length} passende Artikel gefunden:\n\n`
          : `📰 I found ${results.length} matching articles:\n\n`;
        const articleList = results.map((article, index) => {
          const title = language === 'de' ? (article.title) : (article.titleEn || article.title);
          const excerpt = language === 'de' ? (article.excerpt) : (article.excerptEn || article.excerpt);
          return `${index + 1}. **${title}**\n   ${excerpt}\n   🔗 /article/${article.id} \n   📝 ${article.author} • 📅 ${new Date(article.publishedAt).toLocaleDateString()}\n`;
        }).join('\n');
        const footer = language === 'de'
          ? '\n💡 Fragen Sie nach mehr Details zu einem bestimmten Artikel!'
          : '\n💡 Ask for more details about a specific article!';
        return { text: resultText + articleList + footer };
      }
    }
    
    // Check for contact information requests
    if (input.includes('contact') || input.includes('email') || input.includes('kontakt') || input.includes('mail')) {
      let result = `# 📞 ${language === 'de' ? 'Kontakt-Information' : 'Contact Information'}\n\n`;
      result += `*${language === 'de' ? 'Wir sind für Sie da!' : 'We are here for you!'}*\n\n`;
      result += `---\n\n`;
      
      result += `## 🇩🇪 ${language === 'de' ? 'Deutsche Anfragen' : 'German Inquiries'}\n\n`;
      result += `📧 **[${companyDatabase.contact.german}](mailto:${companyDatabase.contact.german})**\n\n`;
      
      result += `## 🇬🇧 ${language === 'de' ? 'Englische Anfragen' : 'English Inquiries'}\n\n`;
      result += `📧 **[${companyDatabase.contact.english}](mailto:${companyDatabase.contact.english})**\n\n`;
      
      result += `---\n\n`;
      result += `💌 *${language === 'de' ? 'Wir freuen uns auf Ihre Nachricht!' : 'We look forward to hearing from you!'}*`;
      
      return { text: result, endConversationAvailable: false };
    }
    
    // Check for team information requests
    if (input.includes('team') || input.includes('staff') || input.includes('who') || input.includes('wer') || input.includes('mitarbeiter')) {
      if (input.includes('stefan') || input.includes('kunc')) {
        const stefanText = language === 'de'
          ? `Stefan Kunc - Gründer & Visionär von Daily Fun:\n\n"${companyDatabase.founder.vision}"\n\nStefan ist der kreative Kopf hinter Daily Fun und hat die Plattform mit dem Ziel gegründet, Nachrichten unterhaltsam und vertrauenswürdig zu gestalten.`
          : `Stefan Kunc - Founder & Visionary of Daily Fun:\n\n"${companyDatabase.founder.vision}"\n\nStefan is the creative mind behind Daily Fun and founded the platform with the goal of making news entertaining and trustworthy.`;
        return { text: stefanText };
      }
      
      // General team overview
      const teamList = companyDatabase.team.map((member, index) => 
        `${index + 1}. ${member.name} (${member.type}) - ${member.role}`
      ).join('\n');
      
      const teamText = language === 'de'
        ? `Unser Daily Fun Team:\n\n${teamList}\n\nJedes Teammitglied trägt mit einzigartigen Fähigkeiten dazu bei, Daily Fun zu der vertrauenswürdigen und unterhaltsamen Plattform zu machen, die sie heute ist!`
        : `Our Daily Fun Team:\n\n${teamList}\n\nEach team member contributes unique skills to make Daily Fun the trustworthy and entertaining platform it is today!`;
      
      return { text: teamText };
    }
    
    // Check for company information requests
    if (input.includes('about') || input.includes('company') || input.includes('mission') || input.includes('über') || input.includes('firma') || input.includes('unternehmen')) {
      let result = `# 🚀 Daily Fun\n\n`;
      result += `*${language === 'de' ? 'Unsere Mission & Vision' : 'Our Mission & Vision'}*\n\n`;
      result += `---\n\n`;
      
      result += `## 🎯 ${language === 'de' ? 'Unsere Mission' : 'Our Mission'}\n\n`;
      result += `${companyDatabase.company.mission}\n\n`;
      
      result += `## 🔮 ${language === 'de' ? 'Unsere Vision' : 'Our Vision'}\n\n`;
      result += `${companyDatabase.company.vision}\n\n`;
      
      result += `## ⭐ ${language === 'de' ? 'Unsere Werte' : 'Our Values'}\n\n`;
      result += `${companyDatabase.company.values.map(value => `\`${value}\``).join(' • ')}\n\n`;
      
      result += `---\n\n`;
      result += `✨ **${language === 'de' ? 'Willkommen bei Daily Fun!' : 'Welcome to Daily Fun!'}**`;
      
      return { text: result, endConversationAvailable: false };
    }
    
    // Default response for unmatched queries
    const defaultText = language === 'de'
      ? 'Ich kann Ihnen helfen mit:\n\n• Kontaktinformationen\n• Team-Informationen\n• Artikel-Quellen und Details\n• Liste aller Artikel\n\nFragen Sie mich zum Beispiel:\n• "Wer ist Stefan Kunc?"\n• "Wie kann ich euch kontaktieren?"\n• "Zeig mir alle Artikel"\n• "Was ist die Mission von Daily Fun?"'
      : 'I can help you with:\n\n• Contact information\n• Team information\n• Article sources and details\n• List of all articles\n\nTry asking:\n• "Who is Stefan Kunc?"\n• "How can I contact you?"\n• "Show me all articles"\n• "What is Daily Fun\'s mission?"';
    
    return { text: defaultText };
  };

  const handleActionCardClick = (card: ActionCard) => {
    if (card.id === 'summarize-info') {
      setSummaryMode(true);
      setQuizInfoMode(false);
      setSelectedMessages([]);
      const msg = language === 'de' 
        ? '📝 **Zusammenfassungs-Modus aktiviert**\n\nSo funktioniert es:\n1. Klicken Sie auf die Nachrichten, die Sie zusammenfassen möchten\n2. Ausgewählte Nachrichten werden mit einem Rahmen markiert\n3. Klicken Sie auf den "Zusammenfassen" Button in einer AI-Nachricht\n4. Oder schreiben Sie "fasse die Informationen zusammen"\n\nWählen Sie jetzt die Nachrichten aus, die zusammengefasst werden sollen.'
        : '📝 **Summary Mode Activated**\n\nHow it works:\n1. Click on the messages you want to summarize\n2. Selected messages will be highlighted with a border\n3. Click the "Summarize" button in an AI message\n4. Or type "summarize the information"\n\nNow select the messages you want to summarize.';
      const newMessage: Message = {
        id: Date.now().toString(),
        text: msg,
        isUser: false,
        timestamp: new Date(),
        showSummaryButton: true
      };
      setMessages(prev => [...prev, newMessage]);
    } else if (card.id === 'information-quiz') {
      setQuizInfoMode(true);
      setSummaryMode(false);
      setSelectedMessages([]);
      const msg = language === 'de' 
        ? '🧠 **Quiz-Modus aktiviert**\n\nSo funktioniert es:\n1. Klicken Sie auf die Nachrichten, die Sie für das Quiz verwenden möchten\n2. Ausgewählte Nachrichten werden mit einem Rahmen markiert\n3. Klicken Sie auf den "Quiz erstellen" Button in einer AI-Nachricht\n4. Oder schreiben Sie "erstelle informations quiz"\n\nWählen Sie jetzt die Nachrichten aus, die für das Quiz verwendet werden sollen.'
        : '🧠 **Quiz Mode Activated**\n\nHow it works:\n1. Click on the messages you want to use for the quiz\n2. Selected messages will be highlighted with a border\n3. Click the "Create Quiz" button in an AI message\n4. Or type "create information quiz"\n\nNow select the messages you want to use for the quiz.';
      const newMessage: Message = {
        id: Date.now().toString(),
        text: msg,
        isUser: false,
        timestamp: new Date(),
        showQuizButton: true
      };
      setMessages(prev => [...prev, newMessage]);
    }
  };

  const handleArticleSearchInput = (messageId: string, query: string) => {
    if (query.trim()) {
      const results = searchArticles(query);
      setSearchResults(prev => ({ ...prev, [messageId]: results }));
    } else {
      setSearchResults(prev => ({ ...prev, [messageId]: [] }));
    }
  };

  const handleArticleClick = (article: any) => {
    // Navigate to article page
    window.location.href = `/article/${article.id}`;
  };

  const sendPrompt = async (text: string) => {
    if (!text.trim() || isTyping) return;

    // Clear suggestions when sending
    setUserSuggestions([]);

    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await processAIResponse(text);
      setLastAIResponse(response.text);

      // Only add AI message if there's actual text content
      if (response.text && response.text.trim()) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: response.text,
          isUser: false,
          timestamp: new Date(),
          qrCode: response.qrCode,
          quizData: response.quizData,
          endConversationAvailable: false,
          showSummaryButton: !response.text.includes('📝 **') // Don't show summary button on summary messages
        };

        setTimeout(() => {
          setMessages(prev => [...prev, aiMessage]);
          setIsTyping(false);
        }, 800);
      } else {
        setIsTyping(false);
      }
    } catch (error) {
      setIsTyping(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');

    // Check if user is asking a detailed question while in detail mode
    if (isInDetailMode) {
      await handleDetailedQuestion(currentInput);
      return;
    }

    // Check if this is a predefined news intelligence question
    const newsQuestions = {
      de: [
        'Was ist heute passiert?',
        'Was ist diese Woche passiert?', 
        'Was ist diesen Monat passiert?'
      ],
      en: [
        'What happened today?',
        'What happened this week?',
        'What happened this month?'
      ]
    };
    
    const allNewsQuestions = [...newsQuestions.de, ...newsQuestions.en];
    if (allNewsQuestions.includes(currentInput) && searchMode === 'internet') {
      // This is a predefined news intelligence question, trigger the news aggregation
      await handleNewsIntelligence();
      return;
    }

    setIsTyping(true);

    try {
      const response = await processAIResponse(currentInput);
      setLastAIResponse(response.text);

      // Only add AI message if there's actual text content
      if (response.text && response.text.trim()) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: response.text,
          isUser: false,
          timestamp: new Date(),
          qrCode: response.qrCode,
          quizData: response.quizData,
          endConversationAvailable: false,
          showSummaryButton: !response.text.includes('📝 **') // Don't show summary button on summary messages
        };

        setTimeout(() => {
          setMessages(prev => [...prev, aiMessage]);
          setIsTyping(false);
        }, 1000);
      } else {
        setIsTyping(false);
      }
    } catch (error) {
      console.error('Error processing AI response:', error);
      setIsTyping(false);
    }
  };

  const endInternetConversation = () => {
    setInternetSeed(null);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: language === 'de' ? '🛑 Konversation beendet. Bitte nenne ein neues Thema für die Internet-Suche.' : '🛑 Conversation ended. Please provide a new topic for Internet search.',
      isUser: false,
      timestamp: new Date()
    }]);
  };

  const endArticleConversation = () => {
    setArticleContext(null);
    setIsArticleMode(false);
    setSearchMode('internet');
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: language === 'de' 
        ? '🛑 Artikel-Konversation beendet. Sie sind zurück im normalen Daily Fun (Internet Search) Modus.'
        : '🛑 Article conversation ended. You are back in normal Daily Fun (Internet Search) mode.',
      isUser: false,
      timestamp: new Date()
    }]);
  };

  const endNewsDetailMode = () => {
    setIsInDetailMode(false);
    setCurrentArticleContent('');
    setCurrentArticleSource('');
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: language === 'de' 
        ? '🛑 News Intelligence Modus beendet. Sie sind zurück im normalen Daily Fun (Internet Search) Modus.'
        : '🛑 News Intelligence mode ended. You are back in normal Daily Fun (Internet Search) mode.',
      isUser: false,
      timestamp: new Date()
    }]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      <SEO 
        title="Daily Fun AI - Intelligenter Assistent"
        description="Chatten Sie mit Daily Fun AI. Stellen Sie Fragen, suchen Sie Artikel, erstellen Sie Quizze und mehr mit unserem intelligenten AI-Assistenten."
        canonical="https://www.daily-fun.org/ai"
      />      
      {/* Small Daily Fun AI title - positioned after sidebar */}
      <div className="absolute top-24 left-4 md:left-72 z-10">
        <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Daily Fun AI
        </h1>
      </div>

      {/* Full page chat area — die letzte AI-Nachricht (oder Welcome) bleibt
          sticky direkt über dem Input-Bar sichtbar, damit sie nicht aus dem
          Viewport rauswandert, wenn der User durch die History scrollt. */}
      <div className="flex-1 pt-32 pb-40 px-4 overflow-hidden">
        <div ref={scrollAreaRef} className="h-full overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-4 pb-4">
            {messages.map((message, messageIndex) => {
              // Bestimme, ob das die letzte AI-Nachricht (oder die letzte
              // Nachricht überhaupt) ist — diese bleibt sticky am unteren
              // Rand des Viewports sichtbar.
              const isLastIndex = messageIndex === messages.length - 1;
              const isPreviousOfLastUser =
                isLastIndex && message.isUser && messages.length >= 2;
              const stickyIndex = (() => {
                const last = messages[messages.length - 1];
                if (!last) return -1;
                if (!last.isUser) return messages.length - 1;
                return messages.length - 2; // vorherige AI (oder Welcome)
              })();
              const isSticky = messageIndex === stickyIndex;
              return (
                <div
                  key={message.id}
                  className={`flex ${message.isUser ? 'justify-end' : 'justify-start'} ${
                    isSticky
                      ? 'sticky bottom-[150px] z-20 bg-gradient-to-br from-slate-50/95 to-blue-50/95 backdrop-blur-sm -mx-4 px-4 py-2 rounded-2xl shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.18)]'
                      : ''
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-4 rounded-2xl relative group ${
                      message.isUser
                        ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                        : 'bg-white text-gray-800 border border-gray-100 shadow-sm'
                    } ${
                      selectedMessages.includes(message.id) 
                        ? `ring-2 ${summaryMode ? 'ring-orange-400' : 'ring-blue-400'} ${message.isUser ? '' : 'bg-orange-50'}` 
                        : ''
                    }`}
                     onClick={() => handleMessageClick(message.id)}
                    >
                     {/* Interactive Information Quiz Display */}
                     {message.text.startsWith('INTERACTIVE_INFO_QUIZ:') || message.text.startsWith('SEMICOLON_QUIZ:') ? (
                       <div className="space-y-6">
                         <h2 className="text-xl font-bold text-gray-800 mb-4">
                           {language === 'de' ? '🧠 Informations-Quiz' : '🧠 Information Quiz'}
                         </h2>
                         {(() => {
                           const quizQuestions = message.text.startsWith('SEMICOLON_QUIZ:') 
                             ? parseSemicolonQuiz(message.text)
                             : parseInteractiveQuiz(message.text);
                           
                           if (!quizQuestions) {
                             return <p className="text-red-600">{language === 'de' ? 'Fehler beim Laden des Quiz' : 'Error loading quiz'}</p>;
                           }
                           
                           if (!quizStates[message.id]) {
                             setQuizStates(prev => ({ ...prev, [message.id]: quizQuestions }));
                             return <div>Loading...</div>;
                           }
                           
                           const currentQuiz = quizStates[message.id];
                           
                           return currentQuiz.map((q: any, qIndex: number) => (
                             <div key={qIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                               <h3 className="font-semibold text-gray-800 mb-3">
                                 {qIndex + 1}. {q.question}
                               </h3>
                               <div className="space-y-2">
                                 {q.answers.map((answer: string, aIndex: number) => {
                                   const letter = ['A', 'B', 'C', 'D'][aIndex];
                                   const isCorrect = answer === q.correctAnswer;
                                   const isSelected = q.selectedAnswer === letter || q.selectedAnswer === answer;
                                   
                                   return (
                                     <button
                                       key={aIndex}
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         setQuizStates(prev => ({
                                           ...prev,
                                           [message.id]: prev[message.id].map((quiz: any, idx: number) => 
                                             idx === qIndex 
                                               ? { ...quiz, selectedAnswer: answer, showResult: true }
                                               : quiz
                                           )
                                         }));
                                       }}
                                       disabled={q.showResult}
                                       className={`w-full text-left p-3 rounded-lg border transition-colors ${
                                         q.showResult
                                           ? isCorrect
                                             ? 'bg-green-100 border-green-400 text-green-800'
                                             : isSelected
                                             ? 'bg-red-100 border-red-400 text-red-800'
                                             : 'bg-gray-100 border-gray-300 text-gray-600'
                                           : 'bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                                       }`}
                                     >
                                       <div className="flex items-start gap-3">
                                         <span className="font-semibold">
                                           {letter}.
                                         </span>
                                         <span className="flex-1">{answer}</span>
                                         {q.showResult && isCorrect && (
                                           <span className="text-green-600 font-semibold">
                                             ✓ {language === 'de' ? 'Richtig' : 'Correct'}
                                           </span>
                                         )}
                                         {q.showResult && isSelected && !isCorrect && (
                                           <span className="text-red-600 font-semibold">
                                             ✗ {language === 'de' ? 'Falsch' : 'Wrong'}
                                           </span>
                                         )}
                                       </div>
                                     </button>
                                   );
                                 })}
                               </div>
                               
                                {q.showResult && (
                                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                    <p className="text-blue-800">
                                      <strong>{language === 'de' ? 'Richtige Antwort:' : 'Correct Answer:'}</strong> {q.correctAnswer}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ));
                          })()}
                          
                          {/* Add "Nächstes Quiz" button for multi-question format */}
                          {(() => {
                            const currentQuizStates = quizStates[message.id] || [];
                            const allAnswered = currentQuizStates.length > 0 && currentQuizStates.every((q: any) => q.showResult);
                            
                            if (allAnswered && (searchMode === 'internet' || isArticleMode)) {
                              return (
                                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                  <div className="flex gap-2">
                                    <Button
                                    onClick={() => {
                                      // Always reuse the initial Information-Quiz context if available
                                      if (infoQuizSeedContent) {
                                        generateStrictInfoQuizFromSeed();
                                        return;
                                      }
                                      if (isInDetailMode && currentArticleContent) {
                                        // Use stored article content in detail mode
                                        handleDetailedQuestion('Erstelle ein Quiz basierend auf dem Artikel.');
                                        return;
                                      }
                                      // Fallback for other modes
                                      sendPrompt('Erstelle ein weiteres Informations-Quiz.');
                                    }}
                                      size="sm"
                                      variant="default"
                                      className="w-full"
                                    >
                                      {language === 'de' ? 'Nächstes Quiz' : 'Next Quiz'}
                                    </Button>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                    ) : message.text === 'INTERACTIVE_QUIZ' && message.quizData ? (
                       <div className="space-y-4">
                         <h3 className="text-lg font-semibold text-gray-800">
                           {message.quizData.question}
                         </h3>
                         <div className="space-y-2">
                           {message.quizData.answers.map((answer: string, index: number) => {
                             const answerLetter = String.fromCharCode(65 + index);
                             const isCorrect = answer === message.quizData.correctAnswer;
                             const isSelected = answer === message.quizData.selectedAnswer;
                             const showResults = message.quizData.showResults;
                            
                            let buttonClass = "w-full text-left p-3 rounded-lg border transition-all duration-200 ";
                            
                            if (showResults) {
                              if (isCorrect) {
                                buttonClass += "bg-green-100 border-green-300 text-green-800";
                              } else if (isSelected && !isCorrect) {
                                buttonClass += "bg-red-100 border-red-300 text-red-800";
                              } else {
                                buttonClass += "bg-gray-100 border-gray-200 text-gray-600";
                              }
                            } else {
                              buttonClass += "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-800";
                            }
                            
                            return (
                              <button
                                key={index}
                                onClick={() => !showResults && handleQuizAnswer(message.id, answer)}
                                disabled={showResults}
                                className={buttonClass}
                              >
                                <div className="flex items-start gap-3">
                                  <span className="font-semibold text-lg">
                                    {answerLetter}.
                                  </span>
                                  <span className="flex-1">{answer}</span>
                                  {showResults && isCorrect && (
                                    <span className="text-green-600 font-semibold">
                                      ✓ {language === 'de' ? 'Richtige Antwort' : 'Correct Answer'}
                                    </span>
                                  )}
                                  {showResults && isSelected && !isCorrect && (
                                    <span className="text-red-600 font-semibold">
                                      ✗ {language === 'de' ? 'Nicht ganz' : 'Not quite'}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        
                          {message.quizData.showResults && (
                            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                              <p className="text-blue-800">
                                <strong>{language === 'de' ? 'Erklärung:' : 'Explanation:'}</strong> {message.quizData.explanation}
                              </p>
                                <div className="mt-3 space-y-2">
                                  <div className="flex gap-2">
                                    <Button
                                      onClick={() => {
                                        // Prefer the persisted Information-Quiz seed for consistency
                                        if (infoQuizSeedContent) {
                                          generateStrictInfoQuizFromSeed();
                                          return;
                                        }
                                        if (isInDetailMode && currentArticleContent) {
                                          handleDetailedQuestion('Erstelle ein Quiz basierend auf dem Artikel.');
                                          return;
                                        }
                                        // Fallbacks
                                        if (searchMode === 'local') {
                                          const currentTopic = message.quizData.topic;
                                          sendPrompt(`${currentTopic} Quiz`);
                                        } else {
                                          sendPrompt('Erstelle ein weiteres Informations-Quiz.');
                                        }
                                      }}
                                      size="sm"
                                      variant="default"
                                      className={searchMode === 'local' ? "flex-1" : "w-full"}
                                    >
                                      {language === 'de' ? 'Nächstes Quiz' : 'Next Quiz'}
                                    </Button>
                                    {searchMode === 'local' && (
                                      <Button
                                        onClick={() => {
                                          // Use only the specific topics requested by user
                                          const specificTopics = [
                                            'Katzen', 'Hunde', 'Geschichte', 'Wissenschaft', 'Sport'
                                          ];
                                          const randomTopic = specificTopics[Math.floor(Math.random() * specificTopics.length)];
                                          sendPrompt(`${randomTopic} Quiz`);
                                        }}
                                        size="sm"
                                        variant="outline"
                                        className="bg-white flex-1"
                                      >
                                        {language === 'de' ? 'Random Quiz' : 'Random Quiz'}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                            </div>
                          )}
                      </div>
                     ) : (
                       <div>
                         <div className="text-sm leading-relaxed">
                           <ReactMarkdown 
                             className="prose prose-sm max-w-none"
                             components={{
                               p: ({ children }) => <p className="mb-2">{children}</p>,
                               h1: ({ children }) => <h1 className="text-xl font-bold mb-2">{children}</h1>,
                               h2: ({ children }) => <h2 className="text-lg font-semibold mb-2">{children}</h2>,
                               h3: ({ children }) => <h3 className="text-base font-medium mb-1">{children}</h3>,
                               ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                               ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                               li: ({ children }) => <li className="mb-1">{children}</li>,
                               strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                               em: ({ children }) => <em className="italic">{children}</em>,
                               blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 pl-4 italic">{children}</blockquote>,
                               code: ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">{children}</code>,
                                a: ({ children, href }) => {
                                  // Handle internal links (profile and article links)
                                  if (href?.startsWith('/search?author=') || href?.startsWith('/article/')) {
                                    return <a href={href} className="text-blue-600 hover:underline">{children}</a>;
                                  }
                                  // External links open in new tab
                                  return <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>;
                                }
                             }}
                           >
                             {message.text}
                           </ReactMarkdown>
                         </div>
                        {parseWikiOtherResults(message.text).length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {parseWikiOtherResults(message.text).map((title, idx) => (
                              <Button
                                key={idx}
                                size="sm"
                                variant="outline"
                                className="bg-white"
                                onClick={(e) => { e.stopPropagation(); handleWikiResultClick(title); }}
                              >
                                {title}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                   
                   {/* Article Search Component */}
                   {message.articleSearch && (
                     <div className="mt-4 space-y-4">
                       <div className="relative">
                         <Input
                           type="text"
                           onChange={(e) => handleArticleSearchInput(message.id, e.target.value)}
                           placeholder={language === 'de' ? 'Stichwort oder Kategorie eingeben...' : 'Enter keyword or category...'}
                           className="pl-10 bg-gray-50 border-gray-200"
                         />
                         <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                       </div>
                       
                       {searchResults[message.id] && searchResults[message.id].length > 0 && (
                         <div className="space-y-3 max-h-96 overflow-y-auto">
                           {searchResults[message.id].map((article) => {
                              const title = language === 'de' ? article.title : (article.titleEn || article.title);
                              const excerpt = language === 'de' ? article.excerpt : (article.excerptEn || article.excerpt);
                             const imageUrl = article.imageUrl?.startsWith('/') 
                               ? article.imageUrl 
                               : `https://images.unsplash.com/${article.imageUrl}?w=300&h=200&fit=crop`;
                             
                             return (
                               <div
                                 key={article.id}
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   handleArticleClick(article);
                                 }}
                                 className="flex gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors border"
                               >
                                 <img
                                   src={imageUrl}
                                   alt={title}
                                   className="w-20 h-14 object-cover rounded-lg flex-shrink-0"
                                   onError={(e) => {
                                     e.currentTarget.src = '/placeholder.svg';
                                   }}
                                 />
                                 <div className="flex-1 min-w-0">
                                   <h3 className="font-semibold text-gray-800 text-sm line-clamp-2 mb-1">
                                     {title}
                                   </h3>
                                   <p className="text-gray-600 text-xs line-clamp-2 mb-2">
                                     {excerpt}
                                   </p>
                                   <div className="flex items-center gap-2 text-xs text-gray-500">
                                     <span>{article.author}</span>
                                     <span>•</span>
                                     <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                                   </div>
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       )}
                     </div>
                   )}
                   
                   {message.qrCode && (
                     <div className="mt-4 text-center relative">
                       <img 
                         src={message.qrCode} 
                         alt="Generated QR Code" 
                         className="mx-auto rounded-xl shadow-lg border max-w-[200px] h-auto"
                       />
                       <Button
                         onClick={(e) => {
                           e.stopPropagation();
                           downloadQRCode(message.qrCode!);
                         }}
                         size="sm"
                         variant="outline"
                         className="mt-3 bg-white/90 hover:bg-white"
                       >
                         <Download className="w-4 h-4 mr-2" />
                         {language === 'de' ? 'Herunterladen' : 'Download'}
                       </Button>
                     </div>
                    )}
                     {message.endConversationAvailable && (
                       <div className="mt-3">
                         <Button
                           size="sm"
                           variant="outline"
                           className="bg-white"
                           onClick={(e) => { 
                             e.stopPropagation(); 
                             if (isArticleMode) {
                               endArticleConversation();
                             } else {
                               endInternetConversation();
                             }
                           }}
                         >
                           {language === 'de' ? 'Konversation beenden' : 'End conversation'}
                         </Button>
                       </div>
                      )}
                     
                      {/* PDF Download button for summaries */}
                      {message.showPdfDownloadButton && (
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-white"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              downloadSummaryAsPDF(message.text);
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            {language === 'de' ? 'Als PDF herunterladen' : 'Download as PDF'}
                          </Button>
                        </div>
                      )}
                     
                       {/* Summarize button - only show in activation message AND when messages are selected */}
                     {message.showSummaryButton && summaryMode && selectedMessages.length > 0 && 
                      (message.text.includes('Zusammenfassungs-Modus aktiviert') || message.text.includes('Summary Mode Activated')) && (
                       <div className="mt-3">
                         <Button
                           size="sm"
                           variant="outline"
                           className="bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200"
                           onClick={(e) => { e.stopPropagation(); summarizeSelectedMessages(); }}
                         >
                           {language === 'de' ? `${selectedMessages.length} Nachrichten zusammenfassen` : `Summarize ${selectedMessages.length} messages`}
                         </Button>
                       </div>
                     )}
                     
                     {/* Quiz button - only show in activation message AND when messages are selected */}
                     {message.showQuizButton && quizInfoMode && selectedMessages.length > 0 && 
                      (message.text.includes('Quiz-Modus aktiviert') || message.text.includes('Quiz Mode Activated')) && (
                       <div className="mt-3">
                         <Button
                           size="sm"
                           variant="outline"
                           className="bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200"
                           onClick={(e) => { e.stopPropagation(); generateInformationQuiz(); }}
                         >
                           {language === 'de' ? `Quiz aus ${selectedMessages.length} Nachrichten erstellen` : `Create quiz from ${selectedMessages.length} messages`}
                         </Button>
                       </div>
                     )}
                   <div className="text-xs opacity-70 mt-3">
                     {message.timestamp.toLocaleTimeString()}
                   </div>
                  {/* Copy button - only visible on click/hover */}
                  {visibleCopyButtons.includes(message.id) && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(message.text);
                      }}
                      size="sm"
                      variant="outline"
                      className="absolute -bottom-2 -right-2 opacity-90 bg-white shadow-lg"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
                  );
                })}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
          </div>
        </div>
      </div>


      {/* Floating bottom container with action cards, mode switcher and input */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-2xl z-50 pb-20 md:pb-0">
        <div className="max-w-4xl mx-auto p-4 space-y-4">
          

          {/* Combined row with mode dropdown and action buttons */}
          <div className="flex items-center justify-center gap-2 md:gap-3">
            {/* Mode selector dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="justify-between bg-white shadow-sm text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 h-8 md:h-10">
                  <div className="flex items-center gap-1 md:gap-2">
                    {isArticleMode ? (
                      <Newspaper className="w-3 h-3 md:w-4 md:h-4" />
                    ) : searchMode === 'internet' ? (
                      <Globe className="w-3 h-3 md:w-4 md:h-4" />
                    ) : (
                      <Home className="w-3 h-3 md:w-4 md:h-4" />
                    )}
                    <span className="hidden sm:inline">
                      {isArticleMode 
                        ? 'Daily Fun (Article)' 
                        : searchMode === 'internet' 
                          ? 'Daily Fun (Internet Search)' 
                          : 'Daily Fun (Local)'
                      }
                    </span>
                    <span className="sm:hidden">
                      {isArticleMode 
                        ? 'Article' 
                        : searchMode === 'internet' 
                          ? 'Internet' 
                          : 'Local'
                      }
                    </span>
                  </div>
                  <ChevronDown className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-background border z-50">
                <DropdownMenuItem
                  onClick={() => setSearchMode('local')}
                  className="flex items-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Daily Fun (Local)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSearchMode('internet');
                    if (isArticleMode) {
                      setIsArticleMode(false);
                      setArticleContext(null);
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  <Globe className="w-4 h-4" />
                  Daily Fun (Internet Search)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Action buttons - Only show on AI page when in internet mode (not Article mode) */}
            {searchMode === 'internet' && !isArticleMode && location.pathname === '/ai' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (summaryMode) {
                      setSummaryMode(false);
                      setSelectedMessages([]);
                      setQuizInfoMode(false); // Ensure quiz mode is also disabled
                      const msg = language === 'de' 
                        ? '❌ Zusammenfassungs-Modus deaktiviert.'
                        : '❌ Summary mode disabled.';
                      setMessages(prev => [...prev, { id: Date.now().toString(), text: msg, isUser: false, timestamp: new Date() }]);
                    } else {
                      setSummaryMode(true);
                      setQuizInfoMode(false); // Disable quiz mode when enabling summary
                      setSelectedMessages([]);
                      const msg = language === 'de' 
                        ? '📝 **Zusammenfassungs-Modus aktiviert**\n\nSo funktioniert es:\n1. Klicken Sie auf die Nachrichten, die Sie zusammenfassen möchten\n2. Ausgewählte Nachrichten werden mit einem Rahmen markiert\n3. Klicken Sie auf den "Zusammenfassen" Button in einer AI-Nachricht\n4. Oder schreiben Sie "fasse die Informationen zusammen"\n\nWählen Sie jetzt die Nachrichten aus, die zusammengefasst werden sollen.'
                        : '📝 **Summary Mode Activated**\n\nHow it works:\n1. Click on the messages you want to summarize\n2. Selected messages will be highlighted with a border\n3. Click the "Summarize" button in an AI message\n4. Or type "summarize the information"\n\nNow select the messages you want to summarize.';
                      setMessages(prev => [...prev, { id: Date.now().toString(), text: msg, isUser: false, timestamp: new Date(), showSummaryButton: true }]);
                    }
                  }}
                  className={`flex items-center gap-1 md:gap-2 shadow-sm text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 h-8 md:h-10 ${
                    summaryMode ? 'bg-orange-100 border-orange-300 text-orange-700' : 'bg-white'
                  }`}
                >
                  <MessageCircle className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">{language === 'de' ? (summaryMode ? 'Modus beenden' : 'Informationen zusammenfassen') : (summaryMode ? 'Exit mode' : 'Summarize information')}</span>
                  <span className="sm:hidden">{summaryMode ? 'Exit' : 'Sum'}</span>
                </Button>

                 <Button
                   variant="outline"
                   onClick={() => {
                     if (quizInfoMode) {
                       setQuizInfoMode(false);
                       setSelectedMessages([]);
                       setSummaryMode(false); // Ensure summary mode is also disabled
                       const msg = language === 'de' 
                         ? '❌ Quiz-Modus deaktiviert.'
                         : '❌ Quiz mode disabled.';
                       setMessages(prev => [...prev, { id: Date.now().toString(), text: msg, isUser: false, timestamp: new Date() }]);
                     } else {
                       setQuizInfoMode(true);
                       setSummaryMode(false); // Disable summary mode when enabling quiz
                       setSelectedMessages([]);
                       const msg = language === 'de' 
                         ? '🧠 **Quiz-Modus aktiviert**\n\nSo funktioniert es:\n1. Klicken Sie auf die Nachrichten, die Sie für das Quiz verwenden möchten\n2. Ausgewählte Nachrichten werden mit einem Rahmen markiert\n3. Klicken Sie auf den "Quiz erstellen" Button in einer AI-Nachricht\n4. Oder schreiben Sie "erstelle informations quiz"\n\nWählen Sie jetzt die Nachrichten aus, die für das Quiz verwendet werden sollen.'
                         : '🧠 **Quiz Mode Activated**\n\nHow it works:\n1. Click on the messages you want to use for the quiz\n2. Selected messages will be highlighted with a border\n3. Click the "Create Quiz" button in an AI message\n4. Or type "create information quiz"\n\nNow select the messages you want to use for the quiz.';
                       setMessages(prev => [...prev, { id: Date.now().toString(), text: msg, isUser: false, timestamp: new Date(), showQuizButton: true }]);
                     }
                   }}
                   className={`flex items-center gap-1 md:gap-2 shadow-sm text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 h-8 md:h-10 ${
                     quizInfoMode ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white'
                   }`}
                 >
                   <Brain className="w-3 h-3 md:w-4 md:h-4" />
                   <span className="hidden sm:inline">{language === 'de' ? (quizInfoMode ? 'Modus beenden' : 'Informations-Quiz') : (quizInfoMode ? 'Exit mode' : 'Information Quiz')}</span>
                   <span className="sm:hidden">{quizInfoMode ? 'Exit' : 'Quiz'}</span>
                 </Button>

                   {/* Single News Intelligence Button */}
                   <Button
                     variant="outline"
                     onClick={() => {
                       if (isInDetailMode) {
                         endNewsDetailMode();
                       } else {
                         cycleTimeframe();
                       }
                     }}
                     className={`flex items-center gap-1 md:gap-2 shadow-sm text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 h-8 md:h-10 ${
                       isInDetailMode ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white'
                     }`}
                   >
                     <Newspaper className="w-3 h-3 md:w-4 md:h-4" />
                     <span className="hidden sm:inline">
                       {isInDetailMode 
                         ? (language === 'de' ? 'Modus beenden' : 'Exit mode')
                         : getTimeframeLabel()
                       }
                     </span>
                      <span className="sm:hidden">
                        {isInDetailMode 
                          ? 'Exit' 
                          : getTimeframeLabel()
                        }
                      </span>
                   </Button>
              </>
            ) : isArticleMode ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleActionCardClick(actionCards[0])}
                  className="flex items-center gap-1 md:gap-2 bg-white shadow-sm text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 h-8 md:h-10"
                >
                  <MessageCircle className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">{language === 'de' ? actionCards[0].titleDe : actionCards[0].titleEn}</span>
                  <span className="sm:hidden">{language === 'de' ? 'Zus.' : 'Sum'}</span>
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => handleActionCardClick(actionCards[1])}
                  className="flex items-center gap-1 md:gap-2 bg-white shadow-sm text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 h-8 md:h-10"
                >
                  <Brain className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">{language === 'de' ? actionCards[1].titleDe : actionCards[1].titleEn}</span>
                  <span className="sm:hidden">Quiz</span>
                </Button>
              </>
            ) : (
              <>
                {/* Local mode buttons */}
                <Button
                  variant="outline"
                  onClick={() => {
                    const newMessage: Message = {
                      id: Date.now().toString(),
                      text: '',
                      isUser: false,
                      timestamp: new Date(),
                      articleSearch: true
                    };
                    setMessages(prev => [...prev, newMessage]);
                  }}
                  className="flex items-center gap-1 md:gap-2 bg-white shadow-sm text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 h-8 md:h-10"
                >
                  <Search className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">{language === 'de' ? 'Artikel Suche' : 'Article Search'}</span>
                  <span className="sm:hidden">{language === 'de' ? 'Suche' : 'Search'}</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    const newMessage: Message = {
                      id: Date.now().toString(),
                      text: language === 'de' 
                        ? '📱 **QR Code Generator**\n\nGeben Sie den Text oder die URL ein, für die Sie einen QR Code generieren möchten:\n\nBeispiele:\n- Eine Website URL\n- Kontaktinformationen\n- Wi-Fi Zugangsdaten\n- Beliebiger Text'
                        : '📱 **QR Code Generator**\n\nEnter the text or URL you want to generate a QR code for:\n\nExamples:\n- A website URL\n- Contact information\n- Wi-Fi credentials\n- Any text',
                      isUser: false,
                      timestamp: new Date(),
                      showQRGenerator: true
                    };
                    setMessages(prev => [...prev, newMessage]);
                  }}
                  className="flex items-center gap-1 md:gap-2 bg-white shadow-sm text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 h-8 md:h-10"
                >
                  <QrCode className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">{language === 'de' ? 'QR Code erstellen' : 'Generate QR Code'}</span>
                  <span className="sm:hidden">QR</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setQuizMode(true);
                    const msg = language === 'de' 
                      ? '🧠 **Quiz Generator**\n\nWählen Sie ein Thema für Ihr Quiz:\n\n**Beliebte Kategorien:**\n- Geschichte\n- Wissenschaft\n- Sport\n- Geographie\n- Kunst & Kultur\n- Technologie\n\nOder geben Sie ein beliebiges Thema ein!'
                      : '🧠 **Quiz Generator**\n\nChoose a topic for your quiz:\n\n**Popular Categories:**\n- History\n- Science\n- Sports\n- Geography\n- Arts & Culture\n- Technology\n\nOr enter any topic you like!';
                    const newMessage: Message = {
                      id: Date.now().toString(),
                      text: msg,
                      isUser: false,
                      timestamp: new Date()
                    };
                    setMessages(prev => [...prev, newMessage]);
                  }}
                  className="flex items-center gap-1 md:gap-2 bg-white shadow-sm text-xs md:text-sm px-2 md:px-4 py-1 md:py-2 h-8 md:h-10"
                >
                  <Brain className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">Quiz</span>
                  <span className="sm:hidden">Quiz</span>
                </Button>
              </>
            )}
          </div>

          {/* Suggestions (like examples) */}
          {showSuggestions && (filteredSuggestions.length > 0 || userSuggestions.length > 0) && searchMode !== 'internet' && (
            <div className="flex justify-center">
              <div className="w-full md:w-[80%] bg-white/90 border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {/* User suggestions have priority */}
                {userSuggestions.length > 0 ? (
                  userSuggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        sendPrompt(s);
                        setShowSuggestions(false);
                        setUserSuggestions([]);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 text-left"
                    >
                      <Search className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">{s}</span>
                    </button>
                  ))
                ) : (
                  filteredSuggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        sendPrompt(s);
                        setShowSuggestions(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 text-left"
                    >
                      <Search className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">{s}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* WhatsApp-style Input */}
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <div className="flex-1 bg-gray-100 rounded-2xl border border-gray-200 p-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setShowSuggestions(searchMode !== 'internet');
                  
                  // Handle user search suggestions
                  if (searchMode === 'local') {
                    const value = e.target.value;
                    const lower = value.toLowerCase();
                    const labelMap: Record<string, string> = {
                      'how is ': 'How is',
                      'who is ': 'Who is',
                      'wie ist ': 'Wie ist',
                      'wer ist ': 'Wer ist'
                    };
                    const prefixes = Object.keys(labelMap);
                    const matchedPrefix = prefixes.find(p => lower.startsWith(p));
                    
                    if (matchedPrefix) {
                      const searchQuery = value.substring(matchedPrefix.length).trim();
                      const prefixLabel = labelMap[matchedPrefix];
                      
                      if (searchQuery.length > 0) {
                        import('@dailyfun/data/employees').then(({ employees }) => {
                          const suggestions = employees
                            .filter(employee => {
                              const nameLower = employee.name.toLowerCase();
                              const searchLower = searchQuery.toLowerCase();
                              return nameLower.includes(searchLower) || 
                                     nameLower.split(' ').some(part => part.startsWith(searchLower));
                            })
                            .map(employee => `${prefixLabel} ${employee.name}`)
                            .slice(0, 5);
                          setUserSuggestions(suggestions);
                        });
                      } else {
                        import('@dailyfun/data/employees').then(({ employees }) => {
                          const suggestions = employees
                            .map(employee => `${prefixLabel} ${employee.name}`)
                            .slice(0, 5);
                          setUserSuggestions(suggestions);
                        });
                      }
                    } else {
                      setUserSuggestions([]);
                    }
                  }
                }}
                onFocus={() => setShowSuggestions(searchMode !== 'internet')}
                onBlur={() => setTimeout(() => {
                  setShowSuggestions(false);
                  setUserSuggestions([]);
                }, 120)}
                placeholder={language === 'de' ? 'Nachricht...' : 'Message...'}
                className="w-full bg-transparent border-none outline-none text-sm px-2 py-1"
                disabled={isTyping}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
            </div>
            {/* Send button - only visible when there's text */}
            {inputValue.trim() !== '' && (
              <Button 
                type="submit" 
                disabled={!inputValue.trim() || isTyping}
                className="rounded-full w-10 h-10 p-0 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 shadow-lg"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
            
            {/* Speak mode button - positioned where send button normally is when input is empty */}
            {inputValue.trim() === '' && (
              <Button
                variant="outline"
                onClick={toggleSpeakMode}
                disabled={!puterReady}
                className={`rounded-full w-10 h-10 p-0 border ${isListening ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-white shadow-sm'} ${!puterReady ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <Mic className="w-4 h-4" />
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default AI;