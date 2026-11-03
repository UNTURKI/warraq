// مثبّت ورَّاق: نافذة بهوية البرنامج (الألف والنقط الخمس) تشغّل مثبّت NSIS الملحق بآخر الملف بصمت.
// بُني على .NET Framework 4 الموجود في كل Windows 10 فأحدث، فلا يحتاج المستخدم شيئاً.
// بنية الملف: [Setup.exe][مثبّت NSIS][طوله 8 بايت][حجم البرنامج بعد التثبيت 8 بايت]["WRQSETUP"]
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Warraq Setup")]
[assembly: AssemblyProduct("Warraq")]
[assembly: AssemblyVersion("1.0.0.0")]

static class Program {
  [STAThread]
  static int Main(string[] args) {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    if (args.Length == 2 && args[0] == "--preview") { SetupForm.Preview(args[1]); return 0; }
    if (args.Length == 2 && args[0] == "--extract-only") { Payload.Open().ExtractTo(args[1], null); return 0; }
    bool first;
    using (new Mutex(true, "AlwarraqSetupWindow", out first)) {
      if (!first) return 0;
      SetupForm form = new SetupForm();
      if (args.Length == 2 && args[0] == "--dir") form.Dir = args[1];
      if (args.Length == 2 && args[0] == "--update") form.UpdateIn(args[1]);
      Application.Run(form);
    }
    return 0;
  }
}

class Payload {
  public long Offset, Length, Unpacked;
  public static Payload Open() {
    string self = Assembly.GetExecutingAssembly().Location;
    using (FileStream f = File.OpenRead(self)) {
      if (f.Length < 24) return null;
      f.Seek(-24, SeekOrigin.End);
      BinaryReader r = new BinaryReader(f);
      long len = r.ReadInt64(), unpacked = r.ReadInt64();
      if (Encoding.ASCII.GetString(r.ReadBytes(8)) != "WRQSETUP") return null;
      Payload p = new Payload();
      p.Length = len; p.Unpacked = unpacked; p.Offset = f.Length - 24 - len;
      return p;
    }
  }
  public void ExtractTo(string file, Action<double> progress) {
    using (FileStream f = File.OpenRead(Assembly.GetExecutingAssembly().Location))
    using (FileStream o = File.Create(file)) {
      f.Seek(Offset, SeekOrigin.Begin);
      byte[] buf = new byte[1 << 20];
      long left = Length;
      while (left > 0) {
        int n = f.Read(buf, 0, (int)Math.Min(buf.Length, left));
        if (n <= 0) throw new IOException("الملف ناقص");
        o.Write(buf, 0, n);
        left -= n;
        if (progress != null) progress(1 - (double)left / Length);
      }
    }
  }
}

enum Stage { Welcome, Installing, Done, Failed }

class Btn {
  public RectangleF R; public string Text; public bool Primary; public Action Click;
  public Btn(RectangleF r, string t, bool primary, Action click) { R = r; Text = t; Primary = primary; Click = click; }
}

class SetupForm : Form {
  const int W = 720, H = 440, RAIL = 220;
  const string APP = "ورَّاق";
  static readonly Color Paper = Hex("#FBF8F1"), Ink = Hex("#2A1D14"), Rubric = Hex("#6B1D2F"), RubricDark = Hex("#55162A"), RubricLight = Hex("#7F2739"), Gold = Hex("#C5A059"), GoldLight = Hex("#EBD193"), Muted = Hex("#6C5949"), Line = Hex("#E5DDCC");
  static readonly string[] Phrases = { "تُفتح المنضدة…", "تُصفّ الحروف…", "تُذهَّب الأغلفة…", "يُجلَّد الكتاب…", "تُرتَّب الخزانة…" };

  Stage stage = Stage.Welcome;
  readonly Stopwatch clock = Stopwatch.StartNew();
  double stageAt = 0, shown = 0;
  volatile float target = 0;
  double[] litAt = new double[5];
  string error = "";
  string dir;
  Payload payload;
  readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
  readonly PrivateFontCollection pfc = new PrivateFontCollection();
  FontFamily display, body;
  Image word;
  float scale = 1;
  Btn[] buttons = new Btn[0];
  RectangleF closeBox = new RectangleF(10, 10, 30, 30), changeBox;
  Btn hover; bool hoverClose, hoverChange;
  PointF dragFrom; bool dragging;
  float? frozen;

  [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int a, int b, int c, int d, int e, int f);

  public string Dir { set { dir = value; KeepOldCopies = true; } } // ‎--dir‎ لتجربة النافذة: لا يمسّ ما هو مثبّت
  bool KeepOldCopies;
  // ‎--update‎ من البرنامج نفسه: في مجلده الحالي، بلا سؤال، ويعود البرنامج بعد التثبيت
  bool updating;
  public void UpdateIn(string d) {
    dir = d; updating = true;
    Shown += delegate { Start(); };
  }
  public SetupForm() : this(false) { }
  SetupForm(bool offscreen) {
    Text = "تثبيت " + APP;
    FormBorderStyle = FormBorderStyle.None;
    StartPosition = FormStartPosition.CenterScreen;
    DoubleBuffered = true;
    KeyPreview = true;
    BackColor = Paper;
    try { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch { }
    using (Graphics g = CreateGraphics()) scale = g.DpiX / 96f;
    ClientSize = new Size((int)(W * scale), (int)(H * scale));
    dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Alwarraq");
    LoadAssets();
    if (offscreen) return;
    Region = Region.FromHrgn(CreateRoundRectRgn(0, 0, ClientSize.Width + 1, ClientSize.Height + 1, (int)(18 * scale), (int)(18 * scale)));
    try { payload = Payload.Open(); } catch { payload = null; }
    Layout2();
    timer.Interval = 30;
    timer.Tick += delegate { Tick(); };
    timer.Start();
    MouseMove += OnMove; MouseDown += OnDown; MouseUp += delegate { dragging = false; };
    KeyDown += OnKey;
    FormClosing += OnClosingWindow;
  }

  protected override CreateParams CreateParams {
    get { CreateParams c = base.CreateParams; c.ClassStyle |= 0x20000; return c; } // ظل النافذة
  }

  static Color Hex(string s) { return ColorTranslator.FromHtml(s); }
  static Color A(Color c, double a) { return Color.FromArgb((int)(Math.Max(0, Math.Min(1, a)) * 255), c); }
  static Color Mix(Color a, Color b, double t) { t = Math.Max(0, Math.Min(1, t)); return Color.FromArgb((int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t)); }
  static double Clamp(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  static double BackOut(double t) { t = Clamp(t); double c = 2.2, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  static double Ease(double t) { t = Clamp(t); return t * t * (3 - 2 * t); }
  static string Ar(string s) { StringBuilder b = new StringBuilder(); foreach (char c in s) b.Append(c >= '0' && c <= '9' ? (char)('٠' + (c - '0')) : c == '.' ? '٫' : c); return b.ToString(); }

  void LoadAssets() {
    Assembly a = Assembly.GetExecutingAssembly();
    foreach (string name in new[] { "AdwaAssalaf-Bold.ttf", "Amiri-Regular.ttf" }) {
      try {
        using (Stream s = a.GetManifestResourceStream(name)) {
          byte[] b = new byte[s.Length]; s.Read(b, 0, b.Length);
          IntPtr p = Marshal.AllocCoTaskMem(b.Length); // يبقى ما بقي الخط مستعملاً
          Marshal.Copy(b, 0, p, b.Length);
          pfc.AddMemoryFont(p, b.Length);
        }
      } catch { }
    }
    foreach (FontFamily f in pfc.Families) { if (f.Name.Contains("Adwa")) display = f; else if (f.Name.Contains("Amiri")) body = f; }
    if (body == null) body = new FontFamily("Segoe UI");
    if (display == null) display = body;
    using (Stream s = a.GetManifestResourceStream("waraq-word.png")) { if (s != null) word = new Bitmap(Image.FromStream(s)); }
  }

  /* ---------- الحالات ---------- */
  double Now() { return clock.Elapsed.TotalSeconds; }
  void Go(Stage s) { stage = s; stageAt = Now(); Layout2(); Invalidate(); }
  void Layout2() {
    float rx = W - RAIL - 40; // الحافة اليمنى للمحتوى
    switch (stage) {
      case Stage.Welcome:
        buttons = new[] { new Btn(new RectangleF(rx - 170, H - 82, 170, 46), "تثبيت", true, Start) };
        break;
      case Stage.Done:
        buttons = new[] { new Btn(new RectangleF(rx - 170, H - 82, 170, 46), "شغّل " + APP, true, RunApp), new Btn(new RectangleF(rx - 290, H - 82, 106, 46), "إغلاق", false, Close) };
        break;
      case Stage.Failed:
        buttons = new[] { new Btn(new RectangleF(rx - 170, H - 82, 170, 46), "أعد المحاولة", true, Start), new Btn(new RectangleF(rx - 290, H - 82, 106, 46), "إغلاق", false, Close) };
        break;
      default: buttons = new Btn[0]; break;
    }
  }

  void Tick() {
    if (stage == Stage.Installing) {
      shown += (target - shown) * 0.08;
      for (int i = 0; i < 5; i++) if (litAt[i] == 0 && shown >= (i + 1) / 5.0) litAt[i] = Now();
    }
    Invalidate();
  }

  void OnClosingWindow(object sender, FormClosingEventArgs e) {
    if (stage == Stage.Installing) e.Cancel = true; // إيقاف المثبّت في منتصفه يترك البرنامج ناقصاً
  }
  void OnKey(object sender, KeyEventArgs e) {
    if (e.KeyCode == Keys.Enter && buttons.Length > 0) buttons[0].Click();
    if (e.KeyCode == Keys.Escape && stage != Stage.Installing) Close();
  }

  void ChangeDir() {
    using (FolderBrowserDialog d = new FolderBrowserDialog()) {
      d.Description = "اختر مكان تثبيت " + APP;
      d.ShowNewFolderButton = true;
      if (d.ShowDialog(this) != DialogResult.OK) return;
      string p = d.SelectedPath;
      dir = Path.GetFileName(p).Equals("Alwarraq", StringComparison.OrdinalIgnoreCase) ? p : Path.Combine(p, "Alwarraq");
    }
  }

  void Start() {
    if (payload == null) { Fail("ملف التثبيت ناقص. نزّله مرة أخرى."); return; }
    // التحديث: البرنامج يُغلق نفسه بعد تشغيل المثبّت، فيُنتظر قليلاً
    if (updating) for (int i = 0; i < 40 && Process.GetProcessesByName("Alwarraq").Length > 0; i++) Thread.Sleep(500);
    if (!KeepOldCopies) foreach (Process p in Process.GetProcessesByName("Alwarraq")) {
      MessageBox.Show(this, "أغلق " + APP + " أولاً، ثم اضغط «موافق».", "تثبيت " + APP, MessageBoxButtons.OK, MessageBoxIcon.Information, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
      if (Process.GetProcessesByName("Alwarraq").Length > 0) return;
      break;
    }
    try {
      Directory.CreateDirectory(dir);
      string probe = Path.Combine(dir, ".write-test");
      File.WriteAllText(probe, "");
      File.Delete(probe);
    } catch { Fail("لا يمكن الكتابة في هذا المجلد. اختر مكاناً آخر."); return; }
    litAt = new double[5]; shown = 0; target = 0;
    Go(Stage.Installing);
    Thread t = new Thread(InstallWork);
    t.IsBackground = true;
    t.Start();
  }

  void InstallWork() {
    string temp = Path.Combine(Path.GetTempPath(), "AlwarraqSetup-" + Guid.NewGuid().ToString("N"));
    try {
      Directory.CreateDirectory(temp);
      string core = Path.Combine(temp, "core.exe");
      payload.ExtractTo(core, delegate(double p) { target = (float)(p * 0.15); });
      RemovePerUserCopy();
      ProcessStartInfo si = new ProcessStartInfo(core, "/S /D=" + dir); // ‎/D‎ آخرها وبلا علامات تنصيص، ولو في المسار مسافات
      si.UseShellExecute = false;
      si.CreateNoWindow = true;
      using (Process p = Process.Start(si)) {
        while (!p.WaitForExit(400)) {
          double f = Math.Min(0.97, (double)DirSize(dir) / Math.Max(1, payload.Unpacked));
          target = Math.Max(target, (float)(0.15 + 0.85 * f));
        }
        if (p.ExitCode != 0) throw new Exception("رمز الخطأ " + p.ExitCode);
      }
      if (!File.Exists(Path.Combine(dir, "Alwarraq.exe"))) throw new Exception("لم يكتمل نسخ الملفات");
      target = 1;
      Thread.Sleep(900);
      BeginInvoke((Action)delegate { for (int i = 0; i < 5; i++) if (litAt[i] == 0) litAt[i] = Now(); Go(Stage.Done); if (updating) RunApp(); });
    } catch (Exception e) {
      string msg = e.Message;
      BeginInvoke((Action)delegate { Fail("تعذّر التثبيت: " + msg); });
    } finally {
      try { Directory.Delete(temp, true); } catch { }
    }
  }
  /** نسخة قديمة مثبّتة لهذا الحساب وحده تُزال (وبيانات المستخدم في مجلد آخر فتبقى)، فلا يظهر البرنامج مرتين */
  void RemovePerUserCopy() {
    if (KeepOldCopies) return;
    using (RegistryKey root = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall")) {
      if (root == null) return;
      foreach (string name in root.GetSubKeyNames()) {
        string old;
        using (RegistryKey k = root.OpenSubKey(name)) {
          string title = k == null ? null : k.GetValue("DisplayName") as string;
          if (title != APP && title != "الورّاق" && title != "Alwarraq") continue;
          old = k.GetValue("InstallLocation") as string;
        }
        if (string.IsNullOrEmpty(old) || old.TrimEnd('\\').Equals(dir.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) continue;
        string un = Path.Combine(old, "Uninstall Alwarraq.exe");
        if (!File.Exists(un)) continue;
        ProcessStartInfo si = new ProcessStartInfo(un, "/S");
        si.UseShellExecute = false;
        si.CreateNoWindow = true;
        using (Process p = Process.Start(si)) p.WaitForExit(120000);
        // المزيل ينسخ نفسه ويكمل في الخلفية
        for (int i = 0; i < 120 && File.Exists(Path.Combine(old, "Alwarraq.exe")); i++) Thread.Sleep(500);
      }
    }
  }
  static long DirSize(string d) {
    long n = 0;
    try { foreach (string f in Directory.GetFiles(d, "*", SearchOption.AllDirectories)) { try { n += new FileInfo(f).Length; } catch { } } } catch { }
    return n;
  }
  void Fail(string m) { error = m; Go(Stage.Failed); }
  void RunApp() {
    // عبر المستكشف: يعمل البرنامج بصلاحية المستخدم العادية، لا بصلاحية المدير التي طلبها المثبّت
    try { Process.Start(new ProcessStartInfo("explorer.exe", "\"" + Path.Combine(dir, "Alwarraq.exe") + "\"") { UseShellExecute = false }); } catch (Exception e) { Fail("تعذّر تشغيل البرنامج: " + e.Message); return; }
    Close();
  }

  /* ---------- الفأرة ---------- */
  PointF L(Point p) { return new PointF(p.X / scale, p.Y / scale); }
  void OnMove(object s, MouseEventArgs e) {
    if (dragging) { Location = new Point(Location.X + e.X - (int)dragFrom.X, Location.Y + e.Y - (int)dragFrom.Y); return; }
    PointF m = L(e.Location);
    hover = null;
    foreach (Btn b in buttons) if (b.R.Contains(m)) hover = b;
    hoverClose = stage != Stage.Installing && closeBox.Contains(m);
    hoverChange = stage == Stage.Welcome && changeBox.Contains(m);
    Cursor = hover != null || hoverClose || hoverChange ? Cursors.Hand : Cursors.Default;
  }
  void OnDown(object s, MouseEventArgs e) {
    if (e.Button != MouseButtons.Left) return;
    PointF m = L(e.Location);
    if (hoverClose && closeBox.Contains(m)) { Close(); return; }
    if (hoverChange && changeBox.Contains(m)) { ChangeDir(); return; }
    foreach (Btn b in buttons) if (b.R.Contains(m)) { b.Click(); return; }
    dragging = true; dragFrom = e.Location;
  }

  /* ---------- الرسم ---------- */
  protected override void OnPaint(PaintEventArgs e) { Draw(e.Graphics); }

  void Draw(Graphics g) {
    g.SmoothingMode = SmoothingMode.AntiAlias;
    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
    g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
    g.ScaleTransform(scale, scale);
    double t = (frozen.HasValue ? frozen.Value : Now()) - stageAt;
    g.Clear(Paper);
    DrawRail(g, t);
    DrawContent(g, t);
  }

  static GraphicsPath Round(RectangleF r, float d) {
    GraphicsPath p = new GraphicsPath();
    p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
    p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
    p.CloseFigure();
    return p;
  }

  void DrawRail(Graphics g, double t) {
    RectangleF rail = new RectangleF(W - RAIL, 0, RAIL, H);
    using (LinearGradientBrush b = new LinearGradientBrush(new PointF(0, 0), new PointF(0, H), RubricLight, RubricDark)) g.FillRectangle(b, rail);
    using (GraphicsPath p = Round(new RectangleF(rail.X + 12, 12, RAIL - 24, H - 24), 12))
    using (Pen pen = new Pen(A(Gold, 0.35), 1f)) g.DrawPath(pen, p);

    // الشعار كما في شاشة الافتتاح: النقط الخمس تُنقط واحدةً واحدة، ثم يُمدّ الألف
    float s = 3.9f;
    float ox = rail.X + RAIL / 2f - 20.5f * s, oy = H / 2f - 35.5f * s;
    double stem = 0;
    double[] dotScale = new double[5], glow = new double[5], base5 = new double[5];
    if (stage == Stage.Welcome) {
      stem = Ease((t - 0.7) / 0.55);
      double wave = (t - 1.6) % 2.8;
      for (int i = 0; i < 5; i++) {
        dotScale[i] = BackOut((t - 0.05 - 0.12 * i) / 0.32);
        if (t > 1.6) glow[i] = Math.Max(0, Math.Sin(Math.PI * Clamp((wave - 0.16 * i) / 0.6)));
      }
    } else if (stage == Stage.Installing) {
      stem = Ease(shown);
      int cur = 0;
      for (int i = 0; i < 5; i++) {
        base5[i] = 1;
        if (litAt[i] > 0) { dotScale[i] = BackOut(((frozen.HasValue ? frozen.Value : Now()) - litAt[i]) / 0.35); cur = i + 1; }
      }
      if (cur < 5) glow[cur] = 0; // ما لم يُنقط بعد
      if (cur < 5) { dotScale[cur] = 0.55 + 0.25 * Math.Sin(t * 5); }
    } else if (stage == Stage.Done) {
      stem = 1;
      for (int i = 0; i < 5; i++) { dotScale[i] = 1; glow[i] = Math.Max(0, Math.Sin(Math.PI * Clamp(((t % 3.2) - 0.14 * i) / 0.7))); }
    } else {
      stem = 1;
      for (int i = 0; i < 5; i++) base5[i] = 1;
    }

    GraphicsState st = g.Save();
    g.TranslateTransform(ox, oy);
    g.ScaleTransform(s, s);
    for (int i = 0; i < 5; i++) {
      float cx = 12, cy = 7.07f + 14.14f * i;
      if (base5[i] > 0) using (GraphicsPath d = Diamond(cx, cy, 5.2f)) using (Pen pen = new Pen(A(Gold, 0.45), 0.35f)) g.DrawPath(pen, d);
      if (dotScale[i] <= 0.01) continue;
      float size = 7.07f * (float)dotScale[i] * (float)(1 + 0.07 * glow[i]);
      using (GraphicsPath d = Diamond(cx, cy, size))
      using (SolidBrush b = new SolidBrush(Mix(Gold, GoldLight, glow[i]))) g.FillPath(b, d);
    }
    if (stem > 0.005) {
      using (GraphicsPath a = new GraphicsPath()) {
        a.AddLine(27.4f, 5.4f, 36f, 0f);
        a.AddLine(36f, 0f, 36f, 52.5f);
        a.AddBezier(36f, 52.5f, 36f, 60.1f, 34f, 66.1f, 30.6f, 71.5f);
        a.AddBezier(30.6f, 71.5f, 29f, 65.7f, 27.4f, 59.9f, 27.4f, 52.5f);
        a.CloseFigure();
        g.SetClip(new RectangleF(20, -1, 24, 73 * (float)stem), CombineMode.Intersect);
        using (SolidBrush b = new SolidBrush(Paper)) g.FillPath(b, a);
      }
    }
    g.Restore(st);
  }
  static GraphicsPath Diamond(float cx, float cy, float r) {
    GraphicsPath p = new GraphicsPath();
    p.AddPolygon(new[] { new PointF(cx, cy - r), new PointF(cx + r, cy), new PointF(cx, cy + r), new PointF(cx - r, cy) });
    return p;
  }

  void Text2(Graphics g, string s, FontFamily fam, float size, FontStyle style, Color c, RectangleF r, StringAlignment line, bool rtl) {
    using (Font f = new Font(fam, size, style, GraphicsUnit.Pixel))
    using (SolidBrush b = new SolidBrush(c))
    using (StringFormat sf = new StringFormat()) {
      if (rtl) sf.FormatFlags = StringFormatFlags.DirectionRightToLeft;
      sf.Alignment = StringAlignment.Near;
      sf.LineAlignment = line;
      sf.Trimming = StringTrimming.EllipsisPath;
      g.DrawString(s, f, b, r, sf);
    }
  }

  void DrawContent(Graphics g, double t) {
    float right = W - RAIL - 40, left = 40, wid = right - left;
    double fade = stage == Stage.Welcome ? Ease((t - 0.5) / 0.5) : Ease(t / 0.3);

    // زر الإغلاق
    if (stage != Stage.Installing) {
      if (hoverClose) using (SolidBrush b = new SolidBrush(A(Rubric, 0.1))) g.FillEllipse(b, closeBox);
      using (Pen p = new Pen(hoverClose ? Rubric : Muted, 1.4f)) {
        p.StartCap = p.EndCap = LineCap.Round;
        g.DrawLine(p, 20, 20, 30, 30); g.DrawLine(p, 30, 20, 20, 30);
      }
    }

    if (word != null) {
      ImageAttributes ia = new ImageAttributes();
      ColorMatrix cm = new ColorMatrix(); cm.Matrix33 = (float)fade;
      ia.SetColorMatrix(cm);
      float w = 108, h = w * word.Height / word.Width;
      g.DrawImage(word, new Rectangle((int)(right - w), 38, (int)w, (int)h), 0, 0, word.Width, word.Height, GraphicsUnit.Pixel, ia);
    }

    Color ink = A(Ink, fade), muted = A(Muted, fade), rub = A(Rubric, fade);
    if (stage == Stage.Welcome) {
      Text2(g, "إحياء التراث بإخراجٍ يليق به", display, 27, FontStyle.Bold, rub, new RectangleF(left, 136, wid, 46), StringAlignment.Near, true);
      Text2(g, "كتب التراث مُخرَجةً كما تُطبع. كل ما يحتاجه البرنامج داخل هذا الملف، فلا تنزّل شيئاً غيره.", body, 18, FontStyle.Regular, muted, new RectangleF(left, 186, wid, 60), StringAlignment.Near, true);

      Text2(g, "مكان التثبيت", body, 15, FontStyle.Regular, muted, new RectangleF(left, 262, wid, 22), StringAlignment.Near, true);
      changeBox = new RectangleF(left, 286, 54, 26);
      using (Pen p = new Pen(A(hoverChange ? Rubric : Line, fade), 1f)) g.DrawLine(p, left, 314, right, 314);
      Text2(g, "تغيير", display, 16, FontStyle.Bold, rub, new RectangleF(left, 286, 54, 26), StringAlignment.Center, true);
      Text2(g, dir, new FontFamily("Segoe UI"), 13, FontStyle.Regular, ink, new RectangleF(left + 60, 288, wid - 60, 24), StringAlignment.Center, false);
      Text2(g, "الإصدار " + Ar(SetupVersion.V), body, 14, FontStyle.Regular, muted, new RectangleF(left, H - 74, 120, 30), StringAlignment.Center, true);
    } else if (stage == Stage.Installing) {
      double p = Clamp(shown);
      int idx = Math.Min(4, (int)(p * 5));
      Text2(g, Phrases[idx], display, 27, FontStyle.Bold, rub, new RectangleF(left, 150, wid, 46), StringAlignment.Near, true);
      Text2(g, "يُثبَّت " + APP + " على جهازك، ولا يحتاج منك شيئاً.", body, 18, FontStyle.Regular, muted, new RectangleF(left, 200, wid, 34), StringAlignment.Near, true);
      // شريط التقدم من اليمين، وعليه محطات النقط الخمس
      float y = 286, bw = wid;
      using (GraphicsPath b = Round(new RectangleF(left, y - 2.5f, bw, 5), 5)) using (SolidBrush br = new SolidBrush(Line)) g.FillPath(br, b);
      float pw = Math.Max(5, (float)(bw * p));
      using (GraphicsPath b = Round(new RectangleF(right - pw, y - 2.5f, pw, 5), 5)) using (SolidBrush br = new SolidBrush(Gold)) g.FillPath(br, b);
      for (int i = 0; i < 5; i++) {
        float x = right - bw * (i + 1) / 5f;
        bool on = p >= (i + 1) / 5.0 - 0.001;
        using (GraphicsPath d = Diamond(x, y, 7)) {
          using (SolidBrush br = new SolidBrush(on ? Gold : Paper)) g.FillPath(br, d);
          using (Pen pen = new Pen(on ? Gold : Line, 1.4f)) g.DrawPath(pen, d);
        }
      }
      Text2(g, Ar(((int)(p * 100)).ToString()) + "٪", display, 24, FontStyle.Bold, rub, new RectangleF(left, 316, wid, 40), StringAlignment.Near, true);
    } else if (stage == Stage.Done) {
      Text2(g, "تمّ التثبيت", display, 30, FontStyle.Bold, rub, new RectangleF(left, 140, wid, 50), StringAlignment.Near, true);
      Text2(g, APP + " جاهز على جهازك، وتجده على سطح المكتب وفي قائمة ابدأ.", body, 18, FontStyle.Regular, muted, new RectangleF(left, 194, wid, 60), StringAlignment.Near, true);
    } else {
      Text2(g, "لم يكتمل التثبيت", display, 28, FontStyle.Bold, rub, new RectangleF(left, 140, wid, 48), StringAlignment.Near, true);
      Text2(g, error, body, 18, FontStyle.Regular, muted, new RectangleF(left, 192, wid, 110), StringAlignment.Near, true);
    }

    foreach (Btn b in buttons) {
      using (GraphicsPath p = Round(b.R, 10)) {
        if (b.Primary) {
          using (SolidBrush br = new SolidBrush(A(hover == b ? RubricLight : Rubric, fade))) g.FillPath(br, p);
        } else {
          using (SolidBrush br = new SolidBrush(A(hover == b ? Line : Paper, fade))) g.FillPath(br, p);
          using (Pen pen = new Pen(A(Line, fade), 1f)) g.DrawPath(pen, p);
        }
      }
      using (Font f = new Font(display, 19, FontStyle.Bold, GraphicsUnit.Pixel))
      using (SolidBrush br = new SolidBrush(A(b.Primary ? Paper : Ink, fade)))
      using (StringFormat sf = new StringFormat()) {
        sf.FormatFlags = StringFormatFlags.DirectionRightToLeft;
        sf.Alignment = StringAlignment.Center; sf.LineAlignment = StringAlignment.Center;
        g.DrawString(b.Text, f, br, b.R, sf);
      }
    }
  }

  /* ---------- معاينة الشاشات (للبناء فقط) ---------- */
  public static void Preview(string outDir) {
    Directory.CreateDirectory(outDir);
    Action<string, Action<SetupForm>> shot = delegate(string name, Action<SetupForm> set) {
      using (SetupForm f = new SetupForm(true)) {
        f.scale = 1;
        f.stageAt = 0;
        set(f);
        f.Layout2();
        using (Bitmap b = new Bitmap(W, H)) {
          using (Graphics g = Graphics.FromImage(b)) f.Draw(g);
          b.Save(Path.Combine(outDir, name + ".png"), ImageFormat.Png);
        }
      }
    };
    shot("1-intro", delegate(SetupForm f) { f.frozen = 0.55f; });
    shot("2-welcome", delegate(SetupForm f) { f.frozen = 2.3f; });
    shot("3-installing", delegate(SetupForm f) { f.stage = Stage.Installing; f.shown = 0.56; f.litAt = new double[] { 0.5, 1, 0, 0, 0 }; f.frozen = 2f; });
    shot("4-done", delegate(SetupForm f) { f.stage = Stage.Done; f.frozen = 1.1f; });
    shot("5-failed", delegate(SetupForm f) { f.stage = Stage.Failed; f.error = "لا يمكن الكتابة في هذا المجلد. اختر مكاناً آخر."; f.frozen = 1f; });
  }
}
