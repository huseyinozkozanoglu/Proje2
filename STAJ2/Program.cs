using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Staj2.Infrastructure.Data;
using Staj2.Services.Interfaces;
using Staj2.Services.Services;
using STAJ2.Authorization;
using STAJ2.MailServices;
using System.Text;




var builder = WebApplication.CreateBuilder(args);

builder.Services.AddScoped<IMailSender, MailKitMailSender>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IAdminService, AdminService>();
builder.Services.AddScoped<IComputerService, ComputerService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IRegistrationService, RegistrationService>();
builder.Services.AddScoped<IUiService, UiService>();
builder.Services.AddScoped<IAgentTelemetryService, AgentTelemetryService>();
builder.Services.AddHostedService<Staj2.Services.Services.OfflineDeviceMonitorService>();
// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.CustomSchemaIds(t => t.FullName);

    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "Bearer {token} şeklinde gir"
    });

    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            new string[] {}
        }
    });
});

// Db
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// JWT
var jwt = builder.Configuration.GetSection("Jwt");
var key = Encoding.UTF8.GetBytes(jwt["Key"]!);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt["Issuer"],
            ValidAudience = jwt["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization();
// 1. Memory Cache'i aktif et (Servisimiz kullanıyor)
builder.Services.AddMemoryCache();

// Program.cs
var adminRoleName = builder.Configuration["AppDefaults:AdminRoleName"] ?? "Yönetici";

builder.Services.AddAuthorization(options =>
{
    // Dinamik olarak appsettings'den rolü okuyup kural oluşturuyoruz
    options.AddPolicy("AdminOnly", policy => policy.RequireRole(adminRoleName));
});

// 3. Bütün projedeki Controller'ların tepesine otomatik olarak yazdığımız Filtreyi koy
builder.Services.AddControllers(options =>
{
    options.Filters.Add<STAJ2.Authorization.DynamicPermissionFilter>();
});
var app = builder.Build();

app.UseMiddleware<STAJ2.Middlewares.GlobalExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}


app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

await STAJ2.Seed.DbSeeder.SeedAsync(app);
app.MapControllers();
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var context = services.GetRequiredService<Staj2.Infrastructure.Data.AppDbContext>();

    // Tabloları oluştur (eğer yoksa)
    context.Database.Migrate();

}
app.Run();
