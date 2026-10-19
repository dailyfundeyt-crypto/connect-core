import React, { useEffect, useState } from 'react';
import phase1 from '@dailyfun/assets/phase1-daily-fun.png';
import phase2 from '@dailyfun/assets/phase2-dissolving.png';
import phase3 from '@dailyfun/assets/phase3-forming.png';
import phase4 from '@dailyfun/assets/phase4-glowing.png';
import phase5 from '@dailyfun/assets/phase5-black-background.png';

const AnimatedLogoTransition: React.FC = () => {
  const [phase, setPhase] = useState<'phase1' | 'phase2' | 'phase3' | 'phase4' | 'phase5' | 'returning'>('phase1');
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const runCycle = () => {
      const timeline = [
        { delay: 2000, nextPhase: 'phase2' as const },  // Phase 1 → Phase 2: Auflösen
        { delay: 3500, nextPhase: 'phase3' as const },  // Phase 2 → Phase 3: Formung
        { delay: 5000, nextPhase: 'phase4' as const },  // Phase 3 → Phase 4: Vollständig
        { delay: 6500, nextPhase: 'phase5' as const },  // Phase 4 → Phase 5: Schwarzer Hintergrund
      ];

      const timeouts = timeline.map(({ delay, nextPhase }) =>
        setTimeout(() => {
          setPhase(nextPhase);
          
          // Dispatch custom event for phase changes
          if (nextPhase === 'phase5') {
            window.dispatchEvent(new CustomEvent('logoPhaseChange', { detail: 'conect' }));
            
            // Nach Phase 5: Warte 60 Sekunden, dann zurück zu Phase 1
            setTimeout(() => {
              setPhase('phase1');
              window.dispatchEvent(new CustomEvent('logoPhaseChange', { detail: 'daily-fun' }));
              setCycle(prev => prev + 1);
            }, 60000); // 60 Sekunden = 1 Minute
          } else if (nextPhase === 'phase2' || nextPhase === 'phase3' || nextPhase === 'phase4') {
            window.dispatchEvent(new CustomEvent('logoPhaseChange', { detail: nextPhase }));
          }
        }, delay)
      );

      return () => timeouts.forEach(clearTimeout);
    };

    const cleanup = runCycle();
    return cleanup;
  }, [cycle]);

  return (
    <div className="relative w-48 h-48 mx-auto">
      {/* Phase 1: Daily Fun Logo */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-1000 ${
          phase === 'phase1'
            ? 'opacity-100 scale-100'
            : phase === 'returning'
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-90'
        }`}
      >
        <img
          src={phase1}
          alt="Phase 1: Daily Fun Logo"
          className="w-full h-full object-contain"
        />
      </div>

      {/* Phase 2: Auflösen und Zusammenziehen */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-1000 ${
          phase === 'phase2'
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-90'
        }`}
      >
        <img
          src={phase2}
          alt="Phase 2: Auflösen"
          className="w-full h-full object-contain animate-spin-slow"
        />
      </div>

      {/* Phase 3: Formung des Conect Symbols */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-1000 ${
          phase === 'phase3'
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-85'
        }`}
      >
        <img
          src={phase3}
          alt="Phase 3: Formung"
          className="w-full h-full object-contain"
          style={{
            animation: phase === 'phase3' ? 'pulse-rotate 1.5s ease-in-out' : 'none',
          }}
        />
      </div>

      {/* Phase 4: Conect Symbol vollständig und leuchtend */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-1000 ${
          phase === 'phase4'
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-90'
        }`}
      >
        <div className={phase === 'phase4' ? 'animate-glow-pulse' : ''}>
          <img
            src={phase4}
            alt="Phase 4: Leuchtend"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Phase 5: Conect Logo auf schwarzem Hintergrund - bleibt für 60 Sekunden */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-1000 ${
          phase === 'phase5'
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95'
        }`}
      >
        <div className={phase === 'phase5' ? 'animate-glow-continuous' : ''}>
          <img
            src={phase5}
            alt="Phase 5: Schwarzer Hintergrund"
            className="w-full h-full object-contain rounded-full"
          />
        </div>
      </div>

      <style>{`
        @keyframes glow-continuous {
          0%, 100% {
            filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 40px rgba(220, 220, 220, 0.6));
          }
          50% {
            filter: drop-shadow(0 0 40px rgba(255, 255, 255, 1)) drop-shadow(0 0 70px rgba(220, 220, 220, 1)) drop-shadow(0 0 100px rgba(255, 255, 255, 0.7));
          }
        }

        @keyframes glow-pulse {
          0%, 100% {
            filter: drop-shadow(0 0 25px rgba(255, 255, 255, 0.9)) drop-shadow(0 0 50px rgba(220, 220, 220, 0.7));
          }
          50% {
            filter: drop-shadow(0 0 45px rgba(255, 255, 255, 1)) drop-shadow(0 0 80px rgba(220, 220, 220, 1));
          }
        }

        @keyframes pulse-rotate {
          0% {
            transform: scale(0.9) rotate(0deg);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.05) rotate(180deg);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(360deg);
            opacity: 1;
          }
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .animate-glow-continuous {
          animation: glow-continuous 3s ease-in-out infinite;
        }

        .animate-glow-pulse {
          animation: glow-pulse 2s ease-in-out infinite;
        }

        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default AnimatedLogoTransition;
