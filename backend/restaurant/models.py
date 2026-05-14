from django.db import models

class Category(models.Model):
    name = models.CharField(max_length=200)
    image = models.ImageField(upload_to='categories/', blank=True)
    is_active = models.BooleanField(default=True)
    order = models.IntegerField(default=0)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['order']
        verbose_name = 'دسته‌بندی'
        verbose_name_plural = 'دسته‌بندی‌ها'


class Food(models.Model):
    category = models.ForeignKey(Category, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='foods/', blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=0)
    discount = models.IntegerField(default=0)
    is_available = models.BooleanField(default=True)
    is_special = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def discounted_price(self):
        if self.discount > 0:
            return int(self.price - (self.price * self.discount / 100))
        return int(self.price)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'غذا'
        verbose_name_plural = 'غذاها'


class Table(models.Model):
    number = models.IntegerField()
    capacity = models.IntegerField()
    is_reserved = models.BooleanField(default=False)

    def __str__(self):
        return f"میز {self.number}"

    class Meta:
        verbose_name = 'میز'
        verbose_name_plural = 'میزها'


class Reservation(models.Model):
    customer_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20)
    table = models.ForeignKey(Table, on_delete=models.CASCADE)
    date = models.DateField()
    time = models.TimeField()
    guests = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.customer_name} - میز {self.table.number}"

    class Meta:
        verbose_name = 'رزرو'
        verbose_name_plural = 'رزروها'


class Order(models.Model):
    STATUS_CHOICES = [
        ('pending', 'در انتظار'),
        ('preparing', 'در حال آماده‌سازی'),
        ('ready', 'آماده'),
        ('delivered', 'تحویل داده شده'),
    ]
    customer_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20)
    table = models.ForeignKey(Table, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    total_price = models.DecimalField(max_digits=10, decimal_places=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"سفارش {self.id} - {self.customer_name}"

    class Meta:
        verbose_name = 'سفارش'
        verbose_name_plural = 'سفارشات'


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    food = models.ForeignKey(Food, on_delete=models.CASCADE)
    quantity = models.IntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=0)

    def __str__(self):
        return f"{self.food.name} x {self.quantity}"

    class Meta:
        verbose_name = 'آیتم سفارش'
        verbose_name_plural = 'آیتم‌های سفارش'