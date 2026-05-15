using Staj2.Domain.Common;

namespace Staj2.Domain.Entities
{
    public class Role : ICreatableEntity, IUpdatableEntity, ISoftDeletableEntity
    {
        public int Id { get; set; }

        // Rol adı için maks 20 karakter sınırını AppDbContext'te belirtmiştik.
        public string Name { get; set; } = null!;
        public string? Description { get; set; }

        // ICreatableEntity (int? olarak düzeltildi)
        public DateTime CreatedAt { get; set; }
        public int? CreatedBy { get; set; }

        // IUpdatableEntity (int? olarak düzeltildi)
        public DateTime? UpdatedAt { get; set; }
        public int? UpdatedBy { get; set; }

        // ISoftDeletableEntity (int? olarak düzeltildi)
        public bool IsDeleted { get; set; }
        public DateTime? DeletedAt { get; set; }
        public int? DeletedBy { get; set; }

        // İlişkiler
        public ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
        public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();

        // CS1061 Hatasını çözen eksik koleksiyon
        public ICollection<User> Users { get; set; } = new List<User>();
    }
}