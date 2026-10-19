import React, { useState } from 'react';
import { Share2, Check, MessageCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { ShareArticleDialog } from './ShareArticleDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dailyfun/components/ui/dropdown-menu';

interface ArticleShareButtonProps {
  articleId: string;
  title: string;
  excerpt?: string;
  imageUrl?: string;
  category?: string;
}

const ArticleShareButton: React.FC<ArticleShareButtonProps> = ({ 
  articleId, 
  title, 
  excerpt = '',
  imageUrl,
  category = ''
}) => {
  const [copied, setCopied] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const { language } = useLanguage();

  const shareUrl = `${window.location.origin}/article/${articleId}`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: title,
          url: shareUrl,
        });
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      // Fallback to clipboard on error
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (clipboardError) {
        console.error('Failed to copy to clipboard:', clipboardError);
      }
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="apple-toggle inline-flex items-center justify-center px-3 py-2.5 min-w-[100px] sm:min-w-[120px] bg-background/80 backdrop-blur-md border-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-xl hover:shadow-primary/25 hover:scale-105 active:scale-95 transition-all duration-300 ease-apple-spring rounded-xl font-medium text-sm whitespace-nowrap">
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2 animate-scale-in" />
                <span className="animate-fade-in">{language === 'de' ? 'Kopiert!' : 'Copied!'}</span>
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4 mr-2" />
                <span>{language === 'de' ? 'Teilen' : 'Share'}</span>
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setShowShareDialog(true)}>
            <MessageCircle className="mr-2 h-4 w-4" />
            <span>{language === 'de' ? 'In Daily Fun teilen' : 'Share on Daily Fun'}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" />
            <span>{language === 'de' ? 'Link kopieren' : 'Copy link'}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareArticleDialog
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        article={{
          id: articleId,
          title,
          excerpt,
          image_url: imageUrl,
          category,
        }}
      />
    </>
  );
};

export default ArticleShareButton;