from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.db import OperationalError
from django.test import TestCase
from django.utils import timezone

from bizsuite import jobs
from bizsuite.models import BackgroundJob, Business, JournalEntry, SalesInvoice


class AppInfoAndHealthTests(TestCase):
    def test_app_info_is_public_and_neutral(self):
        res = self.client.get("/api/app/info/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["name"], "Business Suite")
        self.assertEqual(data["name_fa"], "سامانه جامع کسب‌وکار")
        self.assertIn("version", data)

    def test_health_ok(self):
        res = self.client.get("/api/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "ok")

    def test_health_503_when_db_down(self):
        with mock.patch("bizsuite.views.system.connection") as conn:
            conn.cursor.side_effect = OperationalError("db down")
            res = self.client.get("/api/health/")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["status"], "error")
        self.assertNotIn("db down", res.content.decode())

    def test_health_rejects_post(self):
        self.assertEqual(self.client.post("/api/health/").status_code, 405)


class JobQueueTests(TestCase):
    def setUp(self):
        self.calls = []
        self._orig = dict(jobs._REGISTRY)
        jobs._REGISTRY["t_ok"] = lambda p: self.calls.append(p)

        def boom(p):
            raise RuntimeError("boom")

        jobs._REGISTRY["t_fail"] = boom

    def tearDown(self):
        jobs._REGISTRY.clear()
        jobs._REGISTRY.update(self._orig)

    def test_job_claimed_exactly_once(self):
        jobs.enqueue("t_ok", {"a": 1})
        first = jobs.run_next()
        second = jobs.run_next()
        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertEqual(self.calls, [{"a": 1}])
        first.refresh_from_db()
        self.assertEqual(first.status, BackgroundJob.DONE)
        self.assertEqual(first.attempts, 1)

    def test_future_job_not_claimed(self):
        jobs.enqueue("t_ok", delay_seconds=3600)
        self.assertIsNone(jobs.run_next())
        self.assertEqual(self.calls, [])

    def test_failure_schedules_retry_then_fails_permanently(self):
        job = jobs.enqueue("t_fail", max_attempts=2)
        jobs.run_next()
        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.PENDING)
        self.assertEqual(job.attempts, 1)
        self.assertIn("boom", job.last_error)
        self.assertGreater(job.run_after, timezone.now())
        self.assertIsNone(jobs.run_next())  # backoff not elapsed

        BackgroundJob.objects.filter(pk=job.pk).update(run_after=timezone.now())
        jobs.run_next()
        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.FAILED)
        self.assertEqual(job.attempts, 2)

    def test_unknown_kind_fails_immediately(self):
        job = jobs.enqueue("nope")
        jobs.run_next()
        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.FAILED)

    def test_stale_running_job_is_reclaimed(self):
        job = jobs.enqueue("t_ok")
        BackgroundJob.objects.filter(pk=job.pk).update(
            status=BackgroundJob.RUNNING,
            locked_at=timezone.now() - jobs.LOCK_TIMEOUT - timedelta(seconds=5),
        )
        self.assertIsNotNone(jobs.run_next())
        self.assertEqual(len(self.calls), 1)

    def test_run_jobs_command_once(self):
        jobs.enqueue("t_ok", {"x": 2})
        out = StringIO()
        call_command("run_jobs", "--once", stdout=out)
        self.assertEqual(self.calls, [{"x": 2}])
        self.assertEqual(BackgroundJob.objects.get().status, BackgroundJob.DONE)


class PostAccountingJobTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.biz = Business.objects.create(name="کسب‌وکار تست", slug="job-biz")
        cls.inv = SalesInvoice.all_objects.create(
            business=cls.biz, invoice_number="J1", customer_name="x",
            total=1000, paid_amount=1000, payment_method="cash",
        )

    def test_failed_posting_is_queued_and_retried(self):
        from bizsuite import accounting_posting as ap

        def failing(obj, user=None):
            raise RuntimeError("ledger down")

        failing.__name__ = "post_sales_invoice"
        self.assertIsNone(ap.safe_post(failing, self.inv))
        job = BackgroundJob.objects.get(kind="post_accounting")
        self.assertEqual(job.payload["pk"], self.inv.pk)
        self.assertEqual(job.payload["model"], "SalesInvoice")
        # duplicate failure does not enqueue twice
        ap.safe_post(failing, self.inv)
        self.assertEqual(BackgroundJob.objects.filter(kind="post_accounting").count(), 1)

        BackgroundJob.objects.update(run_after=timezone.now())
        jobs.run_next()
        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.DONE)
        self.assertTrue(JournalEntry.all_objects.filter(
            business=self.biz, source_type="sales_invoice", source_id=self.inv.pk).exists())
