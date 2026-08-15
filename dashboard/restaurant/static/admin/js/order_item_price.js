(function() {
    function waitForJQuery(callback) {
        if (typeof django !== 'undefined' && django.jQuery) {
            callback(django.jQuery);
        } else {
            setTimeout(function() { waitForJQuery(callback); }, 100);
        }
    }

    waitForJQuery(function($) {
        var lastFoodValues = {};
        var lastQtyValues = {};

        function updatePrice(row, foodId, quantity) {
            var priceField = row.find('td.field-price');

            $.ajax({
                url: '/api/dictionary/food-menu/',
                method: 'GET',
                success: function(data) {
                    var foods = data.items || data;
                    var food = null;
                    for (var i = 0; i < foods.length; i++) {
                        if (String(foods[i].id) === String(foodId)) { food = foods[i]; break; }
                    }
                    if (food) {
                        var unitPrice = parseFloat(food.discounted_price || food.price || 0);
                        var total = unitPrice * (quantity || 1);
                        priceField.text(
                            Math.round(total).toLocaleString('fa-IR') + ' تومان'
                        );
                    }
                }
            });
        }

        setInterval(function() {
            // مانیتور کردن انتخاب غذا
            $('select[name$="-food"]').each(function() {
                var id = this.id;
                var val = this.value;

                if (val && val !== lastFoodValues[id]) {
                    lastFoodValues[id] = val;
                    var row = $(this).closest('tr');
                    var qtyInput = row.find('input[name$="-quantity"]');
                    var quantity = parseInt(qtyInput.val()) || 1;
                    updatePrice(row, val, quantity);
                }
            });

            // مانیتور کردن تغییر تعداد
            $('input[name$="-quantity"]').each(function() {
                var id = this.id;
                var val = this.value;

                if (val !== lastQtyValues[id]) {
                    lastQtyValues[id] = val;
                    var row = $(this).closest('tr');
                    var foodSelect = row.find('select[name$="-food"]');
                    var foodId = foodSelect.val();
                    var quantity = parseInt(val) || 1;

                    if (foodId) {
                        updatePrice(row, foodId, quantity);
                    }
                }
            });
        }, 500);
    });
})();
