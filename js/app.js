/* ═══════════════════════════════════════════════════════
   CONFIGURATION
   ═══════════════════════════════════════════════════════ */
const CONFIG = {
    SHEET_ID: '1CnPHtSxSDl3EvsfewstH2ZPHG78nrnJ1ARmOQkrjWNs',
    SHEETS: {
        ISSUES: 'Issues',
        ARTICLES: 'Articles',
        PATRONS: 'Patrons',
        EDITORIAL: 'Editorial'
    },
    COLLEGE: 'SRM Valliammai Engineering College',
    DEPARTMENT: 'Department of English',
    WEBSITE: 'https://www.eclatineers.in/',
    FOOTER_NOTE: 'For private circulation only'
};

/* ═══════════════════════════════════════════════════════
   CACHE
   ═══════════════════════════════════════════════════════ */
const Cache = { issues: null, articles: null, patrons: null, editorial: null };

/* ═══════════════════════════════════════════════════════
   DATA FETCHING
   ═══════════════════════════════════════════════════════ */
async function fetchSheet(sheetName) {
    // headers=1 asks Google to treat row 1 as the header row explicitly,
    // rather than relying on its (unreliable) auto-detection.
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&headers=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Network failure requesting dataset: ${sheetName}`);

    const text = await res.text();
    const jsonStr = text.replace(/\/\*O_o\*\/\s*google\.visualization\.Query\.setResponse\(/, '').replace(/\);?\s*$/, '');
    const data = JSON.parse(jsonStr);

    let cols = data.table.cols.map(c => (c.label || '').toLowerCase().replace(/[^a-z0-9]/g, '_').trim());
    let rows = data.table.rows || [];

    // Fallback: when every column in a sheet is text (e.g. long article
    // bodies), Google's gviz endpoint can fail to auto-detect a header
    // row even with headers=1, and instead returns blank column labels
    // with the real header text sitting in the first data row. Detect
    // that case and manually treat the first row as the header row.
    const hasDetectedHeaders = cols.some(c => c.length > 0);
    if (!hasDetectedHeaders && rows.length > 0) {
        cols = rows[0].c.map(cell => {
            const label = cell && cell.v != null ? String(cell.v) : '';
            return label.toLowerCase().replace(/[^a-z0-9]/g, '_').trim();
        });
        rows = rows.slice(1);
    }

    return rows.map(row => {
        const obj = {};
        cols.forEach((col, i) => {
            if (!col) return; // skip blank/unlabeled trailing columns
            let val = row.c[i]?.v ?? '';
            if (typeof val === 'string' && (col === 'id' || col === 'issueid')) {
                val = val.toLowerCase().trim();
            }
            obj[col] = val;
        });
        return obj;
    });
}

async function loadAllData() {
    const [issues, articles, patrons, editorial] = await Promise.all([
        fetchSheet(CONFIG.SHEETS.ISSUES),
        fetchSheet(CONFIG.SHEETS.ARTICLES),
        fetchSheet(CONFIG.SHEETS.PATRONS),
        fetchSheet(CONFIG.SHEETS.EDITORIAL)
    ]);
    Cache.issues = issues;
    Cache.articles = articles;
    Cache.patrons = patrons;
    Cache.editorial = editorial;
}

/* ═══════════════════════════════════════════════════════
   CORE DATA HELPERS
   ═══════════════════════════════════════════════════════ */
const CoreData = {
    getIssue: (id) => Cache.issues.find(i => String(i.id) === String(id).toLowerCase()),
    getArticles: (issueId) => Cache.articles
        .filter(a => String(a.issueid) === String(issueId).toLowerCase())
        .sort((a, b) => (parseInt(a.order) || 0) - (parseInt(b.order) || 0)),
    getArticle: (issueId, slug) => Cache.articles.find(a => 
        String(a.issueid) === String(issueId).toLowerCase() && a.slug === slug),
    getPatrons: (issueId) => Cache.patrons.filter(p => String(p.issueid) === String(issueId).toLowerCase()),
    getEditorial: (issueId) => Cache.editorial.filter(e => String(e.issueid) === String(issueId).toLowerCase())
};

/* ═══════════════════════════════════════════════════════
   ROUTING
   ═══════════════════════════════════════════════════════ */
function getRouterParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        issue: params.get('issue'),
        article: params.get('article'),
        section: params.get('section')
    };
}

function handleRouting() {
    const { issue, article, section } = getRouterParams();

    if (issue && article) {
        renderArticlePage(issue, article);
    } else if (issue && section === 'patrons') {
        renderPatronsPage(issue);
    } else if (issue && section === 'editorial') {
        renderEditorialPage(issue);
    } else if (issue) {
        renderIssuePage(issue);
    } else {
        renderHomePage();
    }
}

/* ═══════════════════════════════════════════════════════
   ORNAMENT
   ═══════════════════════════════════════════════════════ */
function renderGoldOrnament() {
    return `
        <div class="ornament-frame">
            <div class="ornament-line-complex"></div>
            <div class="ornament-crest">✦ ⚜ ✦</div>
            <div class="ornament-line-complex"></div>
        </div>`;
}

/* ═══════════════════════════════════════════════════════
   CONTENT PARSER
   ═══════════════════════════════════════════════════════ */
function escHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function parseContent(text, category) {
    if (!text) return '';

    // Riddles
    if (category === 'Riddles') {
        let html = '';
        const qas = text.split('>>').map(item => item.trim()).filter(Boolean);

        for (let i = 0; i < qas.length; i++) {
            if (qas[i].startsWith('??')) {
                const question = qas[i].slice(2).trim().replace(/\n/g, '<br>');
                const answer = (qas[i + 1] && !qas[i + 1].startsWith('??')) ? qas[i + 1].trim() : '...';

                html += `
                    <div class="riddle-card">
                        <div class="riddle-text">${question}</div>
                        <button class="riddle-btn" onclick="toggleRiddle(this)">Reveal Answer</button>
                        <div class="riddle-answer">${escHtml(answer)}</div>
                    </div>`;
            }
        }
        return html;
    }

    // Cryptic
    if (category && category.includes('Cryptic')) {
        const lines = text.split('\n');
        let html = '<div style="display:grid; gap:20px;">';

        lines.forEach(line => {
            if (line.trim().startsWith('!!')) {
                const clean = line.replace(/^\s*!!/, '').trim();
                const parts = clean.split(':');
                if (parts.length >= 3) {
                    const num = parts[0].trim();
                    const clue = parts[1].trim();
                    const hint = parts.slice(2).join(':').trim(); 

                    html += `
                        <div class="clue-card">
                            <div class="clue-number">Clue ${escHtml(num)}</div>
                            <div class="clue-text">${escHtml(clue)}</div>
                            <div class="clue-hint">${escHtml(hint)}</div>
                        </div>`;
                }
            }
        });
        html += '</div>';
        return html;
    }

    // Standard content — processed line by line so that special
    // markers (!, >>, ##, - ) are recognized whenever they start
    // their own line, regardless of how many blank lines surround
    // them. This is more forgiving of inconsistent spacing coming
    // out of Google Sheets than a strict split-on-\n\n approach.
    let html = '';
    const lines = text.split('\n');
    let paragraphBuffer = [];
    let listBuffer = [];
    let inBox = false;

    function flushParagraph() {
        if (paragraphBuffer.length === 0) return;
        const combined = paragraphBuffer.join('\n').trim();
        paragraphBuffer = [];
        if (!combined) return;
        const formatted = escHtml(combined).replace(/\n/g, '<br>');
        html += `<p>${formatted}</p>`;
    }

    function flushList() {
        if (listBuffer.length === 0) return;
        html += '<ul>' + listBuffer.map(i => `<li>${escHtml(i)}</li>`).join('') + '</ul>';
        listBuffer = [];
    }

    lines.forEach(rawLine => {
        const line = rawLine.trim();

        // Blank line: paragraph/list break
        if (line === '') {
            flushParagraph();
            flushList();
            return;
        }

        // Image: !Caption:SourceURL
        if (line.startsWith('!') && line.includes(':')) {
            flushParagraph();
            flushList();
            const parts = line.substring(1).split(':');
            const caption = parts[0].trim();
            const src = parts.slice(1).join(':').trim();
            html += `<div class="article-image"><img src="${escHtml(src)}" alt="${escHtml(caption)}" loading="lazy"><div class="image-caption">${escHtml(caption)}</div></div>`;
            return;
        }

        // Pull Quote
        if (line.startsWith('>>')) {
            flushParagraph();
            flushList();
            const quote = line.slice(2).trim();
            html += `<div class="article-quote">${escHtml(quote)}</div>`;
            return;
        }

        // Highlight Box header
        if (line.startsWith('##')) {
            flushParagraph();
            flushList();
            if (inBox) { html += '</div>'; }
            const title = line.slice(2).trim();
            html += `<div class="highlight-box"><h3>${escHtml(title)}</h3>`;
            inBox = true;
            return;
        }

        // List item (only meaningful inside a highlight box, but we
        // support it generally so a bare "- " list also renders)
        if (line.startsWith('- ')) {
            flushParagraph();
            listBuffer.push(line.slice(2).trim());
            return;
        }

        // Any other line: close list/box context as needed, then
        // accumulate into the current paragraph buffer.
        flushList();
        if (inBox) { html += '</div>'; inBox = false; }
        paragraphBuffer.push(line);
    });

    flushParagraph();
    flushList();
    if (inBox) html += '</div>';

    return html;
}

window.toggleRiddle = function(btn) {
    const answer = btn.nextElementSibling;
    answer.classList.toggle('show');
    btn.textContent = answer.classList.contains('show') ? 'Hide Answer' : 'Reveal Answer';
};

/* ═══════════════════════════════════════════════════════
   HOME PAGE
   ═══════════════════════════════════════════════════════ */
function renderHomePage() {
    let html = `
        <header class="header">
            <div class="container">
                <div class="college-name">${CONFIG.COLLEGE}</div>
                <h1 class="magazine-title">Eclatineers</h1>
                ${renderGoldOrnament()}
                <div class="magazine-subtitle">${CONFIG.DEPARTMENT}</div>
            </div>
        </header>
        <section style="padding: 40px 0 80px;">
            <div class="container">
                <div class="editorial-canvas-grid">`;

    Cache.issues.forEach(issue => {
        const imgSrc = issue.cover || `https://picsum.photos/seed/${issue.id}/800/400.jpg`;
        html += `
            <a class="issue-card" href="?issue=${issue.id}">
                <img class="issue-card-img" src="${escHtml(imgSrc)}" alt="${escHtml(issue.title)}" loading="lazy">
                <div class="issue-card-body">
                    <div class="issue-card-date">${escHtml(issue.date)}</div>
                    <div class="issue-card-title">${escHtml(issue.title)}</div>
                    <div class="issue-card-tagline">${escHtml(issue.tagline || '')}</div>
                </div>
            </a>`;
    });

    html += `</div></div></section>${renderFooter()}`;
    document.getElementById('app').innerHTML = html;
    updateNavBarState('', null);
    setArticlePageActive(false);
    window.scrollTo(0, 0);
}

/* ═══════════════════════════════════════════════════════
   ISSUE PAGE
   ═══════════════════════════════════════════════════════ */
function renderIssuePage(issueId) {
    const issue = CoreData.getIssue(issueId);
    if (!issue) { displayApplicationError('Target issue reference context absent.'); return; }

    const articles = CoreData.getArticles(issueId);
    const imgSrc = issue.cover || `https://picsum.photos/seed/${issue.id}/800/560.jpg`;

    let html = `
        <header class="header">
            <div class="container">
                <div class="college-name">${CONFIG.COLLEGE}</div>
                <h1 class="magazine-title">${escHtml(issue.title)}</h1>
                ${renderGoldOrnament()}
                <div class="magazine-subtitle">${CONFIG.DEPARTMENT}</div>
                <div class="issue-info">${escHtml(issue.date)} Folio</div>
                <div class="export-issue-bar" style="margin-top:24px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                    <button type="button" onclick="downloadIssueAsHtml('${issueId}')" style="cursor:pointer; background:transparent; border:1px solid currentColor; color:inherit; font-family:'Montserrat',sans-serif; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; padding:10px 18px; border-radius:2px; opacity:0.85;">⬇ Download Issue (HTML)</button>
                    <button type="button" onclick="downloadIssueAsPdf('${issueId}')" style="cursor:pointer; background:transparent; border:1px solid currentColor; color:inherit; font-family:'Montserrat',sans-serif; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; padding:10px 18px; border-radius:2px; opacity:0.85;">⬇ Download Issue (PDF)</button>
                </div>
            </div>
        </header>
        <section class="cover-section">
            <div class="container">
                <div class="cover-image-container">
                    <img src="${escHtml(imgSrc)}" alt="Cover Master Asset" class="cover-image" loading="lazy">
                </div>
            </div>
        </section>`;

    if (issue.about) {
        html += `
        <section class="intro-section">
            <div class="container">
                <p class="intro-text">"${escHtml(issue.about)}"</p>
                <div class="definition-box">
                    <div class="definition-term">Eclatineers</div>
                    <div class="definition-pronunciation">/ˌek-lə-ˈnīrz/</div>
                    <div class="definition-text">The architectural bridge connecting human artistic brilliance with technical synthesis. Built on human computation, execution, and aesthetics.</div>
                </div>
            </div>
        </section>`;
    }

    html += `
        <section class="toc-section">
            <div class="container">
                <h2 class="section-title">Index of Work</h2>
                <ul class="toc-list">`;

    articles.forEach((art, i) => {
        const num = String(i + 1).padStart(2, '0');
        html += `
            <li class="toc-item">
                <a class="toc-link" href="?issue=${issueId}&article=${art.slug}">
                    <div class="toc-number">${num}</div>
                    <div class="toc-content">
                        <div class="toc-title">${escHtml(art.title)}</div>
                        <div class="toc-meta">${escHtml(art.author).toUpperCase()} — ${escHtml(art.category).toUpperCase()}</div>
                    </div>
                    <div class="toc-arrow">→</div>
                </a>
            </li>`;
    });

    html += `
            <li class="toc-item">
                <a class="toc-link" href="?issue=${issueId}&section=patrons">
                    <div class="toc-number">✦</div>
                    <div class="toc-content">
                        <div class="toc-title">Our Patrons</div>
                        <div class="toc-meta">INSTITUTIONAL DIRECTORY</div>
                    </div>
                    <div class="toc-arrow">→</div>
                </a>
            </li>
            <li class="toc-item">
                <a class="toc-link" href="?issue=${issueId}&section=editorial">
                    <div class="toc-number">✦</div>
                    <div class="toc-content">
                        <div class="toc-title">Editorial Board</div>
                        <div class="toc-meta">FACULTY EDITORS</div>
                    </div>
                    <div class="toc-arrow">→</div>
                </a>
            </li>`;

    html += `</ul></div></section>${renderFooter()}`;

    document.getElementById('app').innerHTML = html;
    updateNavBarState(issue.title, `?issue=${issueId}`);
    setArticlePageActive(false);
    buildDynamicSlideoutMenu(issueId, articles);
    window.scrollTo(0, 0);
}

/* ═══════════════════════════════════════════════════════
   READER SIDEBAR (persistent desktop index of the issue)
   ═══════════════════════════════════════════════════════ */
function renderReaderSidebarToc(issueId, articles, currentSlug) {
    let html = `
        <aside class="reader-sidebar-toc">
            <a class="reader-sidebar-back" href="?issue=${issueId}">← Main Folio</a>
            <div class="reader-sidebar-label">Index of Work</div>
            <ul class="reader-toc-mini-list">`;

    articles.forEach((art, i) => {
        const num = String(i + 1).padStart(2, '0');
        const active = art.slug === currentSlug ? ' active' : '';
        html += `
                <li class="reader-toc-mini-item">
                    <a class="reader-toc-mini-link${active}" href="?issue=${issueId}&article=${art.slug}">
                        ${num}. ${escHtml(art.title)}
                        <span class="reader-toc-mini-meta">${escHtml(art.author)}</span>
                    </a>
                </li>`;
    });

    html += `
            </ul>
            <div class="reader-sidebar-divider"></div>
            <ul class="reader-toc-mini-list">
                <li class="reader-toc-mini-item"><a class="reader-toc-mini-link" href="?issue=${issueId}&section=patrons">Our Patrons</a></li>
                <li class="reader-toc-mini-item"><a class="reader-toc-mini-link" href="?issue=${issueId}&section=editorial">Editorial Board</a></li>
            </ul>
            <div class="reader-sidebar-divider"></div>
            <div class="reader-sidebar-reactions" id="sidebarReactions"></div>
        </aside>`;

    return html;
}

/* ═══════════════════════════════════════════════════════
   NEXT ARTICLE CARD
   ═══════════════════════════════════════════════════════ */
function renderNextArticleBlock(issueId, articles, currentSlug) {
    const idx = articles.findIndex(a => a.slug === currentSlug);
    const next = idx >= 0 && idx < articles.length - 1 ? articles[idx + 1] : null;

    if (next) {
        return `
            <a class="next-article-card" href="?issue=${issueId}&article=${next.slug}">
                <div>
                    <div class="next-article-label">Next in this Issue</div>
                    <div class="next-article-title">${escHtml(next.title)}</div>
                    <div class="next-article-meta">${escHtml(next.author).toUpperCase()} — ${escHtml(next.category).toUpperCase()}</div>
                </div>
                <div class="next-article-arrow">→</div>
            </a>`;
    }

    return `
        <div class="end-of-issue-card">
            <p>You've reached the end of this issue's index.</p>
            <a href="?issue=${issueId}">Back to Main Folio</a>
        </div>`;
}

/* ═══════════════════════════════════════════════════════
   ARTICLE PAGE — Continuous Scroll Reader
   ═══════════════════════════════════════════════════════ */
function renderArticlePage(issueId, slug) {
    const article = CoreData.getArticle(issueId, slug);
    if (!article) { displayApplicationError('Article structure could not be mapped.'); return; }

    const articles = CoreData.getArticles(issueId);
    const category = article.category || '';
    const rawContent = article.content || '';

    let finalBodyHtml = '';
    if (category === 'Riddles' || (category && category.includes('Cryptic'))) {
        finalBodyHtml = parseContent(rawContent, category);
    } else {
        finalBodyHtml = parseContent(rawContent, category);
    }

    // Font size and theme controls now live in the persistent floating
    // dock (index.html) rather than inline above the article — the
    // article column starts straight at the category/title.
    let html = `
        <div class="reader-page-grid">
            ${renderReaderSidebarToc(issueId, articles, slug)}

            <div class="reader-main-content">
                <div class="article-category">${escHtml(category)}</div>
                <h2>${escHtml(article.title)}</h2>

                <div class="article-author-signature">
                    <div class="author-name">${escHtml(article.author)}</div>
                    ${article.authorbio ? `<div class="author-bio">${escHtml(article.authorbio)}</div>` : ''}
                </div>

                <div class="reader-text-flow" id="readerTextFlow">
                    ${finalBodyHtml}
                </div>

                ${renderNextArticleBlock(issueId, articles, slug)}
            </div>
        </div>

        <div class="reader-comments-drawer" id="commentDrawer">
            <div class="drawer-header-bar">
                <span style="font-family:'Playfair Display',serif; font-size:15px; font-weight:600;">Contributions & Analysis</span>
                <span style="cursor:pointer; font-family:'Montserrat',sans-serif; font-size:11px; letter-spacing:1px;" onclick="toggleCommentDrawer(false)">✕ CLOSE</span>
            </div>
            <div style="padding: 20px 40px; height: calc(100% - 50px); overflow-y: auto;">
                <div id="giscus-container"></div>
            </div>
        </div>`;

    document.getElementById('app').innerHTML = html;
    updateNavBarState(article.title, `?issue=${issueId}`);
    setArticlePageActive(true);
    buildDynamicSlideoutMenu(issueId, articles);

    // Reset last article's reaction icons — the new giscus thread will
    // report its own counts once its iframe loads.
    const reactionsEl = document.getElementById('sidebarReactions');
    if (reactionsEl) { reactionsEl.innerHTML = ''; reactionsEl.classList.remove('has-data'); }

    // Initialize comments
    initGiscusComments(article.title, article.author);

    window.scrollTo(0, 0);
}

/* ═══════════════════════════════════════════════════════
   READER FONT SIZE CONTROL
   ═══════════════════════════════════════════════════════ */
const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_STEP = 0.1;

function applyFontScale(scale) {
    document.documentElement.style.setProperty('--reader-font-scale', scale);
}

window.adjustReaderFontSize = function(direction) {
    let scale = parseFloat(localStorage.getItem('eclatineers-font-scale')) || 1;
    scale = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, +(scale + direction * FONT_SCALE_STEP).toFixed(2)));
    localStorage.setItem('eclatineers-font-scale', scale);
    applyFontScale(scale);
};

function initFontScale() {
    const saved = parseFloat(localStorage.getItem('eclatineers-font-scale'));
    applyFontScale(saved && !isNaN(saved) ? saved : 1);
}

/* Single "Aa" button expands to reveal A+/A− rather than showing
   both permanently in the dock. */
function collapseFontControl() {
    const group = document.getElementById('fontControlGroup');
    const toggleBtn = document.getElementById('fontToggleBtn');
    if (group) group.classList.remove('expanded');
    if (toggleBtn) toggleBtn.classList.remove('active');
}

function initFontToggle() {
    const toggleBtn = document.getElementById('fontToggleBtn');
    const group = document.getElementById('fontControlGroup');
    if (!toggleBtn || !group) return;

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = group.classList.toggle('expanded');
        toggleBtn.classList.toggle('active', isOpen);
    });

    // Collapse when tapping anywhere else on the page.
    document.addEventListener('click', (e) => {
        if (group.classList.contains('expanded') &&
            !group.contains(e.target) && e.target !== toggleBtn) {
            collapseFontControl();
        }
    });
}

/* ═══════════════════════════════════════════════════════
   THEME CONTROL (light / dark) — single persistent toggle
   ═══════════════════════════════════════════════════════ */
function initTheme() {
    const saved = localStorage.getItem('eclatineers-theme');
    const theme = saved === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeButtonIcon();
}

window.toggleSiteTheme = function() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('eclatineers-theme', next);
    updateThemeButtonIcon();
};

function updateThemeButtonIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const icon = isDark ? '☀' : '☾';
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = icon;
}

/* ═══════════════════════════════════════════════════════
   COMMENTS DRAWER — triggered only by the persistent dock button
   ═══════════════════════════════════════════════════════ */
window.toggleCommentDrawer = function(open) {
    const drawer = document.getElementById('commentDrawer');
    if (!drawer) return;
    drawer.classList.toggle('open', open);
};

function initCommentsToggleButton() {
    const btn = document.getElementById('commentsToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const drawer = document.getElementById('commentDrawer');
        if (!drawer) return;
        toggleCommentDrawer(!drawer.classList.contains('open'));
    });
}

/* ═══════════════════════════════════════════════════════
   ARTICLE-PAGE STATE (drives which floating controls show)
   ═══════════════════════════════════════════════════════ */
function setArticlePageActive(isActive) {
    document.body.classList.toggle('is-article-page', !!isActive);
    // Leaving the article always closes the drawer and collapses the
    // text-size control so nothing lingers open on the next page.
    if (!isActive) {
        toggleCommentDrawer(false);
        collapseFontControl();
    }
}

/* ═══════════════════════════════════════════════════════
   PATRONS PAGE
   ═══════════════════════════════════════════════════════ */
function renderPatronsPage(issueId) {
    const patrons = CoreData.getPatrons(issueId);
    let html = `
        <section class="patrons-section">
            <div class="container">
                <h2 class="section-title">Our Patrons</h2>
                <div style="margin-top:40px;">`;

    patrons.forEach(p => {
        html += `
                <div class="patron-card">
                    <div class="patron-name">${escHtml(p.name)}</div>
                    <div class="patron-title">${escHtml(p.title)}</div>
                    <div class="patron-bio">${escHtml(p.bio)}</div>
                </div>`;
    });

    html += `</div></div></section>${renderFooter()}`;
    document.getElementById('app').innerHTML = html;
    updateNavBarState('Our Patrons', `?issue=${issueId}`);
    setArticlePageActive(false);
    buildDynamicSlideoutMenu(issueId, CoreData.getArticles(issueId));
    window.scrollTo(0, 0);
}

/* ═══════════════════════════════════════════════════════
   EDITORIAL PAGE
   ═══════════════════════════════════════════════════════ */
function renderEditorialPage(issueId) {
    const editorial = CoreData.getEditorial(issueId);
    let html = `
        <section class="editorial-section">
            <div class="container">
                <h2 class="section-title">Editorial Board</h2>
                <div class="editorial-grid" style="margin-top:40px;">`;

    editorial.forEach(e => {
        html += `
                    <div class="editor-card">
                        <div class="editor-name">${escHtml(e.name)}</div>
                        <div class="editor-role">${escHtml(e.role)}</div>
                    </div>`;
    });

    html += `</div>
                <div style="margin-top:60px; text-align:center; font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:2px; color:var(--text-light); text-transform:uppercase;">${CONFIG.FOOTER_NOTE}</div>
            </div>
        </section>${renderFooter()}`;

    document.getElementById('app').innerHTML = html;
    updateNavBarState('Editorial Board', `?issue=${issueId}`);
    setArticlePageActive(false);
    buildDynamicSlideoutMenu(issueId, CoreData.getArticles(issueId));
    window.scrollTo(0, 0);
}

/* ═══════════════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════════════ */
function renderFooter() {
    return `
        <footer class="footer">
            <div class="container">
                <div class="footer-logo">Eclatineers</div>
                <div class="footer-tagline">Visible éclat. Invisible engineer.</div>
                <div class="footer-links">
                    <a href="?" class="footer-link">Home</a>
                    <a href="${CONFIG.WEBSITE}" class="footer-link" target="_blank">Website</a>
                </div>
                <div class="footer-copyright">© ${new Date().getFullYear()} ${CONFIG.COLLEGE}<br>${CONFIG.DEPARTMENT}</div>
            </div>
        </footer>`;
}

/* ═══════════════════════════════════════════════════════
   GISCUS COMMENTS
   ═══════════════════════════════════════════════════════ */
function initGiscusComments(articleTitle, articleAuthor) {
    const container = document.getElementById('giscus-container');
    if (!container) return;
    container.innerHTML = '';

    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', window.location.href);

    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.setAttribute('data-repo', 'andrewveda/eclatineers');
    script.setAttribute('data-repo-id', 'R_kgDOTP7ILw');
    script.setAttribute('data-category', 'Announcements');
    script.setAttribute('data-category-id', 'DIC_kwDOTP7IL84DAruF');
    script.setAttribute('data-mapping', 'specific');
    script.setAttribute('data-term', `${articleTitle} — ${articleAuthor}`);
    script.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    script.crossOrigin = 'anonymous';
    script.async = true;

    container.appendChild(script);
}

/* ═══════════════════════════════════════════════════════
   GISCUS REACTION ICONS — sidebar, live via postMessage
   giscus broadcasts the discussion's reaction counts and total
   comment count to the parent window once its iframe has loaded.
   We listen for that and render it as a compact icon strip in the
   reader sidebar, so counts are visible without opening the drawer.
   ═══════════════════════════════════════════════════════ */
const REACTION_ICONS = {
    '+1': '👍', 'thumbs_up': '👍',
    '-1': '👎', 'thumbs_down': '👎',
    'laugh': '😄',
    'hooray': '🎉',
    'confused': '😕',
    'heart': '❤️',
    'rocket': '🚀',
    'eyes': '👀'
};

function initGiscusReactionListener() {
    window.addEventListener('message', (event) => {
        if (event.origin !== 'https://giscus.app') return;
        const data = event.data;
        if (!data || !data.giscus || !data.giscus.discussion) return;
        renderSidebarReactions(data.giscus.discussion);
    });
}

function renderSidebarReactions(discussion) {
    const el = document.getElementById('sidebarReactions');
    if (!el) return; // not on an article page (or sidebar not in DOM)

    const reactions = discussion.reactions || {};
    const pills = [];

    Object.keys(reactions).forEach(key => {
        const entry = reactions[key];
        const count = typeof entry === 'number' ? entry : (entry && entry.count) || 0;
        if (count <= 0) return;
        const icon = REACTION_ICONS[key.toLowerCase()];
        if (!icon) return;
        pills.push(`<span class="reaction-pill"><span class="reaction-icon">${icon}</span><span class="reaction-count">${count}</span></span>`);
    });

    const commentCount = discussion.totalCommentCount || 0;
    if (commentCount > 0) {
        pills.push(`<span class="reaction-pill"><span class="reaction-icon">💬</span><span class="reaction-count">${commentCount}</span></span>`);
    }

    if (pills.length === 0) {
        el.innerHTML = '';
        el.classList.remove('has-data');
        return;
    }

    el.innerHTML = pills.join('');
    el.classList.add('has-data');
}

/* ═══════════════════════════════════════════════════════
   NAVIGATION & MENU
   ═══════════════════════════════════════════════════════ */
function updateNavBarState(contextTitle) {
    const contextEl = document.getElementById('navContext');
    if (!contextEl) return;
    const inner = contextEl.querySelector('.nav-context-inner');
    if (inner) inner.textContent = contextTitle || '';
    contextEl.classList.toggle('has-accent', !!contextTitle);
}

function buildDynamicSlideoutMenu(issueId, articles) {
    const list = document.getElementById('mobileMenuList');
    let html = `
        <li class="mobile-menu-sep">Navigation</li>
        <li class="mobile-menu-item"><a class="mobile-menu-link" href="?issue=${issueId}">← Main Folio</a></li>
        <li class="mobile-menu-sep">Table of Contents</li>`;

    articles.forEach(art => {
        html += `<li class="mobile-menu-item"><a class="mobile-menu-link" href="?issue=${issueId}&article=${art.slug}">${escHtml(art.title)}</a></li>`;
    });

    html += `
        <li class="mobile-menu-sep">Management</li>
        <li class="mobile-menu-item"><a class="mobile-menu-link" href="?issue=${issueId}&section=patrons">Our Patrons</a></li>
        <li class="mobile-menu-item"><a class="mobile-menu-link" href="?issue=${issueId}&section=editorial">Editorial Board</a></li>
        <li class="mobile-menu-sep">System</li>
        <li class="mobile-menu-item"><a class="mobile-menu-link" href="#">View Archive</a></li>`;

    list.innerHTML = html;

    list.querySelectorAll('.mobile-menu-link').forEach(link => {
        link.addEventListener('click', () => {
            document.getElementById('mobileMenu').classList.remove('open');
            document.body.style.overflow = '';
        });
    });
}

function displayApplicationError(msg) {
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('errorMsg').textContent = msg;
    document.getElementById('errorScreen').classList.add('show');
}

/* ═══════════════════════════════════════════════════════
   INITIALIZATION
   ═══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   ISSUE EXPORT — bundles an entire issue (cover, about,
   every article, patrons, editorial board) into one
   self-contained, offline-readable HTML document that can
   either be saved directly or sent to the browser's print
   dialog so the reader can "Save as PDF".
   ═══════════════════════════════════════════════════════ */

// Riddles are rendered with a click-to-reveal button on the live site.
// In a static export there's no reason to hide the answer, so both
// question and answer are printed together.
function parseRiddlesForExport(text) {
    let html = '';
    const qas = text.split('>>').map(item => item.trim()).filter(Boolean);

    for (let i = 0; i < qas.length; i++) {
        if (qas[i].startsWith('??')) {
            const question = qas[i].slice(2).trim().replace(/\n/g, '<br>');
            const answer = (qas[i + 1] && !qas[i + 1].startsWith('??')) ? qas[i + 1].trim() : '...';
            html += `
                <div class="export-riddle">
                    <div class="export-riddle-q"><strong>Q.</strong> ${question}</div>
                    <div class="export-riddle-a"><strong>A.</strong> ${escHtml(answer)}</div>
                </div>`;
        }
    }
    return html;
}

function parseContentForExport(text, category) {
    if (!text) return '';
    if (category === 'Riddles') return parseRiddlesForExport(text);
    // Cryptic clues and standard prose already render their answers/hints
    // inline, so the normal parser is reused as-is for those.
    return parseContent(text, category);
}

function renderArticleExportBlock(art, index) {
    const num = String(index + 1).padStart(2, '0');
    const body = parseContentForExport(art.content || '', art.category || '');
    return `
        <article class="export-article" id="art-${escHtml(art.slug)}">
            <div class="export-article-num">${num}</div>
            <div class="export-category">${escHtml(art.category || '')}</div>
            <h2 class="export-article-title">${escHtml(art.title)}</h2>
            <div class="export-author">
                <span class="export-author-name">${escHtml(art.author || '')}</span>
                ${art.authorbio ? `<span class="export-author-bio"> — ${escHtml(art.authorbio)}</span>` : ''}
            </div>
            <div class="export-body">${body}</div>
        </article>`;
}

function sanitizeFilename(name) {
    return String(name || 'issue')
        .trim()
        .replace(/[^a-z0-9\-_]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'issue';
}

function buildIssueExportDocument(issueId) {
    const issue = CoreData.getIssue(issueId);
    if (!issue) return null;

    const articles = CoreData.getArticles(issueId);
    const patrons = CoreData.getPatrons(issueId);
    const editorial = CoreData.getEditorial(issueId);
    const imgSrc = issue.cover || `https://picsum.photos/seed/${issue.id}/800/560.jpg`;

    let toc = articles.map((a, i) =>
        `<li><a href="#art-${escHtml(a.slug)}">${String(i + 1).padStart(2, '0')}. ${escHtml(a.title)} <span class="export-toc-meta">— ${escHtml(a.author)}</span></a></li>`
    ).join('');
    toc += `<li><a href="#export-patrons">✦ Our Patrons</a></li>`;
    toc += `<li><a href="#export-editorial">✦ Editorial Board</a></li>`;

    const articlesHtml = articles.map((a, i) => renderArticleExportBlock(a, i)).join('\n<hr class="export-divider">\n');

    const patronsHtml = patrons.map(p => `
        <div class="export-patron">
            <div class="export-patron-name">${escHtml(p.name)}</div>
            <div class="export-patron-title">${escHtml(p.title)}</div>
            <div class="export-patron-bio">${escHtml(p.bio)}</div>
        </div>`).join('');

    const editorialHtml = editorial.map(e => `
        <div class="export-editor">
            <div class="export-editor-name">${escHtml(e.name)}</div>
            <div class="export-editor-role">${escHtml(e.role)}</div>
        </div>`).join('');

    const generatedDate = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    // This document is intentionally fully self-contained: system fonts
    // only (no external font/CSS requests), so the saved .html file opens
    // and looks right even without an internet connection. The only
    // remaining network dependency is the cover/article <img> sources
    // themselves, since those live on external hosts (Drive, picsum, etc).
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(issue.title)} — Eclatineers</title>
<style>
  :root{ --ink:#1c1a17; --paper:#faf7f0; --accent:#8a6d3b; --line:#ddd4c0; --muted:#6b6459; }
  *{box-sizing:border-box;}
  body{ margin:0; background:var(--paper); color:var(--ink); font-family: Georgia, 'Times New Roman', serif; line-height:1.7; }
  .export-wrap{max-width:760px; margin:0 auto; padding:60px 28px 100px;}
  .export-header{text-align:center; margin-bottom:40px;}
  .export-college{font-family: Arial, Helvetica, sans-serif; font-size:11px; letter-spacing:3px; text-transform:uppercase; color:var(--muted);}
  .export-title{font-size:42px; margin:14px 0 6px; font-weight:700;}
  .export-ornament{margin:14px 0; letter-spacing:8px; color:var(--accent);}
  .export-subtitle{font-family: Arial, Helvetica, sans-serif; font-size:12px; letter-spacing:2px; text-transform:uppercase; color:var(--muted);}
  .export-date{margin-top:10px; font-style:italic; color:var(--muted);}
  .export-cover{width:100%; max-height:460px; object-fit:cover; margin:30px 0; border:1px solid var(--line);}
  .export-about{font-style:italic; font-size:19px; text-align:center; margin:30px auto; max-width:600px; color:#3a352c;}
  .export-toc{border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:24px 0; margin:40px 0;}
  .export-toc h3{font-family: Arial, Helvetica, sans-serif; font-size:12px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); margin:0 0 14px;}
  .export-toc ul{list-style:none; padding:0; margin:0;}
  .export-toc li{margin:6px 0;}
  .export-toc a{color:var(--ink); text-decoration:none; border-bottom:1px dotted var(--line);}
  .export-toc-meta{color:var(--muted); font-style:italic;}
  .export-divider{border:none; border-top:1px solid var(--line); margin:56px 0;}
  .export-article-num{font-family: Arial, Helvetica, sans-serif; font-size:11px; color:var(--accent); letter-spacing:2px;}
  .export-category{font-family: Arial, Helvetica, sans-serif; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); margin-top:4px;}
  .export-article-title{font-size:28px; margin:8px 0 10px;}
  .export-author{font-family: Arial, Helvetica, sans-serif; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:var(--muted); margin-bottom:24px;}
  .export-author-bio{text-transform:none; font-style:italic;}
  .export-body p{margin:0 0 18px; font-size:17px;}
  .export-body .article-quote{font-style:italic; font-size:22px; border-left:3px solid var(--accent); padding:6px 0 6px 22px; margin:26px 0; color:#3a352c;}
  .export-body .highlight-box{background:#f1ead9; border:1px solid var(--line); padding:18px 22px; margin:24px 0; border-radius:2px;}
  .export-body .highlight-box h3{margin-top:0; font-size:15px; letter-spacing:1px; text-transform:uppercase; font-family: Arial, Helvetica, sans-serif; color:var(--accent);}
  .export-body .article-image{margin:26px 0;}
  .export-body .article-image img{width:100%; border:1px solid var(--line);}
  .export-body .image-caption{font-family: Arial, Helvetica, sans-serif; font-size:11px; color:var(--muted); text-align:center; margin-top:6px; letter-spacing:0.5px;}
  .export-body .clue-card{border:1px solid var(--line); padding:14px 18px; border-radius:2px; margin-bottom:14px;}
  .export-body .clue-number{font-family: Arial, Helvetica, sans-serif; font-size:11px; color:var(--accent); letter-spacing:1px; text-transform:uppercase;}
  .export-body .clue-hint{color:var(--muted); font-style:italic; margin-top:6px; font-size:14px;}
  .export-riddle{margin-bottom:16px; border:1px solid var(--line); padding:14px 18px; border-radius:2px;}
  .export-riddle-q{margin-bottom:8px;}
  .export-riddle-a{color:var(--muted);}
  .export-section-title{font-size:26px; text-align:center; margin-bottom:30px;}
  .export-patron, .export-editor{text-align:center; padding:16px 0; border-bottom:1px solid var(--line);}
  .export-patron-name, .export-editor-name{font-size:18px; font-weight:700;}
  .export-patron-title, .export-editor-role{font-family: Arial, Helvetica, sans-serif; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:var(--muted); margin-top:4px;}
  .export-patron-bio{margin-top:8px; color:#3a352c; font-size:15px;}
  .export-footer{text-align:center; margin-top:80px; font-family: Arial, Helvetica, sans-serif; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--muted);}
  @media print{
    body{background:#fff;}
    .export-wrap{padding:0 8px;}
    .export-article{page-break-before:always;}
    .export-toc{page-break-after:always;}
    .export-cover{max-height:340px;}
  }
</style>
</head>
<body>
<div class="export-wrap">
  <div class="export-header">
    <div class="export-college">${escHtml(CONFIG.COLLEGE)}</div>
    <div class="export-title">${escHtml(issue.title)}</div>
    <div class="export-ornament">✦ ⚜ ✦</div>
    <div class="export-subtitle">${escHtml(CONFIG.DEPARTMENT)}</div>
    <div class="export-date">${escHtml(issue.date)} Folio</div>
  </div>

  <img class="export-cover" src="${escHtml(imgSrc)}" alt="Cover">

  ${issue.about ? `<div class="export-about">"${escHtml(issue.about)}"</div>` : ''}

  <div class="export-toc">
    <h3>Index of Work</h3>
    <ul>${toc}</ul>
  </div>

  ${articlesHtml}

  <hr class="export-divider">

  <div id="export-patrons">
    <h2 class="export-section-title">Our Patrons</h2>
    ${patronsHtml}
  </div>

  <hr class="export-divider">

  <div id="export-editorial">
    <h2 class="export-section-title">Editorial Board</h2>
    ${editorialHtml}
  </div>

  <div class="export-footer">
    ${escHtml(CONFIG.FOOTER_NOTE)}<br><br>
    Eclatineers — ${escHtml(CONFIG.COLLEGE)}<br>
    Generated ${generatedDate} · ${escHtml(CONFIG.WEBSITE)}
  </div>
</div>
</body>
</html>`;
}

window.downloadIssueAsHtml = function(issueId) {
    const doc = buildIssueExportDocument(issueId);
    if (!doc) { alert('Could not prepare this issue for download.'); return; }
    const issue = CoreData.getIssue(issueId);
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(issue.title)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
};

window.downloadIssueAsPdf = function(issueId) {
    const doc = buildIssueExportDocument(issueId);
    if (!doc) { alert('Could not prepare this issue for download.'); return; }

    // No PDF library is bundled, so this leans on the browser's own
    // print engine: open the export document in a new tab and trigger
    // print(), where "Save as PDF" is a built-in destination in every
    // major browser's print dialog.
    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('Please allow pop-ups for this site to export a PDF, or use "Download Issue (HTML)" instead.');
        return;
    }
    printWin.document.open();
    printWin.document.write(doc);
    printWin.document.close();

    const triggerPrint = () => { printWin.focus(); printWin.print(); };
    if (printWin.document.readyState === 'complete') {
        setTimeout(triggerPrint, 400);
    } else {
        printWin.onload = () => setTimeout(triggerPrint, 400);
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    // Theme + font scale must be ready before first render
    initTheme();
    initFontScale();

    // Global theme toggle button
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleSiteTheme);

    // Global comments toggle button (persistent, article-only)
    initCommentsToggleButton();

    // Expandable "Aa" text-size control (persistent, article-only)
    initFontToggle();

    // Live giscus reaction/comment-count icons in the reader sidebar
    initGiscusReactionListener();

    // Menu toggle
    document.getElementById('navMenuBtn').addEventListener('click', () => {
        const menu = document.getElementById('mobileMenu');
        menu.classList.toggle('open');
        document.body.style.overflow = menu.classList.contains('open') ? 'hidden' : '';
    });

    document.getElementById('mobileMenuClose').addEventListener('click', () => {
        document.getElementById('mobileMenu').classList.remove('open');
        document.body.style.overflow = '';
    });

    // Back to top
    const btt = document.getElementById('backToTop');
    window.addEventListener('scroll', () => {
        btt.classList.toggle('show', window.pageYOffset > 400);
    });
    btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    try {
        await loadAllData();
        document.getElementById('loader').classList.add('hidden');
        handleRouting();
    } catch (err) {
        console.error(err);
        displayApplicationError('Failed to capture database cells from your spreadsheet channel.');
    }
});

window.addEventListener('popstate', handleRouting);