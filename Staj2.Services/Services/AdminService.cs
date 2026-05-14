using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Staj2.Domain.Entities;
using Staj2.Infrastructure.Data;
using Staj2.Services.Interfaces;
using Staj2.Services.Models;

namespace Staj2.Services.Services;

// YENİ: BaseService'den miras alıyoruz.
public class AdminService : BaseService, IAdminService
{
    private readonly IConfiguration _config;
    private readonly IMailSender _mail;
    private readonly IMemoryCache _cache;

    // YENİ: AppDbContext'i base (BaseService) sınıfa gönderiyoruz. _db orada tanımlı olduğu için burada tekrar atamamıza gerek yok.
    public AdminService(AppDbContext db, IConfiguration config, IMailSender mail, IMemoryCache cache) : base(db)
    {
        _config = config;
        _mail = mail;
        _cache = cache;
    }

    // --- ROLLER VE YETKİLER (Okuma İşlemleri: Transaction gerekmez) ---

    public async Task<ServiceResult<object>> GetRolesAsync()
    {
        var data = await _db.Roles.Select(r => new { r.Id, r.Name }).ToListAsync();
        return ServiceResult<object>.Success(data);
    }

    public async Task<ServiceResult<object>> GetAllPermissionsAsync()
    {
        var data = await _db.Permissions
            .OrderBy(p => p.OrderIndex)
            .Select(p => new { p.Id, p.Name, p.Description, p.OrderIndex })
            .ToListAsync();
        return ServiceResult<object>.Success(data);
    }

    public async Task<ServiceResult<List<int>>> GetRolePermissionsAsync(int roleId)
    {
        var data = await _db.RolePermissions
            .Where(rp => rp.RoleId == roleId)
            .Select(rp => rp.PermissionId)
            .ToListAsync();
        return ServiceResult<List<int>>.Success(data);
    }

    // --- ROL YÖNETİMİ ---

    public Task<ServiceResult> CreateRoleAsync(CreateRoleRequest request, int? currentUserId)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return ServiceResult.Failure("Rol adı boş bırakılamaz.");

            if (request.Name.Length > 20)
                return ServiceResult.Failure("Rol adı 20 karakterden uzun olamaz.");

            if (await _db.Roles.AnyAsync(r => r.Name.ToLower() == request.Name.ToLower() && !r.IsDeleted))
                return ServiceResult.Failure("Bu rol adı zaten kullanılıyor.");

            var newRole = new Role
            {
                Name = request.Name,
                CreatedAt = DateTime.Now,
                CreatedBy = currentUserId,
                IsDeleted = false
            };

            _db.Roles.Add(newRole);
            await _db.SaveChangesAsync(); // Id oluşması için

            if (request.PermissionIds != null && request.PermissionIds.Any())
            {
                foreach (var permId in request.PermissionIds)
                {
                    newRole.RolePermissions.Add(new RolePermission
                    {
                        RoleId = newRole.Id,
                        PermissionId = permId
                    });
                }
                await _db.SaveChangesAsync();
            }

            return ServiceResult.Success("Rol başarıyla oluşturuldu.");
        }, "Rol", DbOperation.Create);
    }

    public Task<ServiceResult> UpdateRolePermissionsAsync(int roleId, UpdateRolePermissionsRequest request, int? currentUserId)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var role = await _db.Roles.Include(r => r.RolePermissions).FirstOrDefaultAsync(r => r.Id == roleId);
            if (role == null)
                return ServiceResult.Failure("Rol bulunamadı.");

            role.UpdatedAt = DateTime.Now;
            role.UpdatedBy = currentUserId;
            role.RolePermissions.Clear();

            var validPermissions = await _db.Permissions.Where(p => request.PermissionIds.Contains(p.Id)).ToListAsync();

            foreach (var perm in validPermissions)
            {
                role.RolePermissions.Add(new RolePermission
                {
                    RoleId = role.Id,
                    PermissionId = perm.Id
                });
            }

            await _db.SaveChangesAsync();
            return ServiceResult.Success("Rol yetkileri başarıyla güncellendi.");
        }, "Rol Yetkileri", DbOperation.Update);
    }

    public Task<ServiceResult> DeleteRoleAsync(int id, int? currentUserId)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var role = await _db.Roles.Include(r => r.Users).FirstOrDefaultAsync(r => r.Id == id);
            if (role == null)
                return ServiceResult.Failure("Rol bulunamadı.");

            var adminRoleName = _config["AppDefaults:AdminRoleName"] ?? "Yönetici";
            if (role.Name == adminRoleName)
                return ServiceResult.Failure($"Sistem varsayılan '{adminRoleName}' rolü silinemez.");

            if (role.Users.Any(u => !u.IsDeleted))
                return ServiceResult.Failure("Bu role sahip aktif kullanıcılar var! Silmek için önce o kullanıcıların rolünü değiştirin.");

            role.IsDeleted = true;
            role.DeletedAt = DateTime.Now;
            role.DeletedBy = currentUserId;

            var rolePermissions = await _db.RolePermissions.Where(rp => rp.RoleId == id).ToListAsync();
            rolePermissions.ForEach(rp => {
                rp.IsDeleted = true;
                rp.DeletedAt = DateTime.Now;
                rp.DeletedBy = currentUserId;
            });

            var userRoles = await _db.UserRoles.Where(ur => ur.RoleId == id).ToListAsync();
            userRoles.ForEach(ur => {
                ur.IsDeleted = true;
                ur.DeletedAt = DateTime.Now;
                ur.DeletedBy = currentUserId;
            });

            await _db.SaveChangesAsync();
            return ServiceResult.Success("Rol başarıyla silindi.");
        }, "Rol", DbOperation.Delete);
    }

    // --- KULLANICI YÖNETİMİ ---

    public async Task<ServiceResult<object>> GetAllUsersAsync()
    {
        var data = await _db.Users.Include(u => u.Roles)
                          .OrderBy(u => u.Username)
                          .Select(u => new { u.Id, u.Username, u.Email, Roles = u.Roles.Select(r => r.Name).ToList() })
                          .ToListAsync();
        return ServiceResult<object>.Success(data);
    }

    public Task<ServiceResult> DeleteUserAsync(int id, int? currentUserId)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null)
                return ServiceResult.Failure("Kullanıcı bulunamadı.");

            user.IsDeleted = true;
            user.DeletedAt = DateTime.Now;
            user.DeletedBy = currentUserId;

            var userRoles = await _db.UserRoles.Where(ur => ur.UserId == id).ToListAsync();
            userRoles.ForEach(ur => {
                ur.IsDeleted = true;
                ur.DeletedAt = DateTime.Now;
                ur.DeletedBy = currentUserId;
            });

            var userComputerAccesses = await _db.UserComputerAccesses.Where(uca => uca.UserId == id).ToListAsync();
            userComputerAccesses.ForEach(uca => {
                uca.IsDeleted = true;
                uca.DeletedAt = DateTime.Now;
                uca.DeletedBy = currentUserId;
            });

            var userTagAccesses = await _db.UserTagAccesses.Where(uta => uta.UserId == id).ToListAsync();
            userTagAccesses.ForEach(uta => {
                uta.IsDeleted = true;
                uta.DeletedAt = DateTime.Now;
                uta.DeletedBy = currentUserId;
            });

            await _db.SaveChangesAsync();
            return ServiceResult.Success("Kullanıcı sistemden başarıyla silindi.");
        }, "Kullanıcı", DbOperation.Delete);
    }

    public Task<ServiceResult> ChangeUserRolesAsync(int userId, ChangeRolesRequest request)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(x => x.Id == userId);
            if (user == null)
                return ServiceResult.Failure("Kullanıcı bulunamadı.");

            var newRoles = await _db.Roles.Where(r => request.NewRoleIds.Contains(r.Id)).ToListAsync();
            if (newRoles.Count == 0)
                return ServiceResult.Failure("En az bir geçerli rol seçilmelidir.");

            var adminRoleName = _config["AppDefaults:AdminRoleName"] ?? "Yönetici";
            bool isCurrentlyAdmin = user.Roles.Any(r => r.Name == adminRoleName);
            bool willBeAdmin = newRoles.Any(r => r.Name == adminRoleName);

            if (isCurrentlyAdmin && !willBeAdmin)
            {
                int adminCount = await _db.Users.CountAsync(u => !u.IsDeleted && u.Roles.Any(r => r.Name == adminRoleName));
                if (adminCount <= 1)
                {
                    return ServiceResult.Failure("Sistemde kalan son yönetici yetkisini kaldıramazsınız!");
                }
            }

            user.Roles.Clear();
            foreach (var role in newRoles)
                user.Roles.Add(role);

            await _db.SaveChangesAsync();
            return ServiceResult.Success("Kullanıcının rolleri başarıyla güncellendi.");
        }, "Kullanıcı Rolleri", DbOperation.Update);
    }

    // --- KAYIT İSTEKLERİ YÖNETİMİ ---

    public async Task<ServiceResult<object>> GetPendingRequestsAsync()
    {
        var data = await _db.RegistrationRequests.Where(x => x.Status == RegistrationStatus.Pending).ToListAsync();
        return ServiceResult<object>.Success(data);
    }

    public Task<ServiceResult> RejectRequestAsync(RejectRegistrationRequest request, int? adminId)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            if (!string.IsNullOrEmpty(request.RejectionReason) && request.RejectionReason.Length > 200)
                return ServiceResult.Failure("Ret gerekçesi 200 karakterden uzun olamaz.");

            var registration = await _db.RegistrationRequests.FindAsync(request.RequestId);
            if (registration == null)
                return ServiceResult.Failure("Talep bulunamadı.");

            if (registration.Status != RegistrationStatus.Pending)
                return ServiceResult.Failure("Bu talep zaten işleme alınmış.");

            if (adminId.HasValue)
                registration.RejectedBy = adminId.Value;

            registration.Status = RegistrationStatus.Rejected;
            registration.RejectedAt = DateTime.Now;
            registration.RejectionReason = request.RejectionReason;

            await _db.SaveChangesAsync();

            // Veritabanı başarılı olduysa Mail denemesi yapalım (Hata verirse DB işlemi geriye alınmaz)
            try
            {
                await _mail.SendAsync(
                    registration.Email!,
                    "Kayıt Talebiniz Reddedildi",
                    $"Merhaba {registration.Username},\n\nTalebiniz maalesef onaylanmadı.\nSebep: {request.RejectionReason ?? "Belirtilmedi"}"
                );
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"\nMAIL GÖNDERİM HATASI: {ex.Message}\n");
                Console.ResetColor();
            }

            return ServiceResult.Success("Kayıt talebi reddedildi ve kullanıcıya e-posta gönderildi.");
        }, "Kayıt Talebi", DbOperation.Update);
    }

    public Task<ServiceResult> ApproveRequestAsync(int id, ChangeRoleRequest? req, int? adminId)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var request = await _db.RegistrationRequests.FindAsync(id);
            if (request == null)
                return ServiceResult.Failure("Talep bulunamadı.");

            if (request.Status != RegistrationStatus.Pending)
                return ServiceResult.Failure("Bu talep zaten işlenmiş.");

            var existingUser = await _db.Users.FirstOrDefaultAsync(u => u.Username == request.Username || u.Email == request.Email);
            if (existingUser != null)
                return ServiceResult.Failure($"Bu kullanıcı zaten sistemde kayıtlı! (Kullanıcı: {existingUser.Username})");

            int finalAdminId = adminId ?? 0;
            if (finalAdminId == 0)
            {
                var firstUser = await _db.Users.FirstOrDefaultAsync();
                if (firstUser != null) finalAdminId = firstUser.Id;
            }
            request.ApprovedByUserId = finalAdminId;

            if (req != null && req.NewRoleId > 0)
                request.RequestedRoleId = req.NewRoleId;

            var token = Guid.NewGuid().ToString("N");
            string tokenHash;
            using (var sha256 = System.Security.Cryptography.SHA256.Create())
            {
                var bytes = sha256.ComputeHash(System.Text.Encoding.UTF8.GetBytes(token));
                tokenHash = Convert.ToHexString(bytes);
            }

            var setupToken = new PasswordSetupToken
            {
                RegistrationRequestId = request.Id,
                TokenHash = tokenHash,
                ExpiresAt = DateTime.Now.AddHours(24),
                IsUsed = false
            };
            _db.PasswordSetupTokens.Add(setupToken);

            request.Status = RegistrationStatus.Approved;
            request.ApprovedAt = DateTime.Now;

            await _db.SaveChangesAsync();

            var baseUrl = _config["App:FrontendBaseUrl"] ?? "http://localhost:5267";
            var frontendLink = $"{baseUrl}/set-password.html?token={token}";

            try
            {
                await _mail.SendAsync(
                    request.Email!,
                    "Hoşgeldiniz",
                    $"Hesabınız onaylandı. Şifrenizi belirlemek için tıklayın: {frontendLink}"
                );
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"\nMAIL GÖNDERİM HATASI: {ex.Message}\n");
                Console.ResetColor();
            }

            return ServiceResult.Success("Kayıt talebi onaylandı ve kurulum e-postası gönderildi.");
        }, "Kayıt Talebi", DbOperation.Update);
    }

    // --- KULLANICI CİHAZ VE ETİKET ATAMA YÖNETİMİ ---

    public async Task<ServiceResult<object>> GetUserAccessAsync(int userId)
    {
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
            return ServiceResult<object>.Failure("Kullanıcı bulunamadı.");

        var computerIds = await _db.UserComputerAccesses.Where(x => x.UserId == userId).Select(x => x.ComputerId).ToListAsync();
        var tagIds = await _db.UserTagAccesses.Where(x => x.UserId == userId).Select(x => x.TagId).ToListAsync();

        var adminRoleName = _config["AppDefaults:AdminRoleName"] ?? "Yönetici";

        if (computerIds.Count == 0 && tagIds.Count == 0 && user.Roles.Any(r => r.Name == adminRoleName))
        {
            computerIds = await _db.Computers.Select(x => x.Id).ToListAsync();
            tagIds = await _db.Tags.Select(x => x.Id).ToListAsync();
        }

        return ServiceResult<object>.Success(new { computerIds, tagIds });
    }

    public Task<ServiceResult> AssignComputersAsync(int userId, AssignComputersRequest req)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var user = await _db.Users.FindAsync(userId);
            if (user == null)
                return ServiceResult.Failure("Kullanıcı bulunamadı.");

            var existing = await _db.UserComputerAccesses.Where(x => x.UserId == userId).ToListAsync();
            _db.UserComputerAccesses.RemoveRange(existing);

            foreach (var cid in req.ComputerIds)
                _db.UserComputerAccesses.Add(new UserComputerAccess { UserId = userId, ComputerId = cid });

            await _db.SaveChangesAsync();
            _cache.Remove($"PerformanceReport_User_{userId}");

            return ServiceResult.Success("Kullanıcının cihaz erişimleri başarıyla güncellendi.");
        }, "Kullanıcı Cihaz Ataması", DbOperation.Update);
    }

    public Task<ServiceResult> AssignTagsAsync(int userId, AssignTagsRequest req)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var user = await _db.Users.FindAsync(userId);
            if (user == null)
                return ServiceResult.Failure("Kullanıcı bulunamadı.");

            var existing = await _db.UserTagAccesses.Where(x => x.UserId == userId).ToListAsync();
            _db.UserTagAccesses.RemoveRange(existing);

            foreach (var tid in req.TagIds)
                _db.UserTagAccesses.Add(new UserTagAccess { UserId = userId, TagId = tid });

            await _db.SaveChangesAsync();
            return ServiceResult.Success("Kullanıcının etiket erişimleri başarıyla güncellendi.");
        }, "Kullanıcı Etiket Ataması", DbOperation.Update);
    }

    public async Task<ServiceResult<object>> GetAllComputersForAssignmentAsync()
    {
        var data = await _db.Computers
            .Select(c => new
            {
                id = c.Id,
                displayName = c.DisplayName,
                machineName = c.MachineName,
                ipAddress = c.IpAddress,
                isDeleted = c.IsDeleted,
                lastSeen = c.LastSeen
            })
            .ToListAsync();

        return ServiceResult<object>.Success(data);
    }

    // --- ETİKET YÖNETİMİ ---

    public async Task<ServiceResult<object>> GetTagsAsync()
    {
        var data = await _db.Tags.ToListAsync();
        return ServiceResult<object>.Success(data);
    }

    public Task<ServiceResult<object>> CreateTagAsync(TagCreateRequest request, int? userId)
    {
        // NOT: Dönüş tipi ServiceResult<object> olduğu için sarmalayıcının Generic T versiyonunu çağırıyoruz
        return ExecuteWithDbHandlingAsync<object>(async () =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return ServiceResult<object>.Failure("Etiket ismi boş bırakılamaz.");

            if (request.Name.Length > 200)
                return ServiceResult<object>.Failure("Etiket ismi 200 karakterden uzun olamaz.");

            if (await _db.Tags.AnyAsync(t => t.Name == request.Name))
                return ServiceResult<object>.Failure("Bu etiket zaten sistemde mevcut.");

            var tag = new Tag { Name = request.Name.Trim() };
            _db.Tags.Add(tag);

            // Etiket ID'sinin oluşması için kaydetmeliyiz. İşlem transaction içinde olduğu için güvenli.
            await _db.SaveChangesAsync();

            if (userId.HasValue)
            {
                _db.UserTagAccesses.Add(new UserTagAccess
                {
                    UserId = userId.Value,
                    TagId = tag.Id
                });
                await _db.SaveChangesAsync();
            }

            return ServiceResult<object>.Success(new { id = tag.Id, name = tag.Name }, "Yeni etiket başarıyla oluşturuldu.");
        }, "Etiket", DbOperation.Create);
    }

    public Task<ServiceResult> DeleteTagAsync(int id, int? currentUserId)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var tag = await _db.Tags.FindAsync(id);
            if (tag == null)
                return ServiceResult.Failure("Etiket bulunamadı.");

            tag.IsDeleted = true;
            tag.DeletedAt = DateTime.Now;
            tag.DeletedBy = currentUserId;

            var computerTags = await _db.ComputerTags.Where(ct => ct.TagId == id).ToListAsync();
            computerTags.ForEach(ct => {
                ct.IsDeleted = true;
                ct.DeletedAt = DateTime.Now;
                ct.DeletedBy = currentUserId;
            });

            var userTagAccesses = await _db.UserTagAccesses.Where(uta => uta.TagId == id).ToListAsync();
            userTagAccesses.ForEach(uta => {
                uta.IsDeleted = true;
                uta.DeletedAt = DateTime.Now;
                uta.DeletedBy = currentUserId;
            });

            await _db.SaveChangesAsync();
            return ServiceResult.Success("Etiket sistemden başarıyla silindi.");
        }, "Etiket", DbOperation.Delete);
    }

    public Task<ServiceResult> AssignComputersToTagAsync(int tagId, AssignComputersToTagRequest req)
    {
        return ExecuteWithDbHandlingAsync(async () =>
        {
            var tag = await _db.Tags.Include(t => t.Computers).FirstOrDefaultAsync(t => t.Id == tagId);
            if (tag == null)
                return ServiceResult.Failure("Etiket bulunamadı.");

            tag.Computers.Clear();

            var computers = await _db.Computers.Where(c => req.ComputerIds.Contains(c.Id)).ToListAsync();
            foreach (var c in computers) tag.Computers.Add(c);

            await _db.SaveChangesAsync();
            return ServiceResult.Success("Seçilen cihazlar etikete başarıyla atandı.");
        }, "Cihazları Etikete Atama", DbOperation.Update);
    }

    public async Task<ServiceResult<List<int>>> GetTagAssignedComputerIdsAsync(int tagId)
    {
        var data = await _db.Tags
            .Where(t => t.Id == tagId)
            .SelectMany(t => t.Computers.Select(c => c.Id))
            .ToListAsync();

        return ServiceResult<List<int>>.Success(data);
    }
}