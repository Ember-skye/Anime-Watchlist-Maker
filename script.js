// script.js
// ---------- Utilities ----------
const gqlEndpoint = 'https://graphql.anilist.co';

const $ = id => document.getElementById(id);
const sanitizeHtml = (dirty) => {
  if (!dirty) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(dirty, 'text/html');
  doc.querySelectorAll('script,iframe').forEach(n => n.remove());
  [...doc.querySelectorAll('*')].forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const val = attr.value || '';
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      if ((name === 'href' || name === 'src') && val.trim().toLowerCase().startsWith('javascript:')) el.removeAttribute(attr.name);
    });
  });
  const allowed = ['b','i','em','strong','p','br','ul','ol','li','a'];
  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
  while(walker.nextNode()){
    const node = walker.currentNode;
    if (!allowed.includes(node.tagName.toLowerCase())){
      const parent = node.parentNode;
      while(node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
    }
  }
  return doc.body.innerHTML;
};

// ---------- UI Elements ----------
const searchBtn = $('searchBtn');
const queryInput = $('query');
const coverImg = $('coverImg');
const titleChip = $('titleChip');
const subtitles = $('subtitles');
const scoreChip = $('scoreChip');
const episodesChip = $('episodesChip');
const durationChip = $('durationChip');
const seasonChip = $('seasonChip');
const genresTags = $('genresTags');
const desc = $('desc');
const openAniBtn = $('openAniBtn');
const statusLine = $('statusLine');
const externalLinks = $('externalLinks');
const trailer = $('trailer');
const continueWatchlist = $('continueWatchlist');

let currentMedia = null;

const setStatus = (t) => { statusLine.textContent = t; };

function getSavedEntry(mediaId) {
  return loadList().find(item => item.id === mediaId) || null;
}

function getPersonalFormValues() {
  return {
    status: $('personalStatus').value,
    watchedEpisodes: Number($('watchedEpisodes').value) || 0,
    score: Number($('personalScore').value) || null,
    notes: $('personalNotes').value || ''
  };
}

function setPersonalFormValues(personal = {}) {
  $('personalStatus').value = personal.status || 'WATCHING';
  $('watchedEpisodes').value = Number(personal.watchedEpisodes) || 0;
  $('personalScore').value = personal.score ?? 5;
  $('personalNotes').value = personal.notes || '';
}

function syncEntryAction(media) {
  const saved = media?.id ? getSavedEntry(media.id) : null;
  if (saved) {
    setPersonalFormValues(saved.personal);
    $('savePersonal').textContent = 'Update Entry';
    setStatus('Saved entry loaded');
  } else {
    setPersonalFormValues();
    $('savePersonal').textContent = 'Add to List';
    setStatus('New anime loaded');
  }
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === pageId));
  document.querySelectorAll('[data-page-link]').forEach(link => link.classList.toggle('active', link.dataset.pageLink === pageId));
}

document.querySelectorAll('[data-page-link]').forEach(link => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    showPage(link.dataset.pageLink);
    history.replaceState(null, '', link.getAttribute('href'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

if (location.hash === '#my-list') showPage('myListPage');

function formatSeason(media) {
  if (!media?.season && !media?.seasonYear) return 'AniList';
  const season = media.season ? media.season.toLowerCase().replace(/^\w/, c => c.toUpperCase()) : '';
  return `${season} ${media.seasonYear || ''}`.trim();
}

function formatWatchTime(totalMinutes) {
  if (!totalMinutes) return '0m';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function clearSpotlightSkeleton() {
  coverImg.classList.remove('skeleton-box');
  seasonChip.className = 'capsule blue';
  titleChip.className = 'capsule pink';
  subtitles.className = 'native-title';
  scoreChip.className = 'metric';
  episodesChip.className = 'metric';
  durationChip.className = 'metric';
  desc.className = 'description';
}

// Simple query for anime search
const queryAniList = async (search) => {
  const isIdLookup = /^\d+$/.test(String(search).trim());
  const mediaFields = `id title { romaji english native } synonyms description(asHtml: true) episodes duration status season seasonYear genres averageScore meanScore popularity siteUrl coverImage { large extraLarge } bannerImage trailer { id site } studios { edges { node { name } } } externalLinks { url site }`;
  const q = isIdLookup
    ? `query ($id: Int) { Media(id: $id, type: ANIME) { ${mediaFields} } }`
    : `query ($search: String) { Media(search: $search, type: ANIME) { ${mediaFields} } }`;
  const variables = isIdLookup ? { id: Number(search) } : { search };
  const res = await fetch(gqlEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query: q, variables })
  });
  if (!res.ok) throw new Error('AniList fetch error: ' + res.status);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors.map(e=>e.message).join('\n'));
  if (!data.data?.Media) throw new Error('No anime found');
  return data.data.Media;
};

// Search handler
searchBtn.addEventListener('click', async () => {
  const q = queryInput.value.trim();
  if (!q) return alert('Please enter an anime title');
  setStatus('Searching...');
  try {
    const media = await queryAniList(q);
    currentMedia = media;
    renderMedia(media);
    setStatus('Result loaded');
  } catch (e){
    console.error(e);
    setStatus('No results or network error');
    alert('Error: ' + e.message);
  }
});

queryInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') searchBtn.click(); });

function renderMedia(m){
  clearSpotlightSkeleton();
  coverImg.src = m.coverImage?.extraLarge || m.coverImage?.large || '';
  coverImg.alt = `${m.title.english || m.title.romaji || 'Anime'} cover`;
  seasonChip.textContent = formatSeason(m);
  titleChip.textContent = m.title.english || m.title.romaji || m.title.native || ('#' + m.id);
  subtitles.textContent = [m.title.native, m.title.romaji, m.title.english, ...(m.synonyms || [])].filter(Boolean).slice(0,4).join(' / ');
  scoreChip.innerHTML = m.averageScore ? `<span>*</span> ${(m.averageScore / 10).toFixed(2)} <small>AniList Score</small>` : '<span>*</span> N/A <small>AniList Score</small>';
  episodesChip.innerHTML = m.episodes ? `<span>#</span> ${m.episodes} <small>Episodes</small>` : '<span>#</span> N/A <small>Episodes</small>';
  durationChip.innerHTML = m.duration ? `<span>@</span> ${m.duration}m <small>Duration</small>` : '<span>@</span> N/A <small>Duration</small>';
  genresTags.innerHTML = (m.genres || []).map(g => `<div class="chip">${g}</div>`).join('');
  desc.innerHTML = sanitizeHtml(m.description || 'No description available.');
  externalLinks.innerHTML = (m.externalLinks || []).map(l=>`<a href="${l.url}" target="_blank" rel="noopener">${l.site}</a>`).join(' / ');
  
  if (m.trailer && m.trailer.site === 'youtube'){
    trailer.innerHTML = `<iframe width="100%" height="300" src="https://www.youtube.com/embed/${m.trailer.id}" title="trailer" frameborder="0" allowfullscreen></iframe>`;
  } else if (m.bannerImage){
    trailer.innerHTML = `<img src="${m.bannerImage}" alt="banner" />`;
  } else trailer.innerHTML = '<span class="muted">No trailer / banner</span>';

  const studios = m.studios?.edges?.map(s => s.node.name).filter(Boolean) || [];
  if (studios.length > 0) {
    desc.innerHTML += `<div class="studio-info"><strong>Studio:</strong> <span>${studios.join(', ')}</span></div>`;
  }

  openAniBtn.onclick = () => { window.open(m.siteUrl, '_blank', 'noopener'); };
  syncEntryAction(m);
}

// ---------- Local watchlist management ----------
const STORAGE_KEY = 'anime_watchlist_v1';
const FAVORITES_KEY = 'anime_favorites_v1';

function loadList(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ return []; }
}
function saveList(list){ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } 
  catch(e) { return []; }
}
function saveFavorites(list) {
  const capped = [...list]
    .sort((a, b) => (b.personal?.score || 0) - (a.personal?.score || 0) || (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 10);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(capped));
}

function addMediaToList(media, personal){
  const list = loadList();
  const idx = list.findIndex(x=>x.id===media.id);
  const existing = idx >= 0 ? list[idx] : null;
  const item = {
    id: media.id,
    title: media.title.romaji || media.title.english || media.title.native,
    cover: media.coverImage?.large || media.coverImage?.extraLarge || '',
    sitescore: media.averageScore || null,
    episodes: media.episodes || null,
    duration: media.duration || null,
    season: media.season || null,
    seasonYear: media.seasonYear || null,
    genres: media.genres || [],
    aniUrl: media.siteUrl || null,
    createdAt: existing?.createdAt || Date.now(),
    personal: Object.assign({status:'WATCHING', watchedEpisodes:0, score:null, notes:''}, personal || {})
  };
  if(idx>=0) list[idx]=item; else list.unshift(item);
  saveList(list);
  renderAllLists();
  renderStats();
  syncEntryAction(media);
  return idx >= 0 ? 'updated' : 'added';
}

function isFavorite(id) {
  return loadFavorites().some(f => f.id === id);
}

function addToFavorites(media, scoreOverride) {
  const favorites = loadFavorites();
  const favorite = {
    id: media.id,
    title: media.title?.romaji || media.title?.english || media.title?.native || media.title || 'Untitled',
    cover: media.coverImage?.large || media.coverImage?.extraLarge || media.cover || '',
    genres: media.genres || [],
    createdAt: Date.now(),
    personal: {
      score: Number(scoreOverride ?? $('personalScore').value) || null
    }
  };
  const idx = favorites.findIndex(f => f.id === media.id);
  if (idx >= 0) favorites[idx] = Object.assign({}, favorites[idx], favorite);
  else favorites.push(favorite);
  saveFavorites(favorites);
  renderFavorites();
  renderAllLists();
  setStatus('Added to favorites!');
}

function removeFromFavorites(id) {
  saveFavorites(loadFavorites().filter(f => f.id !== id));
  renderFavorites();
  renderAllLists();
}

function toggleFavoriteFromList(id) {
  const item = loadList().find(it => it.id === id);
  if (!item) return;
  if (isFavorite(id)) {
    removeFromFavorites(id);
    setStatus('Removed from favorites');
  } else {
    addToFavorites(item, item.personal?.score);
  }
  renderAllLists();
}

function saveCurrentEntry() {
  if(!currentMedia) return alert('Search and select an anime first');
  const p = getPersonalFormValues();
  const action = addMediaToList(currentMedia, p);
  
  // Auto-add to favorites if score >= 8
  if (p.score && p.score >= 8) {
    addToFavorites(currentMedia, p.score);
  }
  
  setStatus(action === 'updated' ? 'Entry updated' : 'Added to your playlist');
  refreshRecommendationsForSavedList();
}

function getFilteredSortedList() {
  let list = loadList();
  const filter = $('filterInput').value.trim().toLowerCase();
  const statusFilter = $('statusFilter').value;
  const sortBy = $('sortSelect').value;

  list = list.filter(it => {
    if(statusFilter !== 'all' && it.personal?.status !== statusFilter) return false;
    if(filter){
      const hay = (it.title + ' ' + (it.genres||[]).join(' ')).toLowerCase();
      if(!hay.includes(filter)) return false;
    }
    return true;
  });

  if (sortBy === 'title') {
    list.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'score') {
    list.sort((a, b) => (b.personal?.score || 0) - (a.personal?.score || 0));
  } else if (sortBy === 'added') {
    list.sort((a, b) => b.createdAt - a.createdAt);
  }

  return list;
}

function createAnimeCard(it) {
  const el = document.createElement('div');
  el.className = 'watchlist-item';
  const totalEpisodes = it.episodes || Math.max(it.personal?.watchedEpisodes || 0, 1);
  const watched = Math.min(it.personal?.watchedEpisodes || 0, totalEpisodes);
  const progress = Math.min(100, Math.round((watched / totalEpisodes) * 100));
  const remaining = it.episodes ? Math.max(0, it.episodes - watched) : 0;
  const status = (it.personal?.status || 'PLANNING').replaceAll('_', ' ');
  const favorite = isFavorite(it.id);

  el.innerHTML = `<img src="${it.cover || ''}" class="small-cover" alt="${it.title} cover"/>
    <div class="watchlist-body">
      <strong>${it.title}</strong>
      <div class="muted">${status}${remaining && it.personal?.status === 'WATCHING' ? ' / ' + remaining + ' EP remaining' : ''}</div>
      <div class="muted">${it.sitescore ? 'AniList Score: ' + it.sitescore + ' / ' : ''}My Score: ${it.personal?.score || 'N/A'}</div>
      <div class="watchlist-progress"><span style="--progress: ${progress}%"></span></div>
    </div>
    <div class="item-actions">
      <button data-id="${it.id}" class="openBtn">Open</button>
      <button data-id="${it.id}" class="favBtn${favorite ? ' active' : ''}">${favorite ? 'Unfav' : 'Fav'}</button>
      <button data-id="${it.id}" class="delBtn">Remove</button>
    </div>`;
  return el;
}

function bindListButtons(container) {
  container.querySelectorAll('.openBtn').forEach(b=>b.onclick = () => openListItem(Number(b.dataset.id)));
  container.querySelectorAll('.favBtn').forEach(b=>b.onclick = () => toggleFavoriteFromList(Number(b.dataset.id)));
  container.querySelectorAll('.delBtn').forEach(b=>b.onclick = () => removeFromList(Number(b.dataset.id)));
}

function renderWatchlist(){
  const container = $('watchlist');
  const list = getFilteredSortedList();
  container.innerHTML = '';

  if (!list.length) {
    container.innerHTML = '<div class="empty-state">No anime match these list controls yet.</div>';
    return;
  }

  list.forEach(it => container.appendChild(createAnimeCard(it)));
  bindListButtons(container);
}

function renderContinueWatching(){
  if (!continueWatchlist) return;
  const list = loadList()
    .filter(it => it.personal?.status === 'WATCHING')
    .sort((a, b) => b.createdAt - a.createdAt);

  continueWatchlist.innerHTML = '';
  if (!list.length) {
    continueWatchlist.innerHTML = '<div class="empty-state">No watching entries yet. Add an anime with status Watching to see it here.</div>';
    return;
  }

  list.forEach(it => continueWatchlist.appendChild(createAnimeCard(it)));
  bindListButtons(continueWatchlist);
}

function renderAllLists() {
  renderContinueWatching();
  renderWatchlist();
}

function refreshRecommendationsForSavedList() {
  if (!recommendationsList || !loadList().length) return;
  getRecommendations();
}

function openListItem(id){
  const list = loadList();
  const it = list.find(x=>x.id===id);
  if(!it) return;
  currentMedia = {
    id: it.id,
    title: { romaji: it.title },
    coverImage: { large: it.cover, extraLarge: it.cover },
    averageScore: it.sitescore || null,
    episodes: it.episodes || null,
    duration: it.duration || null,
    season: it.season || null,
    seasonYear: it.seasonYear || null,
    genres: it.genres || [],
    siteUrl: it.aniUrl || null
  };
  clearSpotlightSkeleton();
  seasonChip.textContent = [it.season, it.seasonYear].filter(Boolean).join(' ') || 'Saved';
  titleChip.textContent = it.title;
  coverImg.src = it.cover || '';
  coverImg.alt = `${it.title} cover`;
  subtitles.textContent = (it.genres || []).join(' / ');
  scoreChip.innerHTML = it.sitescore ? `<span>*</span> ${(it.sitescore / 10).toFixed(2)} <small>AniList Score</small>` : '<span>*</span> N/A <small>AniList Score</small>';
  episodesChip.innerHTML = it.episodes ? `<span>#</span> ${it.episodes} <small>Episodes</small>` : '<span>#</span> N/A <small>Episodes</small>';
  durationChip.innerHTML = it.duration ? `<span>@</span> ${it.duration}m <small>Duration</small>` : '<span>@</span> N/A <small>Duration</small>';
  genresTags.innerHTML = (it.genres || []).map(g => `<div class="chip">${g}</div>`).join('');
  desc.innerHTML = `<div class="muted">Local record - open AniList to fetch latest info.</div><p>${sanitizeHtml(it.personal?.notes || '')}</p>`;
  $('personalStatus').value = it.personal?.status || 'WATCHING';
  $('watchedEpisodes').value = it.personal?.watchedEpisodes || 0;
  $('personalScore').value = it.personal?.score || 0;
  $('personalNotes').value = it.personal?.notes || '';
  openAniBtn.onclick = () => { if(it.aniUrl) window.open(it.aniUrl,'_blank','noopener'); };
  $('savePersonal').textContent = 'Update Entry';
  setStatus('Saved entry loaded');
  showPage('discoveryPage');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeFromList(id){
  let list = loadList();
  list = list.filter(x=>x.id!==id);
  saveList(list);
  renderAllLists();
  renderStats();
}

$('savePersonal').addEventListener('click', ()=>{
  if(!currentMedia) return alert('Search and select an anime first');
  saveCurrentEntry();
});

$('clearPersonal').addEventListener('click', ()=>{
  setPersonalFormValues();
});

$('filterInput').addEventListener('input', renderAllLists);
$('statusFilter').addEventListener('change', renderAllLists);
$('sortSelect').addEventListener('change', renderAllLists);

// export/import
$('exportBtn').addEventListener('click', ()=>{
  const data = localStorage.getItem(STORAGE_KEY) || '[]';
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='anime-playlist.json'; a.click();
  URL.revokeObjectURL(url);
});

$('importBtn').addEventListener('click', ()=>{ $('importFile').click(); });
$('importFile').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  try{
    const text = await f.text();
    const parsed = JSON.parse(text);
    if(!Array.isArray(parsed)) return alert('Invalid file format (expected array)');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    renderAllLists();
    renderStats();
    refreshRecommendationsForSavedList();
    alert('Import successful');
  }catch(err){ alert('Import error: '+err.message); }
});

// Stats
function renderStats() {
  const list = loadList();
  const total = list.length;
  const completed = list.filter(it => it.personal?.status === 'COMPLETED').length;
  const watching = list.filter(it => it.personal?.status === 'WATCHING').length;
  const scores = list.map(it => it.personal?.score).filter(s => s !== null && s !== undefined);
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';
  const totalMinutes = list.reduce((acc, it) => {
    const watched = Number(it.personal?.watchedEpisodes) || 0;
    const duration = Number(it.duration) || 24;
    return acc + (watched * duration);
  }, 0);
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  $('statsContent').innerHTML = `
    <div class="stat-counters">
      <div class="stat-box"><strong>${total}</strong><span>Total Anime</span></div>
      <div class="stat-box"><strong>${formatWatchTime(totalMinutes)}</strong><span>Total Watch Time</span></div>
    </div>
    <div class="rate-row"><span>Completion Rate</span><strong>${completionRate}%</strong></div>
    <div class="rate-track"><span style="--rate: ${completionRate}%"></span></div>
    <div class="muted">Completed: ${completed} / Watching: ${watching} / Average Score: ${avgScore}</div>
  `;
}

// ---------- Favorites / Top 10 ----------
function renderFavorites() {
  const container = $('favoritesList');
  const favorites = loadFavorites()
    .sort((a, b) => (b.personal?.score || 0) - (a.personal?.score || 0) || (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 10);
  
  if (!container) return;
  
  if (favorites.length === 0) {
    container.innerHTML = '<div class="empty-state">No favorites yet. Score an anime 8 or higher to pin it here.</div>';
    return;
  }
  
  container.innerHTML = favorites.map((fav, idx) => {
    const title = typeof fav.title === 'object'
      ? (fav.title.english || fav.title.romaji || fav.title.native || 'Untitled')
      : (fav.title || 'Untitled');
    const score = fav.personal?.score || fav.score || 'N/A';
    return `
      <div class="favorite-item">
        <span class="favorite-rank">#${idx + 1}</span>
        <img src="${fav.cover || fav.coverImage?.large || ''}" alt="${title} cover" />
        <div class="info">
          <span class="title">${title}</span>
          <span class="score">My Score: ${score}/10</span>
        </div>
        <button class="unfavorite-btn" data-id="${fav.id}">Remove</button>
      </div>`;
  }).join('');
  
  container.querySelectorAll('.unfavorite-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      let favorites = loadFavorites();
      favorites = favorites.filter(f => f.id !== id);
      saveFavorites(favorites);
      renderFavorites();
      renderAllLists();
      setStatus('Removed from favorites');
    });
  });
}

// ---------- Anime Quotes ----------
const quoteContent = $('quoteContent');
const newQuoteBtn = $('newQuoteBtn');
const localQuotes = [
  { quote: 'Whatever happens, happens.', author: 'Spike Spiegel' },
  { quote: 'A lesson without pain is meaningless.', author: 'Edward Elric' },
  { quote: 'Fear is not evil. It tells you what weakness is.', author: 'Gildarts Clive' },
  { quote: 'People become stronger because they have memories they cannot forget.', author: 'Tsunade' },
  { quote: 'The world is not perfect, but it is there for us.', author: 'Roy Mustang' }
];
let lastQuoteIndex = -1;

function fetchQuote() {
  if (!quoteContent) return;
  let next = Math.floor(Math.random() * localQuotes.length);
  if (localQuotes.length > 1) {
    while (next === lastQuoteIndex) next = Math.floor(Math.random() * localQuotes.length);
  }
  lastQuoteIndex = next;
  const item = localQuotes[next];
  quoteContent.innerHTML = `
    <p class="quote-text">${item.quote}</p>
    <p class="quote-author">${item.author}</p>
  `;
}

if (newQuoteBtn) {
  newQuoteBtn.addEventListener('click', fetchQuote);
}

fetchQuote();

// ---------- Recommendations ----------
const getRecommendationsBtn = $('getRecommendationsBtn');
const recommendationsList = $('recommendationsList');

async function getRecommendations() {
  if (!recommendationsList) return;
  recommendationsList.innerHTML = '<p class="no-recommendations">Loading recommendations...</p>';
  
  const list = loadList();
  const genres = new Set();
  list.forEach(anime => {
    (anime.genres || []).forEach(g => genres.add(g));
  });
  
  if (genres.size === 0) {
    genres.add('Action');
    genres.add('Adventure');
  }
  
  const genreArray = Array.from(genres).slice(0, 3);
  const randomGenre = genreArray[Math.floor(Math.random() * genreArray.length)];
  
  const q = `
    query ($genre: String) {
      Page(perPage: 16) {
        media(genre: $genre, sort: POPULARITY_DESC, type: ANIME) {
          id
          title { romaji english }
          coverImage { large }
          averageScore
        }
      }
    }
  `;
  
  try {
    const res = await fetch(gqlEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: q, variables: { genre: randomGenre }})
    });
    const data = await res.json();
    const media = data.data?.Page?.media || [];
    
    if (media.length === 0) {
      recommendationsList.innerHTML = '<p class="no-recommendations">No recommendations found. Add some anime to your list first!</p>';
      return;
    }
    
    recommendationsList.innerHTML = media.slice(0, 16).map(m => `
      <div class="recommendation-item" data-id="${m.id}">
        <img src="${m.coverImage?.large || ''}" alt="${m.title.english || m.title.romaji}" />
        <span class="rec-title">${m.title.english || m.title.romaji}</span>
        <span class="rec-score">★ ${m.averageScore || 'N/A'}</span>
      </div>
    `).join('');
    
    recommendationsList.querySelectorAll('.recommendation-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = Number(item.dataset.id);
        queryInput.value = id.toString();
        searchBtn.click();
      });
    });
    
  } catch (e) {
    recommendationsList.innerHTML = '<p class="no-recommendations">Error loading recommendations. Try again later!</p>';
  }
}

if (getRecommendationsBtn) {
  getRecommendationsBtn.addEventListener('click', getRecommendations);
}

// Initial render
renderAllLists();
renderStats();
renderFavorites();
refreshRecommendationsForSavedList();

