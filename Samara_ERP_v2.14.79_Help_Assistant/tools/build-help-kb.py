#!/usr/bin/env python3
"""Builds help/erp-help-kb.json — the knowledge used by the ERP Help / உதவி assistant.

Sources (all from this repo): tools/erp-help-guide.md (hand-written guide), the role menus in
src/app/core/04-supabase-roles-navigation.js, the on-screen text of every page component, and CHANGELOG.md.
Run:  python3 tools/build-help-kb.py      (needs Node.js for reading the role menus)
"""
import json, os, re, subprocess, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'help', 'erp-help-kb.json')
chunks = []

def add(title, text, kind):
    text = re.sub(r'\s+', ' ', text).strip()
    while text:
        part, text = text[:1400], text[1400:]
        chunks.append({'title': title, 'kind': kind, 'text': part})

# 1. Hand-written guide
guide = open(os.path.join(ROOT, 'tools', 'erp-help-guide.md'), encoding='utf-8').read()
for sec in re.split(r'\n## ', guide)[1:]:
    head, _, body = sec.partition('\n')
    add(head.strip(), body, 'guide')

# 2. Role menus
nav_js = r"""
const src=require('fs').readFileSync(process.argv[1],'utf8');
const a=src.indexOf('const NAV_SECTIONS');const b=src.indexOf('const isNursingManagerProfile');
eval(src.slice(a,b)+';process.stdout.write(JSON.stringify({NAV_SECTIONS,ROLE_NAV,ROLE_HOME}))');
"""
nav = json.loads(subprocess.check_output(['node', '-e', nav_js, os.path.join(ROOT, 'src/app/core/04-supabase-roles-navigation.js')]))
section_of = {i: s['title'] for s in nav['NAV_SECTIONS'] for i in s['items']}
roles_of = {}
for role, items in nav['ROLE_NAV'].items():
    for i in items:
        roles_of.setdefault(i, []).append(role)
    add(f'Menu for {role}', f"Pages in the menu for the {role} role (home page: {nav['ROLE_HOME'].get(role, '')}): " + '; '.join(items) + '.', 'menu')

# 3. On-screen text of each page
main = open(os.path.join(ROOT, 'src/app/shell/01-app-main.js'), encoding='utf-8').read()
routes = {}
for page, comp in re.findall(r"page==='([^']+)'&&h\(([A-Za-z0-9_.]+)", main):
    routes.setdefault(page, comp)
files = glob.glob(os.path.join(ROOT, 'src/app/**/*.js'), recursive=True)
window_files = {'SamaraDutySwap': 'duty-swap.js', 'SamaraSpotAssessment': 'spot-assessment.js'}
def file_for(comp):
    if comp.startswith('window.'):
        f = window_files.get(comp.split('.')[1])
        return os.path.join(ROOT, f) if f else None
    for f in files:
        if re.search(r'function\s+' + re.escape(comp) + r'\s*\(', open(f, encoding='utf-8').read()):
            return f
    return None
BAD = re.compile(r'(px|rgba?\(|var\(|=>|\{|\}|;|^\.|^#|^[a-z_]+$|^[a-z]+(-[a-z]+)+$|https?:|\.js|\.css|select\(|^\w+\.\w+|\\n|await |client|\.from\(|\)\s*[,:]|^[,:)(]|===|&&|\|\||\brow\.|\bform\.|\bprofile\b|\bh\(|\w+_\w+\s*[,=)]|\.(eq|in|order|single|rpc)\b)')
def ui_strings(src):
    seen, out = set(), []
    for m in re.finditer(r"'((?:[^'\\\n]|\\.){3,300})'|\"((?:[^\"\\\n]|\\.){3,300})\"|`([^`\n$]{3,300})`", src):
        s = (m.group(1) or m.group(2) or m.group(3) or '').replace("\\'", "'").strip()
        if len(s) < 3 or not re.search(r'[A-Za-z]{3}', s) or BAD.search(s):
            continue
        if ' ' not in s and not re.match(r'^[A-Z][a-z]+', s):
            continue
        if s.lower() in seen:
            continue
        seen.add(s.lower()); out.append(s)
    return out
done = set()
for page, comp in sorted(routes.items()):
    f = file_for(comp)
    if not f:
        continue
    strings = ui_strings(open(f, encoding='utf-8').read())
    who = ', '.join(sorted(set(roles_of.get(page, [])))) or 'as assigned'
    head = f"ERP page \"{page}\" (menu: {section_of.get(page, 'other')}; roles: {who}). On-screen text, buttons and messages: "
    add(f'Page: {page}', head + ' | '.join(strings[:400]), 'page')

# 4. CHANGELOG (user-facing release notes)
log = open(os.path.join(ROOT, 'CHANGELOG.md'), encoding='utf-8').read()
for sec in re.split(r'\n## ', log)[1:]:
    head, _, body = sec.partition('\n')
    body = '\n'.join(l for l in body.split('\n') if not re.match(r'^\s*-\s*(Files|\*\*SQL|\*\*Edge|This package)', l))
    add('Release ' + head.strip(), body, 'changelog')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({'built': __import__('datetime').date.today().strftime('%d-%m-%Y'), 'chunks': chunks}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'Wrote {OUT}: {len(chunks)} chunks, {os.path.getsize(OUT)//1024} KB')
