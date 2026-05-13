using System;
using System.Collections.Generic;

namespace Staj2.Services.Models
{
    public class LogManagementResponseDto
    {
        public List<LogEntryDto> Logs { get; set; } = new();
        public List<HistogramBucketDto> Histogram { get; set; } = new();
        public int TotalCount { get; set; }
    }

    public class LogEntryDto
    {
        public DateTime Timestamp { get; set; }
        public string Level { get; set; } // Info, Warning, Critical
        public string Metric { get; set; } // CPU, RAM, Disk (C)
        public double Value { get; set; }
        public double Limit { get; set; }
        public string Message { get; set; }
    }

    public class HistogramBucketDto
    {
        public string Timestamp { get; set; } // ISO String or Formatted
        public int InfoCount { get; set; }
        public int WarningCount { get; set; }
        public int CriticalCount { get; set; }
        public HistogramBucketDetailsDto Details { get; set; } = new();
    }

    public class HistogramBucketDetailsDto
    {
        public HistogramLevelDetailDto Critical { get; set; } = new();
        public HistogramLevelDetailDto Warning { get; set; } = new();
        public HistogramLevelDetailDto Info { get; set; } = new();
    }

    public class HistogramLevelDetailDto
    {
        public int Count { get; set; }
        public Dictionary<string, int> Metrics { get; set; } = new();
    }

    public class ExportTokenParams
    {
        public int ComputerId { get; set; }
        public string Start { get; set; }
        public string End { get; set; }
        public int UserId { get; set; }
        public bool IsAdmin { get; set; }
    }
}
