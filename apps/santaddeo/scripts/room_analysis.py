pdf = {2: 2310.39, 3: 3322.69, 4: 2430.42, 5: 2890.32, 6: 2823.87, 7: 2905.77,
    8: 2432.05, 10: 2478.14, 11: 2260.56, 12: 2426.26, 14: 2173.60,
    15: 2429.95, 16: 2388.55, 18: 2287.35, 19: 2326.20, 20: 2485.38,
    21: 2558.35, 22: 3673.92, 30: 3337.23, 31: 3115.99, 32: 2440.91,
    33: 2259.68, 34: 2172.37}
pdf_ht = 3447.14
pdf_ch = 1851.05

db = {
    '41495': 3042.81, '41496': 2343.58, '41498': 2588.57,
    '41501': 2574.62, '41502': 2475.81, '41503': 2780.00,
    '41592': 2823.59, '41593': 2854.19, '41594': 2228.33, '41595': 2478.49,
    '41596': 2234.39, '41597': 2018.91, '41598': 3131.72,
    '41599': 3144.97, '41600': 2743.23,
    '41601': 3494.20, '41602': 2188.21, '41603': 3093.49, '41604': 2418.41,
    '41605': 3678.20, '41606': 3596.99, '41607': 2891.91,
    '41608': 2430.10, '41609': 3907.55,
    '41610': 1851.05, '41611': 581.00,
}

type_rooms = {
    'Economy': ['41495', '41496'],
    'Economy AP': ['41498'],
    'Tuscan Style': ['41501','41502','41503','41592','41593','41594','41595','41609'],
    'Tuscan Superior': ['41596','41597','41598'],
    'Dependance': ['41599','41600'],
    'Dependance Deluxe': ['41601','41602','41603','41604'],
    'Suite': ['41605','41606','41607'],
    'Suite AP': ['41608'],
}

type_pdf_cams = {
    'Economy': [15, 34],
    'Economy AP': [8],
    'Tuscan Style': [10, 11, 12, 14, 16, 21, 33],
    'Tuscan Superior': [18, 20, 30],
    'Dependance': [6, 19],
    'Dependance Deluxe': [3, 4, 5, 7],
    'Suite': [22, 31, 32],
    'Suite AP': [2],
}

print("CONFRONTO CORRETTO PER TIPOLOGIA")
print("=" * 85)

total_db = 0
total_pdf = 0

for typ in ['Economy', 'Economy AP', 'Tuscan Style', 'Tuscan Superior',
            'Dependance', 'Dependance Deluxe', 'Suite', 'Suite AP']:
    rooms = type_rooms[typ]
    cams = type_pdf_cams[typ]

    if typ == 'Tuscan Style':
        rooms = [r for r in rooms if r != '41609']

    db_vals = sorted([db[r] for r in rooms], reverse=True)
    pdf_vals = sorted([pdf[c] for c in cams], reverse=True)

    db_sum = sum(db_vals)
    pdf_sum = sum(pdf_vals)
    total_db += db_sum
    total_pdf += pdf_sum

    delta = db_sum - pdf_sum
    pct = delta / pdf_sum * 100 if pdf_sum > 0 else 0

    print(f"{typ:<20} DB={db_sum:>9.2f}  PDF={pdf_sum:>9.2f}  Delta={delta:>+8.2f} ({pct:>+5.1f}%)")

    db_rooms_sorted = sorted(rooms, key=lambda r: db[r], reverse=True)
    pdf_cams_sorted = sorted(cams, key=lambda c: pdf[c], reverse=True)

    for i in range(max(len(db_rooms_sorted), len(pdf_cams_sorted))):
        dr = db_rooms_sorted[i] if i < len(db_rooms_sorted) else '---'
        dv = db[dr] if dr != '---' else 0
        pc = pdf_cams_sorted[i] if i < len(pdf_cams_sorted) else '---'
        pv = pdf[pc] if pc != '---' else 0
        d = dv - pv
        print(f"    room {str(dr):>5} = {dv:>8.2f}  <->  cam {str(pc):>3} = {pv:>8.2f}  delta={d:>+8.2f}")

ht_label = "HT/41609"
print(f"{ht_label:<20} DB={db['41609']:>9.2f}  PDF={pdf_ht:>9.2f}  Delta={db['41609']-pdf_ht:>+8.2f} ({(db['41609']-pdf_ht)/pdf_ht*100:>+5.1f}%)")
total_db += db['41609']
total_pdf += pdf_ht

ch_label = "Chianti PT2"
print(f"{ch_label:<20} DB={db['41610']:>9.2f}  PDF={pdf_ch:>9.2f}  Delta={db['41610']-pdf_ch:>+8.2f}")
total_db += db['41610']
total_pdf += pdf_ch

at_label = "App Toscana (DA?)"
print(f"{at_label:<20} DB={db['41611']:>9.2f}  PDF={'0':>9}  Delta={db['41611']:>+8.2f}")
total_db += db['41611']

print("=" * 85)
print(f"TOTALE              DB={total_db:>9.2f}  PDF={total_pdf:>9.2f}  Delta={total_db - total_pdf:>+8.2f} ({(total_db-total_pdf)/total_pdf*100:>+5.1f}%)")
print()

print(f"PDF totale pernottamento dichiarato:  65228.14")
print(f"PDF somma camere (senza DA):          {total_pdf:.2f}")
print(f"Differenza:                           {65228.14 - total_pdf:.2f}")
print()

# Per-type residuo
print("DISTRIBUZIONE RESIDUO PER TIPOLOGIA (H2 vs PDF):")
print("-" * 50)
residuo_items = [
    ("Economy", 5386.39, 4602.32),
    ("Economy AP", 2588.57, 2432.05),
    ("Tuscan Style (7 cam)", 18215.03, 16544.94),
    ("HT/41609", 3907.55, 3447.14),
    ("Tuscan Superior", 7385.02, 8109.96),
    ("Dependance", 5888.20, 5150.07),
    ("Dependance Deluxe", 11194.31, 11549.20),
    ("Suite", 10167.10, 9230.82),
    ("Suite AP", 2430.10, 2310.39),
    ("Chianti", 1851.05, 1851.05),
    ("App Toscana", 581.00, 0),
]
tot_pos = 0
tot_neg = 0
for name, d, p in residuo_items:
    delta = d - p
    if delta > 0:
        tot_pos += delta
    else:
        tot_neg += delta
    flag = "***" if abs(delta) > 300 else ""
    print(f"  {name:<25} {delta:>+8.2f} {flag}")
print(f"  Totale positivi:         {tot_pos:>+8.2f}")
print(f"  Totale negativi:         {tot_neg:>+8.2f}")
print(f"  Netto:                   {tot_pos + tot_neg:>+8.2f}")
