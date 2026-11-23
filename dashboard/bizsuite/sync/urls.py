from django.urls import path

from . import views

urlpatterns = [
    path("pull/", views.pull, name="sync_pull"),
    path("push/", views.push, name="sync_push"),
    path("status/", views.status, name="sync_status"),
    path("settings/", views.settings_view, name="sync_settings"),
]
