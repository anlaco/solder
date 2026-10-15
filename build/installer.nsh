; Extra steps of Solder's NSIS uninstaller (labview-captures/windows-install-0.2.1/: the
; uninstall left electron-builder's updater cache and the orphaned file extensions behind).
; The user's own data in %APPDATA%\Solder is kept, as most programs do.
!macro customUnInstall
  RMDir /r "$LOCALAPPDATA\@soldereditor-updater"
  RMDir /r "$LOCALAPPDATA\solder-updater"
  DeleteRegKey HKCU "Software\Classes\.sdg"
  DeleteRegKey HKCU "Software\Classes\.qvi"
!macroend
