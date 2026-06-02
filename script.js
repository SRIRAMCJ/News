/* ═══════════════════════════════════════════
   DARK MODE
═══════════════════════════════════════════ */
function initTheme() {
  try {
    const saved = localStorage.getItem('signal-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch(e) {}
}

function toggleTheme() {
  try {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('signal-theme', next);
  } catch(e) {}
}

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
  try {
    const d = new Date(iso);
    const s = Math.floor((Date.now() - d) / 1000);
    if (isNaN(s)) return 'live';
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  } catch(e) { return ''; }
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function detectCategory(title, desc) {
  const h = (title + ' ' + desc).toLowerCase();
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (cat === "Tech") continue;
    if (kws.some(kw => h.includes(kw))) return cat;
  }
  return "Tech";
}

function safeHostname(link) {
  try { return new URL(link).hostname.replace('www.',''); }
  catch(e) { return String(link); }
}

function showSyncStatus(msg, isError) {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--accent)' : 'var(--muted)';
}

/* ═══════════════════════════════════════════
   BULLETPROOF FETCH WITH TIMEOUT
═══════════════════════════════════════════ */
function fetchWithTimeout(url, timeout) {
  timeout = timeout || 8000;
  return Promise.race([
    fetch(url),
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('Timeout')); }, timeout);
    })
  ]);
}

/* ═══════════════════════════════════════════
   MOCK DATA FALLBACK
═══════════════════════════════════════════ */
function getMockArticles() {
  var now = Date.now();
  var mockData = [
    { title: "OpenAI Announces GPT-5 with Real-Time Reasoning", desc: "The next generation of large language models promises to bridge the gap between artificial intelligence and human cognition.", source: "TechCrunch", category: "AI", date: new Date(now - 3600000).toISOString(), link: "#" },
    { title: "Apple Vision Pro 2 Leaks Reveal Lighter Design", desc: "Apple's second iteration of its spatial computing headset aims to address the weight and comfort issues of the original.", source: "The Verge", category: "AR", date: new Date(now - 7200000).toISOString(), link: "#" },
    { title: "Meta Quest 4 Sets New Standard for VR Affordability", desc: "Meta's latest headset brings high-end mixed reality features down to a consumer-friendly price point.", source: "Wired", category: "VR", date: new Date(now - 10800000).toISOString(), link: "#" },
    { title: "Quantum Computing Breakthrough: 1000 Qubit Processor", desc: "IBM unveils its latest quantum processor, crossing the critical threshold needed for practical quantum advantage.", source: "Ars Technica", category: "Tech", date: new Date(now - 14400000).toISOString(), link: "#" },
    { title: "Google DeepMind Achieves AGI Benchmark in Closed Test", desc: "Internal sources report that DeepMind's newest model has passed a comprehensive general intelligence test.", source: "Engadget", category: "AI", date: new Date(now - 18000000).toISOString(), link: "#" },
    { title: "Magic Leap 3 Enters Enterprise AR Market", desc: "Magic Leap pivots entirely to B2B, offering augmented reality solutions for medical and engineering sectors.", source: "CNET", category: "AR", date: new Date(now - 21600000).toISOString(), link: "#" },
    { title: "PlayStation VR2 PC Adapter Announced", desc: "Sony finally allows its VR headset to connect to gaming PCs, unlocking a massive library of SteamVR titles.", source: "TechRadar", category: "VR", date: new Date(now - 25200000).toISOString(), link: "#" },
    { title: "Neuralink Begins Human Trials for Telepathic Interface", desc: "The first human patients are able to control computer cursors using only their thoughts via the N1 implant.", source: "Gizmodo", category: "Tech", date: new Date(now - 28800000).toISOString(), link: "#" }
  ];
  var result = [];
  for (var i = 0; i < mockData.length; i++) {
    result.push({
      id: 'mock-' + i,
      title: mockData[i].title,
      desc: mockData[i].desc,
      source: mockData[i].source,
      category: mockData[i].category,
      date: mockData[i].date,
      link: mockData[i].link,
      image: generateFallbackImage(mockData[i].title)
    });
  }
  return result;
}

/* ═══════════════════════════════════════════
   RSS FETCHER — Method 1: rss2json DIRECT
   (No double-proxy — this was causing the 404)
═══════════════════════════════════════════ */
async function fetchRssViaJson2(feedUrl) {
  var apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feedUrl);
  var res = await fetchWithTimeout(apiUrl, 8000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var data = await res.json();
  if (!data || data.status !== 'ok' || !data.items || !data.items.length) throw new Error('No items');
  return data.items;
}

/* ═══════════════════════════════════════════
   RSS FETCHER — Method 2: allorigins proxy
   Fetches raw XML and parses client-side
═══════════════════════════════════════════ */
async function fetchRssViaCorsProxy(feedUrl) {
  var proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(feedUrl);
  var res = await fetchWithTimeout(proxyUrl, 8000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var xmlText = await res.text();

  if (!xmlText || xmlText.length < 50) throw new Error('Empty response');

  var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML parse error');

  var items = [];
  var entries = doc.querySelectorAll('item');

  if (!entries || entries.length === 0) throw new Error('No items parsed');

  entries.forEach(function(entry) {
    function getTag(tag) {
      var el = entry.querySelector(tag);
      return el ? el.textContent.trim() : '';
    }
    function getNS(ns, tag) {
      var el = entry.getElementsByTagNameNS(ns, tag)[0];
      return el ? el.textContent.trim() : '';
    }

    var image = '';
    var mThumb = entry.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'thumbnail')[0];
    if (mThumb && mThumb.getAttribute('url')) image = mThumb.getAttribute('url');
    if (!image) {
      var mCont = entry.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content')[0];
      if (mCont && mCont.getAttribute('url')) image = mCont.getAttribute('url');
    }
    if (!image) {
      var enc = entry.querySelector('enclosure');
      if (enc && enc.getAttribute('url')) image = enc.getAttribute('url');
    }
    if (!image) {
      var ce = getTag('content\\:encoded') || getNS('http://purl.org/rss/1.0/modules/content/', 'encoded') || '';
      var dt = getTag('description') + ' ' + ce;
      var m = dt.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) image = m[1];
    }

    items.push({
      title: getTag('title'),
      link: getTag('link'),
      pubDate: getTag('pubDate'),
      description: getTag('description'),
      thumbnail: image,
      content: '',
      enclosure: image ? { link: image, type: 'image/jpeg' } : null
    });
  });

  return items;
}

/* ═══════════════════════════════════════════
   IMAGE EXTRACTOR
═══════════════════════════════════════════ */
function extractImageFromItem(item, title) {
  var image = '';
  if (item.thumbnail) image = item.thumbnail;
  if (!image && item.enclosure && item.enclosure.link) {
    if (!item.enclosure.type || item.enclosure.type.startsWith('image/')) image = item.enclosure.link;
  }
  if (!image && item.content) {
    var m = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) image = m[1];
  }
  if (!image && item.description) {
    var m2 = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m2) image = m2[1];
  }
  if (!image) image = generateFallbackImage(title);
  if (image.indexOf('//') === 0) image = 'https:' + image;
  if (image.indexOf('http://') === 0) image = image.replace('http://', 'https://');
  return image;
}

/* ═══════════════════════════════════════════
   MAIN LOAD FUNCTION
═══════════════════════════════════════════ */
async function loadNews() {
  if (isRefreshing) return;
  isRefreshing = true;

  var ct = document.getElementById('appContent');
  if (ct && allArticles.length === 0) {
    ct.innerHTML = '<div class="spinner"></div>';
  }

  showSyncStatus('Syncing feeds…', false);

  var newArticles = [];
  var now = new Date();
  var freshnessLimit = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  var successCount = 0;
  var failCount = 0;

  for (var c = 0; c < CHANNELS.length; c++) {
    var channel = CHANNELS[c];
    var items = null;

    // Method 1: rss2json DIRECT (fixed — no double proxy)
    try {
      items = await fetchRssViaJson2(channel.url);
      successCount++;
    } catch (e) {
      console.warn('[Method 1 failed] ' + channel.label + ': ' + e.message);
    }

    // Method 2: allorigins raw XML proxy
    if (!items) {
      try {
        items = await fetchRssViaCorsProxy(channel.url);
        successCount++;
      } catch (e) {
        console.warn('[Method 2 failed] ' + channel.label + ': ' + e.message);
        failCount++;
      }
    }

    if (!items || items.length === 0) continue;

    // Small delay to respect rate limits
    await new Promise(function(r) { setTimeout(r, 300); });

    for (var j = 0; j < items.length; j++) {
      try {
        var item = items[j];
        var title = (item.title || '').replace(/<[^>]+>/g, '').trim();
        var link  = (item.link || '').trim();
        var desc  = (item.description || '').replace(/<[^>]+>/g, '').trim();

        if (!title || !link) continue;

        var textTarget = (title + ' ' + desc).toLowerCase();
        var isRelevant = false;
        for (var k = 0; k < ALL_KEYWORDS.length; k++) {
          if (textTarget.indexOf(ALL_KEYWORDS[k]) !== -1) {
            isRelevant = true;
            break;
          }
        }
        if (!isRelevant) continue;

        var itemDate = item.pubDate ? new Date(item.pubDate) : new Date();
        if (isNaN(itemDate.getTime()) || itemDate < freshnessLimit) continue;

        var image = extractImageFromItem(item, title);

        newArticles.push({
          id: Math.random().toString(36).substring(2, 11),
          title: title,
          desc: desc.length > 185 ? desc.slice(0, 185) + '…' : desc,
          link: link,
          image: image,
          source: channel.label,
          category: detectCategory(title, desc) || channel.category,
          date: itemDate.toISOString()
        });
      } catch (itemErr) {
        console.warn('Error parsing item:', itemErr);
      }
    }
  }

  console.log('[SIGNAL] Sync: ' + successCount + ' OK, ' + failCount + ' failed, ' + newArticles.length + ' articles');

  // Handle results — ALWAYS render something
  if (newArticles.length > 0) {
    allArticles = newArticles;
    var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    showSyncStatus('✓ ' + allArticles.length + ' stories — updated ' + timeStr, false);
  } else if (allArticles.length === 0) {
    allArticles = getMockArticles();
    showSyncStatus('⚠ Live feeds unavailable — showing demo data', true);
  } else {
    var timeStr2 = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    showSyncStatus('⚠ Feed sync failed — last checked ' + timeStr2, true);
  }

  // Sort newest first
  allArticles.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

  // Deduplicate
  var seen = {};
  allArticles = allArticles.filter(function(a) {
    var k = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 42);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
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
  var titles = allArticles.slice(0, 20).map(function(a) {
    return '<span class="ticker-item">' + (CAT_EMOJI[a.category]||'') + ' ' + escHtml(a.title) + '</span>';
  }).join('');
  var t = document.getElementById('tickerTrack');
  if (t) t.innerHTML = titles ? titles + titles : '<span class="ticker-item">Awaiting hot tech updates…</span>';
}

function buildStats() {
  var counts = { AI: 0, AR: 0, VR: 0, Tech: 0 };
  allArticles.forEach(function(a) { if (counts[a.category] !== undefined) counts[a.category]++; });
  var sb = document.getElementById('statsBar');
  if (sb) {
    sb.innerHTML = Object.keys(counts).map(function(cat) {
      return '<div class="stat-pill"><span class="stat-dot ' + cat.toLowerCase() + '"></span><span class="stat-count">' + counts[cat] + '</span> ' + cat + '</div>';
    }).join('');
  }
}

function setFilter(cat, el) {
  activeFilter = cat;
  visibleCount = PAGE_SIZE;
  document.querySelectorAll('.filter-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  renderGrid();
}

function getFiltered() {
  var searchInput = document.getElementById('searchInput');
  var q = searchInput ? searchInput.value.toLowerCase() : '';
  return allArticles.filter(function(a) {
    var catOk = activeFilter === 'ALL' || a.category === activeFilter;
    var searchOk = !q || a.title.toLowerCase().indexOf(q) !== -1 || (a.desc||'').toLowerCase().indexOf(q) !== -1 || (a.source||'').toLowerCase().indexOf(q) !== -1;
    return catOk && searchOk;
  });
}

function renderGrid() {
  filtered = getFiltered();
  var hero = filtered[0] || null;
  var rest = filtered.slice(1, visibleCount);
  var hasMore = filtered.length > visibleCount;
  var html = '';

  if (hero) {
    var fb = escHtml(generateFallbackImage(hero.title));
    html += '<div class="hero-section">' +
      '<div onclick="window.open(\'' + escHtml(hero.link) + '\',\'_blank\')" class="hero-card" data-cat="' + escHtml(hero.category) + '">' +
      '<img class="hero-img" src="' + escHtml(hero.image) + '" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' + fb + '\'">' +
      '<div class="hero-overlay"></div>' +
      '<div class="hero-content">' +
      '<div class="hero-meta">' +
      '<span class="card-cat-badge ' + escHtml(hero.category) + '">' + escHtml(hero.category) + '</span>' +
      '<span style="font-size:12px;color:rgba(255,255,255,0.7)">' + escHtml(hero.source) + ' · ' + relativeTime(hero.date) + '</span>' +
      '</div>' +
      '<h1 class="hero-title">' + escHtml(hero.title) + '</h1>' +
      '<p class="hero-desc">' + escHtml(hero.desc) + '</p>' +
      '<div class="hero-footer"><span class="read-btn">READ BREAKING ALERTS →</span></div>' +
      '</div></div></div>';
  }

  html += '<div class="grid-section">';
  if (hero) html += '<div class="section-label">LATEST STORIES</div>';
  html += '<div class="news-grid" id="newsGrid">';

  if (!filtered.length) {
    html += '<div class="empty-state"><div>No breaking stories found matching filters</div></div>';
  } else {
    for (var i = 0; i < rest.length; i++) {
      var a = rest[i];
      var delay = 'animation-delay:' + Math.min(i*40,400) + 'ms';
      var fb2 = escHtml(generateFallbackImage(a.title));
      var hostname = safeHostname(a.link);

      html += '<a href="' + escHtml(a.link) + '" target="_blank" rel="noopener" class="news-card" data-cat="' + escHtml(a.category) + '" style="' + delay + '">' +
        '<div class="card-thumb">' +
        '<img class="card-img" src="' + escHtml(a.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' + fb2 + '\'">' +
        '<span class="card-cat-badge ' + escHtml(a.category) + '">' + escHtml(a.category) + '</span>' +
        '</div>' +
        '<div class="card-body">' +
        '<div class="card-source-row">' +
        '<span class="card-source">' + escHtml(a.source) + '</span>' +
        '<span class="card-date">' + relativeTime(a.date) + '</span>' +
        '</div>' +
        '<h2 class="card-title">' + escHtml(a.title) + '</h2>' +
        '<p class="card-desc">' + escHtml(a.desc) + '</p>' +
        '<span class="card-link">' + escHtml(hostname) + '</span>' +
        '</div></a>';
    }
  }

  html += '</div></div>';
  html += '<div class="load-more-wrap">' +
    '<button class="load-more-btn" id="loadMoreBtn" onclick="loadMore()" ' + (!hasMore ? 'disabled' : '') + '>' +
    (hasMore ? 'LOAD MORE (' + (filtered.length - visibleCount) + ' remaining)' : 'ALL CAUGHT UP') +
    '</button></div>';

  var el = document.getElementById('appContent');
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
setInterval(function() { loadNews(); }, 30 * 60 * 1000);
