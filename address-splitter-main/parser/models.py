from django.db import models
from django.contrib.auth.models import User
import uuid
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db.models.signals import pre_save
from django.utils import timezone
import random

# Create your models here.

class Company(models.Model):
    name = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    max_monthly_overage = models.IntegerField(null=True, blank=True, help_text="Maximum overage addresses per month.")
    company_id = models.IntegerField(unique=True, null=True, blank=True, help_text="Public support Company ID")
    SUBS_CHOICES = [
        ("starter", "Starter"),
        ("pro", "Pro"),
        ("corporate", "Corporate")
    ]
    subscription_type = models.CharField(max_length=20, choices=SUBS_CHOICES, blank=True, null=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='companies_created')  # admin/owner

    def save(self, *args, **kwargs):
        if self.company_id is None:
            last_id = Company.objects.all().aggregate(models.Max('company_id'))['company_id__max']
            self.company_id = (last_id + 1) if last_id and last_id >= 2003 else 2003
        super().save(*args, **kwargs)
    def __str__(self):
        return f"{self.name} (ID: {self.company_id})"

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    company = models.ForeignKey(Company, null=True, blank=True, on_delete=models.CASCADE)
    def __str__(self):
        return f"{self.user.username} ({self.company.name if self.company else 'No Company'})"

class CompanyInvite(models.Model):
    email = models.EmailField()
    token = models.CharField(max_length=44, unique=True, default=uuid.uuid4)
    company = models.ForeignKey('Company', null=True, blank=True, on_delete=models.CASCADE)
    invited_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='sent_invites')
    created_at = models.DateTimeField(auto_now_add=True)
    accepted = models.BooleanField(default=False)
    declined = models.BooleanField(default=False)  # new for robust filtering

    def __str__(self):
        return f"Invite {self.email} for {self.company.name if self.company else 'New Company'} (by {self.invited_by.email if self.invited_by else '?'}, {'Accepted' if self.accepted else 'Declined' if self.declined else 'Pending'})"

class CompanyUsage(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)  # new: track which user did the split
    timestamp = models.DateTimeField(auto_now_add=True)
    n_addresses = models.IntegerField()
    def __str__(self):
        return f"{self.company.name}: {self.n_addresses} on {self.timestamp:%Y-%m-%d} by {self.user.email if self.user else '?'}"

class EmailVerificationCode(models.Model):
    PURPOSE_CHOICES = [
        ("verify", "Email Verification"),
        ("reset", "Password Reset"),
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=16, choices=PURPOSE_CHOICES, default="verify")
    expiry = models.DateTimeField()
    last_sent = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"Code {self.code} for {self.user.email} ({self.purpose}, expires {self.expiry:%Y-%m-%d %H:%M})"

    def is_expired(self):
        return timezone.now() > self.expiry

    @staticmethod
    def generate_code():
        return f"{random.randint(100000, 999999)}"

# Optionally, register for admin site
# (All admin.site.register and from django.contrib import admin have been removed as required)

@receiver(post_save, sender=User)
def create_userprofile(sender, instance, created, **kwargs):
    if created and not hasattr(instance, 'userprofile'):
        UserProfile.objects.create(user=instance, company=None)

@receiver(pre_save, sender=User)
def assign_unique_username(sender, instance, **kwargs):
    if not instance.username:
        instance.username = str(uuid.uuid4())
