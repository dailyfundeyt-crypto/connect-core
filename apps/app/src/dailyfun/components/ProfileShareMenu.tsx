import React, { useState, useRef, useEffect } from 'react';
import { Share2, Link, QrCode, Check, X, MoreVertical } from 'lucide-react';
import QRCode from 'qrcode';
import { useToast } from '@dailyfun/hooks/use-toast';

interface ProfileShareMenuProps {
  profileName: string;
  profileId: string;
}

const ProfileShareMenu: React.FC<ProfileShareMenuProps> = ({ profileName, profileId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Generate profile URL
  const profileUrl = `${window.location.origin}/search?profile=${profileId}`;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowQR(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate QR Code
  const generateQRCode = async () => {
    try {
      const qrDataUrl = await QRCode.toDataURL(profileUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      setQrCodeUrl(qrDataUrl);
      setShowQR(true);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "QR-Code konnte nicht generiert werden.",
        variant: "destructive",
      });
    }
  };

  // Copy link to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      toast({
        title: "Link kopiert!",
        description: "Der Profil-Link wurde in die Zwischenablage kopiert.",
      });
      
      setTimeout(() => {
        setCopied(false);
        setIsOpen(false);
      }, 2000);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Link konnte nicht kopiert werden.",
        variant: "destructive",
      });
    }
  };

  // Auto-generate QR code when opening menu
  const handleMenuOpen = async () => {
    setIsOpen(true);
    if (!qrCodeUrl) {
      try {
        const qrDataUrl = await QRCode.toDataURL(profileUrl, {
          width: 200,
          margin: 2,
          color: {
            dark: '#ff4500',
            light: '#FFFFFF',
          },
        });
        setQrCodeUrl(qrDataUrl);
      } catch (error) {
        console.error('Failed to generate QR code:', error);
      }
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setCopied(false);
  };

  // Download QR Code function
  const downloadQRCode = () => {
    if (qrCodeUrl) {
      const link = document.createElement('a');
      link.download = `qr-code-${profileName.toLowerCase().replace(' ', '-')}.png`;
      link.href = qrCodeUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "QR-Code heruntergeladen!",
        description: "Der QR-Code wurde erfolgreich heruntergeladen.",
      });
    }
  };

  return (
    <>
      {/* Three Dots Menu Button */}
      <button
        onClick={handleMenuOpen}
        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        title="Profil teilen"
      >
        <MoreVertical className="h-4 w-4 text-gray-600" />
      </button>

      {/* Share Menu Overlay - Mobile Responsive */}
      {isOpen && (
        <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50 p-4">
          {/* Subtle organic background lines matching main site */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-0 bg-gradient-to-br from-red-accent/10 via-transparent to-blue-accent/10"></div>
            <div className="absolute top-1/4 left-1/4 w-64 sm:w-96 h-16 sm:h-24 bg-red-accent/5 rounded-full transform -rotate-12 blur-xl"></div>
            <div className="absolute bottom-1/3 right-1/4 w-56 sm:w-80 h-12 sm:h-20 bg-blue-accent/5 rounded-full transform rotate-12 blur-xl"></div>
          </div>

          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute top-4 sm:top-6 right-4 sm:right-6 text-black hover:text-red-accent rounded-full p-2 transition-colors z-10"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>

          {/* Content Container */}
          <div className="relative z-10 max-w-sm w-full mx-4">
            {/* QR Code Container */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-lg border border-gray-100 mb-4 sm:mb-6">
              <div className="text-center mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-black font-serif mb-2">
                  Profil teilen
                </h2>
                <p className="text-gray-600 text-xs sm:text-sm">
                  Scannen Sie den QR-Code oder kopieren Sie den Link
                </p>
              </div>

              {qrCodeUrl && (
                <div className="flex flex-col items-center mb-4 sm:mb-6">
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-200">
                    <img 
                      src={qrCodeUrl} 
                      alt={`QR-Code für ${profileName}`}
                      className="w-32 h-32 sm:w-40 sm:h-40"
                    />
                  </div>
                  <div className="mt-3 sm:mt-4 text-center">
                    <h3 className="text-base sm:text-lg font-bold text-black font-serif">
                      {profileName}
                    </h3>
                    <p className="text-red-accent text-xs sm:text-sm font-medium">
                      Journalist & Autor
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={copyToClipboard}
                className="w-full bg-red-accent hover:bg-red-accent/90 text-white font-medium py-3 sm:py-4 px-4 sm:px-6 rounded-xl transition-colors flex items-center justify-center space-x-3 shadow-lg text-sm sm:text-base"
              >
                {copied ? (
                  <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <Link className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
                <span>
                  {copied ? 'Link kopiert!' : 'Link kopieren'}
                </span>
              </button>
              
              <button
                onClick={downloadQRCode}
                className="w-full bg-white hover:bg-gray-50 text-black font-medium py-3 sm:py-4 px-4 sm:px-6 rounded-xl transition-colors border border-gray-200 flex items-center justify-center space-x-3 text-sm sm:text-base"
              >
                <QrCode className="h-4 w-4 sm:h-5 sm:w-5" />
                <span>QR Code Teilen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProfileShareMenu;