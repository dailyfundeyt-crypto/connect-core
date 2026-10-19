import React, { useState, useCallback } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  onLoad?: () => void;
  onError?: () => void;
  sizes?: string;
  width?: number;
  height?: number;
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  fallbackSrc = '/placeholder.svg',
  onLoad,
  onError,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  width,
  height
}) => {
  const [imageSrc, setImageSrc] = useState(src);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    setImageSrc(fallbackSrc);
    onError?.();
  }, [fallbackSrc, onError]);

  // Process image source for different types
  const getOptimizedSrc = (baseSrc: string) => {
    // If it's a relative path starting with /, use as is
    if (baseSrc.startsWith('/')) {
      return baseSrc;
    }
    
    // If it's an external URL, use as is
    if (baseSrc.startsWith('http')) {
      return baseSrc;
    }
    
    // If it looks like an Unsplash ID, construct the URL
    return `https://images.unsplash.com/${baseSrc}?auto=format&fit=crop&w=800&q=80`;
  };

  const optimizedSrc = getOptimizedSrc(src);

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded" />
      )}
      <img
        src={hasError ? fallbackSrc : optimizedSrc}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoading ? 'opacity-0' : 'opacity-100'
        }`}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
        sizes={sizes}
        width={width}
        height={height}
      />
    </div>
  );
};

export default OptimizedImage;