#!/usr/bin/env python3
# 文言の静的な点検: 画面に出る日本語の文字列を集めて、用語のゆれ・全角半角・空白・記号のゆれを数える
#   python3 wording_audit.py [アプリのフォルダ] > out/wording_audit.txt
import re, sys, os, json, collections
APP = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/pcd-viewer'
FILES = ['src/index.html', 'src/app.js', 'live.js', 'src/worker.js', 'src/trajectory.js', 'src/pcd.js'] + ['src/io/' + f for f in ('index.js', 'util.js', 'sink.js')] + ['src/io/formats/' + f for f in sorted(os.listdir(APP + '/src/io/formats'))]
JA = re.compile(r'[぀-ヿ一-鿿]')
strings = []  # (file, line, text)
for f in FILES:
    src = open(os.path.join(APP, f), encoding='utf8').read()
    lines = src.split('\n')
    for i, line in enumerate(lines, 1):
        s = line.strip()
        if s.startswith('//') or s.startswith('/*') or s.startswith('*') or s.startswith('#'):
            continue
        code = re.sub(r'//.*$', '', line) if not f.endswith('.html') else re.sub(r'<!--.*?-->', '', line)
        if f.endswith('.html'):
            for t in re.findall(r'>([^<>]+)<', code) + re.findall(r'aria-label="([^"]+)"', code):
                if JA.search(t): strings.append((f, i, t.strip()))
        else:
            for q in re.findall(r"'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`|\"((?:[^\"\\]|\\.)*)\"", code):
                t = next(x for x in q if x is not None and x != '') if any(q) else ''
                if t and JA.search(t): strings.append((f, i, t))
print(f'# 画面に出うる日本語の文字列 {len(strings)} 個（コメントを除く）\n')
def show(title, pred, limit=60):
    hits = [(f, i, t) for f, i, t in strings if pred(t)]
    print(f'## {title}（{len(hits)} 個）')
    for f, i, t in hits[:limit]:
        print(f'- {f}:{i}  {t[:150]}')
    print()
    return hits
show('「PC」（ほかは「パソコン」）', lambda t: re.search(r'(?<![A-Za-z])PC(?![A-Za-z0-9])', t))
show('「パソコン」', lambda t: 'パソコン' in t, 10)
show('「単色」（ボタンは「1 色」）', lambda t: '単色' in t)
show('「1 色」', lambda t: '1 色' in t)
show('「反射」', lambda t: '反射' in t, 15)
show('「強度」「intensity」', lambda t: '強度' in t or 'intensity' in t.lower(), 15)
show('半角かっこが日本語に付いている', lambda t: re.search(r'[぀-ヿ一-鿿] ?\((?!\*)|\) ?[぀-ヿ一-鿿]', t))
show('全角の英数字', lambda t: re.search(r'[Ａ-Ｚａ-ｚ０-９]', t))
show('日本語と英数字の間に空白がない（変数の差し込みを除く）', lambda t: re.search(r'[぀-ヿ一-鿿][A-Za-z0-9]|[A-Za-z0-9][぀-ヿ一-鿿]', re.sub(r'\$\{[^}]*\}', ' ', t)))
show('「...」（ほかは「…」）', lambda t: '...' in t)
show('波形「～」（ほかは「〜」）', lambda t: '～' in t)
show('半角のコロン「: 」', lambda t: re.search(r'[぀-ヿ一-鿿]: ', t), 40)
show('全角のコロン「：」', lambda t: '：' in t)
show('英語だけの文（日本語の中の英語の文）', lambda t: re.search(r'[A-Za-z]{3,} [A-Za-z]{3,} [A-Za-z]{3,}', t))
show('toLocaleString()（地域設定任せの数の区切り）', lambda t: 'toLocaleString()' in t, 40)
show('ヘッダー／頭書き', lambda t: 'ヘッダー' in t or '頭書き' in t)
show('「エラー」', lambda t: 'エラー' in t)
