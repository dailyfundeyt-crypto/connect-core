import React, { useEffect, useRef, useState } from 'react';

interface AnimatedParagraphPinkProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

const AnimatedParagraphPink: React.FC<AnimatedParagraphPinkProps> = ({ 
  children, 
  className = '', 
  delay = 0 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            setIsVisible(true);
            setIsAnimating(true);
            
            // End animation after short duration
            setTimeout(() => {
              setIsAnimating(false);
            }, 500);
          }, delay);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, [delay]);

  return (
    <div 
      ref={elementRef} 
      className={`sans-serif font-normal leading-relaxed transition-all duration-500 ease-out pointer-events-none select-none ${
        isVisible 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-4'
      } ${className}`}
      style={{
        textShadow: isAnimating 
          ? '0 0 8px #5E40E3, 0 0 15px #5E40E3' 
          : 'none',
        color: isAnimating ? '#5E40E3' : '#5E40E3',
        transition: 'all 0.5s cubic-bezier(0.23, 1, 0.320, 1)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none'
      }}
    >
      {children}
    </div>
  );
};

export default AnimatedParagraphPink;