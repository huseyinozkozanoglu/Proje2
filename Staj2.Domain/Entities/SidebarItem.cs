// Staj2.Domain/Entities/SidebarItem.cs
namespace Staj2.Domain.Entities
{
    public class SidebarItem
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Icon { get; set; }
        public string TargetView { get; set; } = string.Empty;
        public int OrderIndex { get; set; }

        public int? ParentId { get; set; }
        public SidebarItem? Parent { get; set; }
        public ICollection<SidebarItem> Children { get; set; } = new List<SidebarItem>();

        // RequiredPermissionId ve RequiredPermission özellikleri SİLİNDİ.
    }
}