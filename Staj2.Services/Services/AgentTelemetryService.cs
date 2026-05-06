using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Staj2.Domain.Entities;
using Staj2.Infrastructure.Data;
using Staj2.Services.Interfaces;
using Staj2.Services.Models;
using Staj2.Services.Models.Agent;
using System.Globalization;

namespace Staj2.Services.Services;

// YENİ: BaseService'den miras alıyoruz.
public class AgentTelemetryService : BaseService, IAgentTelemetryService
{
    private readonly IConfiguration _config;

    // Anlık metrikleri RAM'de tutan önbellek
    private static readonly Dictionary<string, AgentTelemetryDto> _latestData = new();

    // YENİ: AppDbContext db'yi base sınıfa gönderiyoruz.
    public AgentTelemetryService(AppDbContext db, IConfiguration config) : base(db)
    {
        _config = config;
    }

    // YAZMA/GÜNCELLEME İŞLEMİ - Sarmalandı (CancellationToken closure içinde sorunsuz çalışır)
    public Task<ServiceResult<List<(string Email, string Subject, string Body)>>> IngestAsync(AgentTelemetryDto dto, string? agentKey, CancellationToken ct)
    {
        // Geri dönüş tipi karmaşık bir Tuple listesi olduğu için Generic sarmalayıcıyı buna göre ayarladık
        return ExecuteWithDbHandlingAsync<List<(string Email, string Subject, string Body)>>(async () =>
        {
            // 1. Güvenlik Kontrolü
            var expectedKey = _config["Agent:IngestKey"];
            if (!string.IsNullOrWhiteSpace(expectedKey) && agentKey != expectedKey)
            {
                // Controller'da yakalayıp 401 dönebilmek için spesifik mesaj atıyoruz
                return ServiceResult<List<(string Email, string Subject, string Body)>>.Failure("Unauthorized");
            }

            if (string.IsNullOrWhiteSpace(dto.MacAddress))
                return ServiceResult<List<(string Email, string Subject, string Body)>>.Failure("MacAddress is required.");

            bool isNewComputer = false; // YENİ EKLENDİ: Cihazın yeni olup olmadığını takip edeceğiz

            var computer = await _db.Computers
                .Include(c => c.Disks)
                .Include(c => c.Tags)
                .FirstOrDefaultAsync(c => c.MacAddress == dto.MacAddress, ct);

            if (computer == null)
            {
                isNewComputer = true; // YENİ EKLENDİ
                computer = new Computer
                {
                    MacAddress = dto.MacAddress,
                    MachineName = dto.MachineName,
                    DisplayName = dto.MachineName,
                    IpAddress = dto.Ip,
                    CpuModel = dto.CpuModel,
                    TotalRamMb = dto.TotalRamMb,
                    LastSeen = DateTime.Now,
                    CreatedAt = DateTime.Now
                };
                _db.Computers.Add(computer);
            }
            else
            {
                computer.LastSeen = DateTime.Now;
                computer.MachineName = dto.MachineName;
                computer.IpAddress = dto.Ip;
                computer.CpuModel = dto.CpuModel;
                if (Math.Abs(computer.TotalRamMb - dto.TotalRamMb) > 1)
                    computer.TotalRamMb = dto.TotalRamMb;
                if (computer.IsOfflineAlertSent)
                {
                    computer.IsOfflineAlertSent = false;
                }
            }

            // Transaction aktif olduğu için bu save işlemi aslında henüz kalıcı olarak DB'ye Commitlenmiyor
            await _db.SaveChangesAsync(ct);

            if (isNewComputer)
            {
                var adminName = _config["AppDefaults:AdminRoleName"] ?? "Yönetici";
                var adminUserIds = await _db.Users
                    .Where(u => !u.IsDeleted && u.Roles.Any(r => r.Name == adminName && !r.IsDeleted))
                    .Select(u => u.Id)
                    .ToListAsync(ct);

                foreach (var adminId in adminUserIds)
                {
                    _db.UserComputerAccesses.Add(new UserComputerAccess
                    {
                        UserId = adminId,
                        ComputerId = computer.Id
                    });
                }
                // Atamaları veritabanına kalıcı olarak yazıyoruz
                await _db.SaveChangesAsync(ct);
            }
            // 3. Yeni Disk Mantığı
            var diskTotalParts = dto.TotalDiskGb.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < diskTotalParts.Length; i += 2)
            {
                if (i + 1 < diskTotalParts.Length)
                {
                    string dName = diskTotalParts[i].Replace(":", "");
                    double.TryParse(diskTotalParts[i + 1].Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out double dSize);

                    var existingDisk = computer.Disks.FirstOrDefault(d => d.DiskName == dName);
                    if (existingDisk == null)
                    {
                        _db.ComputerDisks.Add(new ComputerDisk
                        {
                            ComputerId = computer.Id,
                            DiskName = dName,
                            TotalSizeGb = dSize,
                            ThresholdPercent = null
                        });
                    }
                    else if (Math.Abs(existingDisk.TotalSizeGb - dSize) > 0.1)
                    {
                        existingDisk.TotalSizeGb = dSize;
                    }
                }
            }
            await _db.SaveChangesAsync(ct);

            dto.DisplayName = computer.DisplayName;
            dto.ComputerId = computer.Id;
            dto.Tags = computer.Tags?.Select(t => t.Name).ToList() ?? new List<string>();
            dto.CpuThreshold = computer.CpuThreshold;
            dto.RamThreshold = computer.RamThreshold;
            dto.DiskThresholds = computer.Disks
    .Where(d => d.ThresholdPercent.HasValue)
    .ToDictionary(d => d.DiskName, d => (int)(d.ThresholdPercent ?? 0));
            // 4. Metrik Kaydı
            var metric = new ComputerMetric
            {
                ComputerId = computer.Id,
                CpuUsage = dto.CpuUsage,
                RamUsage = dto.RamUsage,
                CreatedAt = DateTime.Now
            };
            _db.ComputerMetrics.Add(metric);

            var currentDisks = await _db.ComputerDisks.Where(d => d.ComputerId == computer.Id).ToListAsync(ct);
            var diskUsageParts = dto.DiskUsage.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < diskUsageParts.Length; i += 2)
            {
                if (i + 1 < diskUsageParts.Length)
                {
                    string dName = diskUsageParts[i].Replace(":", "");
                    string usageStr = diskUsageParts[i + 1].Replace("%", "").Replace(",", ".");
                    if (double.TryParse(usageStr, NumberStyles.Any, CultureInfo.InvariantCulture, out double dUsage))
                    {
                        var diskEntity = currentDisks.FirstOrDefault(d => d.DiskName == dName);
                        if (diskEntity != null)
                        {
                            _db.DiskMetrics.Add(new DiskMetric
                            {
                                ComputerDiskId = diskEntity.Id,
                                UsedPercent = dUsage,
                                CreatedAt = DateTime.Now
                            });
                        }
                    }
                }
            }
            await _db.SaveChangesAsync(ct);

            // =======================================================
            // 5. ALERT KONTROLLERİ, LOGLAMA VE MAİL İÇERİĞİ HAZIRLAMA
            // =======================================================
            var alertsToSend = new List<(string Email, string Subject, string Body)>();
            var alertingConfig = _config.GetSection("Alerting");

            var adminRoleName = _config["AppDefaults:AdminRoleName"] ?? "Yönetici";

            var adminEmails = await _db.Users
                .Where(u => !u.IsDeleted && u.Roles.Any(r => r.Name == adminRoleName && !r.IsDeleted))
                .Select(u => u.Email)
                .ToListAsync(ct);

            var assignedUserEmails = await _db.UserComputerAccesses
                .Where(uca => uca.ComputerId == computer.Id && !uca.IsDeleted && !uca.User.IsDeleted)
                .Select(uca => uca.User.Email)
                .ToListAsync(ct);

            var finalRecipients = adminEmails
                .Concat(assignedUserEmails)
                .Where(email => !string.IsNullOrWhiteSpace(email))
                .Distinct()
                .ToList();

            int intervalHours = alertingConfig.GetValue<int>("NotifyIntervalHours", 1);
            string deviceName = !string.IsNullOrWhiteSpace(computer.DisplayName) ? computer.DisplayName : computer.MachineName;
            bool dbUpdateNeeded = false;

            // Mail hazırlayıcı yerel fonksiyon
            void CreateAlert(string title, string message)
            {
                if (finalRecipients.Count == 0) return;

                string subject = $"🚨 {title}: {deviceName}";
                string fullBody = $"Merhaba,\n\n{deviceName} ({computer.IpAddress}) cihazında aşağıdaki limit aşımı tespit edilmiştir:\n\n{message}\n\n--------------------------------------------------\nZaman: {DateTime.Now}";

                foreach (var email in finalRecipients)
                    alertsToSend.Add((email, subject, fullBody));
            }

            // --- 5.1 CPU KONTROLÜ ---
            if (computer.CpuThreshold.HasValue && dto.CpuUsage >= computer.CpuThreshold.Value)
            {
                // YENİ: Bekleme süresinden bağımsız her zaman logla (Yeni özelliğimiz için)
                _db.MetricWarningLogs.Add(new MetricWarningLog
                {
                    ComputerId = computer.Id,
                    MetricTypeId = 1,
                    MetricValue = dto.CpuUsage,
                    ThresholdValue = computer.CpuThreshold.Value,
                    CreatedAt = DateTime.Now
                });
                dbUpdateNeeded = true;

                // Eski: Mail atmak için cooldown bekle
                if (computer.CpuLastNotifyTime == null || (DateTime.Now - computer.CpuLastNotifyTime.Value).TotalHours >= intervalHours)
                {
                    CreateAlert("CPU UYARISI", $"⚠️ CPU KULLANIMI: %{dto.CpuUsage:F1} (Limit: %{computer.CpuThreshold.Value})");
                    computer.CpuLastNotifyTime = DateTime.Now;
                }
            }

            // --- 5.2 RAM KONTROLÜ ---
            if (computer.RamThreshold.HasValue && dto.RamUsage >= computer.RamThreshold.Value)
            {
                // YENİ: Bekleme süresinden bağımsız her zaman logla
                _db.MetricWarningLogs.Add(new MetricWarningLog
                {
                    ComputerId = computer.Id,
                    MetricTypeId = 2,
                    MetricValue = dto.RamUsage,
                    ThresholdValue = computer.RamThreshold.Value,
                    CreatedAt = DateTime.Now
                });
                dbUpdateNeeded = true;

                // Eski: Mail atmak için cooldown bekle
                if (computer.RamLastNotifyTime == null || (DateTime.Now - computer.RamLastNotifyTime.Value).TotalHours >= intervalHours)
                {
                    CreateAlert("RAM UYARISI", $"⚠️ RAM KULLANIMI: %{dto.RamUsage:F1} (Limit: %{computer.RamThreshold.Value})");
                    computer.RamLastNotifyTime = DateTime.Now;
                }
            }

            // --- 5.3 DİSK KONTROLÜ ---
            for (int i = 0; i < diskUsageParts.Length; i += 2)
            {
                if (i + 1 < diskUsageParts.Length)
                {
                    string diskName = diskUsageParts[i].Replace(":", "").Trim();
                    string percentStr = diskUsageParts[i + 1].Replace("%", "").Replace(",", ".");

                    if (double.TryParse(percentStr, NumberStyles.Any, CultureInfo.InvariantCulture, out double currentUsage))
                    {
                        var targetDisk = computer.Disks.FirstOrDefault(d => d.DiskName == diskName);
                        if (targetDisk != null && targetDisk.ThresholdPercent.HasValue && currentUsage >= targetDisk.ThresholdPercent.Value)
                        {
                            // YENİ: Bekleme süresinden bağımsız disk logu ekle
                            _db.MetricWarningLogs.Add(new MetricWarningLog
                            {
                                ComputerId = computer.Id,
                                MetricTypeId = 3, // Disk Type ID
                                ComputerDiskId = targetDisk.Id, // <--- ARTIK ID VERİYORUZ
                                MetricValue = currentUsage,
                                ThresholdValue = targetDisk.ThresholdPercent.Value,
                                CreatedAt = DateTime.Now
                            });
                            dbUpdateNeeded = true;

                            // Eski: Mail atmak için cooldown bekle
                            if (targetDisk.LastNotifyTime == null || (DateTime.Now - targetDisk.LastNotifyTime.Value).TotalHours >= intervalHours)
                            {
                                CreateAlert($"DİSK UYARISI ({diskName})", $"⚠️ DİSK DOLULUK ({diskName}): %{currentUsage:F1} (Limit: %{targetDisk.ThresholdPercent.Value})");
                                targetDisk.LastNotifyTime = DateTime.Now;
                            }
                        }
                    }
                }
            }

            // Eklenen logları ve güncellenen Mail cooldown tarihlerini kaydet
            if (dbUpdateNeeded) await _db.SaveChangesAsync(ct);
        

            dto.Ts = DateTime.Now;
            lock (_latestData) { _latestData[dto.MacAddress] = dto; }

            // Başarılı durumunda uyarı listesini Data olarak dönüyoruz
            return ServiceResult<List<(string Email, string Subject, string Body)>>.Success(alertsToSend);

        }, "Cihaz Telemetri Verisi", DbOperation.Create);
    }

    // SADECE OKUMA İŞLEMİ - Sarmalanmadı
    public async Task<ServiceResult<object>> GetLatestAsync(int userId, bool isAdmin)
    {
        List<AgentTelemetryDto> list;
        lock (_latestData) { list = _latestData.Values.OrderByDescending(x => x.Ts).ToList(); }

        var macs = list.Select(x => x.MacAddress).ToList();

        var accessibleCompIds = await _db.UserComputerAccesses.Where(x => x.UserId == userId).Select(x => x.ComputerId).ToListAsync();
        var accessibleTagIds = await _db.UserTagAccesses.Where(x => x.UserId == userId).Select(x => x.TagId).ToListAsync();

        var computersQuery = _db.Computers
            .Include(c => c.Tags)
            .Include(c => c.Disks)
            .AsSplitQuery()
            .Where(c => macs.Contains(c.MacAddress));

        if (!isAdmin || accessibleCompIds.Any() || accessibleTagIds.Any())
        {
            computersQuery = computersQuery.Where(c =>
                accessibleCompIds.Contains(c.Id) ||
                c.Tags.Any(t => accessibleTagIds.Contains(t.Id)));
        }

        var computers = await computersQuery.ToListAsync();
        var compMap = computers.ToDictionary(c => c.MacAddress);

        var filteredList = new List<AgentTelemetryDto>();

        foreach (var dto in list)
        {
            if (compMap.TryGetValue(dto.MacAddress, out var comp))
            {
                dto.ComputerId = comp.Id;
                dto.DisplayName = comp.DisplayName;
                dto.Tags = comp.Tags.Select(t => t.Name).ToList();
                dto.CpuThreshold = comp.CpuThreshold;
                dto.RamThreshold = comp.RamThreshold;
                dto.DiskThresholds = comp.Disks
    .Where(d => d.ThresholdPercent.HasValue)
    .ToDictionary(d => d.DiskName, d => (int)(d.ThresholdPercent ?? 0));
                filteredList.Add(dto);
            }
        }

        var sortedResult = filteredList.OrderByDescending(dto =>
        {
            var comp = compMap[dto.MacAddress];
            var notifyTimes = new List<DateTime>();
            if (comp.CpuLastNotifyTime.HasValue) notifyTimes.Add(comp.CpuLastNotifyTime.Value);
            if (comp.RamLastNotifyTime.HasValue) notifyTimes.Add(comp.RamLastNotifyTime.Value);

            var lastDiskNotify = comp.Disks
                .Where(d => d.LastNotifyTime.HasValue)
                .Select(d => d.LastNotifyTime!.Value)
                .OrderByDescending(t => t).FirstOrDefault();

            if (lastDiskNotify != default) notifyTimes.Add(lastDiskNotify);

            return notifyTimes.Any() ? notifyTimes.Max() : DateTime.MinValue;
        })
        .ThenByDescending(dto => dto.Ts)
        .ToList();

        return ServiceResult<object>.Success(sortedResult);
    }

    public async Task<ServiceResult<TopWarningsReportDto>> GetTopWarningsAsync(int userId, bool isAdmin, DateTime? startDate = null, DateTime? endDate = null)
    {
        // 1. ADIM: YETKİLİ BİLGİSAYARLARI HIZLICA BELİRLEME
        var allowedComputersQuery = _db.Computers.AsNoTracking();

        if (!isAdmin)
        {
            allowedComputersQuery = allowedComputersQuery.Where(c =>
                _db.UserComputerAccesses.Any(uca => uca.UserId == userId && !uca.IsDeleted && uca.ComputerId == c.Id) ||
                _db.ComputerTags.Any(ct => !ct.IsDeleted && ct.ComputerId == c.Id &&
                    _db.UserTagAccesses.Any(uta => uta.UserId == userId && !uta.IsDeleted && uta.TagId == ct.TagId))
            );
        }

        var allowedCompIds = await allowedComputersQuery.Select(c => c.Id).ToListAsync();

        if (!allowedCompIds.Any())
            return ServiceResult<TopWarningsReportDto>.Success(new TopWarningsReportDto());

        // 2. ADIM: SADECE YABANCI ANAHTARLAR (FOREIGN KEYS) ÜZERİNDEN TEK BİR SORGGU (Include YOK)
        var logQuery = _db.MetricWarningLogs
        .AsNoTracking()
        .Where(w => allowedComputersQuery.Any(ac => ac.Id == w.ComputerId));

        if (startDate.HasValue)
        {
            var startOfDay = startDate.Value.Date;
            logQuery = logQuery.Where(w => w.CreatedAt >= startOfDay);
        }
        if (endDate.HasValue)
        {
            var endOfDay = endDate.Value.Date.AddDays(1).AddTicks(-1);
            logQuery = logQuery.Where(w => w.CreatedAt <= endOfDay);
        }

        // Gruplama ve Sayma işlemi aynı kalıyor...
        var rawWarningCounts = await logQuery
            .GroupBy(w => new { w.MetricTypeId, w.ComputerId, w.ComputerDiskId })
            .Select(g => new
            {
                MetricTypeId = g.Key.MetricTypeId,
                ComputerId = g.Key.ComputerId,
                ComputerDiskId = g.Key.ComputerDiskId,
                WarningCount = g.Count()
            })
            .ToListAsync();

        var report = new TopWarningsReportDto();

        if (!rawWarningCounts.Any())
            return ServiceResult<TopWarningsReportDto>.Success(report);

        // 3. ADIM: RAM ÜZERİNDE İSİM EŞLEŞTİRMELERİ İÇİN SÖZLÜKLERİ HAZIRLAMA
        // Bilgisayar isimlerini alıyoruz
        var computersDict = await _db.Computers
            .AsNoTracking()
            .Where(c => allowedCompIds.Contains(c.Id))
            .Select(c => new { c.Id, c.DisplayName, c.MachineName })
            .ToDictionaryAsync(c => c.Id);

        // Disk isimlerini alıyoruz (Sadece uyarı almış diskleri çekiyoruz ki sorgu minicik olsun)
        var diskIdsToFetch = rawWarningCounts
            .Where(x => x.ComputerDiskId.HasValue)
            .Select(x => x.ComputerDiskId.Value)
            .Distinct()
            .ToList();

        var disksDict = new Dictionary<int, string>();
        if (diskIdsToFetch.Any())
        {
            disksDict = await _db.ComputerDisks
                .AsNoTracking()
                .Where(d => diskIdsToFetch.Contains(d.Id))
                .ToDictionaryAsync(d => d.Id, d => d.DiskName);
        }

        // 4. ADIM: C# TARAFINDA DTO'LARI DOLDURMA (O(1) Maliyetli Dictionary Araması ile)

        // CPU Uyarıları (MetricTypeId == 1)
        report.TopCpuWarnings = rawWarningCounts
            .Where(w => w.MetricTypeId == 1)
            .Select(w => new TopWarningItemDto
            {
                ComputerId = w.ComputerId,
                ComputerName = computersDict.TryGetValue(w.ComputerId, out var comp)
                    ? (!string.IsNullOrWhiteSpace(comp.DisplayName) ? comp.DisplayName : comp.MachineName)
                    : "Bilinmeyen Cihaz",
                WarningCount = w.WarningCount
            })
            .OrderByDescending(x => x.WarningCount)
            .ToList();

        // RAM Uyarıları (MetricTypeId == 2)
        report.TopRamWarnings = rawWarningCounts
            .Where(w => w.MetricTypeId == 2)
            .Select(w => new TopWarningItemDto
            {
                ComputerId = w.ComputerId,
                ComputerName = computersDict.TryGetValue(w.ComputerId, out var comp)
                    ? (!string.IsNullOrWhiteSpace(comp.DisplayName) ? comp.DisplayName : comp.MachineName)
                    : "Bilinmeyen Cihaz",
                WarningCount = w.WarningCount
            })
            .OrderByDescending(x => x.WarningCount)
            .ToList();

        // Disk Uyarıları (MetricTypeId == 3)
        report.TopDiskWarnings = rawWarningCounts
            .Where(w => w.MetricTypeId == 3 && w.ComputerDiskId.HasValue)
            .Select(w => new TopWarningItemDto
            {
                ComputerId = w.ComputerId,
                ComputerName = computersDict.TryGetValue(w.ComputerId, out var comp)
                    ? (!string.IsNullOrWhiteSpace(comp.DisplayName) ? comp.DisplayName : comp.MachineName)
                    : "Bilinmeyen Cihaz",
                DiskName = disksDict.TryGetValue(w.ComputerDiskId.Value, out var diskName) ? diskName : "Bilinmeyen Disk",
                WarningCount = w.WarningCount
            })
            .OrderByDescending(x => x.WarningCount)
            .ToList();

        return ServiceResult<TopWarningsReportDto>.Success(report);
    }
}