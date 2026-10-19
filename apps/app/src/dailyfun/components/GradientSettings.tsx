import { useGradient } from '@dailyfun/contexts/GradientContext';
import { Label } from '@dailyfun/components/ui/label';
import { Switch } from '@dailyfun/components/ui/switch';
import { Slider } from '@dailyfun/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@dailyfun/components/ui/card';
import { Button } from '@dailyfun/components/ui/button';
import { Input } from '@dailyfun/components/ui/input';
import { Upload, X, Monitor, Smartphone } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

export const GradientSettings = () => {
  const { settings, updateSettings } = useGradient();
  const desktopFileInputRef = useRef<HTMLInputElement>(null);
  const mobileFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDesktop, setUploadingDesktop] = useState(false);
  const [uploadingMobile, setUploadingMobile] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'desktop' | 'mobile') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Datei zu groß. Maximum 5MB.');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error('Bitte nur Bilddateien hochladen.');
      return;
    }

    const setUploading = type === 'desktop' ? setUploadingDesktop : setUploadingMobile;
    setUploading(true);
    
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      if (type === 'desktop') {
        updateSettings({ backgroundImageDesktop: imageUrl });
      } else {
        updateSettings({ backgroundImageMobile: imageUrl });
      }
      toast.success(`${type === 'desktop' ? 'Desktop' : 'Mobile'}-Hintergrundbild hochgeladen!`);
      setUploading(false);
    };

    reader.onerror = () => {
      toast.error('Fehler beim Hochladen des Bildes.');
      setUploading(false);
    };

    reader.readAsDataURL(file);
  };

  const handleRemoveImage = (type: 'desktop' | 'mobile') => {
    if (type === 'desktop') {
      updateSettings({ backgroundImageDesktop: undefined });
      if (desktopFileInputRef.current) {
        desktopFileInputRef.current.value = '';
      }
    } else {
      updateSettings({ backgroundImageMobile: undefined });
      if (mobileFileInputRef.current) {
        mobileFileInputRef.current.value = '';
      }
    }
    toast.success(`${type === 'desktop' ? 'Desktop' : 'Mobile'}-Hintergrundbild entfernt.`);
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="px-4 py-4 sm:px-6 sm:py-6">
        <CardTitle className="text-base sm:text-lg md:text-xl text-foreground">Scroll-Verlauf Einstellungen</CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground">
          Feinabstimmung des Farbverlaufs (Die Hauptfarbe wird automatisch durch dein gewähltes Theme bestimmt)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6 px-4 sm:px-6">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="gradient-enabled" className="text-xs sm:text-sm md:text-base text-foreground flex-shrink-0">
            Scroll-Verlauf aktivieren
          </Label>
          <Switch
            id="gradient-enabled"
            checked={settings.enabled}
            onCheckedChange={(enabled) => updateSettings({ enabled })}
            className="flex-shrink-0"
          />
        </div>

        {settings.enabled && (
          <>
            {/* End Color */}
            <div className="space-y-2 sm:space-y-3">
              <Label className="text-xs sm:text-sm md:text-base text-foreground">Endfarbe beim Scrollen</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.endColor}
                  onChange={(e) => updateSettings({ endColor: e.target.value })}
                  className="h-9 w-16 sm:h-10 sm:w-20 rounded border border-border bg-background cursor-pointer flex-shrink-0"
                />
                <input
                  type="text"
                  value={settings.endColor}
                  onChange={(e) => updateSettings({ endColor: e.target.value })}
                  className="flex-1 min-w-0 h-9 sm:h-10 px-2 sm:px-3 rounded-md border border-input bg-background text-foreground text-xs sm:text-sm"
                  placeholder="#000000"
                />
              </div>
            </div>

            {/* Scroll Trigger Point */}
            <div className="space-y-2">
              <div className="flex justify-between gap-2">
                <Label className="text-xs sm:text-sm md:text-base text-foreground flex-shrink-0">Scroll-Trigger-Punkt</Label>
                <span className="text-xs sm:text-sm text-muted-foreground flex-shrink-0">{settings.scrollTriggerPoint}%</span>
              </div>
              <Slider
                value={[settings.scrollTriggerPoint]}
                onValueChange={([value]) => updateSettings({ scrollTriggerPoint: value })}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Definiert, wie weit du scrollen musst, bis der Hintergrund vollständig zur Endfarbe übergeblendet ist.
              </p>
            </div>

            {/* Transition Speed */}
            <div className="space-y-2">
              <div className="flex justify-between gap-2">
                <Label className="text-xs sm:text-sm md:text-base text-foreground flex-shrink-0">Übergangsgeschwindigkeit</Label>
                <span className="text-xs sm:text-sm text-muted-foreground flex-shrink-0">{settings.transitionSpeed.toFixed(1)}s</span>
              </div>
              <Slider
                value={[settings.transitionSpeed * 10]}
                onValueChange={([value]) => updateSettings({ transitionSpeed: value / 10 })}
                min={1}
                max={20}
                step={1}
                className="w-full"
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Legt fest, wie schnell der Farbwechsel beim Scrollen erfolgt.
              </p>
            </div>

            {/* Desktop Background Image */}
            <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-border">
              <Label className="text-xs sm:text-sm md:text-base text-foreground flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                Desktop-Hintergrundbild (Optional)
              </Label>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Lade ein Bild hoch, das als verschwommener Hintergrund auf Desktop-Geräten angezeigt wird.
              </p>
              
              {settings.backgroundImageDesktop ? (
                <div className="space-y-2 sm:space-y-3">
                  <div className="relative w-full h-24 sm:h-32 rounded-lg overflow-hidden border border-border">
                    <img 
                      src={settings.backgroundImageDesktop} 
                      alt="Desktop background preview" 
                      className="w-full h-full object-cover"
                      style={{ filter: 'blur(10px)' }}
                    />
                  </div>
                  <Button 
                    onClick={() => handleRemoveImage('desktop')}
                    variant="destructive"
                    size="sm"
                    className="w-full h-8 sm:h-9 text-xs sm:text-sm"
                  >
                    <X className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    Desktop-Hintergrundbild entfernen
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    ref={desktopFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'desktop')}
                    className="hidden"
                    id="desktop-background-upload"
                  />
                  <Button
                    onClick={() => desktopFileInputRef.current?.click()}
                    variant="outline"
                    className="w-full h-8 sm:h-9 text-xs sm:text-sm"
                    disabled={uploadingDesktop}
                  >
                    <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    {uploadingDesktop ? 'Hochladen...' : 'Desktop-Bild hochladen (max 5MB)'}
                  </Button>
                </>
              )}
            </div>

            {/* Mobile Background Image */}
            <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-border">
              <Label className="text-xs sm:text-sm md:text-base text-foreground flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                Mobile-Hintergrundbild (Optional)
              </Label>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Lade ein Bild hoch, das als verschwommener Hintergrund auf mobilen Geräten angezeigt wird.
              </p>
              
              {settings.backgroundImageMobile ? (
                <div className="space-y-2 sm:space-y-3">
                  <div className="relative w-full h-24 sm:h-32 rounded-lg overflow-hidden border border-border">
                    <img 
                      src={settings.backgroundImageMobile} 
                      alt="Mobile background preview" 
                      className="w-full h-full object-cover"
                      style={{ filter: 'blur(10px)' }}
                    />
                  </div>
                  <Button 
                    onClick={() => handleRemoveImage('mobile')}
                    variant="destructive"
                    size="sm"
                    className="w-full h-8 sm:h-9 text-xs sm:text-sm"
                  >
                    <X className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    Mobile-Hintergrundbild entfernen
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    ref={mobileFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'mobile')}
                    className="hidden"
                    id="mobile-background-upload"
                  />
                  <Button
                    onClick={() => mobileFileInputRef.current?.click()}
                    variant="outline"
                    className="w-full h-8 sm:h-9 text-xs sm:text-sm"
                    disabled={uploadingMobile}
                  >
                    <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    {uploadingMobile ? 'Hochladen...' : 'Mobile-Bild hochladen (max 5MB)'}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};