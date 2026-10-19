import { useGradient } from '@dailyfun/contexts/GradientContext';
import { useTheme } from '@dailyfun/contexts/ThemeContext';
import { useEffect, useState } from 'react';
import { useIsMobile } from '@dailyfun/hooks/use-mobile';

export const AnimatedBackground = () => {
  const { settings } = useGradient();
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const [bubbles, setBubbles] = useState<Array<{id: number, size: number, left: number, delay: number, duration: number}>>([]);

  useEffect(() => {
    // Generate random bubbles
    const newBubbles = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      size: Math.random() * 300 + 150, // 150-450px
      left: Math.random() * 100,
      delay: Math.random() * 5,
      duration: Math.random() * 10 + 15, // 15-25s
    }));
    setBubbles(newBubbles);
  }, []);

  if (!settings.enabled) return null;

  const getBubbleColor = () => {
    if (theme === 'green') return 'rgba(34, 197, 94, 0.6)'; // bright green
    if (theme === 'blue') return 'rgba(59, 130, 246, 0.6)'; // bright blue
    if (theme === 'red') return 'rgba(239, 68, 68, 0.6)'; // bright red
    if (theme === 'yellow') return 'rgba(234, 179, 8, 0.6)'; // bright yellow
    if (theme === 'orange') return 'rgba(249, 115, 22, 0.6)'; // bright orange
    if (theme === 'pink') return 'rgba(236, 72, 153, 0.6)'; // bright pink
    return settings.startColor + '99'; // default with transparency
  };

  const currentBackgroundImage = isMobile ? settings.backgroundImageMobile : settings.backgroundImageDesktop;

  return (
    <>
      {/* Custom background image if provided */}
      {currentBackgroundImage && (
        <div 
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: `url(${currentBackgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: 'blur(40px) brightness(0.7)',
            opacity: 0.3,
          }}
        />
      )}
      
      {/* Animated bubbles */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {bubbles.map((bubble) => (
          <div
            key={bubble.id}
            className="absolute rounded-full animate-float-bubble"
            style={{
              width: `${bubble.size}px`,
              height: `${bubble.size}px`,
              left: `${bubble.left}%`,
              bottom: '-200px',
              background: `radial-gradient(circle at 30% 30%, ${getBubbleColor()}, transparent)`,
              filter: 'blur(60px)',
              animationDelay: `${bubble.delay}s`,
              animationDuration: `${bubble.duration}s`,
              opacity: 0.8,
            }}
          />
        ))}
      </div>
    </>
  );
};
