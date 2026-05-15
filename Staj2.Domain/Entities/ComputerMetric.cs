using System.ComponentModel.DataAnnotations.Schema;

namespace Staj2.Domain.Entities;

public class ComputerMetric
{
    public long Id { get; set; }
    public int ComputerId { get; set; }
    public Computer Computer { get; set; } = null!;

    public double CpuUsage { get; set; }
    public double RamUsage { get; set; }

    public DateTime CreatedAt { get; set; }
}