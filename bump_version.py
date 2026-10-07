"""發布前執行：幫所有頁面的 JS / CSS 加上（或更新）版本號 ?v=，瀏覽器就不會繼續用舊的快取檔。
用法：python bump_version.py"""
import glob, re, time

stamp = time.strftime('%Y%m%d%H%M')
pat = re.compile(r'((?:src|href)="(?:\.\./)?(?:js|css)/[^"?]+?\.(?:js|css))(?:\?v=\d+)?"')
n = 0
for p in glob.glob('*.html') + glob.glob('page/*.html'):
    s = open(p, encoding='utf-8').read()
    t = pat.sub(lambda m: f'{m.group(1)}?v={stamp}"', s)
    if t != s:
        open(p, 'w', encoding='utf-8', newline='\n').write(t)
        n += 1
print(f'版本 {stamp}：更新 {n} 個頁面')
