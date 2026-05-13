using Microsoft.EntityFrameworkCore;
using Staj2.Infrastructure.Data;
using Staj2.Services.Interfaces;
using Staj2.Services.Models;

namespace Staj2.Services.Services;

public class UiService : IUiService
{
    private readonly AppDbContext _db;

    public UiService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<ServiceResult<object>> GetSidebarItemsAsync(int userId)
    {
        // 1. Kullanıcıyı ve rollerine bağlı yetkileri çekiyoruz
        var user = await _db.Users
            .AsNoTracking()
            .Include(x => x.Roles)
                .ThenInclude(r => r.RolePermissions)
                    .ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(x => x.Id == userId);

        if (user == null)
            return ServiceResult<object>.Failure("Kullanıcı bulunamadı.");

        // 2. Kullanıcının sahip olduğu yetkilerin açabildiği SidebarItem ID'lerini bir listeye alıyoruz
        var userAllowedSidebarItemIds = user.Roles
            .SelectMany(r => r.RolePermissions)
            .Where(rp => rp.Permission.SidebarItemId != null)
            .Select(rp => rp.Permission.SidebarItemId!.Value)
            .Distinct()
            .ToList();

        // 3. Veritabanındaki tüm korumalı (bir yetkiye bağlanmış) SidebarItem ID'lerini buluyoruz
        var allProtectedSidebarItemIds = await _db.Permissions
            .Where(p => p.SidebarItemId != null)
            .Select(p => p.SidebarItemId!.Value)
            .Distinct()
            .ToListAsync();

        // 4. Tüm menü ögelerini sırasına göre çekiyoruz
        var allSidebarItems = await _db.SidebarItems
            .AsNoTracking()
            .OrderBy(x => x.OrderIndex)
            .ToListAsync();

        // --- YENİ: Kalıtımsal Yetki Kontrolü ---
        // Eğer bir üst menü korumalıysa, çocuklarını da korumalı listesine ekle
        var inheritedProtectedIds = allSidebarItems
            .Where(x => x.ParentId.HasValue && allProtectedSidebarItemIds.Contains(x.ParentId.Value))
            .Select(x => x.Id);
        allProtectedSidebarItemIds.AddRange(inheritedProtectedIds);

        // Eğer kullanıcı üst menüye yetkiliyse, çocuklarına da yetkili say
        var inheritedAllowedIds = allSidebarItems
            .Where(x => x.ParentId.HasValue && userAllowedSidebarItemIds.Contains(x.ParentId.Value))
            .Select(x => x.Id);
        userAllowedSidebarItemIds.AddRange(inheritedAllowedIds);
        // --------------------------------------

        // 5. Menüleri filtreliyoruz (Yetkisi olanlar veya korumasız olanlar)
        var initialFiltered = allSidebarItems.Where(item =>
            !allProtectedSidebarItemIds.Contains(item.Id) || // Herkese açık menüler
            userAllowedSidebarItemIds.Contains(item.Id)      // Kullanıcının yetkisinin olduğu menüler
        ).ToList();

        // 6. Eğer bir alt menüye yetki varsa, üst menüsünün de listede olduğundan emin oluyoruz
        var resultIds = new HashSet<int>(initialFiltered.Select(x => x.Id));
        foreach (var item in initialFiltered)
        {
            var current = item;
            while (current.ParentId.HasValue)
            {
                if (!resultIds.Contains(current.ParentId.Value))
                {
                    resultIds.Add(current.ParentId.Value);
                    current = allSidebarItems.FirstOrDefault(x => x.Id == current.ParentId.Value);
                    if (current == null) break;
                }
                else break;
            }
        }

        var finalFiltered = allSidebarItems.Where(x => resultIds.Contains(x.Id)).ToList();

        // 7. Hiyerarşik yapıyı kuruyoruz
        var rootItems = finalFiltered.Where(x => !x.ParentId.HasValue)
            .Select(item => new
            {
                item.Id,
                item.Title,
                item.Icon,
                item.TargetView,
                item.OrderIndex,
                IsProtected = allProtectedSidebarItemIds.Contains(item.Id),
                Children = finalFiltered.Where(c => c.ParentId == item.Id)
                    .Select(c => new
                    {
                        c.Id,
                        c.Title,
                        c.Icon,
                        c.TargetView,
                        c.OrderIndex,
                        IsProtected = allProtectedSidebarItemIds.Contains(c.Id)
                    })
                    .OrderBy(c => c.OrderIndex)
                    .ToList()
            })
            .OrderBy(x => x.OrderIndex)
            .ToList();

        return ServiceResult<object>.Success(rootItems);
    }

    public async Task<ServiceResult<List<string>>> GetMyPermissionsAsync(int userId)
    {
        var user = await _db.Users
            .AsNoTracking()
            .Include(x => x.Roles)
                .ThenInclude(r => r.RolePermissions)
                    .ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(x => x.Id == userId);

        if (user == null)
            return ServiceResult<List<string>>.Failure("Kullanıcı bulunamadı.");

        var livePermissions = user.Roles
            .SelectMany(r => r.RolePermissions)
            .Select(rp => rp.Permission.Name)
            .Distinct()
            .ToList();

        return ServiceResult<List<string>>.Success(livePermissions);
    }

    // İleride açarsan bu şekilde olmalı:
    // public async Task<ServiceResult<object>> GetUserActionsAsync()
    // {
    //     var data = await _db.UserTableActions.OrderBy(a => a.OrderIndex).ToListAsync();
    //     return ServiceResult<object>.Success(data);
    // }
}