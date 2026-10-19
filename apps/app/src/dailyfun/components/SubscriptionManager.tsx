import { Card } from "@dailyfun/components/ui/card";
import { Button } from "@dailyfun/components/ui/button";
import { Badge } from "@dailyfun/components/ui/badge";
import { Progress } from "@dailyfun/components/ui/progress";
import { Crown, Check, Sparkles, Image, Youtube, Ban } from "lucide-react";
import { useSubscription } from "@dailyfun/hooks/useSubscription";
import { useLanguage } from "@dailyfun/contexts/LanguageContext";

export const SubscriptionManager = () => {
  const { subscription, plans, loading, isProUser, activateProSubscription, cancelSubscription } = useSubscription();
  const { language } = useLanguage();

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

  const proPlan = plans.find(p => p.name === 'Pro');
  const freePlan = plans.find(p => p.name === 'Free');
  const currentPlan = subscription?.plan || freePlan;

  const aiCreditsPercent = subscription 
    ? (subscription.ai_credits_remaining / (currentPlan?.ai_credits || 100)) * 100
    : 0;

  const imagesUploadedPercent = subscription
    ? (subscription.images_uploaded / (currentPlan?.image_upload_limit || 10)) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Current Subscription Status */}
      <Card className="p-6 border-2 border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${isProUser ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-muted'}`}>
              <Crown className={`h-6 w-6 ${isProUser ? 'text-white' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                {currentPlan?.name || 'Free'} Plan
                {isProUser && <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0">PRO</Badge>}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isProUser ? 'Vollständiger Zugriff auf alle Premium-Features' : 'Kostenloser Plan mit begrenzten Features'}
              </p>
            </div>
          </div>
          {subscription && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Aktiviert am</p>
              <p className="font-semibold">
                {new Date(subscription.activated_at).toLocaleDateString('de-DE')}
              </p>
            </div>
          )}
        </div>

        {/* Usage Statistics */}
        <div className="space-y-4 mt-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                AI Credits
              </span>
              <span className="text-sm font-bold">
                {subscription?.ai_credits_remaining || 0} / {currentPlan?.ai_credits || 100}
              </span>
            </div>
            <Progress value={aiCreditsPercent} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Für Daily Fun, Informationen zusammenfassen & Quiz
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <Image className="h-4 w-4" />
                Bild-Uploads
              </span>
              <span className="text-sm font-bold">
                {subscription?.images_uploaded || 0} / {currentPlan?.image_upload_limit || 10}
              </span>
            </div>
            <Progress value={imagesUploadedPercent} className="h-2" />
          </div>
        </div>
      </Card>

      {/* Pro Plan Benefits */}
      {!isProUser && proPlan && (
        <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Crown className="h-6 w-6 text-primary" />
                <h3 className="text-2xl font-bold">Pro Plan</h3>
                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0">UPGRADE</Badge>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-primary">2,99€</p>
                <p className="text-sm text-muted-foreground">pro Monat</p>
              </div>
            </div>
            <p className="text-muted-foreground">Schalte alle Premium-Features frei</p>
          </div>

          <div className="grid gap-3 mb-6">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div>
                <span className="font-medium block">{proPlan.ai_credits} AI Credits pro Monat</span>
                <span className="text-sm text-muted-foreground">
                  = {proPlan.ai_credits} AI-Anfragen für Daily Fun (Article), Daily Fun (Internet Search), 
                  Informationen zusammenfassen und Informations-Quiz
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <span className="font-medium">Bis zu {proPlan.image_upload_limit} Bild-Uploads</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Ban className="h-4 w-4 text-primary" />
              </div>
              <span className="font-medium">Werbefreie Nutzung</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Youtube className="h-4 w-4 text-primary" />
              </div>
              <span className="font-medium">Focus Tube Video Player Zugriff</span>
            </div>
          </div>

          <Button 
            onClick={activateProSubscription}
            className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold"
            size="lg"
          >
            <Crown className="h-5 w-5 mr-2" />
            Jetzt für 2,99€/Monat Pro werden
          </Button>
        </Card>
      )}

      {/* Cancel Subscription */}
      {isProUser && subscription && (
        <Card className="p-6 border-destructive/20">
          <h3 className="text-lg font-bold mb-2">Abonnement verwalten</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Du kannst dein Pro-Abonnement jederzeit kündigen. Deine Credits bleiben bis zum Monatsende gültig.
          </p>
          <Button 
            onClick={cancelSubscription}
            variant="destructive"
            className="w-full"
          >
            Pro-Abonnement kündigen
          </Button>
        </Card>
      )}
    </div>
  );
};
