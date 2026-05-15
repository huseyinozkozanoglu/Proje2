using System;

namespace Staj2.Domain.Entities
{
    public class MetricWarningLog
    {
        public long Id { get; set; }

        public int ComputerId { get; set; }
        public Computer Computer { get; set; } = null!;

        public int MetricTypeId { get; set; }
        public MetricType MetricType { get; set; } = null!;

        // --- DEĞİŞEN KISIM: String yerine doğrudan ilişkisel Disk nesnesi (Nullable) ---
        public int? ComputerDiskId { get; set; }
        public ComputerDisk? ComputerDisk { get; set; }
        // -------------------------------------------------------------------------------

        public double MetricValue { get; set; }
        public double ThresholdValue { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}