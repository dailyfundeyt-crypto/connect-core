import { useState } from 'react';
import { Card } from '@dailyfun/components/ui/card';
import { Button } from '@dailyfun/components/ui/button';
import { Input } from '@dailyfun/components/ui/input';
import { Crown, Youtube, ExternalLink } from 'lucide-react';
import { useSubscription } from '@dailyfun/hooks/useSubscription';
import { toast } from 'sonner';

export const FocusTubePlayer = () => {
  const { isProUser, loading } = useSubscription();
  const [videoUrl, setVideoUrl] = useState('');

  const openFocusTube = () => {
    if (!isProUser) {
      toast.error('Dieses Feature ist nur für Pro-Nutzer verfügbar');
      return;
    }

    let url = 'https://focus-tube-filter.lovable.app/';
    
    // Extract video ID from YouTube URL if provided
    if (videoUrl) {
      const videoIdMatch = videoUrl.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^&\n?#]+)/);
      if (videoIdMatch && videoIdMatch[1]) {
        url += `?v=${videoIdMatch[1]}`;
      }
    }

    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-24 bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-6 ${!isProUser ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-3 rounded-lg ${isProUser ? 'bg-gradient-to-br from-red-500 to-pink-500' : 'bg-muted'}`}>
          <Youtube className={`h-6 w-6 ${isProUser ? 'text-white' : 'text-muted-foreground'}`} />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold flex items-center gap-2">
            Focus Tube Video Player
            {!isProUser && <Crown className="h-5 w-5 text-yellow-500" />}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isProUser 
              ? 'Öffne YouTube-Videos ohne Ablenkungen' 
              : 'Exklusiv für Pro-Mitglieder'}
          </p>
        </div>
      </div>

      {!isProUser ? (
        <div className="bg-muted/50 rounded-lg p-6 text-center">
          <Crown className="h-12 w-12 text-yellow-500 mx-auto mb-3" />
          <h4 className="font-bold mb-2">Pro Feature</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Upgrade auf Pro, um den Focus Tube Video Player freizuschalten
          </p>
          <Button 
            className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <Crown className="h-4 w-4 mr-2" />
            Jetzt upgraden
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              YouTube Video URL (optional)
            </label>
            <Input
              type="text"
              placeholder="https://www.youtube.com/watch?v=..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="mb-3"
            />
          </div>

          <Button 
            onClick={openFocusTube}
            className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white"
            size="lg"
          >
            <Youtube className="h-5 w-5 mr-2" />
            Focus Tube öffnen
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Der Video Player öffnet sich in einem neuen Tab
          </p>
        </div>
      )}
    </Card>
  );
};
