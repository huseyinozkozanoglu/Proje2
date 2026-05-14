using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using Staj2.Agent;


public sealed class TelemetryWorker : BackgroundService
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _config;
    private readonly IMetricsCollector _collector;
    private readonly ILogger<TelemetryWorker> _logger;

    public TelemetryWorker(
        IHttpClientFactory httpFactory,
        IConfiguration config,
        IMetricsCollector collector,
        ILogger<TelemetryWorker> logger)
    {
        _httpFactory = httpFactory;
        _config = config;
        _collector = collector;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalSeconds = int.TryParse(_config["Agent:IntervalSeconds"], out var s) ? s : 30;
        var ingestPath = _config["Agent:IngestPath"] ?? "/api/agent-telemetry";
        var key = _config["Agent:IngestKey"];

        var period = TimeSpan.FromSeconds(Math.Max(1, intervalSeconds));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var dto = await _collector.CollectAsync(stoppingToken);

                var http = _httpFactory.CreateClient("backend");

                using var req = new HttpRequestMessage(HttpMethod.Post, ingestPath);
                if (!string.IsNullOrWhiteSpace(key))
                    req.Headers.TryAddWithoutValidation("X-Agent-Key", key);

                req.Content = JsonContent.Create(dto);

                var res = await http.SendAsync(req, stoppingToken);
                if (!res.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Ingest failed: {Status}", res.StatusCode);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Telemetry loop error");
            }

            await Task.Delay(period, stoppingToken);
        }
    }
}
