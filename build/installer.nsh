; المثبّت (NSIS) — يُحفظ هذا الملف بترميز UTF-8 مع BOM ليقرأ NSIS النصوص العربية صحيحة.

; ١) خطّا «أضواء السلف» لحساب المستخدم، لتظهر ملفات Word بخط الكتاب (Windows 10 1809 فأحدث)
; ٢) قائمة الزر الأيمن في مستكشف الملفات:
;    ملفات Word ‏(.docx):  «أخرِجه بورّاق» · «أضفه إلى طابور النسّاخ»
;    ملفات PDF:            «ضعه على الرَّحل» · «أخرِجه بورّاق» · «أضفه إلى طابور النسّاخ»
;    «أضفه إلى طابور النسّاخ» يُخرج الملف في الخلفية بآخر أسلوب استُعمل، دون أن تُفتح النافذة
;    (في Windows 11 تحت «عرض مزيد من الخيارات»)
; وربط ملفات «ورق» ‎.waraq‎ (والقديمة ‎.warraq‎) بالبرنامج يكتبه electron-builder من package.json ← fileAssociations،
; ويكتبه البرنامج نفسه أيضاً عند تشغيله (فتظهر أيقونة الملف ولو شُغّل دون مثبّت)

!macro warraqVerb EXT KEY LABEL ARG
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${KEY}" "MUIVerb" "${LABEL}"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${KEY}" "Icon" "$INSTDIR\Alwarraq.exe,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${KEY}\command" "" '"$INSTDIR\Alwarraq.exe" ${ARG} "%1"'
!macroend

!macro customInstall
  ; التثبيت بصلاحية المدير: الخطوط لكل حسابات الجهاز (ومجلد $LOCALAPPDATA هنا مجلد مشترك لا مجلد المستخدم)
  SetRegView 64
  CopyFiles /SILENT "$INSTDIR\resources\app\app\public\fonts\AdwaAssalaf-Regular.ttf" "$FONTS\AdwaAssalaf-Regular.ttf"
  CopyFiles /SILENT "$INSTDIR\resources\app\app\public\fonts\AdwaAssalaf-Bold.ttf" "$FONTS\AdwaAssalaf-Bold.ttf"
  WriteRegStr HKLM "Software\Microsoft\Windows NT\CurrentVersion\Fonts" "Adwa Assalaf (TrueType)" "AdwaAssalaf-Regular.ttf"
  WriteRegStr HKLM "Software\Microsoft\Windows NT\CurrentVersion\Fonts" "Adwa Assalaf Bold (TrueType)" "AdwaAssalaf-Bold.ttf"
  ; أميري: خط التنضيد القياسي، فيظهر به ملف Word كما في PDF (يُنزَّل إلى public\fonts عند البناء)
  IfFileExists "$INSTDIR\resources\app\app\public\fonts\Amiri-Regular.ttf" 0 +5
    CopyFiles /SILENT "$INSTDIR\resources\app\app\public\fonts\Amiri-Regular.ttf" "$FONTS\Amiri-Regular.ttf"
    CopyFiles /SILENT "$INSTDIR\resources\app\app\public\fonts\Amiri-Bold.ttf" "$FONTS\Amiri-Bold.ttf"
    WriteRegStr HKLM "Software\Microsoft\Windows NT\CurrentVersion\Fonts" "Amiri (TrueType)" "Amiri-Regular.ttf"
    WriteRegStr HKLM "Software\Microsoft\Windows NT\CurrentVersion\Fonts" "Amiri Bold (TrueType)" "Amiri-Bold.ttf"
  SetRegView lastused
  ; تظهر الخطوط في الجلسة الحالية بلا إعادة تشغيل
  System::Call 'gdi32::AddFontResource(t "$FONTS\AdwaAssalaf-Regular.ttf")'
  System::Call 'gdi32::AddFontResource(t "$FONTS\AdwaAssalaf-Bold.ttf")'
  System::Call 'gdi32::AddFontResource(t "$FONTS\Amiri-Regular.ttf")'
  System::Call 'gdi32::AddFontResource(t "$FONTS\Amiri-Bold.ttf")'
  SendMessage 0xFFFF 0x1D 0 0 /TIMEOUT=2000

  !insertmacro warraqVerb ".docx" "Alwarraq.Output" "أخرِجه بورّاق" "--output"
  !insertmacro warraqVerb ".docx" "Alwarraq.Queue" "أضفه إلى طابور النسّاخ" "--queue"
  !insertmacro warraqVerb ".pdf" "Alwarraq.Rahl" "ضعه على الرَّحل" "--rahl"
  !insertmacro warraqVerb ".pdf" "Alwarraq.Output" "أخرِجه بورّاق" "--output"
  !insertmacro warraqVerb ".pdf" "Alwarraq.Queue" "أضفه إلى طابور النسّاخ" "--queue"
  ; يُعلَم المستكشف بالتغيير فتظهر القوائم دون إعادة تشغيل
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  ; ربط ملفات «ورق» الذي يكتبه البرنامج نفسه عند تشغيله
  DeleteRegKey HKCU "Software\Classes\Alwarraq.Book"
  DeleteRegKey HKCU "Software\Classes\AppUserModelId\com.alwarraq.window"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.docx\shell\Alwarraq.Output"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.docx\shell\Alwarraq.Queue"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\Alwarraq.Rahl"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\Alwarraq.Output"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\Alwarraq.Queue"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
