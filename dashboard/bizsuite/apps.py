from django.apps import AppConfig


class BizsuiteConfig(AppConfig):
    name = 'bizsuite'
    label = 'bizsuite'

    def ready(self):
        # registers the club background-job handlers (club_daily, club_send_message)
        from . import club_campaigns  # noqa: F401
        # local-first sync: change-log models + signal hooks (new package, observes only)
        from .sync import models as _sync_models, signals as _sync_signals  # noqa: F401
