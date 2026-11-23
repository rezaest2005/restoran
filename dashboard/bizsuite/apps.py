from django.apps import AppConfig


class BizsuiteConfig(AppConfig):
    name = 'bizsuite'
    label = 'bizsuite'

    def ready(self):
        # registers the club background-job handlers (club_daily, club_send_message)
        from . import club_campaigns  # noqa: F401
        # each module subscribes its own handlers to the domain events (see events.py / module_registry.EVENTS);
        # subscription order = the order the old direct calls ran in (club points, accounting, dispatch)
        from . import accounting_posting, club_services, delivery_services
        club_services.register_events()
        accounting_posting.register_events()
        delivery_services.register_events()
        # local-first sync: change-log models + signal hooks (new package, observes only)
        from .sync import models as _sync_models, signals as _sync_signals  # noqa: F401
