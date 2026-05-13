// STAJ2/Seed/DbSeeder.cs
using Microsoft.EntityFrameworkCore;
using Staj2.Domain.Entities;
using Staj2.Infrastructure.Data;

namespace STAJ2.Seed;

public static class DbSeeder
{
    public static async Task SeedAsync(IApplicationBuilder app)
    {
        using var scope = app.ApplicationServices.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var adminRoleName = config["AppDefaults:AdminRoleName"] ?? "Yönetici";

        await context.Database.MigrateAsync();

        // 1. Rolleri Ekle
        if (!await context.Roles.AnyAsync())
        {
            context.Roles.AddRange(new List<Role> {
                new Role { Name = adminRoleName, CreatedAt = DateTime.Now }, // Değişti
                new Role { Name = "Denetleyici", CreatedAt = DateTime.Now },
                new Role { Name = "Görüntüleyici", CreatedAt = DateTime.Now }
            });
            await context.SaveChangesAsync();
        }

        // --- 2. SİSTEM YETKİLERİNİ (PERMISSIONS) EKLE (Description KALDIRILDI) ---
        var defaultPermissions = new List<Permission>
        {
            new Permission { Name = "Computer.Read", Description = "Cihazları Görüntüleyebilir" },
            new Permission { Name = "Computer.Delete", Description = "Cihaz Silebilir" },
            new Permission { Name = "Computer.Rename", Description = "Cihaz İsmi Değiştirebilir" },
            new Permission { Name = "Computer.SetThreshold", Description = "Cihaz Eşik Değeri Belirleyebilir" },
            new Permission { Name = "Computer.AssignTag", Description = "Cihazlara Etiket Ekleyebilir ve Çıkarabilir" },
            new Permission { Name = "Computer.Filter", Description = "Cihazları ve Metrikleri Filtreleyebilir" },
            new Permission { Name = "Role.Manage", Description = "Sistem Rollerini ve Yetkilerini Yönetebilir" },
            new Permission { Name = "Tag.Manage", Description = "Etiketleri Yönetebilir" },
            new Permission { Name = "User.Manage", Description = "Kullanıcı Kayıtlarını Onaylayabilir/Yönetebilir" },
            new Permission { Name = "User.Read", Description = "Kullanıcıları Listeler (Görüntüleme)" },
            new Permission { Name = "User.ManageRoles", Description = "Kullanıcı Rollerini Değiştirebilir" },
            new Permission { Name = "User.ManageComputers", Description = "Kullanıcının Cihaz Erişimlerini Değiştirebilir" },
            new Permission { Name = "User.ManageTags", Description = "Kullanıcının Etiket Erişimlerini Değiştirebilir" }
        };

        foreach (var perm in defaultPermissions)
        {
            if (!await context.Permissions.AnyAsync(p => p.Name == perm.Name))
            {
                context.Permissions.Add(perm);
            }
        }
        await context.SaveChangesAsync(); // Yetkileri kaydet

        //// 3. Admin Kullanıcısını Ekle
        //if (!await context.Users.AnyAsync(u => u.Username == "admin"))
        //{
        //    var adminRole = await context.Roles.FirstAsync(r => r.Name == adminRoleName); // Değişti
        //    var adminUser = new User
        //    {
        //        Username = "admin",
        //        Email = "admin@staj2.com",
        //        PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin123!"),
        //        IsApproved = true
        //    };

        //    adminUser.Roles.Add(adminRole);
        //    context.Users.Add(adminUser);
        //    await context.SaveChangesAsync();
        //    Console.WriteLine(">>> Admin kullanıcısı (admin / Admin123!) oluşturuldu.");
        //}

        // --- 4. YÖNETİCİ ROLÜNE TÜM YETKİLERİ OTOMATİK ATA ---
        var adminRoleForPerms = await context.Roles
             .Include(r => r.RolePermissions)
             .FirstAsync(r => r.Name == adminRoleName);

        var allPermissions = await context.Permissions.ToListAsync();

        bool permissionsAdded = false;
        foreach (var perm in allPermissions)
        {
            if (!adminRoleForPerms.RolePermissions.Any(rp => rp.PermissionId == perm.Id))
            {
                adminRoleForPerms.RolePermissions.Add(new RolePermission
                {
                    RoleId = adminRoleForPerms.Id,
                    PermissionId = perm.Id
                });
                permissionsAdded = true;
            }
        }

        if (permissionsAdded)
        {
            await context.SaveChangesAsync();
            Console.WriteLine(">>> Yönetici rolüne tüm sistem yetkileri (Permissions) atandı.");
        }

        // --- 5. MENÜLERİ OLUŞTUR (HİYERARŞİK YAPI) ---
        var sidebarItems = new List<SidebarItem>
        {
            new SidebarItem { Title = "Canlı İzleme", Icon = "bi bi-activity text-success", TargetView = "computers", OrderIndex = 1 },
            new SidebarItem { Title = "Tüm Bilgisayarlar", Icon = "bi bi-pc-display", TargetView = "all-computers", OrderIndex = 2 },
            new SidebarItem { Title = "Kayıt İstekleri", Icon = "bi bi-envelope-paper", TargetView = "requests", OrderIndex = 3 },
            new SidebarItem { Title = "Kullanıcılar", Icon = "bi bi-people", TargetView = "users", OrderIndex = 4 },
            new SidebarItem { Title = "Roller ve Yetkiler", Icon = "bi bi-shield-lock", TargetView = "roles", OrderIndex = 5 },
            new SidebarItem { Title = "Etiketler", Icon = "bi bi-tags", TargetView = "tags", OrderIndex = 6 },
            
            // YENİ: Raporlama Üst Menüsü
            new SidebarItem { Title = "Raporlama İşlemleri", Icon = "bi bi-bar-chart-line text-info", TargetView = "reports-parent", OrderIndex = 7 }
        };

        foreach (var item in sidebarItems)
        {
            if (!await context.SidebarItems.AnyAsync(s => s.TargetView == item.TargetView))
            {
                context.SidebarItems.Add(item);
            }
        }
        await context.SaveChangesAsync();

        // Alt Menüleri Ekle
        var parentMenu = await context.SidebarItems.FirstOrDefaultAsync(s => s.TargetView == "reports-parent");
        if (parentMenu != null)
        {
            var childItems = new List<SidebarItem>
            {
                new SidebarItem { Title = "Genel Raporlar", Icon = "bi bi-graph-up", TargetView = "reports", ParentId = parentMenu.Id, OrderIndex = 1 },
                new SidebarItem { Title = "Geçmiş Metrikler", Icon = "bi bi-clock-history", TargetView = "history", ParentId = parentMenu.Id, OrderIndex = 2 },
                new SidebarItem { Title = "Log Yönetimi", Icon = "bi bi-journal-text", TargetView = "log-management", ParentId = parentMenu.Id, OrderIndex = 3 },
                new SidebarItem { Title = "Eşik Analiz Raporu", Icon = "bi bi-exclamation-octagon", TargetView = "threshold-analysis", ParentId = parentMenu.Id, OrderIndex = 4 },
                new SidebarItem { Title = "Uyarı Raporları", Icon = "bi bi-megaphone", TargetView = "warnings", ParentId = parentMenu.Id, OrderIndex = 5 },
                new SidebarItem { Title = "Heatmap Analizi", Icon = "bi bi-grid-3x3", TargetView = "heatmap", ParentId = parentMenu.Id, OrderIndex = 6 }
            };

            foreach (var child in childItems)
            {
                if (!await context.SidebarItems.AnyAsync(s => s.TargetView == child.TargetView))
                {
                    context.SidebarItems.Add(child);
                }
                else
                {
                    // Varsa ParentId'sini güncelle (Eski verileri yeni yapıya taşımak için)
                    var existing = await context.SidebarItems.FirstOrDefaultAsync(s => s.TargetView == child.TargetView);
                    if (existing != null && existing.ParentId != parentMenu.Id)
                    {
                        existing.ParentId = parentMenu.Id;
                        existing.Title = child.Title;
                        existing.Icon = child.Icon;
                    }
                }
            }
            await context.SaveChangesAsync();
        }

        // --- 6. TERSİNE İLİŞKİ: HANGİ YETKİ HANGİ MENÜYÜ AÇAR? ---
        var existingSidebarItems = await context.SidebarItems.ToListAsync();
        bool isSidebarUpdated = false;

        // Yetki Adı -> Açacağı Menünün TargetView'i
        var permissionToSidebarMappings = new Dictionary<string, string>
        {
            { "User.Manage", "requests" },
            { "User.Read", "users" },
            { "User.ManageRoles", "users" },
            { "User.ManageComputers", "users" },
            { "User.ManageTags", "users" },
            { "Role.Manage", "roles" },
            { "Tag.Manage", "tags" },
            
            // YENİ: Raporlama yetkisi (Sadece Parent'ı bağlamamız yeterli, 
            // UiService çocuklar için otomatik yetki kontrolü yapacak)
            { "Computer.Read", "reports-parent" }
        };

        foreach (var mapping in permissionToSidebarMappings)
        {
            var permission = allPermissions.FirstOrDefault(p => p.Name == mapping.Key);
            var targetMenu = existingSidebarItems.FirstOrDefault(s => s.TargetView == mapping.Value);

            if (permission != null && targetMenu != null)
            {
                // Bir yetki birden fazla menüye bağlanamaz (mevcut modelde SidebarItemId tekil)
                // Ama biz burada her menü için yetki kontrolü yapıyoruz.
                // Not: Eğer bir yetki zaten bir menüye bağlıysa, başka bir yetki de aynı menüye bağlanabilir.
                // Ama burada biz yetki üzerinden gidiyoruz.
                // Eğer Computer.Read yetkisi varsa, tüm raporları açmalı.
                
                // SidebarItems tablosunda korumalı olanları işaretlemek için Permission tablosundaki SidebarItemId'leri kullanıyoruz.
                // Eğer bir menü ID'si Permission tablosunda SidebarItemId olarak varsa, o menü korumalıdır.
                
                if (permission.SidebarItemId != targetMenu.Id)
                {
                    // Dikkat: Computer.Read gibi genel bir yetkiyi birden fazla menüye bağlayamayız (Permission tablosunda SidebarItemId tekil).
                    // Bu yüzden yeni bir yaklaşım gerekebilir veya Computer.Read sadece Parent'ı açar, 
                    // Çocuklar için Permission tablosuna yeni kayıtlar mı eklemeliyiz? 
                    // Hayır, kullanıcı "Computer.Read yetkisi varsa görebilecek" dedi.
                }
            }
        }
        
        // KRİTİK: Computer.Read yetkisini Raporlama Üst Menüsüne bağla
        var compReadPerm = await context.Permissions.FirstOrDefaultAsync(p => p.Name == "Computer.Read");
        var reportMenu = await context.SidebarItems.FirstOrDefaultAsync(s => s.TargetView == "reports-parent");
        if (compReadPerm != null && reportMenu != null)
        {
            compReadPerm.SidebarItemId = reportMenu.Id;
            isSidebarUpdated = true;
        }

        // Alt menüleri de korumalı yapmak için onları da bir yetkiye bağlamalıyız.
        // Eğer Computer.Read yetkisi tüm raporları açacaksa, alt menüleri de bu yetkiye bağlayalım.
        // Ancak modelimiz 1 Permission -> 1 SidebarItem şeklinde.
        // Bu kısıtlamayı aşmak için alt menüleri de korumalı listesine manuel ekleyebiliriz veya
        // Permission tablosuna her biri için kayıt açabiliriz. 
        // Ama kullanıcı "Computer.Read varsa görsün" dediği için kod tarafında bunu handle etmek daha mantıklı.

        if (isSidebarUpdated)
        {
            await context.SaveChangesAsync();
            Console.WriteLine(">>> Yetkiler (Permissions) başarıyla ilgili Sidebar menülerine bağlandı.");
        }

        // --- 7. DİNAMİK KULLANICI TABLOSU BUTONLARI ---
        // (Yorum satırında bırakılmış)


        //// ======================================================================
        //// --- 9. YENİ: ID=8 BİLGİSAYARI İÇİN MART AYI RAPORLAMA TEST VERİSİ ---
        //// ======================================================================

        //int targetId = 8;
        //var testComp = await context.Computers.FindAsync(targetId);

        //if (testComp != null)
        //{
        //    // Tekrar tekrar çalıştırıldığında verilerin üst üste binmemesi için eski test verilerini temizliyoruz
        //    var oldHistories = context.ComputerThresholdHistories.Where(h => h.ComputerId == targetId);
        //    context.ComputerThresholdHistories.RemoveRange(oldHistories);

        //    var oldMetrics = context.ComputerMetrics.Where(m => m.ComputerId == targetId && m.CreatedAt >= new DateTime(2026, 3, 1) && m.CreatedAt <= new DateTime(2026, 3, 31, 23, 59, 59));
        //    context.ComputerMetrics.RemoveRange(oldMetrics);

        //    await context.SaveChangesAsync();

        //    // 1. Eşik Değeri Geçiş Senaryosunu Giriyoruz
        //    var marchHistories = new List<ComputerThresholdHistory>
        //    {
        //        new ComputerThresholdHistory { ComputerId = targetId, CpuThreshold = 70, RamThreshold = 80, ActiveFrom = new DateTime(2026, 3, 1, 0, 0, 0), CreatedAt = DateTime.Now },
        //        new ComputerThresholdHistory { ComputerId = targetId, CpuThreshold = 80, RamThreshold = 80, ActiveFrom = new DateTime(2026, 3, 15, 0, 0, 0), CreatedAt = DateTime.Now },
        //        new ComputerThresholdHistory { ComputerId = targetId, CpuThreshold = 45, RamThreshold = 80, ActiveFrom = new DateTime(2026, 3, 25, 0, 0, 0), CreatedAt = DateTime.Now },
        //        // Güncel (Şu Anki) Değerler - 14 Nisan
        //        new ComputerThresholdHistory { ComputerId = targetId, CpuThreshold = 50, RamThreshold = 75, ActiveFrom = new DateTime(2026, 4, 14, 12, 0, 0), CreatedAt = DateTime.Now }
        //    };
        //    context.ComputerThresholdHistories.AddRange(marchHistories);

        //    // Cihazın kendi güncel değerlerini de 14 Nisan değerleriyle güncelliyoruz
        //    testComp.CpuThreshold = 50;
        //    testComp.RamThreshold = 75;

        //    // 2. Metrik Verilerini Giriyoruz (Mart ayı boyunca saat başı veri üretecek)
        //    DateTime current = new DateTime(2026, 3, 1, 0, 0, 0);
        //    DateTime end = new DateTime(2026, 3, 31, 23, 59, 59);
        //    var testMetrics = new List<ComputerMetric>();

        //    while (current <= end)
        //    {
        //        double cpuValue = 0;

        //        // Senin Senaryon:
        //        // 1-15 Mart (Eşik 70) -> CPU'yu 65 yap (Eşik altı, başarılı)
        //        if (current < new DateTime(2026, 3, 15)) cpuValue = 65;

        //        // 15-25 Mart (Eşik 80) -> CPU'yu 85 yap (Eşik ÜSTÜ, sorunlu)
        //        else if (current < new DateTime(2026, 3, 25)) cpuValue = 85;

        //        // 25-31 Mart (Eşik 45) -> CPU'yu 40 yap (Eşik altı, başarılı)
        //        else cpuValue = 40;

        //        testMetrics.Add(new ComputerMetric
        //        {
        //            ComputerId = targetId,
        //            CpuUsage = cpuValue,
        //            RamUsage = 60, // RAM'i sabit bıraktık, test için CPU odaklı gidiyoruz
        //            CreatedAt = current
        //        });

        //        current = current.AddMinutes(1); // YENİ HALİ (Dakikada bir veri üretsin)
        //    }

        //    context.ComputerMetrics.AddRange(testMetrics);
        //    await context.SaveChangesAsync();

        //    Console.WriteLine(">>> ID=8 için Tarihsel Eşik Değeri Analizi test verileri oluşturuldu.");
        //}
    }
}