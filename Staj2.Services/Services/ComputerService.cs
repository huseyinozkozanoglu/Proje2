using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Staj2.Domain.Entities;
using Staj2.Infrastructure.Data;
using Staj2.Services.Interfaces;
using Staj2.Services.Models;

namespace Staj2.Services.Services;

// YENİ: BaseService'den miras alıyoruz
public class ComputerService : BaseService, IComputerService
{
    private readonly IConfiguration _config;
    private readonly IMemoryCache _cache;
    private readonly IServiceScopeFactory _scopeFactory;

    // YENİ: AppDbContext db'yi base sınıfa (BaseService) gönderiyoruz
    public ComputerService(AppDbContext db, IConfiguration config, IMemoryCache cache, IServiceScopeFactory scopeFactory) : base(db)
    {
        _config = config;
        _cache = cache;
        _scopeFactory = scopeFactory;
    }

    // --- YARDIMCI METOT (Okuma İşlemi) ---
    private async Task<bool> CheckComputerAccessAsync(int computerId, int userId, bool isAdmin)
    {
        if (isAdmin) return true;
        if (userId == 0) return false;

        bool hasDirectAccess = await _db.UserComputerAccesses
            .AnyAsync(uca => uca.UserId == userId && uca.ComputerId == computerId);

        if (hasDirectAccess) return true;

        var computerTagIds = await _db.Computers
            .Where(c => c.Id == computerId)
            .SelectMany(c => c.Tags.Select(t => t.Id))
            .ToListAsync();

        bool hasTagAccess = await _db.UserTagAccesses
            .AnyAsync(uta => uta.UserId == userId && computerTagIds.Contains(uta.TagId));

        return hasTagAccess;
    }

    // 1. Cihaz Detayı (Okuma İşlemi)
    public async Task<ServiceResult<object>> GetComputerAsync(int id, int userId, bool isAdmin)
    {
        if (!await CheckComputerAccessAsync(id, userId, isAdmin))
            return ServiceResult<object>.Failure("Bu cihaza erişim yetkiniz bulunmamaktadır.");

        var computer = await _db.Computers.Include(c => c.Tags).FirstOrDefaultAsync(c => c.Id == id);
        if (computer == null)
            return ServiceResult<object>.Failure("Bilgisayar bulunamadı.");

        var data = new { computer.Id, computer.CpuThreshold, computer.RamThreshold, Tags = computer.Tags.Select(t => t.Name) };
        return ServiceResult<object>.Success(data);
    }

    // 2. Disk Listesi (Okuma İşlemi)
    public async Task<ServiceResult<object>> GetComputerDisksAsync(int computerId, int userId, bool isAdmin)
    {
        if (!await CheckComputerAccessAsync(computerId, userId, isAdmin))
            return ServiceResult<object>.Failure("Bu cihaza erişim yetkiniz bulunmamaktadır.");

        var disks = await _db.ComputerDisks
        .Where(d => d.ComputerId == computerId)
        .Select(d => new { d.Id, d.DiskName, thresholdPercent = d.ThresholdPercent })
        .ToListAsync();
        return ServiceResult<object>.Success(disks);
    }

    // 3. Eşik Değerlerini Güncelle (YAZMA İŞLEMİ - SARMALANDI)
    // 3. Eşik Değerlerini Güncelle (YAZMA İŞLEMİ - SARMALANDI)
    public Task<ServiceResult> UpdateThresholdsAsync(int computerId, UpdateThresholdsRequest request, int userId, bool isAdmin)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            if (!await CheckComputerAccessAsync(computerId, userId, isAdmin))
                return ServiceResult.Failure("Bu cihaza erişim yetkiniz bulunmamaktadır.");

            if (request.CpuThreshold.HasValue && (request.CpuThreshold < 0 || request.CpuThreshold > 100))
                return ServiceResult.Failure("CPU eşik değeri 0 ile 100 arasında olmalıdır.");

            if (request.RamThreshold.HasValue && (request.RamThreshold < 0 || request.RamThreshold > 100))
                return ServiceResult.Failure("RAM eşik değeri 0 ile 100 arasında olmalıdır.");

            if (request.DiskThresholds != null)
            {
                foreach (var disk in request.DiskThresholds)
                {
                    if (disk.ThresholdPercent.HasValue && (disk.ThresholdPercent < 0 || disk.ThresholdPercent > 100))
                        return ServiceResult.Failure($"'{disk.DiskName}' diski için eşik değeri 0-100 arasında olmalıdır.");
                }
            }

            var computer = await _db.Computers.Include(c => c.Disks).FirstOrDefaultAsync(c => c.Id == computerId);
            if (computer == null)
                return ServiceResult.Failure("Bilgisayar bulunamadı.");


            // Ana tabloyu güncelle (Yaklaşım 2: Güncel değeri ana tabloda tutuyoruz)
            computer.CpuThreshold = request.CpuThreshold;
            computer.RamThreshold = request.RamThreshold;

            if (request.DiskThresholds != null)
            {
                foreach (var dReq in request.DiskThresholds)
                {
                    var disk = computer.Disks.FirstOrDefault(d => d.DiskName == dReq.DiskName);
                    if (disk != null && disk.ThresholdPercent != dReq.ThresholdPercent)
                    {
                        disk.ThresholdPercent = dReq.ThresholdPercent;
                    }
                }
            }
            await _db.SaveChangesAsync();

            return ServiceResult.Success("Sınırlar başarıyla kaydedildi.");
        }, "Cihaz Eşik Değerleri", DbOperation.Update);
    }

    // 4. Etiket Atama (YAZMA İŞLEMİ - SARMALANDI)
    public Task<ServiceResult> UpdateComputerTagsAsync(int id, UpdateComputerTagsRequest request)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var computer = await _db.Computers.Include(c => c.Tags).FirstOrDefaultAsync(c => c.Id == id);
            if (computer == null)
                return ServiceResult.Failure("Bilgisayar bulunamadı.");

            var newTags = await _db.Tags.Where(t => request.Tags.Contains(t.Name)).ToListAsync();
            computer.Tags.Clear();
            foreach (var tag in newTags) computer.Tags.Add(tag);

            await _db.SaveChangesAsync();

            return ServiceResult.Success("Etiketler cihaza başarıyla atandı.");
        }, "Cihaz Etiketleri", DbOperation.Update);
    }

    // 5. İsim Değiştirme (YAZMA İŞLEMİ - SARMALANDI)
    public Task<ServiceResult> UpdateDisplayNameAsync(UpdateComputerNameRequest request)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            if (string.IsNullOrWhiteSpace(request.NewDisplayName))
                return ServiceResult.Failure("İsim alanı boş bırakılamaz.");

            if (request.NewDisplayName.Length > 200)
                return ServiceResult.Failure("Görünen isim 200 karakterden uzun olamaz.");

            bool isNameTaken = await _db.Computers
                .AnyAsync(c => c.DisplayName == request.NewDisplayName && c.Id != request.Id);

            if (isNameTaken)
                return ServiceResult.Failure("Bu isim zaten başka bir cihaza ait. Lütfen farklı bir isim giriniz.");

            var computer = await _db.Computers.FindAsync(request.Id);
            if (computer == null)
                return ServiceResult.Failure("Bilgisayar bulunamadı.");

            computer.DisplayName = request.NewDisplayName;
            await _db.SaveChangesAsync();

            return ServiceResult.Success("Cihaz ismi başarıyla güncellendi.");
        }, "Cihaz Görünen İsmi", DbOperation.Update);
    }

    // 6. Belirli bir tarih aralığındaki metrik geçmişini getir (Okuma İşlemi)
    // GAP INJECTION: Cihazın kapalı olduğu zaman dilimlerini null değerlerle temsil eder
    public async Task<ServiceResult<object>> GetMetricsHistoryAsync(int id, string start, string end, int? maxPoints = null)
    {
        if (id <= 0)
            return ServiceResult<object>.Failure("Lütfen analiz yapmak için sol menüden bir cihaz seçiniz.");

        if (string.IsNullOrWhiteSpace(start) || string.IsNullOrWhiteSpace(end))
            return ServiceResult<object>.Failure("Lütfen tarih aralığı seçiniz.");

        if (!DateTime.TryParse(start, out DateTime startTime) || !DateTime.TryParse(end, out DateTime endTime))
            return ServiceResult<object>.Failure("Geçersiz tarih formatı.");

        if (startTime > endTime)
            return ServiceResult<object>.Failure("Başlangıç tarihi bitiş tarihinden sonra olamaz.");

        var rawCpuRam = await _db.ComputerMetrics
            .AsNoTracking()
            .Where(m => m.ComputerId == id && m.CreatedAt >= startTime && m.CreatedAt <= endTime)
            .Select(m => new { m.CreatedAt, m.CpuUsage, m.RamUsage })
            .ToListAsync();

        var rawDisks = await _db.DiskMetrics
            .AsNoTracking()
            .Where(m => m.ComputerDisk.ComputerId == id && m.CreatedAt >= startTime && m.CreatedAt <= endTime)
            .Select(m => new { m.CreatedAt, m.UsedPercent, diskName = m.ComputerDisk.DiskName })
            .ToListAsync();

        int maxAllowedPoints = maxPoints ?? _config.GetValue<int>("ChartSettings:DefaultMaxPoints", 200);
        var processed = ProcessSingleComputerMetrics(rawCpuRam.Select(m => (m.CreatedAt, m.CpuUsage, m.RamUsage)).ToList(),
                                                   rawDisks.Select(m => (m.CreatedAt, m.UsedPercent, m.diskName)).ToList(),
                                                   startTime, endTime, maxAllowedPoints);

        return ServiceResult<object>.Success(processed);
    }

    public async Task<ServiceResult<object>> GetMetricsHistoryBatchAsync(List<int> ids, string start, string end, string metric, int? maxPoints = null)
    {
        if (ids == null || !ids.Any()) return ServiceResult<object>.Failure("Lütfen cihaz seçiniz.");
        if (string.IsNullOrWhiteSpace(start) || string.IsNullOrWhiteSpace(end)) return ServiceResult<object>.Failure("Lütfen tarih aralığı seçiniz.");
        if (!DateTime.TryParse(start, out DateTime startTime) || !DateTime.TryParse(end, out DateTime endTime)) return ServiceResult<object>.Failure("Geçersiz tarih formatı.");
        if (startTime > endTime) return ServiceResult<object>.Failure("Başlangıç tarihi bitiş tarihinden sonra olamaz.");

        int maxAllowedPoints = maxPoints ?? _config.GetValue<int>("ChartSettings:DefaultMaxPoints", 200);

        long totalSeconds = (long)(endTime - startTime).TotalSeconds;
        int bucketSeconds = (int)(totalSeconds / maxAllowedPoints);
        if (bucketSeconds <= 0) bucketSeconds = 1;

        // 6 cihaz için 6 ayrı asenkron görev (Task) oluşturuyoruz
        var tasks = ids.Select(async id =>
        {
            // ÖNEMLİ: Her paralel işlem için yeni bir Scope ve DbContext yaratıyoruz
            using var scope = _scopeFactory.CreateScope();
            // NOT: "AppDbContext" yazan yere kendi Context adınızı yazın (örn: StajDbContext)
            var localDb = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            List<(DateTime CreatedAt, double CpuUsage, double RamUsage)> rawCpuRam = new();
            List<(DateTime CreatedAt, double UsedPercent, string diskName)> rawDisks = new();

            if (metric == "CPU" || metric == "RAM")
            {
                var dbCpuRam = await localDb.ComputerMetrics
                    .AsNoTracking()
                    .Where(m => m.ComputerId == id && m.CreatedAt >= startTime && m.CreatedAt <= endTime)
                    .Select(m => new { m.CreatedAt, m.CpuUsage, m.RamUsage })
                    .ToListAsync();
                rawCpuRam = dbCpuRam.Select(m => (m.CreatedAt, m.CpuUsage, m.RamUsage)).ToList();
            }
            else if (metric.StartsWith("Disk_"))
            {
                string targetDisk = metric.Substring(5);
                var dbDisks = await localDb.DiskMetrics
                    .AsNoTracking()
                    .Where(m => m.ComputerDisk.ComputerId == id && m.ComputerDisk.DiskName == targetDisk && m.CreatedAt >= startTime && m.CreatedAt <= endTime)
                    .Select(m => new { m.CreatedAt, m.UsedPercent, m.ComputerDisk.DiskName })
                    .ToListAsync();
                rawDisks = dbDisks.Select(m => (m.CreatedAt, m.UsedPercent, m.DiskName)).ToList();
            }

            var processed = ProcessSingleComputerMetrics(rawCpuRam, rawDisks, startTime, endTime, maxAllowedPoints);
            return new { ComputerId = id, Data = processed };
        });

        // BÜYÜK FARK BURADA: Tüm görevleri (cihazları) AYNI ANDA çalıştır ve hepsinin bitmesini bekle
        var results = await Task.WhenAll(tasks);

        // Sonuçları Dictionary'e çevirip dön
        var response = results.ToDictionary(r => r.ComputerId, r => r.Data);

        return ServiceResult<object>.Success(response);
    }

    public async Task<ServiceResult<List<MetricBucketDetailDto>>> GetMetricBucketDetailBatchAsync(List<int> computerIds, string start, string end, string metric)
    {
        if (computerIds == null || !computerIds.Any()) return ServiceResult<List<MetricBucketDetailDto>>.Failure("Lütfen cihaz seçiniz.");
        if (!DateTime.TryParse(start, out DateTime startTime) || !DateTime.TryParse(end, out DateTime endTime))
            return ServiceResult<List<MetricBucketDetailDto>>.Failure("Geçersiz tarih formatı.");

        var resultList = new List<MetricBucketDetailDto>();

        foreach (var id in computerIds)
        {
            var computer = await _db.Computers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
            string compName = computer?.DisplayName ?? computer?.MachineName ?? $"Cihaz {id}";

            var detail = new MetricBucketDetailDto
            {
                ComputerId = id,
                ComputerName = compName
            };

            if (metric == "CPU" || metric == "RAM")
            {
                var raw = await _db.ComputerMetrics
                    .AsNoTracking()
                    .Where(m => m.ComputerId == id && m.CreatedAt >= startTime && m.CreatedAt <= endTime)
                    .Select(m => new { m.CreatedAt, Value = metric == "CPU" ? m.CpuUsage : m.RamUsage })
                    .ToListAsync();

                if (raw.Any())
                {
                    var values = raw.Select(r => r.Value).ToList();
                    detail.MinValue = Math.Round(values.Min(), 2);
                    detail.MaxValue = Math.Round(values.Max(), 2);
                    detail.MinCount = values.Count(v => Math.Abs(v - detail.MinValue.Value) < 0.01);
                    detail.MaxCount = values.Count(v => Math.Abs(v - detail.MaxValue.Value) < 0.01);
                    detail.AverageValue = Math.Round(values.Average(), 2);
                    detail.DataPointCount = raw.Count;
                    
                    var first = raw.Min(r => r.CreatedAt);
                    var last = raw.Max(r => r.CreatedAt);
                    detail.ActiveSeconds = (last - first).TotalSeconds + 10;
                    detail.ActiveDurationText = FormatSeconds(detail.ActiveSeconds);

                    // Streak Hesaplama
                    var sortedRaw = raw.OrderBy(r => r.CreatedAt).Select(r => (dynamic)r);
                    CalculateStreaks(sortedRaw, detail);
                }
            }
            else if (metric.StartsWith("Disk_"))
            {
                string targetDisk = metric.Substring(5);
                var raw = await _db.DiskMetrics
                    .AsNoTracking()
                    .Where(m => m.ComputerDisk.ComputerId == id && m.ComputerDisk.DiskName == targetDisk && m.CreatedAt >= startTime && m.CreatedAt <= endTime)
                    .Select(m => new { m.CreatedAt, Value = m.UsedPercent })
                    .ToListAsync();

                if (raw.Any())
                {
                    var values = raw.Select(r => r.Value).ToList();
                    detail.MinValue = Math.Round(values.Min(), 2);
                    detail.MaxValue = Math.Round(values.Max(), 2);
                    detail.MinCount = values.Count(v => Math.Abs(v - detail.MinValue.Value) < 0.01);
                    detail.MaxCount = values.Count(v => Math.Abs(v - detail.MaxValue.Value) < 0.01);
                    detail.AverageValue = Math.Round(values.Average(), 2);
                    detail.DataPointCount = raw.Count;

                    var first = raw.Min(r => r.CreatedAt);
                    var last = raw.Max(r => r.CreatedAt);
                    detail.ActiveSeconds = (last - first).TotalSeconds + 10;
                    detail.ActiveDurationText = FormatSeconds(detail.ActiveSeconds);

                    // Streak Hesaplama
                    var sortedRaw = raw.OrderBy(r => r.CreatedAt).Select(r => (dynamic)r);
                    CalculateStreaks(sortedRaw, detail);
                }
            }

            resultList.Add(detail);
        }

        return ServiceResult<List<MetricBucketDetailDto>>.Success(resultList);
    }

    private void CalculateStreaks(IEnumerable<dynamic> sortedData, MetricBucketDetailDto detail)
    {
        if (sortedData == null || !sortedData.Any()) return;

        int currentMaxStreak = 0;
        DateTime? currentMaxStart = null;
        
        int currentMinStreak = 0;
        DateTime? currentMinStart = null;

        foreach (var item in sortedData)
        {
            // Max Streak
            if (detail.MaxValue.HasValue && Math.Abs((double)item.Value - detail.MaxValue.Value) < 0.01)
            {
                detail.MaxOccurrenceTimes.Add(item.CreatedAt);

                if (currentMaxStreak == 0) currentMaxStart = item.CreatedAt;
                currentMaxStreak++;
                
                if (currentMaxStreak > detail.MaxStreakCount)
                {
                    detail.MaxStreakCount = currentMaxStreak;
                    detail.MaxStreakRange = $"{currentMaxStart:dd MMMM HH:mm:ss} - {item.CreatedAt:HH:mm:ss}";
                }
            }
            else
            {
                currentMaxStreak = 0;
            }

            // Min Streak
            if (detail.MinValue.HasValue && Math.Abs((double)item.Value - detail.MinValue.Value) < 0.01)
            {
                detail.MinOccurrenceTimes.Add(item.CreatedAt);

                if (currentMinStreak == 0) currentMinStart = item.CreatedAt;
                currentMinStreak++;
                
                if (currentMinStreak > detail.MinStreakCount)
                {
                    detail.MinStreakCount = currentMinStreak;
                    detail.MinStreakRange = $"{currentMinStart:dd MMMM HH:mm:ss} - {item.CreatedAt:HH:mm:ss}";
                }
            }
            else
            {
                currentMinStreak = 0;
            }
        }
    }

    private string FormatSeconds(double seconds)
    {
        var ts = TimeSpan.FromSeconds(seconds);
        if (ts.TotalMinutes < 1) return $"{(int)ts.TotalSeconds} sn";
        if (ts.TotalHours < 1) return $"{(int)ts.TotalMinutes} dk {(int)ts.Seconds} sn";
        return $"{(int)ts.TotalHours} sa {(int)ts.Minutes} dk";
    }

    // ----- YARDIMCI METOTLAR -----
    private List<CpuRamBucketDto> FillCpuGapsForBatch(IEnumerable<dynamic> dbData, DateTime start, int bucketSeconds, int maxPoints)
    {
        var result = new List<CpuRamBucketDto>(maxPoints);
        var lookup = dbData.ToDictionary(d => (int)d.BucketIndex);

        for (int i = 0; i <= maxPoints; i++)
        {
            var bucketTime = start.AddSeconds(i * bucketSeconds);
            if (lookup.TryGetValue(i, out var data))
            {
                result.Add(new CpuRamBucketDto
                {
                    CreatedAt = bucketTime,
                    MaxCreatedAt = data.MaxCreatedAt,
                    CpuAvg = data.CpuAvg,
                    CpuMin = data.CpuMin,
                    CpuMinTime = data.CpuMinTime,
                    CpuMax = data.CpuMax,
                    CpuMaxTime = data.CpuMaxTime,
                    CpuOpen = data.CpuAvg,
                    CpuClose = data.CpuAvg,
                    RamAvg = data.RamAvg,
                    RamMin = data.RamMin,
                    RamMinTime = data.RamMinTime,
                    RamMax = data.RamMax,
                    RamMaxTime = data.RamMaxTime,
                    RamOpen = data.RamAvg,
                    RamClose = data.RamAvg
                });
            }
            else
            {
                result.Add(new CpuRamBucketDto
                {
                    CreatedAt = bucketTime,
                    CpuAvg = null,
                    CpuMin = null,
                    CpuMax = null,
                    CpuOpen = null,
                    CpuClose = null,
                    RamAvg = null,
                    RamMin = null,
                    RamMax = null,
                    RamOpen = null,
                    RamClose = null
                });
            }
        }
        return result;
    }

    private List<DiskBucketDto> FillDiskGapsForBatch(IEnumerable<dynamic> dbData, string diskName, DateTime start, int bucketSeconds, int maxPoints)
    {
        var result = new List<DiskBucketDto>(maxPoints);
        var lookup = dbData.ToDictionary(d => (int)d.BucketIndex);

        for (int i = 0; i <= maxPoints; i++)
        {
            var bucketTime = start.AddSeconds(i * bucketSeconds);
            if (lookup.TryGetValue(i, out var data))
            {
                result.Add(new DiskBucketDto
                {
                    CreatedAt = bucketTime,
                    MaxCreatedAt = data.MaxCreatedAt,
                    DiskName = diskName,
                    UsedAvg = data.UsedAvg,
                    UsedMin = data.UsedMin,
                    UsedMinTime = data.UsedMinTime,
                    UsedMax = data.UsedMax,
                    UsedMaxTime = data.UsedMaxTime,
                    UsedOpen = data.UsedAvg,
                    UsedClose = data.UsedAvg
                });
            }
            else
            {
                result.Add(new DiskBucketDto
                {
                    CreatedAt = bucketTime,
                    DiskName = diskName,
                    UsedAvg = null,
                    UsedMin = null,
                    UsedMax = null,
                    UsedOpen = null,
                    UsedClose = null
                });
            }
        }
        return result;
    }

    private object ProcessSingleComputerMetrics(List<(DateTime CreatedAt, double CpuUsage, double RamUsage)> rawCpuRam, 
                                              List<(DateTime CreatedAt, double UsedPercent, string diskName)> rawDisks, 
                                              DateTime startTime, DateTime endTime, int maxAllowedPoints)
    {
        if (!rawCpuRam.Any() && !rawDisks.Any())
        {
            return new { CpuRam = new List<CpuRamBucketDto>(), Disks = new List<DiskBucketDto>() };
        }

        var gapThreshold = TimeSpan.FromMinutes(5);
        int currentDataCount = rawCpuRam.Any() ? rawCpuRam.Count : rawDisks.Select(d => d.CreatedAt).Distinct().Count();

        if (maxAllowedPoints == 0 || currentDataCount <= maxAllowedPoints)
        {
            var sortedCpuRam = rawCpuRam.OrderBy(m => m.CreatedAt).ToList();
            var cpuRamWithGaps = new List<CpuRamBucketDto>();

            if (sortedCpuRam.Count > 0 && (sortedCpuRam[0].CreatedAt - startTime) > gapThreshold)
                cpuRamWithGaps.Add(CreateEmptyCpuDto(startTime));

            for (int i = 0; i < sortedCpuRam.Count; i++)
            {
                var current = sortedCpuRam[i];
                cpuRamWithGaps.Add(new CpuRamBucketDto
                {
                    CreatedAt = current.CreatedAt,
                    MaxCreatedAt = current.CreatedAt,
                    CpuAvg = (double)current.CpuUsage,
                    CpuMin = (double)current.CpuUsage,
                    CpuMinTime = current.CreatedAt,
                    CpuMax = (double)current.CpuUsage,
                    CpuMaxTime = current.CreatedAt,
                    CpuOpen = (double)current.CpuUsage,
                    CpuClose = (double)current.CpuUsage,
                    RamAvg = (double)current.RamUsage,
                    RamMin = (double)current.RamUsage,
                    RamMinTime = current.CreatedAt,
                    RamMax = (double)current.RamUsage,
                    RamMaxTime = current.CreatedAt,
                    RamOpen = (double)current.RamUsage,
                    RamClose = (double)current.RamUsage
                });

                if (i < sortedCpuRam.Count - 1 && (sortedCpuRam[i + 1].CreatedAt - current.CreatedAt) > gapThreshold)
                    cpuRamWithGaps.Add(CreateEmptyCpuDto(current.CreatedAt.AddSeconds(1)));
            }

            if (sortedCpuRam.Count > 0 && (endTime - sortedCpuRam[^1].CreatedAt) > gapThreshold)
            {
                cpuRamWithGaps.Add(CreateEmptyCpuDto(sortedCpuRam[^1].CreatedAt.AddSeconds(1)));
                cpuRamWithGaps.Add(CreateEmptyCpuDto(endTime));
            }

            var disksWithGaps = new List<DiskBucketDto>();
            var groupedDisks = rawDisks.GroupBy(d => d.diskName);

            foreach (var diskGroup in groupedDisks)
            {
                var sortedDisk = diskGroup.OrderBy(d => d.CreatedAt).ToList();
                var dn = diskGroup.Key;

                if (sortedDisk.Count > 0 && (sortedDisk[0].CreatedAt - startTime) > gapThreshold)
                    disksWithGaps.Add(CreateEmptyDiskDto(startTime, dn));

                for (int i = 0; i < sortedDisk.Count; i++)
                {
                    var current = sortedDisk[i];
                    disksWithGaps.Add(new DiskBucketDto
                    {
                        CreatedAt = current.CreatedAt,
                        MaxCreatedAt = current.CreatedAt,
                        UsedAvg = (double)current.UsedPercent,
                        UsedMin = (double)current.UsedPercent,
                        UsedMinTime = current.CreatedAt,
                        UsedMax = (double)current.UsedPercent,
                        UsedMaxTime = current.CreatedAt,
                        UsedOpen = (double)current.UsedPercent,
                        UsedClose = (double)current.UsedPercent,
                        DiskName = dn
                    });

                    if (i < sortedDisk.Count - 1 && (sortedDisk[i + 1].CreatedAt - current.CreatedAt) > gapThreshold)
                        disksWithGaps.Add(CreateEmptyDiskDto(current.CreatedAt.AddSeconds(1), dn));
                }

                if (sortedDisk.Count > 0 && (endTime - sortedDisk[^1].CreatedAt) > gapThreshold)
                {
                    disksWithGaps.Add(CreateEmptyDiskDto(sortedDisk[^1].CreatedAt.AddSeconds(1), dn));
                    disksWithGaps.Add(CreateEmptyDiskDto(endTime, dn));
                }
            }

            return new { CpuRam = cpuRamWithGaps, Disks = disksWithGaps };
        }
        else
        {
            long totalTicks = (endTime - startTime).Ticks;
            long bucketTicks = totalTicks / maxAllowedPoints;
            if (bucketTicks <= 0) bucketTicks = TimeSpan.FromSeconds(1).Ticks;

            long firstBucket = 0;
            long lastBucket = totalTicks > 0 ? (totalTicks - 1) / bucketTicks : 0;

            var cpuRamLookup = rawCpuRam
                .GroupBy(m => (m.CreatedAt.Ticks - startTime.Ticks) / bucketTicks)
                .ToDictionary(g => g.Key, g => g.OrderBy(x => x.CreatedAt).ToList());

            var gridCpuRam = new List<CpuRamBucketDto>(maxAllowedPoints + 1);

            for (long b = firstBucket; b <= lastBucket; b++)
            {
                var bucketTime = new DateTime(startTime.Ticks + (b * bucketTicks));
                if (cpuRamLookup.TryGetValue(b, out var sortedItems))
                {
                    var firstItem = sortedItems.First();
                    var lastItem = sortedItems.Last();
                    var cpuMinItem = sortedItems.OrderBy(m => m.CpuUsage).First();
                    var cpuMaxItem = sortedItems.OrderByDescending(m => m.CpuUsage).First();
                    var ramMinItem = sortedItems.OrderBy(m => m.RamUsage).First();
                    var ramMaxItem = sortedItems.OrderByDescending(m => m.RamUsage).First();

                    gridCpuRam.Add(new CpuRamBucketDto
                    {
                        CreatedAt = bucketTime,
                        MaxCreatedAt = lastItem.CreatedAt,
                        CpuAvg = Math.Round((double)sortedItems.Average(m => m.CpuUsage), 2),
                        CpuMin = Math.Round((double)cpuMinItem.CpuUsage, 2),
                        CpuMinTime = cpuMinItem.CreatedAt,
                        CpuMax = Math.Round((double)cpuMaxItem.CpuUsage, 2),
                        CpuMaxTime = cpuMaxItem.CreatedAt,
                        CpuOpen = Math.Round((double)firstItem.CpuUsage, 2),
                        CpuClose = Math.Round((double)lastItem.CpuUsage, 2),
                        RamAvg = Math.Round((double)sortedItems.Average(m => m.RamUsage), 2),
                        RamMin = Math.Round((double)ramMinItem.RamUsage, 2),
                        RamMinTime = ramMinItem.CreatedAt,
                        RamMax = Math.Round((double)ramMaxItem.RamUsage, 2),
                        RamMaxTime = ramMaxItem.CreatedAt,
                        RamOpen = Math.Round((double)firstItem.RamUsage, 2),
                        RamClose = Math.Round((double)lastItem.RamUsage, 2)
                    });
                }
                else
                {
                    gridCpuRam.Add(CreateEmptyCpuDto(bucketTime));
                }
            }

            var gridDisks = new List<DiskBucketDto>();
            var groupedDisksByName = rawDisks.GroupBy(d => d.diskName);

            foreach (var diskGroup in groupedDisksByName)
            {
                var dn = diskGroup.Key;
                var diskLookup = diskGroup
                    .GroupBy(m => (m.CreatedAt.Ticks - startTime.Ticks) / bucketTicks)
                    .ToDictionary(g => g.Key, g => g.OrderBy(x => x.CreatedAt).ToList());

                for (long b = firstBucket; b <= lastBucket; b++)
                {
                    var bucketTime = new DateTime(startTime.Ticks + (b * bucketTicks));
                    if (diskLookup.TryGetValue(b, out var sortedItems))
                    {
                        var firstItem = sortedItems.First();
                        var lastItem = sortedItems.Last();
                        var minItem = sortedItems.OrderBy(m => m.UsedPercent).First();
                        var maxItem = sortedItems.OrderByDescending(m => m.UsedPercent).First();

                        gridDisks.Add(new DiskBucketDto
                        {
                            CreatedAt = bucketTime,
                            MaxCreatedAt = lastItem.CreatedAt,
                            UsedAvg = Math.Round((double)sortedItems.Average(m => m.UsedPercent), 2),
                            UsedMin = Math.Round((double)minItem.UsedPercent, 2),
                            UsedMinTime = minItem.CreatedAt,
                            UsedMax = Math.Round((double)maxItem.UsedPercent, 2),
                            UsedMaxTime = maxItem.CreatedAt,
                            UsedOpen = Math.Round((double)firstItem.UsedPercent, 2),
                            UsedClose = Math.Round((double)lastItem.UsedPercent, 2),
                            DiskName = dn
                        });
                    }
                    else
                    {
                        gridDisks.Add(CreateEmptyDiskDto(bucketTime, dn));
                    }
                }
            }

            return new { CpuRam = gridCpuRam, Disks = gridDisks };
        }
    }

    // Kodu temiz tutmak için eklenen yardımcı metotlar (Sınıfınızın altına ekleyebilirsiniz)
    private CpuRamBucketDto CreateEmptyCpuDto(DateTime time) => new CpuRamBucketDto
    {
        CreatedAt = time,
        CpuAvg = null,
        CpuMin = null,
        CpuMax = null,
        CpuOpen = null,
        CpuClose = null,
        RamAvg = null,
        RamMin = null,
        RamMax = null,
        RamOpen = null,
        RamClose = null
    };

    private DiskBucketDto CreateEmptyDiskDto(DateTime time, string diskName) => new DiskBucketDto
    {
        CreatedAt = time,
        UsedAvg = null,
        UsedMin = null,
        UsedMax = null,
        UsedOpen = null,
        UsedClose = null,
        DiskName = diskName
    };
    // 7. Tüm Cihazları Getir (Okuma İşlemi)
    public async Task<ServiceResult<object>> GetAllComputersAsync(int userId, bool isAdmin)
    {
        var accCompIds = await _db.UserComputerAccesses.Where(x => x.UserId == userId).Select(x => x.ComputerId).ToListAsync();
        var accTagIds = await _db.UserTagAccesses.Where(x => x.UserId == userId).Select(x => x.TagId).ToListAsync();

        var query = _db.Computers.AsQueryable();
        bool isRestricted = !isAdmin || (accCompIds.Count > 0 || accTagIds.Count > 0);

        if (isRestricted)
        {
            query = query.Where(c =>
                accCompIds.Contains(c.Id) ||
                _db.ComputerTags.Any(ct => ct.ComputerId == c.Id && !ct.IsDeleted && accTagIds.Contains(ct.TagId))
            );
        }

        var computersData = await query.Select(c => new {
            Computer = c,
            ActiveTags = _db.ComputerTags
                            .Where(ct => ct.ComputerId == c.Id && !ct.IsDeleted && !ct.Tag.IsDeleted)
                            .Select(ct => ct.Tag.Name)
                            .ToList()
        }).ToListAsync();

        int offlineThreshold = _config.GetValue<int>("Alerting:OfflineThresholdSeconds", 150);

        var result = computersData.Select(x => new {
            id = x.Computer.Id,
            machineName = x.Computer.MachineName,
            displayName = x.Computer.DisplayName,
            ipAddress = x.Computer.IpAddress,
            lastSeen = x.Computer.LastSeen,
            tags = x.ActiveTags,
            isDeleted = x.Computer.IsDeleted,
            isActive = (DateTime.Now - x.Computer.LastSeen).TotalSeconds <= offlineThreshold
        })
        .OrderBy(c => c.isDeleted).ThenByDescending(c => c.isActive).ThenByDescending(c => c.lastSeen)
        .ToList();

        return ServiceResult<object>.Success(result);
    }

    // 8. Cihaz Silme (YAZMA İŞLEMİ - SARMALANDI)
    public Task<ServiceResult> DeleteComputerAsync(int id)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var computer = await _db.Computers.FindAsync(id);
            if (computer == null)
                return ServiceResult.Failure("Bilgisayar bulunamadı.");

            int offlineThreshold = _config.GetValue<int>("Alerting:OfflineThresholdSeconds", 150);
            bool isActive = (DateTime.Now - computer.LastSeen).TotalSeconds <= offlineThreshold;
            if (isActive)
            {
                return ServiceResult.Failure("Aktif olan bir bilgisayarı silemezsiniz. Lütfen önce ajanı durdurun.");
            }

            computer.IsDeleted = true;
            await _db.SaveChangesAsync();

            return ServiceResult.Success("Bilgisayar sistemden başarıyla silinmiştir.");
        }, "Cihaz",DbOperation.Delete);
    }

    // 9. Kullanıcının Etiketlerini Getir (Okuma İşlemi)
    public async Task<ServiceResult<object>> GetMyTagsAsync(int userId, bool isAdmin)
    {
        var query = _db.Tags.AsQueryable();

        if (!isAdmin)
        {
            bool hasTagManagePerm = await _db.UserRoles
                .Where(ur => ur.UserId == userId)
                .SelectMany(ur => ur.Role.RolePermissions)
                .AnyAsync(rp => rp.Permission.Name == "Tag_Manage" || rp.Permission.Name == "Tag.Manage");

            if (!hasTagManagePerm)
            {
                var accessibleComputerIds = await _db.UserComputerAccesses
                    .Where(uca => uca.UserId == userId).Select(uca => uca.ComputerId).ToListAsync();

                var accessibleTagIds = await _db.UserTagAccesses
                    .Where(uta => uta.UserId == userId).Select(uta => uta.TagId).ToListAsync();

                query = query.Where(t =>
                    accessibleTagIds.Contains(t.Id) ||
                    t.Computers.Any(c => accessibleComputerIds.Contains(c.Id)));
            }
        }

        var tags = await query.Select(t => new { t.Id, t.Name }).ToListAsync();
        return ServiceResult<object>.Success(tags);
    }

    // 10. Performans Raporu (Okuma İşlemi)
    public async Task<ServiceResult<PerformanceReportDto>> GetPerformanceReportAsync(int userId, bool isAdmin)
    {
        string cacheKey = $"PerformanceReport_User_{userId}";

        if (_cache.TryGetValue(cacheKey, out PerformanceReportDto? cachedReport) && cachedReport != null)
        {
            return ServiceResult<PerformanceReportDto>.Success(cachedReport);
        }

        // 1. Yetki filtresini oluşturuyoruz
        var allowedComputersQuery = _db.Computers.AsNoTracking();

        if (!isAdmin)
        {
            allowedComputersQuery = allowedComputersQuery.Where(c =>
                _db.UserComputerAccesses.Any(uca => uca.UserId == userId && uca.ComputerId == c.Id) ||
                _db.ComputerTags.Any(ct => !ct.IsDeleted && ct.ComputerId == c.Id &&
                    _db.UserTagAccesses.Any(uta => uta.UserId == userId && uta.TagId == ct.TagId))
            );
        }

        // Bilgisayar ID'lerini RAM'e çekiyoruz (Hızlı)
        var activeComputerIds = await allowedComputersQuery.Select(c => c.Id).ToListAsync();

        if (!activeComputerIds.Any())
            return ServiceResult<PerformanceReportDto>.Success(new PerformanceReportDto());

        // Disk ID'lerini ve İsimlerini RAM'e çekiyoruz (Sadece yetkili bilgisayarların diskleri)
        var activeDisks = await _db.ComputerDisks
            .AsNoTracking()
            .Where(d => activeComputerIds.Contains(d.ComputerId))
            .Select(d => new { d.Id, d.ComputerId, d.DiskName })
            .ToListAsync();

        var activeDiskIds = activeDisks.Select(d => d.Id).ToList();

        // 2. CPU/RAM SORGUSU (Sıfır JOIN, doğrudan ComputerId ile)
        var metricsSummary = await _db.ComputerMetrics
            .AsNoTracking()
            .Where(m => activeComputerIds.Contains(m.ComputerId))
            .GroupBy(m => m.ComputerId)
            .Select(g => new
            {
                ComputerId = g.Key,
                AvgCpu = g.Average(m => m.CpuUsage),
                AvgRam = g.Average(m => m.RamUsage),
                MaxCpu = g.Max(m => m.CpuUsage),
                MaxRam = g.Max(m => m.RamUsage)
            })
            .ToListAsync();

        if (!metricsSummary.Any())
            return ServiceResult<PerformanceReportDto>.Success(new PerformanceReportDto());

        // 3. DİSK METRİKLERİ SORGUSU (Sıfır JOIN, doğrudan ComputerDiskId ile)
        var rawDiskMetrics = await _db.DiskMetrics
            .AsNoTracking()
            .Where(m => activeDiskIds.Contains(m.ComputerDiskId))
            .GroupBy(m => m.ComputerDiskId)
            .Select(g => new
            {
                DiskId = g.Key,
                AvgUsed = g.Average(m => m.UsedPercent)
            })
            .ToListAsync();

        // 4. KOD TARAFINDA (RAM) BİRLEŞTİRME VE DTO DOLDURMA İŞLEMLERİ
        var diskMetricsSummary = rawDiskMetrics
            .Join(activeDisks,
                metric => metric.DiskId,
                disk => disk.Id,
                (metric, disk) => new
                {
                    ComputerId = disk.ComputerId,
                    DiskName = disk.DiskName,
                    AvgUsed = metric.AvgUsed
                })
            .ToList();

        var globalDiskStats = diskMetricsSummary
            .GroupBy(d => d.DiskName)
            .ToDictionary(g => g.Key, g => new
            {
                Count = g.Count(),
                GlobalAvg = g.Average(x => x.AvgUsed)
            });

        // Bilgisayar isimlerini son aşamada çekiyoruz
        var computers = await allowedComputersQuery
            .Select(c => new { c.Id, c.DisplayName, c.MachineName })
            .ToListAsync();

        var computersDict = computers.ToDictionary(c => c.Id);

        var deviceAverages = metricsSummary.Select(m =>
        {
            computersDict.TryGetValue(m.ComputerId, out var comp);

            return new
            {
                ComputerId = m.ComputerId,
                ComputerName = comp?.DisplayName ?? comp?.MachineName ?? "Bilinmeyen Cihaz",
                AvgCpu = m.AvgCpu,
                AvgRam = m.AvgRam,
                MaxCpu = m.MaxCpu,
                MaxRam = m.MaxRam,
                Disks = diskMetricsSummary
                .Where(d => d.ComputerId == m.ComputerId)
                .Select(d =>
                {
                    var stats = globalDiskStats[d.DiskName];
                    string status = "Nötr";

                    if (stats.Count > 1)
                    {
                        status = d.AvgUsed > stats.GlobalAvg ? "Kötü" : "İyi";
                    }

                    return new DiskPerformanceDto
                    {
                        DiskName = d.DiskName,
                        AverageUsedPercent = Math.Round(d.AvgUsed, 2),
                        DiskStatus = status
                    };
                }).OrderBy(d => d.DiskName).ToList()
            };
        }).ToList();

        double globalAvgCpu = deviceAverages.Average(d => d.AvgCpu);
        double globalAvgRam = deviceAverages.Average(d => d.AvgRam);

        var report = new PerformanceReportDto
        {
            GlobalAverageCpu = Math.Round(globalAvgCpu, 2),
            GlobalAverageRam = Math.Round(globalAvgRam, 2),

            GlobalDiskAverages = globalDiskStats.Select(g => new GlobalDiskAverageDto
            {
                DiskName = g.Key,
                AverageUsedPercent = Math.Round(g.Value.GlobalAvg, 2)
            }).OrderBy(x => x.DiskName).ToList(),

            Devices = deviceAverages.Select(d => new DevicePerformanceDto
            {
                ComputerId = d.ComputerId,
                ComputerName = d.ComputerName,
                AverageCpu = Math.Round(d.AvgCpu, 2),
                AverageRam = Math.Round(d.AvgRam, 2),
                CpuStatus = d.AvgCpu <= globalAvgCpu ? "İyi" : "Kötü",
                RamStatus = d.AvgRam <= globalAvgRam ? "İyi" : "Kötü",
                Disks = d.Disks
            })
            .OrderByDescending(d => d.AverageCpu)
            .ToList()
        };

        _cache.Set(cacheKey, report, TimeSpan.FromSeconds(30));

        return ServiceResult<PerformanceReportDto>.Success(report);
    }
    // 11. Metrik Özeti (Okuma İşlemi)
    public async Task<ServiceResult<MetricSummaryDto>> GetMetricsSummaryAsync(int computerId, string metricType, string? diskName)
    {
        var summary = new MetricSummaryDto();

        if (metricType == "CPU" || metricType == "RAM")
        {
            var query = _db.ComputerMetrics.AsNoTracking().Where(m => m.ComputerId == computerId);

            // SQL'e sadece ve sadece istenen sütunu yolluyoruz
            var isCpu = metricType == "CPU";

            var stats = await query
                .GroupBy(m => m.ComputerId)
                .Select(g => new
                {
                    TotalCount = g.Count(),
                    MaxVal = isCpu ? g.Max(m => m.CpuUsage) : g.Max(m => m.RamUsage), // EF Core 8/9 bunu bazen optimize edebilir ama garanti yol aşağıdadır
                })
                .FirstOrDefaultAsync();

            // GARANTİ VE EN HIZLI YOL (ŞİDDETLE TAVSİYE EDİLİR):
            // C# tarafında sorguyu ikiye ayırmak:
            if (metricType == "CPU")
            {
                var cpuStats = await query.GroupBy(m => m.ComputerId)
                    .Select(g => new { TotalCount = g.Count(), MaxVal = g.Max(m => m.CpuUsage), MinVal = g.Min(m => m.CpuUsage) })
                    .FirstOrDefaultAsync();

                if (cpuStats != null && cpuStats.TotalCount > 0)
                {
                    summary.TotalCount = cpuStats.TotalCount;
                    summary.MaxVal = cpuStats.MaxVal;
                    summary.MinVal = cpuStats.MinVal;

                    var counts = await query.GroupBy(m => m.ComputerId)
                        .Select(g => new { MaxCount = g.Count(m => m.CpuUsage == cpuStats.MaxVal), MinCount = g.Count(m => m.CpuUsage == cpuStats.MinVal) })
                        .FirstOrDefaultAsync();

                    if (counts != null) { summary.MaxCount = counts.MaxCount; summary.MinCount = counts.MinCount; }
                }
            }
            else // RAM
            {
                var ramStats = await query.GroupBy(m => m.ComputerId)
                    .Select(g => new { TotalCount = g.Count(), MaxVal = g.Max(m => m.RamUsage), MinVal = g.Min(m => m.RamUsage) })
                    .FirstOrDefaultAsync();

                if (ramStats != null && ramStats.TotalCount > 0)
                {
                    summary.TotalCount = ramStats.TotalCount;
                    summary.MaxVal = ramStats.MaxVal;
                    summary.MinVal = ramStats.MinVal;

                    var counts = await query.GroupBy(m => m.ComputerId)
                        .Select(g => new { MaxCount = g.Count(m => m.RamUsage == ramStats.MaxVal), MinCount = g.Count(m => m.RamUsage == ramStats.MinVal) })
                        .FirstOrDefaultAsync();

                    if (counts != null) { summary.MaxCount = counts.MaxCount; summary.MinCount = counts.MinCount; }
                }
            }
        }
        else if (metricType.StartsWith("Disk") && !string.IsNullOrEmpty(diskName))
        {
            // 3. ADIM: DİSK SORGUSUNDAKİ DEVASA JOIN'İ YOK EDİYORUZ
            // Milyonlarca satırlık DiskMetrics'e JOIN atmak yerine, önce minicik tablodan DiskId'yi buluyoruz (Milisaniye sürer)
            var diskId = await _db.ComputerDisks
                .AsNoTracking()
                .Where(d => d.ComputerId == computerId && d.DiskName == diskName)
                .Select(d => d.Id)
                .FirstOrDefaultAsync();

            if (diskId != 0)
            {
                var diskQuery = _db.DiskMetrics.AsNoTracking().Where(m => m.ComputerDiskId == diskId);

                // Tıpkı yukarıdaki gibi Count, Max, Min işlemlerini TEK sorguda alıyoruz
                var diskStats = await diskQuery
                    .GroupBy(m => m.ComputerDiskId)
                    .Select(g => new
                    {
                        TotalCount = g.Count(),
                        MaxVal = g.Max(m => m.UsedPercent),
                        MinVal = g.Min(m => m.UsedPercent)
                    })
                    .FirstOrDefaultAsync();

                if (diskStats != null && diskStats.TotalCount > 0)
                {
                    summary.TotalCount = diskStats.TotalCount;
                    summary.MaxVal = diskStats.MaxVal;
                    summary.MinVal = diskStats.MinVal;

                    // MaxCount ve MinCount işlemlerini TEK sorguda alıyoruz
                    var diskCounts = await diskQuery
                        .GroupBy(m => m.ComputerDiskId)
                        .Select(g => new
                        {
                            MaxCount = g.Count(m => m.UsedPercent == diskStats.MaxVal),
                            MinCount = g.Count(m => m.UsedPercent == diskStats.MinVal)
                        })
                        .FirstOrDefaultAsync();

                    if (diskCounts != null)
                    {
                        summary.MaxCount = diskCounts.MaxCount;
                        summary.MinCount = diskCounts.MinCount;
                    }
                }
            }
        }

        return ServiceResult<MetricSummaryDto>.Success(summary);
    }
    // 12. Rapor Detayları İçin Son 5 Veri Gününün Trendi (Yeni Eklendi)
    public async Task<ServiceResult<object>> GetMetricsTrendDataAsync(int computerId, string metricType, string? diskName)
    {
        int maxPointsForRegression = _config.GetValue<int>("ChartSettings:RegressionMaxPoints", 1000);

        if (metricType == "CPU" || metricType == "RAM")
        {
            // 1. ZEKİCE HACK: Milyonlarca satırı tarayıp farklı tarihleri bulmak yerine
            // sadece en son veri gelen tarihi buluyoruz (1 Milisaniye)
            var lastMetricDate = await _db.ComputerMetrics
                .AsNoTracking()
                .Where(m => m.ComputerId == computerId)
                .OrderByDescending(m => m.CreatedAt)
                .Select(m => m.CreatedAt)
                .FirstOrDefaultAsync();

            if (lastMetricDate == default) return ServiceResult<object>.Success(new List<object>());

            // En son veri gelen günden geriye 5 günlük bir pencere açıyoruz
            var maxDate = lastMetricDate.Date.AddDays(1);
            var minDate = maxDate.AddDays(-5);

            var baseQuery = _db.ComputerMetrics
                .AsNoTracking()
                .Where(m => m.ComputerId == computerId && m.CreatedAt >= minDate && m.CreatedAt < maxDate);

            // TERNARY OPERATÖRÜ SQL'DEN ÇIKARTIYORUZ
            var rawData = metricType == "CPU"
                ? await baseQuery.Select(m => new { m.CreatedAt, value = m.CpuUsage }).ToListAsync()
                : await baseQuery.Select(m => new { m.CreatedAt, value = m.RamUsage }).ToListAsync();
            if (rawData.Count <= maxPointsForRegression)
            {
                var data = rawData.OrderBy(m => m.CreatedAt).Select(m => new { createdAt = m.CreatedAt, value = m.value }).ToList();
                return ServiceResult<object>.Success(data);
            }
            else
            {
                long totalTicks = (maxDate - minDate).Ticks;
                long bucketTicks = totalTicks / maxPointsForRegression;
                if (bucketTicks <= 0) bucketTicks = TimeSpan.FromSeconds(1).Ticks;

                long lastBucketTrend = totalTicks > 0 ? (totalTicks - 1) / bucketTicks : 0;
                var groupedData = rawData
                    .GroupBy(m => (m.CreatedAt.Ticks - minDate.Ticks) / bucketTicks)
                    .Where(g => g.Key <= lastBucketTrend)
                    .Select(g => new {
                        createdAt = new DateTime(minDate.Ticks + (g.Key * bucketTicks)),
                        value = Math.Round(g.Average(m => m.value), 2)
                    })
                    .OrderBy(m => m.createdAt)
                    .ToList();

                return ServiceResult<object>.Success(groupedData);
            }
        }
        else if (metricType.StartsWith("Disk") && !string.IsNullOrEmpty(diskName))
        {
            var diskId = await _db.ComputerDisks
                .AsNoTracking()
                .Where(d => d.ComputerId == computerId && d.DiskName == diskName)
                .Select(d => d.Id)
                .FirstOrDefaultAsync();

            if (diskId == 0) return ServiceResult<object>.Success(new List<object>());

            // 1. DİSK İÇİN ZEKİCE HACK: Sadece en son tarihi bul (1 Milisaniye)
            var lastMetricDate = await _db.DiskMetrics
                .AsNoTracking()
                .Where(m => m.ComputerDiskId == diskId)
                .OrderByDescending(m => m.CreatedAt)
                .Select(m => m.CreatedAt)
                .FirstOrDefaultAsync();

            if (lastMetricDate == default) return ServiceResult<object>.Success(new List<object>());

            var maxDate = lastMetricDate.Date.AddDays(1);
            var minDate = maxDate.AddDays(-5);

            // 2. YENİ İNDEKSLE IŞIK HIZINDA OKUMA
            var rawData = await _db.DiskMetrics
                .AsNoTracking()
                .Where(m => m.ComputerDiskId == diskId && m.CreatedAt >= minDate && m.CreatedAt < maxDate)
                .Select(m => new { m.CreatedAt, value = m.UsedPercent })
                .ToListAsync();

            if (rawData.Count <= maxPointsForRegression)
            {
                var data = rawData.OrderBy(m => m.CreatedAt).Select(m => new { createdAt = m.CreatedAt, value = m.value }).ToList();
                return ServiceResult<object>.Success(data);
            }
            else
            {
                long totalTicks = (maxDate - minDate).Ticks;
                long bucketTicks = totalTicks / maxPointsForRegression;
                if (bucketTicks <= 0) bucketTicks = TimeSpan.FromSeconds(1).Ticks;

                long lastBucketTrend = totalTicks > 0 ? (totalTicks - 1) / bucketTicks : 0;
                var groupedData = rawData
                    .GroupBy(m => (m.CreatedAt.Ticks - minDate.Ticks) / bucketTicks)
                    .Where(g => g.Key <= lastBucketTrend)
                    .Select(g => new {
                        createdAt = new DateTime(minDate.Ticks + (g.Key * bucketTicks)),
                        value = Math.Round(g.Average(m => m.value), 2)
                    })
                    .OrderBy(m => m.createdAt)
                    .ToList();

                return ServiceResult<object>.Success(groupedData);
            }
        }

        return ServiceResult<object>.Success(new List<object>());
    }
    public async Task<ServiceResult<ThresholdAnalysisReportDto>> GetThresholdAnalysisAsync(int computerId, ThresholdReportRequestDto request)
    {
        var computer = await _db.Computers.Include(c => c.Disks).FirstOrDefaultAsync(c => c.Id == computerId);
        if (computer == null) return ServiceResult<ThresholdAnalysisReportDto>.Failure("Cihaz bulunamadı.");

        var startDate = request.StartDate;
        var endDate = request.EndDate;

        if ((endDate - startDate).TotalDays > 31)
        {
            return ServiceResult<ThresholdAnalysisReportDto>.Failure("Sistem performansı için lütfen maksimum 31 günlük bir analiz aralığı seçiniz.");
        }

        // --- YEREL YARDIMCI FONKSİYON: 100 Noktaya İndirme (Decimation) ---
        List<ThresholdBreachDetailDto> DecimateBreaches(List<ThresholdBreachDetailDto> rawBreaches, int targetCount)
        {
            if (rawBreaches.Count <= targetCount) return rawBreaches;

            long totalTicks = (endDate - startDate).Ticks;
            long bucketTicks = totalTicks / targetCount;
            if (bucketTicks <= 0) return rawBreaches;

            return rawBreaches
                .GroupBy(b => (b.Timestamp.Ticks - startDate.Ticks) / bucketTicks)
                .Select(g => g.OrderByDescending(x => x.Value).First())
                .OrderBy(x => x.Timestamp)
                .ToList();
        }

        // 1. TOPLAM VERİ SAYISINI ÇEK
        var totalCpuRamCount = await _db.ComputerMetrics
            .Where(m => m.ComputerId == computerId && m.CreatedAt >= startDate && m.CreatedAt <= endDate)
            .CountAsync();

        // 2. TÜM UYARILARI TEK SEFERDE ÇEK (3 veritabanı turunu 1'e düşürdük)
        // Yeni eklediğimiz Kapsayan İndeks (Covering Index) sayesinde bu sorgu ışık hızında çalışacak.
        var allBreachesRaw = await _db.MetricWarningLogs
            .AsNoTracking()
            .Where(w => w.ComputerId == computerId && w.CreatedAt >= startDate && w.CreatedAt <= endDate)
            .OrderBy(w => w.CreatedAt) // İndeks zaten sıralı olduğu için SQL'e ekstra maliyet yaratmaz
            .Select(w => new
            {
                w.MetricTypeId,
                w.ComputerDiskId,
                Breach = new ThresholdBreachDetailDto
                {
                    Timestamp = w.CreatedAt,
                    Value = w.MetricValue,
                    ThresholdPercent = w.ThresholdValue
                }
            })
            .ToListAsync();

        // RAM ÜZERİNDE AYRIŞTIRMA (Milisaniyeler sürer)
        var cpuBreachesRaw = allBreachesRaw.Where(x => x.MetricTypeId == 1).Select(x => x.Breach).ToList();
        var ramBreachesRaw = allBreachesRaw.Where(x => x.MetricTypeId == 2).Select(x => x.Breach).ToList();

        // MAKSİMUM NOKTA KURALINI UYGULA
        int targetPoints = _config.GetValue<int>("ChartSettings:ThresholdAnalysisTargetPoints", 70);
        var cpuBreaches = DecimateBreaches(cpuBreachesRaw, targetPoints);
        var ramBreaches = DecimateBreaches(ramBreachesRaw, targetPoints);

        var report = new ThresholdAnalysisReportDto
        {
            ComputerId = computer.Id,
            ComputerName = computer.DisplayName ?? computer.MachineName,
            TotalActiveCount = totalCpuRamCount,
            CpuResult = new MetricThresholdResult
            {
                TotalCount = totalCpuRamCount,
                WarningCount = cpuBreachesRaw.Count,
                BelowThresholdCount = Math.Max(0, totalCpuRamCount - cpuBreachesRaw.Count),
                Breaches = cpuBreaches
            },
            RamResult = new MetricThresholdResult
            {
                TotalCount = totalCpuRamCount,
                WarningCount = ramBreachesRaw.Count,
                BelowThresholdCount = Math.Max(0, totalCpuRamCount - ramBreachesRaw.Count),
                Breaches = ramBreaches
            }
        };

        // 3. DİSKLER İÇİN AYRIŞTIRMA VE HESAPLAMA
        var diskIds = computer.Disks.Select(d => d.Id).ToList();
        if (diskIds.Any())
        {
            var diskTotalCounts = await _db.DiskMetrics
                .Where(m => diskIds.Contains(m.ComputerDiskId) && m.CreatedAt >= startDate && m.CreatedAt <= endDate)
                .GroupBy(m => m.ComputerDiskId)
                .Select(g => new { DiskId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.DiskId, x => x.Count);

            // Disk uyarılarını yukarıdaki devasa listeden RAM üzerinde çekiyoruz
            var diskBreachesLookup = allBreachesRaw
                .Where(x => x.ComputerDiskId.HasValue)
                .ToLookup(x => x.ComputerDiskId!.Value, x => x.Breach);

            foreach (var disk in computer.Disks)
            {
                int totalDiskCount = diskTotalCounts.ContainsKey(disk.Id) ? diskTotalCounts[disk.Id] : 0;
                var rawBreachesForThisDisk = diskBreachesLookup[disk.Id].ToList();

                var decimatedDiskBreaches = DecimateBreaches(rawBreachesForThisDisk, targetPoints);

                report.DiskResults.Add(new DiskThresholdResult
                {
                    DiskName = disk.DiskName,
                    TotalCount = totalDiskCount,
                    WarningCount = rawBreachesForThisDisk.Count,
                    BelowThresholdCount = Math.Max(0, totalDiskCount - rawBreachesForThisDisk.Count),
                    Breaches = decimatedDiskBreaches
                });
            }
        }

        return ServiceResult<ThresholdAnalysisReportDto>.Success(report);
    }

    public async Task<ServiceResult<object>> GetLogManagementDataAsync(int computerId, string start, string end, int userId, bool isAdmin)
    {
        // Geriye dönük uyumluluk için, artık paginated versiyonu ilk sayfa için çağırabiliriz
        // Ama histogramı da içermesi gerektiği için birleştiriyoruz.
        var histResult = await GetLogHistogramDataAsync(computerId, start, end, userId, isAdmin);
        var logsResult = await GetPaginatedLogsAsync(computerId, start, end, 0, 500, userId, isAdmin);

        if (!histResult.IsSuccess) return histResult;
        if (!logsResult.IsSuccess) return logsResult;

        var res = (LogManagementResponseDto)logsResult.Data!;
        res.Histogram = (List<HistogramBucketDto>)histResult.Data!;

        return ServiceResult<object>.Success(res);
    }

    public async Task<ServiceResult<object>> GetLogHistogramDataAsync(int computerId, string start, string end, int userId, bool isAdmin, string? levels = null, string? metrics = null, string? search = null)
    {
        if (!await CheckComputerAccessAsync(computerId, userId, isAdmin))
            return ServiceResult<object>.Failure("Bu cihaza erişim yetkiniz bulunamadı.");

        if (!DateTime.TryParse(start, out DateTime startTime) || !DateTime.TryParse(end, out DateTime endTime))
            return ServiceResult<object>.Failure("Geçersiz tarih formatı.");

        var levelList = string.IsNullOrWhiteSpace(levels) ? new List<string> { "Critical", "Warning", "Info" } : levels.Split(',').ToList();
        var metricList = string.IsNullOrWhiteSpace(metrics) ? new List<string> { "CPU", "RAM", "Disk" } : metrics.Split(',').ToList();

        // 1. Histogram Verilerini Özetle
        var totalDays = (endTime - startTime).TotalDays;
        var infoCounts = new List<dynamic>();
        
        if (levelList.Contains("Info")) {
            var metricsQuery = _db.ComputerMetrics.Where(m => m.ComputerId == computerId && m.CreatedAt >= startTime && m.CreatedAt <= endTime);
            
            if (!string.IsNullOrEmpty(search)) {
                var s = search.ToLower();
                bool matchesCpu = "cpu".Contains(s);
                bool matchesRam = "ram".Contains(s);
                bool matchesInfo = "info".Contains(s);

                if (!matchesCpu && !matchesRam && !matchesInfo && !s.Any(char.IsDigit)) {
                    metricsQuery = metricsQuery.Where(m => false);
                }
            }

            if (totalDays > 3)
            {
                var summary = await metricsQuery
                    .GroupBy(m => new { m.CreatedAt.Year, m.CreatedAt.Month, m.CreatedAt.Day, m.CreatedAt.Hour })
                    .Select(g => new { Timestamp = new DateTime(g.Key.Year, g.Key.Month, g.Key.Day, g.Key.Hour, 0, 0), Count = g.Count() })
                    .ToListAsync();
                infoCounts = summary.Select(s => (dynamic)s).ToList();
            }
            else
            {
                 var summary = await metricsQuery
                    .GroupBy(m => new { m.CreatedAt.Year, m.CreatedAt.Month, m.CreatedAt.Day, m.CreatedAt.Hour, m.CreatedAt.Minute })
                    .Select(g => new { Timestamp = new DateTime(g.Key.Year, g.Key.Month, g.Key.Day, g.Key.Hour, g.Key.Minute, 0), Count = g.Count() })
                    .ToListAsync();
                 infoCounts = summary.Select(s => (dynamic)s).ToList();
            }
        }

        var warningsQuery = _db.MetricWarningLogs
            .AsNoTracking()
            .Where(w => w.ComputerId == computerId && w.CreatedAt >= startTime && w.CreatedAt <= endTime);

        // Warning/Critical filtreleme
        if (!levelList.Contains("Critical") && !levelList.Contains("Warning")) {
            warningsQuery = warningsQuery.Where(w => false); // İkisi de yoksa boş dön
        } else if (!levelList.Contains("Critical")) {
            warningsQuery = warningsQuery.Where(w => w.MetricValue < 95);
        } else if (!levelList.Contains("Warning")) {
            warningsQuery = warningsQuery.Where(w => w.MetricValue >= 95);
        }

        // Metrik filtreleme
        if (!metricList.Contains("CPU") && !metricList.Contains("RAM") && !metricList.Contains("Disk")) {
             warningsQuery = warningsQuery.Where(w => false);
        } else {
            var mTypes = new List<int>();
            if (metricList.Contains("CPU")) mTypes.Add(1);
            if (metricList.Contains("RAM")) mTypes.Add(2);
            if (metricList.Contains("Disk")) mTypes.Add(3);
            warningsQuery = warningsQuery.Where(w => mTypes.Contains(w.MetricTypeId));
        }

        if (!string.IsNullOrEmpty(search)) {
            var s = search.ToLower();
            warningsQuery = warningsQuery.Where(w => 
                w.MetricType.Name.ToLower().Contains(s) || 
                (w.ComputerDisk != null && w.ComputerDisk.DiskName.ToLower().Contains(s)) ||
                (w.MetricValue >= 95 && "critical".Contains(s)) ||
                (w.MetricValue < 95 && "warning".Contains(s))
            );
        }

        var warningLogs = await warningsQuery
            .Select(w => new { w.CreatedAt, w.MetricValue, w.MetricTypeId, w.ComputerDiskId })
            .ToListAsync();

        var computer = await _db.Computers.Include(c => c.Disks).AsNoTracking().FirstOrDefaultAsync(c => c.Id == computerId);
        var diskDict = computer?.Disks?.ToDictionary(d => d.Id) ?? new Dictionary<int, ComputerDisk>();

        var totalMinutes = (endTime - startTime).TotalMinutes;
        int bucketCount = 60; 
        double minutesPerBucket = totalMinutes / bucketCount;
        if (minutesPerBucket < 1) minutesPerBucket = 1;

        var histogramDict = new Dictionary<string, HistogramBucketDto>();

        for (int i = 0; i < bucketCount; i++)
        {
            var tsDate = startTime.AddMinutes(i * minutesPerBucket);
            var tsStr = tsDate.ToString("yyyy-MM-ddTHH:mm:ss");
            histogramDict[tsStr] = new HistogramBucketDto { Timestamp = tsStr };
        }

        foreach (var ic in infoCounts)
        {
            var mins = (ic.Timestamp - startTime).TotalMinutes;
            var bucketIndex = (int)(mins / minutesPerBucket);
            if (bucketIndex >= 0 && bucketIndex < bucketCount)
            {
                var ts = startTime.AddMinutes(bucketIndex * minutesPerBucket).ToString("yyyy-MM-ddTHH:mm:ss");
                histogramDict[ts].InfoCount += (int)ic.Count * 2;
                
                // Info için de metrik detaylarını ekleyelim (Basitleştirilmiş: Her ic.Count 1 CPU 1 RAM sayılır)
                histogramDict[ts].Details.Info.Count += (int)ic.Count * 2;
                if (!histogramDict[ts].Details.Info.Metrics.ContainsKey("CPU")) histogramDict[ts].Details.Info.Metrics["CPU"] = 0;
                if (!histogramDict[ts].Details.Info.Metrics.ContainsKey("RAM")) histogramDict[ts].Details.Info.Metrics["RAM"] = 0;
                histogramDict[ts].Details.Info.Metrics["CPU"] += (int)ic.Count;
                histogramDict[ts].Details.Info.Metrics["RAM"] += (int)ic.Count;
            }
        }

        foreach (var w in warningLogs)
        {
            var mins = (w.CreatedAt - startTime).TotalMinutes;
            var bucketIndex = (int)(mins / minutesPerBucket);
            if (bucketIndex >= 0 && bucketIndex < bucketCount)
            {
                var ts = startTime.AddMinutes(bucketIndex * minutesPerBucket).ToString("yyyy-MM-ddTHH:mm:ss");
                var bucket = histogramDict[ts];
                
                bool isCritical = w.MetricValue >= 95;
                var level = isCritical ? bucket.Details.Critical : bucket.Details.Warning;
                
                if (isCritical) bucket.CriticalCount++;
                else bucket.WarningCount++;

                string metricName = w.MetricTypeId == 1 ? "CPU" : (w.MetricTypeId == 2 ? "RAM" : $"Disk ({diskDict.GetValueOrDefault(w.ComputerDiskId ?? 0)?.DiskName ?? "Bilinmeyen"})");
                
                level.Count++;
                if (!level.Metrics.ContainsKey(metricName)) level.Metrics[metricName] = 0;
                level.Metrics[metricName]++;

                if (bucket.InfoCount > 0) {
                    bucket.InfoCount--;
                    bucket.Details.Info.Count--;
                }
            }
        }

        return ServiceResult<object>.Success(histogramDict.Values.OrderBy(h => h.Timestamp).ToList());
    }

    public async Task<ServiceResult<object>> GetPaginatedLogsAsync(int computerId, string start, string end, int offset, int limit, int userId, bool isAdmin, string? levels = null, string? metrics = null, string? search = null)
    {
        _db.Database.SetCommandTimeout(90);

        if (!await CheckComputerAccessAsync(computerId, userId, isAdmin))
            return ServiceResult<object>.Failure("Bu cihaza erişim yetkiniz bulunmamaktadır.");

        if (!DateTime.TryParse(start, out DateTime startTime) || !DateTime.TryParse(end, out DateTime endTime))
            return ServiceResult<object>.Failure("Geçersiz tarih formatı.");

        var computer = await _db.Computers.Include(c => c.Disks).AsNoTracking().FirstOrDefaultAsync(c => c.Id == computerId);
        if (computer == null) return ServiceResult<object>.Failure("Cihaz bulunamadı.");

        var levelList = string.IsNullOrWhiteSpace(levels) ? new List<string> { "Critical", "Warning", "Info" } : levels.Split(',').ToList();
        var metricList = string.IsNullOrWhiteSpace(metrics) ? new List<string> { "CPU", "RAM", "Disk" } : metrics.Split(',').ToList();

        // 1. Toplam Sayıyı Al
        int totalCount = 0;
        if (offset == 0) {
            var countResult = await GetLogCountAsync(computerId, start, end, userId, isAdmin, levels, metrics, search);
            totalCount = countResult.Data;
        }

        var allLogs = new List<LogEntryDto>();

        // 2. Uyarıları çek (Warning/Critical)
        var warningLookup = new Dictionary<string, MetricWarningLog>();
        if (levelList.Contains("Critical") || levelList.Contains("Warning"))
        {
            var warningsQuery = _db.MetricWarningLogs.AsNoTracking().Where(w => w.ComputerId == computerId && w.CreatedAt >= startTime && w.CreatedAt <= endTime);
            
            if (!levelList.Contains("Critical")) warningsQuery = warningsQuery.Where(w => w.MetricValue < 95);
            if (!levelList.Contains("Warning")) warningsQuery = warningsQuery.Where(w => w.MetricValue >= 95);
            
            var mTypes = new List<int>();
            if (metricList.Contains("CPU")) mTypes.Add(1);
            if (metricList.Contains("RAM")) mTypes.Add(2);
            if (metricList.Contains("Disk")) mTypes.Add(3);
            warningsQuery = warningsQuery.Where(w => mTypes.Contains(w.MetricTypeId));

            if (!string.IsNullOrEmpty(search)) {
                var s = search.ToLower();
                warningsQuery = warningsQuery.Where(w => 
                    w.MetricType.Name.ToLower().Contains(s) || 
                    (w.ComputerDisk != null && w.ComputerDisk.DiskName.ToLower().Contains(s)) ||
                    (w.MetricValue >= 95 && "critical".Contains(s)) ||
                    (w.MetricValue < 95 && "warning".Contains(s))
                );
            }

            var warningLogs = await warningsQuery
                .OrderByDescending(w => w.CreatedAt)
                .Skip(offset)
                .Take(limit)
                .ToListAsync();

            warningLookup = warningLogs
                .GroupBy(w => $"{w.MetricTypeId}_{w.ComputerDiskId}_{(long)(w.CreatedAt.Ticks / 10000000)}")
                .ToDictionary(g => g.Key, g => g.First());

            var diskDictForWarn = computer.Disks?.ToDictionary(d => d.Id) ?? new Dictionary<int, ComputerDisk>();
            foreach (var w in warningLogs) {
                string mName = w.MetricTypeId == 1 ? "CPU" : (w.MetricTypeId == 2 ? "RAM" : $"Disk ({diskDictForWarn.GetValueOrDefault(w.ComputerDiskId ?? 0)?.DiskName ?? "Bilinmeyen"})");
                allLogs.Add(new LogEntryDto { 
                    Timestamp = w.CreatedAt, 
                    Level = w.MetricValue >= 95 ? "Critical" : "Warning", 
                    Metric = mName, 
                    Value = Math.Round(w.MetricValue, 1), 
                    Limit = w.ThresholdValue, 
                    Message = $"{mName} kullanımı %{w.MetricValue:F1} seviyesine ulaştı. (Sınır: %{w.ThresholdValue})" 
                });
            }
        }

        // 3. Info'ları çek
        if (levelList.Contains("Info"))
        {
            // Info araması: Eğer arama terimi varsa ve "info" veya metrik adlarını içermiyorsa 
            // ve sayısal bir değer araması değilse Info'ları hiç getirmeyebiliriz.
            // Ama basitleştirmek için metrik bazlı kontrol yapalım.
            bool searchMatchesInfo = string.IsNullOrEmpty(search) || "info".Contains(search.ToLower());

            if (metricList.Contains("CPU") || metricList.Contains("RAM")) {
                var metricsQuery = _db.ComputerMetrics
                    .AsNoTracking()
                    .Where(m => m.ComputerId == computerId && m.CreatedAt >= startTime && m.CreatedAt <= endTime);
                
                if (!string.IsNullOrEmpty(search)) {
                    var s = search.ToLower();
                    bool matchesCpu = "cpu".Contains(s);
                    bool matchesRam = "ram".Contains(s);
                    
                    if (matchesCpu && matchesRam) { /* ikisi de kalsın */ }
                    else if (matchesCpu) metricsQuery = metricsQuery.Where(m => true); // CPU is handled by logic below
                    else if (matchesRam) metricsQuery = metricsQuery.Where(m => true); 
                    else if (searchMatchesInfo) { /* kalsın */ }
                    else {
                         // Sayısal değer araması olabilir mi? m.CpuUsage.ToString().Contains(s)
                         // EF Core'da ToString().Contains() bazen sıkıntılıdır. 
                         // Sadece info/cpu/ram eşleşmiyorsa ve search boş değilse burayı boşaltabiliriz.
                         if (!s.Any(char.IsDigit)) metricsQuery = metricsQuery.Where(m => false);
                    }
                }

                var cpuRamMetrics = await metricsQuery
                    .OrderByDescending(m => m.CreatedAt)
                    .Skip(offset / 2)
                    .Take(limit)
                    .Select(m => new { m.CreatedAt, m.CpuUsage, m.RamUsage })
                    .ToListAsync();

                foreach (var m in cpuRamMetrics) {
                    long ts = m.CreatedAt.Ticks / 10000000;
                    string s = search?.ToLower() ?? "";
                    
                    if (metricList.Contains("CPU") && !warningLookup.ContainsKey($"1__{ts}")) {
                        if (string.IsNullOrEmpty(s) || "cpu".Contains(s) || "info".Contains(s) || m.CpuUsage.ToString().Contains(s))
                            allLogs.Add(new LogEntryDto { Timestamp = m.CreatedAt, Level = "Info", Metric = "CPU", Value = Math.Round((double)m.CpuUsage, 1), Limit = computer.CpuThreshold ?? 85, Message = $"CPU kullanımı %{m.CpuUsage:F1} seviyesinde." });
                    }
                    if (metricList.Contains("RAM") && !warningLookup.ContainsKey($"2__{ts}")) {
                        if (string.IsNullOrEmpty(s) || "ram".Contains(s) || "info".Contains(s) || m.RamUsage.ToString().Contains(s))
                            allLogs.Add(new LogEntryDto { Timestamp = m.CreatedAt, Level = "Info", Metric = "RAM", Value = Math.Round((double)m.RamUsage, 1), Limit = computer.RamThreshold ?? 85, Message = $"RAM kullanımı %{m.RamUsage:F1} seviyesinde." });
                    }
                }
            }

            if (metricList.Contains("Disk")) {
                var diskMetricsQuery = _db.DiskMetrics
                    .AsNoTracking()
                    .Where(m => m.ComputerDisk.ComputerId == computerId && m.CreatedAt >= startTime && m.CreatedAt <= endTime);

                if (!string.IsNullOrEmpty(search)) {
                    var s = search.ToLower();
                    diskMetricsQuery = diskMetricsQuery.Where(m => m.ComputerDisk.DiskName.ToLower().Contains(s) || "disk".Contains(s) || "info".Contains(s));
                }

                var diskMetrics = await diskMetricsQuery
                    .OrderByDescending(m => m.CreatedAt)
                    .Skip(offset)
                    .Take(limit)
                    .Select(m => new { m.CreatedAt, m.ComputerDiskId, m.UsedPercent })
                    .ToListAsync();

                var diskDict = computer.Disks?.ToDictionary(d => d.Id) ?? new Dictionary<int, ComputerDisk>();
                foreach (var dm in diskMetrics) {
                    long ts = dm.CreatedAt.Ticks / 10000000;
                    if (!warningLookup.ContainsKey($"3_{dm.ComputerDiskId}_{ts}")) {
                         var dInfo = diskDict.GetValueOrDefault(dm.ComputerDiskId);
                         string s = search?.ToLower() ?? "";
                         string mName = $"Disk ({dInfo?.DiskName ?? "Bilinmeyen"})";
                         
                         if (string.IsNullOrEmpty(s) || mName.ToLower().Contains(s) || "info".Contains(s) || dm.UsedPercent.ToString().Contains(s))
                            allLogs.Add(new LogEntryDto { Timestamp = dm.CreatedAt, Level = "Info", Metric = mName, Value = Math.Round(dm.UsedPercent, 1), Limit = dInfo?.ThresholdPercent ?? 90, Message = $"Disk doluluk oranı %{dm.UsedPercent:F1} seviyesinde." });
                    }
                }
            }
        }

        var result = new LogManagementResponseDto
        {
            Logs = allLogs.OrderByDescending(l => l.Timestamp).Take(limit).ToList(), 
            TotalCount = totalCount
        };

        return ServiceResult<object>.Success(result);
    }

    public async Task ExportLogsCsvAsync(int computerId, string start, string end, int userId, bool isAdmin, StreamWriter writer)
    {
        if (!await CheckComputerAccessAsync(computerId, userId, isAdmin))
            throw new UnauthorizedAccessException("Bu cihaza erişim yetkiniz bulunmamaktadır.");

        if (!DateTime.TryParse(start, out DateTime startTime) || !DateTime.TryParse(end, out DateTime endTime))
            throw new ArgumentException("Geçersiz tarih formatı.");

        var computer = await _db.Computers.Include(c => c.Disks).AsNoTracking().FirstOrDefaultAsync(c => c.Id == computerId);
        if (computer == null) throw new KeyNotFoundException("Cihaz bulunamadı.");

        // Uyarı loglarını çek (bunlar genelde azdır)
        var warningLogs = await _db.MetricWarningLogs
            .AsNoTracking()
            .Where(w => w.ComputerId == computerId && w.CreatedAt >= startTime && w.CreatedAt <= endTime)
            .ToListAsync();

        var warningLookup = warningLogs
            .GroupBy(w => $"{w.MetricTypeId}_{w.ComputerDiskId}_{(long)(w.CreatedAt.Ticks / 10000000)}")
            .ToDictionary(g => g.Key, g => g.First());

        // CSV Başlık
        await writer.WriteLineAsync("Zaman Damgası;Seviye;Metrik;Değer (%);Sınır (%);Detay / Mesaj");

        // CPU/RAM Metriklerini parça parça işle (50K'lık gruplar)
        const int batchSize = 50000;
        int skip = 0;
        bool hasMore = true;

        while (hasMore)
        {
            var batch = await _db.ComputerMetrics
                .AsNoTracking()
                .Where(m => m.ComputerId == computerId && m.CreatedAt >= startTime && m.CreatedAt <= endTime)
                .OrderByDescending(m => m.CreatedAt)
                .Skip(skip)
                .Take(batchSize)
                .ToListAsync();

            if (batch.Count == 0) break;
            hasMore = batch.Count == batchSize;
            skip += batch.Count;

            foreach (var m in batch)
            {
                long ts = m.CreatedAt.Ticks / 10000000;
                string timeStr = m.CreatedAt.ToString("dd.MM.yyyy HH:mm:ss");

                // CPU
                if (warningLookup.TryGetValue($"1__{ts}", out var cpuWarn))
                {
                    string level = cpuWarn.MetricValue >= 95 ? "Critical" : "Warning";
                    await writer.WriteLineAsync($"{timeStr};{level};CPU;{Math.Round((double)m.CpuUsage, 1)};{cpuWarn.ThresholdValue};\"CPU kullanımı %{m.CpuUsage:F1} seviyesine ulaştı. (Sınır: %{cpuWarn.ThresholdValue})\"");
                }
                else
                {
                    await writer.WriteLineAsync($"{timeStr};Info;CPU;{Math.Round((double)m.CpuUsage, 1)};{computer.CpuThreshold ?? 85};\"CPU kullanımı %{m.CpuUsage:F1} seviyesinde.\"");
                }

                // RAM
                if (warningLookup.TryGetValue($"2__{ts}", out var ramWarn))
                {
                    string level = ramWarn.MetricValue >= 95 ? "Critical" : "Warning";
                    await writer.WriteLineAsync($"{timeStr};{level};RAM;{Math.Round((double)m.RamUsage, 1)};{ramWarn.ThresholdValue};\"RAM kullanımı %{m.RamUsage:F1} seviyesine ulaştı. (Sınır: %{ramWarn.ThresholdValue})\"");
                }
                else
                {
                    await writer.WriteLineAsync($"{timeStr};Info;RAM;{Math.Round((double)m.RamUsage, 1)};{computer.RamThreshold ?? 85};\"RAM kullanımı %{m.RamUsage:F1} seviyesinde.\"");
                }
            }

            await writer.FlushAsync();
        }

        // Disk Metriklerini parça parça işle
        var diskDict = computer.Disks?.ToDictionary(d => d.Id) ?? new Dictionary<int, ComputerDisk>();
        var disksDict = computer.Disks?.ToDictionary(d => d.Id, d => d.DiskName) ?? new Dictionary<int, string>();
        skip = 0;
        hasMore = true;

        while (hasMore)
        {
            var batch = await _db.DiskMetrics
                .AsNoTracking()
                .Where(m => m.ComputerDisk.ComputerId == computerId && m.CreatedAt >= startTime && m.CreatedAt <= endTime)
                .OrderByDescending(m => m.CreatedAt)
                .Skip(skip)
                .Take(batchSize)
                .ToListAsync();

            if (batch.Count == 0) break;
            hasMore = batch.Count == batchSize;
            skip += batch.Count;

            foreach (var dm in batch)
            {
                long ts = dm.CreatedAt.Ticks / 10000000;
                string key = $"3_{dm.ComputerDiskId}_{ts}";
                string timeStr = dm.CreatedAt.ToString("dd.MM.yyyy HH:mm:ss");
                string diskName = disksDict.TryGetValue(dm.ComputerDiskId, out var name) ? name : "Bilinmeyen";
                var dInfo = diskDict.GetValueOrDefault(dm.ComputerDiskId);

                if (warningLookup.TryGetValue(key, out var dWarn))
                {
                    string level = dWarn.MetricValue >= 95 ? "Critical" : "Warning";
                    await writer.WriteLineAsync($"{timeStr};{level};Disk ({diskName});{Math.Round(dm.UsedPercent, 1)};{dWarn.ThresholdValue};\"Disk doluluk oranı %{dm.UsedPercent:F1} oldu. (Sınır: %{dWarn.ThresholdValue})\"");
                }
                else
                {
                    await writer.WriteLineAsync($"{timeStr};Info;Disk ({diskName});{Math.Round(dm.UsedPercent, 1)};{dInfo?.ThresholdPercent ?? 90};\"Disk doluluk oranı %{dm.UsedPercent:F1} seviyesinde.\"");
                }
            }

            await writer.FlushAsync();
        }
    }

    public async Task<ServiceResult<int>> GetLogCountAsync(int computerId, string start, string end, int userId, bool isAdmin, string? levels = null, string? metrics = null, string? search = null)
    {
        if (!await CheckComputerAccessAsync(computerId, userId, isAdmin))
            return ServiceResult<int>.Failure("Bu cihaza erişim yetkiniz bulunmamaktadır.");

        if (!DateTime.TryParse(start, out DateTime startTime) || !DateTime.TryParse(end, out DateTime endTime))
            return ServiceResult<int>.Failure("Geçersiz tarih formatı.");

        var levelList = string.IsNullOrWhiteSpace(levels) ? new List<string> { "Critical", "Warning", "Info" } : levels.Split(',').ToList();
        var metricList = string.IsNullOrWhiteSpace(metrics) ? new List<string> { "CPU", "RAM", "Disk" } : metrics.Split(',').ToList();

        int totalCount = 0;

        // Warning/Critical Count
        if (levelList.Contains("Critical") || levelList.Contains("Warning")) {
            var warningsQuery = _db.MetricWarningLogs.Where(w => w.ComputerId == computerId && w.CreatedAt >= startTime && w.CreatedAt <= endTime);
            
            if (!levelList.Contains("Critical")) warningsQuery = warningsQuery.Where(w => w.MetricValue < 95);
            if (!levelList.Contains("Warning")) warningsQuery = warningsQuery.Where(w => w.MetricValue >= 95);
            
            var mTypes = new List<int>();
            if (metricList.Contains("CPU")) mTypes.Add(1);
            if (metricList.Contains("RAM")) mTypes.Add(2);
            if (metricList.Contains("Disk")) mTypes.Add(3);
            warningsQuery = warningsQuery.Where(w => mTypes.Contains(w.MetricTypeId));

            if (!string.IsNullOrEmpty(search)) {
                var s = search.ToLower();
                warningsQuery = warningsQuery.Where(w => 
                    w.MetricType.Name.ToLower().Contains(s) || 
                    (w.ComputerDisk != null && w.ComputerDisk.DiskName.ToLower().Contains(s)) ||
                    (w.MetricValue >= 95 && "critical".Contains(s)) ||
                    (w.MetricValue < 95 && "warning".Contains(s))
                );
            }

            totalCount += await warningsQuery.CountAsync();
        }

        // Info Count
        if (levelList.Contains("Info")) {
            if (metricList.Contains("CPU") || metricList.Contains("RAM")) {
                var metricsQuery = _db.ComputerMetrics.Where(m => m.ComputerId == computerId && m.CreatedAt >= startTime && m.CreatedAt <= endTime);
                
                if (!string.IsNullOrEmpty(search)) {
                    var s = search.ToLower();
                    bool matchesCpu = "cpu".Contains(s);
                    bool matchesRam = "ram".Contains(s);
                    bool matchesInfo = "info".Contains(s);

                    if (!matchesCpu && !matchesRam && !matchesInfo && !s.Any(char.IsDigit)) {
                        metricsQuery = metricsQuery.Where(m => false);
                    }
                }

                int mCount = await metricsQuery.CountAsync();
                if (metricList.Contains("CPU")) totalCount += mCount;
                if (metricList.Contains("RAM")) totalCount += mCount;
            }
            if (metricList.Contains("Disk")) {
                var diskQuery = _db.DiskMetrics.Where(m => m.ComputerDisk.ComputerId == computerId && m.CreatedAt >= startTime && m.CreatedAt <= endTime);
                
                if (!string.IsNullOrEmpty(search)) {
                    var s = search.ToLower();
                    diskQuery = diskQuery.Where(m => m.ComputerDisk.DiskName.ToLower().Contains(s) || "disk".Contains(s) || "info".Contains(s));
                }

                totalCount += await diskQuery.CountAsync();
            }
        }

        return ServiceResult<int>.Success(totalCount);
    }

    public Task<string> GenerateExportTokenAsync(int computerId, string start, string end, int userId, bool isAdmin)
    {
        var token = Guid.NewGuid().ToString();
        var data = new ExportTokenParams { 
            ComputerId = computerId, 
            Start = start, 
            End = end, 
            UserId = userId, 
            IsAdmin = isAdmin 
        };

        // 1 dakika boyunca cache'te sakla
        _cache.Set($"ExportToken_{token}", data, TimeSpan.FromMinutes(1));
        return Task.FromResult(token);
    }

    public Task<ExportTokenParams?> GetExportParamsAsync(string token)
    {
        var key = $"ExportToken_{token}";
        if (_cache.TryGetValue(key, out ExportTokenParams? data))
        {
            _cache.Remove(key); // Tek kullanımlık
            return Task.FromResult(data);
        }
        return Task.FromResult<ExportTokenParams?>(null);
    }
}
