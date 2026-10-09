; hooks.nsh - NSIS custom installer hooks for Loom
; Handles legacy installation path migration when publisher changed from "loom" to "Loomd"

!macro NSIS_HOOK_PREINSTALL
  ; Check if legacy publisher key (Software\loom\Loom) exists and migrate custom install path
  Push $0
  Push $1
  Push $2

  ; 1. Read legacy install directory from HKCU\Software\loom\Loom (fallback to HKLM if not found)
  ReadRegStr $0 HKCU "Software\loom\Loom" ""
  ${If} $0 == ""
    ReadRegStr $0 HKLM "Software\loom\Loom" ""
  ${EndIf}

  ${If} $0 != ""
    ; Check if the legacy directory actually exists
    ${If} ${FileExists} "$0"
      ; 2. Read new install directory from HKCU\Software\Loomd\Loom
      ReadRegStr $1 HKCU "Software\Loomd\Loom" ""
      ; Calculate default AppData location
      StrCpy $2 "$LOCALAPPDATA\${PRODUCTNAME}"

      ; If the new key is not set, or was set to the default AppData path while legacy was custom
      ${If} $1 == ""
      ${OrIf} $1 == $2
        ${If} $0 != $2
          ; Migrate to legacy custom installation directory
          StrCpy $INSTDIR $0
          SetOutPath $INSTDIR
          WriteRegStr HKCU "Software\Loomd\Loom" "" $INSTDIR
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}

  Pop $2
  Pop $1
  Pop $0
!macroend
