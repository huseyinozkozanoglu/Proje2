// STAJ2/wwwroot/assets/js/agent-ui.js

// --- GRAFİKLER İÇİN EKLENEN GLOBAL DEĞİŞKENLER ---
let currentHistoryMode = 'band';
let historyCharts = { cpu: null, ram: null, disks: {} };
let chartSettings = { defaultMaxPoints: 200, detailMaxPoints: 1000 }; // Fallback defaults
let currentHistoryData = { cpuRam: [], disks: [] };

// --- İki sekme için ayrı etiket dizileri ---
let selectedLiveTags = [];
let selectedAllTags = [];
let selectedTagViewTags = [];
let allAgents = [];
let allSystemComputers = [];

// --- PAGINATION İÇİN EKLENEN DEĞİŞKENLER ---
let currentLivePage = 1;
let currentAllPage = 1;
const itemsPerPage = 6;

// --- YARDIMCI FONKSİYON: Dinamik Renk Hesaplama ---
function getProgressBarColor(val, threshold) {
    if (val >= threshold) return 'bg-danger';
    if (val >= (threshold * 0.8)) return 'bg-warning';
    return 'bg-success';
}

// --- 1. ANA TABLO VE FİLTRELEME ---

window.applyFilter = () => {
    const tags = $('#tagSelect').val() || [];

    const isLiveTab = document.getElementById('nav-computers') && document.getElementById('nav-computers').classList.contains('active');
    const isAllTab = document.getElementById('nav-all-computers') && document.getElementById('nav-all-computers').classList.contains('active');
    const isTagsTab = document.getElementById('nav-tags') && document.getElementById('nav-tags').classList.contains('active');

    if (isLiveTab) {
        selectedLiveTags = tags;
        currentLivePage = 1;
        renderTable();
    } else if (isAllTab) {
        selectedAllTags = tags;
        currentAllPage = 1;
        if (typeof window.renderAllComputersTable === "function") window.renderAllComputersTable();
    } else if (isTagsTab) {
        selectedTagViewTags = tags;
        if (typeof window.ui !== "undefined" && typeof window.ui.loadTagTable === "function") window.ui.loadTagTable();
    }
};

window.loadFilterTags = async () => {
    try {
        const tags = await api.get("/api/Computer/tags");

        const $filterSelect = $('#tagSelect');
        const $modalSelect = $('#modalTagSelect');

        const currentFilterVals = $filterSelect.val();
        const currentModalVals = $modalSelect.val();

        $filterSelect.empty();
        $modalSelect.empty();

        tags.forEach(t => {
            $filterSelect.append(new Option(t.name, t.name, false, false));
            $modalSelect.append(new Option(t.name, t.name, false, false));
        });

        if (currentFilterVals) $filterSelect.val(currentFilterVals);
        if (currentModalVals) $modalSelect.val(currentModalVals);

        $filterSelect.trigger('change.select2');
        $modalSelect.trigger('change.select2');

    } catch (e) {
        console.error("Filtre etiketleri yüklenemedi", e);
    }
};

async function loadAgents() {
    try {
        const res = await fetch("/api/agent-telemetry/latest", {
            cache: "no-store",
            headers: { "Authorization": `Bearer ${auth.getToken()}` }
        });
        if (!res.ok) throw new Error("Veri çekilemedi");
        allAgents = await res.json();
        renderTable();
    } catch (e) {
        console.error(e);
    }
}

function renderTable() {
    const container = document.getElementById("agentGrid");
    if (!container) return;

    const canRename = window.auth.hasPermission("Computer.Rename");
    const canSetThreshold = window.auth.hasPermission("Computer.SetThreshold");
    const canAssignTag = window.auth.hasPermission("Computer.AssignTag");
    const canEdit = canRename || canSetThreshold || canAssignTag;

    const now = new Date().getTime();

    const liveAndFilteredAgents = allAgents.filter(a => {
        const matchesTags = selectedLiveTags.length === 0 || selectedLiveTags.every(t => a.tags && a.tags.includes(t));
        if (!matchesTags) return false;
        if (!a.ts) return false;
        return (now - new Date(a.ts).getTime()) <= 150000;
    });

    const totalPages = Math.ceil(liveAndFilteredAgents.length / itemsPerPage);
    if (currentLivePage > totalPages && totalPages > 0) currentLivePage = totalPages;

    const startIndex = (currentLivePage - 1) * itemsPerPage;
    const paginatedAgents = liveAndFilteredAgents.slice(startIndex, startIndex + itemsPerPage);

    container.innerHTML = paginatedAgents.map(a => {
        const ts = a.ts ? new Date(a.ts).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : "-";
        const tags = (a.tags || []).map(t => `<span class="badge" style="background:var(--bg-hover); color:var(--text-main); border: 1px solid var(--border-color); margin-right:3px;">${t}</span>`).join("");
        const statusClass = 'bg-success';

        let actionButtons = '';
        if (canEdit) {
            actionButtons = `<div class="d-flex align-items-center gap-1">`;
            if (canSetThreshold) actionButtons += `<button class="btn btn-sm btn-ghost p-1 border-0" onclick="openThresholdSettings(${a.computerId})" title="Sınırları Düzenle"><i class="bi bi-sliders fs-6 text-warning"></i></button>`;
            if (canAssignTag) actionButtons += `<button class="btn btn-sm btn-ghost p-1 border-0" onclick="openTagModal(${a.computerId})" title="Etiketle"><i class="bi bi-tags fs-6 text-success"></i></button>`;
            if (canRename) actionButtons += `<button class="btn btn-sm btn-ghost p-1 border-0" onclick="handleRename(${a.computerId}, '${a.displayName || a.machineName}')" title="İsim Değiştir"><i class="bi bi-pencil fs-6 text-primary"></i></button>`;
            actionButtons += `</div>`;
        }

        const cpuLimit = a.cpuThreshold || 90;
        const ramLimit = a.ramThreshold || 90;
        const cpuUsage = Math.round(a.cpuUsage || 0);
        const ramUsage = Math.round(a.ramUsage || 0);
        const cpuColor = getDonutColor(cpuUsage, cpuLimit);
        const ramColor = getDonutColor(ramUsage, ramLimit);

        let sensorsHtml = `
            <div class="col">
                <div class="p-2 rounded border disk-box d-flex flex-column align-items-center justify-content-center text-center h-100" style="background:var(--bg-hover); border-color:var(--border-color)!important;">
                    <span class="small fw-bold mb-2 text-truncate w-100" style="color:var(--text-main); font-size:0.75rem;"><i class="bi bi-cpu text-primary"></i> CPU</span>
                    <div class="prtg-donut" style="--val: ${cpuUsage}; --donut-color: ${cpuColor};">
                        <span style="color:var(--text-main);">%${cpuUsage}</span>
                    </div>
                </div>
            </div>
            <div class="col">
                <div class="p-2 rounded border disk-box d-flex flex-column align-items-center justify-content-center text-center h-100" style="background:var(--bg-hover); border-color:var(--border-color)!important;">
                    <span class="small fw-bold mb-2 text-truncate w-100" style="color:var(--text-main); font-size:0.75rem;"><i class="bi bi-memory text-success"></i> RAM</span>
                    <div class="prtg-donut" style="--val: ${ramUsage}; --donut-color: ${ramColor};">
                        <span style="color:var(--text-main);">%${ramUsage}</span>
                    </div>
                </div>
            </div>
        `;

        if (a.diskUsage && a.diskUsage !== "-") {
            let regex = /([A-Za-z]:[\\/]?)[^\d]*(\d+)/g;
            let match;

            while ((match = regex.exec(a.diskUsage)) !== null) {
                let dName = match[1].replace(/[\\/]/g, '');
                let dUsage = parseInt(match[2]);

                let diskKey = dName.replace(':', '');

                let diskLimit = 90;
                if (a.diskThresholds && a.diskThresholds[diskKey] !== undefined) {
                    diskLimit = a.diskThresholds[diskKey];
                }

                let dColor = getDonutColor(dUsage, diskLimit);

                sensorsHtml += `
                <div class="col">
                    <div class="p-2 rounded border disk-box d-flex flex-column align-items-center justify-content-center text-center h-100" style="background:var(--bg-hover); border-color:var(--border-color)!important;">
                        <span class="small fw-bold mb-2 text-truncate w-100" style="color:var(--text-main); font-size:0.75rem;"><i class="bi bi-device-hdd text-info"></i> ${dName}</span>
                        <div class="prtg-donut" style="--val: ${dUsage}; --donut-color: ${dColor};">
                            <span style="color:var(--text-main);">%${dUsage}</span>
                        </div>
                    </div>
                </div>`;
            }
        }

        return `
            <div class="col">
                <div class="card h-100 prtg-card border shadow-sm" style="background:var(--bg-card); border-color:var(--border-color)!important;">
                    
                    <div class="card-header border-bottom border-secondary d-flex justify-content-between align-items-center mb-0" style="border-color:var(--border-color)!important; background: transparent; padding-bottom: 0.75rem;">
                        <div class="d-flex align-items-center gap-2" style="overflow:hidden;">
                            <span class="status-indicator ${statusClass}"></span>
                            <div class="text-truncate">
                                <h6 class="mb-0 fw-bold" style="color:var(--text-title);">${a.displayName || a.machineName}</h6>
                                <small style="color:var(--text-muted); font-family:monospace; font-size: 0.75rem;">${a.ip || 'IP Yok'}</small>
                            </div>
                        </div>
                        ${actionButtons}
                    </div>

                    <div class="card-body p-3">
                        <div class="mb-3 d-flex flex-wrap gap-1">${tags}</div>
                        
                        <div class="row row-cols-2 row-cols-sm-3 g-2">
                            ${sensorsHtml}
                        </div>

                        <div class="text-end mt-3">
                            <small style="font-size: 0.65rem; color:var(--text-muted);">Son Veri: ${ts}</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    renderPaginationControls('livePagination', currentLivePage, totalPages, 'changeLivePage');
}

// --- 2. YÖNETİM FONKSİYONLARI ---

window.handleRename = (id, currentName) => {
    document.getElementById("renameComputerId").value = id;
    document.getElementById("newComputerName").value = currentName;
    const modal = new bootstrap.Modal(document.getElementById("renameModal"));
    modal.show();
};

window.saveComputerName = async () => {
    const id = document.getElementById("renameComputerId").value;
    const newName = document.getElementById("newComputerName").value.trim();

    try {
        const response = await api.put(`/api/Computer/update-display-name`, { id: parseInt(id), newDisplayName: newName });
        const modal = bootstrap.Modal.getInstance(document.getElementById("renameModal"));
        modal.hide();
        loadAgents();
        if (typeof loadAllComputers === "function") loadAllComputers();

        Swal.fire({ title: response.title, text: response.message, icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) {
        Swal.fire({ title: e.title, text: e.message, icon: 'warning' });
    }
};

window.openTagModal = async (id) => {
    document.getElementById("tagModalComputerId").value = id;
    const modal = new bootstrap.Modal(document.getElementById("tagsModal"));

    let agent = allAgents.find(a => a.computerId == id);
    if (!agent) agent = allSystemComputers.find(c => c.id == id);

    const existingTags = agent ? (agent.tags || []) : [];
    $('#modalTagSelect').val(existingTags).trigger('change');

    modal.show();
};

window.saveTags = async () => {
    const id = document.getElementById("tagModalComputerId").value;
    const selectedTags = $('#modalTagSelect').val() || [];

    try {
        const response = await api.put(`/api/Computer/${id}/tags`, { tags: selectedTags });
        const modal = bootstrap.Modal.getInstance(document.getElementById("tagsModal"));
        modal.hide();
        loadAgents();
        if (typeof loadAllComputers === "function") loadAllComputers();

        Swal.fire({ title: response.title, text: response.message, icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) {
        Swal.fire({ title: e.title, text: e.message, icon: 'warning' });
    }
};

window.openThresholdSettings = async (id) => {
    document.getElementById("modalComputerId").value = id;
    document.getElementById("cpuThresholdInput").value = "";
    document.getElementById("ramThresholdInput").value = "";
    document.getElementById("cpuThresholdInput").placeholder = "Yükleniyor...";
    document.getElementById("ramThresholdInput").placeholder = "Yükleniyor...";

    const container = document.getElementById("diskThresholdsContainer");
    container.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm text-info"></div></div>';

    try {
        const computerData = await api.get(`/api/Computer/${id}`);
        document.getElementById("cpuThresholdInput").value = computerData.cpuThreshold || "";
        document.getElementById("ramThresholdInput").value = computerData.ramThreshold || "";

        const disks = await api.get(`/api/Computer/${id}/disks`);

        if (!disks || disks.length === 0) {
            container.innerHTML = '<div class="text-muted small text-center">Disk bulunamadı.</div>';
        } else {
            let html = "";
            disks.forEach(d => {
                html += `
                    <div class="disk-row mb-2 d-flex align-items-center justify-content-between p-2 rounded" style="background:var(--bg-hover); border:1px solid var(--border-color);">
                        <span class="fw-bold" style="color:var(--text-main);">${d.diskName}</span>
                        <div class="d-flex align-items-center gap-2">
                            <label class="small text-muted mb-0">Eşik %:</label>
                            <input type="number" 
                                   data-diskname="${d.diskName}"
                                   class="form-control form-control-sm disk-threshold-input" 
                                   value="${d.thresholdPercent || 90}" 
                                   min="0" max="100"
                                   style="width:70px; background:var(--bg-input); color:var(--text-input); border-color:var(--border-input);">
                        </div>
                    </div>`;
            });
            container.innerHTML = html;
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="text-danger small">Veri alınamadı.</div>';
    }

    const modal = new bootstrap.Modal(document.getElementById("thresholdModal"));
    modal.show();
};

window.saveThresholdsWithValidation = async () => {
    const id = document.getElementById("modalComputerId").value;
    const cpuVal = document.getElementById("cpuThresholdInput").value;
    const ramVal = document.getElementById("ramThresholdInput").value;

    const cpu = cpuVal ? parseInt(cpuVal) : null;
    const ram = ramVal ? parseInt(ramVal) : null;

    const diskInputs = document.querySelectorAll('.disk-threshold-input');
    const diskThresholdsList = [];

    diskInputs.forEach(input => {
        const name = input.getAttribute("data-diskname");
        const val = input.value ? parseInt(input.value) : null;
        if (name) {
            diskThresholdsList.push({ diskName: name, thresholdPercent: val });
        }
    });

    const payload = { cpuThreshold: cpu, ramThreshold: ram, diskThresholds: diskThresholdsList };

    try {
        const response = await api.put(`/api/Computer/update-thresholds/${id}`, payload);
        const modal = bootstrap.Modal.getInstance(document.getElementById("thresholdModal"));
        modal.hide();
        loadAgents();
        if (typeof loadAllComputers === "function") loadAllComputers();

        Swal.fire({ title: response.title, text: response.message, icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) {
        Swal.fire({ title: e.title, text: e.message, icon: 'warning' });
    }
};

// --- 3. GEÇMİŞ METRİK FONKSİYONLARI (GRAFİKLİ SOL MENÜLÜ YAPI) ---

window.openHistoryModal = async (id) => {
    ui.switchView('history');

    if (window.ui.loadHistoryComputers) {
        await window.ui.loadHistoryComputers();
    }

    const selectEl = document.getElementById("historyPageComputerSelect");
    if (selectEl) {
        selectEl.value = id;
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const formatToInput = (date) => {
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    };

    document.getElementById("historyStart").value = formatToInput(yesterday);
    document.getElementById("historyEnd").value = formatToInput(now);

    if (historyCharts.cpu) historyCharts.cpu.destroy();
    if (historyCharts.ram) historyCharts.ram.destroy();
    Object.values(historyCharts.disks).forEach(chart => chart.destroy());
    historyCharts.disks = {};

    const dynamicDiskCharts = document.getElementById("dynamicDiskCharts");
    if (dynamicDiskCharts) dynamicDiskCharts.innerHTML = "";

    const diskCheckboxes = document.getElementById("diskCheckboxes");
    if (diskCheckboxes) diskCheckboxes.innerHTML = "";

    window.fetchHistoryMetrics();
};

window.fetchHistoryMetrics = async () => {
    const selectEl = document.getElementById("historyPageComputerSelect");
    const id = selectEl && selectEl.value ? selectEl.value : 0;

    const start = document.getElementById("historyStart").value;
    const end = document.getElementById("historyEnd").value;

    const results = document.getElementById("historyResults");
    const placeholder = document.getElementById("historyPlaceholder");

    placeholder.innerHTML = '<div class="text-center py-5 mt-5"><div class="spinner-border text-info"></div><div class="mt-3 fw-bold" style="color: var(--text-muted);">Veriler analiz ediliyor...</div></div>';
    placeholder.style.display = "block";
    results.style.display = "none";
    document.getElementById("diskFiltersContainer").style.display = "none";

    try {
        const data = await api.get(`/api/Computer/${id}/metrics-history?start=${start}&end=${end}`);

        if (!data.cpuRam || data.cpuRam.length === 0) {
            placeholder.innerHTML = '<div class="text-center py-5 mt-5"><h5 class="fw-light mt-4" style="color: var(--text-title);">Bu tarih aralığında kayıt bulunamadı.</h5></div>';
            return;
        }
        currentHistoryData = data;

        if (currentHistoryData.cpuRam) {
            currentHistoryData.cpuRam.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }
        if (currentHistoryData.disks) {
            currentHistoryData.disks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }

        placeholder.style.display = "none";
        results.style.display = "block";
        document.getElementById("diskFiltersContainer").style.display = "block";

        renderBaseCharts(data.cpuRam);
        generateDiskFilters(data.disks);

    } catch (e) {
        Swal.fire({
            title: e.title || 'İşlem Başarısız',
            text: e.message,
            icon: 'warning'
        });

        placeholder.innerHTML = `<div class="text-center py-5 mt-5 text-danger opacity-75">
            <i class="bi bi-exclamation-circle me-2 d-block display-4 mb-3"></i> 
            <h5 style="color: var(--text-title);">Analiz Gerçekleştirilemedi</h5>
            <small class="fw-bold" style="color: var(--text-muted);">Lütfen geçerli değerler seçerek tekrar deneyin.</small>
        </div>`;
    }
};

function destroyChart(idOrInstance) {
    if (!idOrInstance) return;
    
    // Eğer instance geldiyse onu kullan
    if (typeof idOrInstance === 'object' && typeof idOrInstance.destroy === 'function') {
        idOrInstance.destroy();
        return;
    }

    // Eğer ID geldiyse global registry'den bul ve imha et (Already in use hatasını kesin önler)
    const chart = Chart.getChart(idOrInstance);
    if (chart) {
        chart.destroy();
    }
}

function renderBaseCharts(cpuRamData) {
    const labels = cpuRamData.map(m => formatChartDate(m.createdAt));
    
    // Güvenli imha
    destroyChart('cpuChart');
    destroyChart('ramChart');
    historyCharts.cpu = null;
    historyCharts.ram = null;

    const startVal = document.getElementById("historyStart")?.value;
    const endVal = document.getElementById("historyEnd")?.value;
    const rangeStart = startVal ? new Date(startVal).getTime() : null;
    const rangeEnd = endVal ? new Date(endVal).getTime() : null;

    if (currentHistoryMode === 'candle') {
        const cpuDataObj = prepareCandleData(cpuRamData, 'cpu');
        const ramDataObj = prepareCandleData(cpuRamData, 'ram');

        historyCharts.cpu = createCandleChart('cpuChart', 'CPU Kullanımı (%)', cpuDataObj.candles, cpuDataObj.labels, null, false, rangeStart, rangeEnd, cpuDataObj.threshold);
        historyCharts.ram = createCandleChart('ramChart', 'RAM Kullanımı (%)', ramDataObj.candles, ramDataObj.labels, null, false, rangeStart, rangeEnd, ramDataObj.threshold);
    } else {
        // Band: null değerler olduğu gibi korunur (Chart.js spanGaps:false ile gap gösterecek)
        const cpuAvg = cpuRamData.map(m => m.cpuAvg != null ? m.cpuAvg : null);
        const cpuMin = cpuRamData.map(m => m.cpuMin != null ? m.cpuMin : null);
        const cpuMax = cpuRamData.map(m => m.cpuMax != null ? m.cpuMax : null);
        
        const ramAvg = cpuRamData.map(m => m.ramAvg != null ? m.ramAvg : null);
        const ramMin = cpuRamData.map(m => m.ramMin != null ? m.ramMin : null);
        const ramMax = cpuRamData.map(m => m.ramMax != null ? m.ramMax : null);

        const tEndData = cpuRamData.map(m => getBucketEndTime(m));
        const rawTimes = cpuRamData.map(m => m.createdAt ? new Date(m.createdAt).getTime() : null);
        const cpuMinTimes = cpuRamData.map(m => m.cpuMinTime ? new Date(m.cpuMinTime).getTime() : null);
        const cpuMaxTimes = cpuRamData.map(m => m.cpuMaxTime ? new Date(m.cpuMaxTime).getTime() : null);
        const ramMinTimes = cpuRamData.map(m => m.ramMinTime ? new Date(m.ramMinTime).getTime() : null);
        const ramMaxTimes = cpuRamData.map(m => m.ramMaxTime ? new Date(m.ramMaxTime).getTime() : null);

        historyCharts.cpu = createBandChart('cpuChart', 'CPU Kullanımı (%)', labels, cpuAvg, cpuMin, cpuMax, '#38bdf8', null, false, tEndData, rawTimes, cpuMinTimes, cpuMaxTimes);
        historyCharts.ram = createBandChart('ramChart', 'RAM Kullanımı (%)', labels, ramAvg, ramMin, ramMax, '#facc15', null, false, tEndData, rawTimes, ramMinTimes, ramMaxTimes);
    }

    // MİNİ RAPOR TETİKLEYİCİLERİ
    generateMiniReport(cpuRamData, 'cpuAvg', 'cpuMiniReport', '%', 'cpuChart');
    generateMiniReport(cpuRamData, 'ramAvg', 'ramMiniReport', '%', 'ramChart');

    // BUCKET ARALIĞI BİLGİSİ
    updateBucketIntervalBadge(cpuRamData);
}

function formatChartDate(dateString) {
    const d = new Date(dateString);
    return d.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function updateBucketIntervalBadge(dataArray) {
    const badge = document.getElementById('bucketIntervalBadge');
    if (!badge) return;

    const validData = dataArray.filter(m => m.cpuAvg != null || m.ramAvg != null);
    if (validData.length < 2) {
        badge.style.cssText = 'display: none !important';
        return;
    }

    // Ardışık noktalar arasındaki farkları hesapla
    const diffs = [];
    for (let i = 0; i < validData.length - 1; i++) {
        const t1 = new Date(validData[i].createdAt).getTime();
        const t2 = new Date(validData[i + 1].createdAt).getTime();
        const diff = t2 - t1;
        if (diff > 0 && diff < 7 * 24 * 60 * 60 * 1000) {
            diffs.push(diff);
        }
    }

    if (diffs.length === 0) {
        badge.style.cssText = 'display: none !important';
        return;
    }

    diffs.sort((a, b) => a - b);
    const bandIntervalMs = diffs[Math.floor(diffs.length / 2)];

    // Mum grafiğinde ikili gruplama yapıldığı için süre ~2 katı
    const thresholdLimit = 300;
    const isGrouped = validData.length > 0 && validData.length < thresholdLimit;
    const candleIntervalMs = isGrouped ? bandIntervalMs * 2 : bandIntervalMs;

    const intervalMs = currentHistoryMode === 'candle' ? candleIntervalMs : bandIntervalMs;
    const label = currentHistoryMode === 'candle' ? 'Her mum' : 'Her nokta';
    const icon = currentHistoryMode === 'candle' ? 'bi-graph-up-arrow' : 'bi-clock-history';

    const formatDuration = (ms) => {
        const totalSec = Math.round(ms / 1000);
        const days = Math.floor(totalSec / 86400);
        const hours = Math.floor((totalSec % 86400) / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        if (days > 0) return hours > 0 ? days + ' g\u00fcn ' + hours + ' saat' : days + ' g\u00fcn';
        if (hours > 0) return mins > 0 ? hours + ' saat ' + mins + ' dk' : hours + ' saat';
        if (mins > 0) return mins + ' dk';
        return totalSec + ' sn';
    };

    badge.style.cssText = '';
    badge.innerHTML = '<span class="badge rounded-pill d-flex align-items-center gap-1" style="background: rgba(13, 202, 240, 0.15); color: #0dcaf0; font-size: 0.78rem; padding: 6px 12px; border: 1px solid rgba(13, 202, 240, 0.3);"><i class="bi ' + icon + '"></i> ' + label + ' \u2248 ' + formatDuration(intervalMs) + '</span>';
}

function generateDiskFilters(disksData) {
    const diskNames = [...new Set(disksData.map(d => d.diskName))];

    const container = document.getElementById('diskCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    const dynamicChartsContainer = document.getElementById('dynamicDiskCharts');
    if (dynamicChartsContainer) dynamicChartsContainer.innerHTML = '';

    // ÖNEMLİ: Mevcut disk grafiklerini imha etmeden objeyi sıfırlama (Canvas reuse hatasını önler)
    if (historyCharts.disks) {
        Object.keys(historyCharts.disks).forEach(key => {
            const chartId = `diskChart_${key.replace(/[^a-zA-Z0-9]/g, '')}`;
            destroyChart(chartId);
        });
    }
    historyCharts.disks = {};

    diskNames.forEach(diskName => {
        const checkboxHtml = `
            <div class="col-4">
                <div class="form-check form-switch p-2 border rounded d-flex flex-column align-items-center justify-content-center text-center shadow-sm h-100" style="background: var(--bg-card); border-color: var(--border-color) !important; margin: 0; padding-left: 0 !important;">
                    <label class="form-check-label fw-bold mb-1 w-100" style="font-size:0.75rem; color:var(--text-main); cursor:pointer;" for="chk_disk_${diskName}">${diskName}</label>
                    <input class="form-check-input disk-toggle custom-toggle m-0" type="checkbox" id="chk_disk_${diskName}" value="${diskName}" style="float:none; width: 2.2em; height: 1.1em;">
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', checkboxHtml);

        const chartId = `diskChart_${diskName.replace(/[^a-zA-Z0-9]/g, '')}`;

        const chartHtml = `
            <div class="card border border-secondary shadow-sm" id="container_${chartId}" style="background-color: var(--bg-card); display: none;">
                <div class="card-body p-2" style="overflow: hidden;">
                    <div style="position: relative; height: 180px; width: 100%;">
                        <canvas id="${chartId}"></canvas>
                    </div>
                    <div id="report_${chartId}" class="mt-3 p-2 rounded" style="background: var(--bg-card-muted); border: 1px solid var(--border-color); display: none;"></div>
                </div>
            </div>
        `;
        dynamicChartsContainer.insertAdjacentHTML('beforeend', chartHtml);

        document.getElementById(`chk_disk_${diskName}`).addEventListener('change', function () {
            toggleDiskChart(this.checked, diskName, chartId);
        });
    });
}

function toggleDiskChart(isVisible, diskName, chartId) {
    const container = document.getElementById(`container_${chartId}`);
    const reportContainer = document.getElementById(`report_${chartId}`);

    // Mevcut grafiği her durumda imha et (reuse hatasını önlemek için)
    destroyChart(chartId);
    if (historyCharts.disks[diskName]) delete historyCharts.disks[diskName];

    if (isVisible) {
        container.style.display = 'block';

        const diskData = currentHistoryData.disks.filter(d => d.diskName === diskName);
        const labels = diskData.map(d => formatChartDate(d.createdAt));

        const startVal = document.getElementById("historyStart")?.value;
        const endVal = document.getElementById("historyEnd")?.value;
        const rangeStart = startVal ? new Date(startVal).getTime() : null;
        const rangeEnd = endVal ? new Date(endVal).getTime() : null;

        if (currentHistoryMode === 'candle') {
            const diskCandles = prepareCandleData(diskData, 'disk');
            historyCharts.disks[diskName] = createCandleChart(chartId, `${diskName} Doluluk Oranı (%)`, diskCandles.candles, diskCandles.labels, diskName, false, rangeStart, rangeEnd, diskCandles.threshold);
        } else {
            // Band: null değerler olduğu gibi korunur (Chart.js spanGaps:false ile gap gösterecek)
            const usedAvg = diskData.map(d => d.usedAvg != null ? d.usedAvg : null);
            const usedMin = diskData.map(d => d.usedMin != null ? d.usedMin : null);
            const usedMax = diskData.map(d => d.usedMax != null ? d.usedMax : null);
            const tEndData = diskData.map(m => getBucketEndTime(m));
            const rawTimes = diskData.map(m => m.createdAt ? new Date(m.createdAt).getTime() : null);
            const usedMinTimes = diskData.map(m => m.usedMinTime ? new Date(m.usedMinTime).getTime() : null);
            const usedMaxTimes = diskData.map(m => m.usedMaxTime ? new Date(m.usedMaxTime).getTime() : null);

            historyCharts.disks[diskName] = createBandChart(chartId, `${diskName} Doluluk Oranı (%)`, labels, usedAvg, usedMin, usedMax, '#10b981', diskName, false, tEndData, rawTimes, usedMinTimes, usedMaxTimes);
        }

        generateMiniReport(diskData, 'usedAvg', `report_${chartId}`, '%', chartId);

    } else {
        container.style.display = 'none';
        if (reportContainer) reportContainer.style.display = 'none';
    }
}

// --- YARDIMCI FONKSİYON: Bucket son zamanını bulur ---
function getBucketEndTime(m) {
    if (!m) return 0;
    if (m.maxCreatedAt) return new Date(m.maxCreatedAt).getTime();
    
    // Mum nesnesinin altındaki/içindeki veri dizisini tarar (Issue 1)
    for (const key in m) {
        const arr = m[key];
        if (Array.isArray(arr) && arr.length > 0 && (arr[0].createdAt || arr[0].ts || arr[0].t)) {
            const times = arr.map(p => new Date(p.createdAt || p.ts || p.t).getTime()).filter(t => !isNaN(t));
            if (times.length > 0) return Math.max(...times);
        }
    }
    return new Date(m.createdAt || m.t || 0).getTime();
}

function createBandChart(canvasId, labelText, labels, avgData, minData, maxData, colorHex, diskName = null, isDrillDown = false, tEndData = null, rawTimes = null, minTimeData = null, maxTimeData = null) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#334155' : '#e2e8f0';
    const gridColor = isLight ? '#cbd5e1' : '#334155';

    // --- CUSTOM PLUGIN: Gap (Çevrimdışı) bölgelerini kırmızı alan olarak tarar ---
    const gapHighlightPlugin = {
        id: 'gapHighlight_' + canvasId,
        beforeDraw(chart) {
            const avgDatasetIndex = 2; // Ortalama dataset'i
            const meta = chart.getDatasetMeta(avgDatasetIndex);
            if (!meta || !meta.data || meta.data.length === 0) return;

            const avgDs = chart.data.datasets[avgDatasetIndex];
            if (!avgDs) return;

            const chartCtx = chart.ctx;
            const yScale = chart.scales.y;
            const data = avgDs.data;

            // Gap bölgelerini tespit et (ardışık null değer aralıkları)
            let gapRegions = [];
            let gapStartIdx = null;

            for (let i = 0; i < data.length; i++) {
                if (data[i] === null || data[i] === undefined) {
                    if (gapStartIdx === null) gapStartIdx = i;
                } else {
                    if (gapStartIdx !== null) {
                        gapRegions.push({ start: gapStartIdx, end: i - 1 });
                        gapStartIdx = null;
                    }
                }
            }
            if (gapStartIdx !== null) {
                gapRegions.push({ start: gapStartIdx, end: data.length - 1 });
            }

            if (gapRegions.length === 0) return;

            chartCtx.save();

            gapRegions.forEach(region => {
                // Kırmızı alanın başlangıç ve bitiş piksellerini hesapla
                // Gap'in öncesindeki son geçerli noktadan, sonrasındaki ilk geçerli noktaya kadar
                const prevIdx = region.start > 0 ? region.start - 1 : 0;
                const nextIdx = region.end < data.length - 1 ? region.end + 1 : data.length - 1;

                const prevPoint = meta.data[prevIdx];
                const nextPoint = meta.data[nextIdx];

                if (!prevPoint || !nextPoint) return;

                // Issue 4: Kesinti başlangıcını son geçerli verinin zamanına göre hesapla (p1.x bucket merkezi ise, biraz sağa kaydır)
                const x1 = prevPoint.x + 0.4; 
                const x2 = nextPoint.x - 0.4;
                const yTop = yScale.top;
                const yBottom = yScale.bottom;
                const width = x2 - x1;

                if (width <= 0) return;

                // Kırmızı yarı-saydam dolgu
                const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
                chartCtx.fillStyle = isLightTheme ? 'rgba(239, 68, 68, 0.10)' : 'rgba(239, 68, 68, 0.12)';
                chartCtx.fillRect(x1, yTop, width, yBottom - yTop);

                // Kesikli kırmızı kenarlık çizgileri
                chartCtx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
                chartCtx.lineWidth = 1.5;
                chartCtx.setLineDash([6, 4]);

                chartCtx.beginPath();
                chartCtx.moveTo(x1, yTop);
                chartCtx.lineTo(x1, yBottom);
                chartCtx.stroke();

                chartCtx.beginPath();
                chartCtx.moveTo(x2, yTop);
                chartCtx.lineTo(x2, yBottom);
                chartCtx.stroke();

                chartCtx.setLineDash([]);

                // Gap bölgesinin ortasına "Çevrimdışı" etiketi
                if (width > 50) {
                    const centerX = x1 + width / 2;
                    const centerY = yTop + (yBottom - yTop) / 2;
                    
                    chartCtx.font = 'bold 10px Inter, sans-serif';
                    chartCtx.textAlign = 'center';
                    chartCtx.textBaseline = 'middle';
                    chartCtx.fillStyle = isLightTheme ? 'rgba(220, 38, 38, 0.6)' : 'rgba(252, 129, 129, 0.7)';
                    chartCtx.fillText('⏻ Çevrimdışı', centerX, centerY);
                }
            });

            chartCtx.restore();
        },
        afterDraw(chart) {
            if (chart._averageLineValue !== undefined) {
                const yValue = chart._averageLineValue;
                const yScale = chart.scales.y;
                const yPos = yScale.getPixelForValue(yValue);
                const ctx = chart.ctx;

                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([10, 5]);
                ctx.strokeStyle = '#0dcaf0';
                ctx.lineWidth = 2;
                ctx.moveTo(chart.chartArea.left, yPos);
                ctx.lineTo(chart.chartArea.right, yPos);
                ctx.stroke();
                ctx.restore();
            }
        }
    };

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Maksimum',
                    data: isDrillDown ? maxData.map((v, i) => ({ x: i, y: v })) : maxData,
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    pointRadius: 0,
                    fill: false,
                    tension: 0.3,
                    spanGaps: false
                },
                {
                    label: 'Minimum',
                    data: isDrillDown ? minData.map((v, i) => ({ x: i, y: v })) : minData,
                    borderColor: 'transparent',
                    backgroundColor: colorHex + '33',
                    pointRadius: 0,
                    fill: '-1',
                    tension: 0.3,
                    spanGaps: false
                },
                {
                    label: labelText + ' (Ortalama)',
                    data: isDrillDown ? avgData.map((v, i) => ({ x: i, y: v })) : avgData,
                    borderColor: colorHex,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 1,
                    pointHoverRadius: 6,
                    spanGaps: false
                }
            ]
        },
        plugins: [gapHighlightPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    let startTime, endTime;

                    if (isDrillDown && rawTimes) {
                        if (avgData[index] == null) return;
                        startTime = new Date(rawTimes[index]).toISOString();
                        endTime = (index < rawTimes.length - 1) ? new Date(rawTimes[index + 1]).toISOString() : new Date(new Date(rawTimes[index]).getTime() + 60000).toISOString();
                        if (new Date(endTime).getTime() - new Date(startTime).getTime() <= 60000) return;
                    } else if (diskName) {
                        const dData = currentHistoryData.disks.filter(d => d.diskName === diskName);
                        // Gap noktasına (null değerli) tıklanmışsa drill-down açma
                        if (dData[index] && dData[index].usedAvg == null) return;
                        startTime = dData[index].createdAt;
                        endTime = (index < dData.length - 1) ? dData[index + 1].createdAt : new Date(new Date(startTime).getTime() + 60000).toISOString();
                    } else {
                        // Gap noktasına (null değerli) tıklanmışsa drill-down açma
                        if (currentHistoryData.cpuRam[index] && currentHistoryData.cpuRam[index].cpuAvg == null) return;
                        startTime = currentHistoryData.cpuRam[index].createdAt;
                        endTime = (index < currentHistoryData.cpuRam.length - 1) ? currentHistoryData.cpuRam[index + 1].createdAt : new Date(new Date(startTime).getTime() + 60000).toISOString();
                    }

                    window.openBucketDetail(startTime, endTime, labelText, diskName);
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                zoom: isDrillDown ? {
                    limits: {
                        x: { min: -0.5, max: labels.length - 0.5, minRange: 1 }
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                    },
                    pan: {
                        enabled: true,
                        mode: 'x',
                        threshold: 5,
                    }
                } : {},
                legend: {
                    onClick: function(e, legendItem, legend) {
                        const chart = legend.chart;
                        const isVisible = chart.isDatasetVisible(legendItem.datasetIndex);
                        if (isVisible) {
                            chart.setDatasetVisibility(0, false);
                            chart.setDatasetVisibility(1, false);
                            chart.setDatasetVisibility(2, false);
                        } else {
                            chart.setDatasetVisibility(0, true);
                            chart.setDatasetVisibility(1, true);
                            chart.setDatasetVisibility(2, true);
                        }
                        chart.update('none');
                    },
                    labels: {
                        color: textColor,
                        font: { weight: 'bold' },
                        filter: function(item) {
                            return item.text.includes('Ortalama');
                        }
                    }
                },
                tooltip: {
                    filter: function(tooltipItem) {
                        return tooltipItem.chart.isDatasetVisible(tooltipItem.datasetIndex);
                    },
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(tooltipItems) {
                            if (!tooltipItems || tooltipItems.length === 0) return '';
                            const idx = tooltipItems[0].dataIndex;
                            const isGap = avgData[idx] === null || avgData[idx] === undefined;
                            if (isGap) {
                                return '⚠ Çevrimdışı Bölge';
                            }
                            
                            const chart = tooltipItems[0].chart;
                            const formatDetailedDate = (ms) => ms ? new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                            
                            // Sadece vurgulanan index ile tooltip index'i eşleşirse özel başlık göster
                            if (chart._highlightType && chart._highlightIdx === idx) {
                                const highlightTime = chart._highlightTime;
                                // Vurgulanan tipe göre doğru değeri ve zamanı al
                                let highlightVal, highlightTimeMs;
                                if (chart._highlightType === 'max') {
                                    highlightVal = maxData[idx] != null ? maxData[idx] : (avgData[idx] != null ? avgData[idx] : 0);
                                    highlightTimeMs = highlightTime || (maxTimeData ? maxTimeData[idx] : (rawTimes ? rawTimes[idx] : null));
                                    return `🚩 Maksimum Noktası: ${highlightVal.toFixed(1)}% - ${formatDetailedDate(highlightTimeMs)}`;
                                }
                                if (chart._highlightType === 'min') {
                                    highlightVal = minData[idx] != null ? minData[idx] : (avgData[idx] != null ? avgData[idx] : 0);
                                    highlightTimeMs = highlightTime || (minTimeData ? minTimeData[idx] : (rawTimes ? rawTimes[idx] : null));
                                    return `⬇ Minimum Noktası: ${highlightVal.toFixed(1)}% - ${formatDetailedDate(highlightTimeMs)}`;
                                }
                                if (chart._highlightType === 'peak') {
                                    highlightVal = maxData[idx] != null ? maxData[idx] : (avgData[idx] != null ? avgData[idx] : 0);
                                    highlightTimeMs = highlightTime || (maxTimeData ? maxTimeData[idx] : (rawTimes ? rawTimes[idx] : null));
                                    return `⚠ Zirve Noktası: ${highlightVal.toFixed(1)}% - ${formatDetailedDate(highlightTimeMs)}`;
                                }
                            }

                            const tStartStr = formatDetailedDate(rawTimes ? rawTimes[idx] : null) || labels[idx];
                            const tEndMs = tEndData && tEndData[idx] ? tEndData[idx] : null;
                            const rTimeMs = rawTimes ? rawTimes[idx] : null;
                            const tEndStr = (tEndMs && rTimeMs && tEndMs > rTimeMs && tEndMs - rTimeMs > 60000) ? formatDetailedDate(tEndMs) : tStartStr;

                            return tStartStr === tEndStr ? tStartStr : tStartStr + ' ile ' + tEndStr + ' arası';
                        },
                        afterTitle: function(tooltipItems) {
                            if (!tooltipItems || tooltipItems.length === 0) return '';
                            const idx = tooltipItems[0].dataIndex;
                            const chart = tooltipItems[0].chart;

                            // Eğer butonla vurgulama yapılmışsa ve doğru index'teyse alt bilgileri gösterme
                            if (chart._highlightType && chart._highlightIdx === idx) return '';

                            const currentIsValid = avgData[idx] !== null && avgData[idx] !== undefined;
                            if (!currentIsValid) return '';

                            // Bu noktanın hemen ardında bir gap (çevrimdışı bölge) var mı kontrol et
                            const nextIdx = idx + 1;
                            if (nextIdx >= avgData.length) return '';
                            const nextIsGap = avgData[nextIdx] === null || avgData[nextIdx] === undefined;
                            if (!nextIsGap) return '';

                            // Ham veri kaynağını belirle
                            const rawDataSource = diskName
                                ? (currentHistoryData.disks || []).filter(d => d.diskName === diskName)
                                : (currentHistoryData.cpuRam || []);

                            // Detaylı tarih formatlayıcı
                            const formatDetailedDate = (dateStr) => {
                                const d = new Date(dateStr);
                                return d.toLocaleDateString('tr-TR', {
                                    day: 'numeric', month: 'short', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                                    hour12: false
                                });
                            };

                            // Gap'in bittiği ilk geçerli noktayı bul
                            let resumeIdx = null;
                            for (let i = nextIdx; i < avgData.length; i++) {
                                if (avgData[i] !== null && avgData[i] !== undefined) {
                                    resumeIdx = i;
                                    break;
                                }
                            }

                            // Kesinti süresini ve zamanlarını hesapla
                            const cutOffRaw = rawDataSource[idx];
                            const resumeRaw = resumeIdx !== null ? rawDataSource[resumeIdx] : null;

                            let infoLines = ['─────────────────────', '⏻ Sonraki Çevrimdışı Bölge:'];

                            if (cutOffRaw) {
                                infoLines.push('  Kesilme: ' + formatDetailedDate(cutOffRaw.createdAt));
                            }
                            if (resumeRaw) {
                                infoLines.push('  Geri gelme: ' + formatDetailedDate(resumeRaw.createdAt));
                            }

                            if (cutOffRaw && resumeRaw) {
                                const diffMs = new Date(resumeRaw.createdAt) - new Date(cutOffRaw.createdAt);
                                const totalMin = Math.floor(diffMs / 60000);
                                const days = Math.floor(totalMin / 1440);
                                const hours = Math.floor((totalMin % 1440) / 60);
                                const mins = totalMin % 60;
                                let durationParts = [];
                                if (days > 0) durationParts.push(days + ' gün');
                                if (hours > 0) durationParts.push(hours + ' saat');
                                if (mins > 0) durationParts.push(mins + ' dk');
                                if (durationParts.length > 0) {
                                    infoLines.push('  Süre: ~' + durationParts.join(' '));
                                }
                            } else if (!resumeRaw) {
                                infoLines.push('  Süre: Henüz geri gelmedi');
                            }

                            return infoLines.join('\n');
                        },
                        label: function(context) {
                            const idx = context.dataIndex;
                            const isGap = avgData[idx] === null || avgData[idx] === undefined;

                            if (isGap) {
                                // Sadece ilk dataset'te kesinti bilgisini göster, diğerlerini gizle
                                if (context.datasetIndex !== 0) return null;
                                return '⏻ Cihaz çevrimdışı — Veri yok';
                            }

                            const chart = context.chart;
                            if (chart._highlightType && chart._highlightIdx === idx) return null;

                            const val = context.parsed.y !== null && context.parsed.y !== undefined ? context.parsed.y.toFixed(2) + '%' : '';
                            const formatDetailedDate = (ms) => ms ? new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

                            if (context.datasetIndex === 0) {
                                const tStr = formatDetailedDate(maxTimeData ? maxTimeData[idx] : (rawTimes ? rawTimes[idx] : null)) || 'Bilinmiyor';
                                return `En Yüksek: ${val} - ${tStr}`;
                            } else if (context.datasetIndex === 1) {
                                const tStr = formatDetailedDate(minTimeData ? minTimeData[idx] : (rawTimes ? rawTimes[idx] : null)) || 'Bilinmiyor';
                                return `En Düşük: ${val} - ${tStr}`;
                            } else {
                                return `Ortalama: ${val}`;
                            }
                        },
                        labelColor: function(context) {
                            const idx = context.dataIndex;
                            const isGap = avgData[idx] === null || avgData[idx] === undefined;
                            if (isGap) {
                                return {
                                    borderColor: 'rgba(239, 68, 68, 0.8)',
                                    backgroundColor: 'rgba(239, 68, 68, 0.3)',
                                    borderWidth: 2,
                                    borderRadius: 2
                                };
                            }

                            // Gap'den önceki son geçerli noktaysa farklı renk göster
                            const nextIdx = idx + 1;
                            const isBeforeGap = nextIdx < avgData.length && (avgData[nextIdx] === null || avgData[nextIdx] === undefined);
                            if (isBeforeGap && context.datasetIndex === 2) {
                                return {
                                    borderColor: 'rgba(251, 191, 36, 0.9)',
                                    backgroundColor: 'rgba(251, 191, 36, 0.4)',
                                    borderWidth: 2,
                                    borderRadius: 2
                                };
                            }

                            return {
                                borderColor: context.dataset.borderColor || 'transparent',
                                backgroundColor: context.dataset.borderColor || context.dataset.backgroundColor || 'transparent'
                            };
                        }
                    }
                }
            },
            locale: 'tr-TR',
            scales: {
                x: { 
                    type: isDrillDown ? 'linear' : undefined, // Issue 3: Overlap önlemek için linear scale kullan
                    offset: false,
                    min: isDrillDown ? -0.5 : undefined,
                    max: isDrillDown ? labels.length - 0.5 : undefined,
                    ticks: { 
                        color: textColor, 
                        maxTicksLimit: 10,
                        callback: function(value) {
                            if (!isDrillDown) return this.getLabelForValue(value);
                            const idx = Math.round(value);
                            if (idx >= 0 && idx < labels.length) return labels[idx];
                            return '';
                        }
                    }, 
                    grid: { color: gridColor, offset: false } 
                },
                y: { min: 0, max: 100, ticks: { color: textColor }, grid: { color: gridColor } }
            }
        }
    });
}

/**
 * Mum grafiği verisini hazırlar. Eğer veri sayısı azsa ikili gruplama yaparak 
 * mum gövdesi oluşmasını sağlar (çizgi görünümünü engeller).
 */
function prepareCandleData(rawData, prefix) {
    if (!rawData || rawData.length === 0) return { candles: [], labels: [], threshold: 5 * 60 * 1000 };

    const mappedRawData = rawData.map((m, idx) => ({ ...m, rawIndex: idx }));
    const validData = mappedRawData.filter(m => (m[prefix + 'Avg'] != null || m.usedAvg != null));

    let minInterval = Infinity;
    for (let i = 0; i < validData.length - 1; i++) {
        const diff = new Date(validData[i+1].createdAt).getTime() - new Date(validData[i].createdAt).getTime();
        if (diff > 0 && diff < minInterval) minInterval = diff;
    }
    const dynamicThreshold = minInterval !== Infinity ? minInterval * 1.5 : 5 * 60 * 1000;

    const thresholdLimit = 300; 
    const shouldGroup = validData.length > 0 && validData.length < thresholdLimit;

    let candles = [];
    let labels = rawData.map(m => formatChartDate(m.createdAt));

    if (shouldGroup) {
        for (let i = 0; i < validData.length; i += 2) {
            const d1 = validData[i];
            const d2 = (i + 1 < validData.length) ? validData[i + 1] : null;

            if (d2) {
                const d1Max = d1[prefix + 'Max'] ?? d1[prefix + 'Avg'] ?? d1.usedMax ?? d1.usedAvg;
                const d2Max = d2[prefix + 'Max'] ?? d2[prefix + 'Avg'] ?? d2.usedMax ?? d2.usedAvg;
                const d1Min = d1[prefix + 'Min'] ?? d1[prefix + 'Avg'] ?? d1.usedMin ?? d1.usedAvg;
                const d2Min = d2[prefix + 'Min'] ?? d2[prefix + 'Avg'] ?? d2.usedMin ?? d2.usedAvg;
                
                const hVal = Math.max(d1Max, d2Max);
                const lVal = Math.min(d1Min, d2Min);
                
                const hTimeStr = (hVal === d1Max) ? (d1[prefix + 'MaxTime'] || d1.usedMaxTime || d1.createdAt) : (d2[prefix + 'MaxTime'] || d2.usedMaxTime || d2.createdAt);
                const lTimeStr = (lVal === d1Min) ? (d1[prefix + 'MinTime'] || d1.usedMinTime || d1.createdAt) : (d2[prefix + 'MinTime'] || d2.usedMinTime || d2.createdAt);

                candles.push({
                    x: (d1.rawIndex + d2.rawIndex) / 2, // Tam aralarına yerleştir
                    t: new Date(d1.createdAt).getTime(),
                    tEnd: getBucketEndTime(d2),
                    o: d1[prefix + 'Open'] ?? d1[prefix + 'Avg'] ?? d1.usedOpen ?? d1.usedAvg,
                    h: hVal,
                    hTime: new Date(hTimeStr).getTime(),
                    l: lVal,
                    lTime: new Date(lTimeStr).getTime(),
                    c: d2[prefix + 'Close'] ?? d2[prefix + 'Avg'] ?? d2.usedClose ?? d2.usedAvg
                });
            } else {
                candles.push({
                    x: d1.rawIndex,
                    t: new Date(d1.createdAt).getTime(),
                    tEnd: getBucketEndTime(d1),
                    o: d1[prefix + 'Open'] ?? d1[prefix + 'Avg'] ?? d1.usedOpen ?? d1.usedAvg,
                    h: d1[prefix + 'Max'] ?? d1[prefix + 'Avg'] ?? d1.usedMax ?? d1.usedAvg,
                    hTime: new Date(d1[prefix + 'MaxTime'] || d1.usedMaxTime || d1.createdAt).getTime(),
                    l: d1[prefix + 'Min'] ?? d1[prefix + 'Avg'] ?? d1.usedMin ?? d1.usedAvg,
                    lTime: new Date(d1[prefix + 'MinTime'] || d1.usedMinTime || d1.createdAt).getTime(),
                    c: d1[prefix + 'Close'] ?? d1[prefix + 'Avg'] ?? d1.usedClose ?? d1.usedAvg
                });
            }
        }
    } else {
        validData.forEach((m) => {
            candles.push({
                x: m.rawIndex,
                t: new Date(m.createdAt).getTime(),
                tEnd: getBucketEndTime(m),
                o: m[prefix + 'Open'] ?? m.usedOpen ?? m[prefix + 'Avg'] ?? m.usedAvg,
                h: m[prefix + 'Max'] ?? m.usedMax ?? m[prefix + 'Avg'] ?? m.usedAvg,
                hTime: new Date(m[prefix + 'MaxTime'] || m.usedMaxTime || m.createdAt).getTime(),
                l: m[prefix + 'Min'] ?? m.usedMin ?? m[prefix + 'Avg'] ?? m.usedAvg,
                lTime: new Date(m[prefix + 'MinTime'] || m.usedMinTime || m.createdAt).getTime(),
                c: m[prefix + 'Close'] ?? m.usedClose ?? m[prefix + 'Avg'] ?? m.usedAvg
            });
        });
    }
    return { candles, labels, threshold: dynamicThreshold };
}

function createCandleChart(canvasId, labelText, candleData, labels, diskName = null, isDrillDown = false, rangeStart = null, rangeEnd = null, gapThreshold = 300000) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    if (typeof Chart !== 'undefined' && Chart.FinancialController) {
         Chart.register(Chart.FinancialController, Chart.CandlestickElement);
    }

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#334155' : '#e2e8f0';
    const gridColor = isLight ? '#cbd5e1' : '#334155';

    // --- CUSTOM PLUGIN: Zaman atlamalarını (Kesintileri) ince çizgilerle gösterir ---
    const gapHighlightPlugin = {
        id: 'gapHighlight_' + canvasId,
        beforeDraw(chart) {
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || meta.data.length === 0) return;

            const chartCtx = chart.ctx;
            const yScale = chart.scales.y;
            const xScale = chart.scales.x;
            const data = chart.data.datasets[0].data;
            const threshold = gapThreshold;
            const yTop = yScale.top;
            const yBottom = yScale.bottom;
            const yHeight = yBottom - yTop;

            chartCtx.save();

            const drawHatchedArea = (xStart, xEnd) => {
                const width = xEnd - xStart;
                if (width <= 0) return;

                // Hafif kırmızı zemin
                chartCtx.fillStyle = 'rgba(239, 68, 68, 0.1)';
                chartCtx.fillRect(xStart, yTop, width, yHeight);

                // Taralı (Diagonal) çizgiler
                chartCtx.save();
                chartCtx.beginPath();
                chartCtx.rect(xStart, yTop, width, yHeight);
                chartCtx.clip();
                
                chartCtx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
                chartCtx.lineWidth = 1;
                for (let x = xStart - yHeight; x < xEnd + yHeight; x += 10) {
                    chartCtx.moveTo(x, yTop);
                    chartCtx.lineTo(x + yHeight, yBottom);
                }
                chartCtx.stroke();
                chartCtx.restore();

                // Kenar çizgisi (Opsiyonel)
                chartCtx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
                chartCtx.setLineDash([4, 4]);
                chartCtx.beginPath();
                chartCtx.moveTo(xEnd === xScale.right ? xStart : xEnd, yTop);
                chartCtx.lineTo(xEnd === xScale.right ? xStart : xEnd, yBottom);
                chartCtx.stroke();
                chartCtx.setLineDash([]);
            };

            const drawGapLine = (x) => {
                chartCtx.fillStyle = 'rgba(239, 68, 68, 0.2)';
                chartCtx.fillRect(x - 2, yTop, 4, yHeight);
                chartCtx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
                chartCtx.lineWidth = 1;
                chartCtx.setLineDash([4, 4]);
                chartCtx.beginPath();
                chartCtx.moveTo(x, yTop);
                chartCtx.lineTo(x, yBottom);
                chartCtx.stroke();
                chartCtx.setLineDash([]);
                chartCtx.font = 'bold 10px Inter, sans-serif';
                chartCtx.fillStyle = isLight ? '#ef4444' : '#fca5a5';
                chartCtx.textAlign = 'center';
                chartCtx.fillText('⏻', x, yTop + 15);
            };

            // 1. Başlangıçtaki boşluk (Taralı Alan)
            if (rangeStart && data[0].t - rangeStart > threshold) {
                const firstCandle = meta.data[0];
                const width = firstCandle.width || 10;
                drawHatchedArea(xScale.left, firstCandle.x - width / 2 - 2);
            }

            // 2. Aralardaki boşluklar (İnce Çizgi)
            for (let i = 0; i < data.length - 1; i++) {
                const currentEndT = data[i].tEnd || data[i].t; // Issue 1 Fix
                if (data[i+1].t - currentEndT > threshold) {
                    const p1 = meta.data[i];
                    if (p1) {
                        const width = p1.width || 10;
                        drawGapLine(p1.x + width / 2 + 5); 
                    }
                }
            }

            // 3. Sondaki boşluk (Taralı Alan)
            const lastData = data[data.length - 1];
            const lastEndT = lastData.tEnd || lastData.t;
            if (rangeEnd && rangeEnd - lastEndT > threshold) {
                const lastCandle = meta.data[data.length - 1];
                const width = lastCandle.width || 10;
                drawHatchedArea(lastCandle.x + width / 2 + 2, xScale.right);
            }

            chartCtx.restore();
        },
        afterDraw(chart) {
            if (chart._averageLineValue !== undefined) {
                const yValue = chart._averageLineValue;
                const yScale = chart.scales.y;
                const yPos = yScale.getPixelForValue(yValue);
                const ctx = chart.ctx;

                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([10, 5]);
                ctx.strokeStyle = '#0dcaf0';
                ctx.lineWidth = 2;
                ctx.moveTo(chart.chartArea.left, yPos);
                ctx.lineTo(chart.chartArea.right, yPos);
                ctx.stroke();
                ctx.restore();
            }
        }
    };

    return new Chart(ctx, {
        type: 'candlestick',
        data: {
            datasets: [{
                label: labelText,
                data: candleData,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                barPercentage: 0.95,
                categoryPercentage: 0.95,
                maxBarThickness: 15, // Issue Fix: Az veri olduğunda mumların aşırı genişlemesini engelle
                color: {
                    up: '#10b981',
                    down: '#ef4444',
                    unchanged: '#94a3b8'
                }
            }]
        },
        plugins: [gapHighlightPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements, chart) => {
                let index = -1;
                if (elements.length > 0) {
                    index = elements[0].index;
                } else {
                    const nativeEvent = event.native || event;
                    const activeEls = chart.getElementsAtEventForMode(nativeEvent, 'nearest', { intersect: false }, true);
                    if (activeEls.length > 0) index = activeEls[0].index;
                }

                if (index >= 0 && index < candleData.length) {
                    const candle = candleData[index];
                    const startTimeMs = candle.t;
                    let endTimeMs = (index < candleData.length - 1) ? candleData[index + 1].t : (candle.tEnd && candle.tEnd > candle.t ? candle.tEnd : candle.t + Math.max(gapThreshold, 3600000));
                    
                    if (isDrillDown) {
                        if (endTimeMs - startTimeMs <= 60000) return; 
                    }

                    window.openBucketDetail(new Date(startTimeMs).toISOString(), new Date(endTimeMs).toISOString(), labelText, diskName);
                }
            },
            layout: { padding: { bottom: 20 } },
            parsing: false,
            scales: {
                x: {
                    type: 'linear',
                    offset: false, // Issue 2: Kenar boşluklarını kaldır
                    min: -0.5,
                    max: labels.length - 0.5,
                    ticks: {
                        color: textColor,
                        maxTicksLimit: 10,
                        callback: function(value) {
                            const idx = Math.round(value);
                            if (idx >= 0 && idx < labels.length) return labels[idx];
                            return '';
                        }
                    },
                    grid: { color: gridColor, offset: false }
                },
                y: { min: 0, max: 100, ticks: { color: textColor }, grid: { color: gridColor } }
            },
            locale: 'tr-TR',
            plugins: {
                zoom: isDrillDown ? {
                    limits: {
                        x: {
                            min: -0.5,
                            max: labels.length > 0 ? labels.length - 0.5 : undefined,
                            minRange: 1
                        }
                    },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
                    pan: { enabled: true, mode: 'x', threshold: 5 }
                } : {},
                legend: {
                    onClick: function(e, legendItem, legend) {
                        const chart = legend.chart;
                        const index = legendItem.datasetIndex;
                        chart.setDatasetVisibility(index, !chart.isDatasetVisible(index));
                        chart.update('none');
                    },
                    labels: { color: textColor, font: { weight: 'bold' } }
                },
                tooltip: {
                    filter: function(tooltipItem) {
                        return tooltipItem.chart.isDatasetVisible(tooltipItem.datasetIndex);
                    },
                    callbacks: {
                        title: function(tooltipItems) {
                            if (!tooltipItems || tooltipItems.length === 0) return '';
                            const idx = tooltipItems[0].dataIndex;
                            const chart = tooltipItems[0].chart;
                            const p = chart.data.datasets[0].data[idx];
                            
                            const formatDetailedDate = (ms) => new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

                            // Sadece vurgulanan index ile tooltip index'i eşleşirse özel başlık göster
                            if (chart._highlightType && chart._highlightIdx === idx) {
                                const highlightTime = chart._highlightTime;
                                const hTimeStr = formatDetailedDate(highlightTime || p.hTime || p.t);
                                const lTimeStr = formatDetailedDate(highlightTime || p.lTime || p.t);

                                if (chart._highlightType === 'max') return `🚩 Maksimum Noktası: ${p.h.toFixed(1)}% - ${hTimeStr}`;
                                if (chart._highlightType === 'min') return `⬇ Minimum Noktası: ${p.l.toFixed(1)}% - ${lTimeStr}`;
                                if (chart._highlightType === 'peak') return `⚠ Zirve Noktası: ${p.h.toFixed(1)}% - ${hTimeStr}`;
                            }

                            let timeStr = formatDetailedDate(p.t);
                            if (p.tEnd && p.tEnd > p.t && p.tEnd - p.t > 60000) {
                                timeStr += ' - ' + formatDetailedDate(p.tEnd);
                            }

                            return timeStr;
                        },
                        afterTitle: function(tooltipItems) {
                            if (!tooltipItems || tooltipItems.length === 0) return '';
                            const idx = tooltipItems[0].dataIndex;
                            const chart = tooltipItems[0].chart;
                            if (chart._highlightType && chart._highlightIdx === idx) return '';
                            const t1End = candleData[idx].tEnd || candleData[idx].t;
                            const formatDetailedDate = (ms) => new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

                            if (idx + 1 >= candleData.length) {
                                if (rangeEnd && (rangeEnd - t1End) > gapThreshold) {
                                    const diffMs = rangeEnd - t1End;
                                    const totalMin = Math.floor(diffMs / 60000);
                                    return [
                                        '─────────────────────',
                                        '⏻ Sonrasında Kesinti Tespit Edildi:',
                                        '  Kesilme: ' + formatDetailedDate(t1End),
                                        '  Geri gelme: (Seçili Dönem Sonu)',
                                        '  Süre: ~' + totalMin + ' dk'
                                    ].join('\n');
                                }
                                return '';
                            }

                            const t2 = candleData[idx + 1].t;
                            const diffMs = t2 - t1End; // Issue Fix: t yerine tEnd kullanarak gruplanmış verilerde sahte kesintiyi engelle

                            if (diffMs > gapThreshold) {
                                const totalMin = Math.floor(diffMs / 60000);
                                
                                return [
                                    '─────────────────────',
                                    '⏻ Sonraki Kesinti Tespit Edildi:',
                                    '  Kesilme: ' + formatDetailedDate(t1End),
                                    '  Geri gelme: ' + formatDetailedDate(t2),
                                    '  Süre: ~' + totalMin + ' dk'
                                ].join('\n');
                            }
                            return '';
                        },
                        label: function(context) {
                            const chart = context.chart;
                            if (chart._highlightType && chart._highlightIdx === context.dataIndex) return null;

                            const p = context.raw;
                            const formatDetailedDate = (ms) => ms ? new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                            let timeStr = formatDetailedDate(p.t);
                            let timeEndStr = (p.tEnd && p.tEnd > p.t && p.tEnd - p.t > 60000) ? formatDetailedDate(p.tEnd) : timeStr;

                            let maxTimeStr = p.hTime ? formatDetailedDate(p.hTime) : (timeStr === timeEndStr ? timeStr : timeStr + ' ile ' + timeEndStr + ' arası');
                            let minTimeStr = p.lTime ? formatDetailedDate(p.lTime) : (timeStr === timeEndStr ? timeStr : timeStr + ' ile ' + timeEndStr + ' arası');

                            return [
                                `Açılış: ${p.o.toFixed(1)}% - ${timeStr}`,
                                `En Yüksek: ${p.h.toFixed(1)}% - ${maxTimeStr}`,
                                `En Düşük: ${p.l.toFixed(1)}% - ${minTimeStr}`,
                                `Kapanış: ${p.c.toFixed(1)}% - ${timeEndStr}`
                            ];
                        },
                        labelColor: function(context) {
                            return { borderColor: '#6366f1', backgroundColor: '#6366f1' };
                        }
                    }
                }
            }
        }
    });
}

window.setHistoryMode = function(mode) {
    currentHistoryMode = mode;
    
    document.getElementById('mode-band-btn').classList.toggle('active', mode === 'band');
    document.getElementById('mode-candle-btn').classList.toggle('active', mode === 'candle');

    if (currentHistoryData) {
        renderBaseCharts(currentHistoryData.cpuRam);
        updateBucketIntervalBadge(currentHistoryData.cpuRam);
        
        const activeDisks = [];
        document.querySelectorAll('.disk-toggle:checked').forEach(input => {
            activeDisks.push({
                name: input.value,
                id: `diskChart_${input.value.replace(/[^a-zA-Z0-9]/g, '')}`
            });
        });

        activeDisks.forEach(d => {
            toggleDiskChart(true, d.name, d.id);
        });
    }
};

function generateMiniReport(dataList, valueKey, containerId, unit = '%', canvasId = null) {
    const container = document.getElementById(containerId);
    if (!container || !dataList || dataList.length === 0) return;

    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour12: false });
    };

    // GAP INJECTION: null değerli (boşluk) noktaları istatistik hesaplamalarından dışla
    const validDataList = dataList.filter(item => item[valueKey] != null);
    if (validDataList.length === 0) {
        container.innerHTML = '<div class="text-center small fst-italic py-3" style="color: var(--text-muted);"><i class="bi bi-info-circle"></i> Bu aralıkta geçerli veri noktası bulunamadı.</div>';
        container.style.display = 'block';
        return;
    }

    let maxItem = validDataList[0];
    let minItem = validDataList[0];
    let maxItemValue = -1;
    let minItemValue = 999999;
    let sum = 0;

    // 1. Min, Max, Ortalama Bulma
    // Eğer veride Min/Max alanları varsa (Band Chart için gelmişse) mutlak değerleri oradan alıyoruz
    const minKey = valueKey.replace('Avg', 'Min');
    const maxKey = valueKey.replace('Avg', 'Max');

    validDataList.forEach(item => {
        let val = item[valueKey];
        sum += val;

        // Mutlak maksimum/minimum bulma (Band verisi varsa ona bak, yoksa Avg'ye bak)
        let itemMax = (item[maxKey] != null) ? item[maxKey] : val;
        let itemMin = (item[minKey] != null) ? item[minKey] : val;

        if (itemMax > maxItemValue) {
            maxItemValue = itemMax;
            maxItem = item;
        }
        if (itemMin < minItemValue) {
            minItemValue = itemMin;
            minItem = item;
        }
    });

    // Rapor için değerleri sabitleyelim (maxItemValue ve minItemValue'yu UI'da göstereceğiz)
    const displayMax = maxItemValue;
    const displayMin = minItemValue;

    let avg = sum / validDataList.length;

    let aboveAvgList = validDataList.filter(item => {
        let itemMax = (item[maxKey] != null) ? item[maxKey] : item[valueKey];
        return itemMax > avg && item.createdAt !== maxItem.createdAt;
    });
    aboveAvgList.sort((a, b) => {
        let aMax = (a[maxKey] != null) ? a[maxKey] : a[valueKey];
        let bMax = (b[maxKey] != null) ? b[maxKey] : b[valueKey];
        return bMax - aMax;
    });

    // Zirve Noktaları Filtreleme (En az 5 dk aralıklı top 8)
    let top8 = [];
    const MIN_TIME_DIFF_MS = 5 * 60 * 1000;

    for (let item of aboveAvgList) {
        if (top8.length >= 8) break;

        const itemTime = new Date(item.createdAt).getTime();
        const isTooClose = top8.some(topItem => {
            return Math.abs(new Date(topItem.createdAt).getTime() - itemTime) < MIN_TIME_DIFF_MS;
        });

        if (!isTooClose) {
            top8.push(item);
        }
    }

    let html = `
        <div class="row g-2 text-center text-md-start small">
            <div class="col-md-4" style="cursor: pointer;" onclick="window.highlightChartPoint('${canvasId}', '${minItem[minKey + 'Time'] || minItem.createdAt}', 'min')" title="Grafikte göster">
                <div class="p-2 border rounded border-success h-100 transition-all" style="background: rgba(255, 255, 255, 0.05);">
                    <div class="text-success fw-bold"><i class="bi bi-arrow-down-circle-fill"></i> Minimum</div>
                    <span class="fs-5 fw-bold" style="color: var(--text-main);">${displayMin.toFixed(1)}${unit}</span><br>
                    <span style="font-size: 0.75rem; color: var(--text-muted); opacity: 0.9;">${formatDate(minItem[minKey + 'Time'] || minItem.createdAt)}</span>
                </div>
            </div>

            <div class="col-md-4" style="cursor: pointer;" onclick="window.toggleAverageLine('${canvasId}', ${avg.toFixed(1)})" title="Ortalama çizgisini göster/gizle">
                <div class="p-2 border rounded border-info h-100 transition-all" style="background: rgba(255, 255, 255, 0.05);">
                    <div class="text-info fw-bold"><i class="bi bi-activity"></i> Ortalama</div>
                    <span class="fs-5 fw-bold" style="color: var(--text-main);">${avg.toFixed(1)}${unit}</span><br>
                    <span style="font-size: 0.75rem; color: var(--text-muted); opacity: 0.9;">Seçili Aralık</span>
                </div>
            </div>

            <div class="col-md-4" style="cursor: pointer;" onclick="window.highlightChartPoint('${canvasId}', '${maxItem[maxKey + 'Time'] || maxItem.createdAt}', 'max')" title="Grafikte göster">
                <div class="p-2 border rounded border-danger h-100 transition-all" style="background: rgba(255, 255, 255, 0.05);">
                    <div class="text-danger fw-bold"><i class="bi bi-arrow-up-circle-fill"></i> Maksimum</div>
                    <span class="fs-5 fw-bold" style="color: var(--text-main);">${displayMax.toFixed(1)}${unit}</span><br>
                    <span style="font-size: 0.75rem; color: var(--text-muted); opacity: 0.9;">${formatDate(maxItem[maxKey + 'Time'] || maxItem.createdAt)}</span>
                </div>
            </div>
        </div>
    `;

    // --- ZİRVE NOKTALARI HTML ---
    if (top8.length > 0) {
        html += `
            <div class="mt-3">
                <div class="fw-bold text-warning mb-2" style="font-size: 0.8rem;">
                    <i class="bi bi-exclamation-triangle-fill"></i> Zirve Noktaları (Top ${top8.length}) <small style="color: var(--text-muted); font-weight: normal;">- En az 5 dk aralıklı</small>
                </div>
                <div class="d-flex flex-wrap gap-2">
                    ${top8.map(t => {
            return `
                        <div class="border border-warning rounded p-2 d-flex flex-column align-items-center justify-content-center shadow-sm flex-grow-1" 
                             style="background: rgba(255, 193, 7, 0.05); min-width: 120px; cursor: pointer; transition: background 0.2s;"
                             onclick="window.highlightChartPoint('${canvasId}', '${t[maxKey + 'Time'] || t.createdAt}', 'peak')"
                             onmouseover="this.style.background='rgba(255, 193, 7, 0.2)'"
                             onmouseout="this.style.background='rgba(255, 193, 7, 0.05)'"
                             title="Grafikte göster">
                            <span class="fw-bold text-warning" style="font-size: 1rem;">${(t[maxKey] != null ? t[maxKey] : t[valueKey]).toFixed(1)}${unit}</span>
                            <span style="font-size: 0.75rem; margin-top: 2px; color: var(--text-muted); text-align: center;">${formatDate(t[maxKey + 'Time'] || t.createdAt)}</span>
                        </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    } else {
        html += `<div class="mt-3 small fst-italic px-2 border-start border-3 border-secondary" style="color: var(--text-muted);"><i class="bi bi-info-circle"></i> Ortalama ile maksimum arasında listelenecek belirgin bir zirve bulunamadı.</div>`;
    }

    // --- 2. TAHMİNİ DOLUM RAPORU (OLS TİPİ DOĞRUSAL REGRESYON) ---
    let predictionHtml = '';

    // CPU bir depolama alanı olmadığı için dolum analizi yapmayı atlıyoruz
    if (valueKey === 'cpuAvg') {
        predictionHtml = `
            <div class="mt-3 p-3 border rounded shadow-sm d-flex align-items-center border-secondary" style="background: rgba(108, 117, 125, 0.1);">
                <i class="bi bi-cpu text-secondary fs-3 me-3"></i>
                <div>
                    <h6 class="mb-1 fw-bold" style="color: var(--text-title); font-size: 0.85rem;">CPU Trend Analizi</h6>
                    <small style="color: var(--text-muted);">CPU kapasite bazlı bir depolama birimi değil, anlık işlem birimidir. Bu nedenle doğrusal regresyon ile "dolum" tahmini yapmak teknik olarak uygun değildir.</small>
                </div>
            </div>
        `;
    }
    else if (validDataList.length >= 5) {
        // Tüm veriler ile Doğrusal Regresyon (En Küçük Kareler - OLS) - null noktalar hariç
        let n = validDataList.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        let sortedData = [...validDataList].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        let startTime = new Date(sortedData[0].createdAt).getTime();

        sortedData.forEach(p => {
            let x = (new Date(p.createdAt).getTime() - startTime) / 1000;
            let y = p[valueKey];
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += x * x;
        });

        let denominator = (n * sumXX) - (sumX * sumX);
        let slope = denominator !== 0 ? ((n * sumXY) - (sumX * sumY)) / denominator : 0;

        let predictionText = '';
        let iconClass = 'bi-info-circle text-info';
        let bgClass = 'rgba(13, 202, 240, 0.1)';
        let borderClass = 'border-info';

        let currentVal = sortedData[sortedData.length - 1][valueKey];
        let remainingVal = 100 - currentVal;

        if (slope > 0.00001) {
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
                    predictionText = `Seçilen tarih aralığındaki gerçek trende göre yaklaşık <b>${days} gün ${hours} saat</b> sonra kapasite tamamen dolacak.`;
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

        let debugInfoHtml = `
            <div class="mt-3 pt-3 border-top border-secondary" style="font-size: 0.75rem; font-family: monospace; opacity: 0.9;">
                <div class="fw-bold text-info mb-1"><i class="bi bi-robot"></i> Algoritma: OLS Linear Regression (Filtresiz)</div>
                <div class="d-flex justify-content-between small">
    <span style="color: var(--text-muted);">Analize Giren Toplam Ham Veri: <b style="color: var(--text-main);">${sortedData.length} Nokta</b></span>
</div>
                <div class="text-warning fw-bold mt-1" style="font-size: 0.8rem;">
                    Saniye Başına Artış (Slope): ${slope.toFixed(8)}
                </div>
            </div>
        `;

        predictionHtml = `
            <div class="mt-3 p-3 border rounded shadow-sm d-flex align-items-start ${borderClass}" style="background: ${bgClass};">
                <i class="bi ${iconClass} fs-3 me-3 mt-1"></i>
                <div class="w-100">
                    <h6 class="mb-1 fw-bold" style="color: var(--text-title); font-size: 0.85rem;">Bilimsel Dolum Tahmini (Seçili Tarih Aralığı)</h6>
                    <small style="color: var(--text-muted); display: block;">${predictionText}</small>
                    ${debugInfoHtml}
                </div>
            </div>
        `;
    } else {
        predictionHtml = `
            <div class="mt-3 p-3 border rounded shadow-sm d-flex align-items-center border-secondary" style="background: rgba(108, 117, 125, 0.1);">
                <i class="bi bi-hourglass text-secondary fs-3 me-3"></i>
                <div>
                    <h6 class="mb-1 fw-bold" style="color: var(--text-title); font-size: 0.85rem;">Bilimsel Dolum Tahmini (Seçili Tarih Aralığı)</h6>
                    <small style="color: var(--text-muted);">Sağlıklı bir trend tahmini yapabilmek için seçilen aralıkta en az 5 veri noktasına ihtiyaç var.</small>
                </div>
            </div>
        `;
    }

    container.innerHTML = html + predictionHtml;
    container.style.display = 'block';
}


// ----------------- TÜM CİHAZLAR SEKMESİ (TABLO OLARAK KALACAK) -----------------
window.loadAllComputers = async () => {
    try {
        const res = await fetch("/api/Computer", {
            headers: { "Authorization": `Bearer ${auth.getToken()}` }
        });
        if (!res.ok) throw new Error("Cihazlar çekilemedi");
        allSystemComputers = await res.json();
        renderAllComputersTable();
    } catch (e) {
        console.error(e);
    }
};

window.renderAllComputersTable = () => {
    const tbody = document.getElementById("allComputersRows");
    if (!tbody) return;

    const canRename = window.auth.hasPermission("Computer.Rename");
    const canSetThreshold = window.auth.hasPermission("Computer.SetThreshold");
    const canAssignTag = window.auth.hasPermission("Computer.AssignTag");
    const canDelete = window.auth.hasPermission("Computer.Delete");

    const canEdit = canRename || canSetThreshold || canAssignTag || canDelete;

    const filtered = selectedAllTags.length === 0
        ? allSystemComputers
        : allSystemComputers.filter(a => selectedAllTags.every(t => a.tags && a.tags.includes(t)));

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentAllPage > totalPages && totalPages > 0) currentAllPage = totalPages;

    const startIndex = (currentAllPage - 1) * itemsPerPage;
    const paginatedComputers = filtered.slice(startIndex, startIndex + itemsPerPage);

    tbody.innerHTML = paginatedComputers.map(c => {
        const lastSeen = new Date(c.lastSeen).toLocaleString('tr-TR', { hour12: false });
        const tags = (c.tags || []).map(t => `<span class="pill" style="font-size:0.65rem; margin-right:3px;">${t}</span>`).join("");

        let statusBadge = "";
        if (c.isDeleted) {
            statusBadge = `<span class="badge bg-danger">Silinmiş</span>`;
        } else if (c.isActive) {
            statusBadge = `<span class="badge bg-success">Aktif</span>`;
        } else {
            statusBadge = `<span class="badge bg-secondary">Pasif</span>`;
        }

        let actionButtons = `<div style="display:flex; gap:5px;">`;
        if (!c.isDeleted) {
            if (canRename) actionButtons += `<button class="btn primary small" onclick="handleRename(${c.id}, '${c.displayName || c.machineName}')" title="İsim Değiştir">✏️</button>`;
            if (canSetThreshold) actionButtons += `<button class="btn warning small" onclick="openThresholdSettings(${c.id})" title="Limit Ayarları">⚙️</button>`;
            if (canAssignTag) actionButtons += `<button class="btn btn-tag small" onclick="openTagModal(${c.id})" title="Etiketle">🏷️</button>`;
        }

        if (!c.isActive && !c.isDeleted && canDelete) {
            actionButtons += `<button class="btn danger small" onclick="deleteComputer(${c.id})" title="Sil">🗑️</button>`;
        }
        actionButtons += `</div>`;

        return `
            <tr style="color: var(--text-main) !important; ${c.isDeleted ? 'opacity: 0.6;' : ''}">
                <td>
                    <div class="fw-bold" style="color:var(--text-title); ${c.isDeleted ? 'text-decoration: line-through;' : ''}">${c.displayName || c.machineName}</div>
                    <div style="margin-top:2px;">${tags}</div>
                </td>
                <td style="color:var(--text-muted); font-family:monospace;">${c.ipAddress || "-"}</td>
                <td style="font-size:0.85rem; color:var(--text-muted);">${lastSeen}</td>
                <td>${statusBadge}</td>
                ${canEdit ? `<td>${actionButtons}</td>` : ''}
            </tr>
        `;
    }).join("");
    renderPaginationControls('allPagination', currentAllPage, totalPages, 'changeAllPage');
};

window.deleteComputer = async (id) => {
    const result = await Swal.fire({
        text: "Bu bilgisayarı silmek istediğinize emin misiniz?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Evet, Sil!',
        cancelButtonText: 'İptal'
    });

    if (!result.isConfirmed) return;

    try {
        const response = await api.del(`/api/Computer/${id}`);
        loadAllComputers();
        loadAgents();
        if (typeof loadAllComputers === "function") loadAllComputers();

        Swal.fire({ title: response.title, text: response.message, icon: 'success' });
    } catch (e) {
        Swal.fire({ title: e.title, text: e.message, icon: 'warning' });
    }
};

window.changeLivePage = (page) => {
    currentLivePage = page;
    renderTable();
};

window.changeAllPage = (page) => {
    currentAllPage = page;
    renderAllComputersTable();
};

function getDonutColor(val, threshold) {
    if (val >= threshold) return '#ef4444'; // Sınırı aştıysa Kırmızı
    if (val >= (threshold * 0.8)) return '#eab308'; // Sınıra yaklaştıysa Sarı
    return '#22c55e'; // Normalse Yeşil
}

function renderPaginationControls(containerId, currentPage, totalPages, changeFnName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<ul class="pagination pagination-sm mb-0 shadow-sm">';

    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="javascript:void(0)" onclick="window.${changeFnName}(${currentPage - 1})">Önceki</a>
             </li>`;

    for (let i = 1; i <= totalPages; i++) {
        html += `<li class="page-item ${currentPage === i ? 'active' : ''}">
                    <a class="page-link" href="javascript:void(0)" onclick="window.${changeFnName}(${i})">${i}</a>
                 </li>`;
    }

    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="javascript:void(0)" onclick="window.${changeFnName}(${currentPage + 1})">Sonraki</a>
             </li>`;

    html += '</ul>';
    container.innerHTML = html;
}
window.highlightChartPoint = function (canvasId, timeStr, highlightType = null) {
    if (!canvasId || !timeStr) return;

    let chartInstance = null;
    let diskName = null;
    if (canvasId === 'cpuChart') chartInstance = historyCharts.cpu;
    else if (canvasId === 'ramChart') chartInstance = historyCharts.ram;
    else {
        diskName = Object.keys(historyCharts.disks).find(key => `diskChart_${key.replace(/[^a-zA-Z0-9]/g, '')}` === canvasId);
        if (diskName) chartInstance = historyCharts.disks[diskName];
    }

    if (!chartInstance) return;

    let dataIndex = -1;
    const targetMs = new Date(timeStr).getTime();

    if (currentHistoryMode === 'candle') {
        // Mumlar zaman aralığı kapsayabileceği için targetMs'e en yakın veya onu kapsayan mumu bul
        dataIndex = chartInstance.data.datasets[0].data.findIndex((d, i, arr) => {
            const nextT = arr[i + 1] ? arr[i + 1].t : Infinity;
            return targetMs >= d.t && targetMs < nextT;
        });
        // Eğer hala bulunamadıysa (targetMs başlangıçtan önceyse vb.) en yakın olanı al
        if (dataIndex === -1) {
            let minDiff = Infinity;
            chartInstance.data.datasets[0].data.forEach((d, i) => {
                const diff = Math.abs(d.t - targetMs);
                if (diff < minDiff) {
                    minDiff = diff;
                    dataIndex = i;
                }
            });
        }
    } else {
        const rawDataSource = diskName 
            ? (currentHistoryData.disks || []).filter(d => d.diskName === diskName)
            : (currentHistoryData.cpuRam || []);
        
        // Önce createdAt ile eşleşme dene
        dataIndex = rawDataSource.findIndex(m => Math.abs(new Date(m.createdAt).getTime() - targetMs) < 1000);
        
        // Bulunamazsa tüm zaman alanlarında ara (butonlar cpuMaxTime, ramMinTime vb. gönderiyor)
        if (dataIndex === -1) {
            dataIndex = rawDataSource.findIndex(m => {
                const timeFields = [
                    m.cpuMaxTime, m.cpuMinTime, m.ramMaxTime, m.ramMinTime,
                    m.usedMaxTime, m.usedMinTime, m.maxCreatedAt
                ];
                return timeFields.some(tf => {
                    if (!tf) return false;
                    const t = new Date(tf).getTime();
                    return !isNaN(t) && Math.abs(t - targetMs) < 1000;
                });
            });
        }
        
        // Hala bulunamadıysa en yakın createdAt'e sahip bucket'ı bul
        if (dataIndex === -1 && rawDataSource.length > 0) {
            let minDiff = Infinity;
            rawDataSource.forEach((m, i) => {
                const diff = Math.abs(new Date(m.createdAt).getTime() - targetMs);
                if (diff < minDiff) {
                    minDiff = diff;
                    dataIndex = i;
                }
            });
        }
    }

    if (dataIndex === -1) return;

    // Tip, zaman ve INDEX bilgisini sakla (Özel tooltip başlıkları için)
    chartInstance._highlightType = highlightType;
    chartInstance._highlightTime = targetMs;
    chartInstance._highlightIdx = dataIndex;

    // Canvas üzerinde mouse hareketi olduğunda vurgulamayı temizle
    if (!chartInstance._hasCanvasListener) {
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            canvas.addEventListener('mousemove', function _clearHighlight() {
                if (chartInstance._highlightType) {
                    chartInstance._highlightType = null;
                    chartInstance._highlightTime = null;
                    chartInstance._highlightIdx = null;
                }
            });
            chartInstance._hasCanvasListener = true;
        }
    }

    const targetDsIndex = currentHistoryMode === 'candle' 
        ? 0 
        : 2; // Band grafikte tooltip her zaman ortalama çizgisi üzerinde gösterilir

    const meta = chartInstance.getDatasetMeta(targetDsIndex);
    
    if (meta && meta.data && meta.data[dataIndex]) {
        const point = meta.data[dataIndex];

        // Önce mevcut seçimi temizle ki aynı index olsa bile tooltip güncellensin
        chartInstance.setActiveElements([]);
        chartInstance.tooltip.setActiveElements([], { x: 0, y: 0 });
        chartInstance.update('none');

        chartInstance.tooltip.setActiveElements([
            { datasetIndex: targetDsIndex, index: dataIndex }
        ], { x: point.x, y: point.y });

        chartInstance.setActiveElements([
            { datasetIndex: targetDsIndex, index: dataIndex }
        ]);

        chartInstance.update();
        const el = document.getElementById(canvasId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.toggleAverageLine = function (canvasId, avgValue) {
    let chartInstance = null;
    if (canvasId === 'cpuChart') chartInstance = historyCharts.cpu;
    else if (canvasId === 'ramChart') chartInstance = historyCharts.ram;
    else {
        const diskName = Object.keys(historyCharts.disks).find(key => `diskChart_${key.replace(/[^a-zA-Z0-9]/g, '')}` === canvasId);
        if (diskName) chartInstance = historyCharts.disks[diskName];
    }

    if (!chartInstance) return;

    // Eğer zaten bu değer varsa veya herhangi bir ortalama çizgisi varsa kaldır
    const avgDatasetIndex = chartInstance.data.datasets.findIndex(ds => ds.label === 'Ortalama Değer');

    if (avgDatasetIndex > -1) {
        chartInstance.data.datasets.splice(avgDatasetIndex, 1);
        delete chartInstance._averageLineValue;
    } else {
        // Değeri plugin kullanımı için sakla
        chartInstance._averageLineValue = avgValue;

        // Legend'da görünmesi için içi boş ama ayarları yapılmış bir dataset ekliyoruz
        chartInstance.data.datasets.push({
            type: 'line',
            label: 'Ortalama Değer',
            data: [], // Veri yok, plugin çizecek (baştan sona gitmesi için)
            borderColor: '#0dcaf0',
            borderWidth: 2,
            borderDash: [10, 5],
            pointRadius: 0,
            fill: false,
            order: 0
        });
    }

    chartInstance.update();
    document.getElementById(canvasId).scrollIntoView({ behavior: 'smooth', block: 'center' });
};
// --- BAŞLATMA ---
let bucketDetailChart = null;
let bucketDetailHistory = [];

window.goBackBucketDetail = function() {
    if (bucketDetailHistory.length > 0) {
        const prevState = bucketDetailHistory.pop();
        window.openBucketDetail(prevState.startTime, prevState.endTime, prevState.labelText, prevState.diskName, true);
    }
};

window.openBucketDetail = async function(startTime, endTime, labelText, diskName = null, isBack = false) {
    if (!isBack && bucketDetailChart) {
        const modalEl = document.getElementById('bucketDetailModal');
        bucketDetailHistory.push({
            startTime: modalEl.dataset.startTime,
            endTime: modalEl.dataset.endTime,
            labelText: labelText,
            diskName: diskName
        });
    } else if (!isBack) {
        bucketDetailHistory = [];
    }

    // ID düzeltildi: historyPageComputerSelect
    const computerId = document.getElementById('historyPageComputerSelect')?.value;
    if (!computerId) {
        console.error("Bilgisayar ID bulunamadı.");
        return;
    }

    if (bucketDetailChart) {
        bucketDetailChart.destroy();
        bucketDetailChart = null;
    }
    const canvas = document.getElementById('bucketDetailChart');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Modal nesnesini al veya oluştur
    const modalEl = document.getElementById('bucketDetailModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl);
    modal.show();

    modalEl.dataset.startTime = startTime;
    modalEl.dataset.endTime = endTime;

    const backBtn = document.getElementById('btnBucketDetailBack');
    if (backBtn) backBtn.style.display = bucketDetailHistory.length > 0 ? 'block' : 'none';

    const rangeText = `${formatChartDate(startTime)} - ${formatChartDate(endTime)}`;
    document.getElementById('bucketDetailTimeRange').innerText = `${labelText} için Detaylı Görünüm: ${rangeText}`;
    
    const summaryContainer = document.getElementById('bucketDetailSummary');
    summaryContainer.innerHTML = '<div class="text-center w-100 py-3"><div class="spinner-border text-info" role="status"></div><p class="mt-2 small text-muted">Detaylı veriler getiriliyor...</p></div>';

    try {
        const response = await api.get(`/api/Computer/${computerId}/metrics-history?start=${startTime}&end=${endTime}&maxPoints=${chartSettings.detailMaxPoints}`);
        
        let detailData = [];
        let valueKey = '';

        if (diskName) {
            detailData = (response.disks || []).filter(d => d.diskName === diskName).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            valueKey = 'usedAvg';
        } else {
            detailData = (response.cpuRam || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            valueKey = labelText.includes('CPU') ? 'cpuAvg' : 'ramAvg';
        }
        
        if (detailData.length === 0) {
            summaryContainer.innerHTML = '<div class="alert alert-warning w-100">Bu aralıkta detaylı veri bulunamadı.</div>';
            return;
        }

        // Mevcut grafik moduna göre detay grafiği oluştur
        if (currentHistoryMode === 'candle') {
            const prefix = diskName ? 'disk' : (valueKey === 'cpuAvg' ? 'cpu' : 'ram');
            const dataObj = prepareCandleData(detailData, prefix);

            if (dataObj.candles.length === 0) {
                summaryContainer.innerHTML = '<div class="alert alert-warning w-100">Bu aralıkta geçerli detaylı veri bulunamadı.</div>';
                return;
            }

            // OHLC özet istatistiklerini hesapla (Sadece geçerli veri noktalarını dahil et)
            const validCandles = dataObj.candles.filter(c => c.o !== null);
            let sumClose = 0, peakHigh = -1, lowestLow = 999;
            validCandles.forEach(c => {
                sumClose += (c.c || 0);
                if (c.h > peakHigh) peakHigh = c.h;
                if (c.l < lowestLow) lowestLow = c.l;
            });
            const avgClose = validCandles.length > 0 ? sumClose / validCandles.length : 0;

            summaryContainer.innerHTML = `
                <div class="col-md-3">
                    <div class="p-3 border rounded border-info text-center" style="background: rgba(255,255,255,0.05);">
                        <div class="text-info small fw-bold mb-1">ORT. KAPANIŞ</div>
                        <div class="fs-4 fw-bold" style="color: var(--text-main);">${avgClose.toFixed(2)}%</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="p-3 border rounded border-danger text-center" style="background: rgba(255,255,255,0.05);">
                        <div class="text-danger small fw-bold mb-1">EN YÜKSEK (HIGH)</div>
                        <div class="fs-4 fw-bold" style="color: var(--text-main);">${validCandles.length > 0 ? peakHigh.toFixed(2) : '0.00'}%</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="p-3 border rounded border-success text-center" style="background: rgba(255,255,255,0.05);">
                        <div class="text-success small fw-bold mb-1">EN DÜŞÜK (LOW)</div>
                        <div class="fs-4 fw-bold" style="color: var(--text-main);">${validCandles.length > 0 ? lowestLow.toFixed(2) : '0.00'}%</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="p-3 border rounded border-warning text-center" style="background: rgba(255,255,255,0.05);">
                        <div class="text-warning small fw-bold mb-1">MUM SAYISI</div>
                        <div class="fs-4 fw-bold" style="color: var(--text-main);">${validCandles.length} / ${dataObj.candles.length}</div>
                    </div>
                </div>
            `;

            // Grafik çizimini küçük bir gecikmeyle yap (Modal animasyonu/yerleşimi tamamlanması için)
            setTimeout(() => {
                if (bucketDetailChart) bucketDetailChart.destroy();
                bucketDetailChart = createCandleChart('bucketDetailChart', labelText, dataObj.candles, dataObj.labels, diskName, true, new Date(startTime).getTime(), new Date(endTime).getTime(), dataObj.threshold);
                bucketDetailChart.resize();
                bucketDetailChart.update();
            }, 50);

        } else {
            // Band (Area) modu: Mevcut davranış
            const labels = detailData.map(m => formatChartDate(m.createdAt));
            const values = detailData.map(m => m[valueKey]);
            const mins = detailData.map(m => m[valueKey.replace('Avg', 'Min')]);
            const maxs = detailData.map(m => m[valueKey.replace('Avg', 'Max')]);

            // Gap injection: null değerleri istatistiklerden dışla
            const validValues = values.filter(v => v != null);
            let sum = 0;
            let maxVal = -1;
            
            validValues.forEach(v => {
                sum += v;
                if (v > maxVal) maxVal = v;
            });

            const avg = validValues.length > 0 ? sum / validValues.length : 0;

            summaryContainer.innerHTML = `
                <div class="col-md-4">
                    <div class="p-3 border rounded border-info text-center" style="background: rgba(255,255,255,0.05);">
                        <div class="text-info small fw-bold mb-1">ARALIK ORTALAMASI</div>
                        <div class="fs-4 fw-bold" style="color: var(--text-main);">${avg.toFixed(2)}%</div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="p-3 border rounded border-danger text-center" style="background: rgba(255,255,255,0.05);">
                        <div class="text-danger small fw-bold mb-1">ARALIK ZİRVESİ (PEAK)</div>
                        <div class="fs-4 fw-bold" style="color: var(--text-main);">${maxVal.toFixed(2)}%</div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="p-3 border rounded border-success text-center" style="background: rgba(255,255,255,0.05);">
                        <div class="text-success small fw-bold mb-1">VERİ NOKTASI SAYISI</div>
                        <div class="fs-4 fw-bold" style="color: var(--text-main);">${detailData.length} Adet</div>
                    </div>
                </div>
            `;

            // Grafik çizimini küçük bir gecikmeyle yap
            setTimeout(() => {
                if (bucketDetailChart) bucketDetailChart.destroy();
                const tEndData = detailData.map(m => getBucketEndTime(m));
                const rawTimes = detailData.map(m => m.createdAt ? new Date(m.createdAt).getTime() : null);
                
                const prefix = labelText.includes('CPU') ? 'cpu' : (labelText.includes('RAM') ? 'ram' : 'used');
                const minTimes = detailData.map(m => m[prefix + 'MinTime'] ? new Date(m[prefix + 'MinTime']).getTime() : null);
                const maxTimes = detailData.map(m => m[prefix + 'MaxTime'] ? new Date(m[prefix + 'MaxTime']).getTime() : null);

                bucketDetailChart = createBandChart('bucketDetailChart', labelText, labels, values, mins, maxs, labelText.includes('CPU') ? '#38bdf8' : (labelText.includes('RAM') ? '#facc15' : '#10b981'), diskName, true, tEndData, rawTimes, minTimes, maxTimes);
                bucketDetailChart.resize();
                bucketDetailChart.update();
            }, 50);

        }

    } catch (e) {
        summaryContainer.innerHTML = `<div class="alert alert-danger w-100">Hata: ${e.message}</div>`;
    }
};

$(document).ready(function () {
    const modalEl = document.getElementById('bucketDetailModal');
    if (modalEl) {
        modalEl.addEventListener('hidden.bs.modal', () => {
            bucketDetailHistory = [];
            if (bucketDetailChart) {
                bucketDetailChart.destroy();
                bucketDetailChart = null;
            }
        });
    }

    $('#modalTagSelect').select2({
        dropdownParent: $('#tagsModal'),
        tags: false,
        placeholder: "Sistemden bir etiket seçiniz..."
    });

    $(document).on('select2:open', function () {
        document.querySelectorAll('.select2-search__field').forEach(input => {
            input.readOnly = true;
            input.style.cursor = 'pointer';
        });
    });

    $('#main-nav').on('click', '.nav-link', function () {
        setTimeout(() => {
            const id = $(this).attr('id');
            if (id === 'nav-computers') {
                $('#tagSelect').val(selectedLiveTags).trigger('change.select2');
            } else if (id === 'nav-all-computers') {
                $('#tagSelect').val(selectedAllTags).trigger('change.select2');
            } else if (id === 'nav-tags') {
                $('#tagSelect').val(selectedTagViewTags).trigger('change.select2');
            } else {
                $('#tagSelect').val([]).trigger('change.select2');
            }
        }, 50);
    });

    window.loadFilterTags();

    // Chart ayarlarını çek
    api.get('/api/Ui/chart-settings').then(settings => {
        if (settings) chartSettings = settings;
    }).catch(e => console.error("Chart ayarları yüklenemedi:", e));

    // Uygulama ilk açıldığında çalıştır
    loadAgents();

    // Her 5 saniyede bir kullanıcının bulunduğu aktif sekmeyi arka planda (F5 olmadan) yenile
    setInterval(() => {
        const isLiveTab = document.getElementById('nav-computers') && document.getElementById('nav-computers').classList.contains('active');
        const isAllTab = document.getElementById('nav-all-computers') && document.getElementById('nav-all-computers').classList.contains('active');

        window.loadFilterTags();

        if (isLiveTab) {
            loadAgents();
        } else if (isAllTab) {
            if (typeof loadAllComputers === "function") loadAllComputers();
        }
    }, 5000);
});