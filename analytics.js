// analytics.js
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }

// Load Google Analytics
(function() {
  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-ZEGH58921N';
  document.head.appendChild(script);

  gtag('js', new Date());

  // Dynamic tracking based on current page
  const path = window.location.pathname;

  if (path === '/' || path === '/index.html') {
    gtag('config', 'G-ZEGH58921N', {
      page_title: 'Home',
      page_path: '/index.html'
    });
  } else if (path === '/resume.html') {
    gtag('config', 'G-ZEGH58921N', {
      page_title: 'Resume',
      page_path: '/resume.html'
    });
  } else {
    // Fallback for any future pages
    gtag('config', 'G-ZEGH58921N', {
      page_title: document.title,
      page_path: path
    });
  }
})();