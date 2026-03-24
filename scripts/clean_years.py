import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB = r'C:\Users\ryb086\OneDrive - Groupe R.Y. Beaudoin\Bureau\CLAUDE_CODE\portal-machine\data\machines.json'
with open(DB, 'r', encoding='utf-8') as f:
    data = json.load(f)

exc = data['Excavatrice']
before = sum(len(exc[f][a]) for f in exc for a in exc[f])

YEAR_RANGES = {
    'Volvo CE': {
        'EC17C': (2010, 2016), '235': (1985, 2000),
        'EC15D': (2016, 2019), 'EC18D/E': (2016, 2026), 'EC20D': (2016, 2019),
        'ECR25D': (2014, 2026), 'ECR40D': (2016, 2024), 'ECR50D/F': (2014, 2025),
        'ECR58D/F': (2014, 2025), 'EC55D': (2016, 2022), 'EC60D/E': (2016, 2026),
        'ECR88D/Plus': (2016, 2026),
        'EC140D/E': (2015, 2026), 'EC140E': (2019, 2026),
        'EC160BLC': (2002, 2015), 'EC160CL': (2006, 2016),
        'EC200D/E': (2015, 2026), 'EC200E': (2019, 2026),
        'EC210D/E': (2015, 2026),
        'EC220D': (2015, 2019), 'EC220E': (2019, 2026),
        'EC250D/E': (2015, 2026), 'EC250E': (2019, 2026),
        'EC300D/E': (2015, 2026), 'EC300E': (2019, 2026),
        'EC350D/E': (2015, 2026), 'EC350E': (2019, 2026),
        'EC380D/E': (2015, 2026), 'EC380E': (2019, 2026),
        'EC480D/E': (2015, 2026), 'EC480E': (2019, 2026),
        'EC550E': (2019, 2026),
        'EC750D/E': (2015, 2026), 'EC750E': (2019, 2026),
        'EC950E': (2019, 2026),
        'ECR145D/E': (2015, 2026),
        'ECR235D/E': (2015, 2026), 'ECR235E': (2019, 2026),
        'ECR255D/E': (2024, 2026), 'ECR255E': (2024, 2026),
        'ECR305C L': (2008, 2016),
        'ECR355D/E': (2015, 2026), 'ECR355E': (2019, 2026),
        'EW60D/E': (2016, 2026), 'EW60E': (2019, 2026),
        'EW160D/E': (2015, 2026),
        'EW200D/E': (2015, 2026),
        'EW205D/E': (2015, 2026), 'EW205E': (2019, 2026),
        'EWR150E': (2017, 2026), 'EWR170E': (2019, 2026),
    },
    'Liebherr': {
        'A 904 C Litronic': (2006, 2012),
        'A 910 Litronic': (2017, 2020),
        'A 912 Litronic': (2013, 2020),
        'A 914 Litronic': (2012, 2025),
        'A 916 Litronic': (2012, 2026),
        'A 918 Litronic': (2012, 2019),
        'A 920 Litronic': (2012, 2025),
        'A 922 Litronic': (2014, 2026),
        'A 924 Litronic': (2012, 2019),
        'A 926 Litronic': (2012, 2025),
        'A 934 Litronic': (2004, 2011),
        'A 910 Compact': (2017, 2026),
        'A 910 Compact Litronic': (2016, 2026),
        'A 912 Compact': (2013, 2020),
        'A 914 Compact': (2012, 2025),
        'A 920 Compact': (2012, 2025),
        'R 900 C Litronic': (2003, 2013),
        'R 906 Litronic': (2009, 2013),
        'R 906 Classic': (2008, 2013),
        'R 910 Litronic': (2019, 2025),
        'R 914 Compact': (2013, 2025),
        'R 918 Litronic': (2019, 2025),
        'R 920 Litronic': (2021, 2026),
        'R 920 K LC': (2013, 2019),
        'R 921 LC': (2022, 2026),
        'R 922 LC': (2013, 2019),
        'R 922 Litronic': (2019, 2026),
        'R 924 Compact': (2008, 2013),
        'R 924 Litronic': (2019, 2025),
        'R 924 Tunnel': (2019, 2025),
        'R 926 Compact': (2014, 2025),
        'R 926 Classic': (2008, 2012),
        'R 926 Litronic': (2019, 2025),
        'R 930 Litronic': (2019, 2026),
        'R 934': (2019, 2026),
        'R 936 Litronic': (2012, 2026),
        'R 938 Litronic': (2019, 2026),
        'R 938': (2019, 2026),
        'R 945': (2019, 2026),
        'R 946 Litronic': (2012, 2019),
        'R 950 Litronic': (2012, 2026),
        'R 956 Litronic': (2019, 2026),
        'R 960 Litronic': (2012, 2025),
        'R 960 SME': (2012, 2023),
        'R 966 Litronic': (2019, 2025),
        'R 976 Litronic': (2013, 2025),
        'R 980 SME': (2019, 2025),
    },
    'SANY': {
        'SY16C': (2018, 2025), 'SY18U': (2021, 2026), 'SY26U': (2016, 2026),
        'SY35U': (2018, 2026), 'SY50U': (2021, 2026), 'SY55U': (2018, 2026),
        'SY60C': (2018, 2026), 'SY75C': (2018, 2026), 'SY80U': (2020, 2026),
        'SY95C': (2024, 2026), 'SY115C': (2018, 2026), 'SY135C': (2018, 2026),
        'SY155U': (2021, 2026), 'SY175C': (2018, 2026), 'SY195C': (2018, 2026),
        'SY205C': (2018, 2026), 'SY215C': (2018, 2026), 'SY235C': (2018, 2026),
        'SY265C': (2018, 2020), 'SY305C': (2021, 2026), 'SY365C': (2018, 2026),
        'SY395C': (2018, 2026), 'SY465C': (2018, 2026), 'SY500H': (2018, 2026),
        'SY550H': (2018, 2026), 'SY700C': (2018, 2026), 'SY750H': (2018, 2026),
    },
    'Case': {
        'CX17C': (2017, 2025), 'CX20C': (2017, 2020), 'CX26C': (2017, 2025),
        'CX30C': (2017, 2020), 'CX36C': (2017, 2020), 'CX37C': (2017, 2020),
        'CX42C': (2017, 2020), 'CX57C': (2017, 2020), 'CX58': (2005, 2012),
        'CX60': (2005, 2012), 'CX75C SR': (2013, 2018), 'CX80': (2003, 2012),
        'CX80C': (2021, 2026), 'CX80N': (2021, 2026), 'CX85D': (2019, 2023),
        'CX130C': (2012, 2017), 'CX145C': (2012, 2017), 'CX145C SR': (2022, 2026),
        'CX160C': (2012, 2016), 'CX170C': (2012, 2016), 'CX210C': (2011, 2014),
        'CX230C': (2011, 2015), 'CX235C SR': (2012, 2017), 'CX250C': (2011, 2015),
        'CX260C': (2011, 2016), 'CX370C': (2021, 2026),
        'CX130D': (2015, 2021), 'CX160D': (2017, 2021), 'CX210D': (2015, 2021),
        'CX245D SR': (2017, 2025), 'CX250D': (2015, 2020), 'CX290D': (2016, 2023),
        'CX300D': (2015, 2019), 'CX350D': (2015, 2025), 'CX370D': (2015, 2025),
        'CX490D': (2016, 2026), 'CX500D': (2016, 2019), 'CX750D': (2017, 2019),
        '145 D SR': (2017, 2026),
        'CX170E': (2023, 2026), 'CX220E': (2022, 2026), 'CX300E': (2021, 2026),
        'CX350E': (2022, 2026), 'CX490E': (2022, 2026),
    },
    'Kobelco': {
        'SK75SR-7': (2019, 2026), 'SK80CS-7': (2019, 2026),
        'SK100-8 / -10': (2008, 2021), 'SK130LC-10': (2015, 2019),
        'SK130LC-11': (2020, 2025), 'SK140SRLC-5 / -7': (2016, 2026),
        'SK170LC-10': (2021, 2025), 'SK210LC-10': (2015, 2019),
        'SK210LC-11': (2021, 2026), 'SK230SRLC-5': (2016, 2019),
        'SK260LC-10': (2015, 2019), 'SK300LC-10': (2016, 2019),
        'SK350LC-10': (2016, 2019), 'SK380LC': (2021, 2025),
        'SK490LC-10': (2016, 2020), 'SK500LC-10': (2016, 2020),
        'ED160-7': (2019, 2026),
    },
}

removed = 0
for fab_name, model_years in YEAR_RANGES.items():
    if fab_name not in exc:
        continue
    years_to_check = list(exc[fab_name].keys())
    for annee_str in years_to_check:
        annee = int(annee_str)
        models_to_check = list(exc[fab_name][annee_str].keys())
        for modele in models_to_check:
            if modele in model_years:
                start, end = model_years[modele]
                if annee < start or annee > end:
                    del exc[fab_name][annee_str][modele]
                    removed += 1
        if not exc[fab_name][annee_str]:
            del exc[fab_name][annee_str]

after = sum(len(exc[f][a]) for f in exc for a in exc[f])

with open(DB, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'Before: {before} entries')
print(f'Removed: {removed} entries')
print(f'After: {after} entries')
print(f'Reduction: {round((1 - after/before) * 100, 1)}%')
for fab_name in sorted(YEAR_RANGES.keys()):
    if fab_name in exc:
        count = sum(len(exc[fab_name][a]) for a in exc[fab_name])
        print(f'  {fab_name}: {count} entries')
