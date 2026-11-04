from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Removes orphaned rows whose foreign keys point to non-existent records."

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            # Clean orphaned recipes
            cursor.execute(
                "DELETE FROM bizsuite_recipe "
                "WHERE business_id NOT IN (SELECT id FROM bizsuite_business)"
            )
            deleted = cursor.rowcount
            if deleted:
                self.stdout.write(
                    self.style.WARNING(f"Removed {deleted} orphaned recipe row(s).")
                )
            else:
                self.stdout.write(self.style.SUCCESS("No orphaned recipe rows found."))
