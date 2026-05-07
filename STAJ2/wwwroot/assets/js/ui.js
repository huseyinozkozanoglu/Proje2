// STAJ2/wwwroot/assets/js/ui.js

(function () {
    // --- SAYFALAMA VE HAFIZA (STATE) YÖNETİMİ ---
    const ITEMS_PER_PAGE = 7;
    const MODAL_ITEMS_PER_PAGE = 6;

    let pgState = {
        requests: { data: [], roles: [], page: 1 },
        users: { data: [], actions: [], page: 1 },
        roles: { data: [], page: 1 },
        tags: { data: [], page: 1 },
        rolePerm: { data: [], assignedIds: [], page: 1 },
        tagAssign: { data: [], filtered: [], assignedIds: [], page: 1 },
        userRoles: { data: [], assignedIds: [], page: 1 },
        userComp: { data: [], filtered: [], assignedIds: [], page: 1 },
        userTag: { data: [], assignedIds: [], page: 1 },
        newRolePerm: { data: [], assignedIds: [], page: 1 },
        reports: {
            bestCpu: { data: [], page: 1 },
            worstCpu: { data: [], page: 1 },
            bestRam: { data: [], page: 1 },
            worstRam: { data: [], page: 1 }
        }
    };

    function renderPagination(containerId, currentPage, totalItems, itemsPerPage, changePageFnString) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        if (totalPages <= 1) { container.innerHTML = ''; return; }

        let html = '<ul class="pagination pagination-sm justify-content-center mt-3 mb-0 shadow-sm">';
        html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                    <a class="page-link" href="javascript:void(0)" onclick="${changePageFnString}(${currentPage - 1})">Önceki</a>
                 </li>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<li class="page-item ${currentPage === i ? 'active' : ''}">
                        <a class="page-link" href="javascript:void(0)" onclick="${changePageFnString}(${i})">${i}</a>
                     </li>`;
        }
        html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                    <a class="page-link" href="javascript:void(0)" onclick="${changePageFnString}(${currentPage + 1})">Sonraki</a>
                 </li>`;
        html += '</ul>';
        container.innerHTML = html;
    }

    // --- Görünürlük Yardımcıları ---
    function show(id) { const el = document.getElementById(id); if (el) el.style.display = "block"; }
    function hide(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }
    function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
    function backOrHome() { if (window.history.length > 1) window.history.back(); else window.location.href = "/login.html"; }

    function toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        const icon = document.getElementById('theme-icon');
        if (icon) {
            icon.classList.add('icon-spin-out');
            setTimeout(() => {
                icon.className = newTheme === 'light' ? 'bi bi-moon-stars-fill' : 'bi bi-sun-fill';
                icon.classList.remove('icon-spin-out');
                icon.classList.add('icon-spin-in');
                setTimeout(() => icon.classList.remove('icon-spin-in'), 400);
            }, 200);
        }
    }

    // --- Sidebar ---
    async function renderSidebar() {
        const nav = document.getElementById('main-nav');
        if (!nav) return;

        try {
            const sidebarItems = await api.get('/api/Ui/sidebar-items');
            let html = '';

            const mainItems = sidebarItems.filter(item => !item.isProtected);
            const adminItems = sidebarItems.filter(item => item.isProtected);

            const lastView = sessionStorage.getItem('lastActiveView') || 'computers';

            mainItems.forEach(item => {
                const isActive = item.targetView === lastView ? 'active' : '';

                html += `
        <li class="nav-item">
            <a href="javascript:void(0)" id="nav-${item.targetView}" class="nav-link ${isActive}" onclick="ui.switchView('${item.targetView}')">
                <i class="${item.icon || 'bi bi-circle'}"></i> <span>${item.title}</span>
            </a>
        </li>`;
            });

            if (adminItems.length > 0) {
                html += `
        <li class="px-4 mt-4 mb-2">
            <small class="text-uppercase fw-bold" style="font-size:0.7rem; letter-spacing:1px; color:var(--text-muted);">Yönetim Paneli</small>
        </li>`;

                adminItems.forEach(item => {
                    html += `
            <li class="nav-item">
                <a href="javascript:void(0)" id="nav-${item.targetView}" class="nav-link" onclick="ui.switchView('${item.targetView}')">
                    <i class="${item.icon || 'bi bi-circle'}"></i> <span>${item.title}</span>
                </a>
            </li>`;
                });
            }

            nav.innerHTML = html;

        } catch (error) {
            console.error("Menü veritabanından çekilirken hata oluştu:", error);
            nav.innerHTML = `
    <li class="nav-item">
        <a href="javascript:void(0)" id="nav-computers" class="nav-link active" onclick="ui.switchView('computers')">
            <i class="bi bi-activity text-success"></i> <span>Canlı İzleme</span>
        </a>
    </li>`;
        }
    }

    async function switchView(view) {
        sessionStorage.setItem('lastActiveView', view);

        const content = document.getElementById('dynamic-content');
        const title = document.getElementById('view-title');
        const subtitle = document.getElementById('view-subtitle');
        if (!content) return;

        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const activeNav = document.getElementById(`nav-${view}`);
        if (activeNav) activeNav.classList.add('active');

        const filterEl = document.getElementById('globalFilters');
        if (filterEl) {
            if (['computers', 'all-computers', 'tags'].includes(view)) {
                filterEl.classList.remove('d-none');
                filterEl.classList.add('d-flex');
            } else {
                filterEl.classList.remove('d-flex');
                filterEl.classList.add('d-none');
            }
        }

        content.innerHTML = `<div class="d-flex justify-content-center p-5"><div class="spinner-border text-info" role="status"></div></div>`;

        const canEdit = window.auth.hasPermission('Computer.Delete') ||
            window.auth.hasPermission('Computer.Rename') ||
            window.auth.hasPermission('Computer.SetThreshold') ||
            window.auth.hasPermission('Computer.AssignTag');

        switch (view) {
            case 'computers':
                title.innerText = "Canlı İzleme";
                subtitle.innerText = "Sistemdeki cihazların canlı performansı.";
                content.innerHTML = `
        <div id="agentGrid" class="row row-cols-1 row-cols-lg-2 row-cols-xl-3 g-4">
            </div>
        <div id="livePagination" class="d-flex justify-content-center mt-4 pb-2"></div>
    `;
                if (window.loadAgents) loadAgents();
                break;

            case 'all-computers':
                title.innerText = "Tüm Bilgisayarlar";
                subtitle.innerText = "Sisteme kayıtlı aktif ve pasif tüm cihazlar.";
                content.innerHTML = `
                    <div class="card border-0 shadow-sm" style="background:var(--bg-card);">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead>
                                    <tr style="color:var(--text-muted);">
                                        <th>Cihaz & Etiketler</th>
                                        <th>IP</th>
                                        <th>Son Görülme</th>
                                        <th>Durum</th>
                                        ${canEdit ? '<th>İşlemler</th>' : ''}
                                    </tr>
                                </thead>
                                <tbody id="allComputersRows"></tbody>
                            </table>
                        </div>
                        <div id="allPagination" class="d-flex justify-content-center mt-3 pb-2"></div>
                    </div>`;
                if (window.loadAllComputers) loadAllComputers();
                break;

            case 'requests':
                title.innerText = "Kayıt Talepleri";
                subtitle.innerText = "Onay bekleyen yeni kullanıcılar.";
                await loadRequestsView(content);
                break;
            case 'users':
                title.innerText = "Kullanıcı Yönetimi";
                subtitle.innerText = "Kullanıcı rolleri ve cihaz/etiket erişimleri.";
                await loadUsersView(content);
                break;
            case 'roles':
                title.innerText = "Roller ve Yetkiler";
                subtitle.innerText = "Sistemdeki rollerin yetkilerini (permissions) düzenleyin.";
                await loadRolesView(content);
                break;
            case 'tags':
                title.innerText = "Etiket Yönetimi";
                subtitle.innerText = "Sistemdeki etiketleri yönetin ve cihazlara atayın.";
                content.innerHTML = `
        <div class="card border-0 shadow-sm" style="background:var(--bg-card);">
            <div class="card-body">
                <div class="input-group mb-4">
                    <input type="text" id="newTagName" class="form-control" placeholder="Yeni etiket adı..." style="background:var(--bg-input); color:var(--text-input); border-color:var(--border-input);">
                    <button class="btn btn-primary" onclick="ui.createNewTag()">+ Ekle</button>
                </div>
                <div class="table-responsive">
                    <table class="table" style="color:var(--text-main);">
                        <thead>
                            <tr style="border-bottom: 2px solid var(--border-color);">
                                <th>Etiket Adı</th>
                                <th class="text-end">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody id="tagTableBody">
                            <tr><td colspan="2" class="text-center">Yükleniyor...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="tagsPg" class="pb-3"></div>
            </div>
        </div>

        <div class="modal fade" id="tagAssignModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content" style="background:var(--bg-card); color:var(--text-main);">
                    <div class="modal-header border-bottom border-secondary">
                        <h5 class="modal-title">Etiketi Cihazlara Ata</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
    <input type="hidden" id="assignTagId">

    <div class="input-group mb-3">
        <span class="input-group-text" style="background:var(--bg-input); border-color:var(--border-color); color:var(--text-muted);"><i class="bi bi-search"></i></span>
        <input type="text" id="tagAssignSearchInput" class="form-control" placeholder="Cihaz adı veya IP ara..." onkeyup="ui.filterTagAssignComputers()" style="background:var(--bg-input); border-color:var(--border-color); color:var(--text-main);">
    </div>
    <div id="assignComputerList" class="list-group list-group-flush" style="max-height: 400px; overflow-y: auto;"></div>
    <div id="tagAssignPg" class="mt-2"></div>
</div>
                    <div class="modal-footer border-top border-secondary">
                        <button class="btn btn-secondary" data-bs-dismiss="modal">İptal</button>
                        <button class="btn btn-success" onclick="ui.saveTagAssignments()">Kaydet</button>
                    </div>
                </div>
            </div>
        </div>
    `;
                ui.loadTagTable();
                break;

            case 'history':
                title.innerText = "Geçmiş Metrikler";
                subtitle.innerText = "Cihazların CPU, RAM ve Disk geçmişlerini detaylı olarak inceleyin.";

                // Filtre alanını gizle (Geçmiş sayfasında kendi filtrelerimiz olacak)
                const historyFilterEl = document.getElementById('globalFilters');
                if (historyFilterEl) { historyFilterEl.classList.remove('d-flex'); historyFilterEl.classList.add('d-none'); }

                content.innerHTML = `
                <div class="row h-100" style="min-height: 75vh;">
                    <div class="col-lg-3 border-end border-secondary pe-lg-4 mb-4" style="border-color: var(--border-color) !important;">
                        <div class="card border-0 shadow-sm" style="background:var(--bg-card); position: sticky; top: 20px;">
                            <div class="card-body">
                                <h5 class="fw-bold mb-4" style="color:var(--text-title);"><i class="bi bi-sliders"></i> Kontrol Paneli</h5>

                                <div class="mb-3">
                                    <label class="form-label fw-bold small mb-1" style="color:var(--text-muted);">CİHAZ SEÇİMİ</label>
                                    <select id="historyPageComputerSelect" class="form-select" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                        <option value="">Yükleniyor...</option>
                                    </select>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-bold small mb-1" style="color:var(--text-muted);">BAŞLANGIÇ ZAMANI</label>
                                    <input type="datetime-local" id="historyStart" class="form-control" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                </div>

                                <div class="mb-4">
                                    <label class="form-label fw-bold small mb-1" style="color:var(--text-muted);">BİTİŞ ZAMANI</label>
                                    <input type="datetime-local" id="historyEnd" class="form-control" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                </div>

                                <button class="btn btn-primary w-100 fw-bold shadow-sm mb-4" onclick="fetchHistoryMetrics()">
                                    <i class="bi bi-search me-2"></i> Getir ve Çiz
                                </button>

                                <div id="diskFiltersContainer" style="display:none; padding-top: 15px; border-top: 1px solid var(--border-color);">
                                    <div class="d-flex align-items-center mb-3">
                                        <i class="bi bi-hdd-network text-info me-2"></i>
                                        <h6 class="mb-0 small fw-bold text-uppercase" style="color:var(--text-muted);">Diskleri Göster</h6>
                                    </div>
                                    <div id="diskCheckboxes" class="row g-2"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-9 ps-lg-4">
                        <div id="historyPlaceholder" class="text-center py-5 mt-5" style="display: block;">
                            <div class="opacity-50 mb-3" style="color: var(--text-muted);">
                                <i class="bi bi-graph-up display-1"></i>
                            </div>
                            <h4 class="fw-light" style="color: var(--text-title);">Lütfen sol taraftan cihaz ve tarih seçerek analize başlayın.</h4>
                        </div>

                        <div id="historyResults" style="display:none; width: 100%;">
                            <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                                <div id="bucketIntervalBadge" class="d-flex align-items-center gap-2" style="display: none !important;"></div>
                                <div class="btn-group btn-group-sm p-1 rounded" style="background: var(--bg-card); border: 1px solid var(--border-color);">
                                    <button class="btn btn-outline-info active" id="mode-band-btn" onclick="window.setHistoryMode('band')"><i class="bi bi-bandaid"></i> Bant Grafiği</button>
                                    <button class="btn btn-outline-info" id="mode-candle-btn" onclick="window.setHistoryMode('candle')"><i class="bi bi-graph-up-arrow"></i> Mum Grafiği</button>
                                </div>
                            </div>
                            <div id="chartsContainer" class="d-flex flex-column gap-4 w-100 pb-4">
                                <div class="card border border-secondary shadow-sm" style="background-color: var(--bg-card);">
                                    <div class="card-header border-bottom border-secondary text-info fw-bold"><i class="bi bi-cpu"></i> CPU Kullanımı</div>
                                    <div class="card-body p-2" style="overflow: hidden;">
                                        <div style="position: relative; height: 250px; width: 100%;">
                                            <canvas id="cpuChart"></canvas>
                                        </div>
                                        <div id="cpuMiniReport" class="mt-3 p-2 rounded" style="background: var(--bg-card-muted); border: 1px solid var(--border-color); display: none;"></div>
                                    </div>
                                </div>  

                                <div class="card border border-secondary shadow-sm" style="background-color: var(--bg-card);">
                                    <div class="card-header border-bottom border-secondary text-danger fw-bold"><i class="bi bi-memory"></i> RAM Kullanımı</div>
                                    <div class="card-body p-2" style="overflow: hidden;">
                                        <div style="position: relative; height: 250px; width: 100%;">
                                            <canvas id="ramChart"></canvas>
                                        </div>
                                        <div id="ramMiniReport" class="mt-3 p-2 rounded" style="background: var(--bg-card-muted); border: 1px solid var(--border-color); display: none;"></div>
                                    </div>
                                </div>

                                <div id="dynamicDiskCharts" class="d-flex flex-column gap-4"></div>
                            </div>
                        </div>
                    </div>
                </div>`;

                // Sayfa yüklendiğinde Cihazları dropdown'a dolduracak fonksiyonu çağırıyoruz
                if (window.ui.loadHistoryComputers) window.ui.loadHistoryComputers();
                break;

            case 'log-management':
                title.innerText = "Log Yönetimi";
                subtitle.innerText = "Sistemdeki tüm metrik akışını ve eşik aşımlarını Datadog stiliyle izleyin.";

                const logFilterEl = document.getElementById('globalFilters');
                if (logFilterEl) { logFilterEl.classList.remove('d-flex'); logFilterEl.classList.add('d-none'); }

                content.innerHTML = `
                <div class="row h-100">
                    <div class="col-lg-3 border-end border-secondary pe-lg-4 mb-4" style="border-color: var(--border-color) !important;">
                        <div class="card border-0 shadow-sm" style="background:var(--bg-card); position: sticky; top: 20px;">
                            <div class="card-body">
                                <h5 class="fw-bold mb-4" style="color:var(--text-title);"><i class="bi bi-sliders"></i> Kontrol Paneli</h5>
                                <div class="mb-3">
                                    <label class="form-label fw-bold small mb-1" style="color:var(--text-muted);">CİHAZ SEÇİMİ</label>
                                    <select id="logPageComputerSelect" class="form-select" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                        <option value="">Cihaz seçin...</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label fw-bold small mb-1" style="color:var(--text-muted);">BAŞLANGIÇ ZAMANI</label>
                                    <input type="datetime-local" id="logStart" class="form-control" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label fw-bold small mb-1" style="color:var(--text-muted);">BİTİŞ ZAMANI</label>
                                    <input type="datetime-local" id="logEnd" class="form-control" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                </div>
                                <button class="btn btn-primary w-100 fw-bold shadow-sm mb-4" onclick="ui.fetchLogManagementData()">
                                    <i class="bi bi-search me-2"></i> Getir ve Çiz
                                </button>
                                <hr>
                                <h6 class="fw-bold small mb-3" style="color:var(--text-muted);"><i class="bi bi-funnel"></i> METRİK FİLTRELERİ</h6>
                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input" type="checkbox" id="filterCpu" checked onchange="ui.applyLocalLogFilters()">
                                    <label class="form-check-label small" for="filterCpu">CPU Logları</label>
                                </div>
                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input" type="checkbox" id="filterRam" checked onchange="ui.applyLocalLogFilters()">
                                    <label class="form-check-label small" for="filterRam">RAM Logları</label>
                                </div>
                                <div class="form-check form-switch mb-4">
                                    <input class="form-check-input" type="checkbox" id="filterDisk" checked onchange="ui.applyLocalLogFilters()">
                                    <label class="form-check-label small" for="filterDisk">Disk Logları</label>
                                </div>
                                <h6 class="fw-bold small mb-3" style="color:var(--text-muted);"><i class="bi bi-exclamation-triangle"></i> SEVİYE FİLTRESİ</h6>
                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input" type="checkbox" id="filterCritical" checked onchange="ui.applyLocalLogFilters()">
                                    <label class="form-check-label small text-danger" for="filterCritical">Critical (Kritik Aşım)</label>
                                </div>
                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input" type="checkbox" id="filterWarning" checked onchange="ui.applyLocalLogFilters()">
                                    <label class="form-check-label small text-warning" for="filterWarning">Warning (Uyarı Seviyesi)</label>
                                </div>
                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input" type="checkbox" id="filterInfo" checked onchange="ui.applyLocalLogFilters()">
                                    <label class="form-check-label small text-success" for="filterInfo">Info (Normal)</label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-9">
                        <div class="card border-0 mb-4 shadow-sm" style="background:var(--bg-card);">
                            <div class="card-header border-bottom border-secondary bg-transparent py-2">
                                <h6 class="mb-0 small fw-bold text-muted"><i class="bi bi-bar-chart-steps me-1"></i> Log Dağılımı (Zaman Çizelgesi)</h6>
                            </div>
                            <div class="card-body p-2" style="height: 180px;">
                                <canvas id="logHistogramCanvas"></canvas>
                            </div>
                        </div>
                        <div class="card border-0 shadow-sm" style="background:var(--bg-card);">
                            <div class="card-header border-bottom border-secondary bg-transparent py-3 d-flex justify-content-between align-items-center">
                                <h5 class="mb-0 small"><i class="bi bi-list-task"></i> Log Akışı</h5>
                                <span id="logCountBadge" class="badge bg-secondary">0 Olay</span>
                            </div>
                            <div class="card-body p-0">
                                <div class="p-3 border-bottom border-secondary bg-transparent">
                                    <div class="input-group input-group-sm">
                                        <span class="input-group-text bg-transparent border-secondary text-muted"><i class="bi bi-search"></i></span>
                                        <input type="text" id="logSearchInput" class="form-control bg-transparent border-secondary text-white" placeholder="Mesajlarda veya metriklerde ara..." onkeyup="ui.debounceFilter()">
                                    </div>
                                </div>
                                <div id="logTableContainer" class="table-responsive" style="max-height: 500px; overflow-y: auto;" onscroll="ui.handleLogScroll()">
                                    <table class="table table-dark table-hover mb-0 small">
                                        <thead class="sticky-top" style="background: #1e293b; z-index: 1;">
                                            <tr style="color:var(--text-muted); border-bottom: 1px solid var(--border-color);">
                                                <th style="width: 150px;">Zaman Damgası</th>
                                                <th style="width: 100px;">Seviye</th>
                                                <th style="width: 120px;">Metrik</th>
                                                <th style="width: 80px;">Değer</th>
                                                <th>Detay / Mesaj</th>
                                            </tr>
                                        </thead>
                                        <tbody id="logTableBody">
                                            <tr><td colspan="5" class="text-center py-5 text-muted">Henüz veri getirilmedi. Lütfen cihaz ve tarih seçip "Getir ve Çiz" butonuna basın.</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
                ui.initLogManagementPage();
                break;
            case 'reports':
                title.innerText = "Performans Raporları";
                subtitle.innerText = "Cihazların CPU ve RAM ortalamalarına göre detaylı analizi.";

                const reportFilterEl = document.getElementById('globalFilters');
                if (reportFilterEl) { reportFilterEl.classList.remove('d-flex'); reportFilterEl.classList.add('d-none'); }

                content.innerHTML = `
                <div class="container-fluid p-0">
                    <div class="row mb-4">
                        <div class="col-md-6">
                            <div class="card border-0 shadow-sm" style="background:var(--bg-card); border-left: 4px solid #0dcaf0 !important;">
                                <div class="card-body">
                                    <h6 class="text-uppercase fw-bold mb-2" style="color:var(--text-muted); font-size: 0.8rem;"><i class="bi bi-cpu"></i> Genel CPU Ortalaması</h6>
                                    <h2 id="global-cpu-avg" class="mb-0" style="color:#0dcaf0;">Yükleniyor...</h2>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card border-0 shadow-sm mt-3 mt-md-0" style="background:var(--bg-card); border-left: 4px solid #d63384 !important;">
                                <div class="card-body">
                                    <h6 class="text-uppercase fw-bold mb-2" style="color:var(--text-muted); font-size: 0.8rem;"><i class="bi bi-memory"></i> Genel RAM Ortalaması</h6>
                                    <h2 id="global-ram-avg" class="mb-0" style="color:#d63384;">Yükleniyor...</h2>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row g-3">
                        <div class="col-xl-3 col-lg-6 col-md-6">
                            <div class="card border-0 shadow-sm h-100" style="background:var(--bg-card); border-top: 4px solid #198754 !important;">
                                <div class="card-header border-bottom border-secondary p-2" style="background:transparent; color:var(--text-title);">
                                    <h6 class="mb-0 fw-bold" style="font-size: 0.85rem;"><i class="bi bi-check-circle-fill text-success me-1"></i>En İyi CPU <span class="text-muted fw-normal" style="font-size: 0.7rem;">(Ort. Altı)</span></h6>
                                </div>
                                <div class="card-body p-0 d-flex flex-column justify-content-between">
                                    <div class="table-responsive">
                                        <table class="table table-sm table-hover align-middle mb-0">
                                            <tbody id="best-cpu-body">
                                                <tr><td class="text-center py-4 text-muted">Hesaplanıyor...</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div id="bestCpuPg" class="py-2"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-xl-3 col-lg-6 col-md-6">
                            <div class="card border-0 shadow-sm h-100" style="background:var(--bg-card); border-top: 4px solid #dc3545 !important;">
                                <div class="card-header border-bottom border-secondary p-2" style="background:transparent; color:var(--text-title);">
                                    <h6 class="mb-0 fw-bold" style="font-size: 0.85rem;"><i class="bi bi-x-circle-fill text-danger me-1"></i>En Kötü CPU <span class="text-muted fw-normal" style="font-size: 0.7rem;">(Ort. Üstü)</span></h6>
                                </div>
                                <div class="card-body p-0 d-flex flex-column justify-content-between">
                                    <div class="table-responsive">
                                        <table class="table table-sm table-hover align-middle mb-0">
                                            <tbody id="worst-cpu-body">
                                                <tr><td class="text-center py-4 text-muted">Hesaplanıyor...</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div id="worstCpuPg" class="py-2"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-xl-3 col-lg-6 col-md-6">
                            <div class="card border-0 shadow-sm h-100" style="background:var(--bg-card); border-top: 4px solid #198754 !important;">
                                <div class="card-header border-bottom border-secondary p-2" style="background:transparent; color:var(--text-title);">
                                    <h6 class="mb-0 fw-bold" style="font-size: 0.85rem;"><i class="bi bi-check-circle-fill text-success me-1"></i>En İyi RAM <span class="text-muted fw-normal" style="font-size: 0.7rem;">(Ort. Altı)</span></h6>
                                </div>
                                <div class="card-body p-0 d-flex flex-column justify-content-between">
                                    <div class="table-responsive">
                                        <table class="table table-sm table-hover align-middle mb-0">
                                            <tbody id="best-ram-body">
                                                <tr><td class="text-center py-4 text-muted">Hesaplanıyor...</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div id="bestRamPg" class="py-2"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-xl-3 col-lg-6 col-md-6">
                            <div class="card border-0 shadow-sm h-100" style="background:var(--bg-card); border-top: 4px solid #dc3545 !important;">
                                <div class="card-header border-bottom border-secondary p-2" style="background:transparent; color:var(--text-title);">
                                    <h6 class="mb-0 fw-bold" style="font-size: 0.85rem;"><i class="bi bi-x-circle-fill text-danger me-1"></i>En Kötü RAM <span class="text-muted fw-normal" style="font-size: 0.7rem;">(Ort. Üstü)</span></h6>
                                </div>
                                <div class="card-body p-0 d-flex flex-column justify-content-between">
                                    <div class="table-responsive">
                                        <table class="table table-sm table-hover align-middle mb-0">
                                            <tbody id="worst-ram-body">
                                                <tr><td class="text-center py-4 text-muted">Hesaplanıyor...</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div id="worstRamPg" class="py-2"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>`;

                if (window.ui.loadReportsView) window.ui.loadReportsView();
                break;
            case 'threshold-analysis':
                title.innerText = "Eşik Analiz Raporu";
                subtitle.innerText = "Cihazın seçilen tarih aralığındaki performans analizi.";

                const threshFilterEl = document.getElementById('globalFilters');
                if (threshFilterEl) {
                    threshFilterEl.classList.remove('d-flex');
                    threshFilterEl.classList.add('d-none');
                }

                content.innerHTML = `
<div class="row">
    <div class="col-lg-4 mb-4">
        <div class="card border-0 shadow-sm" style="background:var(--bg-card);">
            <div class="card-body">
                <h5 class="fw-bold mb-4" style="color:var(--text-title);"><i class="bi bi-sliders"></i> Parametreler</h5>
                
                <div class="mb-3">
                    <label class="form-label fw-bold small text-muted">CİHAZ SEÇİMİ</label>
                    <select id="ta-computer-select" class="form-select" onchange="ui.toggleTaParams(this.value)" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                        <option value="">Yükleniyor...</option>
                    </select>
                </div>

                <div id="ta-params-container" style="display:none; padding-top:10px; border-top:1px solid var(--border-color);">
                    
                    <div class="row g-2 mb-4">
                        <div class="col-12 col-xl-6">
                            <label class="form-label fw-bold small text-muted">BAŞLANGIÇ TARİHİ</label>
                            <input type="datetime-local" id="ta-start-date" class="form-control form-control-sm" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                        </div>
                        <div class="col-12 col-xl-6">
                            <label class="form-label fw-bold small text-muted">BİTİŞ TARİHİ</label>
                            <input type="datetime-local" id="ta-end-date" class="form-control form-control-sm" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                        </div>
                    </div>

                    <button class="btn btn-primary w-100 fw-bold shadow-sm" onclick="ui.generateThresholdReport()">
                        <i class="bi bi-bar-chart-line me-2"></i> Raporu Oluştur
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div class="col-lg-8">
        <div id="ta-results-container" style="display:none;">
            <div class="card border-0 shadow-sm" style="background:var(--bg-card);">
                <div class="card-header border-bottom border-secondary pt-3 pb-2" style="background:transparent;">
                    <h5 class="fw-bold mb-0" style="color:var(--text-title);" id="ta-result-title">Sonuçlar</h5>
                    <small style="color: var(--text-muted) !important; opacity: 0.85; font-weight: 500;">Seçilen Tarih Aralığı Veri Analizi</small>
                </div>
                <div class="card-body" id="ta-metrics-body">
                </div>
            </div>
        </div>
        <div id="ta-placeholder" class="text-center py-5 mt-5">
            <i class="bi bi-pc-display display-1 text-muted opacity-50 mb-3 d-block"></i>
            <h4 class="fw-light" style="color: var(--text-title);">Önce bir cihaz seçerek işleme başlayın.</h4>
        </div>
    </div>
</div>`;

                const now = new Date();
                const oneMonthAgo = new Date();
                oneMonthAgo.setMonth(now.getMonth() - 1);

                const toLocalISOString = (dt) => {
                    const pad = (n) => (n < 10 ? '0' + n : n);
                    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + 'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
                };

                document.getElementById('ta-end-date').value = toLocalISOString(now);
                document.getElementById('ta-start-date').value = toLocalISOString(oneMonthAgo);

                ui.loadThresholdComputers();
                break;
            case 'warnings':
                title.innerText = "Uyarı Raporları";
                subtitle.innerText = "Sistemde eşik değerlerini en çok aşan cihazlar.";

                // Filtre alanını gizle
                const warningFilterEl = document.getElementById('globalFilters');
                if (warningFilterEl) {
                    warningFilterEl.classList.remove('d-flex');
                    warningFilterEl.classList.add('d-none');
                }

                content.innerHTML = `
                <div class="row mb-3">
                    <div class="col-12 d-flex justify-content-end gap-2 align-items-end flex-wrap">
                        <div>
                            <label class="form-label small text-muted mb-1 fw-bold">Başlangıç Tarihi</label>
                            <input type="date" id="warning-start" class="form-control form-control-sm" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                        </div>
                        <div>
                            <label class="form-label small text-muted mb-1 fw-bold">Bitiş Tarihi</label>
                            <input type="date" id="warning-end" class="form-control form-control-sm" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                        </div>
                        <div class="d-flex gap-1">
                            <button class="btn btn-primary btn-sm fw-bold shadow-sm" onclick="window.fetchTopWarnings()"><i class="bi bi-filter"></i> Filtrele</button>
                            <button class="btn btn-secondary btn-sm fw-bold shadow-sm" onclick="window.clearWarningFilters()"><i class="bi bi-eraser"></i> Temizle</button>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-4 mb-3">
                        <div class="card border-0 shadow-sm h-100" style="background:var(--bg-card); border-top: 4px solid #0dcaf0 !important;">
                            <div class="card-header border-bottom border-secondary p-3" style="background:transparent; color:var(--text-title);">
                                <h6 class="mb-0 fw-bold"><i class="bi bi-cpu text-info me-2"></i>En Çok CPU Uyarısı</h6>
                            </div>
                            <div class="card-body p-0">
                                <ul class="list-group list-group-flush" id="top-cpu-list">
                                    <li class="list-group-item text-center py-4" style="background:transparent; color:var(--text-muted);">Yükleniyor...</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4 mb-3">
                        <div class="card border-0 shadow-sm h-100" style="background:var(--bg-card); border-top: 4px solid #d63384 !important;">
                            <div class="card-header border-bottom border-secondary p-3" style="background:transparent; color:var(--text-title);">
                                <h6 class="mb-0 fw-bold"><i class="bi bi-memory text-danger me-2"></i>En Çok RAM Uyarısı</h6>
                            </div>
                            <div class="card-body p-0">
                                <ul class="list-group list-group-flush" id="top-ram-list">
                                    <li class="list-group-item text-center py-4" style="background:transparent; color:var(--text-muted);">Yükleniyor...</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4 mb-3">
                        <div class="card border-0 shadow-sm h-100" style="background:var(--bg-card); border-top: 4px solid #ffc107 !important;">
                            <div class="card-header border-bottom border-secondary p-3" style="background:transparent; color:var(--text-title);">
                                <h6 class="mb-0 fw-bold"><i class="bi bi-hdd text-warning me-2"></i>En Çok Disk Uyarısı</h6>
                            </div>
                            <div class="card-body p-0">
                                <ul class="list-group list-group-flush" id="top-disk-list">
                                    <li class="list-group-item text-center py-4" style="background:transparent; color:var(--text-muted);">Yükleniyor...</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>`;

                if (window.fetchTopWarnings) window.fetchTopWarnings();
                break;

            case 'heatmap':
                title.innerText = "Heatmap Analizi";
                subtitle.innerText = "Cihaz performansının saatlik ve dakikalık yoğunluk haritası.";

                // Global filtreleri bu sayfada gizle
                const hmFilterEl = document.getElementById('globalFilters');
                if (hmFilterEl) { hmFilterEl.classList.remove('d-flex'); hmFilterEl.classList.add('d-none'); }

                content.innerHTML = `
                <div class="row">
                    <div class="col-lg-3 mb-4">
                        <div class="card border-0 shadow-sm" style="background:var(--bg-card);">
                            <div class="card-body">
                                <h5 class="fw-bold mb-4" style="color:var(--text-title);"><i class="bi bi-sliders text-warning"></i> Parametreler</h5>
                                
                                <div class="mb-3">
                                    <label class="form-label fw-bold small text-muted">CİHAZ SEÇİMİ</label>
                                    <select id="heatmap-computer-select" class="form-select" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                        <option value="">Yükleniyor...</option>
                                    </select>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label fw-bold small text-muted">TARİH SEÇİMİ</label>
                                    <input type="date" id="heatmap-date" class="form-control" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                </div>

                                <button class="btn btn-warning w-100 fw-bold shadow-sm text-dark" onclick="ui.generateHeatmap()">
                                    <i class="bi bi-grid-3x3 me-2"></i> Haritayı Çiz
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-9">
                        <div id="heatmap-results-container" style="display:none;"></div>
                        
                        <div id="heatmap-placeholder" class="text-center py-5 mt-5">
                            <i class="bi bi-grid-3x3-gap display-1 text-muted opacity-50 mb-3 d-block"></i>
                            <h4 class="fw-light" style="color: var(--text-title);">Analiz için sol menüden cihaz ve tarih seçiniz.</h4>
                            <p class="text-muted">Seçtiğiniz güne ait 10'ar dakikalık periyotlarla yoğunluk matrisi oluşturulacaktır.</p>
                        </div>
                    </div>
                </div>`;

                // Tarihi varsayılan olarak bugüne ayarla
                document.getElementById('heatmap-date').valueAsDate = new Date();

                // Cihazları getir
                if (window.ui.loadHeatmapComputers) window.ui.loadHeatmapComputers();
                break;

            case 'correlation':
                title.innerText = "Korelasyon Analizi";
                subtitle.innerText = "Metrikler arasındaki ilişkiyi farklı grafik türleriyle keşfedin.";

                content.innerHTML = `
                <div class="row">
                    <div class="col-lg-3 mb-4">
                        <div class="card border-0 shadow-sm" style="background:var(--bg-card);">
                            <div class="card-body">
                                <h5 class="fw-bold mb-4" style="color:var(--text-title);"><i class="bi bi-sliders text-primary"></i> Analiz Ayarları</h5>
                                
                                <div class="mb-4">
                                    <label class="form-label fw-bold small text-muted">GRAFİK TİPİ</label>
                                    <select id="corr-type-select" class="form-select" onchange="ui.handleCorrModeChange(this.value)" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                        <option value="" disabled selected>-- Seçiniz --</option>
                                        <option value="line">Zaman Serisi (Line)</option>
                                        <option value="scatter">Dağılım (Scatter Plot)</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label fw-bold small text-muted">CİHAZ SEÇİMİ</label>
                                    <select id="corr-computer-select" class="form-select" onchange="ui.loadCorrelationDisks(this.value)" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                        <option value="">Yükleniyor...</option>
                                    </select>
                                </div>

                                <div class="row g-2 mb-4">
                                    <div class="col-12">
                                        <label class="form-label fw-bold small text-muted">BAŞLANGIÇ</label>
                                        <input type="datetime-local" id="corr-start" class="form-control form-control-sm" style="background:var(--bg-input); color:var(--text-main);">
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-bold small text-muted">BİTİŞ</label>
                                        <input type="datetime-local" id="corr-end" class="form-control form-control-sm" style="background:var(--bg-input); color:var(--text-main);">
                                    </div>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label fw-bold small text-muted">VERİ SEÇİMİ <span id="selection-limit-info" class="badge bg-secondary ms-1"></span></label>
                                    <div id="corr-metrics-container">
                                        <div class="form-check mb-2">
                                            <input class="form-check-input corr-check" type="checkbox" id="check-cpu" value="CPU">
                                            <label class="form-check-label small" for="check-cpu">CPU Kullanımı (%)</label>
                                        </div>
                                        <div class="form-check mb-2">
                                            <input class="form-check-input corr-check" type="checkbox" id="check-ram" value="RAM">
                                            <label class="form-check-label small" for="check-ram">RAM Kullanımı (%)</label>
                                        </div>
                                        <div id="corr-disk-checks" class="mt-2 pt-2 border-top border-secondary" style="border-color:var(--border-color) !important;">
                                            <small class="text-muted d-block">Diskler (Cihaz Seçin)</small>
                                        </div>
                                    </div>
                                </div>

                                <button class="btn btn-primary w-100 fw-bold shadow-sm" onclick="ui.generateCorrelationAnalysis()">
                                    <i class="bi bi-graph-up-arrow me-2"></i> Analizi Göster
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-9">
                        <div id="corr-result-card" class="card border-0 shadow-sm p-3" style="background:var(--bg-card); display:none; height: 550px;">
                            <canvas id="correlationCanvas"></canvas>
                        </div>
                        <div id="corr-placeholder" class="text-center py-5 mt-5">
                            <i class="bi bi-intersect display-1 text-muted opacity-50 mb-3 d-block"></i>
                            <h4 class="fw-light" style="color: var(--text-title);">Analiz tipini ve parametreleri seçerek başlayın.</h4>
                        </div>
                    </div>
                </div>`;

                ui.initCorrelationPage();
                break;

            case 'device-comparison':
                title.innerText = "Cihaz Karşılaştırma";
                subtitle.innerText = "Seçilen cihazların performans metriklerini aynı grafik üzerinde karşılaştırın.";

                const compFilterEl = document.getElementById('globalFilters');
                if (compFilterEl) { compFilterEl.classList.remove('d-flex'); compFilterEl.classList.add('d-none'); }

                content.innerHTML = `
                <div class="row">
                    <div class="col-lg-3 mb-4">
                        <div class="card border-0 shadow-sm" style="background:var(--bg-card);">
                            <div class="card-body">
                                <h5 class="fw-bold mb-4" style="color:var(--text-title);"><i class="bi bi-sliders text-success"></i> Analiz Ayarları</h5>
                                
                                <div class="mb-3">
                                    <label class="form-label fw-bold small text-muted">KARŞILAŞTIRILACAK DEĞER</label>
                                    <select id="comp-metric-select" class="form-select" onchange="ui.handleComparisonMetricChange(this.value)" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                        <option value="" disabled selected>-- Seçiniz --</option>
                                        <option value="CPU">CPU Kullanımı (%)</option>
                                        <option value="RAM">RAM Kullanımı (%)</option>
                                        <optgroup label="Ortak Diskler" id="comp-disk-optgroup"></optgroup>
                                    </select>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label fw-bold small text-muted">CİHAZLAR <span id="comp-selected-count" class="badge bg-secondary ms-1">0 Seçili</span></label>
                                    <div id="comp-computers-container" class="border rounded p-2" style="max-height: 250px; overflow-y: auto; background:var(--bg-input); border-color:var(--border-input) !important;">
                                        <small class="text-muted">Yükleniyor...</small>
                                    </div>
                                </div>

                                <div class="row g-2 mb-4">
                                    <div class="col-12">
                                        <label class="form-label fw-bold small text-muted">BAŞLANGIÇ</label>
                                        <input type="datetime-local" id="comp-start" class="form-control form-control-sm" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-bold small text-muted">BİTİŞ</label>
                                        <input type="datetime-local" id="comp-end" class="form-control form-control-sm" style="background:var(--bg-input); color:var(--text-main); border-color:var(--border-input);">
                                    </div>
                                </div>

                                <button class="btn btn-success w-100 fw-bold shadow-sm" onclick="ui.generateDeviceComparison()">
                                    <i class="bi bi-graph-up me-2"></i> Karşılaştır
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-9">
                        <div id="comp-result-card" class="card border-0 shadow-sm p-3" style="background:var(--bg-card); display:none; height: 550px;">
                            <canvas id="comparisonCanvas"></canvas>
                        </div>
                        <div id="comp-placeholder" class="text-center py-5 mt-5">
                            <i class="bi bi-arrow-left-right display-1 text-muted opacity-50 mb-3 d-block"></i>
                            <h4 class="fw-light" style="color: var(--text-title);">Değer ve cihazları seçerek karşılaştırmaya başlayın.</h4>
                        </div>
                    </div>
                </div>`;

                ui.initDeviceComparisonPage();
                break;
        }

    }

    // --- Alt Görünümler (Sayfalamaya Uygun Hale Getirildi) ---

    async function loadRequestsView(container) {
        try {
            const [reqs, roles] = await Promise.all([
                api.get("/api/Admin/requests"),
                api.get("/api/Admin/roles")
            ]);
            pgState.requests.data = reqs;
            pgState.requests.roles = roles;
            pgState.requests.page = 1;

            container.innerHTML = `
                <div class="card border-0 shadow-sm" style="background:var(--bg-card);">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead><tr style="color:var(--text-muted);"><th>Kullanıcı</th><th>Atanacak Rol</th><th class="text-end">İşlem</th></tr></thead>
                            <tbody id="reqTbody"></tbody>
                        </table>
                    </div>
                    <div id="reqPg" class="pb-3"></div>
                </div>`;
            ui.renderRequestsTable();
        } catch (e) { container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
    }

    async function loadUsersView(container) {
        try {
            const users = await api.get("/api/Admin/users");
            pgState.users.data = users;
            pgState.users.page = 1;

            container.innerHTML = `
            <div class="card border-0 shadow-sm" style="background:var(--bg-card);">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead>
                            <tr style="color:var(--text-muted);">
                                <th>Kullanıcı Adı</th>
                                <th>Sahip Olduğu Roller</th>
                                <th class="text-end">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody id="usersTbody"></tbody>
                    </table>
                </div>
                <div id="usersPg" class="pb-3"></div>
            </div>`;

            ui.renderUsersTable();

        } catch (e) {
            container.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center p-5 text-center" style="min-height: 400px; color:var(--text-muted);">
                <i class="bi bi-shield-lock-fill text-danger mb-3" style="font-size: 3rem;"></i>
                <h4 class="text-white">Yetkisiz Erişim veya Bağlantı Hatası</h4>
                <p>${e.message || 'Bu veriyi görüntüleme yetkiniz bulunmamaktadır.'}</p>
            </div>`;
        }
    }

    async function loadRolesView(container) {
        try {
            const roles = await api.get("/api/Admin/roles");
            pgState.roles.data = roles.filter(r => r.name !== window.APP_CONFIG.ADMIN_ROLE_NAME);
            pgState.roles.page = 1;

            const canManageRoles = window.auth.hasPermission('Role.Manage');
            const addRoleBtn = canManageRoles ? `<button class="btn btn-success btn-sm" onclick="ui.openCreateRoleModal()">+ Yeni Rol Ekle</button>` : '';

            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3" style="max-width: 600px;">
                    <h5 class="m-0" style="color:var(--text-title);"></h5>
                    ${addRoleBtn}
                </div>
                <div class="card border-0 shadow-sm" style="background:var(--bg-card); max-width: 600px;">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead><tr style="color:var(--text-muted);"><th>Sistem Rolü</th><th class="text-end">İşlem</th></tr></thead>
                            <tbody id="rolesTbody"></tbody>
                        </table>
                    </div>
                    <div id="rolesPg" class="pb-3"></div>
                </div>
                
                <div class="modal fade" id="createRoleModal" tabindex="-1">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content" style="background:var(--bg-card); color:var(--text-main);">
                            <div class="modal-header border-bottom border-secondary">
                                <h5 class="modal-title">Yeni Rol Ekle</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label text-muted small">Rol Adı (Maks 20 karakter)</label>
                                    <input type="text" id="newRoleNameInput" class="form-control" maxlength="20" placeholder="Örn: Sınıf Başkanı" style="background:var(--bg-input); border-color:var(--border-color); color:var(--text-main);">
                                </div>
                                <label class="form-label text-muted small mb-2">Başlangıç Yetkileri</label>
                                <div id="newRolePermsContainer" class="row g-2" style="max-height: 250px; overflow-y: auto;">
                                    </div>
                            </div>
                            <div class="modal-footer border-top border-secondary">
                                <button class="btn btn-secondary" data-bs-dismiss="modal">İptal</button>
                                <button class="btn btn-success" onclick="ui.saveNewRole()">Oluştur</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            ui.renderRolesTable();
        } catch (e) { container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
    }

    // --- Fonksiyonları Dışarı Aç (Window.UI) ---
    window.ui = {
        allLogs: [],
        filteredLogs: [],
        logRenderIndex: 0,
        filterTimeout: null,
        show, hide, setText, backOrHome,
        renderSidebar, switchView, toggleTheme,

        approveRequest: async (id) => {
            const result = await Swal.fire({
                title: 'Onaylıyor musunuz?',
                text: "Bu kullanıcıyı onaylamak istiyor musunuz?",
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Evet, Onayla',
                cancelButtonText: 'İptal'
            });

            if (!result.isConfirmed) return;

            const approveBtn = document.querySelector(`button[onclick="ui.approveRequest(${id})"]`);
            const rejectBtn = document.querySelector(`button[onclick="ui.rejectRequest(${id})"]`);

            if (approveBtn) {
                approveBtn.dataset.originalText = approveBtn.innerHTML;
                approveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Mail Gönderiliyor...';
                approveBtn.disabled = true;
            }
            if (rejectBtn) rejectBtn.disabled = true;

            try {
                const roleId = document.getElementById(`reqRole_${id}`).value;
                const response = await api.post(`/api/admin/requests/approve/${id}`, { newRoleId: parseInt(roleId) });

                Swal.fire({ title: response.title, text: response.message, icon: 'success' });
                ui.switchView('requests');
            } catch (e) {
                Swal.fire({ title: e.title, text: e.message, icon: 'warning' });

                if (approveBtn) {
                    approveBtn.innerHTML = approveBtn.dataset.originalText;
                    approveBtn.disabled = false;
                }
                if (rejectBtn) rejectBtn.disabled = false;
            }
        },

        rejectRequest: async (id) => {
            const { value: reason } = await Swal.fire({
                title: 'Ret Sebebi',
                input: 'textarea',
                inputLabel: 'Lütfen ret sebebini giriniz:',
                showCancelButton: true,
                confirmButtonText: 'Reddet',
                cancelButtonText: 'İptal',
                inputValidator: (value) => {
                    if (!value) return 'Ret sebebi boş bırakılamaz!'; // Kullanıcı iptale basmak yerine boş gönderemesin diye ufak bir UI UX kuralı olarak kaldı
                }
            });

            if (!reason) return;

            const approveBtn = document.querySelector(`button[onclick="ui.approveRequest(${id})"]`);
            const rejectBtn = document.querySelector(`button[onclick="ui.rejectRequest(${id})"]`);

            if (rejectBtn) {
                rejectBtn.dataset.originalText = rejectBtn.innerHTML;
                rejectBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Mail Gönderiliyor...';
                rejectBtn.disabled = true;
            }
            if (approveBtn) approveBtn.disabled = true;

            try {
                const response = await api.post(`/api/admin/requests/reject`, { requestId: id, rejectionReason: reason });

                Swal.fire({ title: response.title, text: response.message, icon: 'success' });
                ui.switchView('requests');
            } catch (e) {
                Swal.fire({ title: e.title, text: e.message, icon: 'warning' });

                if (rejectBtn) {
                    rejectBtn.innerHTML = rejectBtn.dataset.originalText;
                    rejectBtn.disabled = false;
                }
                if (approveBtn) approveBtn.disabled = false;
            }
        },
        deleteUser: async (id) => {
            const result = await Swal.fire({
                text: "Kullanıcı silinsin mi?",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Evet, Sil!',
                cancelButtonText: 'İptal'
            });

            if (result.isConfirmed) {
                try {
                    const response = await api.del(`/api/Admin/users/${id}`);
                    Swal.fire({ title: response.title, text: response.message, icon: 'success' });
                    ui.switchView('users');
                } catch (e) { Swal.fire({ title: e.title, text: e.message, icon: 'warning' }); }
            }
        },

        // --- 1. KAYIT İSTEKLERİ RENDER & SAYFALAMA ---
        renderRequestsTable: () => {
            const tbody = document.getElementById('reqTbody'); if (!tbody) return;
            const state = pgState.requests;
            const start = (state.page - 1) * ITEMS_PER_PAGE;
            const paginated = state.data.slice(start, start + ITEMS_PER_PAGE);

            let rows = paginated.map(r => `
                <tr>
                    <td class="fw-bold">${r.username}</td>
                    <td>
                        <select id="reqRole_${r.id}" class="form-select form-select-sm small-select" style="max-width: 150px; background:var(--bg-input); color:var(--text-input); border-color:var(--border-input);">
                            ${state.roles.map(x => `<option value="${x.id}" ${x.name === 'Görüntüleyici' ? 'selected' : ''}>${x.name}</option>`).join("")}
                        </select>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="ui.approveRequest(${r.id})">Onayla</button>
                        <button class="btn btn-sm btn-danger ms-1" onclick="ui.rejectRequest(${r.id})">Reddet</button>
                    </td>
                </tr>`).join("");

            tbody.innerHTML = rows || '<tr><td colspan="3" class="text-center text-muted py-4">Bekleyen kayıt talebi yok.</td></tr>';
            renderPagination('reqPg', state.page, state.data.length, ITEMS_PER_PAGE, 'ui.changeReqPage');
        },
        changeReqPage: (p) => { pgState.requests.page = p; ui.renderRequestsTable(); },

        // --- 2. KULLANICILAR RENDER & SAYFALAMA ---
        renderUsersTable: () => {
            const tbody = document.getElementById('usersTbody'); if (!tbody) return;
            const state = pgState.users;
            const start = (state.page - 1) * ITEMS_PER_PAGE;
            const paginated = state.data.slice(start, start + ITEMS_PER_PAGE);

            let rows = paginated.map(u => {
                const roleBadges = u.roles.map(r => `<span class="badge bg-secondary me-1">${r}</span>`).join('');
                const isAdmin = u.roles.includes(window.APP_CONFIG.ADMIN_ROLE_NAME);

                let actionButtons = '';

                if (window.auth.hasPermission('User.ManageRoles')) {
                    actionButtons += `<button class="btn btn-outline-primary btn-sm" onclick="ui.openUserRolesModal(${u.id}, '${u.username}')" title="Roller"><i class="bi bi-shield-check"></i> Roller</button> `;
                }

                if (window.auth.hasPermission('User.ManageComputers')) {
                    actionButtons += `<button class="btn btn-outline-success btn-sm" onclick="ui.openUserComputerAccessModal(${u.id}, '${u.username}')" title="Cihazlar"><i class="bi bi-pc-display"></i> Cihazlar</button> `;
                }

                if (window.auth.hasPermission('User.ManageTags')) {
                    actionButtons += `<button class="btn btn-outline-warning btn-sm" onclick="ui.openUserTagAccessModal(${u.id}, '${u.username}')" title="Etiketler"><i class="bi bi-tags"></i> Etiketler</button> `;
                }

                if (window.auth.hasRole('Yönetici') && window.auth.hasPermission('User.ManageRoles')) {
                    if (isAdmin) {
                        actionButtons += `<span class="btn btn-sm disabled opacity-25" title="Yönetici Silinemez"><i class="bi bi-shield-lock-fill"></i></span> `;
                    } else {
                        actionButtons += `<button class="btn btn-outline-danger btn-sm" onclick="ui.deleteUser(${u.id})" title="Sil"><i class="bi bi-trash"></i></button> `;
                    }
                }

                if (actionButtons === '') {
                    actionButtons = `<span class="text-muted small fst-italic">İşlem Yetkisi Yok</span>`;
                }

                return `<tr>
    <td class="fw-bold" style="color:#38bdf8;">${u.username}</td>
    <td>${roleBadges || '<span class="text-muted small fst-italic">Rol Atanmamış</span>'}</td>
    <td class="text-end">
        <div class="d-flex justify-content-end gap-1 flex-wrap">
            ${actionButtons}
        </div>
    </td>
</tr>`;
            }).join("");

            tbody.innerHTML = rows || '<tr><td colspan="3" class="text-center text-muted py-4">Listelenecek başka kullanıcı bulunamadı.</td></tr>';
            renderPagination('usersPg', state.page, state.data.length, ITEMS_PER_PAGE, 'ui.changeUsersPage');
        },
        changeUsersPage: (p) => { pgState.users.page = p; ui.renderUsersTable(); },

        // --- 3. ROLLER VE YETKİLER RENDER & SAYFALAMA ---
        renderRolesTable: () => {
            const tbody = document.getElementById('rolesTbody'); if (!tbody) return;
            const state = pgState.roles;
            const start = (state.page - 1) * ITEMS_PER_PAGE;
            const paginated = state.data.slice(start, start + ITEMS_PER_PAGE);

            const canManageRoles = window.auth.hasPermission('Role.Manage');

            let rows = paginated.map(r => `<tr>
                    <td class="fw-bold" style="color:var(--text-main);"><i class="bi bi-shield-fill text-warning me-2"></i> ${r.name}</td>
                    <td class="text-end">
                        <button class="btn btn-primary btn-sm me-1" onclick="ui.openRolePermissionsModal(${r.id}, '${r.name}')"><i class="bi bi-list-check"></i> Yetkileri Düzenle</button>
                        ${canManageRoles ? `<button class="btn btn-outline-danger btn-sm" onclick="ui.deleteRole(${r.id}, '${r.name}')"><i class="bi bi-trash"></i> Sil</button>` : ''}
                    </td>
                </tr>`).join("");

            tbody.innerHTML = rows || '<tr><td colspan="2" class="text-center text-muted py-4">Sistemde rol bulunamadı.</td></tr>';
            renderPagination('rolesPg', state.page, state.data.length, ITEMS_PER_PAGE, 'ui.changeRolesPage');
        },
        changeRolesPage: (p) => { pgState.roles.page = p; ui.renderRolesTable(); },

        // --- ETİKETLER ANA TABLO ---
        loadTagTable: async () => {
            try {
                const tags = await api.get("/api/Admin/tags");
                const selectedFilters = $('#tagSelect').val() || [];
                pgState.tags.data = selectedFilters.length > 0
                    ? tags.filter(t => selectedFilters.includes(t.name))
                    : tags;
                pgState.tags.page = 1;
                ui.renderTagsTable();
            } catch (e) { console.error(e); }
        },
        renderTagsTable: () => {
            const tbody = document.getElementById("tagTableBody"); if (!tbody) return;
            const state = pgState.tags;
            const start = (state.page - 1) * ITEMS_PER_PAGE;
            const paginated = state.data.slice(start, start + ITEMS_PER_PAGE);

            tbody.innerHTML = paginated.map(t => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td class="align-middle fw-bold">${t.name}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-info me-2" onclick="ui.openAssignModal(${t.id}, '${t.name}')">
                            <i class="bi bi-pc-display"></i> Cihaza Ata
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="ui.deleteTag(${t.id})">
                            <i class="bi bi-trash"></i> Sil
                        </button>
                    </td>
                </tr>`).join('');

            if (state.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-4">Aranan kriterlere uygun etiket bulunamadı.</td></tr>';
            }
            renderPagination('tagsPg', state.page, state.data.length, ITEMS_PER_PAGE, 'ui.changeTagsPage');
        },
        changeTagsPage: (p) => { pgState.tags.page = p; ui.renderTagsTable(); },

        createNewTag: async () => {
            const nameInput = document.getElementById("newTagName");
            const name = nameInput.value.trim();

            try {
                const response = await api.post("/api/Admin/tags", { name });
                nameInput.value = "";
                await switchView('tags');
                if (window.loadFilterTags) window.loadFilterTags();
                Swal.fire({ title: response.title, text: response.message, icon: 'success', timer: 1500, showConfirmButton: false });
            } catch (e) {
                Swal.fire({ title: e.title, text: e.message, icon: 'warning' });
            }
        },
        deleteTag: async (id) => {
            const result = await Swal.fire({
                text: "Etiket silinecektir.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'Sil',
                cancelButtonText: 'İptal'
            });

            if (result.isConfirmed) {
                try {
                    const response = await api.del(`/api/Admin/tags/${id}`);
                    ui.switchView('tags');
                    if (window.loadFilterTags) window.loadFilterTags();
                    Swal.fire({ title: response.title, text: response.message, icon: 'success' });
                } catch (e) { Swal.fire({ title: e.title, text: e.message, icon: 'warning' }); }
            }
        },

        // --- ETİKET ATA MODALI ---
        openAssignModal: async (tagId, tagName) => {
            document.getElementById("assignTagId").value = tagId;

            const searchInput = document.getElementById("tagAssignSearchInput");
            if (searchInput) searchInput.value = "";

            const listContainer = document.getElementById("assignComputerList");
            listContainer.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>';
            document.getElementById('tagAssignPg').innerHTML = '';

            new bootstrap.Modal(document.getElementById("tagAssignModal")).show();

            try {
                const [allComputers, assignedIds] = await Promise.all([
                    api.get("/api/Admin/computers/all"),
                    api.get(`/api/Admin/tags/${tagId}/assigned-computer-ids`)
                ]);
                const activeComputers = allComputers.filter(c => !c.isDeleted);
                pgState.tagAssign.data = activeComputers;
                pgState.tagAssign.filtered = activeComputers;
                pgState.tagAssign.assignedIds = assignedIds;
                pgState.tagAssign.page = 1;
                ui.renderTagAssignList();
            } catch (e) { listContainer.innerHTML = '<div class="text-danger p-3 text-center">Cihazlar yüklenirken bir hata oluştu.</div>'; }
        },
        renderTagAssignList: () => {
            const listContainer = document.getElementById("assignComputerList"); if (!listContainer) return;
            const state = pgState.tagAssign;
            const start = (state.page - 1) * MODAL_ITEMS_PER_PAGE;

            const paginated = state.filtered.slice(start, start + MODAL_ITEMS_PER_PAGE);

            if (state.filtered.length === 0) {
                listContainer.innerHTML = '<div class="text-center p-3 text-muted">Aramaya uygun aktif cihaz bulunamadı.</div>';
                document.getElementById('tagAssignPg').innerHTML = '';
                return;
            }

            listContainer.innerHTML = paginated.map(c => `
                <label class="list-group-item d-flex justify-content-between align-items-center" style="background:transparent; color:var(--text-main); border-color:var(--border-color); cursor:pointer;">
                    <div class="d-flex align-items-center overflow-hidden me-3" style="flex: 1;">
                        <input class="form-check-input me-2 comp-check flex-shrink-0" type="checkbox" value="${c.id}" ${state.assignedIds.includes(c.id) ? 'checked' : ''} onchange="ui.toggleTagAssign(${c.id}, this.checked)">
                        <span class="fw-bold text-truncate" title="${c.displayName || c.machineName}">${c.displayName || c.machineName}</span>
                    </div>
                    <small class="text-muted flex-shrink-0" style="font-family:monospace;">${c.ipAddress || 'IP Yok'}</small>
                </label>`).join('');

            renderPagination('tagAssignPg', state.page, state.filtered.length, MODAL_ITEMS_PER_PAGE, 'ui.changeTagAssignPage');
        },
        changeTagAssignPage: (p) => { pgState.tagAssign.page = p; ui.renderTagAssignList(); },
        toggleTagAssign: (id, isChecked) => {
            if (isChecked) pgState.tagAssign.assignedIds.push(id);
            else pgState.tagAssign.assignedIds = pgState.tagAssign.assignedIds.filter(x => x !== id);
        },
        saveTagAssignments: async () => {
            const tagId = document.getElementById("assignTagId").value;
            try {
                const response = await api.post(`/api/Admin/tags/${tagId}/assign-computers`, { computerIds: pgState.tagAssign.assignedIds });
                bootstrap.Modal.getInstance(document.getElementById("tagAssignModal")).hide();
                Swal.fire({ title: response.title, text: response.message, icon: 'success', timer: 1500, showConfirmButton: false });
            } catch (e) { Swal.fire({ title: e.title, text: e.message, icon: 'warning' }); }
        },

        // --- ROL YETKİLERİ MODALI ---
        openRolePermissionsModal: async (roleId, roleName) => {
            document.getElementById('editRoleIdInput').value = roleId;
            document.getElementById('modalRoleNameText').innerText = roleName;
            const container = document.getElementById('permissionsCheckboxContainer');
            container.innerHTML = '<div class="text-center py-4 w-100"><div class="spinner-border text-info"></div></div>';

            let pgDiv = document.getElementById('rolePermPg');
            if (!pgDiv) { pgDiv = document.createElement('div'); pgDiv.id = 'rolePermPg'; pgDiv.className = 'mt-3 w-100'; container.parentNode.appendChild(pgDiv); }
            else { pgDiv.innerHTML = ''; }

            new bootstrap.Modal(document.getElementById('rolePermissionsModal')).show();

            try {
                const [allPerms, rolePerms] = await Promise.all([
                    api.get('/api/Admin/permissions'),
                    api.get(`/api/Admin/roles/${roleId}/permissions`)
                ]);
                pgState.rolePerm.data = allPerms;
                pgState.rolePerm.assignedIds = rolePerms;
                pgState.rolePerm.page = 1;
                ui.renderRolePermList();
            } catch (e) { container.innerHTML = `<div class="text-danger w-100 px-3">${e.message}</div>`; }
        },
        renderRolePermList: () => {
            const container = document.getElementById('permissionsCheckboxContainer'); if (!container) return;
            const state = pgState.rolePerm;
            const start = (state.page - 1) * MODAL_ITEMS_PER_PAGE;
            const paginated = state.data.slice(start, start + MODAL_ITEMS_PER_PAGE);

            container.innerHTML = paginated.map(p => `
                <div class="col-12">
                    <label class="permission-card d-flex align-items-center w-100 py-2" for="perm_${p.id}">
                        <input class="form-check-input custom-toggle m-0 me-3 flex-shrink-0" type="checkbox" id="perm_${p.id}" value="${p.id}" ${state.assignedIds.includes(p.id) ? 'checked' : ''} onchange="ui.toggleRolePerm(${p.id}, this.checked)">
                        <div class="flex-grow-1" style="min-width: 0;">
                            <div class="fw-bold" style="color:var(--text-title); font-size:0.9rem; white-space: normal; word-break: normal;">${p.description || p.name}</div>
                        </div>
                    </label>
                </div>`).join('');
            renderPagination('rolePermPg', state.page, state.data.length, MODAL_ITEMS_PER_PAGE, 'ui.changeRolePermPage');
        },
        changeRolePermPage: (p) => { pgState.rolePerm.page = p; ui.renderRolePermList(); },
        toggleRolePerm: (id, isChecked) => {
            if (isChecked) pgState.rolePerm.assignedIds.push(id);
            else pgState.rolePerm.assignedIds = pgState.rolePerm.assignedIds.filter(x => x !== id);
        },
        saveRolePermissions: async () => {
            const roleId = document.getElementById('editRoleIdInput').value;
            try {
                const response = await api.post(`/api/Admin/roles/${roleId}/permissions`, { permissionIds: pgState.rolePerm.assignedIds });
                bootstrap.Modal.getInstance(document.getElementById('rolePermissionsModal')).hide();
                Swal.fire({ title: response.title, text: response.message, icon: 'success' });
            } catch (e) { Swal.fire({ title: e.title, text: e.message, icon: 'warning' }); }
        },

        // --- KULLANICI ROLLERİ MODALI ---
        openUserRolesModal: async (userId, username) => {
            document.getElementById('editUserRole_UserId').value = userId;
            document.getElementById('roleModalUserName').innerText = username;
            const container = document.getElementById('userRolesCheckboxContainer');
            container.innerHTML = '<div class="text-center"><div class="spinner-border text-info"></div></div>';

            let pgDiv = document.getElementById('userRolesPg');
            if (!pgDiv) { pgDiv = document.createElement('div'); pgDiv.id = 'userRolesPg'; pgDiv.className = 'mt-3'; container.parentNode.appendChild(pgDiv); }
            else { pgDiv.innerHTML = ''; }

            new bootstrap.Modal(document.getElementById('userRolesModal')).show();

            try {
                const [users, allRoles] = await Promise.all([api.get('/api/Admin/users'), api.get('/api/Admin/roles')]);
                const user = users.find(u => u.id === userId);
                const assignableRoles = allRoles;

                pgState.userRoles.data = assignableRoles;
                pgState.userRoles.assignedIds = assignableRoles.filter(r => user && user.roles.includes(r.name)).map(r => r.id);
                pgState.userRoles.page = 1;
                ui.renderUserRolesList();
            } catch (e) { container.innerHTML = `<div class="text-danger">${e.message}</div>`; }
        },
        renderUserRolesList: () => {
            const container = document.getElementById('userRolesCheckboxContainer'); if (!container) return;
            const state = pgState.userRoles;
            const start = (state.page - 1) * MODAL_ITEMS_PER_PAGE;

            container.innerHTML = state.data.slice(start, start + MODAL_ITEMS_PER_PAGE).map(r => `
                <label class="permission-card d-flex align-items-center w-100" for="urole_${r.id}">
                    <input class="form-check-input custom-toggle m-0 me-3" type="checkbox" id="urole_${r.id}" value="${r.id}" ${state.assignedIds.includes(r.id) ? 'checked' : ''} onchange="ui.toggleUserRole(${r.id}, this.checked)">
                    <div class="fw-bold" style="color:var(--text-title);">${r.name}</div>
                </label>`).join('');
            renderPagination('userRolesPg', state.page, state.data.length, MODAL_ITEMS_PER_PAGE, 'ui.changeUserRolesPage');
        },
        changeUserRolesPage: (p) => { pgState.userRoles.page = p; ui.renderUserRolesList(); },
        toggleUserRole: (id, isChecked) => {
            if (isChecked) pgState.userRoles.assignedIds.push(id);
            else pgState.userRoles.assignedIds = pgState.userRoles.assignedIds.filter(x => x !== id);
        },
        saveUserRoles: async () => {
            const userId = parseInt(document.getElementById('editUserRole_UserId').value);
            const selectedRoleIds = pgState.userRoles.assignedIds;

            try {
                // Hiçbir kontrol yapmadan direkt Backend'e gönder!
                const response = await api.put(`/api/Admin/users/${userId}/change-roles`, { newRoleIds: selectedRoleIds });

                bootstrap.Modal.getInstance(document.getElementById('userRolesModal')).hide();
                ui.switchView('users');
                Swal.fire({ title: response.title, text: response.message, icon: 'success' });
            } catch (e) {
                // Eğer son yöneticiyse, Backend'den gelen "Sistemde kalan son..." uyarısı burada patlayacak.
                Swal.fire({ title: e.title, text: e.message, icon: 'warning' });
            }
        },

        // --- KULLANICI CİHAZ ERİŞİMİ MODALI ---
        openUserComputerAccessModal: async (userId, username) => {
            document.getElementById('accessModal_UserId').value = userId;
            document.getElementById('computerAccessUserName').innerText = username;
            document.getElementById('computerSearchInput').value = "";
            const container = document.getElementById('userComputerCheckboxContainer');
            container.innerHTML = '<div class="text-center py-4 w-100"><div class="spinner-border text-info"></div></div>';

            let pgDiv = document.getElementById('userCompPg');
            if (!pgDiv) { pgDiv = document.createElement('div'); pgDiv.id = 'userCompPg'; pgDiv.className = 'mt-3 w-100'; container.parentNode.appendChild(pgDiv); }
            else { pgDiv.innerHTML = ''; }

            new bootstrap.Modal(document.getElementById('userComputerAccessModal')).show();

            try {
                const [allComputers, accessInfo] = await Promise.all([
                    api.get('/api/Admin/computers/all'),
                    api.get(`/api/Admin/users/${userId}/access`)
                ]);

                pgState.userComp.data = allComputers;
                pgState.userComp.filtered = allComputers;
                pgState.userComp.assignedIds = accessInfo.computerIds;
                pgState.userComp.page = 1;
                ui.renderUserCompList();
            } catch (e) { container.innerHTML = `<div class="text-danger w-100 px-3">${e.message}</div>`; }
        },
        filterComputerCheckboxes: () => {
            const input = document.getElementById('computerSearchInput').value.toLowerCase();
            pgState.userComp.filtered = pgState.userComp.data.filter(c =>
                ((c.displayName || c.machineName) + " " + (c.ipAddress || "")).toLowerCase().includes(input)
            );
            pgState.userComp.page = 1;
            ui.renderUserCompList();
        },
        renderUserCompList: () => {
            const container = document.getElementById('userComputerCheckboxContainer'); if (!container) return;
            const state = pgState.userComp;
            const start = (state.page - 1) * MODAL_ITEMS_PER_PAGE;
            const now = new Date().getTime();

            container.innerHTML = state.filtered.slice(start, start + MODAL_ITEMS_PER_PAGE).map(c => {
                const lastSeenTime = new Date(c.lastSeen).getTime();
                const isOnline = (now - lastSeenTime) <= 150000;

                let statusHtml = c.isDeleted ? `<span class="badge bg-danger ms-2" style="font-size:0.65rem;">Silinmiş</span>` :
                    (isOnline ? `<span class="badge bg-success ms-2" style="font-size:0.65rem;">Aktif</span>` :
                        `<span class="badge bg-secondary ms-2" style="font-size:0.65rem;">Pasif</span>`);

                return `<div class="col-md-6 computer-access-item">
                    <label class="permission-card d-flex align-items-center w-100" for="ucomp_${c.id}" style="${c.isDeleted ? 'opacity:0.6;' : ''}">
                        <input class="form-check-input custom-toggle m-0 me-3" type="checkbox" id="ucomp_${c.id}" value="${c.id}" ${state.assignedIds.includes(c.id) ? 'checked' : ''} onchange="ui.toggleUserComp(${c.id}, this.checked)">
                        <div>
                            <div class="fw-bold" style="color:var(--text-title); font-size:0.9rem;">${c.displayName || c.machineName} ${statusHtml}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${c.ipAddress || '-'}</div>
                        </div>
                    </label>
                </div>`;
            }).join('');
            renderPagination('userCompPg', state.page, state.filtered.length, MODAL_ITEMS_PER_PAGE, 'ui.changeUserCompPage');
        },
        changeUserCompPage: (p) => { pgState.userComp.page = p; ui.renderUserCompList(); },
        toggleUserComp: (id, isChecked) => {
            if (isChecked) pgState.userComp.assignedIds.push(id);
            else pgState.userComp.assignedIds = pgState.userComp.assignedIds.filter(x => x !== id);
        },
        saveUserComputerAccess: async () => {
            const userId = document.getElementById('accessModal_UserId').value;
            try {
                const response = await api.post(`/api/Admin/users/${userId}/assign-computers`, { computerIds: pgState.userComp.assignedIds });
                bootstrap.Modal.getInstance(document.getElementById('userComputerAccessModal')).hide();
                Swal.fire({ title: response.title, text: response.message, icon: 'success', timer: 1500, showConfirmButton: false });
            } catch (e) { Swal.fire({ title: e.title, text: e.message, icon: 'warning' }); }
        },

        // --- KULLANICI ETİKET ERİŞİMİ MODALI ---
        openUserTagAccessModal: async (userId, username) => {
            document.getElementById('tagAccessModal_UserId').value = userId;
            document.getElementById('tagAccessUserName').innerText = username;
            const container = document.getElementById('userTagCheckboxContainer');
            container.innerHTML = '<div class="text-center py-4 w-100"><div class="spinner-border text-info"></div></div>';

            let pgDiv = document.getElementById('userTagPg');
            if (!pgDiv) { pgDiv = document.createElement('div'); pgDiv.id = 'userTagPg'; pgDiv.className = 'mt-3 w-100'; container.parentNode.appendChild(pgDiv); }
            else { pgDiv.innerHTML = ''; }

            new bootstrap.Modal(document.getElementById('userTagAccessModal')).show();

            try {
                const [allTags, accessInfo] = await Promise.all([
                    api.get('/api/Admin/tags'),
                    api.get(`/api/Admin/users/${userId}/access`)
                ]);

                pgState.userTag.data = allTags;
                pgState.userTag.assignedIds = accessInfo.tagIds;
                pgState.userTag.page = 1;
                ui.renderUserTagList();
            } catch (e) { container.innerHTML = `<div class="text-danger w-100 px-3">${e.message}</div>`; }
        },
        renderUserTagList: () => {
            const container = document.getElementById('userTagCheckboxContainer'); if (!container) return;
            const state = pgState.userTag;
            const start = (state.page - 1) * MODAL_ITEMS_PER_PAGE;

            if (state.data.length === 0) {
                container.innerHTML = `<span class="text-muted small">Sistemde hiç etiket bulunamadı. Önce etiket oluşturun.</span>`;
                document.getElementById('userTagPg').innerHTML = '';
                return;
            }

            container.innerHTML = state.data.slice(start, start + MODAL_ITEMS_PER_PAGE).map(t => `
                <label class="permission-card d-flex align-items-center flex-grow-1" for="utag_${t.id}" style="min-width: 150px;">
                    <input class="form-check-input custom-toggle m-0 me-2" type="checkbox" id="utag_${t.id}" value="${t.id}" ${state.assignedIds.includes(t.id) ? 'checked' : ''} onchange="ui.toggleUserTag(${t.id}, this.checked)">
                    <div class="fw-bold" style="color:var(--text-title);"><i class="bi bi-tag-fill text-secondary me-1"></i> ${t.name}</div>
                </label>`).join('');
            renderPagination('userTagPg', state.page, state.data.length, MODAL_ITEMS_PER_PAGE, 'ui.changeUserTagPage');
        },
        changeUserTagPage: (p) => { pgState.userTag.page = p; ui.renderUserTagList(); },
        toggleUserTag: (id, isChecked) => {
            if (isChecked) pgState.userTag.assignedIds.push(id);
            else pgState.userTag.assignedIds = pgState.userTag.assignedIds.filter(x => x !== id);
        },
        saveUserTagAccess: async () => {
            const userId = document.getElementById('tagAccessModal_UserId').value;
            try {
                const response = await api.post(`/api/Admin/users/${userId}/assign-tags`, { tagIds: pgState.userTag.assignedIds });
                bootstrap.Modal.getInstance(document.getElementById('userTagAccessModal')).hide();
                if (window.loadFilterTags) window.loadFilterTags();
                Swal.fire({ title: response.title, text: response.message, icon: 'success', timer: 1500, showConfirmButton: false });
            } catch (e) { Swal.fire({ title: e.title, text: e.message, icon: 'warning' }); }
        },
        filterTagAssignComputers: () => {
            const input = document.getElementById('tagAssignSearchInput').value.toLowerCase();
            pgState.tagAssign.filtered = pgState.tagAssign.data.filter(c =>
                ((c.displayName || c.machineName) + " " + (c.ipAddress || "")).toLowerCase().includes(input)
            );
            pgState.tagAssign.page = 1;
            ui.renderTagAssignList();
        },
        // --- YENİ ROL EKLEME FONKSİYONLARI ---
        openCreateRoleModal: async () => {
            document.getElementById('newRoleNameInput').value = '';
            const permsContainer = document.getElementById('newRolePermsContainer');
            permsContainer.innerHTML = '<div class="text-center w-100 py-3"><div class="spinner-border text-info spinner-border-sm"></div></div>';

            let pgDiv = document.getElementById('newRolePermPg');
            if (!pgDiv) {
                pgDiv = document.createElement('div');
                pgDiv.id = 'newRolePermPg';
                pgDiv.className = 'mt-3 w-100';
                permsContainer.parentNode.appendChild(pgDiv);
            } else {
                pgDiv.innerHTML = '';
            }

            new bootstrap.Modal(document.getElementById('createRoleModal')).show();

            try {
                const allPerms = await api.get('/api/Admin/permissions');
                pgState.newRolePerm.data = allPerms;
                pgState.newRolePerm.assignedIds = [];
                pgState.newRolePerm.page = 1;
                ui.renderNewRolePermList();
            } catch (e) {
                permsContainer.innerHTML = `<div class="text-danger small px-2">Yetkiler yüklenemedi: ${e.message}</div>`;
            }
        },

        saveNewRole: async () => {
            const roleName = document.getElementById('newRoleNameInput').value.trim();
            const selectedPerms = pgState.newRolePerm.assignedIds;

            try {
                const response = await api.post('/api/Admin/roles', { name: roleName, permissionIds: selectedPerms });
                bootstrap.Modal.getInstance(document.getElementById('createRoleModal')).hide();
                Swal.fire({ title: response.title, text: response.message, icon: 'success' });
                ui.switchView('roles');
            } catch (e) {
                Swal.fire({ title: e.title, text: e.message, icon: 'warning' });
            }
        },
        deleteRole: async (id, name) => {
            const result = await Swal.fire({
                text: `'${name}' rolünü silmek istediğinize emin misiniz?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'Evet, Sil!',
                cancelButtonText: 'İptal'
            });

            if (!result.isConfirmed) return;

            try {
                const response = await api.del(`/api/Admin/roles/${id}`);
                Swal.fire({ title: response.title, text: response.message, icon: 'success' });
                ui.switchView('roles');
            } catch (e) {
                Swal.fire({ title: e.title, text: e.message, icon: 'warning' });
            }
        },
        renderNewRolePermList: () => {
            const container = document.getElementById('newRolePermsContainer');
            if (!container) return;

            const ITEMS_FOR_THIS_MODAL = 5;

            const state = pgState.newRolePerm;
            const start = (state.page - 1) * ITEMS_FOR_THIS_MODAL;
            const paginated = state.data.slice(start, start + ITEMS_FOR_THIS_MODAL);

            container.innerHTML = paginated.map(p => `
<div class="col-12">
    <label class="permission-card d-flex align-items-center w-100 py-2" for="new_perm_${p.id}" style="cursor:pointer;">
        <input class="form-check-input custom-toggle new-role-perm-cb m-0 me-3 flex-shrink-0" 
               type="checkbox" id="new_perm_${p.id}" value="${p.id}" 
               ${state.assignedIds.includes(p.id) ? 'checked' : ''} 
               onchange="ui.toggleNewRolePerm(${p.id}, this.checked)">
        <div class="flex-grow-1" style="min-width: 0;">
            <div class="fw-bold" style="color:var(--text-title); font-size:0.9rem;">${p.description || p.name}</div>
        </div>
    </label>
</div>`).join('');

            renderPagination('newRolePermPg', state.page, state.data.length, ITEMS_FOR_THIS_MODAL, 'ui.changeNewRolePermPage');
        },

        changeNewRolePermPage: (p) => {
            pgState.newRolePerm.page = p;
            ui.renderNewRolePermList();
        },

        toggleNewRolePerm: (id, isChecked) => {
            if (isChecked) {
                if (!pgState.newRolePerm.assignedIds.includes(id)) pgState.newRolePerm.assignedIds.push(id);
            } else {
                pgState.newRolePerm.assignedIds = pgState.newRolePerm.assignedIds.filter(x => x !== id);
            }
        },

        loadHistoryComputers: async () => {
            const selectEl = document.getElementById('historyPageComputerSelect');
            if (!selectEl) return;

            try {
                // HATA BURADAYDI: Admin endpoint'i yerine standart ve güvenli endpoint'i kullanıyoruz.
                // Bu sayede kullanıcı sadece kendi yetkisi olan (görebildiği) cihazları listede görecek.
                const computers = await api.get('/api/Computer');
                const activeComputers = computers.filter(c => !c.isDeleted);

                let optionsHtml = '<option value="">-- Cihaz Seçiniz --</option>';
                activeComputers.forEach(c => {
                    optionsHtml += `<option value="${c.id}">${c.displayName || c.machineName}</option>`;
                });

                selectEl.innerHTML = optionsHtml;
            } catch (e) {
                // Eğer hata olursa konsola yazdırsın ama sistemi patlatıp logout atmasın
                console.warn("Cihazlar yüklenirken bir hata oluştu:", e);
                selectEl.innerHTML = '<option value="">Cihazlar yüklenemedi</option>';
            }
        },

        showReportDetails: async (computerId, computerName, metricType, diskName = null) => {
            document.getElementById('rdm-computer-name').innerText = computerName;
            document.getElementById('rdm-metric-type').innerText = metricType;

            document.getElementById('rdm-loading').style.display = 'block';
            document.getElementById('rdm-content').style.display = 'none';
            document.getElementById('rdm-loading').innerHTML = '<div class="spinner-border text-info" role="status"></div><div class="mt-2 text-muted small">Performanslı veritabanı analizi yapılıyor...</div>';

            const modal = new bootstrap.Modal(document.getElementById('reportDetailModal'));
            modal.show();

            try {
                // 1. Genel özet istatistiklerini çek
                let apiUrl = `/api/Computer/${computerId}/metrics-summary?metricType=${metricType}`;
                if (diskName) apiUrl += `&diskName=${encodeURIComponent(diskName)}`;

                const summary = await window.api.get(apiUrl);

                if (summary.totalCount === 0) {
                    document.getElementById('rdm-loading').innerHTML = '<div class="text-warning"><i class="bi bi-exclamation-triangle fs-4 d-block mb-2"></i> Bu cihaz için hiç veri bulunamadı.</div>';
                    return;
                }

                document.getElementById('rdm-total-count').innerText = summary.totalCount + " Adet";
                document.getElementById('rdm-max-val').innerText = `%${Math.round(summary.maxVal)}`;
                document.getElementById('rdm-min-val').innerText = `%${Math.round(summary.minVal)}`;
                document.getElementById('rdm-max-count').innerText = `${summary.maxCount} Kez`;
                document.getElementById('rdm-min-count').innerText = `${summary.minCount} Kez`;

                document.getElementById('rdm-loading').style.display = 'none';
                document.getElementById('rdm-content').style.display = 'block';

                // 2. YENİ: Trend Analizi için Son 5 veri gününün verilerini çek ve modal içine yerleştir
                let trendContainer = document.getElementById('rdm-trend-analysis');
                if (!trendContainer) {
                    trendContainer = document.createElement('div');
                    trendContainer.id = 'rdm-trend-analysis';
                    document.getElementById('rdm-content').appendChild(trendContainer);
                }

                // HATA BURADAYDI: ÇÖZÜM İÇİN IF KONTROLÜ EKLENDİ
                if (metricType === 'CPU') {
                    // Eğer CPU ise hiç Backend'e istek atma, doğrudan sonucu yazdır
                    trendContainer.innerHTML = window.ui.calculateReportTrend([], 'CPU');
                } else {
                    // RAM veya Disk ise yükleniyor animasyonu göster ve veritabanından çek
                    trendContainer.innerHTML = '<div class="text-center mt-4"><div class="spinner-border spinner-border-sm text-secondary"></div><small class="ms-2 text-muted">Son 5 veri günü baz alınarak trend analizi yapılıyor...</small></div>';

                    let trendApiUrl = `/api/Computer/${computerId}/metrics-trend?metricType=${metricType}`;
                    if (diskName) trendApiUrl += `&diskName=${encodeURIComponent(diskName)}`;

                    const trendData = await window.api.get(trendApiUrl);
                    trendContainer.innerHTML = window.ui.calculateReportTrend(trendData, metricType);
                }

            } catch (error) {
                console.error("Metrik detayları çekilirken hata:", error);
                document.getElementById('rdm-loading').innerHTML = `<div class="text-danger"><i class="bi bi-x-circle fs-4 d-block mb-2"></i> Veriler alınamadı: <br><small>${error.message}</small></div>`;
            }
        },

        // Modal içine eklenecek, veriyi 5'e bölüp hesaplayan trend algoritması
        calculateReportTrend: (dataList, metricType, isHistory = false) => {
            // 1. CPU İÇİN ÖZEL MANTIK
            if (metricType === 'CPU') {
                return `
            <div class="mt-4 p-3 border rounded shadow-sm d-flex align-items-center border-secondary" style="background: rgba(108, 117, 125, 0.1);">
                <i class="bi bi-cpu text-secondary fs-3 me-3"></i>
                <div>
                    <h6 class="mb-1 fw-bold" style="color: var(--text-title); font-size: 0.85rem;">CPU Kullanım Eğilimi</h6>
                    <small style="color: var(--text-muted);">CPU anlık bir işlem birimidir, depolama alanı gibi "dolum" tahmini yapılamaz. Bunun yerine cihazın genel zorlanma seviyesi anlık olarak izlenmelidir.</small>
                </div>
            </div>`;
            }

            // 2. YETERLİ VERİ KONTROLÜ (En az 15 Ham Veri)
            if (!dataList || dataList.length < 15) {
                return `
            <div class="mt-4 p-3 border rounded shadow-sm d-flex align-items-center border-secondary" style="background: rgba(108, 117, 125, 0.1);">
                <i class="bi bi-hourglass text-secondary fs-3 me-3"></i>
                <div>
                    <h6 class="mb-1 fw-bold" style="color: var(--text-title); font-size: 0.85rem;">Tahmini Dolum Analizi</h6>
                    <small style="color: var(--text-muted);">Bilimsel bir trend tahmini yapabilmek için en az 15 metrik ölçümüne ihtiyaç var. Mevcut ölçüm sayısı: ${dataList ? dataList.length : 0}</small>
                </div>
            </div>`;
            }

            // 3. DOĞRUSAL REGRESYON (En Küçük Kareler - OLS)
            // Filtre veya ortalama yok! Tüm ham veri (anlık sıçramalar/indirmeler dahil) formüle giriyor.
            let n = dataList.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

            // Verilerin zamana göre sıralı olduğundan emin olalım
            let sortedData = [...dataList].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            let startTime = new Date(sortedData[0].createdAt).getTime();

            sortedData.forEach(p => {
                let x = (new Date(p.createdAt).getTime() - startTime) / 1000; // Saniye cinsinden X ekseni
                let y = p.value; // Yüzde cinsinden Y ekseni
                sumX += x;
                sumY += y;
                sumXY += x * y;
                sumXX += x * x;
            });

            let denominator = (n * sumXX) - (sumX * sumX);
            let slope = denominator !== 0 ? ((n * sumXY) - (sumX * sumY)) / denominator : 0;

            // 4. TAHMİNLEME VE ARAYÜZ YAZDIRMA
            let titleText = isHistory ? "Bilimsel Dolum Tahmini (Seçili Tarih Aralığı)" : "Bilimsel Dolum Tahmini (Son 5 Gün)";
            let predictionPrefix = isHistory ? "Seçilen tarih aralığındaki gerçek trende göre" : "Son 5 gündeki gerçek trende göre";

            let predictionText = '';
            let iconClass = 'bi-info-circle text-info';
            let bgClass = 'rgba(13, 202, 240, 0.1)';
            let borderClass = 'border-info';

            // En son gönderilen gerçek veriyi alıyoruz
            let currentVal = sortedData[sortedData.length - 1].value;
            let remainingVal = 100 - currentVal;

            if (slope > 0.00001) { // Eğer yükseliş (eğim) varsa
                if (remainingVal <= 0) {
                    predictionText = "Kritik Uyarı: Bu metrik halihazırda tam kapasiteye (%100) ulaşmış durumda!";
                    iconClass = 'bi-exclamation-octagon text-danger';
                    bgClass = 'rgba(220, 53, 69, 0.1)';
                    borderClass = 'border-danger';
                } else {
                    let timeToFullSeconds = remainingVal / slope;
                    let days = Math.floor(timeToFullSeconds / (60 * 60 * 24));
                    let hours = Math.floor((timeToFullSeconds % (60 * 60 * 24)) / (60 * 60));

                    if (days > 365) {
                        predictionText = "Artış ivmesi çok düşük. Bu hızla devam ederse dolması 1 yıldan uzun sürecek.";
                        iconClass = 'bi-shield-check text-success';
                        bgClass = 'rgba(25, 135, 84, 0.1)';
                        borderClass = 'border-success';
                    } else {
                        predictionText = `${predictionPrefix} yaklaşık <b>${days} gün ${hours} saat</b> sonra kapasite tamamen dolacak.`;
                        iconClass = 'bi-clock-history text-warning';
                        bgClass = 'rgba(255, 193, 7, 0.1)';
                        borderClass = 'border-warning';
                    }
                }
            } else {
                predictionText = "Kullanım düşüş eğiliminde veya tamamen stabil. Dolum riski tespit edilmedi.";
                iconClass = 'bi-graph-down-arrow text-success';
                bgClass = 'rgba(25, 135, 84, 0.1)';
                borderClass = 'border-success';
            }

            // Algoritma Kalite Çıktıları (Geliştirici için)
            let debugInfoHtml = `
        <div class="mt-3 pt-3 border-top border-secondary" style="font-size: 0.75rem; font-family: monospace; opacity: 0.9;">
            <div class="fw-bold text-info mb-1"><i class="bi bi-robot"></i> Algoritma: OLS Linear Regression (Filtresiz)</div>
            <div class="d-flex justify-content-between text-muted small">
                <span>Analize Giren Toplam Ham Veri: ${sortedData.length} Nokta</span>
            </div>
            <div class="text-warning fw-bold mt-1" style="font-size: 0.8rem;">
                Saniye Başına Artış (Slope): ${slope.toFixed(8)}
            </div>
        </div>
    `;

            return `
        <div class="mt-4 p-3 border rounded shadow-sm d-flex align-items-start ${borderClass}" style="background: ${bgClass};">
            <i class="bi ${iconClass} fs-3 me-3 mt-1"></i>
            <div class="w-100">
                <h6 class="mb-1 fw-bold" style="color: var(--text-title); font-size: 0.85rem;">${titleText}</h6>
                <small style="color: var(--text-muted); display: block;">${predictionText}</small>
                ${debugInfoHtml}
            </div>
        </div>
    `;
        },
        renderReportList: (stateKey, tbodyId, valKey, colorClass) => {
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;

            const ITEMS_PER_PAGE_REPORTS = 5;
            const state = pgState.reports[stateKey];
            const start = (state.page - 1) * ITEMS_PER_PAGE_REPORTS;
            const paginated = state.data.slice(start, start + ITEMS_PER_PAGE_REPORTS);

            if (state.data.length === 0) {
                tbody.innerHTML = `<tr><td class="text-center text-muted py-3 fst-italic" colspan="2">Bu kategoride cihaz yok.</td></tr>`;
                document.getElementById(stateKey + 'Pg').innerHTML = '';
                return;
            }

            const metricType = valKey === 'averageCpu' ? 'CPU' : 'RAM';

            tbody.innerHTML = paginated.map(d => {
                const targetId = d.computerId || d.id;
                return `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td class="ps-4 fw-bold align-middle" style="color:var(--text-title);">
                        ${d.computerName}
                        <button class="btn btn-sm btn-link text-info p-0 ms-2" onclick="window.ui.showReportDetails(${targetId}, '${d.computerName}', '${metricType}')" title="Metrik Analizini Gör">
                            <i class="bi bi-info-circle-fill fs-5"></i>
                        </button>
                    </td>
                    <td class="text-end pe-4 align-middle" style="font-family: monospace; font-size: 1.1rem; color: var(--bs-${colorClass});">%${d[valKey]}</td>
                </tr>`;
            }).join('');

            renderPagination(stateKey + 'Pg', state.page, state.data.length, ITEMS_PER_PAGE_REPORTS, `ui.changeReportPage_${stateKey}`);
        },

        changeReportPage_bestCpu: (p) => { pgState.reports.bestCpu.page = p; ui.renderReportList('bestCpu', 'best-cpu-body', 'averageCpu', 'success'); },
        changeReportPage_worstCpu: (p) => { pgState.reports.worstCpu.page = p; ui.renderReportList('worstCpu', 'worst-cpu-body', 'averageCpu', 'danger'); },
        changeReportPage_bestRam: (p) => { pgState.reports.bestRam.page = p; ui.renderReportList('bestRam', 'best-ram-body', 'averageRam', 'success'); },
        changeReportPage_worstRam: (p) => { pgState.reports.worstRam.page = p; ui.renderReportList('worstRam', 'worst-ram-body', 'averageRam', 'danger'); },

        loadReportsView: async () => {
            try {
                const report = await window.api.getPerformanceReport();

                console.log("Gelen Performans Raporu:", report);

                document.getElementById('global-cpu-avg').innerText = `%${report.globalAverageCpu}`;
                document.getElementById('global-ram-avg').innerText = `%${report.globalAverageRam}`;

                if (!report.devices || report.devices.length === 0) {
                    const emptyMsg = `<tr><td class="text-center text-muted py-4">Değerlendirilecek cihaz metriği bulunamadı.</td></tr>`;
                    document.getElementById('best-cpu-body').innerHTML = emptyMsg;
                    document.getElementById('worst-cpu-body').innerHTML = emptyMsg;
                    document.getElementById('best-ram-body').innerHTML = emptyMsg;
                    document.getElementById('worst-ram-body').innerHTML = emptyMsg;
                    return;
                }

                const bestCpu = report.devices.filter(d => d.averageCpu <= report.globalAverageCpu).sort((a, b) => a.averageCpu - b.averageCpu);
                const worstCpu = report.devices.filter(d => d.averageCpu > report.globalAverageCpu).sort((a, b) => b.averageCpu - a.averageCpu);
                const bestRam = report.devices.filter(d => d.averageRam <= report.globalAverageRam).sort((a, b) => a.averageRam - b.averageRam);
                const worstRam = report.devices.filter(d => d.averageRam > report.globalAverageRam).sort((a, b) => b.averageRam - a.averageRam);

                pgState.reports.bestCpu.data = bestCpu; pgState.reports.bestCpu.page = 1;
                pgState.reports.worstCpu.data = worstCpu; pgState.reports.worstCpu.page = 1;
                pgState.reports.bestRam.data = bestRam; pgState.reports.bestRam.page = 1;
                pgState.reports.worstRam.data = worstRam; pgState.reports.worstRam.page = 1;

                ui.renderReportList('bestCpu', 'best-cpu-body', 'averageCpu', 'success');
                ui.renderReportList('worstCpu', 'worst-cpu-body', 'averageCpu', 'danger');
                ui.renderReportList('bestRam', 'best-ram-body', 'averageRam', 'success');
                ui.renderReportList('worstRam', 'worst-ram-body', 'averageRam', 'danger');

                let diskSection = document.getElementById('diskSectionWrapper');

                if (!diskSection) {
                    const mainContainer = document.getElementById('dynamic-content');
                    if (mainContainer) {
                        diskSection = document.createElement('div');
                        diskSection.id = 'diskSectionWrapper';
                        diskSection.className = 'mt-5 pt-3';
                        mainContainer.appendChild(diskSection);
                    }
                }

                if (diskSection) {
                    let globalDisksHtml = '';
                    if (report.globalDiskAverages && report.globalDiskAverages.length > 0) {
                        globalDisksHtml = `<div class="row justify-content-center mb-4">`;
                        report.globalDiskAverages.forEach(gd => {
                            globalDisksHtml += `
                            <div class="col-12 col-sm-6 col-lg mb-3">
                                <div class="card h-100 shadow-sm" style="background-color: var(--bg-card, #1e293b); border-radius: 10px; border: 1px solid var(--border-color, #334155) !important;">
                                    <div class="card-body d-flex flex-column justify-content-center align-items-center py-4">
                                        <div class="fw-bold mb-2 text-uppercase d-flex align-items-center" style="font-size: 0.9rem; letter-spacing: 1px; color: var(--text-muted, #94a3b8);">
                                            <i class="bi bi-hdd-fill me-2 fs-5" style="color: #38bdf8;"></i>${gd.diskName} GENEL ORT.
                                        </div>
                                        <h2 class="fw-bolder mb-0" style="color: var(--text-main, #e2e8f0); font-family: monospace; font-size: 2rem;">
                                            %${gd.averageUsedPercent}
                                        </h2>
                                    </div>
                                </div>
                            </div>`;
                        });
                        globalDisksHtml += `</div>`;
                    }

                    let allDiskCardsHtml = '';

                    report.devices.forEach(device => {
                        if (!device.disks || device.disks.length === 0) return;

                        let cardHtml = `
                        <div class="col-md-4 mb-4">
                            <div class="card h-100 shadow-sm border-0" style="background-color: var(--bg-card, #1e293b); border-radius: 10px; border: 1px solid var(--border-color, #334155) !important;">
                                <div class="card-header fw-bold" style="background-color: transparent; border-bottom: 1px solid var(--border-color, #334155); color: var(--text-main, #e2e8f0);">
                                    <i class="bi bi-hdd-network me-2" style="color: #38bdf8;"></i> ${device.computerName}
                                </div>
                                <div class="card-body" style="color: var(--text-main, #e2e8f0);">
                        `;

                        device.disks.forEach(disk => {
                            let colorClass = "bg-primary";
                            let textClass = "text-primary fw-bold";

                            if (disk.diskStatus === "Kötü") {
                                colorClass = "bg-danger";
                                textClass = "text-danger fw-bold";
                            } else if (disk.diskStatus === "İyi") {
                                colorClass = "bg-success";
                                textClass = "text-success fw-bold";
                            }

                            const targetId = device.computerId || device.id;
                            const safeDiskName = disk.diskName.replace(/\\/g, '\\\\');

                            cardHtml += `
                            <div class="mb-3">
                                <div class="d-flex justify-content-between align-items-center mb-1" style="font-size: 0.9rem;">
                                    <div>
                                        <span>Disk ${disk.diskName} <small style="color: var(--text-muted, #94a3b8);">(${disk.diskStatus})</small></span>
                                        <button class="btn btn-sm btn-link text-info p-0 ms-1" onclick="window.ui.showReportDetails(${targetId}, '${device.computerName}', 'Disk ${safeDiskName}', '${safeDiskName}')" title="Metrik Analizini Gör">
                                            <i class="bi bi-info-circle-fill"></i>
                                        </button>
                                    </div>
                                    <span class="${textClass}">%${disk.averageUsedPercent}</span>
                                </div>
                                <div class="progress" style="height: 8px; background-color: var(--border-color, #334155);">
                                    <div class="progress-bar ${colorClass}" role="progressbar" style="width: ${disk.averageUsedPercent}%"></div>
                                </div>
                            </div>
                            `;
                        });

                        cardHtml += `
                                </div>
                            </div>
                        </div>
                        `;

                        allDiskCardsHtml += cardHtml;
                    });

                    if (allDiskCardsHtml === '') {
                        allDiskCardsHtml = `<div class="col-12 text-muted fst-italic">Henüz disk verisi toplanmamış.</div>`;
                    }

                    diskSection.innerHTML = `
                    <h5 class="fw-bold mb-3" style="color: var(--text-main, #e2e8f0);">
                        <i class="bi bi-device-hdd me-2" style="color: #38bdf8;"></i> Cihaz Disk Durumları
                    </h5>
                    ${globalDisksHtml}
                    <div class="row" id="diskReportsContainer">
                        ${allDiskCardsHtml}
                    </div>
                    `;
                }

            } catch (error) {
                console.error("Rapor çekilirken hata:", error);
                const errorMsg = `<tr><td class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle"></i> Yüklenirken hata oluştu.</td></tr>`;

                const bestCpuBody = document.getElementById('best-cpu-body');
                if (bestCpuBody) {
                    bestCpuBody.innerHTML = errorMsg;
                    document.getElementById('worst-cpu-body').innerHTML = errorMsg;
                    document.getElementById('best-ram-body').innerHTML = errorMsg;
                    document.getElementById('worst-ram-body').innerHTML = errorMsg;
                }
            }
        },
        loadThresholdComputers: async () => {
            const selectEl = document.getElementById('ta-computer-select');
            if (!selectEl) return;
            try {
                const computers = await api.get('/api/Computer');
                const activeComputers = computers.filter(c => !c.isDeleted);
                let optionsHtml = '<option value="">-- Cihaz Seçiniz --</option>';
                activeComputers.forEach(c => {
                    optionsHtml += `<option value="${c.id}">${c.displayName || c.machineName}</option>`;
                });
                selectEl.innerHTML = optionsHtml;
            } catch (e) {
                selectEl.innerHTML = '<option value="">Cihazlar yüklenemedi</option>';
            }
        },
        toggleTaParams: (compId) => {
            const paramsContainer = document.getElementById('ta-params-container');
            if (!compId) {
                paramsContainer.style.display = 'none';
            } else {
                paramsContainer.style.display = 'block';
            }
        },
        generateThresholdReport: async () => {
            const compId = document.getElementById('ta-computer-select').value;
            const startDate = document.getElementById('ta-start-date').value;
            const endDate = document.getElementById('ta-end-date').value;

            if (!compId || !startDate || !endDate) {
                Swal.fire({ icon: 'warning', text: 'Lütfen cihaz ve tarih aralığı seçin.' });
                return;
            }

            const start = new Date(startDate);
            const end = new Date(endDate);
            const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));

            if (diffDays > 31) {
                Swal.fire({ icon: 'warning', text: 'Maksimum 31 günlük bir aralık seçebilirsiniz.' });
                return;
            }

            document.getElementById('ta-placeholder').style.display = 'none';
            const container = document.getElementById('ta-results-container');
            const metricsBody = document.getElementById('ta-metrics-body');

            container.style.display = 'block';
            metricsBody.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-info"></div><div class="mt-2 text-muted">Performanslı veritabanı analizi yapılıyor, lütfen bekleyin...</div></div>';

            try {
                const requestPayload = { StartDate: startDate, EndDate: endDate };

                const response = await window.api.post(`/api/Computer/${compId}/threshold-analysis`, requestPayload);
                const data = response.data ? response.data : response;

                if (response.isSuccess === false) {
                    throw new Error(response.message || "Rapor oluşturulamadı.");
                }

                if (!data || !data.cpuResult) {
                    throw new Error("Sunucudan eksik veya hatalı veri döndü.");
                }

                // --- YENİ: Grafikte kullanmak üzere detay verilerini tarayıcı hafızasına (RAM'e) alıyoruz ---
                window.currentReportBreaches = {
                    cpu: data.cpuResult.breaches || [],
                    ram: data.ramResult.breaches || [],
                    disks: {}
                };
                if (data.diskResults) {
                    data.diskResults.forEach(d => window.currentReportBreaches.disks[d.diskName] = d.breaches || []);
                }
                // --------------------------------------------------------------------------------------------

                document.getElementById('ta-result-title').innerText = `${data.computerName || 'Cihaz'} - Eşik Analizi`;

                const formatTimeFromCount = (count) => {
                    if (!count || count <= 0) return "0 Sn";
                    const totalSeconds = count * 30; // 1 saniyede 1 veri geliyorsa (veya 30 saniyede)
                    const h = Math.floor(totalSeconds / 3600);
                    const m = Math.floor((totalSeconds % 3600) / 60);
                    const s = totalSeconds % 60;
                    let timeStr = "";
                    if (h > 0) timeStr += `${h} Saat `;
                    if (m > 0) timeStr += `${m} Dk`;
                    if (h === 0 && m === 0) timeStr += `${s} Sn`;
                    return timeStr.trim();
                };

                let html = `
            <div class="alert mb-4" style="background: rgba(13, 202, 240, 0.1); border: 1px solid rgba(13, 202, 240, 0.3); color: var(--text-main);">
                <i class="bi bi-clock-history me-2 text-info fs-5 align-middle"></i>
                <span class="align-middle"><strong>Toplam Aktif Süre (Veri):</strong> ${formatTimeFromCount(data.totalActiveCount)} (${data.totalActiveCount} Ölçüm)</span>
            </div>
        `;

                // YENİ: typeKey ve diskName parametreleri eklendi
                const renderBar = (title, icon, colorClass, resultObj, typeKey, diskName = null) => {
                    if (!resultObj || resultObj.totalCount === 0) {
                        return `<div class="mb-4"><h6 style="color:var(--text-title);"><i class="${icon} text-${colorClass} me-2"></i>${title}</h6><div class="text-muted small">Bu metrik için geçerli ölçüm bulunamadı.</div></div>`;
                    }

                    let pctValue = 0;
                    if (resultObj.belowThresholdPercentage !== undefined) {
                        pctValue = resultObj.belowThresholdPercentage;
                    } else if (resultObj.totalCount > 0) {
                        pctValue = ((resultObj.belowThresholdCount || 0) / resultObj.totalCount) * 100;
                    }
                    const pct = pctValue.toFixed(1);

                    // YENİ: Sadece uyarı varsa grafiği göster butonunu hazırla
                    let chartBtnHtml = '';
                    if (resultObj.warningCount > 0) {
                        chartBtnHtml = `
                <button class="btn btn-sm btn-outline-${colorClass} mt-3 w-100 fw-bold" onclick="showBreachChart('${title}', '${typeKey}', '${diskName}')">
                    <i class="bi bi-graph-up-arrow me-1"></i> Aşım Grafiğini Göster
                </button>`;
                    }

                    return `
            <div class="mb-4 p-3 rounded" style="border: 1px solid var(--border-color); background: var(--bg-card-muted, transparent);">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0 fw-bold" style="color:var(--text-title);"><i class="${icon} text-${colorClass} me-2 fs-5"></i>${title}</h6>
                    <span class="badge bg-${colorClass} fs-6">%${pct} Sorunsuz</span>
                </div>
                
                <div class="row text-center mb-3 mt-3">
                    <div class="col-4 border-end border-secondary">
                        <h5 class="text-info mb-0">${resultObj.totalCount}</h5>
                        <small class="text-muted d-block" style="font-size:0.75rem;">Toplam Ölçüm</small>
                        <small class="text-info fw-bold" style="font-size:0.70rem;">(${formatTimeFromCount(resultObj.totalCount)})</small>
                    </div>
                    <div class="col-4 border-end border-secondary">
                        <h5 class="text-danger mb-0">${resultObj.warningCount}</h5>
                        <small class="text-muted d-block" style="font-size:0.75rem;">Uyarı (Aşılan)</small>
                        <small class="text-danger fw-bold" style="font-size:0.70rem;">(${formatTimeFromCount(resultObj.warningCount)})</small>
                    </div>
                    <div class="col-4">
                        <h5 class="text-success mb-0">${resultObj.belowThresholdCount}</h5>
                        <small class="text-muted d-block" style="font-size:0.75rem;">Sorunsuz</small>
                        <small class="text-success fw-bold" style="font-size:0.70rem;">(${formatTimeFromCount(resultObj.belowThresholdCount)})</small>
                    </div>
                </div>

                <div class="progress" style="height: 14px; background-color: var(--bg-input); border-radius: 10px; overflow: hidden; border: 1px solid rgba(0,0,0,0.1);">
                    <div class="progress-bar bg-${colorClass}" role="progressbar" style="width: ${pct}%"></div>
                </div>
                
                ${chartBtnHtml} 
            </div>`;
                };

                // typeKey'ler eklendi
                html += renderBar("CPU Kullanımı", "bi bi-cpu", "info", data.cpuResult, "cpu");
                html += renderBar("RAM Kullanımı", "bi bi-memory", "danger", data.ramResult, "ram");

                if (data.diskResults && data.diskResults.length > 0) {
                    html += `<h6 class="fw-bold mb-3 mt-4 pb-2 border-bottom" style="color:var(--text-title); border-color:var(--border-color) !important;">
                        <i class="bi bi-hdd-network text-success me-2"></i>Disk Kullanımları
                     </h6>`;
                    data.diskResults.forEach(d => {
                        html += renderBar(`Disk ${d.diskName}`, "bi bi-hdd", "success", d, "disk", d.diskName);
                    });
                } else {
                    html += `<div class="text-muted small mt-4"><i class="bi bi-hdd-network me-2"></i>Disk verisi bulunamadı.</div>`;
                }

                metricsBody.innerHTML = html;

            } catch (e) {
                console.error("Analiz Raporu Hatası:", e);
                metricsBody.innerHTML = `
            <div class="alert alert-danger d-flex align-items-center" style="background: rgba(220, 53, 69, 0.1); border-color: rgba(220, 53, 69, 0.3); color: var(--text-main);">
                <i class="bi bi-exclamation-triangle-fill fs-3 me-3 text-danger"></i>
                <div>
                    <strong class="d-block mb-1">Rapor Alınamadı</strong>
                    <small>${e.message || 'Analiz sırasında beklenmeyen bir hata oluştu.'}</small>
                </div>
            </div>`;
            }
        },
        loadHeatmapComputers: async () => {
            const selectEl = document.getElementById('heatmap-computer-select');
            if (!selectEl) return;
            try {
                const computers = await api.get('/api/Computer');
                const activeComputers = computers.filter(c => !c.isDeleted);
                let optionsHtml = '<option value="">-- Cihaz Seçiniz --</option>';
                activeComputers.forEach(c => {
                    optionsHtml += `<option value="${c.id}">${c.displayName || c.machineName}</option>`;
                });
                selectEl.innerHTML = optionsHtml;
            } catch (e) {
                selectEl.innerHTML = '<option value="">Cihazlar yüklenemedi</option>';
            }
        },

        generateHeatmap: async () => {
            const compId = document.getElementById('heatmap-computer-select').value;
            const dateStr = document.getElementById('heatmap-date').value;

            if (!compId || !dateStr) {
                Swal.fire({ icon: 'warning', text: 'Lütfen cihaz ve tarih seçin.' });
                return;
            }

            document.getElementById('heatmap-placeholder').style.display = 'none';
            const resultsContainer = document.getElementById('heatmap-results-container');
            resultsContainer.style.display = 'block';
            resultsContainer.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-warning"></div><div class="mt-2 text-muted">Isı haritası hesaplanıyor...</div></div>';

            try {
                // Seçilen günün başlangıç ve bitiş saatlerini API'ye gönderiyoruz
                const start = `${dateStr}T00:00:00`;
                const end = `${dateStr}T23:59:59`;
                const response = await api.get(`/api/Computer/${compId}/metrics-history?start=${start}&end=${end}`);

                const cpuRam = response.cpuRam || [];
                const disks = response.disks || [];

                if (cpuRam.length === 0 && disks.length === 0) {
                    resultsContainer.innerHTML = `
                        <div class="alert d-flex align-items-center" style="background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.3); color: var(--text-main);">
                            <i class="bi bi-info-circle-fill fs-3 me-3 text-warning"></i>
                            <div><strong>Veri Bulunamadı!</strong><br><small>Seçilen tarihte bu cihaza ait metrik kaydı bulunmamaktadır.</small></div>
                        </div>`;
                    return;
                }

                let html = '';

                // CPU ve RAM Haritaları
                if (cpuRam.length > 0) {
                    html += ui.buildHeatmapGrid("CPU Yoğunluğu", "bi bi-cpu", "info", cpuRam, "cpuAvg", dateStr);
                    html += ui.buildHeatmapGrid("RAM Yoğunluğu", "bi bi-memory", "danger", cpuRam, "ramAvg", dateStr);
                }

                // Diskleri isimlerine göre gruplayıp ayrı ayrı haritalarını çıkar
                if (disks.length > 0) {
                    const diskGroups = {};
                    disks.forEach(d => {
                        if (!diskGroups[d.diskName]) diskGroups[d.diskName] = [];
                        diskGroups[d.diskName].push(d);
                    });

                    for (let dName in diskGroups) {
                        html += ui.buildHeatmapGrid(`Disk [${dName}] Yoğunluğu`, "bi bi-hdd-network", "success", diskGroups[dName], "usedAvg", dateStr);
                    }
                }

                resultsContainer.innerHTML = html;

            } catch (e) {
                resultsContainer.innerHTML = `<div class="alert alert-danger">${e.message || 'Harita oluşturulurken bir hata meydana geldi.'}</div>`;
            }
        },

        buildHeatmapGrid: (title, icon, colorClass, dataPoints, valueKey, selectedDate) => {
            // 6 Satır (Her biri 10 dk = 60 dk) x 24 Sütun (Saatler) matrisi oluştur
            let grid = Array(6).fill(null).map(() => Array(24).fill(null));
            let counts = Array(6).fill(null).map(() => Array(24).fill(0));

            dataPoints.forEach(p => {
                const d = new Date(p.createdAt);
                const h = d.getHours();
                const m = d.getMinutes();
                const r = Math.floor(m / 10); // 0-9dk = 0. satır, 10-19dk = 1. satır ...
                const c = h;

                if (grid[r][c] === null) grid[r][c] = 0;
                grid[r][c] += p[valueKey];
                counts[r][c]++;
            });

            // Ortalamaları hesapla
            for (let r = 0; r < 6; r++) {
                for (let c = 0; c < 24; c++) {
                    if (counts[r][c] > 0) grid[r][c] = grid[r][c] / counts[r][c];
                }
            }

            let html = `
            <div class="card border-0 shadow-sm mb-4" style="background:var(--bg-card);">
                <div class="card-header border-bottom border-secondary pt-3 pb-2" style="background:transparent;">
                    <h6 class="mb-0 fw-bold" style="color:var(--text-title);"><i class="${icon} text-${colorClass} me-2 fs-5"></i>${title}</h6>
                </div>
                <div class="card-body overflow-auto pb-4">
                    <div style="display: grid; grid-template-columns: 45px repeat(24, minmax(22px, 1fr)); gap: 4px; min-width: 650px;">
                        
                        <div></div>
                        ${Array.from({ length: 24 }, (_, i) => `<div class="text-center fw-bold pb-1" style="font-size:11px; color:var(--text-main); opacity:0.85;">${i.toString().padStart(2, '0')}</div>`).join('')}
            `;

            // Verileri (Y Ekseni 10'ar dk periyotlar) HTML Matrisine Dök
            for (let r = 0; r < 6; r++) {
                let startMin = (r * 10).toString().padStart(2, '0');
                let endMin = (r * 10 + 9).toString().padStart(2, '0');

                // Y Ekseni Dakikalar - YENİLENDİ: Görünürlük artırıldı
                html += `<div class="d-flex align-items-center justify-content-end pe-2 fw-bold" style="font-size:10px; color:var(--text-main); opacity:0.85;">${startMin}m</div>`;

                for (let c = 0; c < 24; c++) {
                    let val = grid[r][c];

                    let bgColor = 'rgba(128, 128, 128, 0.15)';
                    let borderColor = 'rgba(128, 128, 128, 0.2)';
                    let tooltip = `Saat: ${c.toString().padStart(2, '0')}:${startMin} - ${c.toString().padStart(2, '0')}:${endMin} | Veri Yok`;
                    let cat = 'yok'; // YENİ: Kategori tutucu

                    if (val !== null) {
                        tooltip = `Saat: ${c.toString().padStart(2, '0')}:${startMin} - ${c.toString().padStart(2, '0')}:${endMin}\nOrtalama Yoğunluk: %${val.toFixed(1)}`;

                        if (val < 50) { bgColor = '#22c55e'; borderColor = '#16a34a'; cat = 'normal'; }
                        else if (val < 75) { bgColor = '#eab308'; borderColor = '#ca8a04'; cat = 'yogun'; }
                        else if (val < 90) { bgColor = '#f97316'; borderColor = '#ea580c'; cat = 'agir'; }
                        else { bgColor = '#ef4444'; borderColor = '#dc2626'; cat = 'kritik'; }
                    }

                    // YENİ: class ve data-category eklendi
                    html += `<div class="heatmap-cell" data-category="${cat}" style="background-color: ${bgColor}; border: 1px solid ${borderColor}; height: 22px; border-radius: 4px; cursor: crosshair; transition: transform 0.1s, opacity 0.3s;" 
                                  title="${tooltip}" 
                                  onmouseover="this.style.transform='scale(1.15)'" 
                                  onmouseout="this.style.transform='scale(1)'"></div>`;
                }
            }

            // Lejant Kısmı
            html += `
                    </div>
                    
                    <div class="d-flex justify-content-end mt-4 gap-4 flex-wrap" style="font-size:12px; color:var(--text-main); font-weight: 500;">
                        <div class="heatmap-legend legend-normal d-flex align-items-center" style="cursor:pointer; transition: opacity 0.2s;" onclick="ui.filterHeatmap('normal')">
                            <div style="width:14px; height:14px; background:#22c55e; border: 1px solid #16a34a; margin-right:6px; border-radius:3px;"></div> %0 - %50 (Normal)
                        </div>
                        <div class="heatmap-legend legend-yogun d-flex align-items-center" style="cursor:pointer; transition: opacity 0.2s;" onclick="ui.filterHeatmap('yogun')">
                            <div style="width:14px; height:14px; background:#eab308; border: 1px solid #ca8a04; margin-right:6px; border-radius:3px;"></div> %50 - %75 (Yoğun)
                        </div>
                        <div class="heatmap-legend legend-agir d-flex align-items-center" style="cursor:pointer; transition: opacity 0.2s;" onclick="ui.filterHeatmap('agir')">
                            <div style="width:14px; height:14px; background:#f97316; border: 1px solid #ea580c; margin-right:6px; border-radius:3px;"></div> %75 - %90 (Ağır)
                        </div>
                        <div class="heatmap-legend legend-kritik d-flex align-items-center" style="cursor:pointer; transition: opacity 0.2s;" onclick="ui.filterHeatmap('kritik')">
                            <div style="width:14px; height:14px; background:#ef4444; border: 1px solid #dc2626; margin-right:6px; border-radius:3px;"></div> %90+ (Kritik)
                        </div>
                        <div class="heatmap-legend legend-yok d-flex align-items-center" style="cursor:pointer; transition: opacity 0.2s;" onclick="ui.filterHeatmap('yok')">
                            <div style="width:14px; height:14px; background:rgba(128, 128, 128, 0.15); border: 1px solid rgba(128, 128, 128, 0.2); margin-right:6px; border-radius:3px;"></div> Veri Yok
                        </div>
                    </div>
                </div>
            </div>`;

            return html;
        
        },
        loadCorrelationComputers: async () => {
            const selectEl = document.getElementById('corr-computer-select');
            if (!selectEl) return;
            try {
                const computers = await api.get('/api/Computer');
                const activeComputers = computers.filter(c => !c.isDeleted);
                let optionsHtml = '<option value="">-- Cihaz Seçiniz --</option>';
                activeComputers.forEach(c => {
                    optionsHtml += `<option value="${c.id}">${c.displayName || c.machineName}</option>`;
                });
                selectEl.innerHTML = optionsHtml;
            } catch (e) { selectEl.innerHTML = '<option value="">Yüklenemedi</option>'; }
        },

        loadCorrelationDisks: async (compId) => {
            const container = document.getElementById('corr-disk-checks');
            if (!compId) { container.innerHTML = '<small class="text-muted">Cihaz Seçiniz</small>'; return; }
            try {
                const disks = await api.get(`/api/Computer/${compId}/disks`);
                container.innerHTML = '<small class="text-muted d-block mb-2">Aktif Diskler</small>';
                disks.forEach(d => {
                    container.innerHTML += `
                    <div class="form-check mb-1">
                        <input class="form-check-input corr-check" type="checkbox" value="Disk_${d.diskName}" id="chkDisk_${d.id}">
                        <label class="form-check-label small" for="chkDisk_${d.id}">Disk ${d.diskName}</label>
                    </div>`;
                });
            } catch (e) { container.innerHTML = '<small class="text-danger">Diskler alınamadı</small>'; }
        },

        handleCorrModeChange: (mode) => {
            localStorage.setItem('corrMode', mode);
            const isLine = mode === 'line';

            const info = document.getElementById('selection-limit-info');
            if (info) info.innerText = isLine ? "(Sınırsız Seçim)" : "(Tam 2 Adet Seçin)";

            if (!isLine) {
                const checked = document.querySelectorAll('.corr-check:checked');
                if (checked.length > 2) checked.forEach(c => c.checked = false);
            }
        },

        initCorrelationPage: () => {
            // Kullanıcı boş gelmesini istediği için hafızadan yüklemiyoruz
            const info = document.getElementById('selection-limit-info');
            if (info) info.innerText = "(Önce Tip Seçin)";
            ui.loadCorrelationComputers();

            // Checkbox tıklama kontrolü (Scatter için maksimum 2)
            document.addEventListener('change', (e) => {
                if (e.target.classList.contains('corr-check')) {
                    const currentMode = localStorage.getItem('corrMode') || 'line';
                    if (currentMode === 'scatter') {
                        const checked = document.querySelectorAll('.corr-check:checked');
                        if (checked.length > 2) {
                            e.target.checked = false;
                            Swal.fire({ icon: 'info', text: 'Scatter plot için tam olarak 2 veri seçmelisiniz.', timer: 2000, showConfirmButton: false });
                        }
                    }
                }
            });

            // Varsayılan tarihleri ayarla (Son 24 saat)
            const now = new Date();
            const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            document.getElementById('corr-start').value = toISO(yesterday);
            document.getElementById('corr-end').value = toISO(now);
        },

        generateCorrelationAnalysis: async () => {
            const compId = document.getElementById('corr-computer-select').value;
            const start = document.getElementById('corr-start').value;
            const end = document.getElementById('corr-end').value;
            const mode = document.getElementById('corr-type-select').value;
            const checkedMetrics = Array.from(document.querySelectorAll('.corr-check:checked'));

            // Doğrulamalar
            if (!mode) { Swal.fire({ icon: 'warning', text: 'Lütfen bir analiz tipi (Line veya Scatter) seçin.' }); return; }
            if (!compId) { Swal.fire({ icon: 'warning', text: 'Lütfen bir cihaz seçin.' }); return; }
            if (checkedMetrics.length === 0) { Swal.fire({ icon: 'warning', text: 'Lütfen en az bir değer seçin.' }); return; }
            if (mode === 'scatter' && checkedMetrics.length !== 2) {
                Swal.fire({ icon: 'warning', text: 'Scatter Plot çizmek için tam 2 değer seçmelisiniz (Örn: CPU ve RAM).' });
                return;
            }

            document.getElementById('corr-placeholder').style.display = 'none';
            document.getElementById('corr-result-card').style.display = 'block';

            try {
                const res = await api.get(`/api/Computer/${compId}/metrics-history?start=${start}&end=${end}`);
                const ctx = document.getElementById('correlationCanvas').getContext('2d');
                if (window.myCorrelationChart) window.myCorrelationChart.destroy();

                // --- GÜVENLİ TEMA ALGILAMA ---
                // Eğer data-theme "dark" ise koyu tema kabul et, değilse her zaman açık (light) tema kabul et ki bozulmasın.
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const isDarkMode = currentTheme === 'dark';

                // Koyu temada beyaz (#e2e8f0), Açık temada koyu gri (#334155) kullan
                const textColor = isDarkMode ? '#e2e8f0' : '#334155';

                // Koyu temada çizgiler şeffaf beyaz, Açık temada şeffaf siyah olsun
                const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';

                // Zaman Haritası (Milisaniye farkını sıfırlama)
                const timeMap = {};
                const maxTimeMap = {};

                if (res.cpuRam) {
                    res.cpuRam.forEach(m => {
                        if (!m.createdAt) return;
                        const ts = new Date(m.createdAt).setSeconds(0, 0);
                        if (!timeMap[ts]) timeMap[ts] = {};
                        // Field isimleri güncellendi: cpuUsage -> cpuAvg, ramUsage -> ramAvg
                        timeMap[ts]["CPU"] = { avg: m.cpuAvg, min: m.cpuMin, max: m.cpuMax, minTime: m.cpuMinTime, maxTime: m.cpuMaxTime };
                        timeMap[ts]["RAM"] = { avg: m.ramAvg, min: m.ramMin, max: m.ramMax, minTime: m.ramMinTime, maxTime: m.ramMaxTime };
                        maxTimeMap[ts] = Math.max(maxTimeMap[ts] || 0, new Date(m.maxCreatedAt || m.createdAt).getTime());
                    });
                }

                if (res.disks) {
                    res.disks.forEach(d => {
                        if (!d.createdAt) return;
                        const ts = new Date(d.createdAt).setSeconds(0, 0);
                        if (!timeMap[ts]) timeMap[ts] = {};
                        // Field ismi güncellendi: usedPercent -> usedAvg
                        timeMap[ts][`Disk_${d.diskName}`] = { avg: d.usedAvg, min: d.usedMin, max: d.usedMax, minTime: d.usedMinTime, maxTime: d.usedMaxTime };
                        maxTimeMap[ts] = Math.max(maxTimeMap[ts] || 0, new Date(d.maxCreatedAt || d.createdAt).getTime());
                    });
                }

                const sortedKeys = Object.keys(timeMap).map(Number).sort((a, b) => a - b);

                if (mode === 'line') {
                    // --- ZAMAN SERİSİ (LINE CHART) ---
                    const trMonths = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
                    const formatTrDate = (d) => {
                        const pad = n => n.toString().padStart(2, '0');
                        return `${d.getDate()} ${trMonths[d.getMonth()]} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
                    };
                    const labels = sortedKeys.map(ts => {
                        const d1 = new Date(ts);
                        const d2 = new Date(maxTimeMap[ts] || ts);
                        return `${formatTrDate(d1)}-${formatTrDate(d2)} arası`;
                    });
                    const datasets = [];

                    checkedMetrics.forEach((cb, index) => {
                        const metricKey = cb.value;
                        const dataArray = sortedKeys.map(ts => {
                            const val = timeMap[ts][metricKey];
                            return val !== undefined ? val.avg : null;
                        });

                        let label = metricKey;
                        let color = '#0dcaf0';
                        let fill = false;

                        if (metricKey === "CPU") { color = '#0dcaf0'; fill = true; }
                        else if (metricKey === "RAM") { color = '#dc3545'; fill = true; }
                        else if (metricKey.startsWith("Disk_")) {
                            label = `Disk ${metricKey.substring(5)} (%)`;
                            color = index % 2 === 0 ? '#198754' : '#ffc107';
                        }

                        datasets.push({
                            label: label,
                            data: dataArray,
                            borderColor: color,
                            backgroundColor: color + '20',
                            tension: 0.3,
                            fill: fill,
                            spanGaps: false
                        });
                    });

                    window.myCorrelationChart = new Chart(ctx, {
                        type: 'line',
                        data: { labels, datasets },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            interaction: { mode: 'index', intersect: false },
                            plugins: { 
                                legend: { labels: { color: textColor } }
                            },
                            scales: {
                                y: { min: 0, max: 100, ticks: { color: textColor }, grid: { color: gridColor } },
                                x: { 
                                    ticks: { 
                                        color: textColor,
                                        maxTicksLimit: 12,
                                        callback: function(val, index) {
                                            const label = this.getLabelForValue(val);
                                            if (label && typeof label === 'string') {
                                                return label.split('-')[0].trim();
                                            }
                                            return label;
                                        }
                                    }, 
                                    grid: { display: false } 
                                }
                            }
                        }
                    });

                } else {
                    // --- SCATTER PLOT & TRENDLINE (EĞİLİM ÇİZGİSİ) ---
                    const metric1 = checkedMetrics[0].value;
                    const metric2 = checkedMetrics[1].value;
                    const scatterData = [];

                    // Lineer Regresyon hesaplaması için gerekli değişkenler
                    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                    let n = 0;

                    sortedKeys.forEach(ts => {
                        const xValObj = timeMap[ts][metric1];
                        const yValObj = timeMap[ts][metric2];

                        if (xValObj !== undefined && yValObj !== undefined) {
                            const xVal = xValObj.avg;
                            const yVal = yValObj.avg;
                            
                            scatterData.push({ x: xVal, y: yVal });

                            // Trendline matematiği verileri
                            sumX += xVal;
                            sumY += yVal;
                            sumXY += (xVal * yVal);
                            sumX2 += (xVal * xVal);
                            n++;
                        }
                    });

                    // Trendline (En İyi Uyum Çizgisi) Hesaplaması
                    let trendlineData = [];
                    if (n > 1) {
                        const denominator = (n * sumX2 - sumX * sumX);
                        if (denominator !== 0) {
                            const m = (n * sumXY - sumX * sumY) / denominator; // Eğim (Slope)
                            const b = (sumY - m * sumX) / n;                   // Y-kesişimi (Intercept)

                            // Çizgiyi grafiğin başından (0) sonuna (100) kadar çiz
                            trendlineData = [
                                { x: 0, y: b },
                                { x: 100, y: (m * 100) + b }
                            ];
                        }
                    }

                    const label1 = metric1.startsWith("Disk_") ? `Disk ${metric1.substring(5)}` : metric1;
                    const label2 = metric2.startsWith("Disk_") ? `Disk ${metric2.substring(5)}` : metric2;

                    window.myCorrelationChart = new Chart(ctx, {
                        data: {
                            datasets: [
                                {
                                    // 1. Veri Seti: Gerçek Noktalar (Scatter)
                                    type: 'scatter',
                                    label: `${label1} vs ${label2} Dağılımı`,
                                    data: scatterData,
                                    backgroundColor: 'rgba(13, 202, 240, 0.6)',
                                    borderColor: '#0dcaf0',
                                    pointRadius: 5, pointHoverRadius: 8
                                },
                                {
                                    // 2. Veri Seti: Trend Çizgisi (Line)
                                    type: 'line',
                                    label: 'Eğilim Çizgisi (Trendline)',
                                    data: trendlineData,
                                    borderColor: 'rgba(239, 68, 68, 0.8)', // Kırmızı renk
                                    borderWidth: 2,
                                    borderDash: [5, 5], // Kesik kesik çizgi stili
                                    fill: false,
                                    pointRadius: 0, // Bu çizgide nokta göstermeye gerek yok
                                    pointHoverRadius: 0,
                                    tension: 0 // Çizgiyi dümdüz yap (kıvrım olmasın)
                                }
                            ]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: {
                                legend: { labels: { color: textColor } },
                                tooltip: {
                                    callbacks: {
                                        label: (ctx) => {
                                            if (ctx.datasetIndex === 1) return 'Genel Eğilim Yönü';
                                            return `${label1}: %${ctx.raw.x.toFixed(1)}, ${label2}: %${ctx.raw.y.toFixed(1)}`;
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: { title: { display: true, text: label1 + " (%)", color: textColor }, min: 0, max: 100, ticks: { color: textColor }, grid: { color: gridColor } },
                                y: { title: { display: true, text: label2 + " (%)", color: textColor }, min: 0, max: 100, ticks: { color: textColor }, grid: { color: gridColor } }
                            }
                        }
                    });
                }
            } catch (e) {
                Swal.fire({ icon: 'error', text: e.message || 'Veri işlenirken hata oluştu.' });
            }
        },

        initDeviceComparisonPage: () => {
            ui.loadComparisonComputers();

            // Varsayılan tarihleri ayarla (Son 24 saat)
            const now = new Date();
            const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            document.getElementById('comp-start').value = toISO(yesterday);
            document.getElementById('comp-end').value = toISO(now);
        },

        loadComparisonComputers: async () => {
            const container = document.getElementById('comp-computers-container');
            if (!container) return;
            try {
                const computers = await api.get('/api/Computer');
                const activeComputers = computers.filter(c => !c.isDeleted);
                
                if (activeComputers.length === 0) {
                    container.innerHTML = '<small class="text-muted">Cihaz bulunamadı.</small>';
                    return;
                }

                let html = '';
                activeComputers.forEach(c => {
                    html += `
                                <div class="form-check mb-1">
                                    <input class="form-check-input comp-computer-check" type="checkbox" value="${c.id}" id="compChk_${c.id}" data-name="${c.displayName || c.machineName}" onchange="ui.handleComparisonComputerChange(this)">
                                    <label class="form-check-label small" for="compChk_${c.id}" style="color:var(--text-main);">${c.displayName || c.machineName}</label>
                                </div>`;
                });
                container.innerHTML = html;
            } catch (e) { 
                container.innerHTML = '<small class="text-danger">Cihazlar yüklenemedi</small>'; 
            }
        },

        handleComparisonComputerChange: async (checkbox) => {
            const checked = document.querySelectorAll('.comp-computer-check:checked');
            const countEl = document.getElementById('comp-selected-count');
            if (countEl) countEl.innerText = `${checked.length} Seçili`;

            // Max 6 cihaz kısıtlaması (renk paletinden dolayı mantıklı bir sınır)
            if (checked.length > 6) {
                Swal.fire({ icon: 'info', text: 'Karşılaştırma için en fazla 6 cihaz seçebilirsiniz.', timer: 2000, showConfirmButton: false });
                if (checkbox) checkbox.checked = false;
                if (countEl) countEl.innerText = `${checked.length - 1} Seçili`;
                return;
            }

            ui.loadComparisonDisks();
        },

        loadComparisonDisks: async () => {
            const checked = Array.from(document.querySelectorAll('.comp-computer-check:checked'));
            const optgroup = document.getElementById('comp-disk-optgroup');
            if (!optgroup) return;

            if (checked.length === 0) {
                optgroup.innerHTML = '';
                return;
            }

            try {
                // Seçili olan tüm cihazların disklerini al
                const allDisksPromises = checked.map(c => api.get(`/api/Computer/${c.value}/disks`));
                const allDisksResults = await Promise.all(allDisksPromises);

                // Ortak diskleri bul (kesişim)
                if (allDisksResults.length > 0 && allDisksResults[0].length > 0) {
                    let commonDiskNames = allDisksResults[0].map(d => d.diskName);
                    
                    for (let i = 1; i < allDisksResults.length; i++) {
                        const currentDiskNames = allDisksResults[i].map(d => d.diskName);
                        commonDiskNames = commonDiskNames.filter(name => currentDiskNames.includes(name));
                    }

                    let optionsHtml = '';
                    commonDiskNames.forEach(name => {
                        optionsHtml += `<option value="Disk_${name}">Ortak Disk: ${name}</option>`;
                    });
                    optgroup.innerHTML = optionsHtml;
                    
                    // Eğer seçili olan değer artık seçenekler arasında yoksa sıfırla
                    const metricSelect = document.getElementById('comp-metric-select');
                    if (metricSelect.value.startsWith('Disk_') && !commonDiskNames.includes(metricSelect.value.replace('Disk_', ''))) {
                        metricSelect.value = '';
                    }
                } else {
                    optgroup.innerHTML = '';
                }
            } catch (e) {
                console.error("Ortak diskler yüklenirken hata:", e);
                optgroup.innerHTML = '';
            }
        },

        handleComparisonMetricChange: (val) => {
            // İleride farklı metrik türleri için özelleştirmeler gerekirse eklenebilir
        },

        generateDeviceComparison: async () => {
            const checkedComputers = Array.from(document.querySelectorAll('.comp-computer-check:checked'));
            const start = document.getElementById('comp-start').value;
            const end = document.getElementById('comp-end').value;
            const metric = document.getElementById('comp-metric-select').value;

            if (checkedComputers.length < 2) {
                Swal.fire({ icon: 'warning', text: 'Karşılaştırma için en az 2 cihaz seçmelisiniz.' });
                return;
            }
            if (!metric) {
                Swal.fire({ icon: 'warning', text: 'Lütfen karşılaştırılacak bir değer seçin.' });
                return;
            }
            if (!start || !end) {
                Swal.fire({ icon: 'warning', text: 'Lütfen başlangıç ve bitiş tarihlerini seçin.' });
                return;
            }

            document.getElementById('comp-placeholder').style.display = 'none';
            document.getElementById('comp-result-card').style.display = 'block';

            const ctx = document.getElementById('comparisonCanvas').getContext('2d');
            if (window.myComparisonChart) window.myComparisonChart.destroy();

            // Koyu/Açık tema
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const isDarkMode = currentTheme === 'dark';
            const textColor = isDarkMode ? '#e2e8f0' : '#334155';
            const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';

            const colors = ['#0dcaf0', '#dc3545', '#198754', '#ffc107', '#6f42c1', '#fd7e14'];
            const datasets = [];

            // Tüm dataları aynı zaman ekseninde birleştirmek için global timeMap ve Set
            const timeSet = new Set();
            const deviceDataMap = {}; // { deviceId: { timestamp: value } }
            const maxTimeMap = {};

            try {
                // Fetch all data concurrently
                const promises = checkedComputers.map(c => 
                    api.get(`/api/Computer/${c.value}/metrics-history?start=${start}&end=${end}`)
                );
                
                Swal.fire({ title: 'Veriler Yükleniyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                const results = await Promise.all(promises);
                Swal.close();

                checkedComputers.forEach((c, index) => {
                    const compId = c.value;
                    const compName = c.getAttribute('data-name');
                    const res = results[index];
                    
                    deviceDataMap[compId] = { name: compName, values: {} };

                    if (metric === "CPU" || metric === "RAM") {
                        if (res.cpuRam) {
                            res.cpuRam.forEach(m => {
                                if (!m.createdAt) return;
                                const ts = new Date(m.createdAt).setSeconds(0, 0);
                                timeSet.add(ts);
                                deviceDataMap[compId].values[ts] = metric === "CPU" ? 
                                    { avg: m.cpuAvg, min: m.cpuMin, max: m.cpuMax, minTime: m.cpuMinTime, maxTime: m.cpuMaxTime } : 
                                    { avg: m.ramAvg, min: m.ramMin, max: m.ramMax, minTime: m.ramMinTime, maxTime: m.ramMaxTime };
                                maxTimeMap[ts] = Math.max(maxTimeMap[ts] || 0, new Date(m.maxCreatedAt || m.createdAt).getTime());
                            });
                        }
                    } else if (metric.startsWith("Disk_")) {
                        const targetDiskName = metric.substring(5);
                        if (res.disks) {
                            res.disks.forEach(d => {
                                if (!d.createdAt || d.diskName !== targetDiskName) return;
                                const ts = new Date(d.createdAt).setSeconds(0, 0);
                                timeSet.add(ts);
                                deviceDataMap[compId].values[ts] = { avg: d.usedAvg, min: d.usedMin, max: d.usedMax, minTime: d.usedMinTime, maxTime: d.usedMaxTime };
                                maxTimeMap[ts] = Math.max(maxTimeMap[ts] || 0, new Date(d.maxCreatedAt || d.createdAt).getTime());
                            });
                        }
                    }
                });

                const trMonths = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
                const formatTrDate = (d) => {
                    const pad = n => n.toString().padStart(2, '0');
                    return `${d.getDate()} ${trMonths[d.getMonth()]} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
                };
                const sortedKeys = Array.from(timeSet).sort((a, b) => a - b);
                const labels = sortedKeys.map(ts => {
                    const d1 = new Date(ts);
                    const d2 = new Date(maxTimeMap[ts] || ts);
                    return `${formatTrDate(d1)}-${formatTrDate(d2)} arası`;
                });

                checkedComputers.forEach((c, index) => {
                    const compId = c.value;
                    const compData = deviceDataMap[compId];
                    const color = colors[index % colors.length];
                    
                    const dataArray = sortedKeys.map(ts => {
                        const val = compData.values[ts];
                        return val !== undefined ? val.avg : null;
                    });
                    
                    const maxDataArray = sortedKeys.map(ts => {
                        const val = compData.values[ts];
                        return val !== undefined ? val.max : null;
                    });

                    // Average Line
                    datasets.push({
                        label: `${compData.name} (Ortalama)`,
                        data: dataArray,
                        borderColor: color,
                        backgroundColor: color + '20',
                        tension: 0.3,
                        fill: false,
                        spanGaps: false,
                        compId: compId,
                        isMaxLine: false
                    });

                    // Max Line
                    datasets.push({
                        label: `${compData.name} (Maksimum)`,
                        data: maxDataArray,
                        borderColor: color,
                        borderDash: [5, 5],
                        borderWidth: 1.5,
                        tension: 0.3,
                        fill: false,
                        spanGaps: false,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        compId: compId,
                        isMaxLine: true
                    });
                });

                let chartTitle = metric === "CPU" ? "CPU Karşılaştırması (%)" : 
                                 metric === "RAM" ? "RAM Karşılaştırması (%)" : 
                                 `Disk ${metric.substring(5)} Karşılaştırması (%)`;

                const offlineBandPlugin = {
                    id: 'offlineBand',
                    beforeDraw: (chart) => {
                        const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
                        const datasets = chart.data.datasets.filter(d => !d.isMaxLine);
                        if (datasets.length === 0) return;
                        const labelsCount = chart.data.labels.length;
                        
                        let offlineStart = null;
                        ctx.save();
                        
                        for (let i = 0; i < labelsCount; i++) {
                            let allNull = true;
                            for (let d = 0; d < datasets.length; d++) {
                                if (datasets[d].data[i] !== null && datasets[d].data[i] !== undefined) {
                                    allNull = false;
                                    break;
                                }
                            }
                            
                            if (allNull) {
                                if (offlineStart === null) offlineStart = i;
                            } else {
                                if (offlineStart !== null) {
                                    const step = labelsCount > 1 ? (x.getPixelForValue(1) - x.getPixelForValue(0)) : 0;
                                    let startX = x.getPixelForValue(offlineStart) - step / 2;
                                    let endX = x.getPixelForValue(i - 1) + step / 2;
                                    
                                    if (offlineStart === 0) startX = left;
                                    
                                    ctx.fillStyle = 'rgba(220, 53, 69, 0.1)';
                                    ctx.fillRect(startX, top, endX - startX, bottom - top);
                                    
                                    ctx.strokeStyle = 'rgba(220, 53, 69, 0.3)';
                                    ctx.lineWidth = 1;
                                    ctx.setLineDash([5, 5]);
                                    ctx.beginPath();
                                    ctx.moveTo(startX, top); ctx.lineTo(startX, bottom);
                                    ctx.moveTo(endX, top); ctx.lineTo(endX, bottom);
                                    ctx.stroke();
                                    
                                    if (endX - startX > 60) {
                                        ctx.fillStyle = 'rgba(220, 53, 69, 0.6)';
                                        ctx.font = '11px Arial';
                                        ctx.textAlign = 'center';
                                        ctx.fillText('Çevrimdışı', startX + (endX - startX) / 2, top + (bottom - top) / 2);
                                    }
                                    offlineStart = null;
                                }
                            }
                        }
                        
                        if (offlineStart !== null) {
                            const step = labelsCount > 1 ? (x.getPixelForValue(1) - x.getPixelForValue(0)) : 0;
                            let startX = x.getPixelForValue(offlineStart) - step / 2;
                            if (offlineStart === 0) startX = left;
                            let endX = right;
                            
                            ctx.fillStyle = 'rgba(220, 53, 69, 0.1)';
                            ctx.fillRect(startX, top, endX - startX, bottom - top);
                            
                            ctx.strokeStyle = 'rgba(220, 53, 69, 0.3)';
                            ctx.lineWidth = 1;
                            ctx.setLineDash([5, 5]);
                            ctx.beginPath();
                            ctx.moveTo(startX, top); ctx.lineTo(startX, bottom);
                            ctx.stroke();
                            
                            if (endX - startX > 60) {
                                ctx.fillStyle = 'rgba(220, 53, 69, 0.6)';
                                ctx.font = '11px Arial';
                                ctx.textAlign = 'center';
                                ctx.fillText('Çevrimdışı', startX + (endX - startX) / 2, top + (bottom - top) / 2);
                            }
                        }
                        ctx.restore();
                    }
                };

                window.myComparisonChart = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets },
                    plugins: [offlineBandPlugin],
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: { 
                            legend: { labels: { color: textColor } },
                            title: { display: true, text: chartTitle, color: textColor },
                            tooltip: {
                                callbacks: {
                                    title: function(context) { return context && context.length > 0 ? context[0].label : ''; },
                                    label: function(context) {
                                        const dataset = context.dataset;
                                        const ts = sortedKeys[context.dataIndex];
                                        const compData = deviceDataMap[dataset.compId];
                                        const valObj = compData.values[ts];
                                        
                                        if (!valObj) return `${compData.name}: Veri Yok`;
                                        
                                        if (dataset.isMaxLine) {
                                            const ortalamaIndex = context.datasetIndex - 1;
                                            if (context.chart.isDatasetVisible(ortalamaIndex)) {
                                                return null; // Ortalama aktifse bilgiyi zaten o veriyor, tekrar yazdırma
                                            } else {
                                                return [
                                                    `${compData.name}`,
                                                    `Maksimum Değer: %${valObj.max.toFixed(2)} (${formatTrDate(new Date(valObj.maxTime))})`
                                                ];
                                            }
                                        }

                                        return [
                                            `${compData.name}`,
                                            `Ortalama Değer %${valObj.avg.toFixed(2)}`,
                                            `Maksimum Değer: %${valObj.max.toFixed(2)} (${formatTrDate(new Date(valObj.maxTime))})`,
                                            `Minimum Değer: %${valObj.min.toFixed(2)} (${formatTrDate(new Date(valObj.minTime))})`
                                        ];
                                    }
                                }
                            }
                        },
                        scales: {
                            y: { min: 0, max: 100, ticks: { color: textColor }, grid: { color: gridColor } },
                            x: { 
                                ticks: { 
                                    color: textColor,
                                    maxTicksLimit: 12,
                                    callback: function(val, index) {
                                        const label = this.getLabelForValue(val);
                                        if (label && typeof label === 'string') {
                                            return label.split('-')[0].trim();
                                        }
                                        return label;
                                    }
                                }, 
                                grid: { display: false } 
                            }
                        }
                    }
                });

            } catch (e) {
                Swal.close();
                Swal.fire({ icon: 'error', text: e.message || 'Veriler alınırken hata oluştu.' });
            }
        },

        initLogManagementPage: async () => {
            const select = document.getElementById('logPageComputerSelect');
            if (!select) return;

            try {
                const computers = await api.get('/api/Computer');
                select.innerHTML = '<option value="">Cihaz seçin...</option>';
                computers.filter(c => !c.isDeleted).forEach(c => {
                    select.innerHTML += `<option value="${c.id}">${c.displayName || c.machineName}</option>`;
                });
            } catch (e) {
                select.innerHTML = '<option value="">Yükleme hatası!</option>';
            }

            // Varsayılan tarihleri ayarla (Son 24 saat)
            const now = new Date();
            const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            document.getElementById('logStart').value = toISO(yesterday);
            document.getElementById('logEnd').value = toISO(now);
        },

        fetchLogManagementData: async () => {
            const compId = document.getElementById('logPageComputerSelect').value;
            const start = document.getElementById('logStart').value;
            const end = document.getElementById('logEnd').value;

            if (!compId || !start || !end) {
                Swal.fire({ icon: 'warning', text: 'Lütfen cihaz ve tarih aralığı seçin.' });
                return;
            }

            Swal.fire({ title: 'Loglar Hazırlanıyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

            try {
                const res = await api.get(`/api/Computer/${compId}/logs?start=${start}&end=${end}`);
                
                // PERFORMANS: Filtreleme sırasında donmayı önlemek için veriyi önceden işle (Pre-process)
                ui.allLogs = (res.logs || []).map(l => {
                    const ts = new Date(l.timestamp);
                    const timeStr = ts.toLocaleDateString('tr-TR') + ' ' + ts.toLocaleTimeString('tr-TR');
                    return {
                        ...l,
                        _searchBuffer: (l.message + ' ' + l.metric + ' ' + timeStr).toLowerCase(),
                        _timeStr: timeStr
                    };
                });
                
                ui.renderLogHistogram(res.histogram || []);
                ui.applyLocalLogFilters();
                
                Swal.close();
            } catch (e) {
                Swal.close();
                Swal.fire({ icon: 'error', text: e.message || 'Veri çekilirken hata oluştu.' });
            }
        },

        renderLogHistogram: (data) => {
            const ctx = document.getElementById('logHistogramCanvas').getContext('2d');
            if (window.logHistogramChart) window.logHistogramChart.destroy();

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const textColor = isDark ? '#94a3b8' : '#64748b';

            window.logHistogramChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.map(d => {
                        const date = new Date(d.timestamp);
                        return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
                    }),
                    datasets: [
                        { 
                            label: 'Critical', 
                            data: data.map(d => d.criticalCount > 0 ? d.criticalCount : null), 
                            backgroundColor: '#ef4444', 
                            stack: 'stack0', 
                            minBarLength: 5 
                        },
                        { 
                            label: 'Warning', 
                            data: data.map(d => d.warningCount > 0 ? d.warningCount : null), 
                            backgroundColor: '#f59e0b', 
                            stack: 'stack0', 
                            minBarLength: 5 
                        },
                        { 
                            label: 'Info', 
                            data: data.map(d => d.infoCount > 0 ? d.infoCount : null), 
                            backgroundColor: '#10b981', 
                            stack: 'stack0', 
                            minBarLength: 0 
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { 
                        legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 10, color: textColor, font: { size: 10 } } },
                        tooltip: {
                            filter: (item) => {
                                const d = data[item.dataIndex];
                                return (d.criticalCount > 0 || d.warningCount > 0 || d.infoCount > 0);
                            },
                            callbacks: {
                                title: (items) => {
                                    const d = data[items[0].dataIndex];
                                    const dateStart = new Date(d.timestamp);
                                    
                                    // Bitiş zamanını hesapla (Bir sonraki veriden veya tahminle)
                                    let dateEnd;
                                    if (items[0].dataIndex < data.length - 1) {
                                        dateEnd = new Date(data[items[0].dataIndex + 1].timestamp);
                                    } else if (data.length > 1) {
                                        const diff = new Date(data[1].timestamp).getTime() - new Date(data[0].timestamp).getTime();
                                        dateEnd = new Date(dateStart.getTime() + diff);
                                    } else {
                                        dateEnd = new Date(dateStart.getTime() + 60000); // Varsayılan 1 dk
                                    }

                                    const fmtFull = (dt) => dt.toLocaleDateString('tr-TR') + ' ' + dt.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                                    const fmtTime = (dt) => dt.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                                    
                                    const isSameDay = dateStart.toDateString() === dateEnd.toDateString();
                                    
                                    if (isSameDay) {
                                        return `${fmtFull(dateStart)} - ${fmtTime(dateEnd)}`;
                                    } else {
                                        return `${fmtFull(dateStart)} - ${fmtFull(dateEnd)}`;
                                    }
                                },
                                label: (item) => {
                                    const val = item.raw === null ? 0 : item.raw;
                                    return `${item.dataset.label}: ${val} adet`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { stacked: true, grid: { display: false }, ticks: { color: textColor, font: { size: 9 }, maxTicksLimit: 20 } },
                        y: { stacked: true, grid: { color: isDark ? '#334155' : '#e2e8f0' }, ticks: { color: textColor, font: { size: 9 } } }
                    }
                }
            });
        },

        debounceFilter: () => {
            clearTimeout(ui.filterTimeout);
            ui.filterTimeout = setTimeout(() => {
                ui.applyLocalLogFilters();
            }, 300); // 300ms bekle (yazma bitince çalışır)
        },

        applyLocalLogFilters: () => {
            const searchTerm = document.getElementById('logSearchInput').value.toLowerCase();
            const filterCpu = document.getElementById('filterCpu').checked;
            const filterRam = document.getElementById('filterRam').checked;
            const filterDisk = document.getElementById('filterDisk').checked;
            const filterCritical = document.getElementById('filterCritical').checked;
            const filterWarning = document.getElementById('filterWarning').checked;
            const filterInfo = document.getElementById('filterInfo').checked;

            const filtered = ui.allLogs.filter(l => {
                if (l.metric === "CPU" && !filterCpu) return false;
                if (l.metric === "RAM" && !filterRam) return false;
                if (l.metric.startsWith("Disk") && !filterDisk) return false;

                if (l.level === "Critical" && !filterCritical) return false;
                if (l.level === "Warning" && !filterWarning) return false;
                if (l.level === "Info" && !filterInfo) return false;

                if (searchTerm && !l._searchBuffer.includes(searchTerm)) return false;

                return true;
            });

            ui.filteredLogs = filtered;
            ui.logRenderIndex = 0;
            ui.renderLogFlow();
        },

        handleLogScroll: () => {
            const container = document.getElementById('logTableContainer');
            if (container.scrollHeight - container.scrollTop <= container.clientHeight + 100) {
                // Sona yaklaştı, yeni paket yükle
                ui.renderLogFlow(true);
            }
        },

        renderLogFlow: (isAppend = false) => {
            const tbody = document.getElementById('logTableBody');
            const badge = document.getElementById('logCountBadge');
            if (!tbody) return;

            const logs = ui.filteredLogs;
            badge.innerText = `${logs.length} Olay`;
            
            if (logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">Arama kriterlerine uygun sonuç bulunamadı.</td></tr>';
                return;
            }

            if (!isAppend) {
                tbody.innerHTML = '';
                ui.logRenderIndex = 0;
            }

            const CHUNK_SIZE = 500;
            const start = ui.logRenderIndex;
            const end = Math.min(start + CHUNK_SIZE, logs.length);
            
            if (start >= logs.length) return;

            let html = '';
            for (let i = start; i < end; i++) {
                const l = logs[i];
                let levelBadge = '';
                if (l.level === 'Critical') levelBadge = '<span class="badge bg-danger">Critical</span>';
                else if (l.level === 'Warning') levelBadge = '<span class="badge bg-warning text-dark">Warning</span>';
                else levelBadge = '<span class="badge bg-success">Info</span>';

                let metricIcon = '';
                if (l.metric === 'CPU') metricIcon = '<i class="bi bi-cpu text-info"></i>';
                else if (l.metric === 'RAM') metricIcon = '<i class="bi bi-memory text-warning"></i>';
                else metricIcon = '<i class="bi bi-hdd text-success"></i>';

                html += `
                    <tr>
                        <td class="text-muted">${l._timeStr}</td>
                        <td>${levelBadge}</td>
                        <td><div class="d-flex align-items-center gap-2">${metricIcon} ${l.metric}</div></td>
                        <td class="fw-bold">${l.value}%</td>
                        <td class="small">${l.message}</td>
                    </tr>
                `;
            }

            tbody.insertAdjacentHTML('beforeend', html);
            ui.logRenderIndex = end;
        },

        filterHeatmap: (cat) => {
            if (!window.activeHeatmapFilters) window.activeHeatmapFilters = [];

            const index = window.activeHeatmapFilters.indexOf(cat);
            if (index > -1) {
                // Seçiliyse çıkar
                window.activeHeatmapFilters.splice(index, 1);
            } else {
                // Seçili değilse ekle
                window.activeHeatmapFilters.push(cat);
            }

            // 1. HARİTA HÜCRELERİNİ GÜNCELLE
            document.querySelectorAll('.heatmap-cell').forEach(el => {
                const cellCat = el.getAttribute('data-category');
                if (window.activeHeatmapFilters.length === 0 || window.activeHeatmapFilters.includes(cellCat)) {
                    el.style.opacity = '1';
                    el.style.transform = 'scale(1)';
                } else {
                    el.style.opacity = '0.05';
                    el.style.transform = 'scale(0.9)';
                }
            });

            // 2. LEJANT (GÖSTERGE) BUTONLARINI GÜNCELLE
            const allCategories = ['normal', 'yogun', 'agir', 'kritik', 'yok'];

            allCategories.forEach(c => {
                const legendEls = document.querySelectorAll(`.legend-${c}`);
                legendEls.forEach(legendEl => {
                    if (window.activeHeatmapFilters.length === 0) {
                        // HİÇBİRİ SEÇİLİ DEĞİLSE: Hepsi varsayılan tam görünür
                        legendEl.style.opacity = '1';
                        legendEl.style.filter = 'grayscale(0%)';
                    } else if (window.activeHeatmapFilters.includes(c)) {
                        // BU SEÇİLİYSE: Tam görünür yap
                        legendEl.style.opacity = '1';
                        legendEl.style.filter = 'grayscale(0%)';
                    } else {
                        // BU SEÇİLİ DEĞİL (Başka bir şey seçili): Rengini soldur ve şeffaf yap
                        legendEl.style.opacity = '0.3';
                        legendEl.style.filter = 'grayscale(80%)';
                    }
                });
            });
        }
        
    };
    window.warningData = { cpu: [], ram: [], disk: [] };
    window.warningPages = { cpu: 1, ram: 1, disk: 1 };
    const WARNING_ITEMS_PER_PAGE = 10; // Her sayfada gösterilecek cihaz sayısı

    window.fetchTopWarnings = async function () {
        try {
            let url = '/api/agent-telemetry/top-warnings';

            // YENİ EKLENDİ: Eğer ekranda seçili tarih varsa query string olarak URL'ye ekle
            let start = document.getElementById('warning-start') ? document.getElementById('warning-start').value : null;
            let end = document.getElementById('warning-end') ? document.getElementById('warning-end').value : null;

            let queryParams = [];
            if (start) queryParams.push(`startDate=${start}`);
            if (end) queryParams.push(`endDate=${end}`);

            if (queryParams.length > 0) {
                url += '?' + queryParams.join('&');
            }

            const result = await window.api.get(url);
            const data = result.data ? result.data : result;

            // Gelen verileri hafızaya alıyoruz
            window.warningData.cpu = data.topCpuWarnings || [];
            window.warningData.ram = data.topRamWarnings || [];
            window.warningData.disk = data.topDiskWarnings || [];

            // Sayfa numaralarını sıfırlıyoruz
            window.warningPages = { cpu: 1, ram: 1, disk: 1 };

            // Ekranı çizdiriyoruz
            window.renderPaginatedWarningList('cpu');
            window.renderPaginatedWarningList('ram');
            window.renderPaginatedWarningList('disk');

        } catch (err) {
            console.error("Uyarı Raporu çekilirken hata oluştu: ", err);
        }
    };

    // YENİ EKLENDİ: Tarihleri temizleyen butonun fonksiyonu
    window.clearWarningFilters = function () {
        if (document.getElementById('warning-start')) document.getElementById('warning-start').value = '';
        if (document.getElementById('warning-end')) document.getElementById('warning-end').value = '';
        window.fetchTopWarnings();
    };
    window.showBreachChart = function (title, typeKey, diskName) {
        let breachesList = [];

        // Hafızaya aldığımız veriden ilgili olanı çek
        if (typeKey === 'cpu') breachesList = window.currentReportBreaches.cpu;
        else if (typeKey === 'ram') breachesList = window.currentReportBreaches.ram;
        else if (typeKey === 'disk') breachesList = window.currentReportBreaches.disks[diskName];

        if (!breachesList || breachesList.length === 0) {
            Swal.fire({ icon: 'info', text: 'Gösterilecek eşik aşım detayı yok.' });
            return;
        }

        document.getElementById('breachModalTitle').innerText = `${title} - Aşım Grafiği`;

        // 1. Tarihleri ayır
        const labels = breachesList.map(b => {
            const d = new Date(b.timestamp);
            return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        });

        // 2. Metrik (Kullanım) Değerlerini ayır
        const dataPoints = breachesList.map(b => b.value);

        // 3. YENİ: Eşik (Limit) Değerlerini her bir an için ayrı ayrı ayır
        const thresholdPoints = breachesList.map(b => b.thresholdPercent);

        const ctx = document.getElementById('breachCanvas').getContext('2d');
        if (window.currentBreachChart) window.currentBreachChart.destroy();

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const textColor = isLight ? '#334155' : '#e2e8f0';
        const gridColor = isLight ? '#cbd5e1' : '#334155';

        window.currentBreachChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: `${title} Aşım Oranları (%)`,
                        data: dataPoints,
                        borderColor: '#ef4444',
                        backgroundColor: '#ef444433',
                        pointBackgroundColor: '#dc2626',
                        pointRadius: 4,
                        pointHoverRadius: 7,
                        fill: true,
                        tension: 0.3
                    },
                    {
                        // YENİ: Veriyi tek bir sayı ile doldurmak yerine dinamik diziyi (thresholdPoints) veriyoruz
                        label: `Tanımlı Eşik Sınırı (%)`,
                        data: thresholdPoints,
                        borderColor: '#eab308',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 2, // Eşiğin değiştiği yerler belli olsun diye hafif nokta eklendi
                        fill: false,
                        tension: 0.1 // Eşik değişimlerinde çizgi keskin görünsün
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: textColor } } },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { min: 0, max: 100, ticks: { color: textColor }, grid: { color: gridColor } }
                }
            }
        });

        const modal = new bootstrap.Modal(document.getElementById('breachChartModal'));
        modal.show();
    };
    window.renderPaginatedWarningList = function (type) {
        let list = window.warningData[type];
        let page = window.warningPages[type];
        let elementId = `top-${type}-list`;
        let isDisk = (type === 'disk');

        const container = document.getElementById(elementId);
        if (!container) return;

        container.innerHTML = '';

        // Veri yoksa
        if (!list || list.length === 0) {
            container.innerHTML = `<li class="list-group-item text-success text-center py-4" style="background:transparent;"><i class="bi bi-check-circle-fill me-2"></i>Hiç uyarı yok!</li>`;
            return;
        }

        // Sayfalama hesaplamaları
        let totalPages = Math.ceil(list.length / WARNING_ITEMS_PER_PAGE);
        if (page > totalPages) page = totalPages;
        if (page < 1) page = 1;

        let startIndex = (page - 1) * WARNING_ITEMS_PER_PAGE;
        let endIndex = Math.min(startIndex + WARNING_ITEMS_PER_PAGE, list.length);
        let pageData = list.slice(startIndex, endIndex);

        // O sayfaya ait cihazları çizdirme
        pageData.forEach(item => {
            const diskBadge = isDisk && item.diskName ? `<span class="badge bg-secondary ms-2">${item.diskName}</span>` : '';

            container.innerHTML += `
            <li class="list-group-item d-flex justify-content-between align-items-center" style="background:transparent; color:var(--text-main); border-color:var(--border-color);">
                <div>
                    <strong style="color:var(--text-title);">${item.computerName}</strong>
                    ${diskBadge}
                </div>
                <span class="badge bg-danger rounded-pill px-3 py-2">${item.warningCount}</span>
            </li>
        `;
        });

        // Alt kısma Pagination butonlarını ekleme (Sadece 1 sayfadan fazlaysa göster)
        if (totalPages > 1) {
            container.innerHTML += `
            <li class="list-group-item p-2 d-flex justify-content-center" style="background:transparent; border-color:var(--border-color);">
                <div class="btn-group btn-group-sm shadow-sm">
                    <button class="btn btn-outline-secondary" ${page === 1 ? 'disabled' : ''} onclick="window.changeWarningPage('${type}', ${page - 1})">
                        <i class="bi bi-chevron-left"></i>
                    </button>
                    <span class="btn btn-secondary disabled px-3" style="color:white !important;">${page} / ${totalPages}</span>
                    <button class="btn btn-outline-secondary" ${page === totalPages ? 'disabled' : ''} onclick="window.changeWarningPage('${type}', ${page + 1})">
                        <i class="bi bi-chevron-right"></i>
                    </button>
                </div>
            </li>
        `;
        }
    };

    // Butonlara tıklanınca sayfayı değiştirip sadece o listeyi yeniden çizen fonksiyon
    window.changeWarningPage = function (type, newPage) {
        window.warningPages[type] = newPage;
        window.renderPaginatedWarningList(type);
    };
    // --- Tema Başlatma (Sayfa Yüklenince) ---
    (function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    })();

})();