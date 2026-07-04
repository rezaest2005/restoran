from flask import Flask, request, jsonify

app = Flask(__name__)
trace_counter = [100000]

@app.route('/api/payment', methods=['POST'])
def pay():
    data = request.json
    amount = data.get('amount', 0)
    order_id = data.get('rrn', '?')
    trace_counter[0] += 1
    print('')
    print('=' * 50)
    print(f'  ????? #{order_id}')
    print(f'  ????: {amount:,} ?????')
    print(f'  ????? ??????: {trace_counter[0]}')
    print('=' * 50)
    print('')
    return jsonify({
        'success': True,
        'status': 'approved',
        'trace_number': str(trace_counter[0]),
        'ref_number': str(trace_counter[0] + 1000),
        'card_number': '6219861012345678',
        'message': '?????? ????'
    })

@app.route('/api/payment/cancel', methods=['POST'])
def cancel():
    return jsonify({'success': True})

if __name__ == '__main__':
    print('  ???????? ???? ???? ?? - http://127.0.0.1:8080')
    app.run(host='0.0.0.0', port=8080, debug=False)
