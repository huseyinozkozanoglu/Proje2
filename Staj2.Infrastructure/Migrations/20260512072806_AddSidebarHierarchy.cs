using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Staj2.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSidebarHierarchy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ParentId",
                table: "SidebarItems",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SidebarItems_ParentId",
                table: "SidebarItems",
                column: "ParentId");

            migrationBuilder.AddForeignKey(
                name: "FK_SidebarItems_SidebarItems_ParentId",
                table: "SidebarItems",
                column: "ParentId",
                principalTable: "SidebarItems",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SidebarItems_SidebarItems_ParentId",
                table: "SidebarItems");

            migrationBuilder.DropIndex(
                name: "IX_SidebarItems_ParentId",
                table: "SidebarItems");

            migrationBuilder.DropColumn(
                name: "ParentId",
                table: "SidebarItems");
        }
    }
}
