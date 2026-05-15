using System.ComponentModel.DataAnnotations;

namespace Staj2.Services.Models
{
    public class UpdateComputerNameRequest
    {
        public int Id { get; set; }

        public string NewDisplayName { get; set; } = null!;
    }
}