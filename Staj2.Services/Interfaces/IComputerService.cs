using Staj2.Services.Models;

namespace Staj2.Services.Interfaces;

public interface IComputerService
{
    // 1. Cihaz Detayı
    // Eskiden: Task<(bool isForbidden, bool isNotFound, object? data)> 
    Task<ServiceResult<object>> GetComputerAsync(int id, int userId, bool isAdmin);

    // 2. Disk Listesi
    // Eskiden: Task<(bool isForbidden, object? data)>
    Task<ServiceResult<object>> GetComputerDisksAsync(int computerId, int userId, bool isAdmin);

    // 3. Eşik Güncelleme
    // Eskiden: Task<(bool isForbidden, bool isNotFound, bool isBadRequest, string message)>
    Task<ServiceResult> UpdateThresholdsAsync(int computerId, UpdateThresholdsRequest request, int userId, bool isAdmin);

    // 4. Etiket Atama
    // Eskiden: Task<(bool isNotFound, string message)>
    Task<ServiceResult> UpdateComputerTagsAsync(int id, UpdateComputerTagsRequest request);

    // 5. İsim Değiştirme
    // Eskiden: Task<(bool isSuccess, bool isNotFound, string message)>
    Task<ServiceResult> UpdateDisplayNameAsync(UpdateComputerNameRequest request);

    // 6. Metrik Geçmişi
    // Eskiden: Task<(bool isBadRequest, string? errorMessage, object? data)>
    Task<ServiceResult<object>> GetMetricsHistoryAsync(int id, string start, string end, int? maxPoints = null);

    // 7. Tüm Cihazları Getir
    // Eskiden: Task<object>
    Task<ServiceResult<object>> GetAllComputersAsync(int userId, bool isAdmin);

    // 8. Cihaz Silme
    // Eskiden: Task<(bool isNotFound, bool isBadRequest, string message)>
    Task<ServiceResult> DeleteComputerAsync(int id);

    // 9. Kullanıcının Etiketlerini Getir
    // Eskiden: Task<object>
    Task<ServiceResult<object>> GetMyTagsAsync(int userId, bool isAdmin);

    // 10. Performans Raporu
    // Eskiden: Task<PerformanceReportDto>
    Task<ServiceResult<PerformanceReportDto>> GetPerformanceReportAsync(int userId, bool isAdmin);

    // 11. Metrik Özeti
    // Eskiden: Task<MetricSummaryDto>
    Task<ServiceResult<MetricSummaryDto>> GetMetricsSummaryAsync(int computerId, string metricType, string? diskName);
    Task<ServiceResult<object>> GetMetricsTrendDataAsync(int computerId, string metricType, string? diskName);
    Task<ServiceResult<ThresholdAnalysisReportDto>> GetThresholdAnalysisAsync(int computerId, ThresholdReportRequestDto request);
    Task<ServiceResult<object>> GetLogManagementDataAsync(int computerId, string start, string end, int userId, bool isAdmin);
}