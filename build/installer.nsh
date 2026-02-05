!macro customInit
  ; Uninstall previous version if it exists
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{com.polyhub.app}" "UninstallString"
  ${If} $R0 != ""
    DetailPrint "Found previous installation, uninstalling..."
    ExecWait '"$R0" /S'
  ${EndIf}
!macroend

