const GITHUB_USER = 'pxty64';
const X_URL = 'https://x.com/pxty64';
const DISCORD_USER = 'p0etty';
const DISCORD_INVITE = 'https://discord.gg/SqtcpaCXgV';

let cachedProfile = null;
let cachedRepos = [];
let activeRepo = null;
let activePath = '';

const ghStatusLine = document.getElementById('ghStatusLine');
const aboutBio = document.getElementById('aboutBio');
const ghRepoCount = document.getElementById('ghRepoCount');
const ghFollowers = document.getElementById('ghFollowers');
const langFilterRow = document.getElementById('langFilterRow');
const reposContainer = document.getElementById('reposContainer');
const refreshGhBtn = document.getElementById('refreshGhBtn');
const toastEl = document.getElementById('toast');

// Modal explorador de archivos del repo
const repoModal = document.getElementById('repoModal');
const modalMeta = document.getElementById('modalMeta');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalGhLink = document.getElementById('modalGhLink');
const currentPathEl = document.getElementById('currentPath');
const pathUpBtn = document.getElementById('pathUpBtn');
const repoFilesList = document.getElementById('repoFilesList');

// Consola
const terminalOverlay = document.getElementById('terminalOverlay');
const terminalOutput = document.getElementById('terminalOutput');
const terminalForm = document.getElementById('terminalForm');
const terminalInput = document.getElementById('terminalInput');
const openTerminalBtn = document.getElementById('openTerminalBtn');

const menuToggle = document.getElementById('menuToggle');
const navEl = document.querySelector('.nav');

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2000);
}

function formatDate(iso) {
  if (!iso) return '-';
  return iso.slice(0, 10);
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Carga real desde GitHub REST API
async function loadGitHubData() {
  ghStatusLine.textContent = `# file: /home/${GITHUB_USER}/notes.txt | github: consultando api...`;
  reposContainer.innerHTML = `<p class="dim">cargando repositorios desde api.github.com/users/${GITHUB_USER}/repos ...</p>`;

  try {
    const [profileRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${GITHUB_USER}`),
      fetch(`https://api.github.com/users/${GITHUB_USER}/repos?sort=updated&per_page=100`)
    ]);

    if (!profileRes.ok || !reposRes.ok) {
      throw new Error(`HTTP ${profileRes.status}/${reposRes.status}`);
    }

    cachedProfile = await profileRes.json();
    cachedRepos = await reposRes.json();

    ghStatusLine.textContent = `# file: /home/${GITHUB_USER}/notes.txt | github: ok (${cachedProfile.public_repos} repos) | x.com/pxty64`;
    ghRepoCount.textContent = String(cachedProfile.public_repos ?? 0);
    ghFollowers.textContent = String(cachedProfile.followers ?? 0);

    if (cachedProfile.bio) {
      aboutBio.textContent = cachedProfile.bio;
    }

    renderLanguageFilters(cachedRepos);
    renderRepos('all');
  } catch (err) {
    ghStatusLine.textContent = `# file: /home/${GITHUB_USER}/notes.txt | github: error (${err.message})`;
    reposContainer.innerHTML = `
      <div class="empty-box">
        no se pudo consultar la API de GitHub ahora mismo (${err.message}).<br />
        puedes ver el perfil directo en <a class="link" href="https://github.com/${GITHUB_USER}" target="_blank" rel="noopener noreferrer">github.com/${GITHUB_USER}</a>.
      </div>
    `;
  }
}

function renderLanguageFilters(repos) {
  const langs = [...new Set(repos.map((r) => r.language).filter(Boolean))];
  if (!langs.length) {
    langFilterRow.hidden = true;
    return;
  }

  langFilterRow.hidden = false;
  langFilterRow.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'filter-btn active';
  allBtn.type = 'button';
  allBtn.textContent = `[todos (${repos.length})]`;
  allBtn.addEventListener('click', () => selectLang(allBtn, 'all'));
  langFilterRow.appendChild(allBtn);

  langs.forEach((lang) => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.type = 'button';
    btn.textContent = `[${lang.toLowerCase()}]`;
    btn.addEventListener('click', () => selectLang(btn, lang));
    langFilterRow.appendChild(btn);
  });
}

function selectLang(btn, lang) {
  langFilterRow.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  renderRepos(lang);
}

function renderRepos(langFilter = 'all') {
  const list = langFilter === 'all'
    ? cachedRepos
    : cachedRepos.filter((r) => r.language === langFilter);

  reposContainer.innerHTML = '';

  if (!list.length) {
    reposContainer.innerHTML = `
      <div class="empty-box">
        0 repositorios públicos encontrados en <a class="link" href="https://github.com/${GITHUB_USER}" target="_blank" rel="noopener noreferrer">github.com/${GITHUB_USER}</a>.<br />
        en cuanto subas repositorios públicos a tu cuenta aparecerán aquí automáticamente con explorador de archivos.
      </div>
    `;
    return;
  }

  list.forEach((repo) => {
    const el = document.createElement('article');
    el.className = 'project-item';
    el.tabIndex = 0;

    const lang = repo.language || 'sin lenguaje';
    const desc = repo.description || 'sin descripción en github.';

    el.innerHTML = `
      <div class="project-head">
        <h3>${repo.name}</h3>
        <span class="project-arch">${lang}</span>
      </div>
      <p>${desc}</p>
      <div class="repo-meta">
        <span>stars: ${repo.stargazers_count}</span>
        <span>forks: ${repo.forks_count}</span>
        <span>actualizado: ${formatDate(repo.updated_at)}</span>
        <span class="green">[ver archivos]</span>
      </div>
    `;

    el.addEventListener('click', () => openRepoExplorer(repo));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRepoExplorer(repo);
      }
    });

    reposContainer.appendChild(el);
  });
}

// Explorador real de archivos de cada repositorio (GitHub Contents API)
async function openRepoExplorer(repo, path = '') {
  activeRepo = repo;
  activePath = path;

  modalMeta.textContent = `github://${GITHUB_USER}/${repo.name}`;
  modalTitle.textContent = repo.name;
  modalDesc.textContent = repo.description || '';
  modalGhLink.href = repo.html_url;
  currentPathEl.textContent = `/${path}`;
  pathUpBtn.hidden = !path;
  repoFilesList.innerHTML = '<div class="file-row"><span class="dim">cargando archivos...</span></div>';
  repoModal.hidden = false;

  try {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${repo.name}/contents/${path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();

    if (!Array.isArray(items) || !items.length) {
      repoFilesList.innerHTML = '<div class="file-row"><span class="dim">directorio vacío</span></div>';
      return;
    }

    // Carpetas primero, luego archivos
    items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    repoFilesList.innerHTML = '';

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'file-row';

      if (item.type === 'dir') {
        const btn = document.createElement('button');
        btn.className = 'file-name dir';
        btn.type = 'button';
        btn.textContent = `${item.name}/`;
        btn.addEventListener('click', () => openRepoExplorer(repo, item.path));
        row.appendChild(btn);

        const tag = document.createElement('span');
        tag.className = 'file-size';
        tag.textContent = 'dir';
        row.appendChild(tag);
      } else {
        const link = document.createElement('a');
        link.className = 'file-name';
        link.href = item.html_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = item.name;
        row.appendChild(link);

        const sz = document.createElement('span');
        sz.className = 'file-size';
        sz.textContent = formatBytes(item.size);
        row.appendChild(sz);
      }

      repoFilesList.appendChild(row);
    });
  } catch (err) {
    repoFilesList.innerHTML = `<div class="file-row"><span class="red">error cargando archivos: ${err.message}</span></div>`;
  }
}

pathUpBtn.addEventListener('click', () => {
  if (!activeRepo || !activePath) return;
  const parts = activePath.split('/');
  parts.pop();
  openRepoExplorer(activeRepo, parts.join('/'));
});

function closeModals() {
  repoModal.hidden = true;
  terminalOverlay.hidden = true;
}

// Consola interactiva con datos reales
function termPrint(lines, cls = '') {
  lines.forEach((t) => {
    const d = document.createElement('div');
    d.textContent = t;
    if (cls) d.className = cls;
    terminalOutput.appendChild(d);
  });
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function openTerminal() {
  terminalOverlay.hidden = false;
  if (!terminalOutput.childElementCount) {
    termPrint(['pxty64@blackbook // escribe "help"'], 'green');
  }
  setTimeout(() => terminalInput.focus(), 20);
}

openTerminalBtn.addEventListener('click', openTerminal);

terminalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = terminalInput.value.trim();
  terminalInput.value = '';
  if (!raw) return;

  termPrint([`> ${raw}`], 'dim');
  const [cmd, arg] = raw.split(/\s+/);
  const lower = cmd.toLowerCase();

  if (lower === 'clear') {
    terminalOutput.innerHTML = '';
    return;
  }

  if (lower === 'help') {
    termPrint(['comandos: whoami | discord | backdoor | links | repos | ls <repo> | clear']);
    return;
  }

  if (lower === 'whoami') {
    termPrint([
      '@pxty64 — game debugger, ingeniería inversa y parches para emuladores.',
      cachedProfile ? `github: ${cachedProfile.public_repos} repos públicos, ${cachedProfile.followers} followers` : 'github: sin datos'
    ]);
    return;
  }

  if (lower === 'links') {
    termPrint([
      `backdoor : ${DISCORD_INVITE}`,
      `discord  : ${DISCORD_USER}`,
      `x        : ${X_URL}`,
      `github   : https://github.com/${GITHUB_USER}`,
      'mail     : pxty64@tuta.io'
    ]);
    return;
  }

  if (lower === 'discord') {
    termPrint([`discord: ${DISCORD_USER}`, `comunidad backdoor: ${DISCORD_INVITE}`], 'green');
    return;
  }

  if (lower === 'backdoor') {
    termPrint(['abriendo backdoor // debug · obf · reversing ...'], 'green');
    window.open(DISCORD_INVITE, '_blank', 'noopener');
    return;
  }

  if (lower === 'repos') {
    if (!cachedRepos.length) {
      termPrint([`0 repos públicos en github.com/${GITHUB_USER}`], 'dim');
    } else {
      termPrint(cachedRepos.map((r) => `  ${r.name} [${r.language || '-'}] (${r.stargazers_count}★)`));
    }
    return;
  }

  if (lower === 'ls') {
    if (!arg) {
      termPrint(['uso: ls <nombre_del_repo>'], 'amber');
      return;
    }
    const repo = cachedRepos.find((r) => r.name.toLowerCase() === arg.toLowerCase());
    if (!repo) {
      termPrint([`repo no encontrado: ${arg}`], 'red');
      return;
    }
    closeModals();
    openRepoExplorer(repo);
    return;
  }

  termPrint([`err: comando desconocido "${raw}"`], 'red');
});

refreshGhBtn.addEventListener('click', () => {
  loadGitHubData();
  toast('consultando github api...');
});

document.getElementById('copyDiscordBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(DISCORD_USER);
    toast(`discord "${DISCORD_USER}" copiado`);
  } catch {
    toast(`discord: ${DISCORD_USER}`);
  }
});

document.addEventListener('click', (e) => {
  if (e.target.dataset.close) closeModals();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModals();
  if (e.key === '`' && document.activeElement !== terminalInput) {
    e.preventDefault();
    terminalOverlay.hidden ? openTerminal() : closeModals();
  }
});

menuToggle.addEventListener('click', () => {
  const open = navEl.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});

navEl.querySelectorAll('a').forEach((a) => {
  a.addEventListener('click', () => {
    navEl.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

document.getElementById('year').textContent = new Date().getFullYear();
loadGitHubData();

// Fondo: malla wireframe ondulada en verde neón (mismo rollo que el banner)
(function waveGrid() {
  const canvas = document.getElementById('waveBg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, dpr = 1, t = 0;
  let mx = 0.5, my = 0.5;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function point(x, y) {
    // desplazamiento tipo tela: dos ondas cruzadas + reacción al ratón
    const nx = x / w, ny = y / h;
    const dx = nx - mx, dy = ny - my;
    const bump = Math.exp(-(dx * dx + dy * dy) * 14) * 30;
    const off = Math.sin(nx * 5 + t * 0.9) * 26 + Math.cos(ny * 4 - t * 0.7 + nx * 3) * 20 - bump;
    return [x + Math.sin(ny * 3 + t * 0.5) * 18, y + off];
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const step = Math.max(34, Math.min(w, h) / 22);
    ctx.lineWidth = 1;

    for (let y = -step * 2; y < h + step * 2; y += step) {
      ctx.beginPath();
      for (let x = -step; x <= w + step; x += step / 2) {
        const [px, py] = point(x, y);
        x === -step ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      const a = 0.10 + 0.12 * Math.abs(Math.sin(y / h * 3 + t * 0.6));
      ctx.strokeStyle = `rgba(57,255,20,${a})`;
      ctx.stroke();
    }

    for (let x = -step; x < w + step; x += step) {
      ctx.beginPath();
      for (let y = -step * 2; y <= h + step * 2; y += step / 2) {
        const [px, py] = point(x, y);
        y === -step * 2 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(57,255,20,0.09)';
      ctx.stroke();
    }

    // hilos de luz brillantes como en el banner
    ctx.save();
    ctx.shadowColor = '#39ff14';
    ctx.shadowBlur = 18;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      const base = h * (0.3 + k * 0.38);
      for (let x = -20; x <= w + 20; x += 10) {
        const y = base + Math.sin(x / w * 6 + t * (0.8 + k * 0.3) + k * 2) * h * 0.08;
        x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(120,255,90,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    if (!reduce) {
      t += 0.012;
      requestAnimationFrame(draw);
    }
  }

  window.addEventListener('resize', () => { resize(); if (reduce) draw(); });
  window.addEventListener('pointermove', (e) => { mx = e.clientX / w; my = e.clientY / h; });
  resize();
  draw();
})();
