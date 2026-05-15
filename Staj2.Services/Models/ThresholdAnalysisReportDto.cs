using System;
using System.Collections.Generic;

namespace Staj2.Services.Models
{
    public class ThresholdAnalysisReportDto
    {
        public int ComputerId { get; set; }
        public string ComputerName { get; set; } = null!;
        public int TotalActiveCount { get; set; } // Seconds -> Count oldu

        public MetricThresholdResult CpuResult { get; set; } = new();
        public MetricThresholdResult RamResult { get; set; } = new();
        public List<DiskThresholdResult> DiskResults { get; set; } = new();
    }

    public class MetricThresholdResult
    {
        public int BelowThresholdCount { get; set; } // Eşiğin Altı (Sorunsuz)
        public int WarningCount { get; set; }        // Eşiğin Üstü (Uyarı Sayısı)
        public int TotalCount { get; set; }          // Toplam Gelen Veri

        // Yüzde hesabı tam sayılarla (int) yapıldığı için double'a cast ediyoruz
        public double BelowThresholdPercentage => TotalCount > 0 ? ((double)BelowThresholdCount / TotalCount) * 100 : 0;
        public List<ThresholdBreachDetailDto> Breaches { get; set; } = new();
    }
    public class ThresholdBreachDetailDto
    {
        public DateTime Timestamp { get; set; }
        public double Value { get; set; }
        public double ThresholdPercent { get; set; }
    }
    public class DiskThresholdResult : MetricThresholdResult
    {
        public string DiskName { get; set; } = null!;
    }
}