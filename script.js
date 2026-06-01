/* ═══════════════════════════════════════════
   DARK MODE — runs FIRST to prevent flash
═══════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem('signal-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('signal-theme', next);
}

// Apply theme IMMEDIATELY
initTheme();

/* ═══════════════════════════════════════════
   STATE & CONFIG
═══════════════════════════════════════════ */
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
  AI:  ["artificial intelligence", "machine learning", "deep learning", "neural", "llm", "gpt", "gemini", "claude", "openai", "chatgpt", "generative ai", "transformer", "ai ", " ai,"],
  AR:  ["augmented reality", "ar glasses", "mixed reality", "spatial computing", "apple vision", "xr", "smart glasses", "hololens", "magic leap"],
  VR:  ["virtual reality", "vr headset", "meta quest", "oculus", "psvr", "immersive", "metaverse", " vr ", "vr "],
  Tech: ["robotics", "quantum computing", "autonomous", "self-driving", "biotech", "nanotech", "iot", "innovation", "breakthrough", "chip", "processor", "semiconductor"]
};
const ALL_KEYWORDS = Object.values(KEYWORDS).flat();

const CAT_EMOJI = { AI:'🤖', AR:'👓', VR:'🥽', Tech:'⚡' };

/* ═══════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════ */
function generateFallbackImage(title) {
  let hash = 0;
  const str = title || 'fallback';
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `https://picsum.photos/seed/${Math.abs(hash).toString(36)}/640/360`;
}

function relativeTime(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d) / 1000);
  if (isNaN(s)) return 'live';
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

function escHtml(s='') {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function detectCategory(title, desc) {
  const h = `${title} ${desc}`.toLowerCase();
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (cat === "Tech") continue;
    if (kws.some(kw => h.includes(kw))) return cat;
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

/* ═══════════════════════════════════════════
   MOCK DATA FALLBACK
   Ensures the UI renders even if all APIs fail
═══════════════════════════════════════════ */
function getMockArticles() {
  const now = Date.now();
  return [
    { title: "OpenAI Announces GPT-5 with Real-Time Reasoning", desc: "The next generation of large language models promises to bridge the gap between artificial intelligence and human cognition, achieving near-perfect scores on graduate-level benchmarks.", source: "TechCrunch", category: "AI", date: new Date(now - 3600000).toISOString(), link: "#" },
    { title: "Apple Vision Pro 2 Leaks Reveal Lighter Design", desc: "Apple's second iteration of its spatial computing headset aims to address the weight and comfort issues of the original, featuring a custom M4 chip.", source: "The Verge", category: "AR", date: new Date(now - 7200000).toISOString(), link: "#" },
    { title: "Meta Quest 4 Sets New Standard for VR Affordability", desc: "Meta's latest headset brings high-end mixed reality features down to a consumer-friendly price point, threatening competitors in the process.", source: "Wired", category: "VR", date: new Date(now - 10800000).toISOString(), link: "#" },
    { title: "Quantum Computing Breakthrough: 1000 Qubit Processor", desc: "IBM unveils its latest quantum processor, crossing the critical threshold needed for practical quantum advantage in cryptography and material science.", source: "Ars Technica", category: "Tech", date: new Date(now - 14400000).toISOString(), link: "#" },
    { title: "Google DeepMind Achieves AGI Benchmark in Closed Test", desc: "Internal sources report that DeepMind's newest model has passed a comprehensive general intelligence test, sparking debate on evaluation metrics.", source: "Engadget", category: "AI", date: new Date(now - 18000000).toISOString(), link: "#" },
    { title: "Magic Leap 3 Enters Enterprise AR Market", desc: "Magic Leap pivots entirely to B2B, offering augmented reality solutions specifically tailored for medical and engineering sectors.", source: "CNET", category: "AR", date: new Date(now - 21600000).toISOString(), link: "#" },
    { title: "PlayStation VR2 PC Adapter Announced", desc: "Sony finally allows its VR headset to connect to gaming PCs, unlocking a massive library of SteamVR titles for console players.", source: "TechRadar", category: "VR", date: new Date(now - 25200000).toISOString(), link: "#" },
    { title: "Neuralink Begins Human Trials for Telepathic Interface", desc: "The first human patients are able to control computer cursors using only their thoughts via the N1 implant, marking a milestone in biotech.", source: "Gizmodo", category: "Tech", date: new Date(now - 28800000).toISOString(), link: "#" },
  ].map((m, i) => ({
    id: `mock-${i}`,
    image: generateFallbackImage(m.title),
    ...m
  }));
}

/* ═══════════════════════════════════════════
   DUAL-SOURCE RSS FETCHER
═══════════════════════════════════════════ */
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
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML parse error');

  const items = [];
  doc.querySelectorAll('item').forEach(entry => {
    const get = (tag) => { const el = entry.querySelector(tag); return el ? el.textContent.trim() : ''; };
    const getNS = (ns, tag) => { const el = entry.getElementsByTagNameNS(ns, tag)[0]; return el ? el.textContent.trim() : ''; };

    let image = '';
    const mThumb = entry.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'thumbnail')[0];
    if (mThumb && mThumb.getAttribute('url')) image = mThumb.getAttribute('url');
    if (!image) {
      const mCont = entry.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content')[0];
      if (mCont && mCont.getAttribute('url')) image = mCont.getAttribute('url');
    }
    if (!image) {
      const enc = entry.querySelector('enclosure');
      if (enc && enc.getAttribute('type') && enc.getAttribute('type').startsWith('image/')) image = enc.getAttribute('url');
    }
    if (!image) {
      const ce = get('content\\:encoded') || getNS('http://purl.org/rss/1.0/modules/content/', 'encoded') || '';
      const dt = get('description') + ' ' + ce;
      const m = dt.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) image = m[1];
    }

    items.push({
      title: get('title'), link: get('link'), pubDate: get('pubDate'),
      description: get('description'), thumbnail: image, content: '',
      enclosure: image ? { link: image, type: 'image/jpeg' } : null
    });
  });

  if (!items.length) throw new Error('No items parsed');
  return items;
}

function extractImageFromItem(item, title) {
  let image = '';
  if (item.thumbnail) image = item.thumbnail;
  if (!image && item.enclosure && item.enclosure.link) {
    if (!item.enclosure.type || item.enclosure.type.startsWith('image/')) image = item.enclosure.link;
  }
  if (!image && item.content) {
    const m = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) image = m[1];
  }
  if (!image && item.description) {
    const m = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) image = m[1];
  }
  if (!image) image = generateFallbackImage(title);
  if (image.startsWith('//')) image = 'https:' + image;
  if (image.startsWith('http://')) image = image.replace('http://', 'https://');
  return image;
}

/* ═══════════════════════════════════════════
   MAIN LOAD FUNCTION
═══════════════════════════════════════════ */
async function loadNews() {
  if (isRefreshing) return;
  isRefreshing = true;

  const ct = document.getElementById('appContent');
  if (ct && !allArticles.length) ct.innerHTML = '<div class="spinner"></div>';

  showSyncStatus('Syncing feeds…', false);

  const newArticles = [];
  const now = new Date();
  const freshnessLimit = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  let successCount = 0, failCount = 0;

  for (const channel of CHANNELS) {
    let items = null;

    try { items = await fetchRssViaJson2(channel.url); successCount++; }
    catch (e) { console.warn(`[Method 1 failed] ${channel.label}:`, e.message); }

    if (!items) {
      try { items = await fetchRssViaCorsProxy(channel.url); successCount++; }
      catch (e) { console.warn(`[Method 2 failed] ${channel.label}:`, e.message); failCount++; }
    }

    if (!items) continue;
    await new Promise(r => setTimeout(r, 300));

    for (const item of items) {
      const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
      const link  = (item.link || '').trim();
      const desc  = (item.description || '').replace(/<[^>]+>/g, '').trim();

      if (!title || !link) continue;

      const textTarget = `${title} ${desc}`.toLowerCase();
      if (!ALL_KEYWORDS.some(kw => textTarget.includes(kw))) continue;

      const itemDate = item.pubDate ? new Date(item.pubDate) : new Date();
      if (isNaN(itemDate.getTime()) || itemDate < freshnessLimit) continue;

      newArticles.push({
        id: Math.random().toString(36).substring(2, 11),
        title,
        desc: desc.length > 185 ? desc.slice(0, 185) + '…' : desc,
        link,
        image: extractImageFromItem(item, title),
        source: channel.label,
        category: detectCategory(title, desc) || channel.category,
        date: itemDate.toISOString()
      });
    }
  }

  console.log(`[SIGNAL] Sync: ${successCount} OK, ${failCount} failed, ${newArticles.length} articles`);

  // ─── CRITICAL FIX: Handle total API failure ───
  if (newArticles.length > 0) {
    allArticles = newArticles;
    const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    showSyncStatus(`✓ ${allArticles.length} stories — updated ${timeStr}`, false);
  } else if (allArticles.length === 0) {
    // APIs completely failed — load mock data so UI isn't blank
    allArticles = getMockArticles();
    showSyncStatus('⚠ Live feeds unavailable — showing demo data', true);
  } else {
    // APIs failed but we still have old data from previous load
    const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    showSyncStatus(`⚠ Feed sync failed — last checked ${timeStr}`, true);
  }

  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  const seen = new Set();
  allArticles = allArticles.filter(a => {
    const k = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 42);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  buildTicker();
  buildStats();
  renderGrid();
  isRefreshing = false;
}

/* ═══════════════════════════════════════════
   RENDERING
═══════════════════════════════════════════ */
function buildTicker() {
  const titles = allArticles.slice(0, 20).map(a =>
    `<span class="ticker-item">${CAT_EMOJI[a.category]||''} ${escHtml(a.title)}</span>`
  ).join('');
  const t = document.getElementById('tickerTrack');
  if (t) t.innerHTML = titles ? titles + titles : '<span class="ticker-item">Awaiting hot tech updates…</span>';
}

function buildStats() {
  const counts = { AI:0, AR:0, VR:0, Tech:0 };
  allArticles.forEach(a => { if (counts[a.category] !== undefined) counts[a.category]++; });
  const sb = document.getElementById('statsBar');
  if (sb) {
    sb.innerHTML = Object.entries(counts).map(([cat, n]) =>
      `<div class="stat-pill"><span class="stat-dot ${cat.toLowerCase()}"></span><span class="stat-count">${n}</span> ${cat}</div>`
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
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  return allArticles.filter(a => {
    const catOk = activeFilter === 'ALL' || a.category === activeFilter;
    const searchOk = !q || a.title.toLowerCase().includes(q) || (a.desc||'').toLowerCase().includes(q) || (a.source||'').toLowerCase().includes(q);
    return catOk && searchOk;
  });
}

function renderGrid() {
  filtered = getFiltered();
  const hero = filtered[0] || null;
  const rest = filtered.slice(1, visibleCount);
  const hasMore = filtered.length > visibleCount;
  let html = '';

  if (hero) {
    const fb = escHtml(generateFallbackImage(hero.title));
    html += `
      <div class="hero-section">
        <div onclick="window.open('${escHtml(hero.link)}','_blank')" class="hero-card" data-cat="${escHtml(hero.category)}">
          <img class="hero-img" src="${escHtml(hero.image)}" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fb}'">
          <div class="hero-overlay"></div>
          <div class="hero-content">
            <div class="hero-meta">
              <span class="card-cat-badge ${escHtml(hero.category)}">${escHtml(hero.category)}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.7)">${escHtml(hero.source)} · ${relativeTime(hero.date)}</span>
            </div>
            <h1 class="hero-title">${escHtml(hero.title)}</h1>
            <p class="hero-desc">${escHtml(hero.desc)}</p>
            <div class="hero-footer"><span class="read-btn">READ BREAKING ALERTS →</span></div>
          </div>
        </div>
      </div>`;
  }

  html += `<div class="grid-section">`;
  if (hero) html += `<div class="section-label">LATEST STORIES</div>`;
  html += `<div class="news-grid" id="newsGrid">`;

  if (!filtered.length) {
    html += `<div class="empty-state"><div>No breaking stories found matching filters</div></div>`;
  } else {
    rest.forEach((a, i) => {
      const delay = `animation-delay:${Math.min(i*40,400)}ms`;
      const fb = escHtml(generateFallbackImage(a.title));
      html += `
        <a href="${escHtml(a.link)}" target="_blank" rel="noopener" class="news-card" data-cat="${escHtml(a.category)}" style="${delay}">
          <div class="card-thumb">
            <img class="card-img" src="${escHtml(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fb}'">
            <span class="card-cat-badge ${escHtml(a.category)}">${escHtml(a.category)}</span>
          </div>
          <div class="card-body">
            <div class="card-source-row">
              <span class="card-source">${escHtml(a.source)}</span>
              <span class="card-date">${relativeTime(a.date)}</span>
            </div>
            <h2 class="card-title">${escHtml(a.title)}</h2>
            <p class="card-desc">${escHtml(a.desc)}</p>
            <span class="card-link">${escHtml(safeHostname(a.link))}</span>
          </div>
        </a>`;
    });
  }

  html += `</div></div>`;
  html += `<div class="load-more-wrap">
    <button class="load-more-btn" id="loadMoreBtn" onclick="loadMore()" ${!hasMore ? 'disabled' : ''}>
      ${hasMore ? `LOAD MORE (${filtered.length - visibleCount} remaining)` : 'ALL CAUGHT UP'}
    </button>
  </div>`;

  const el = document.getElementById('appContent');
  if (el) el.innerHTML = html;
}

function loadMore() {
  visibleCount += PAGE_SIZE;
  renderGrid();
}

/* ═══════════════════════════════════════════
   BOOTSTRAP
═══════════════════════════════════════════ */
loadNews();
setInterval(() => { loadNews(); }, 30 * 60 * 1000);
