using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Staj2.Services.Models
{
    // Kullanıcı İşlemleri için
    public class ChangeRolesRequest { public List<int> NewRoleIds { get; set; } = new(); }
    public class ChangeRoleRequest { public int NewRoleId { get; set; } }

    // Etiket İşlemleri için
    public class TagCreateRequest { public string Name { get; set; } = null!; }

    
    public class UpdateThresholdsRequest
    {
        public double? CpuThreshold { get; set; }
        public double? RamThreshold { get; set; }
        public List<DiskThresholdItem>? DiskThresholds { get; set; }
    }

    public class DiskThresholdItem
    {
        public string DiskName { get; set; } = null!;
        public double? ThresholdPercent { get; set; }
    }
    // YENİ EKLİYORUZ: AdminController'da reddetme işlemi için
    public class RejectRegistrationRequest
    {
        public int RequestId { get; set; }
        public string RejectionReason { get; set; } = null!;
    }
    public class UpdateComputerTagsRequest { public List<string> Tags { get; set; } = new(); }
    public class AssignComputersToTagRequest
    {
        public List<int> ComputerIds { get; set; } = new();
    }
    public class CreateRegistrationRequest
    {
        [Required(ErrorMessage = "Kullanıcı adı zorunludur.")]
        [StringLength(50, MinimumLength = 3, ErrorMessage = "Kullanıcı adı 3 ile 50 karakter arasında olmalıdır.")]
        [RegularExpression(@"^[a-zA-Z0-9_]+$", ErrorMessage = "Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir.")]
        public string Username { get; set; } = null!;

        [Required(ErrorMessage = "Email adresi zorunludur.")]
        [EmailAddress(ErrorMessage = "Geçerli bir email adresi giriniz.")]
        [StringLength(100, ErrorMessage = "Email adresi çok uzun.")]
        public string Email { get; set; } = null!;
    }
}