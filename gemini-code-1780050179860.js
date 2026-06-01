/* ─────────────────────────────────────────
   STATE & ARRAYS MAPPING DEFINITIONS
───────────────────────────────────────── */
let allArticles  = [];
let filtered     = [];
let activeFilter = 'ALL';
let visibleCount = 12;
const PAGE_SIZE  = 12;

const CHANNELS = [
  { url: "https://techcrunch.com/feed/", category: "Tech", label: "TechCrunch" },
  { url: "https://www.theverge.com/rss/index.xml", category: "Tech", label: "The Verge" },
  { url: "https://www.wired.com/feed/rss", category: "Tech", label: "Wired" },
  { url: "https://feeds.arstechnica.com/arstechnica/technology-lab", category: "Tech", label: "Ars Technica" },
  { url: "https://www.cnet.com/rss/news/", category: "Tech", label: "CNET" },
  { url: "https://www.engadget.com/rss.xml", category: "Tech", label: "Engadget" },
  { url: "https://www.techradar.com/rss", category: "Tech", label: "TechRadar" },
  { url: "https://gizmodo.com/rss", category: "Tech", label: "Gizmodo" },
  { url: "https://www.zdnet.com/news/rss.xml", category: "Tech", label: "ZDNET" },
  { url: "https://www.digitaltrends.com/feed/", category: "Tech", label: "Digital Trends" }
];

const KEYWORDS = {
  AI: ["artificial intelligence", "machine learning", "deep learning", "neural", "llm", "gpt", "gemini", "claude", "openai", "chatgpt", "generative ai", "transformer"],
  AR: ["augmented reality", "ar glasses", "mixed reality", "spatial computing", "apple vision", "xr", "smart glasses"],
  VR: ["virtual reality", "vr headset", "meta quest", "oculus", "psvr", "immersive", "metaverse"],
  Tech: ["robotics", "quantum computing", "autonomous", "self-driving", "biotech", "nanotech", "iot", "innovation"]
};
const ALL_KEYWORDS = Object.values(KEYWORDS).flat();

const CAT_EMOJI = { AI:'🤖', AR:'👓', VR:'🥽', Tech:'⚡' };
const CAT_FBG   = { AI:'#1e1d30', AR:'#0d2420', VR:'#2a1020', Tech:'#241d00' };

/* ─────────────────────────────────────────
   CHRONOLOGICAL RELATIVE TIME PARSERS
───────────────────────────────────────── */
function relativeTime(iso) {
  const parsedDate = new Date(iso);
  const secs = Math.floor((Date.now() - parsedDate) / 1000);
  if (isNaN(secs)) return 'live';
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escHtml(s='') {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function detectCategory(title, desc) {
  const haystack = `${title} ${desc}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(KEYWORDS)) {
    if (cat === "Tech") continue;
    if (keywords.some(kw => haystack.includes(kw))) return cat;
  }
  return "Tech";
}

/* ─────────────────────────────────────────
   AUTOMATED IMAGE ADDRESS EXTRACTOR
───────────────────────────────────────── */
async function fetchBackupImageViaProxy(targetUrl) {
  try {
    // Fetches the raw HTML via a CORS proxy to extract hidden cover imagery
    const corsProxy = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(corsProxy);
    if (!res.ok) return "";
    
    const json = await res.json();
    const htmlString = json.contents;
    
    // Scans metadata configurations for original high-res cover image addresses
    const titlePatterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
    ];

    for (let pattern of titlePatterns) {
      const match = htmlString.match(pattern);
      if (match && match[1]) {
        let imgUrl = match[1];
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        if (imgUrl.startsWith('http://')) imgUrl = imgUrl.replace('http://', 'https://');
        return imgUrl;
      }
    }

    // Direct image HTML layout query fallback
    const structuralMatch = htmlString.match(/<article[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=["']([^"']+)["']/i) ||
                            htmlString.match(/<img[^>]+class=["'][^"']*featured[^"']*["'][^>]+(?:data-src|src)=["']([^"']+)["']/i);
                               
    if (structuralMatch && structuralMatch[1]) {
      let imgUrl = structuralMatch[1];
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      return imgUrl;
    }

    return "";
  } catch (e) {
    console.warn("Direct scraping fallback caught exception:", e);
    return "";
  }
}

/* ─────────────────────────────────────────
   CLIENT SIDE SCRAPER MODULE WITH REFRESH LOGIC
───────────────────────────────────────── */
async function loadNews() {
  const contentTarget = document.getElementById('appContent');
  if (contentTarget && allArticles.length === 0) contentTarget.innerHTML = '<div class="spinner"></div>';
  allArticles = [];
  
  const now = new Date();
  const freshnessLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const fetchPromises = CHANNELS.map(async (channel) => {
    try {
      const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(channel.url)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) return;
      
      const data = await response.json();
      if (!data.items) return;

      // Processing items loops cleanly via for...of to allow background image resolution processing
      for (const item of data.items) {
        const title = (item.title || "").replace(/<[^>]+>/g, "").trim();
        const link = (item.link || "").trim();
        const desc = (item.description || "").replace(/<[^>]+>/g, "").trim();
        
        if (!title || !link) continue;

        const textTarget = `${title} ${desc}`.toLowerCase();
        const isRelevant = ALL_KEYWORDS.some(kw => textTarget.includes(kw));
        if (!isRelevant) continue;

        const itemDate = item.pubDate ? new Date(item.pubDate.replace(/-/g, '/')) : new Date();
        if (itemDate < freshnessLimit) continue;

        // Extract native images if provided
        let image = "";
        if (item.thumbnail) {
          image = item.thumbnail;
        } 
        else if (item.enclosure && item.enclosure.link && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
          image = item.enclosure.link;
        }
        else if (item.content) {
          const match = item.content.match(/<img[^>]+src=["']([^"']+)["']/);
          if (match) image = match[1];
        }
        else if (item.description) {
          const match = item.description.match(/<img[^>]+src=["']([^"']+)["']/);
          if (match) image = match[1];
        }

        // Automatic Copy-Paste: Fallback directly to source HTML page imagery if empty
        if (!image && link) {
          image = await fetchBackupImageViaProxy(link);
        }

        allArticles.push({
          id: Math.random().toString(36).substring(2, 11),
          title: title,
          desc: desc.length > 185 ? desc.slice(0, 185) + "..." : desc,
          link: link,
          image: image,
          source: channel.label,
          category: detectCategory(title, desc) || channel.category,
          date: itemDate.toISOString()
        });
      }
    } catch (err) {
      console.warn(`Could not sync channel ${channel.label}:`, err);
    }
  });

  await Promise.all(fetchPromises);

  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  const seenTitles = new Set();
  allArticles = allArticles.filter(art => {
    const cleanTitle = art.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 42);
    if (seenTitles.has(cleanTitle)) return false;
    seenTitles.add(cleanTitle);
    return true;
  });

  const updateLabel = document.getElementById('lastUpdated');
  if (updateLabel) {
    updateLabel.textContent = 'Sync Complete — ' + now.toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit' 
    });
  }

  buildTicker();
  buildStats();
  renderGrid();
}

/* ─────────────────────────────────────────
   COMPONENTS RENDERING METHODS
───────────────────────────────────────── */
function buildTicker() {
  const titles = allArticles.slice(0, 20).map(a =>
    `<span class="ticker-item">${CAT_EMOJI[a.category]||''} ${escHtml(a.title)}</span>`
  ).join('');
  const t = document.getElementById('tickerTrack');
  if (t) t.innerHTML = titles ? titles + titles : '<span class="ticker-item">No stories found within 24h envelope</span>';
}

function buildStats() {
  const counts = { AI: 0, AR: 0, VR: 0, Tech: 0 };
  allArticles.forEach(a => { if (counts[a.category] !== undefined) counts[a.category]++; });
  const sb = document.getElementById('statsBar');
  if (sb) {
    sb.innerHTML = Object.entries(counts).map(([cat, n]) =>
      `<div class="stat-pill">
         <span class="stat-dot ${cat.toLowerCase()}"></span>
         <span class="stat-count">${n}</span> ${cat}
       </div>`
    ).join('');
  }
}

function setFilter(cat, el) {
  activeFilter = cat;
  visibleCount = PAGE_SIZE;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderGrid();
}

function getFiltered() {
  const searchInput = document.getElementById('searchInput');
  const q = (searchInput ? searchInput.value : '').toLowerCase();
  return allArticles.filter(a => {
    const catOk = activeFilter === 'ALL' || a.category === activeFilter;
    const searchOk = !q ||
      a.title.toLowerCase().includes(q) ||
      (a.desc||'').toLowerCase().includes(q) ||
      (a.source||'').toLowerCase().includes(q);
    return catOk && searchOk;
  });
}

function renderGrid() {
  filtered = getFiltered();
  const hero   = filtered[0] || null;
  const rest   = filtered.slice(1, visibleCount);
  const hasMore= filtered.length > visibleCount;

  let html = '';

  /* Primary Hero Card Injection */
  if (hero) {
    const imgSrc = hero.image
      ? `<img class="hero-img" src="${escHtml(hero.image)}" alt="" onerror="this.style.display='none'">`
      : '';
    html += `
      <div class="hero-section">
        <div onclick="window.open('${escHtml(hero.link)}', '_blank')" class="hero-card" data-cat="${escHtml(hero.category)}">
          ${imgSrc}
          <div class="hero-overlay"></div>
          <div class="hero-content">
            <div class="hero-meta">
              <span class="card-cat-badge ${escHtml(hero.category)}">${escHtml(hero.category)}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.7)">
                ${escHtml(hero.source)} · ${relativeTime(hero.date)}
              </span>
            </div>
            <h1 class="hero-title">${escHtml(hero.title)}</h1>
            <p class="hero-desc">${escHtml(hero.desc)}</p>
            <div class="hero-footer">
              <span class="read-btn">
                READ BREAKING ALERTS →
              </span>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* Grid Items Injection */
  html += `<div class="grid-section">`;
  if (hero) html += `<div class="section-label">LATEST STORIES</div>`;
  html += `<div class="news-grid" id="newsGrid">`;

  if (!filtered.length) {
    html += `
      <div class="empty-state">
        <div>No breaking stories found matching filters</div>
      </div>`;
  } else {
    rest.forEach((a, i) => {
      const delay = `animation-delay:${Math.min(i*40,400)}ms`;
      const img = a.image
        ? `<img class="card-img" src="${escHtml(a.image)}" alt="" loading="lazy"
               onerror="this.parentElement.innerHTML='<div class=\\'card-img-fallback\\' style=\\'background:${CAT_FBG[a.category]||'#111'}\\'>${CAT_EMOJI[a.category]||'📰'}</div>'">`
        : `<div class="card-img-fallback" style="background:${CAT_FBG[a.category]||'#111'}">${CAT_EMOJI[a.category]||'📰'}</div>`;

      html += `
        <a href="${escHtml(a.link)}" target="_blank" rel="noopener" class="news-card" data-cat="${escHtml(a.category)}" style="${delay}">
          <div class="card-thumb">
            ${img}
            <span class="card-cat-badge ${escHtml(a.category)}">${escHtml(a.category)}</span>
          </div>
          <div class="card-body">
            <div class="card-source-row">
              <span class="card-source">${escHtml(a.source)}</span>
              <span class="card-date">${relativeTime(a.date)}</span>
            </div>
            <h2 class="card-title">${escHtml(a.title)}</h2>
            <p class="card-desc">${escHtml(a.desc)}</p>
            <span class="card-link">${escHtml(new URL(a.link).hostname.replace('www.',''))}</span>
          </div>
        </a>`;
    });
  }

  html += `</div></div>`;

  /* Pagination Wrap Trigger */
  html += `
    <div class="load-more-wrap">
      <button class="load-more-btn" id="loadMoreBtn" onclick="loadMore()" ${!hasMore ? 'disabled' : ''}>
        ${hasMore ? `LOAD MORE (${filtered.length - visibleCount} remaining)` : 'ALL CAUGHT UP'}
      </button>
    </div>`;

  const viewContainer = document.getElementById('appContent');
  if (viewContainer) viewContainer.innerHTML = html;
}

function loadMore() {
  visibleCount += PAGE_SIZE;
  renderGrid();
}

/* ─────────────────────────────────────────
   BOOTSTRAP SYNC INITIALIZATION
───────────────────────────────────────── */
loadNews();
setInterval(loadNews, 30 * 60 * 1000);
