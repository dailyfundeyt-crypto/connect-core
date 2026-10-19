
import { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

const InstallSidebar = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      setDeferredPrompt(null);
      setIsVisible(false);
    }
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible || !isInstallable) {
    return null;
  }

  return (
    <div className="fixed right-0 top-1/2 transform -translate-y-1/2 z-50">
      <div className="bg-white shadow-2xl rounded-l-lg border border-gray-200 p-6 max-w-sm animate-in slide-in-from-right">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center space-x-2">
            <Smartphone className="h-6 w-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Install App</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="mb-4">
          <p className="text-gray-600 text-sm mb-2">
            Get the full Daily Fun experience with our app!
          </p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>• Read news offline</li>
            <li>• Faster loading times</li>
            <li>• Desktop notifications</li>
            <li>• Easy access from home screen</li>
          </ul>
        </div>

        <button
          onClick={handleInstall}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
        >
          <Download className="h-4 w-4" />
          <span>Install Now</span>
        </button>
      </div>
    </div>
  );
};

export default InstallSidebar;
