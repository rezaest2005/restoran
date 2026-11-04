import signal
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from bizsuite import jobs


class Command(BaseCommand):
    help = "Worker loop: processes the BackgroundJob queue."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true",
                            help="Drain currently due jobs, then exit.")
        parser.add_argument("--interval", type=float, default=5.0,
                            help="Seconds to sleep when the queue is empty.")

    def handle(self, *args, **opts):
        stop = {"flag": False}

        def _stop(*_):
            stop["flag"] = True

        for sig in () if opts["once"] else (signal.SIGINT, signal.SIGTERM):
            try:
                signal.signal(sig, _stop)
            except ValueError:  # not the main thread (e.g. under tests)
                pass

        self.stdout.write("worker started")
        while not stop["flag"]:
            if not opts["once"]:
                close_old_connections()
            try:
                job = jobs.run_next()
            except Exception as exc:  # DB hiccup: keep the worker alive
                if opts["once"]:
                    raise
                self.stderr.write(f"worker error: {exc}")
                job = None
            if job is not None:
                self.stdout.write(str(job))
                continue
            if opts["once"]:
                break
            time.sleep(opts["interval"])
        self.stdout.write("worker stopped")
