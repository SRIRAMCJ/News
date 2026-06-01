/* ─────────────────────────────────────────
   STATE & ARRAYS MAPPING DEFINITIONS
───────────────────────────────────────── */
let allArticles  = [];
let filtered     = [];
let activeFilter = 'ALL';
let visibleCount = 12;
const PAGE_SIZE  = 12;
let isRefreshing = false;

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
  AI: ["artificial intelligence", "machine learning", "deep learning", "neural", "llm", "gpt", "gemini", "claude", "openai", "chatgpt", "generative ai", "transformer", "ai ", " ai,"],
  AR: ["augmented reality", "ar glasses", "mixed reality", "spatial computing", "apple vision", "xr", "smart glasses", "hololens", "magic leap"],
  VR: ["virtual reality", "vr headset", "meta quest", "oculus", "psvr", "immersive", "metaverse", " vr ", "vr "],
  Tech: ["robotics", "quantum computing", "autonomous", "self-driving", "biotech", "nanotech", "iot", "innovation", "breakthrough", "chip", "processor", "semiconductor"]
};
const ALL_KEYWORDS = Object.values(KEYWORDS).flat();

const CAT_EMOJI = { AI:'🤖', AR:'👓', VR:'🥽', Tech:'⚡' };
const CAT_FBG   = { AI:'#1e1d30', AR:'#0d2420', VR:'#2a1020', Tech:'#241d00' };

/* ─────────────────────────────────────────
   GUARANTEED COVER IMAGE — DETERMINISTIC
   Uses a hash of the title as the seed so
   the same article always renders the
   same photo. 100% coverage guaranteed.
───────────────────────────────────────── */
function generateFallbackImage(title) {
  let hash = 0;
  const str = title || 'fallback';
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash).toString(36);
  return `https://picsum.photos/seed/${seed}/640/360`;
}

/* ─────────────────────────────────────────
   UTILITY HELPERS
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

function safeHostname(link) {
  try { return new URL(link).hostname.replace('www.',''); }
  catch(e) { return link; }
}

function showSyncStatus(msg, isError) {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--accent)' : 'var(--muted)';
}

/* ─────────────────────────────────────────
   DUAL-SOURCE RSS FETCHER
   Method 1: rss2json.com API
   Method 2: Direct XML via corsproxy.io
   Each channel is tried with both methods.
───────────────────────────────────────── */
async function fetchRssViaJson2(feedUrl) {
  const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items || !data.items.length) throw new Error('No items');
  return data.items;
}

async function fetchRssViaCorsProxy(feedUrl) {
  const corsUrl = `https://corsproxy.io/?${encodeURIComponent(feedUrl)}`;
  const res = await fetch(corsUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xmlText = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const errorNode = doc.querySelector('parsererror');
  if (errorNode) throw new Error('XML parse error');

  const items = [];
  const entries = doc.querySelectorAll('item');
  entries.forEach(entry => {
    const get = (tag) => {
      const el = entry.querySelector(tag);
      return el ? el.textContent.trim() : '';
    };
    const getNS = (ns, tag) => {
      const el = entry.getElementsByTagNameNS(ns, tag)[0];
      return el ? el.textContent.trim() : '';
    };

    let image = '';
    // media:thumbnail / media:content
    const mThumbnail = entry.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'thumbnail')[0];
    if (mThumbnail && mThumbnail.getAttribute('url')) image = mThumbnail.getAttribute('url');
    if (!image) {
      const mContent = entry.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content')[0];
      if (mContent && mContent.getAttribute('url')) image = mContent.getAttribute('url');
    }
    // enclosures
    if (!image) {
      const enclosure = entry.querySelector('enclosure');
      if (enclosure && enclosure.getAttribute('type') && enclosure.getAttribute('type').startsWith('image/')) {
        image = enclosure.getAttribute('url');
      }
    }
    // img inside content:encoded or description
    if (!image) {
      const contentEncoded = get('content\\:encoded') || getNS('http://purl.org/rss/1.0/modules/content/', 'encoded') || '';
      const descText = get('description') + ' ' + contentEncoded;
      const imgMatch = descText.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) image = imgMatch[1];
    }

    items.push({
      title: get('title'),
      link: get('link'),
      pubDate: get('pubDate'),
      description: get('description'),
      thumbnail: image,
      content: '',
      enclosure: image ? { link: image, type: 'image/jpeg' } : null
    });
  });

  if (!items.length) throw new Error('No items parsed');
  return items;
}

/* ─────────────────────────────────────────
   IMAGE EXTRACTION FROM A SINGLE ITEM
───────────────────────────────────────── */
function extractImageFromItem(item, title) {
  let image = '';

  // 1. thumbnail
  if (item.thumbnail) image = item.thumbnail;
  // 2. enclosure
  if (!image && item.enclosure && item.enclosure.link) {
    if (!item.enclosure.type || item.enclosure.type.startsWith('image/')) {
      image = item.enclosure.link;
    }
  }
  // 3. <img> inside content
  if (!image && item.content) {
    const match = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match) image = match[1];
  }
  // 4. <img> inside description
  if (!image && item.description) {
    const match = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match) image = match[1];
  }
  // 5. GUARANTEED fallback — deterministic picsum
  if (!image) {
    image = generateFallbackImage(title);
  }

  // Normalize
  if (image.startsWith('//')) image = 'https:' + image;
  if (image.startsWith('http://')) image = image.replace('http://', 'https://');

  return image;
}

/* ─────────────────────────────────────────
   MAIN LOAD FUNCTION
   Staggered fetching to avoid rate limits.
   Dual-source per channel for resilience.
───────────────────────────────────────── */
async function loadNews() {
  if (isRefreshing) return;
  isRefreshing = true;

  const contentTarget = document.getElementById('appContent');
  if (contentTarget && !allArticles.length) {
    contentTarget.innerHTML = '<div class="spinner"></div>';
  }

  showSyncStatus('Syncing feeds…', false);

  const newArticles = [];
  const now = new Date();
  // 48-hour window for broader coverage
  const freshnessLimit = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  let successCount = 0;
  let failCount = 0;

  for (const channel of CHANNELS) {
    let items = null;

    // Method 1: rss2json
    try {
      items = await fetchRssViaJson2(channel.url);
      successCount++;
    } catch (e) {
      console.warn(`[Method 1 failed] ${channel.label}:`, e.message);
    }

    // Method 2: CORS proxy + XML parse
    if (!items) {
      try {
        items = await fetchRssViaCorsProxy(channel.url);
        successCount++;
      } catch (e) {
        console.warn(`[Method 2 failed] ${channel.label}:`, e.message);
        failCount++;
      }
    }

    if (!items) continue;

    // Small delay between channels to respect rate limits
    await new Promise(r => setTimeout(r, 300));

    for (const item of items) {
      const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
      const link  = (item.link || '').trim();
      const desc  = (item.description || '').replace(/<[^>]+>/g, '').trim();

      if (!title || !link) continue;

      // Keyword relevance check
      const textTarget = `${title} ${desc}`.toLowerCase();
      const isRelevant = ALL_KEYWORDS.some(kw => textTarget.includes(kw));
      if (!isRelevant) continue;

      // Freshness check
      const itemDate = item.pubDate ? new Date(item.pubDate) : new Date();
      if (isNaN(itemDate.getTime())) continue;
      if (itemDate < freshnessLimit) continue;

      const image = extractImageFromItem(item, title);

      newArticles.push({
        id: Math.random().toString(36).substring(2, 11),
        title,
        desc: desc.length > 185 ? desc.slice(0, 185) + '…' : desc,
        link,
        image,
        source: channel.label,
        category: detectCategory(title, desc) || channel.category,
        date: itemDate.toISOString()
      });
    }
  }

  // If we got zero articles, skip replacing (keep old data)
  if (newArticles.length > 0) {
    allArticles = newArticles;
  }

  // Sort newest first
  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Deduplicate by title similarity
  const seenTitles = new Set();
  allArticles = allArticles.filter(art => {
    const key = art.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 42);
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });

  console.log(`[SIGNAL] Sync done: ${successCount} feeds OK, ${failCount} failed, ${allArticles.length} articles total`);

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (allArticles.length > 0) {
    showSyncStatus(`✓ ${allArticles.length} stories — updated ${timeStr}`, false);
  } else {
    showSyncStatus(`⚠ No stories found — last checked ${timeStr}`, true);
  }

  buildTicker();
  buildStats();
  renderGrid();
  isRefreshing = false;
}

/* ─────────────────────────────────────────
   COMPONENTS RENDERING METHODS
───────────────────────────────────────── */
function buildTicker() {
  const titles = allArticles.slice(0, 20).map(a =>
    `<span class="ticker-item">${CAT_EMOJI[a.category]||''} ${escHtml(a.title)}</span>`
  ).join('');
  const t = document.getElementById('tickerTrack');
  if (t) t.innerHTML = titles ? titles + titles : '<span class="ticker-item">Awaiting hot tech updates…</span>';
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
  const hero    = filtered[0] || null;
  const rest    = filtered.slice(1, visibleCount);
  const hasMore = filtered.length > visibleCount;

  let html = '';

  /* ── Hero Card ── */
  if (hero) {
    const fb = escHtml(generateFallbackImage(hero.title));
    html += `
      <div class="hero-section">
        <div onclick="window.open('${escHtml(hero.link)}','_blank')" class="hero-card" data-cat="${escHtml(hero.category)}">
          <img class="hero-img" src="${escHtml(hero.image)}" alt="" referrerpolicy="no-referrer"
               onerror="this.onerror=null;this.src='${fb}'">
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
              <span class="read-btn">READ BREAKING ALERTS →</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ── Grid Section ── */
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
      const fb = escHtml(generateFallbackImage(a.title));
      const hostname = safeHostname(a.link);

      html += `
        <a href="${escHtml(a.link)}" target="_blank" rel="noopener" class="news-card" data-cat="${escHtml(a.category)}" style="${delay}">
          <div class="card-thumb">
            <img class="card-img" src="${escHtml(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"
                 onerror="this.onerror=null;this.src='${fb}'">
            <span class="card-cat-badge ${escHtml(a.category)}">${escHtml(a.category)}</span>
          </div>
          <div class="card-body">
            <div class="card-source-row">
              <span class="card-source">${escHtml(a.source)}</span>
              <span class="card-date">${relativeTime(a.date)}</span>
            </div>
            <h2 class="card-title">${escHtml(a.title)}</h2>
            <p class="card-desc">${escHtml(a.desc)}</p>
            <span class="card-link">${escHtml(hostname)}</span>
          </div>
        </a>`;
    });
  }

  html += `</div></div>`;

  /* ── Load More ── */
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
   BOOTSTRAP + 30-MIN AUTO-REFRESH
───────────────────────────────────────── */
loadNews();
setInterval(() => {
  console.log('[SIGNAL] 30-min auto-refresh triggered');
  loadNews();
}, 30 * 60 * 1000);
