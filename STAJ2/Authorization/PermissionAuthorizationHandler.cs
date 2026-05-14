using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Staj2.Infrastructure.Data;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace STAJ2.Authorization;

public class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    private readonly IServiceProvider _serviceProvider;

    // Veritabanına anlık erişebilmek için IServiceProvider'ı içeriye alıyoruz
    public PermissionAuthorizationHandler(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        // 1. Kullanıcı giriş yapmamışsa reddet
        if (context.User.Identity?.IsAuthenticated != true)
            return;

        // 2. Token'ın içinden kullanıcı ID'sini al
        var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier) ??
                          context.User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub);

        if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out int userId))
            return;

        // 3. İstenen yetkileri listeye çevir (Virgüllü 'VEYA' senaryosunu desteklemesi için)
        var requiredPermissions = requirement.Permission.Split(',').Select(p => p.Trim()).ToList();

        // 4. Veritabanına taze bir bağlantı açıp kullanıcının o anki GERÇEK yetkisine bak
        using (var scope = _serviceProvider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var hasPermission = await db.Users
                .AsNoTracking()
                .Where(u => u.Id == userId && !u.IsDeleted) // Kullanıcı aktif olmalı
                .SelectMany(u => u.Roles)
                .SelectMany(r => r.RolePermissions)
                .AnyAsync(rp => requiredPermissions.Contains(rp.Permission.Name));

            if (hasPermission)
            {
                context.Succeed(requirement); // Veritabanı onayladı, işleme izin ver!
            }
            // Eğer yetki yoksa (veya silinmişse) hiçbir şey yapmıyoruz. 
            // ASP.NET Core otomatik olarak "403 Forbidden" fırlatacaktır.
        }
    }
}