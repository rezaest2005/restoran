"""
Card terminal bridge SIMULATOR (dev / test tool - never deploy it).

Speaks the bridge protocol the application expects (docs/CARD_READER.md); needs only the Python standard library.

    python mock_card_reader.py                          # http://127.0.0.1:8080, approves after 3 seconds
    python mock_card_reader.py --port 8491 --mode decline
    python mock_card_reader.py --mode silent            # never answers (timeout / unknown-outcome tests)

Behaviour can be switched while running (JSON body or query string):
    POST /sim/behavior   {"mode": "approve|decline|cancelled|silent|crash|error500|wrong_amount|wrong_rrn", "delay": 3}
    POST /sim/resolve    {"rrn": "...", "status": "approved|declined"}   # what a LATER status query will answer
    POST /sim/reset      forget everything          GET /sim/state    what was received (amounts!), behaviour
A single call can also be steered with  POST /api/payment?sim=decline&delay=1.

Protocol:
    POST /api/payment         {amount, rrn, description} -> {success, status, trace_number, ref_number, card_number, message}
    POST /api/payment/cancel  {rrn}                      -> {success, message}
    GET  /api/payment/status?rrn=                        -> same shape as the payment answer
The simulator answers with a FULL card number on purpose, so the application's masking can be seen working.
"""
import argparse
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

MODES = ("approve", "decline", "cancelled", "silent", "crash", "error500", "wrong_amount", "wrong_rrn")
FAKE_PAN = "6219861012345678"


class Sim:
    def __init__(self, mode="approve", delay=3.0, unit="rial", quiet=False):
        self.lock = threading.Lock()
        self.mode, self.delay, self.unit, self.quiet = mode, float(delay), unit, quiet
        self.trace = 100000
        self.reset()

    def reset(self):
        with self.lock:
            self.payments = {}      # rrn -> record
            self.events = {}        # rrn -> threading.Event (a cancel wakes a waiting payment)
            self.requests = []      # every payment request received (amount, rrn)
            self.final = {}         # rrn -> status answered by a later status query

    def say(self, text):
        if not self.quiet:
            print(text, flush=True)

    def next_trace(self):
        with self.lock:
            self.trace += 1
            return self.trace


def _answer(rec, status, message):
    ok = status == "approved"
    body = {"success": ok, "status": status, "message": message, "rrn": rec["rrn"], "amount": rec["amount"]}
    if ok:
        body.update(trace_number=rec["trace"], ref_number=rec["ref"], card_number=FAKE_PAN)
    return body


def _public(rec):
    return {k: v for k, v in rec.items() if k != "waiting"}


def make_handler(sim: Sim):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        # -- helpers
        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")   # Chrome: https page -> local network
            self.send_header("Access-Control-Max-Age", "600")

        def _send(self, code, body):
            raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self._cors()
            self.end_headers()
            self.wfile.write(raw)

        def _json(self):
            n = int(self.headers.get("Content-Length") or 0)
            try:
                return json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
            except ValueError:
                return {}

        # -- verbs
        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            u = urlparse(self.path)
            q = parse_qs(u.query)
            if u.path == "/api/payment/status":
                rrn = (q.get("rrn") or [""])[0]
                if rrn == "__ping__":
                    return self._send(200, {"success": False, "status": "not_found", "message": "simulator ready"})
                rec = sim.payments.get(rrn)
                if rec is None:
                    return self._send(200, {"success": False, "status": "not_found",
                                            "message": "تراکنشی با این شناسه نیست"})
                final = sim.final.get(rrn) or rec.get("status")
                if final in ("approved", "declined", "cancelled"):
                    msg = {"approved": "پرداخت موفق", "declined": "رد شد", "cancelled": "لغو شد"}[final]
                    return self._send(200, _answer(rec, final, msg))
                return self._send(200, {"success": False, "status": "pending", "rrn": rrn,
                                        "message": "منتظر کارت مشتری"})
            if u.path == "/sim/state":
                return self._send(200, {"mode": sim.mode, "delay": sim.delay, "unit": sim.unit,
                                        "requests": sim.requests,
                                        "payments": {k: _public(v) for k, v in sim.payments.items()}})
            self._send(404, {"success": False, "message": "not found"})

        def do_POST(self):
            u = urlparse(self.path)
            q = parse_qs(u.query)
            body = self._json()
            if u.path == "/api/payment":
                return self._pay(body, q)
            if u.path == "/api/payment/cancel":
                rrn = str(body.get("rrn") or "")
                targets = [rrn] if rrn else list(sim.events)
                hit = False
                for r in targets:
                    ev, rec = sim.events.get(r), sim.payments.get(r)
                    if ev is not None and rec is not None and rec["status"] == "pending":
                        rec["status"] = "cancelled"
                        ev.set()
                        hit = True
                sim.say("  [دستگاه] لغو از سمت صندوق" + (" - تراکنش در انتظار لغو شد" if hit else ""))
                return self._send(200, {"success": True, "message": "لغو ارسال شد"})
            if u.path == "/sim/behavior":
                mode = body.get("mode") or (q.get("mode") or [sim.mode])[0]
                if mode not in MODES:
                    return self._send(400, {"success": False, "message": "mode must be one of " + ", ".join(MODES)})
                sim.mode = mode
                if "delay" in body or "delay" in q:
                    sim.delay = float(body.get("delay", (q.get("delay") or [sim.delay])[0]))
                sim.say(f"  [شبیه‌ساز] رفتار: {sim.mode}، تأخیر {sim.delay} ثانیه")
                return self._send(200, {"success": True, "mode": sim.mode, "delay": sim.delay})
            if u.path == "/sim/resolve":
                rrn = str(body.get("rrn") or "")
                sim.final[rrn] = str(body.get("status") or "approved")
                return self._send(200, {"success": True})
            if u.path == "/sim/reset":
                sim.reset()
                return self._send(200, {"success": True})
            self._send(404, {"success": False, "message": "not found"})

        # -- payment
        def _pay(self, body, q):
            mode = (q.get("sim") or [sim.mode])[0]
            delay = float((q.get("delay") or [sim.delay])[0])
            rrn = str(body.get("rrn") or "")
            try:
                amount = int(body.get("amount"))
            except (TypeError, ValueError):
                return self._send(400, {"success": False, "status": "declined", "message": "مبلغ نامعتبر"})
            if amount <= 0 or not rrn:
                return self._send(400, {"success": False, "status": "declined", "message": "درخواست نامعتبر"})
            with sim.lock:
                sim.requests.append({"amount": amount, "rrn": rrn, "mode": mode})
                old = sim.payments.get(rrn)
            if old is not None and old["status"] == "approved":      # same rrn again: never charge twice
                return self._send(200, _answer(old, "approved", "پرداخت موفق (تکراری)"))
            trace = sim.next_trace()
            rec = {"rrn": rrn, "amount": amount, "status": "pending", "trace": str(trace), "ref": str(trace + 1000)}
            sim.payments[rrn] = rec
            ev = sim.events[rrn] = threading.Event()
            sim.say("")
            sim.say("=" * 56)
            sim.say(f"  [دستگاه] مبلغ روی دستگاه: {amount:,} ({sim.unit})   شناسه: {rrn}")
            sim.say(f"  [دستگاه] رفتار شبیه‌سازی: {mode}")
            sim.say("=" * 56)
            if mode == "crash":                   # drop the connection without any answer
                self.close_connection = True
                try:
                    self.connection.shutdown(2)
                except OSError:
                    pass
                return
            if mode == "error500":
                return self._send(500, {"success": False, "message": "internal error"})
            if mode == "silent":
                ev.wait(600)                      # never answers (a /sim/resolve changes what a status query says)
                if rec["status"] == "cancelled":
                    return self._send(200, _answer(rec, "cancelled", "لغو شد"))
                return
            if ev.wait(delay):                    # woken by a cancel
                return self._send(200, _answer(rec, "cancelled", "لغو شد"))
            if mode == "decline":
                rec["status"] = "declined"
                return self._send(200, _answer(rec, "declined", "موجودی کافی نیست"))
            if mode == "cancelled":
                rec["status"] = "cancelled"
                return self._send(200, _answer(rec, "cancelled", "مشتری انصراف داد"))
            rec["status"] = "approved"
            out = _answer(rec, "approved", "پرداخت موفق")
            if mode == "wrong_amount":
                out["amount"] = amount + 10
            if mode == "wrong_rrn":
                out["rrn"] = "someone-else"
            sim.say(f"  [دستگاه] تأیید شد - پیگیری {trace}")
            return self._send(200, out)

    return Handler


def start_in_thread(host="127.0.0.1", port=0, **kw):
    """For tests: -> (server, sim, base_url). Stop with server.shutdown(); server.server_close()."""
    kw.setdefault("quiet", True)
    sim = Sim(**kw)
    srv = ThreadingHTTPServer((host, port), make_handler(sim))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, sim, f"http://{host}:{srv.server_address[1]}"


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Card terminal bridge simulator")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--mode", default="approve", choices=MODES)
    ap.add_argument("--delay", type=float, default=3.0, help="seconds before approve/decline")
    ap.add_argument("--unit", default="rial", choices=("rial", "toman"), help="only used for the console display")
    a = ap.parse_args()
    sim = Sim(a.mode, a.delay, a.unit)
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(sim))
    srv.daemon_threads = True
    print(f"  شبیه‌ساز کارتخوان - http://{a.host}:{a.port}   رفتار: {a.mode}   تأخیر: {a.delay}s", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
