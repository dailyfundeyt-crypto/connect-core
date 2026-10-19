import React from 'react';
import { useMessageSync } from '@dailyfun/hooks/useMessageSync';
import { hasDirectoryAccess, readFileFromLocalDirectory } from '@dailyfun/utils/fileSystemStorage';
import { FileText, FolderArchive, Download } from 'lucide-react';
import { Button } from '@dailyfun/components/ui/button';

interface MessageAttachmentProps {
  url: string;
  type: 'image' | 'pdf' | 'file' | 'folder';
  isOwn?: boolean;
  className?: string;
  fileName?: string;
}

const MessageAttachment: React.FC<MessageAttachmentProps> = ({ 
  url, 
  type, 
  isOwn = false,
  className,
  fileName
}) => {
  const { getAttachmentUrl } = useMessageSync();
  const [displayUrl, setDisplayUrl] = React.useState<string>(url);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let objectUrl: string | undefined;

    const load = async () => {
      try {
        setLoading(true);
        
        const hasAccess = await hasDirectoryAccess();
        
        if (hasAccess) {
          const fName = url.split('/').pop();
          if (fName) {
            try {
              const localFile = await readFileFromLocalDirectory(fName);
              if (localFile) {
                objectUrl = URL.createObjectURL(localFile);
                setDisplayUrl(objectUrl);
                setLoading(false);
                return;
              }
            } catch (e) {
              console.warn('Failed to read from local directory:', e);
            }
          }
        }

        try {
          const idbUrl = await getAttachmentUrl(url);
          if (idbUrl && idbUrl !== url) {
            setDisplayUrl(idbUrl);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('Failed to load from IndexedDB:', e);
        }

        setDisplayUrl(url);
        setLoading(false);
      } catch (e) {
        console.error('Error loading attachment:', e);
        setDisplayUrl(url);
        setLoading(false);
      }
    };

    load();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, getAttachmentUrl]);

  if (type === 'image') {
    return (
      <div className="max-w-[75%]">
        <img
          src={displayUrl}
          loading="lazy"
          alt="Geteiltes Bild"
          className={className || "rounded-2xl max-h-80 object-cover shadow-md cursor-pointer"}
          onClick={() => window.open(displayUrl, '_blank')}
          style={{ opacity: loading ? 0.5 : 1 }}
        />
      </div>
    );
  }

  // File / PDF / Folder
  const displayName = fileName?.replace(/^📎\s?|^📄\s?|^📁\s?/, '') || 'Datei';
  const isFolder = type === 'folder';
  const Icon = isFolder ? FolderArchive : FileText;

  return (
    <div
      className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 ${
        isOwn
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-card-foreground border border-border'
      }`}
    >
      <Icon className="h-10 w-10 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{displayName}</p>
        <Button
          size="sm"
          variant={isOwn ? 'secondary' : 'default'}
          onClick={() => window.open(displayUrl, '_blank')}
          className="mt-2 gap-2"
          disabled={loading}
        >
          <Download className="h-3 w-3" />
          {loading ? 'Lädt...' : isFolder ? 'Herunterladen' : 'Öffnen'}
        </Button>
      </div>
    </div>
  );
};

export default MessageAttachment;
