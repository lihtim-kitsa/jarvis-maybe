(function () {
  'use strict';

  // --- UI Elements ---
  const newsPopup = document.getElementById('news-popup');
  const newsCloseBtn = document.getElementById('news-close');
  const timeWidget = document.getElementById('ist-time-widget');
  const visualWindow = document.querySelector('.visual-window');
  const summaryWindow = document.querySelector('.summarization-window');

  // --- Current article index for carousel navigation ---
  let currentArticles = [];
  let currentIndex = 0;

  // --- News Panel Logic ---

  /**
   * Fetch news from the backend cache and render into the panel.
   * @param {string} topic - Topic to fetch (default: 'general')
   */
  async function loadNewsData(topic = 'general') {
    try {
      // Show loading state
      if (visualWindow) {
        visualWindow.innerHTML = '<div class="visual-placeholder">FETCHING NEWS...</div>';
      }
      if (summaryWindow) {
        summaryWindow.innerHTML = '<div class="summary-placeholder">Loading summaries from pipeline...</div>';
      }

      const res = await fetch(`${window.API_BASE}/api/news?topic=${encodeURIComponent(topic)}&limit=5`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      currentArticles = data.articles || [];
      currentIndex = 0;

      if (currentArticles.length === 0) {
        renderEmpty();
      } else {
        renderArticle(currentIndex);
      }
    } catch (e) {
      console.error('[News Panel] Failed to load news:', e);
      if (visualWindow) {
        visualWindow.innerHTML = '<div class="visual-placeholder">FEED UNAVAILABLE</div>';
      }
      if (summaryWindow) {
        summaryWindow.innerHTML = `<div class="summary-placeholder">Error: ${e.message}</div>`;
      }
    }
  }

  function renderArticle(index) {
    const article = currentArticles[index];
    if (!article) return;

    // Visual Window — show image if available, else styled placeholder
    if (visualWindow) {
      if (article.image_url) {
        visualWindow.innerHTML = `
          <img src="${article.image_url}" alt="${article.headline}" class="news-image" />
          <div class="news-image-overlay">
            <span class="news-source-badge">${article.source || 'NEWS'}</span>
            <span class="news-nav-info">${index + 1} / ${currentArticles.length}</span>
          </div>`;
      } else {
        visualWindow.innerHTML = `
          <div class="visual-placeholder">
            <span class="news-source-badge">${article.source || 'NEWS'}</span>
            <span style="margin-top:12px;">${article.headline}</span>
            <span class="news-nav-info">${index + 1} / ${currentArticles.length}</span>
          </div>`;
      }
    }

    // Summarization Window — render structured data directly from cache
    if (summaryWindow) {
      const entities = Array.isArray(article.key_entities) ? article.key_entities : [];
      const entitiesHtml = entities.length > 0
        ? `<div class="news-entities">${entities.map(e => `<span class="entity-tag">${e}</span>`).join('')}</div>`
        : '';

      summaryWindow.innerHTML = `
        <div class="news-summary-content">
          <h3 class="news-headline">${article.headline}</h3>
          <p class="news-detailed">${article.detailed_summary || article.one_line || ''}</p>
          ${article.why_it_matters ? `<p class="news-why"><strong>Why it matters:</strong> ${article.why_it_matters}</p>` : ''}
          ${entitiesHtml}
          <div class="news-meta">
            <span>${article.source || ''}</span>
            <span>${article.published_at ? new Date(article.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
            <span class="news-category-badge">${article.category || 'general'}</span>
          </div>
        </div>`;
    }
  }

  function renderEmpty() {
    if (visualWindow) {
      visualWindow.innerHTML = '<div class="visual-placeholder">NO NEWS AVAILABLE</div>';
    }
    if (summaryWindow) {
      summaryWindow.innerHTML = '<div class="summary-placeholder">The news pipeline has not ingested any articles yet. Try again shortly.</div>';
    }
  }

  // --- Navigation (cycle through articles) ---
  function nextArticle() {
    if (currentArticles.length === 0) return;
    currentIndex = (currentIndex + 1) % currentArticles.length;
    renderArticle(currentIndex);
  }

  function prevArticle() {
    if (currentArticles.length === 0) return;
    currentIndex = (currentIndex - 1 + currentArticles.length) % currentArticles.length;
    renderArticle(currentIndex);
  }

  // Keyboard navigation when panel is open
  document.addEventListener('keydown', (e) => {
    if (newsPopup && !newsPopup.classList.contains('hidden')) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextArticle();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        prevArticle();
      } else if (e.key === 'Escape') {
        window.hideNewsPanel();
      }
    }
  });

  // --- Show/Hide ---
  window.showNewsPanel = function(topic) {
    if (newsPopup) {
      newsPopup.classList.remove('hidden');
      document.body.classList.add('news-mode-active');
      loadNewsData(topic || 'general');
    }
  };

  window.hideNewsPanel = function() {
    if (newsPopup) {
      newsPopup.classList.add('hidden');
      document.body.classList.remove('news-mode-active');
    }
  };

  if (newsCloseBtn) {
    newsCloseBtn.addEventListener('click', () => {
      window.hideNewsPanel();
    });
  }

  // --- IST Clock Logic ---
  function updateTime() {
    if (!timeWidget) return;
    
    const now = new Date();
    const istTimeString = now.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    timeWidget.textContent = `${istTimeString} IST`;
  }

  updateTime();
  setInterval(updateTime, 1000);

  // Expose for testing/debugging via console
  window.newsAPI = {
    show: window.showNewsPanel,
    hide: window.hideNewsPanel,
    next: nextArticle,
    prev: prevArticle,
    load: loadNewsData
  };

})();
