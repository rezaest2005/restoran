from django.apps import AppConfig


class BizsuiteConfig(AppConfig):
    name = 'bizsuite'
    label = 'bizsuite'

    def ready(self):
        # registers the club background-job handlers (club_daily, club_send_message)
        from . import club_campaigns  # noqa: F401
