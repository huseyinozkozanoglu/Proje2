// STAJ2/wwwroot/assets/js/api.js
(function () {
    // auth.js'teki metodumuzu kullanıyoruz ki her yerde aynı isimle okunsun
    function getToken() {
        if (window.auth && typeof window.auth.getToken === 'function') {
            return window.auth.getToken();
        }
        return localStorage.getItem("staj2_token");
    }

    let activeControllers = new Set();
    let isRefreshing = false;
    let refreshPromise = null;

    async function request(path, options = {}) {
        const controller = new AbortController();
        activeControllers.add(controller);

        try {
            const base = window.APP_CONFIG?.API_BASE ?? "";
            const url = base + path;

            const headers = options.headers ? { ...options.headers } : {};
            if (!headers["Content-Type"] && options.body) headers["Content-Type"] = "application/json";

            const token = getToken();
            if (token) headers["Authorization"] = `Bearer ${token}`;

            // Sinyali fetch seçeneklerine ekliyoruz
            let res = await fetch(url, { ...options, headers, signal: controller.signal });

            // --- REFRESH TOKEN BAŞLANGIÇ ---
            if (res.status === 401 && !path.includes('/login')) {
                const rfToken = localStorage.getItem("staj2_refresh_token");

                if (rfToken) {
                    if (!isRefreshing) {
                        isRefreshing = true;
                        refreshPromise = new Promise(async (resolve, reject) => {
                            try {
                                const refreshRes = await fetch('/api/Auth/refresh', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ refreshToken: rfToken }),
                                    signal: controller.signal
                                });

                                if (refreshRes.ok) {
                                    const newData = await refreshRes.json();
                                    window.auth.saveAuth(newData.token, null, null, null, newData.refreshToken);
                                    resolve(newData.token);
                                } else {
                                    reject("Refresh işlemi reddedildi");
                                }
                            } catch (err) {
                                reject(err);
                            } finally {
                                isRefreshing = false;
                            }
                        });
                    }

                    try {
                        const newToken = await refreshPromise;
                        headers["Authorization"] = `Bearer ${newToken}`;
                        res = await fetch(url, { ...options, headers, signal: controller.signal });
                    } catch (err) {
                        console.error("Token yenileme kuyruğunda hata:", err);
                    }
                }
            }
            // --- REFRESH TOKEN BİTİŞ ---

            // Yanıtı Parse Etme
            const contentType = res.headers.get("content-type") || "";
            const isJson = contentType.includes("application/json");
            const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

            // Hata durumunda Error Objesi Fırlatma
            if (!res.ok) {
                const errTitle = data?.title;
                const errMsg = (typeof data === "string" && data) ? data
                    : data?.errorMessage ? data.errorMessage
                        : data?.message;

                if (res.status === 401 && !path.includes('/login')) {
                    await Swal.fire({ title: errTitle, text: errMsg, icon: 'info' });
                    window.auth.clearAuth();
                    window.location.href = "/login.html?reason=expired";
                    throw { title: errTitle, message: errMsg, isHandled: true };
                }

                if (res.status === 403 && !path.includes('/login')) {
                    await Swal.fire({ title: errTitle, text: errMsg, icon: 'error' });
                    window.auth.clearAuth();
                    window.location.href = "/login.html?reason=forbidden";
                    throw { title: errTitle, message: errMsg, isHandled: true };
                }

                throw { title: errTitle, message: errMsg };
            }

            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log("İstek iptal edildi:", path);
                return new Promise(() => { }); // İsteği sessizce sonlandır
            }
            throw error;
        } finally {
            activeControllers.delete(controller);
        }
    }

    function cancelAllRequests() {
        activeControllers.forEach(ctrl => ctrl.abort());
        activeControllers.clear();
        console.log("Tüm aktif backend istekleri iptal edildi.");
    }

    // Cihazın disklerini ve mevcut eşiklerini getirir
    async function openThresholdSettings(computerId) {
        document.getElementById('modalComputerId').value = computerId;

        try {
            const disks = await request(`/api/Computer/${computerId}/disks`);

            const container = document.getElementById('diskThresholdsContainer');
            container.innerHTML = '<h4>Disk Sınırları</h4>';

            disks.forEach(disk => {
                container.innerHTML += `
                <div class="disk-row">
                    <label>${disk.diskName} (${disk.totalSizeGb.toFixed(2)} GB)</label>
                    <input type="number" class="disk-threshold-input" 
                           data-name="${disk.diskName}" 
                           value="${disk.thresholdPercent}" min="0" max="100"> %
                </div>
            `;
            });

            document.getElementById('thresholdModal').style.display = 'block';
        } catch (e) {
            if (!e.isHandled) {
                // Hiçbir string ifade kalmadı, sadece backend'den gelen mesajlar
                Swal.fire({ title: e.title, text: e.message, icon: 'warning' });
            }
        }
    }

    // Yeni eşik değerlerini kaydeder
    async function saveThresholds() {
        const computerId = document.getElementById('modalComputerId').value;
        const cpuVal = document.getElementById('cpuThresholdInput').value;
        const ramVal = document.getElementById('ramThresholdInput').value;

        const diskThresholds = [];
        document.querySelectorAll('.disk-threshold-input').forEach(input => {
            diskThresholds.push({
                diskName: input.getAttribute('data-name'),
                thresholdPercent: parseFloat(input.value)
            });
        });

        const body = {
            cpuThreshold: parseFloat(cpuVal),
            ramThreshold: parseFloat(ramVal),
            diskThresholds: diskThresholds
        };

        try {
            const response = await request(`/api/Computer/update-thresholds/${computerId}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });

            // Başarılı durumda da sadece backend'den gelen başlık ve mesaj kullanılıyor
            Swal.fire({ title: response?.title, text: response?.message, icon: 'success' });
            if (typeof closeModal === "function") closeModal();
        } catch (e) {
            if (!e.isHandled) {
                // Hata durumunda sadece backend'den gelen başlık ve mesaj kullanılıyor
                Swal.fire({ title: e.title, text: e.message, icon: 'error' });
            }
        }
    }

    /* Sessiz Arka Plan Devriyesi Yorum Satırları vs. (İsteğe bağlı aktif edilebilir) */

    window.api = {
        get: (path) => request(path),
        post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
        put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
        del: (path) => request(path, { method: "DELETE" }),
        openThresholdSettings: openThresholdSettings,
        saveThresholds: saveThresholds,

        getPerformanceReport: () => request('/api/Computer/performance-report'),
        cancelAllRequests: cancelAllRequests
    };
})();