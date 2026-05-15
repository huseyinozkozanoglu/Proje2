namespace STAJ2.Authorization;

public enum AppPermissions
{
    None, // Herkese açık endpointler için
    Computer_Read,
    Computer_ReadAll,
    Computer_ReadReports,
    Computer_Delete,
    Computer_Rename,
    Computer_SetThreshold,
    Role_Manage,
    User_Manage,
    Tag_Manage,
    Computer_AssignTag,
    Computer_Access, // YENİ: Bilgisayar temel verilerine erişim (Diğer sayfalar için gerekebilir)
    User_Read,
    User_ManageRoles,
    User_ManageComputers,
    User_ManageTags
}