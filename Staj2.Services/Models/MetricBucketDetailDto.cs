namespace Staj2.Services.Models;

public class MetricBucketDetailDto
{
    public int ComputerId { get; set; }
    public string ComputerName { get; set; } = string.Empty;
    public double? MinValue { get; set; }
    public int MinCount { get; set; }
    public double? MaxValue { get; set; }
    public int MaxCount { get; set; }
    public double? AverageValue { get; set; }
    public int DataPointCount { get; set; }
    public double ActiveSeconds { get; set; }
    public string ActiveDurationText { get; set; } = string.Empty;

    public int MaxStreakCount { get; set; }
    public string MaxStreakRange { get; set; } = string.Empty;
    public int MinStreakCount { get; set; }
    public string MinStreakRange { get; set; } = string.Empty;

    // YENİ: Tekrarlanan değerlerin zaman damgaları
    public List<DateTime> MaxOccurrenceTimes { get; set; } = new();
    public List<DateTime> MinOccurrenceTimes { get; set; } = new();
}
