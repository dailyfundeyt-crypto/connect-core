export function ThemeScript() {
  const code = `
    (function() {
      try {
        var stored = localStorage.getItem('connect-theme');
        var prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var dark = stored === 'dark' || (!stored && prefers);
        if (dark) document.documentElement.classList.add('dark');
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
