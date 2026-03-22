from django.contrib import admin
from .models import UserProfile, Company, CompanyInvite, CompanyUsage

class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'company')
    search_fields = ('user__email', 'company__name')
    list_filter = ('company',)
    raw_id_fields = ('user', 'company')

admin.site.register(UserProfile, UserProfileAdmin)
admin.site.register(Company)
admin.site.register(CompanyInvite)
admin.site.register(CompanyUsage)
