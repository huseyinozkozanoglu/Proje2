using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Staj2.Services.Interfaces;
using Microsoft.Extensions.Configuration;

namespace STAJ2.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // Sadece giriş yapmış kullanıcılar menüleri çekebilir
public class UiController : ControllerBase
{
    private readonly IUiService _uiService;
    private readonly IConfiguration _config;

    public UiController(IUiService uiService, IConfiguration config)
    {
        _uiService = uiService;
        _config = config;
    }

    // DRY (Don't Repeat Yourself) prensibi için userId getirme işlemini metoda aldık
    private int GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier) ??
                          User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub);

        return (userIdClaim != null && int.TryParse(userIdClaim.Value, out int id)) ? id : 0;
    }

    [HttpGet("sidebar-items")]
    public async Task<IActionResult> GetSidebarItems()
    {
        int userId = GetUserId();
        if (userId == 0) return Unauthorized(new { message = "Kullanıcı kimliği doğrulanamadı." });

        var result = await _uiService.GetSidebarItemsAsync(userId);

        // result.ErrorMessage yerine yeni standart olan result.Message'ı kullanıyoruz
        if (!result.IsSuccess) return NotFound(new { message = result.Message });

        return Ok(result.Data);
    }

    [HttpGet("my-permissions")]
    public async Task<IActionResult> GetMyPermissions()
    {
        int userId = GetUserId();
        if (userId == 0) return Unauthorized(new { message = "Kullanıcı kimliği doğrulanamadı." });

        var result = await _uiService.GetMyPermissionsAsync(userId);

        if (!result.IsSuccess) return NotFound(new { message = result.Message });

        // Eski result.Permissions yerine standart result.Data kullanıyoruz
        return Ok(result.Data);
    }

    [HttpGet("chart-settings")]
    public IActionResult GetChartSettings()
    {
        var settings = new
        {
            defaultMaxPoints = _config.GetValue<int>("ChartSettings:DefaultMaxPoints", 200),
            detailMaxPoints = _config.GetValue<int>("ChartSettings:DetailMaxPoints", 1000),
            logMonthLimit = _config.GetValue<int>("ChartSettings:LogMonthLimit", 6)
        };
        return Ok(settings);
    }

    // İleride açmak istersen bu şekilde standart formata uygun açabilirsin:
    //[HttpGet("user-actions")]
    //public async Task<IActionResult> GetUserActions()
    //{
    //    var result = await _uiService.GetUserActionsAsync();
    //    return Ok(result.Data);
    //}
}