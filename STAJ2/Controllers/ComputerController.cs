using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Staj2.Infrastructure.Data;
using Staj2.Services.Interfaces;
using Staj2.Services.Models;
using STAJ2.Authorization;
using System.Globalization;
using System.Security.Claims;

namespace STAJ2.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ComputerController : ControllerBase
{
    private readonly IComputerService _computerService;
    private readonly IConfiguration _config;

    public ComputerController(IComputerService computerService, IConfiguration config)
    {
        _computerService = computerService;
        _config = config;
    }

    // --- YARDIMCI METOTLAR ---
    private int GetUserId() => int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out int id) ? id : 0;

    private bool IsAdmin()
    {
        var adminRoleName = _config["AppDefaults:AdminRoleName"] ?? "Yönetici";
        return User.IsInRole(adminRoleName);
    }

    // 1. Cihaz Detayı
    [HttpGet("{id:int}")]
    [HasPermission(AppPermissions.None)]
    public async Task<IActionResult> GetComputer(int id)
    {
        var result = await _computerService.GetComputerAsync(id, GetUserId(), IsAdmin());

        if (!result.IsSuccess)
        {
            if (result.Message != null && result.Message.Contains("yetkiniz")) return Forbid();
            if (result.Message != null && result.Message.Contains("bulunamadı")) return NotFound(new { message = result.Message });
            return BadRequest(new { message = result.Message });
        }

        return Ok(result.Data);
    }

    // 2. Disk Listesi
    [HttpGet("{computerId:int}/disks")]
    [HasPermission(AppPermissions.None)]
    public async Task<IActionResult> GetComputerDisks(int computerId)
    {
        var result = await _computerService.GetComputerDisksAsync(computerId, GetUserId(), IsAdmin());

        if (!result.IsSuccess)
        {
            if (result.Message != null && result.Message.Contains("yetkiniz")) return Forbid();
            return BadRequest(new { message = result.Message });
        }

        return Ok(result.Data);
    }

    // 3. Eşik Değerlerini Güncelle
    [HttpPut("update-thresholds/{computerId:int}")]
    [HasPermission(AppPermissions.Computer_SetThreshold)]
    public async Task<IActionResult> UpdateThresholds(int computerId, [FromBody] UpdateThresholdsRequest request)
    {
        var result = await _computerService.UpdateThresholdsAsync(computerId, request, GetUserId(), IsAdmin());

        if (!result.IsSuccess)
        {
            if (result.Message != null && result.Message.Contains("yetkiniz")) return Forbid();
            if (result.Message != null && result.Message.Contains("bulunamadı")) return NotFound(new { message = result.Message });
            return BadRequest(new { message = result.Message });
        }

        return Ok(new { message = result.Message });
    }

    // 4. Etiket Atama
    [HttpPut("{id}/tags")]
    [HasPermission(AppPermissions.Computer_AssignTag)]
    public async Task<IActionResult> UpdateComputerTags(int id, [FromBody] UpdateComputerTagsRequest request)
    {
        var result = await _computerService.UpdateComputerTagsAsync(id, request);

        if (!result.IsSuccess)
        {
            if (result.Message != null && result.Message.Contains("bulunamadı")) return NotFound(new { message = result.Message });
            return BadRequest(new { message = result.Message });
        }

        return Ok(new { message = result.Message });
    }

    // 5. İsim Değiştirme
    [HttpPut("update-display-name")]
    [HasPermission(AppPermissions.Computer_Rename)]
    public async Task<IActionResult> UpdateDisplayName([FromBody] UpdateComputerNameRequest request)
    {
        var result = await _computerService.UpdateDisplayNameAsync(request);

        if (!result.IsSuccess)
        {
            if (result.Message != null && result.Message.Contains("bulunamadı")) return NotFound(new { message = result.Message });
            return BadRequest(new { message = result.Message });
        }

        return Ok(new { message = result.Message });
    }

    // 6. Belirli bir tarih aralığındaki metrik geçmişini getir
    [HttpGet("{id:int}/metrics-history")]
    [HasPermission(AppPermissions.None)]
    public async Task<IActionResult> GetMetricsHistory(int id, [FromQuery] string? start, [FromQuery] string? end, [FromQuery] int? maxPoints = null)
    {
        var result = await _computerService.GetMetricsHistoryAsync(id, start, end, maxPoints);

        if (!result.IsSuccess)
            return BadRequest(new { message = result.Message, title = "Uyarı" });

        return Ok(result.Data);
    }

    // 7. Tüm Cihazları Getir
    [HttpGet]
    [HasPermission(AppPermissions.None)]
    public async Task<IActionResult> GetAllComputers()
    {
        var result = await _computerService.GetAllComputersAsync(GetUserId(), IsAdmin());
        return Ok(result.Data);
    }

    // 8. Cihaz Silme (Sadece Pasif Olanlar İçin Soft Delete)
    [HttpDelete("{id:int}")]
    [HasPermission(AppPermissions.Computer_Delete)]
    public async Task<IActionResult> DeleteComputer(int id)
    {
        var result = await _computerService.DeleteComputerAsync(id);

        if (!result.IsSuccess)
        {
            if (result.Message != null && result.Message.Contains("bulunamadı")) return NotFound(new { message = result.Message });
            return BadRequest(new { message = result.Message });
        }

        return Ok(new { message = result.Message });
    }

    // 9. Etiketleri Getir
    [HttpGet("tags")]
    [HasPermission(AppPermissions.None)]
    public async Task<IActionResult> GetMyTags()
    {
        var result = await _computerService.GetMyTagsAsync(GetUserId(), IsAdmin());
        return Ok(result.Data);
    }

    // 10. Performans Raporu
    [HttpGet("performance-report")]
    public async Task<IActionResult> GetPerformanceReport()
    {
        var result = await _computerService.GetPerformanceReportAsync(GetUserId(), IsAdmin());
        return Ok(result.Data);
    }

    // 11. Metrik Özeti
    [HttpGet("{id:int}/metrics-summary")]
    public async Task<IActionResult> GetMetricsSummary(int id, [FromQuery] string metricType, [FromQuery] string? diskName = null)
    {
        var result = await _computerService.GetMetricsSummaryAsync(id, metricType, diskName);
        return Ok(result.Data);
    }
    // 12. Rapor Detayları İçin Trend Verisi
    [HttpGet("{id:int}/metrics-trend")]
    public async Task<IActionResult> GetMetricsTrendData(int id, [FromQuery] string metricType, [FromQuery] string? diskName = null)
    {
        var result = await _computerService.GetMetricsTrendDataAsync(id, metricType, diskName);
        return Ok(result.Data);
    }

    // ComputerController.cs
    [HttpPost("{id}/threshold-analysis")]
    public async Task<IActionResult> GetThresholdAnalysis(int id, [FromBody] ThresholdReportRequestDto request)
    {
        // Artık tüm nesneyi tek seferde gönderiyoruz
        var result = await _computerService.GetThresholdAnalysisAsync(id, request);

        if (!result.IsSuccess)
            return BadRequest(new { message = result.Message });

        return Ok(result.Data);
    }

    [HttpGet("{id:int}/logs")]
    [HasPermission(AppPermissions.None)]
    public async Task<IActionResult> GetLogs(int id, [FromQuery] string start, [FromQuery] string end)
    {
        var result = await _computerService.GetLogManagementDataAsync(id, start, end, GetUserId(), IsAdmin());
        if (!result.IsSuccess) return BadRequest(new { message = result.Message });
        return Ok(result.Data);
    }
}