using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Staj2.Domain.Common;
using Staj2.Domain.Entities;
using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;

namespace Staj2.Infrastructure.Data
{
    public class AppDbContext : DbContext
    {
        private readonly IHttpContextAccessor? _httpContextAccessor;

        public AppDbContext(DbContextOptions<AppDbContext> options, IHttpContextAccessor? httpContextAccessor = null) : base(options)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        // TABLOLAR
        public DbSet<User> Users { get; set; }
        public DbSet<Role> Roles { get; set; }
        public DbSet<UserRegistrationRequest> RegistrationRequests { get; set; }
        public DbSet<Computer> Computers { get; set; }
        public DbSet<ComputerMetric> ComputerMetrics { get; set; }
        public DbSet<PasswordSetupToken> PasswordSetupTokens { get; set; }
        public DbSet<ComputerDisk> ComputerDisks { get; set; }
        public DbSet<DiskMetric> DiskMetrics { get; set; }
        public DbSet<Tag> Tags { get; set; }
        public DbSet<Permission> Permissions { get; set; }
        public DbSet<RolePermission> RolePermissions { get; set; }
        public DbSet<SidebarItem> SidebarItems { get; set; }
        // Kullanıcı - Cihaz/Etiket Erişim Tabloları
        public DbSet<UserComputerAccess> UserComputerAccesses { get; set; }
        public DbSet<UserTagAccess> UserTagAccesses { get; set; }
        // YENİ: Fiziksel Ara Tablolar
        public DbSet<ComputerTag> ComputerTags { get; set; }
        public DbSet<UserRole> UserRoles { get; set; }
        public DbSet<RefreshToken> RefreshTokens { get; set; }
        // TABLOLAR (Mevcutların altına ekle)
        public DbSet<MetricWarningLog> MetricWarningLogs { get; set; }
        public DbSet<MetricType> MetricTypes { get; set; }
        // ====================================================================
        // YENİ: ARAYÜZ (INTERFACE) TABANLI OTOMATİK AUDIT LOGGING
        // ====================================================================
        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            int? currentUserId = null;
            var user = _httpContextAccessor?.HttpContext?.User;

            var userIdClaim = user?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                           ?? user?.FindFirst("id")?.Value
                           ?? user?.FindFirst("UserId")?.Value;

            if (int.TryParse(userIdClaim, out int parsedId))
            {
                currentUserId = parsedId;
            }

            foreach (var entry in ChangeTracker.Entries())
            {
                switch (entry.State)
                {
                    case EntityState.Added:
                        // Eğer tablo ICreatableEntity arayüzüne sahipse
                        if (entry.Entity is ICreatableEntity creatableEntity)
                        {
                            creatableEntity.CreatedAt = DateTime.Now;
                            creatableEntity.CreatedBy = currentUserId;
                        }
                        break;

                    case EntityState.Modified:
                        // Senaryo A: Eğer tablo ISoftDeletableEntity ise VE IsDeleted manuel true yapıldıysa
                        if (entry.Entity is ISoftDeletableEntity softDeleteUpdate &&
                            softDeleteUpdate.IsDeleted &&
                            entry.Property(nameof(ISoftDeletableEntity.IsDeleted)).IsModified)
                        {
                            softDeleteUpdate.DeletedAt = DateTime.Now;
                            softDeleteUpdate.DeletedBy = currentUserId;
                        }
                        // Senaryo B: Eğer tablo IUpdatableEntity ise ve silinmemişse
                        else if (entry.Entity is IUpdatableEntity updatableEntity)
                        {
                            bool isDeleted = (entry.Entity as ISoftDeletableEntity)?.IsDeleted ?? false;
                            if (!isDeleted)
                            {
                                updatableEntity.UpdatedAt = DateTime.Now;
                                updatableEntity.UpdatedBy = currentUserId;
                            }
                        }
                        break;

                    case EntityState.Deleted:
                        // Eğer tablo ISoftDeletableEntity arayüzüne sahipse, gerçek silmeyi iptal edip Soft Delete'e çevir
                        if (entry.Entity is ISoftDeletableEntity softDeletableForDelete)
                        {
                            entry.State = EntityState.Modified;
                            softDeletableForDelete.IsDeleted = true;
                            softDeletableForDelete.DeletedAt = DateTime.Now;
                            softDeletableForDelete.DeletedBy = currentUserId;
                        }
                        break;
                }
            }

            return base.SaveChangesAsync(cancellationToken);
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // ==========================================================
            // --- GLOBAL QUERY FILTERS (SOFT DELETE İÇİN) ---
            // ==========================================================
            modelBuilder.Entity<User>().HasQueryFilter(u => !u.IsDeleted);
            modelBuilder.Entity<Computer>().HasQueryFilter(c => !c.IsDeleted);
            modelBuilder.Entity<Tag>().HasQueryFilter(t => !t.IsDeleted);
            modelBuilder.Entity<ComputerTag>().HasQueryFilter(ct => !ct.IsDeleted);
            modelBuilder.Entity<UserRole>().HasQueryFilter(ur => !ur.IsDeleted);
            modelBuilder.Entity<Role>().HasQueryFilter(r => !r.IsDeleted);
            modelBuilder.Entity<UserComputerAccess>().HasQueryFilter(uca => !uca.IsDeleted);
            modelBuilder.Entity<UserTagAccess>().HasQueryFilter(uta => !uta.IsDeleted);
            modelBuilder.Entity<RolePermission>().HasQueryFilter(rp => !rp.IsDeleted);
            modelBuilder.Entity<ComputerDisk>().HasQueryFilter(cd => !cd.Computer.IsDeleted);
            modelBuilder.Entity<ComputerMetric>().HasQueryFilter(cm => !cm.Computer.IsDeleted);
            modelBuilder.Entity<MetricWarningLog>().HasQueryFilter(mwl => !mwl.Computer.IsDeleted);
            modelBuilder.Entity<RefreshToken>().HasQueryFilter(rt => !rt.User.IsDeleted);
            modelBuilder.Entity<DiskMetric>().HasQueryFilter(dm => !dm.ComputerDisk.Computer.IsDeleted);
            // --- İLİŞKİLER VE ARA TABLOLAR ---

            modelBuilder.Entity<RolePermission>()
                .HasKey(rp => new { rp.RoleId, rp.PermissionId });

            modelBuilder.Entity<UserComputerAccess>()
                .HasKey(uc => new { uc.UserId, uc.ComputerId });

            modelBuilder.Entity<UserTagAccess>()
                .HasKey(ut => new { ut.UserId, ut.TagId });

            // BUNU EKLEYİN:
            modelBuilder.Entity<Permission>()
                .HasOne(p => p.SidebarItem)
                .WithMany() // Bir SidebarItem birden fazla yetki tarafından açılabilir
                .HasForeignKey(p => p.SidebarItemId)
                .OnDelete(DeleteBehavior.SetNull);

            // YENİ: Tag - Computer (Fiziksel Sınıf ComputerTag Üzerinden Many-to-Many)
            modelBuilder.Entity<Computer>()
                .HasMany(c => c.Tags)
                .WithMany(t => t.Computers)
                .UsingEntity<ComputerTag>(
                    j => j.HasOne(pt => pt.Tag).WithMany().HasForeignKey(pt => pt.TagId),
                    j => j.HasOne(pt => pt.Computer).WithMany().HasForeignKey(pt => pt.ComputerId),
                    j =>
                    {
                        j.HasKey(t => t.Id); // DEĞİŞTİ: Artık anahtar sadece Id
                        j.ToTable("ComputerTags");
                    }
                );

            // YENİ: User - Role (Fiziksel Sınıf UserRole Üzerinden Many-to-Many)
            modelBuilder.Entity<User>()
                .HasMany(u => u.Roles)
                .WithMany(r => r.Users)
                .UsingEntity<UserRole>(
                    j => j.HasOne(ur => ur.Role).WithMany(r => r.UserRoles).HasForeignKey(ur => ur.RoleId),
                    j => j.HasOne(ur => ur.User).WithMany().HasForeignKey(ur => ur.UserId),
                    j =>
                    {
                        j.HasKey(t => t.Id); // DEĞİŞTİ: Artık anahtar sadece Id
                        j.ToTable("UserRoles");
                    }
                );
            modelBuilder.Entity<Permission>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.Name).IsUnique();
                entity.Property(e => e.Name).IsRequired().HasMaxLength(100);

                // --- GERİ GELEN KURAL ---
                entity.Property(e => e.Description).HasMaxLength(200);
            });

            // Computer -> ComputerDisk (One-to-Many)
            modelBuilder.Entity<ComputerDisk>()
                .HasOne(d => d.Computer)
                .WithMany(c => c.Disks)
                .HasForeignKey(d => d.ComputerId);

            // ComputerDisk -> DiskMetric (One-to-Many)
            modelBuilder.Entity<DiskMetric>()
                .HasOne(m => m.ComputerDisk)
                .WithMany(d => d.DiskMetrics)
                .HasForeignKey(m => m.ComputerDiskId);

            // --- ALAN KISITLAMALARI (MAX LENGTH 200) ---

            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => e.Username).IsUnique().HasFilter("[IsDeleted] = 0");
                entity.HasIndex(e => e.Email).IsUnique().HasFilter("[IsDeleted] = 0");

                entity.Property(e => e.Email).HasMaxLength(200);
                entity.Property(e => e.PasswordHash).HasMaxLength(200);
            });

            modelBuilder.Entity<Role>(entity =>
            {
                entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
                // EKLENDİ: Rol adı silinmemişler arasında benzersiz olmalı
                entity.HasIndex(e => e.Name).IsUnique().HasFilter("[IsDeleted] = 0");
            });

            modelBuilder.Entity<Tag>(entity =>
            {
                entity.Property(e => e.Name).HasMaxLength(200);
                // EKLENDİ: Etiket adı silinmemişler arasında benzersiz olmalı
                entity.HasIndex(e => e.Name).IsUnique().HasFilter("[IsDeleted] = 0");
            });

            modelBuilder.Entity<Computer>(entity =>
            {
                entity.HasKey(e => e.Id);

                // EKLENDİ: MAC adresi silinmemiş bilgisayarlar arasında benzersiz olmalı
                entity.HasIndex(e => e.MacAddress).IsUnique().HasFilter("[IsDeleted] = 0");

                entity.Property(e => e.MacAddress).IsRequired().HasMaxLength(50);
                entity.Property(e => e.MachineName).HasMaxLength(200);
                entity.Property(e => e.DisplayName).HasMaxLength(200);
                entity.Property(e => e.IpAddress).HasMaxLength(200);
                entity.Property(e => e.CpuModel).HasMaxLength(200);

                entity.HasMany(c => c.Metrics)
                      .WithOne(m => m.Computer)
                      .HasForeignKey(m => m.ComputerId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ComputerDisk>(entity =>
            {
                entity.Property(e => e.DiskName).HasMaxLength(200);
            });

            modelBuilder.Entity<PasswordSetupToken>(entity =>
            {
                entity.Property(e => e.TokenHash).HasMaxLength(200);
            });

            modelBuilder.Entity<UserRegistrationRequest>(entity =>
            {
                entity.HasIndex(e => e.Email);
                entity.HasIndex(e => e.Username);
                entity.Property(e => e.RejectionReason).HasMaxLength(200);
            });

            modelBuilder.Entity<ComputerMetric>(entity =>
            {
                entity.HasKey(e => e.Id);
                // BURADAKİ TEKLİ İNDEKSİ SİLDİK: entity.HasIndex(e => e.CreatedAt); 
            });

            modelBuilder.Entity<ComputerMetric>()
                .HasIndex(m => new { m.ComputerId, m.CreatedAt })
                .IncludeProperties(m => new { m.CpuUsage, m.RamUsage });

                // DİKKAT: DiskMetric için de sadece CreatedAt değil, Disk ID'si ile birlikte çoklu indeks yapmalıyız!
            modelBuilder.Entity<DiskMetric>()
                .HasIndex(m => new { m.ComputerDiskId, m.CreatedAt })
                .IncludeProperties(m => new { m.UsedPercent });

            modelBuilder.Entity<MetricType>().HasData(
                new MetricType { Id = 1, Name = "CPU" },
                new MetricType { Id = 2, Name = "RAM" },
                new MetricType { Id = 3, Name = "Disk" }
            );

            // 2. Uyarı Logu Konfigürasyonu
            modelBuilder.Entity<MetricWarningLog>(entity =>
            {
                entity.HasKey(e => e.Id);

                entity.HasIndex(w => new { w.ComputerId, w.MetricTypeId, w.CreatedAt });

                entity.HasOne(w => w.Computer)
                      .WithMany()
                      .HasForeignKey(w => w.ComputerId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(w => w.MetricType)
                      .WithMany()
                      .HasForeignKey(w => w.MetricTypeId)
                      .OnDelete(DeleteBehavior.Restrict);

                // YENİ EKLENEN İLİŞKİ: Disk
                entity.HasOne(w => w.ComputerDisk)
                      .WithMany()
                      .HasForeignKey(w => w.ComputerDiskId)
                      .OnDelete(DeleteBehavior.NoAction); // Disk silinirse log kalsın, DiskId null olsun
            });
            
        }
    }
}