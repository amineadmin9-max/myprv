#!/usr/bin/env python3
import sys
import json
from pytrends.request import TrendReq

COUNTRY_MAP = {
  "SA":"Saudi Arabia","AE":"United Arab Emirates","EG":"Egypt","QA":"Qatar","KW":"Kuwait",
  "OM":"Oman","BH":"Bahrain","TR":"Turkey","IQ":"Iraq","JO":"Jordan","LB":"Lebanon",
  "MA":"Morocco","DZ":"Algeria","TN":"Tunisia","LY":"Libya",
  "US":"United States","GB":"United Kingdom","DE":"Germany","FR":"France","CA":"Canada",
  "AU":"Australia","IN":"India","JP":"Japan","CN":"China","RU":"Russia",
  "BR":"Brazil","MX":"Mexico","IT":"Italy","ES":"Spain","NL":"Netherlands"
}

def gprop(country):
  return 'news' if country != 'US' else ''

def main():
  if len(sys.argv) < 3:
    sys.stderr.write('Usage: trends.py <action> <data_json>\n')
    sys.exit(1)
  action = sys.argv[1]
  data = json.loads(sys.argv[2])

  try:
    kw = data.get('keyword', '')
    country = data.get('country', 'US')
    hl = data.get('hl', 'en')
    tz = data.get('tz', 0)

    pytrends = TrendReq(hl=hl, tz=tz)
    geo = country if country else ''

    if action == 'related':
      if not kw:
        sys.stderr.write('Missing keyword for related\n')
        sys.exit(1)
      pytrends.build_payload([kw], cat=0, timeframe='today 1-m', geo=geo, gprop=gprop(country))
      result = pytrends.related_queries()
      kw_lower = kw.lower()
      if kw_lower in result:
        r = result[kw_lower]
        out = {}
        if r.get('top') is not None:
          out['top'] = r['top'].to_dict('records')
        else:
          out['top'] = []
        if r.get('rising') is not None:
          out['rising'] = r['rising'].to_dict('records')
        else:
          out['rising'] = []
        print(json.dumps(out))
      else:
        print(json.dumps({'top': [], 'rising': []}))
    elif action == 'topics':
      if not kw:
        sys.stderr.write('Missing keyword for topics\n')
        sys.exit(1)
      pytrends.build_payload([kw], cat=0, timeframe='today 1-m', geo=geo, gprop=gprop(country))
      r = pytrends.related_topics()
      kw_lower = kw.lower()
      if kw_lower in r:
        out = r[kw_lower]
        out = out['top'] if isinstance(out, dict) else out
        rows = []
        for item in out:
          rows.append({
            'title': item.get('topic_title', ''),
            'type': item.get('topic_type', ''),
            'value': int(item.get('value', 0))
          })
        print(json.dumps(rows[:20]))
      else:
        print(json.dumps([]))
    else:
      sys.stderr.write(f'Unknown action: {action}\n')
      sys.exit(1)
  except Exception as e:
    sys.stderr.write(f'Error: {str(e)}\n')
    sys.exit(1)

if __name__ == '__main__':
  main()
