# --- مرحله ۱: انتخاب ایمیج پایه ---
# از پایتون نسخه‌ی سبک (slim) استفاده می‌کنیم که حجمش کمتره
FROM python:3.12-slim

# --- مرحله ۲: تنظیمات محیطی پایتون ---
# جلوگیری از ساخت فایل‌های .pyc اضافی
ENV PYTHONDONTWRITEBYTECODE=1
# لاگ‌ها بلافاصله نمایش داده بشن (نه بافر شده)
ENV PYTHONUNBUFFERED=1

# --- مرحله ۳: پوشه‌ی کاری داخل کانتینر ---
WORKDIR /app

# --- مرحله ۴: نصب وابستگی‌های سیستمی (در صورت نیاز) ---
# اگه پکیج‌هایی مثل psycopg2 یا Pillow داری این خط لازمه، برای SQLite ساده معمولاً لازم نیست
# RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# --- مرحله ۵: نصب پکیج‌های پایتون ---
# اول فقط requirements.txt رو کپی می‌کنیم تا کش داکر بهینه بمونه
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- مرحله ۶: کپی کل کد پروژه ---
COPY . .

# --- مرحله ۷: باز کردن پورت ---
EXPOSE 8000

# --- مرحله ۸: دستور اجرای برنامه هنگام روشن شدن کانتینر ---
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
