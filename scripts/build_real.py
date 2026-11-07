import sys, json, pandas as pd, numpy as np
src, out = sys.argv[1], sys.argv[2]
deals = pd.concat([pd.read_csv(f'{src}/deals_{y}.csv', dtype=str) for y in range(2022, 2027)])
con = pd.read_csv(f'{src}/contracts.csv', dtype=str).set_index('Номер контракта')
par = pd.read_csv(f'{src}/participants.csv', dtype=str).drop_duplicates('ИНН').set_index('ИНН')
num = lambda s: pd.to_numeric(s.str.replace(' ', '', regex=False), errors='coerce')
d = deals.copy()
d['date'] = pd.to_datetime(d['Дата сделки'], format='%d.%m.%Y')
d['sum'] = num(d['Сумма сделки'])
ok_all = d[d['Состояние сделки'] != 'Аннулирован(Не оплачен)']
END = d['date'].max()
G = {'deals': int(len(d)), 'from': str(d['date'].min().date()), 'to': str(END.date()),
     'participants': int(pd.concat([d['ИНН продавца'], d['ИНН покупателя']]).nunique()) if 'ИНН покупателя' in d else int(d['ИНН продавца'].nunique()),
     'turnover': float(ok_all[ok_all['Тип контракта'] == 'Внутренний']['sum'].sum())}
m30 = ok_all[(ok_all['date'] > END - pd.Timedelta(days=30)) & (ok_all['Тип контракта'] == 'Внутренний')]
G['d30'] = {'deals': int(len(m30)), 'turnover': float(m30['sum'].sum())}
s = d[(d['Тип контракта'] == 'Внутренний') & (d['Форма контракта'] == 'Спот') & d['Единица измерения'].isin(['тонна', 'килограмм'])].copy()
k = np.where(s['Единица измерения'] == 'килограмм', 1000, 1)
s['vol'] = num(s['Количество']) * num(s['Лот']) / k
s['price'] = s['sum'] / s['vol']
s['start'] = num(s['Стартовая цена']) * k
s = s[(s['price'] > 0) & s['vol'].gt(0)]
s['ok'] = s['Состояние сделки'] != 'Аннулирован(Не оплачен)'
P = [('diesel', r'дизельн', 'oil', 'Dizel yoqilg\'isi'), ('ai92', r'аи-92|аи 92|бензин', 'oil', 'Benzin AI-92'), ('gas', r'сжижен', 'gas', 'Suyultirilgan gaz'),
     ('cement', r'цемент', 'build', 'Sement'), ('rebar', r'арматур', 'metal', 'Armatura'), ('wheat', r'пшениц', 'food', 'Bug\'doy'), ('sugar', r'сахар', 'food', 'Oq shakar')]
res = {'global': G, 'products': {}}
for pid, rx, cat, uz in P:
    x = s[s['Наименование товара'].str.contains(rx, case=False, regex=True, na=False) & s['ok']]
    if pid == 'ai92':
        y = x[x['Наименование товара'].str.contains('92', na=False)]
        x = y if len(y) > 500 else x
    if len(x) < 50: print('skip', pid, len(x)); continue
    daily = x.groupby('date').agg(p=('price', 'median'), v=('vol', 'sum'), n=('price', 'size')).reset_index()
    last = daily.tail(45)
    w90 = x[x['date'] > END - pd.Timedelta(days=90)]
    p10, p50, p90 = np.percentile(w90['price'], [10, 50, 90])
    mk = (w90['price'] / w90['start'] - 1).median()
    top = w90.groupby('ИНН продавца').agg(n=('price', 'size'), vol=('vol', 'sum'), region=('Регион', 'last')).sort_values('vol', ascending=False).head(3)
    sellers = [{'inn': i, 'name': str(par['Наименование'].get(i, i)), 'deals': int(r.n), 'region': str(r.region)} for i, r in top.iterrows()]
    lot = float(w90['vol'].median())
    grade = x['Наименование товара'].value_counts().index[0]
    p30 = daily[daily['date'] <= END - pd.Timedelta(days=30)]['p'].tail(5).median()
    res['products'][pid] = {
        'name': uz, 'cat': cat, 'grade_src': grade[:70], 'deals': int(len(x)), 'volume': float(x['vol'].sum()),
        'p10': float(p10), 'p50': float(p50), 'p90': float(p90), 'markup': float(mk), 'lot': lot,
        'last': float(last['p'].iloc[-1]), 'chg1': float(last['p'].iloc[-1] / last['p'].iloc[-2] - 1), 'chg30': float(last['p'].iloc[-1] / p30 - 1) if p30 else 0,
        'daily': [{'d': str(r.date.date()), 'p': float(r.p), 'v': float(r.v), 'n': int(r.n)} for r in last.itertuples()],
        'sellers': sellers}
    print(pid, len(x), int(p50), grade[:50], [s_['name'][:25] for s_ in sellers], round(lot, 1))
json.dump(res, open(out, 'w'), ensure_ascii=False)
print(json.dumps(G, ensure_ascii=False))
