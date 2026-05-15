using System.Collections.Generic;

namespace Staj2.Services.Models;

public class PerformanceReportDto
{
    public double GlobalAverageCpu { get; set; }
    public double GlobalAverageRam { get; set; }
    public List<DevicePerformanceDto> Devices { get; set; } = new();
    public List<GlobalDiskAverageDto> GlobalDiskAverages { get; set; } = new();
}
public class GlobalDiskAverageDto
{
    public string DiskName { get; set; } = null!;
    public double AverageUsedPercent { get; set; }
}
public class DevicePerformanceDto
{
    public int ComputerId { get; set; }
    public string ComputerName { get; set; } = null!;
    public double AverageCpu { get; set; }
    public double AverageRam { get; set; }
    public string CpuStatus { get; set; } = null!;
    public string RamStatus { get; set; } = null!;

    // YENİ EKLENEN: Her cihazın kendi disk listesi olacak
    public List<DiskPerformanceDto> Disks { get; set; } = new();
}

// YENİ EKLENEN SINIF
public class DiskPerformanceDto
{
    public string DiskName { get; set; } = null!;
    public double AverageUsedPercent { get; set; }
    public string DiskStatus { get; set; } = null!; // %90 üstüyse "Kritik", altıysa "İyi" diyebiliriz
}