from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings

def send_verification_email(user, code):
    subject = "Your Address Splitter Verification Code"
    context = {
        'first_name': user.first_name,
        'code': code,
    }
    html_content = render_to_string('account/email_verification_code.html', context)
    msg = EmailMultiAlternatives(subject, f"Your verification code is: {code}", to=[user.email])
    msg.attach_alternative(html_content, "text/html")
    msg.send()

def send_password_reset_code(user, code):
    subject = "Reset your Address Splitter password"
    context = {
        'first_name': user.first_name,
        'code': code,
    }
    html_content = render_to_string('account/email_reset_code.html', context)
    msg = EmailMultiAlternatives(subject, f"Your password reset code is: {code}", to=[user.email])
    msg.attach_alternative(html_content, "text/html")
    msg.send()
