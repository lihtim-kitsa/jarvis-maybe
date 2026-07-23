import os
import re

public_dir = r'c:\Users\astik\OneDrive\Desktop\JARVIS\clients\electron-app\public'
js_dir = os.path.join(public_dir, 'js')

# 1. Update index.html
index_path = os.path.join(public_dir, 'index.html')
with open(index_path, 'r', encoding='utf-8') as f:
    html = f.read()

if '<script>window.API_BASE' not in html:
    html = html.replace('<body>', '<body>\n  <script>window.API_BASE = "http://localhost:3000";</script>')
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(html)

# 2. Update all JS files to use API_BASE
for filename in os.listdir(js_dir):
    if filename.endswith('.js'):
        filepath = os.path.join(js_dir, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace string literal '/api/...' with window.API_BASE + '/api/...'
        # Only if it's not already replaced
        if "window.API_BASE +" not in content:
            content = re.sub(r"'/api/(.*?)'", r"window.API_BASE + '/api/\1'", content)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)

print("Updated Electron app API endpoints.")
