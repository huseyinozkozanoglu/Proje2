using System.Collections.Generic;

namespace Staj2.Services.Models.Agent
{
    public class TopWarningItemDto
    {
        public int ComputerId { get; set; }
        public string ComputerName { get; set; } = null!;
        public int WarningCount { get; set; }
        public string? DiskName { get; set; } // Sadece Disk uyarıları için dolu olacak
    }

    public class TopWarningsReportDto
    {
        public List<TopWarningItemDto> TopCpuWarnings { get; set; } = new();
        public List<TopWarningItemDto> TopRamWarnings { get; set; } = new();
        public List<TopWarningItemDto> TopDiskWarnings { get; set; } = new();
    }
}