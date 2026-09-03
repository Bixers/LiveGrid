!undef APP_FILENAME
!define APP_FILENAME "${PRODUCT_NAME}"

!macro customInit
  ; Normalize remembered parent/root paths before the directory page is shown.
  ${StrContains} $0 "${APP_FILENAME}" "$INSTDIR"
  StrCmp $0 "" 0 monitoringRoomPathReady
  StrCpy $1 "$INSTDIR" 1 -1
  StrCmp $1 "\" 0 +2
  StrCpy $INSTDIR "$INSTDIR" -1
  StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
monitoringRoomPathReady:
!macroend
