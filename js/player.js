const get = (id) => document.getElementById(id);
const audio = get('audio');
const seek = get('seek');
const play = get('play');
const shuffle = get('shuffle');
const repeat = get('repeat');
const previous = get('previous');
const next = get('next');
const list = get('song-list');
const search = get('search');
const lyrics = get('lyrics');
const scores = get('scores');
const lyricsTab = get('lyrics-tab');
const scoreTab = get('score-tab');
const parts = [...document.querySelectorAll('[data-part]')];
const qualities = [...document.querySelectorAll('[data-quality]')];
const repeatLabels = ['关闭', '列表循环', '单曲循环'];
const variantKeys = {
  vocal: { standard: 'standard', lossless: 'lossless' },
  backing: { standard: 'accompaniment', lossless: 'accompanimentLossless' },
};

let tracks = [];
let rows = [];
let order = [];
let track;
let part = 'vocal';
let quality = 'standard';
let preferredPart = part;
let preferredQuality = quality;
let shuffled = false;
let repeatMode = 0;
let sourceVersion = 0;
let pendingPosition = 0;

function trackHash(id) {
  return '#' + encodeURIComponent(id);
}

function trackFromLocation() {
  return tracks.find((item) => trackHash(item.id) === location.hash || '#' + item.id === location.hash);
}

function getSource(selectedPart, selectedQuality) {
  return track.audio[variantKeys[selectedPart][selectedQuality]];
}

function timeLabel(seconds) {
  if (!Number.isFinite(seconds)) return '–:––';
  const whole = Math.floor(seconds);
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}

function playbackPosition() {
  return audio.hasAttribute('src') ? audio.currentTime : pendingPosition;
}

function updateTime() {
  const duration = audio.duration;
  const canSeek = Number.isFinite(duration) && duration > 0;
  const position = playbackPosition();
  seek.disabled = !canSeek;
  seek.max = canSeek ? duration : 1;
  seek.value = canSeek ? position : 0;
  get('current-time').textContent = timeLabel(position);
  get('duration').textContent = timeLabel(duration);
}

function message(text) {
  const status = get('playback-message');
  status.textContent = text;
  status.hidden = !text;
}

function updatePlayButton() {
  const label = audio.paused ? '播放' : '暂停';
  play.setAttribute('aria-label', label);
  play.title = label;
  get('play-state').setAttribute('href', audio.paused ? '#play-icon' : '#pause-icon');
}

function startPlayback() {
  message('');
  const position = playbackPosition();
  if (!audio.hasAttribute('src')) {
    audio.src = getSource(part, quality);
    if (position > 0) audio.currentTime = position;
  } else if (audio.error) {
    audio.load();
    if (position > 0) audio.currentTime = position;
  }
  const version = sourceVersion;
  audio.play().catch((error) => {
    if (version !== sourceVersion || error.name === 'AbortError') return;
    if (error.name === 'NotAllowedError') {
      message('浏览器暂停了自动播放，请点按播放。');
    } else {
      showAudioError();
    }
  });
}

function showAudioError() {
  message('此音源暂时无法播放。可重试，或切换可用的音源。');
}

function setSource({ resume = false, position = 0 } = {}) {
  sourceVersion += 1;
  message('');
  pendingPosition = position;
  if (audio.hasAttribute('src')) {
    audio.removeAttribute('src');
    audio.load();
  }
  updateTime();
  updatePlayButton();
  if (resume) startPlayback();
}

function updateVariants() {
  for (const button of parts) {
    const value = button.dataset.part;
    button.disabled = !getSource(value, 'standard') && !getSource(value, 'lossless');
    button.setAttribute('aria-pressed', value === part);
  }
  for (const button of qualities) {
    const value = button.dataset.quality;
    button.disabled = !getSource(part, value);
    button.setAttribute('aria-pressed', value === quality);
  }
}

function switchVariant(newPart, newQuality) {
  if (newPart === part && newQuality === quality) return;
  const position = newPart === part ? playbackPosition() : 0;
  const resume = !audio.paused;
  part = newPart;
  quality = getSource(part, newQuality)
    ? newQuality
    : getSource(part, 'standard') ? 'standard' : 'lossless';
  updateVariants();
  setSource({ position, resume });
}

function updateScores() {
  const original = get('score-original');
  original.hidden = scores.hidden || track.scores.length !== 1;
  if (track.scores.length === 1) original.href = track.scores[0];

  scores.replaceChildren();
  if (!track.scores.length) {
    const notice = Object.assign(document.createElement('p'), { className: 'empty', textContent: '这首诗歌暂无歌谱。' });
    scores.append(notice);
    return;
  }

  if (scores.hidden) return;
  track.scores.forEach((url, index) => {
    const label = track.title + ' · 歌谱 ' + (index + 1);
    const link = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener' });
    const image = Object.assign(document.createElement('img'), { alt: label, loading: 'lazy' });
    image.addEventListener('error', () => {
      const fallback = Object.assign(document.createElement('span'), {
        className: 'score-fallback',
        textContent: '预览暂时无法加载，打开' + label,
      });
      link.replaceChildren(fallback);
    });
    image.src = url;
    link.append(image);
    scores.append(link);
  });
}

function showReading(showScore) {
  lyricsTab.setAttribute('aria-selected', !showScore);
  scoreTab.setAttribute('aria-selected', showScore);
  lyricsTab.tabIndex = showScore ? -1 : 0;
  scoreTab.tabIndex = showScore ? 0 : -1;
  lyrics.hidden = showScore;
  scores.hidden = !showScore;
  if (track) updateScores();
}

function renderRows() {
  rows = tracks.map((item, index) => {
    const row = document.createElement('li');
    const link = document.createElement('a');
    link.href = trackHash(item.id);
    const number = Object.assign(document.createElement('span'), {
      className: 'song-number',
      textContent: String(index + 1).padStart(2, '0'),
    });
    number.setAttribute('aria-hidden', 'true');
    const title = Object.assign(document.createElement('span'), { textContent: item.title });
    link.append(number, title);
    link.insertAdjacentHTML('beforeend', '<svg aria-hidden="true"><use href="#note"/></svg>');
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (track !== item) selectTrack(item, { autoplay: true, historyMode: 'push' });
      else if (audio.paused) startPlayback();
      if (matchMedia('(max-width: 660px)').matches) {
        play.focus({ preventScroll: true });
        get('track-title').scrollIntoView({ block: 'center' });
      }
    });
    row.append(link);
    return { item, row, link };
  });
  list.append(...rows.map(({ row }) => row));
  filterRows();
}

function filterRows() {
  const query = search.value.trim().toLowerCase().replace(/\s+/g, '');
  let count = 0;
  for (const { item, row } of rows) {
    row.hidden = !item.title.toLowerCase().replace(/\s+/g, '').includes(query) &&
      !item.id.toLowerCase().includes(query);
    if (!row.hidden) count += 1;
  }
  get('song-count').textContent = count + ' 首';
  const empty = get('library-message');
  empty.textContent = '没有找到匹配的诗歌。';
  empty.hidden = count > 0;
}

function shuffleTracks() {
  const remaining = tracks.filter((item) => item !== track);
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [remaining[index], remaining[other]] = [remaining[other], remaining[index]];
  }
  return [track, ...remaining];
}

function selectTrack(item, { autoplay = false, historyMode, keepOrder = false } = {}) {
  track = item;
  if (shuffled && !keepOrder) order = shuffleTracks();
  part = getSource(preferredPart, 'standard') || getSource(preferredPart, 'lossless') ? preferredPart : 'vocal';
  quality = getSource(part, preferredQuality)
    ? preferredQuality
    : getSource(part, 'standard') ? 'standard' : 'lossless';

  if (historyMode && location.hash !== trackHash(item.id)) {
    if (historyMode === 'push') history.pushState(null, '', trackHash(item.id));
    else history.replaceState(null, '', trackHash(item.id));
  }
  get('track-title').textContent = item.title;
  document.title = item.title + ' · 第四诗班';
  for (const { item: listed, link } of rows) {
    if (listed === item) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
  lyrics.textContent = item.lyrics;
  lyrics.scrollTop = 0;
  scores.scrollTop = 0;
  updateScores();
  updateVariants();
  updateTransport();
  setSource({ resume: autoplay });
}

function updateTransport() {
  const index = order.indexOf(track);
  next.disabled = index === order.length - 1 && repeatMode !== 1;
  const label = '循环模式：' + repeatLabels[repeatMode];
  repeat.dataset.active = repeatMode !== 0;
  repeat.setAttribute('aria-label', label);
  repeat.title = label;
  get('repeat-one').hidden = repeatMode !== 2;
  shuffle.setAttribute('aria-pressed', shuffled);
}

function stepTrack(direction, automatic = false) {
  const index = order.indexOf(track);
  if (direction < 0 && (playbackPosition() > 3 || (index === 0 && repeatMode !== 1))) {
    if (audio.hasAttribute('src')) audio.currentTime = 0;
    pendingPosition = 0;
    updateTime();
    return;
  }

  let target = order[index + direction];
  if (!target && repeatMode === 1) {
    target = direction > 0 ? order[0] : order.at(-1);
  }
  if (target) selectTrack(target, { autoplay: automatic || !audio.paused, historyMode: automatic ? 'replace' : 'push', keepOrder: true });
}

function init() {
  if (typeof songCatalog === 'undefined' || songCatalog.length === 0) {
    get('library-message').textContent = '诗歌列表无法加载。请确认 data/songs.js 与网页一起保存在项目目录中。';
    return;
  }
  tracks = songCatalog;
  order = tracks;
  renderRows();
  selectTrack(trackFromLocation() ?? tracks[0]);
  for (const control of [play, shuffle, repeat, previous]) control.disabled = false;
}

play.addEventListener('click', () => {
  if (audio.paused) {
    startPlayback();
  } else {
    audio.pause();
  }
});
previous.addEventListener('click', () => stepTrack(-1));
next.addEventListener('click', () => stepTrack(1));
shuffle.addEventListener('click', () => {
  shuffled = !shuffled;
  order = shuffled ? shuffleTracks() : tracks;
  updateTransport();
});
repeat.addEventListener('click', () => {
  repeatMode = (repeatMode + 1) % repeatLabels.length;
  audio.loop = repeatMode === 2;
  updateTransport();
});
parts.forEach((button) => button.addEventListener('click', () => {
  preferredPart = button.dataset.part;
  switchVariant(preferredPart, preferredQuality);
}));
qualities.forEach((button) => button.addEventListener('click', () => {
  preferredQuality = button.dataset.quality;
  switchVariant(part, preferredQuality);
}));
seek.addEventListener('input', () => {
  audio.currentTime = Number(seek.value);
  updateTime();
});
get('volume').addEventListener('input', (event) => {
  audio.volume = Number(event.target.value);
});
for (const event of ['timeupdate', 'durationchange', 'loadedmetadata', 'emptied']) {
  audio.addEventListener(event, updateTime);
}
for (const event of ['play', 'pause', 'ended', 'emptied']) {
  audio.addEventListener(event, updatePlayButton);
}
audio.addEventListener('playing', () => message(''));
audio.addEventListener('error', showAudioError);
audio.addEventListener('ended', () => stepTrack(1, true));

search.addEventListener('input', filterRows);
lyricsTab.addEventListener('click', () => showReading(false));
scoreTab.addEventListener('click', () => showReading(true));
lyricsTab.parentElement.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const showScore = event.key === 'End' || (event.key !== 'Home' && event.target === lyricsTab);
  showReading(showScore);
  (showScore ? scoreTab : lyricsTab).focus();
});

window.addEventListener('hashchange', () => {
  const item = trackFromLocation();
  if (item && item !== track) selectTrack(item);
  if (!location.hash && tracks.length && tracks[0] !== track) selectTrack(tracks[0]);
});

init();
