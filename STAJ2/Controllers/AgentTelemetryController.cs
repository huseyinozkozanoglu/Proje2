using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Staj2.Services.Models.Agent;
using Staj2.Services.Interfaces;

namespace STAJ2.Controllers;

using STAJ2.Authorization;

[ApiController]
[Route("api/agent-telemetry")]
public class AgentTelemetryController : ControllerBase
{
    private readonly IAgentTelemetryService _telemetryService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;

    // ScopeFactory kalıyor çünkü Task.Run (arka plan işlemi) Controller'ın yaşam döngüsünden bağımsız çalışmak zorundadır.
    public AgentTelemetryController(IAgentTelemetryService telemetryService, IServiceScopeFactory scopeFactory, IConfiguration config)
    {
        _telemetryService = telemetryService;
        _scopeFactory = scopeFactory;
        _config = config;
    }

    [HttpPost]
    public async Task<IActionResult> Ingest([FromBody] AgentTelemetryDto dto, CancellationToken ct)
    {
        // Header'dan key'i oku ve servise yolla
        Request.Headers.TryGetValue("X-Agent-Key", out var agentKey);

        var result = await _telemetryService.IngestAsync(dto, agentKey, ct);

        // Hata Kontrolü (Yetki ve Kötü İstek durumları)
        if (!result.IsSuccess)
        {
            if (result.Message == "Unauthorized")
                return Unauthorized();

            return BadRequest(result.Message);
        }

        // Servisten dönen mailler result.Data içerisinde taşınıyor, varsa arka planda fırlat!
        if (result.Data != null && result.Data.Any())
        {
            var alerts = result.Data; // Arka plan işlemi için referansı kopyalıyoruz
            _ = Task.Run(async () =>
            {
                using var scope = _scopeFactory.CreateScope();
                var mailSender = scope.ServiceProvider.GetRequiredService<IMailSender>();

                foreach (var alert in alerts)
                {
                    try { await mailSender.SendAsync(alert.Email, alert.Subject, alert.Body); }
                    catch (Exception ex) { Console.WriteLine($"[Alert Mail Error]: {ex.Message}"); }
                }
            });
        }

        return Ok();
    }

    [HttpGet("latest")]
    [HasPermission(AppPermissions.Computer_Access)]
    public async Task<IActionResult> Latest()
    {
        var userIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        int userId = int.TryParse(userIdString, out int id) ? id : 0;

        var adminRoleName = _config["AppDefaults:AdminRoleName"] ?? "Yönetici";
        bool isAdmin = User.IsInRole(adminRoleName);

        var result = await _telemetryService.GetLatestAsync(userId, isAdmin);

        // Hata kontrolü
        if (!result.IsSuccess)
            return BadRequest(result.Message);

        // Başarılıysa veriyi dön
        return Ok(result.Data);
    }

    [HttpGet("top-warnings")]
    [HasPermission(AppPermissions.Computer_Access)]
    public async Task<IActionResult> GetTopWarnings(DateTime? startDate, DateTime? endDate) // Parametreleri buradan alıyoruz
    {
        var userId = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "0");
        var isAdmin = User.IsInRole("Yönetici");

        var result = await _telemetryService.GetTopWarningsAsync(userId, isAdmin, startDate, endDate);

        if (!result.IsSuccess)
            return BadRequest(result.Message);

        return Ok(result.Data);
    }
}