from django.core.management.base import BaseCommand

from bizsuite.club_campaigns import ensure_daily_scheduled, run_daily


class Command(BaseCommand):
    help = "Customer club daily run: expire points, re-check tiers, run birthday/anniversary/inactivity campaigns."

    def add_arguments(self, parser):
        parser.add_argument("--schedule", action="store_true",
                            help="Only make sure a club_daily job is queued for the job worker.")

    def handle(self, *args, **opts):
        if opts["schedule"]:
            job = ensure_daily_scheduled()
            self.stdout.write(f"queued: {job}")
            return
        for biz_id, res in run_daily().items():
            self.stdout.write(f"business {biz_id}: {res}")
