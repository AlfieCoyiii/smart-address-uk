from django.urls import path, include
from . import views
from allauth.account.views import LogoutView
from django.views.generic import TemplateView
from .views import CustomPasswordChangeView

urlpatterns = [
    path('', views.home, name='home'),
    path('pricing/', views.pricing, name='pricing'),
    path('profile/', views.profile, name='profile'),
    path('start-company/', views.start_company_billing, name='start_company_billing'),
    path('company-invite/', views.company_invite, name='company_invite'),
    path('company-invite-members/', views.company_invite_members, name='company_invite_members'),
    path('billing/', views.billing, name='billing'),
    path('onboard-billing-admin/<str:token>/', views.onboard_billing_admin, name='onboard_billing_admin'),
    path('accounts/logout/', views.custom_logout, name='account_logout'),
    path('accounts/email-verified/', TemplateView.as_view(template_name='account/email_confirmed.html'), name='account_email_verified'),
    # CUSTOM PASSWORD RESET URLS -- these must be above allauth include
    path('accounts/password/reset/', views.password_reset_request, name='custom_password_reset'),
    path('accounts/password/reset/code/', views.password_reset_code_entry, name='password_reset_code_entry'),
    path('accounts/password/reset/new/', views.password_reset_new_password, name='password_reset_new_password'),
    # Custom verify-email code flow
    path('accounts/verify-email/', views.verify_email_code, name='verify_email_code'),
    path('accounts/resend-code/', views.resend_verification_code, name='resend_verification_code'),
    path('accounts/password/change/', CustomPasswordChangeView.as_view(), name='account_change_password'),
    path('accounts/password/change/done/', TemplateView.as_view(template_name='account/password_change_done.html'), name='account_password_change_done'),
    path('set-overage-cap/', views.set_overage_cap, name='set_overage_cap'),
    path('beta-access/', views.beta_access, name='beta_access'),
    # ALLAUTH INCLUDE LAST (so our custom auth URLs win)
    path('accounts/', include('allauth.urls')),
]
