import os
from django.shortcuts import render, redirect, get_object_or_404
import pickle
import csv
from address_parsing_core import (
    extract_flat_from_building,
    join_tokens_preserving_commas,
    parse_address_multi,
    sanitize_crf_street_name,
    sanitize_field_edges,
    smart_title,
)
from train_crf_address_ner import predict_address_fields
from django.http import HttpResponse, HttpResponseRedirect
from django.urls import reverse
from django.contrib.auth.models import User
from .models import Company, UserProfile, CompanyInvite
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from django.core.mail import send_mail
import uuid
from .forms import CustomSignupForm
from django.db import IntegrityError
from django.contrib.auth.decorators import login_required
from django.urls import reverse
from django.contrib.auth import login as auth_login
from django.contrib.auth.views import PasswordChangeView
from django.urls import reverse_lazy
from datetime import datetime, timedelta
from django.utils import timezone
from django.db import models
from django.conf import settings
from django.shortcuts import render, redirect
from django.http import HttpResponseRedirect
from .models import EmailVerificationCode
from django.contrib.auth import login as auth_login
from django.utils import timezone
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import redirect
import random
from django.core.mail import EmailMultiAlternatives
from django.utils.deprecation import MiddlewareMixin
from .utils import send_verification_email, send_password_reset_code
from .models import EmailVerificationCode
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt

from django import forms
from django.shortcuts import render
from django.utils import timezone
from datetime import timedelta
from django.contrib.auth.hashers import make_password
from django.contrib.auth import update_session_auth_hash

class PasswordResetRequestForm(forms.Form):
    email = forms.EmailField(widget=forms.EmailInput(attrs={
        'placeholder': 'Your email address', 'class': 'form-control'}), label='Email', max_length=254)

def password_reset_request(request):
    if request.method == 'POST':
        form = PasswordResetRequestForm(request.POST)
        if form.is_valid():
            email = form.cleaned_data['email']
            request.session['reset_email'] = email  # store email in session
            try:
                user = User.objects.get(email=email)
                EmailVerificationCode.objects.filter(user=user, purpose='reset').delete()
                code = EmailVerificationCode.generate_code()
                expiry = timezone.now() + timedelta(minutes=10)
                entry = EmailVerificationCode.objects.create(user=user, code=code, purpose="reset", expiry=expiry)
                send_password_reset_code(user, code)
            except User.DoesNotExist:
                pass
            return redirect(f'/accounts/password/reset/code/')
    else:
        form = PasswordResetRequestForm()
    return render(request, 'account/password_reset_email_code_request.html', {'form': form, 'message': None})

class PasswordResetCodeForm(forms.Form):
    code = forms.CharField(max_length=6, widget=forms.TextInput(attrs={'placeholder': 'Enter 6-digit code', 'class': 'form-control', 'autocomplete': 'off'}), label='6-digit code')
    email = forms.EmailField(widget=forms.HiddenInput())  # hidden, for identity

def password_reset_code_entry(request):
    error, message = None, None
    # Use session to track email
    email = request.session.get('reset_email') or request.GET.get('email')
    if request.method == 'POST':
        if 'resend_code' in request.POST:
            # Handle resend code POST
            try:
                user = User.objects.get(email=email)
                entry = EmailVerificationCode.objects.filter(user=user, purpose='reset').first()
                now = timezone.now()
                if entry and (now - entry.last_sent).total_seconds() < (CODE_RESEND_MINUTES * 60):
                    seconds = int(CODE_RESEND_MINUTES*60 - (now-entry.last_sent).total_seconds())
                    error = f"Please wait {seconds} seconds before resending the code."
                else:
                    code = EmailVerificationCode.generate_code()
                    if entry:
                        entry.code = code
                        entry.expiry = now + timedelta(minutes=10)
                        entry.last_sent = now
                        entry.save()
                    else:
                        entry = EmailVerificationCode.objects.create(user=user, code=code, purpose='reset', expiry=now+timedelta(minutes=10), last_sent=now)
                    send_password_reset_code(user, code)
                    message = "A new code has been sent to your email."
            except User.DoesNotExist:
                error = 'There was a problem. Please go back and try again.'
        else:
            # Normal code check POST
            code = request.POST.get('code','').strip()
            try:
                user = User.objects.get(email=email)
                entry = EmailVerificationCode.objects.get(user=user, code=code, purpose='reset')
                if entry.is_expired():
                    error = 'The code has expired. Please request a new one.'
                    entry.delete()
                else:
                    request.session['reset_user_id'] = user.id
                    entry.delete()
                    return redirect('password_reset_new_password')
            except (User.DoesNotExist, EmailVerificationCode.DoesNotExist):
                error = 'Invalid code.'
    return render(request, 'account/password_reset_code_entry.html', {'error': error, 'message': message, 'email': email})

class PasswordResetNewPasswordForm(forms.Form):
    password1 = forms.CharField(label='New password', widget=forms.PasswordInput(attrs={'class': 'form-control', 'placeholder': 'Enter new password'}))
    password2 = forms.CharField(label='Repeat new password', widget=forms.PasswordInput(attrs={'class': 'form-control', 'placeholder': 'Repeat new password'}))

    def clean(self):
        cleaned_data = super().clean()
        p1 = cleaned_data.get('password1')
        p2 = cleaned_data.get('password2')
        if p1 != p2:
            raise forms.ValidationError('Passwords do not match.')
        return cleaned_data

def password_reset_new_password(request):
    user_id = request.session.get('reset_user_id')
    if not user_id:
        return redirect('custom_password_reset')
    user = User.objects.get(id=user_id)
    error = None
    if request.method == 'POST':
        form = PasswordResetNewPasswordForm(request.POST)
        if form.is_valid():
            new_password = form.cleaned_data['password1']
            user.password = make_password(new_password)
            user.save()
            del request.session['reset_user_id']
            # If user is logged in, update hash
            if request.user.is_authenticated and request.user.id == user.id:
                update_session_auth_hash(request, user)
            return render(request, 'account/password_reset_done.html')
        else:
            error = form.errors.get("__all__", [None])[0]
    else:
        form = PasswordResetNewPasswordForm()
    return render(request, 'account/password_reset_new_password.html', {'form': form, 'error': error})

class CustomPasswordChangeView(PasswordChangeView):
    template_name = "account/password_change.html"
    success_url = reverse_lazy('account_password_change_done')

    def form_valid(self, form):
        try:
            response = super().form_valid(form)
            messages.success(self.request, "Your password was successfully changed.")
            return response
        except Exception as e:
            messages.error(self.request, "ERR-PW-001: Something went wrong changing your password. Please try again or contact support@ukaddresssplitter.com.")
            return redirect('account_change_password')

# Data/model loading (do once)
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_data():
    with open(os.path.join(PROJECT_DIR, 'Pickles', 'valid_place_names.pkl'), 'rb') as f:
        place_names = pickle.load(f)
    with open(os.path.join(PROJECT_DIR, 'Data', 'counties.csv'), newline='', encoding='utf-8') as f:
        counties = [row[0].strip() for row in csv.reader(f) if row]
    with open(os.path.join(PROJECT_DIR, 'crf_model_v3_110925.pkl'), 'rb') as f:
        crf_model = pickle.load(f)
    return place_names, counties, crf_model

_PLACE_NAMES, _COUNTIES, _CRF_MODEL = load_data()

FIELD_CHOICES = [
    ("flat_no", "Flat No."),
    ("building_name", "Building Name"),
    ("street_no", "Street No."),
    ("street_name", "Street Name"),
    ("town", "Town"),
    ("county", "County"),  # Will fill with blank if not found
    ("country", "Country"),  # Will fill with blank if not found
    ("postcode", "Postcode (combined)"),
    ("postcode_start", "Postcode Start"),
    ("postcode_end", "Postcode End"),
]

DEFAULT_COLUMNS = ["flat_no", "building_name", "street_no", "street_name", "town", "postcode_start", "postcode_end"]
FIELD_MAP = {k: v for k, v in FIELD_CHOICES}

CODE_EXPIRY_MINUTES = 10
CODE_RESEND_MINUTES = 1


@login_required
def verify_email_code(request):
    user = request.user
    error = None
    code_generated = False
    entry = None
    try:
        entry = EmailVerificationCode.objects.get(user=user)
    except EmailVerificationCode.DoesNotExist:
        try:
            code = EmailVerificationCode.generate_code()
            entry = EmailVerificationCode.objects.create(user=user, code=code, expiry=timezone.now() + timedelta(minutes=CODE_EXPIRY_MINUTES))
            send_verification_email(user, code)
            code_generated = True
        except Exception as e:
            error = "ERR-VER-002: Unable to create or send email verification code. Please contact support@ukaddresssplitter.com."
            entry = None
    except Exception as e:
        error = "ERR-VER-003: Unexpected error looking up verification code. Please contact support@ukaddresssplitter.com."
    if entry:
        if request.method == 'POST':
            input_code = request.POST.get('code','').strip()
            if entry.is_expired():
                error = "ERR-VER-004: Code expired. Click Resend Code or contact support@ukaddresssplitter.com."
            elif input_code == entry.code:
                try:
                    emails_qs = getattr(user, 'emailaddress_set', None)
                    if emails_qs is None or not emails_qs.exists():
                        # Try to create EmailAddress if missing
                        from allauth.account.models import EmailAddress
                        EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
                    else:
                        emails_qs.update(verified=True)
                    entry.delete()
                    return redirect('home')
                except Exception as e:
                    error = "ERR-VER-005: Email verification succeeded but could not update your email status. Please contact support@ukaddresssplitter.com."
            else:
                error = "ERR-VER-006: Invalid code. Please check your email and try again, or contact support@ukaddresssplitter.com."
    return render(request, 'account/verify_email_code.html', {'error': error, 'code_generated': code_generated})

@login_required
def resend_verification_code(request):
    user = request.user
    try:
        entry = EmailVerificationCode.objects.get(user=user)
    except EmailVerificationCode.DoesNotExist:
        entry = None
    except Exception as e:
        messages.error(request, 'ERR-VER-007: Problem finding existing verification code. Contact support@ukaddresssplitter.com if this persists.')
        return redirect('verify_email_code')
    now = timezone.now()
    if entry and (now - entry.last_sent).total_seconds() < (CODE_RESEND_MINUTES * 60):
        seconds = int(CODE_RESEND_MINUTES*60 - (now-entry.last_sent).total_seconds())
        messages.error(request, f'ERR-VER-008: Please wait {seconds} seconds before resending the code. If you are stuck, contact support@ukaddresssplitter.com.')
        return redirect('verify_email_code')
    code = EmailVerificationCode.generate_code()
    try:
        if entry:
            entry.code = code
            entry.expiry = now + timedelta(minutes=CODE_EXPIRY_MINUTES)
            entry.last_sent = now
            entry.save()
        else:
            entry = EmailVerificationCode.objects.create(user=user, code=code, expiry=now + timedelta(minutes=CODE_EXPIRY_MINUTES), last_sent=now)
        send_verification_email(user, code)
        messages.success(request, 'A new verification code was sent to your email.')
    except Exception as e:
        messages.error(request, 'ERR-VER-009: Could not send new verification code. Please contact support@ukaddresssplitter.com.')
    return redirect('verify_email_code')

def home(request):
    print(f'HOME VIEW: method={request.method}, POST={dict(request.POST)} user={request.user}')
    columns = DEFAULT_COLUMNS.copy()
    result_dicts = None
    error = None
    processed = None  # Ensure always defined
    # Detect and update columns selection from POST
    if request.method == "POST":
        modal_columns = request.POST.getlist("modal_columns")
        main_columns = request.POST.getlist("columns")
        if modal_columns:
            columns = modal_columns
        elif main_columns:
            columns = main_columns
    # Always set this in session so toggling the modal works after fresh splits
    request.session['selected_columns'] = columns
    column_labels = [v for k, v in FIELD_CHOICES if k in columns]

    profile = None
    company = None
    subscription_type = None
    is_paid_user = False
    if request.user.is_authenticated:
        profile = getattr(request.user, 'userprofile', None)
        if profile and profile.company:
            company = profile.company
            subscription_type = getattr(company, 'subscription_type', None)
            if subscription_type in ['pro','corporate','starter']:
                is_paid_user = True

    if request.method == "POST" and request.POST.get("address"):
        address_input = request.POST.get("address", "")
        input_lines = [row for row in address_input.split("\n") if row.strip()]

        # NEW: Per-row character limit check
        if any(len(addr) > 300 for addr in input_lines):
            error = "Each address must be 300 characters or fewer. Please shorten any longer entries."
            processed = None
            request.session['result_dicts'] = None
        else:
            # GUEST LIMIT: More than 3 addresses?
            if not request.user.is_authenticated and len(input_lines) > 3:
                error = "You can split up to 3 addresses per request. Please <a href='/pricing/' class='alert-link'>upgrade</a> to increase your limit."
                processed = None
                request.session['result_dicts'] = None
            # AUTH USERS (not paid)
            elif request.user.is_authenticated and not is_paid_user:
                from .models import CompanyUsage
                from django.utils import timezone
                today = timezone.now().date()
                start_of_week = today - timezone.timedelta(days=today.weekday())
                usages_this_week = CompanyUsage.objects.filter(user=request.user, timestamp__date__gte=start_of_week)
                n_used_this_week = usages_this_week.aggregate(models.Sum('n_addresses'))['n_addresses__sum'] or 0
                incoming = len(input_lines)
                if n_used_this_week + incoming > 30:
                    error = "You have reached your weekly split allowance on your current plan. <a href='/pricing/' class='alert-link'>Upgrade</a> to unlock more."
                    processed = None
                    request.session['result_dicts'] = None
        # SPLIT LOGIC for all non-error branches
        if not error:
            print(f"SPLITTING: input_lines={input_lines}")
            rest_outputs = []
            rest_outputs_normalized = []
            crf_tags_list = []
            try:
                allow_autocorrect_list = [False] * len(input_lines)
                parsed_result = parse_address_multi(input_lines, allow_autocorrect_list=allow_autocorrect_list)
                result_list = parsed_result[0]
                rest_outputs = parsed_result[6]
                rest_outputs_normalized = [smart_title(r) for r in rest_outputs]
                crf_tags_list = predict_address_fields(rest_outputs_normalized, _CRF_MODEL)
                processed = []
                for i, line in enumerate(result_list):
                    parts = line.split("\t")
                    if len(parts) < 9:
                        parts.extend([''] * (9 - len(parts)))
                    tokens = rest_outputs_normalized[i].split() if i < len(rest_outputs_normalized) else []
                    tags = crf_tags_list[i] if i < len(crf_tags_list) else []
                    building, street, number = [], [], []
                    for token, tag in zip(tokens, tags):
                        if tag.endswith('BUILDING'):
                            building.append(token)
                        elif tag.endswith('STREET'):
                            street.append(token)
                        elif tag.endswith('NUMBER'):
                            number.append(token)
                    original_address = input_lines[i] if i < len(input_lines) else ""
                    flat_number, building_name, street_number = extract_flat_from_building(
                        join_tokens_preserving_commas(original_address, building),
                        parts[0],
                        join_tokens_preserving_commas(original_address, number),
                        address_line=input_lines[i] if i < len(input_lines) else "",
                    )
                    street_name = sanitize_crf_street_name(
                        sanitize_field_edges(" ".join(street)), parts[4]
                    )
                    out = {
                        "flat_no": flat_number,
                        "building_name": building_name,
                        "street_no": street_number,
                        "street_name": street_name,
                        "town": parts[4],
                        "county": parts[7],
                        "country": parts[8],
                        "postcode_start": parts[5],
                        "postcode_end": parts[6],
                        "postcode": f"{parts[5]} {parts[6]}".strip()
                    }
                    processed.append(out)
                # Track usage after parse only if logged in, not paid
                if request.user.is_authenticated and not is_paid_user:
                    if profile and profile.company:
                        from .models import CompanyUsage
                        CompanyUsage.objects.create(company=profile.company, user=request.user, n_addresses=len(input_lines))
                request.session['result_dicts'] = processed
                print(f"SPLIT COMPLETE: processed={processed}")
            except Exception as e:
                error = f"Parsing failed: {str(e)}"
                processed = None
                request.session['result_dicts'] = None
    elif request.method == "POST":
        # POST with blank or missing address: clear last result
        processed = None
        request.session['result_dicts'] = None
    else:
        processed = request.session.get('result_dicts')
    result_rows = None
    if processed is not None:
        result_rows = [[row.get(col, "") for col in columns] for row in processed]
    context = {
        "result_rows": result_rows,
        "error": error,
        "columns": columns,
        "column_labels": column_labels,
        "field_map": FIELD_MAP,
        "is_paid_user": is_paid_user,
    }
    return render(request, 'parser/home.html', context)

def custom_logout(request):
    logout(request)
    return redirect('home')

def pricing(request):
    plans = [
        {'n_addresses': 1000, 'price': 35, 'overage_p': 6, 'tier_name': 'Starter'},
        {'n_addresses': 5000, 'price': 120, 'overage_p': 4, 'tier_name': 'Pro'},
        {'n_addresses': 15000, 'price': 280, 'overage_p': 2, 'tier_name': 'Corporate'},
    ]
    for plan in plans:
        plan['overage_text'] = f"Overage charged at {plan['overage_p']}p per address"
    return render(request, 'parser/pricing.html', {'plans': plans})

def start_company_billing(request):
    ctx = {}
    if request.method == 'POST':
        billing_role = request.POST.get('billing_role')
        if billing_role == 'self':
            company_name = request.POST.get('company_name')
            if company_name:
                # Create company and attach to profile if not present
                profile = getattr(request.user, 'userprofile', None)
                if profile and not profile.company:
                    company = Company.objects.create(name=company_name, created_by=request.user)
                    profile.company = company
                    profile.save()
                return redirect('billing')
            ctx['want_company_name'] = True
            ctx['input_company_name'] = request.POST.get('company_name', '')
            ctx['billing_role'] = 'self'
            return render(request, 'parser/start_company_billing.html', ctx)
        else:
            other_email = request.POST.get('other_email')
            if other_email:
                from .models import CompanyInvite
                import uuid
                token = str(uuid.uuid4())
                invite = CompanyInvite.objects.create(email=other_email, token=token)
                send_mail(
                    subject='You have been invited to manage billing for your company',
                    message=f'Click this link to set up your company account: {request.build_absolute_uri(f"/onboard-billing-admin/{token}/")}',
                    from_email='no-reply@ukaddresssplitter.com',
                    recipient_list=[other_email],
                )
                return render(request, 'parser/company_invite.html', {'success': True, 'invite_email': other_email})
            ctx['want_other_email'] = True
            ctx['billing_role'] = 'other'
            return render(request, 'parser/start_company_billing.html', ctx)
    return render(request, 'parser/start_company_billing.html', ctx)

def company_invite(request):
    if request.method == 'POST':
        email = request.POST.get('email')
        token = str(uuid.uuid4())
        invite = CompanyInvite.objects.create(email=email, token=token)
        # Send a basic invite email (improve for production)
        send_mail(
            subject='You have been invited to manage billing for your company',
            message=f'Click this link to set up your company account: {request.build_absolute_uri(f"/onboard-billing-admin/{token}/")}',
            from_email='no-reply@ukaddresssplitter.com',
            recipient_list=[email],
        )
        return render(request, 'parser/company_invite.html', {'success': True, 'invite_email': email})
    return render(request, 'parser/company_invite.html', {'success': False})

@login_required
def onboard_billing_admin(request, token):
    if not request.user.is_authenticated:
        return redirect(f'/accounts/login/?next=/onboard-billing-admin/{token}/')
    profile = getattr(request.user, 'userprofile', None)
    initial_company_name = ''
    has_company = False
    if profile and profile.company:
        initial_company_name = profile.company.name
        has_company = True
    if request.method == 'POST':
        company_name = request.POST.get('company_name')
        if company_name:
            if not profile.company:
                company = Company.objects.create(name=company_name, created_by=request.user)
                request.user.userprofile.company = company
                request.user.userprofile.save()
                if token != 'self':
                    from django.shortcuts import get_object_or_404
                    invite = get_object_or_404(CompanyInvite, token=token, accepted=False)
                    invite.accepted = True
                    invite.company = company
                    invite.save()
            else:
                company = profile.company
                if company.name != company_name:
                    company.name = company_name
                    company.save()
            return redirect('company_invite_members')
    context = {'initial_company_name': initial_company_name, 'has_company': has_company}
    return render(request, 'parser/onboard_company_name.html', context)

@login_required
def company_invite_members(request):
    # Only allow if user has company and is admin; else redirect
    if not hasattr(request.user, 'userprofile') or not request.user.userprofile.company:
        return redirect('home')
    company = request.user.userprofile.company
    if request.method == 'POST':
        emails = [request.POST.get(f'email{i}') for i in range(1, 6)]
        invited = []
        for email in emails:
            if email:
                # Check for user
                try:
                    user = User.objects.get(email=email)
                    user.userprofile.company = company
                    user.userprofile.save()
                    invited.append((email, 'added'))
                except User.DoesNotExist:
                    token = str(uuid.uuid4())
                    invite = CompanyInvite.objects.create(email=email, token=token, company=company)
                    # Send invite
                    send_mail(
                        subject='You are invited to join a company on UK Address Splitter',
                        message=f'{request.user.get_full_name()} ({request.user.email}) has invited you to join {company.name}. Click this link to sign up: {request.build_absolute_uri(reverse("onboard_billing_admin", args=[token]))}',
                        from_email='no-reply@ukaddresssplitter.com',
                        recipient_list=[email],
                    )
                    invited.append((email, 'invited'))
        # Instead of rendering success, redirect to billing
        return redirect('billing')
    # Also update "Do this later" button in template to point to billing instead of /
    return render(request, 'parser/company_invite_members.html', {'success': False})

@login_required
def profile(request):
    profile = getattr(request.user, 'userprofile', None)
    company = profile.company if profile and profile.company else None
    is_company_admin = False
    company_overage = None
    company_subscription = None
    company_plan_label = None
    company_has = bool(company)
    plan_included = 0
    total_splits_this_month = 0
    overage_used_this_month = 0
    overage_error = None
    plan_map = {'starter': 1000, 'pro': 5000, 'corporate': 15000}
    if company:
        is_company_admin = (company.created_by == request.user)
        company_overage = company.max_monthly_overage
        company_subscription = company.subscription_type or 'none'
        plan_labels = {'starter': 'Starter', 'pro': 'Pro', 'corporate': 'Corporate'}
        company_plan_label = plan_labels.get(company_subscription, 'No Subscription')
        from .models import CompanyUsage, UserProfile
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        total_splits_this_month = CompanyUsage.objects.filter(company=company, timestamp__gte=month_start).aggregate(total=models.Sum('n_addresses'))['total'] or 0
        included_for_plan = plan_map.get(company_subscription, 0)
        overage_used_this_month = max(total_splits_this_month - included_for_plan, 0)
        # Company members info
        company_members = UserProfile.objects.filter(company=company).select_related('user')
        members_info = []
        for member in company_members:
            member_month_usage = CompanyUsage.objects.filter(company=company, user=member.user, timestamp__gte=month_start).aggregate(total=models.Sum('n_addresses'))['total'] or 0
            members_info.append({
                'email': member.user.email,
                'user_id': member.user.id,
                'is_self': member.user == request.user,
                'is_admin': is_company_admin and member.user == request.user, # Only current user is admin for now
                'usage_this_month': member_month_usage,
                'first_last': f'{member.user.first_name} {member.user.last_name}'.strip()
            })
    else:
        included_for_plan = 0
        members_info = []

    # Remove member logic
    if request.method == 'POST' and is_company_admin and 'remove_member' in request.POST:
        remove_user_id = int(request.POST.get('remove_member'))
        from django.contrib.auth.models import User
        u = User.objects.filter(id=remove_user_id).first()
        if u and u != request.user and hasattr(u, 'userprofile') and u.userprofile.company == company:
            u.userprofile.company = None
            u.userprofile.save()
            # Refresh members_info after removal
            company_members = UserProfile.objects.filter(company=company).select_related('user')
            members_info = []
            for member in company_members:
                member_month_usage = CompanyUsage.objects.filter(company=company, user=member.user, timestamp__gte=month_start).aggregate(total=models.Sum('n_addresses'))['total'] or 0
                members_info.append({
                    'email': member.user.email,
                    'user_id': member.user.id,
                    'is_self': member.user == request.user,
                    'is_admin': is_company_admin and member.user == request.user,
                    'usage_this_month': member_month_usage,
                    'first_last': f'{member.user.first_name} {member.user.last_name}'.strip()
                })

    # Overage update logic (now uses overage_used_this_month)
    new_member_feedback = None
    if request.method == 'POST' and is_company_admin:
        # Remove member
        if 'remove_member' in request.POST:
            remove_user_id = int(request.POST.get('remove_member'))
            from django.contrib.auth.models import User
            u = User.objects.filter(id=remove_user_id).first()
            if u and u != request.user and hasattr(u, 'userprofile') and u.userprofile.company == company:
                u.userprofile.company = None
                u.userprofile.save()
                new_member_feedback = f"Removed {u.email} from the company."
                # Refresh members_info after removal
                company_members = UserProfile.objects.filter(company=company).select_related('user')
                members_info = []
                for member in company_members:
                    member_month_usage = CompanyUsage.objects.filter(company=company, user=member.user, timestamp__gte=month_start).aggregate(total=models.Sum('n_addresses'))['total'] or 0
                    members_info.append({
                        'email': member.user.email,
                        'user_id': member.user.id,
                        'is_self': member.user == request.user,
                        'is_admin': is_company_admin and member.user == request.user,
                        'usage_this_month': member_month_usage,
                        'first_last': f'{member.user.first_name} {member.user.last_name}'.strip()
                    })
        # Add member
        elif 'add_member_email' in request.POST:
            add_email = request.POST.get('add_member_email','').strip().lower()
            from django.contrib.auth.models import User
            if add_email and add_email != request.user.email:
                user = User.objects.filter(email=add_email).first()
                if user:
                    if hasattr(user, 'userprofile') and user.userprofile.company == company:
                        new_member_feedback = f"{add_email} is already a member."
                    elif CompanyInvite.objects.filter(email=add_email, company=company, accepted=False).exists():
                        new_member_feedback = f"An invite to {add_email} is already pending."
                    else:
                        CompanyInvite.objects.create(email=add_email, company=company, invited_by=request.user)
                        new_member_feedback = f"Invite sent to {add_email}."
                else:
                    new_member_feedback = "This email must sign up before you can invite them."
            else:
                new_member_feedback = "Please enter a valid email address that is not your own."
        # Overage cap update
        elif 'max_monthly_overage' in request.POST:
            new_overage = request.POST.get('max_monthly_overage')
            try:
                new_overage_val = int(float(new_overage))
                if new_overage_val < overage_used_this_month:
                    overage_error = f"Cannot set cap below overage already used this month: {overage_used_this_month}."
                elif new_overage_val >= 0:
                    company.max_monthly_overage = new_overage_val
                    company.save()
                    company_overage = company.max_monthly_overage
            except Exception:
                overage_error = "Invalid overage entry."

    # On POST: handle accept/decline invite
    pending_invites = CompanyInvite.objects.filter(email=request.user.email, accepted=False, declined=False).filter(company__isnull=False)
    accept_invite_feedback = None
    if request.method == 'POST' and 'accept_member_invite' in request.POST:
        invite_id = request.POST.get('accept_member_invite')
        invite = CompanyInvite.objects.filter(id=invite_id, email=request.user.email, accepted=False).first()
        if invite:
            profile.company = invite.company
            profile.save()
            invite.accepted = True
            invite.save()
            accept_invite_feedback = f"Joined {invite.company.name}."
            pending_invites = CompanyInvite.objects.filter(email=request.user.email, accepted=False, declined=False).filter(company__isnull=False)
    elif request.method == 'POST' and 'decline_member_invite' in request.POST:
        invite_id = request.POST.get('decline_member_invite')
        invite = CompanyInvite.objects.filter(id=invite_id, email=request.user.email, accepted=False, declined=False).first()
        if invite:
            invite.declined = True
            invite.save()
            accept_invite_feedback = "Invite declined."
            pending_invites = CompanyInvite.objects.filter(email=request.user.email, accepted=False, declined=False).filter(company__isnull=False)

    context = {
        'email': request.user.email,
        'first_name': request.user.first_name,
        'last_name': request.user.last_name,
        'company_name': company.name if company else None,
        'company_id': company.company_id if company else None,
        'company_has': company_has,
        'is_company_admin': is_company_admin,
        'company_overage': company_overage,
        'company_subscription': company_subscription,
        'company_plan_label': company_plan_label,
        'last_login': request.user.last_login,
        'overage_used_this_month': overage_used_this_month,
        'overage_error': overage_error,
        'total_splits_this_month': total_splits_this_month,
        'included_for_plan': included_for_plan,
        'company_members_info': members_info,
    }
    context['new_member_feedback'] = new_member_feedback
    context['pending_member_invites'] = pending_invites
    context['accept_invite_feedback'] = accept_invite_feedback
    return render(request, 'parser/profile.html', context)

def billing(request):
    plans = [
        {'n_addresses': 1000, 'price': 35, 'overage_p': 6, 'tier_name': 'Starter'},
        {'n_addresses': 5000, 'price': 120, 'overage_p': 4, 'tier_name': 'Pro'},
        {'n_addresses': 15000, 'price': 280, 'overage_p': 2, 'tier_name': 'Corporate'},
    ]
    for plan in plans:
        plan['overage_text'] = f"Overage charged at {plan['overage_p']}p per address"
    return render(request, 'parser/billing.html', {'plans': plans})

@login_required
def set_overage_cap(request):
    plan_map = {
        'starter': {'size': 1000, 'rate_p': 6},
        'pro': {'size': 5000, 'rate_p': 4},
        'corporate': {'size': 15000, 'rate_p': 2}
    }
    plan = request.GET.get('plan') or request.session.get('plan')
    if plan not in plan_map:
        return redirect('billing')
    if request.method == 'POST':
        if 'do_later' in request.POST:
            cap = plan_map[plan]['size']
        else:
            cap = request.POST.get('max_overage')
            try:
                cap = int(float(cap))
                if cap < 0:
                    raise ValueError
            except (ValueError, TypeError):
                return render(request, 'parser/set_overage_cap.html', {'plan': plan, 'plan_info': plan_map[plan], 'error': 'Please enter a valid positive number.'})
        company = request.user.userprofile.company
        if company:
            company.max_monthly_overage = cap
            company.save()
        return redirect('billing')
    request.session['plan'] = plan
    return render(request, 'parser/set_overage_cap.html', {'plan': plan, 'plan_info': plan_map[plan]})

def beta_access(request):
    next_url = request.GET.get('next', '/')
    error = None
    if request.method == 'POST':
        submitted_pin = request.POST.get('access_pin', '').strip()
        if submitted_pin == getattr(settings, 'LAUNCH_ACCESS_PIN', '9021'):
            response = HttpResponseRedirect(next_url)
            response.set_cookie('beta_access_granted', 'true', max_age=60*60*12)  # 12 hour session
            return response
        else:
            error = 'Incorrect PIN. If you need access, please contact Alfie.'
    return render(request, 'parser/beta_access.html', {'error': error, 'next': next_url})

class EnforceEmailVerifiedMiddleware(MiddlewareMixin):
    def process_request(self, request):
        # Bypass for staff/admin or /admin/ URLs
        if request.user.is_authenticated:
            if request.user.is_staff or request.user.is_superuser:
                return None
            path = request.path
            if path.startswith('/admin/'):
                return None
            try:
                emailaddress_qs = getattr(request.user, 'emailaddress_set', None)
                if emailaddress_qs and not emailaddress_qs.filter(verified=True).exists():
                    # Only allow specific URLs before verification
                    if not path.startswith('/accounts/verify-email') \
                            and not path.startswith('/accounts/resend-code') \
                            and not path.startswith('/accounts/logout'):
                        return redirect('verify_email_code')
            except Exception as e:
                # Handle unexpected lookup/DB error: redirect with diagnostic code
                from django.contrib import messages
                messages.error(request, 'ERR-VER-001: Unexpected verification state error. Please contact support@ukaddresssplitter.com and mention this code.')
                return redirect('verify_email_code')
        return None