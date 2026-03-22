from django import forms
from allauth.account.forms import SignupForm
from django.contrib.auth.models import User
from .models import Company, UserProfile, EmailVerificationCode
from django.utils import timezone
from datetime import timedelta
from .utils import send_verification_email

class CustomSignupForm(SignupForm):
    first_name = forms.CharField(max_length=30, label='First name', widget=forms.TextInput(attrs={'placeholder': 'First name'}))
    last_name = forms.CharField(max_length=30, label='Last name', widget=forms.TextInput(attrs={'placeholder': 'Last name'}))

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['email'].widget.attrs['placeholder'] = 'Email address'
        self.fields['password1'].widget.attrs['placeholder'] = 'Password'
        if 'password2' in self.fields:
            self.fields['password2'].widget.attrs['placeholder'] = 'Password (again)'

    def save(self, request):
        user = super().save(request)
        user.first_name = self.cleaned_data['first_name']
        user.last_name = self.cleaned_data['last_name']
        user.save()
        # Ensure EmailAddress exists and verify state is in sync
        from allauth.account.models import EmailAddress
        try:
            email_address, created = EmailAddress.objects.get_or_create(user=user, email=user.email, defaults={'primary': True})
        except Exception as e:
            # Log this error or provide feedback
            import logging
            logging.getLogger('django').error(f'ERR-SU-001: Could not create EmailAddress for {user.email}: {e}')
        # Create a code if not exists, send after signup
        from .models import EmailVerificationCode
        if not hasattr(user, 'emailverificationcode'):
            code = EmailVerificationCode.generate_code()
            entry = EmailVerificationCode.objects.create(
                user=user,
                code=code,
                expiry=timezone.now() + timedelta(minutes=10),
            )
            try:
                send_verification_email(user, code)
            except Exception as e:
                import logging
                logging.getLogger('django').error(f'ERR-SU-002: Failed to send verification email to {user.email}: {e}')
        return user
