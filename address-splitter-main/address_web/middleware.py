from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse
from django.http import HttpResponseRedirect

SAFE_PATHS = [
    '/beta-access/', '/accounts/login/', '/accounts/signup/', '/accounts/password/reset/', '/accounts/password/reset/key/', '/accounts/password/reset/done/', '/accounts/email-confirmation/', '/admin/', '/static/', '/media/', '/favicon.ico', '/robots.txt', '/accounts/password/change/', '/accounts/logout/'
]

def safe_path(path):
    for safe in SAFE_PATHS:
        if path.startswith(safe):
            return True
    return False

class BetaAccessPinMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not safe_path(request.path):
            if request.COOKIES.get('beta_access_granted') != 'true':
                return HttpResponseRedirect(f"/beta-access/?next={request.path}")
        return self.get_response(request)
