# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files
from PyInstaller.utils.hooks import collect_dynamic_libs

datas = [('static', 'static')]
binaries = []
datas += collect_data_files('tree_sitter_go')
datas += collect_data_files('tree_sitter_python')
datas += collect_data_files('tree_sitter_javascript')
datas += collect_data_files('tree_sitter_typescript')
datas += collect_data_files('tree_sitter_php')
datas += collect_data_files('tree_sitter_java')
binaries += collect_dynamic_libs('tree_sitter_go')
binaries += collect_dynamic_libs('tree_sitter_python')
binaries += collect_dynamic_libs('tree_sitter_javascript')
binaries += collect_dynamic_libs('tree_sitter_typescript')
binaries += collect_dynamic_libs('tree_sitter_php')
binaries += collect_dynamic_libs('tree_sitter_java')


a = Analysis(
    ['app/main.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='SprintLogic',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='SprintLogic',
)
