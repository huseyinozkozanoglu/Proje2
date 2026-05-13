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
    [HasPermission(AppPermissions.Computer_Read)]
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
    [HasPermission(AppPermissions.Computer_Read)]
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
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetMetricsHistory(int id, [FromQuery] string? start, [FromQuery] string? end, [FromQuery] int? maxPoints = null)
    {
        var result = await _computerService.GetMetricsHistoryAsync(id, start, end, maxPoints);

        if (!result.IsSuccess)
            return BadRequest(new { message = result.Message, title = "Uyarı" });

        return Ok(result.Data);
    }

    [HttpGet("metrics-history-batch")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetMetricsHistoryBatch([FromQuery] string ids, [FromQuery] string? start, [FromQuery] string? end, [FromQuery] string metric, [FromQuery] int? maxPoints = null)
    {
        if (string.IsNullOrEmpty(ids)) return BadRequest(new { message = "Cihaz ID'leri boş olamaz." });
        
        var idList = ids.Split(',').Select(int.Parse).ToList();
        var result = await _computerService.GetMetricsHistoryBatchAsync(idList, start, end, metric, maxPoints);

        if (!result.IsSuccess)
            return BadRequest(new { message = result.Message, title = "Uyarı" });

        return Ok(result.Data);
    }

    [HttpGet("metrics-history-bucket-detail")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetMetricsHistoryBucketDetail([FromQuery] string ids, [FromQuery] string start, [FromQuery] string end, [FromQuery] string metric)
    {
        if (string.IsNullOrEmpty(ids)) return BadRequest(new { message = "Cihaz ID'leri boş olamaz." });
        var idList = ids.Split(',').Select(int.Parse).ToList();
        var result = await _computerService.GetMetricBucketDetailBatchAsync(idList, start, end, metric);

        if (!result.IsSuccess)
            return BadRequest(new { message = result.Message });

        return Ok(result.Data);
    }

    // 7. Tüm Cihazları Getir
    [HttpGet]
    [HasPermission(AppPermissions.Computer_Read)]
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
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetMyTags()
    {
        var result = await _computerService.GetMyTagsAsync(GetUserId(), IsAdmin());
        return Ok(result.Data);
    }

    // 10. Performans Raporu
    [HttpGet("performance-report")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetPerformanceReport()
    {
        var result = await _computerService.GetPerformanceReportAsync(GetUserId(), IsAdmin());
        return Ok(result.Data);
    }

    // 11. Metrik Özeti
    [HttpGet("{id:int}/metrics-summary")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetMetricsSummary(int id, [FromQuery] string metricType, [FromQuery] string? diskName = null)
    {
        var result = await _computerService.GetMetricsSummaryAsync(id, metricType, diskName);
        return Ok(result.Data);
    }
    // 12. Rapor Detayları İçin Trend Verisi
    [HttpGet("{id:int}/metrics-trend")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetMetricsTrendData(int id, [FromQuery] string metricType, [FromQuery] string? diskName = null)
    {
        var result = await _computerService.GetMetricsTrendDataAsync(id, metricType, diskName);
        return Ok(result.Data);
    }

    // ComputerController.cs
    [HttpPost("{id}/threshold-analysis")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetThresholdAnalysis(int id, [FromBody] ThresholdReportRequestDto request)
    {
        // Artık tüm nesneyi tek seferde gönderiyoruz
        var result = await _computerService.GetThresholdAnalysisAsync(id, request);

        if (!result.IsSuccess)
            return BadRequest(new { message = result.Message });

        return Ok(result.Data);
    }

    [HttpGet("{id:int}/logs")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetLogs(int id, [FromQuery] string start, [FromQuery] string end)
    {
        var result = await _computerService.GetLogManagementDataAsync(id, start, end, GetUserId(), IsAdmin());
        if (!result.IsSuccess) return BadRequest(new { message = result.Message });
        return Ok(result.Data);
    }

    [HttpGet("{id:int}/logs/histogram")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetLogHistogram(int id, [FromQuery] string start, [FromQuery] string end, [FromQuery] string? levels = null, [FromQuery] string? metrics = null, [FromQuery] string? search = null)
    {
        var result = await _computerService.GetLogHistogramDataAsync(id, start, end, GetUserId(), IsAdmin(), levels, metrics, search);
        if (!result.IsSuccess) return BadRequest(new { message = result.Message });
        return Ok(result.Data);
    }

    [HttpGet("{id:int}/logs/paginated")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetPaginatedLogs(int id, [FromQuery] string start, [FromQuery] string end, [FromQuery] int offset = 0, [FromQuery] int limit = 500, [FromQuery] string? levels = null, [FromQuery] string? metrics = null, [FromQuery] string? search = null)
    {
        var result = await _computerService.GetPaginatedLogsAsync(id, start, end, offset, limit, GetUserId(), IsAdmin(), levels, metrics, search);
        if (!result.IsSuccess) return BadRequest(new { message = result.Message });
        return Ok(result.Data);
    }

    [HttpPost("{id:int}/logs/export-token")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GenerateExportToken(int id, [FromQuery] string start, [FromQuery] string end)
    {
        var token = await _computerService.GenerateExportTokenAsync(id, start, end, GetUserId(), IsAdmin());
        return Ok(new { token });
    }

    [AllowAnonymous]
    [HttpGet("logs/export-csv-direct")]
    public async Task<IActionResult> ExportLogsCsvDirect([FromQuery] string token)
    {
        var data = await _computerService.GetExportParamsAsync(token);
        if (data == null) return BadRequest("İndirme bağlantısı geçersiz veya süresi dolmuş.");

        try
        {
            Response.ContentType = "text/csv; charset=utf-8";
            Response.Headers.Append("Content-Disposition", $"attachment; filename=\"Logs_{data.ComputerId}_{data.Start}_{data.End}.csv\"");

            // UTF-8 BOM
            await Response.Body.WriteAsync(new byte[] { 0xEF, 0xBB, 0xBF });

            await using var writer = new StreamWriter(Response.Body, System.Text.Encoding.UTF8, leaveOpen: true);
            await _computerService.ExportLogsCsvAsync(data.ComputerId, data.Start, data.End, data.UserId, data.IsAdmin, writer);
            await writer.FlushAsync();

            return new EmptyResult();
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("{id:int}/logs/count")]
    [HasPermission(AppPermissions.Computer_Read)]
    public async Task<IActionResult> GetLogCount(int id, [FromQuery] string start, [FromQuery] string end)
    {
        var result = await _computerService.GetLogCountAsync(id, start, end, GetUserId(), IsAdmin());
        if (!result.IsSuccess) return BadRequest(new { message = result.Message });
        return Ok(new { count = result.Data });
    }
}