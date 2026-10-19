import React from 'react';
import { useMessageSync } from '@dailyfun/hooks/useMessageSync';
import { hasDirectoryAccess, readFileFromLocalDirectory } from '@dailyfun/utils/fileSystemStorage';

interface MessageImageProps {
  url: string;
  alt?: string;
  className?: string;
  onClick?: (resolvedUrl: string) => void;
}

const MessageImage: React.FC<MessageImageProps> = ({ url, alt = 'Geteiltes Bild', className, onClick }) => {
  const { getAttachmentUrl } = useMessageSync();
  const [displayUrl, setDisplayUrl] = React.useState<string>(url);

  React.useEffect(() => {
    let objectUrl: string | undefined;

    const load = async () => {
      try {
        // Try local directory first if available
        const hasAccess = await hasDirectoryAccess();
        if (hasAccess) {
          const fileName = url.split('/').pop();
          if (fileName) {
            try {
              const localFile = await readFileFromLocalDirectory(fileName);
              if (localFile) {
                objectUrl = URL.createObjectURL(localFile);
                setDisplayUrl(objectUrl);
                return;
              }
            } catch (_) {
              // ignore and try next source
            }
          }
        }

        // Try IndexedDB next
        try {
          const idbUrl = await getAttachmentUrl(url);
          if (idbUrl && idbUrl !== url) {
            setDisplayUrl(idbUrl);
            return;
          }
        } catch (_) {
          // ignore and fallback
        }

        // Fallback to original URL
        setDisplayUrl(url);
      } catch (_) {
        setDisplayUrl(url);
      }
    };

    load();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, getAttachmentUrl]);

  return (
    <img
      src={displayUrl}
      loading="lazy"
      alt={alt}
      className={className}
      onClick={() => onClick?.(displayUrl)}
    />
  );
};

export default MessageImage;
