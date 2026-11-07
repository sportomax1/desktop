using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;
using Forms = System.Windows.Forms;
using Application = System.Windows.Application;
using MessageBox = System.Windows.MessageBox;
using Drawing = System.Drawing;

namespace DenverSportsWallpaper;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        var app = new WallpaperApp();
        app.Run();
    }
}

internal sealed class WallpaperSettings
{
    public string MonitorMode { get; set; } = "all";
    public Dictionary<string, string> DashboardByDisplay { get; set; } = new();
    public bool ShowGamePanels { get; set; } = true;
    public bool ShowSportsTicker { get; set; } = true;
    public int SportsTickerSpeed { get; set; } = 80;
    public bool ShowControlCenterOnLaunch { get; set; } = true;
}

internal sealed class WallpaperApp : Application
{
    internal static readonly string DataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DenverFourMonitorWallpaper");
    internal static readonly string SettingsFile = Path.Combine(DataDir, "settings.json");
    private const string StartupKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string StartupValue = "DenverFourMonitorWallpaper";

    private readonly List<WallpaperWindow> _wallpapers = new();
    private readonly List<WallpaperWindow> _previews = new();
    private readonly List<DesktopTicTacToeWindow> _games = new();
    private readonly List<Desktop2048Window> _games2048 = new();
    private WallpaperSettings _settings = new();
    private Forms.NotifyIcon? _tray;
    private Forms.Form? _controlCenter;
    private Forms.ToolStripMenuItem? _startupItem;
    private Forms.ToolStripMenuItem? _pauseItem;
    private Forms.ToolStripMenuItem? _gameItem;
    private bool _gameVisible = true;
    private bool _paused;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ShutdownMode = ShutdownMode.OnExplicitShutdown;
        Directory.CreateDirectory(DataDir);
        _settings = ReadSettings();
        _gameVisible = _settings.ShowGamePanels;
        AppLog.Write("App start. " + Environment.OSVersion);
        CreateTray();
        TryStartWallpapers();
        StartGames();
        if (_settings.ShowControlCenterOnLaunch)
            Dispatcher.BeginInvoke(new Action(OpenControlCenter), DispatcherPriority.ApplicationIdle);
    }

    private static WallpaperSettings ReadSettings()
    {
        try
        {
            return File.Exists(SettingsFile)
                ? JsonSerializer.Deserialize<WallpaperSettings>(File.ReadAllText(SettingsFile)) ?? new WallpaperSettings()
                : new WallpaperSettings();
        }
        catch { return new WallpaperSettings(); }
    }

    private void SaveSettings()
    {
        File.WriteAllText(SettingsFile, JsonSerializer.Serialize(_settings,
            new JsonSerializerOptions { WriteIndented = true }));
    }

    private void CreateTray()
    {
        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Open Control Center", null, (_, _) => OpenControlCenter());
        menu.Items.Add(new Forms.ToolStripSeparator());
        var previewMenu = new Forms.ToolStripMenuItem("Preview dashboards (interactive)");
        foreach (var kind in DashboardKinds.Where(k => k != "off"))
        {
            var selected = kind;
            previewMenu.DropDownItems.Add(DisplayName(kind), null, (_, _) => OpenPreview(selected));
        }
        menu.Items.Add(previewMenu);
        menu.Items.Add("Manage displays and dashboards", null, (_, _) => OpenControlCenter());
        _gameItem = new Forms.ToolStripMenuItem("Hide desktop games", null, (_, _) => ToggleGame());
        menu.Items.Add(_gameItem);
        _gameItem.Text = _gameVisible ? "Hide desktop games" : "Show desktop games";
        menu.Items.Add("Bring desktop games to front", null, (_, _) => BringGameToFront());
        menu.Items.Add("Refresh live data", null, (_, _) =>
        {
            foreach (var w in _wallpapers.Concat(_previews)) w.RefreshDashboard();
        });
        _pauseItem = new Forms.ToolStripMenuItem("Pause wallpaper", null, (_, _) =>
        {
            _paused = !_paused;
            foreach (var w in _wallpapers)
            {
                if (_paused) w.Hide();
                else w.ShowAndAttach();
            }
            foreach (var game in _games) { if (_paused) game.Hide(); else if (_gameVisible) game.Show(); }
            foreach (var game in _games2048) { if (_paused) game.Hide(); else if (_gameVisible) game.Show(); }
            if (_pauseItem != null) _pauseItem.Text = _paused ? "Resume wallpaper" : "Pause wallpaper";
        });
        menu.Items.Add(_pauseItem);
        menu.Items.Add("Retry desktop attachment", null, (_, _) => RetryAttachment());
        menu.Items.Add("Desktop diagnostics", null, (_, _) => ShowDiagnostics());
        menu.Items.Add("Test desktop layer (12 seconds)", null, (_, _) => TestDesktopLayer());
        menu.Items.Add("Open diagnostic log", null, (_, _) => OpenLog());
        _startupItem = new Forms.ToolStripMenuItem("Start with Windows", null, (_, _) => ToggleStartup());
        menu.Items.Add(_startupItem);
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("Open README", null, (_, _) => OpenReadme());
        menu.Items.Add("Quit", null, (_, _) => Shutdown());

        menu.Opening += (_, _) =>
        {
            if (_startupItem != null) _startupItem.Checked = IsStartupEnabled();
        };
        _tray = new Forms.NotifyIcon
        {
            Icon = Drawing.SystemIcons.Application,
            Text = "Four Monitor Command Center",
            ContextMenuStrip = menu,
            Visible = true
        };
        _tray.DoubleClick += (_, _) => OpenControlCenter();
    }

    private void RetryAttachment()
    {
        _paused = false;
        if (_pauseItem != null) _pauseItem.Text = "Pause wallpaper";
        if (_wallpapers.Count == 0) TryStartWallpapers();
        else foreach (var wallpaper in _wallpapers) wallpaper.ShowAndAttach();
        foreach (var game in _games) if (_gameVisible) game.Show();
        foreach (var game in _games2048) if (_gameVisible) game.Show();
    }

    private void ShowDiagnostics()
    {
        var details = $"Windows: {Environment.OSVersion}\n" +
            $"Mode: {_settings.MonitorMode} | Paused: {_paused}\n" +
            string.Join("\n", Screens().Select(s => s.DeviceName + " => " + DashboardFor(s))) + "\n" +
            Native.DesktopDiagnostics() + "\n" +
            "WebView2 Runtime: " + DetectWebView2Runtime() + "\n\n" +
            string.Join("\n", _wallpapers.Select(w => w.StatusLine)) +
            "\n\nLog: " + AppLog.Path +
            "\n\nIf wallpaper is invisible, enable desktop icons (Desktop > View > Show desktop icons), then use Retry desktop attachment.";
        try { System.Windows.Clipboard.SetText(details); }
        catch { /* Clipboard unavailable: diagnostics still shown and logged. */ }
        AppLog.Write("Diagnostics requested: " + details.Replace('\n', ' '));
        MessageBox.Show(details + "\n\n(Diagnostics copied to the clipboard when available.)",
            "Denver Sports Wallpaper - Desktop diagnostics", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private static void OpenLog()
    {
        Directory.CreateDirectory(DataDir);
        if (!File.Exists(AppLog.Path)) File.WriteAllText(AppLog.Path, "No diagnostics yet.\n");
        Process.Start(new ProcessStartInfo("notepad.exe", $"\"{AppLog.Path}\"") { UseShellExecute = true });
    }

    // Uses a plain WPF window with NO embedded WebView2. If this blue test
    // background cannot appear, the problem is Explorer attachment, not HTML.
    private void TestDesktopLayer()
    {
        var screens = Screens();
        foreach (var screen in screens)
        {
            var label = new System.Windows.Controls.TextBlock
            {
                Text = "DENVER SPORTS WALLPAPER\nDESKTOP LAYER TEST\n\nThis blue screen should appear BEHIND your icons for 12 seconds.",
                Foreground = System.Windows.Media.Brushes.White,
                FontSize = 34,
                FontWeight = FontWeights.Bold,
                TextAlignment = TextAlignment.Center,
                VerticalAlignment = System.Windows.VerticalAlignment.Center,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Center
            };
            var test = new Window
            {
                Title = "Denver Wallpaper Layer Test",
                Content = new System.Windows.Controls.Border
                {
                    Background = System.Windows.Media.Brushes.DarkBlue,
                    Child = label
                },
                Width = screen.Bounds.Width,
                Height = screen.Bounds.Height,
                Left = -32000,
                Top = -32000,
                WindowStartupLocation = WindowStartupLocation.Manual,
                WindowStyle = WindowStyle.None,
                ResizeMode = ResizeMode.NoResize,
                ShowInTaskbar = false,
                ShowActivated = false
            };
            test.SourceInitialized += (_, _) =>
            {
                var result = Native.Embed(new WindowInteropHelper(test).Handle, screen.Bounds);
                AppLog.Write("TEST: " + screen.DeviceName + ": " + result);
                if (!result.Success) test.Dispatcher.BeginInvoke(new Action(test.Close));
            };
            var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(12) };
            timer.Tick += (_, _) => { timer.Stop(); test.Close(); };
            test.Closed += (_, _) => timer.Stop();
            test.Show();
            timer.Start();
        }
    }

    private static string DetectWebView2Runtime()
    {
        try { return CoreWebView2Environment.GetAvailableBrowserVersionString(); }
        catch (Exception ex) { return "unavailable: " + ex.Message; }
    }

    private static readonly string[] DashboardKinds = { "weather", "sports", "stocks", "clocks", "denver", "off" };
    private static string DisplayName(string kind) => kind switch
    {
        "weather" => "USA weather",
        "sports" => "Sports scores · 6 leagues",
        "stocks" => "Stock market · EOD",
        "clocks" => "Clocks, calendar & games",
        "denver" => "Original Denver game day",
        "off" => "No wallpaper (Windows background)",
        _ => kind
    };

    private static Forms.Screen[] Screens() => Forms.Screen.AllScreens
        .OrderBy(s => DisplayOrder(s.DeviceName)).ToArray();

    private static int DisplayOrder(string name)
    {
        var m = System.Text.RegularExpressions.Regex.Match(name, @"(\d+)$");
        return m.Success && int.TryParse(m.Value, out int n) ? n : 999;
    }

    private string DashboardFor(Forms.Screen screen)
    {
        if (_settings.DashboardByDisplay != null &&
            _settings.DashboardByDisplay.TryGetValue(screen.DeviceName, out var selected) &&
            DashboardKinds.Contains(selected)) return selected;
        int index = Array.FindIndex(Screens(), s => s.DeviceName == screen.DeviceName);
        return DashboardKinds[Math.Min(Math.Max(index, 0), 3)];
    }

    // A normal desktop application window for configuring live wallpapers. It is
    // intentionally *not* embedded into WorkerW: click and keyboard input work.
    private void OpenControlCenter()
    {
        if (_controlCenter != null && !_controlCenter.IsDisposed)
        {
            if (_controlCenter.WindowState == Forms.FormWindowState.Minimized)
                _controlCenter.WindowState = Forms.FormWindowState.Normal;
            _controlCenter.Show();
            _controlCenter.BringToFront();
            _controlCenter.Activate();
            return;
        }
        var ink = Drawing.Color.FromArgb(236, 241, 249);
        var muted = Drawing.Color.FromArgb(157, 173, 196);
        var panelColor = Drawing.Color.FromArgb(31, 43, 61);
        var frameColor = Drawing.Color.FromArgb(19, 28, 42);
        var accent = Drawing.Color.FromArgb(69, 139, 244);
        var screens = Screens();
        var form = new Forms.Form
        {
            Text = "Four Monitor Command Center — Dashboard Manager",
            StartPosition = Forms.FormStartPosition.CenterScreen,
            ClientSize = new Drawing.Size(1100, 780),
            MinimumSize = new Drawing.Size(800, 600),
            BackColor = frameColor,
            ForeColor = ink,
            Font = new Drawing.Font("Segoe UI", 10),
            AutoScaleMode = Forms.AutoScaleMode.Dpi
        };
        _controlCenter = form;
        form.FormClosed += (_, _) => _controlCenter = null;

        var heading = new Forms.Panel { Dock = Forms.DockStyle.Top, Height = 105, BackColor = frameColor };
        heading.Controls.Add(new Forms.Label
        {
            Text = "FOUR MONITOR COMMAND CENTER",
            Location = new Drawing.Point(25, 14), Size = new Drawing.Size(960, 40),
            Font = new Drawing.Font("Segoe UI", 20, Drawing.FontStyle.Bold), ForeColor = ink
        });
        heading.Controls.Add(new Forms.Label
        {
            Text = "Choose the view for each Windows display. Changes apply without restarting the app.",
            Location = new Drawing.Point(28, 64), Size = new Drawing.Size(950, 24), ForeColor = muted
        });
        form.Controls.Add(heading);

        var footer = new Forms.Panel { Dock = Forms.DockStyle.Bottom, Height = 180, BackColor = frameColor };
        var status = new Forms.Label
        {
            Text = screens.Length + " display(s) detected  ·  Click Preview to interact with any dashboard",
            Location = new Drawing.Point(24, 10), Size = new Drawing.Size(1000, 24), ForeColor = muted
        };
        footer.Controls.Add(status);
        var startupCheckbox = new Forms.CheckBox
        {
            Text = "Open Control Center at Windows app launch",
            Checked = _settings.ShowControlCenterOnLaunch,
            AutoSize = true, Location = new Drawing.Point(25, 48), ForeColor = ink
        };
        startupCheckbox.CheckedChanged += (_, _) =>
        {
            _settings.ShowControlCenterOnLaunch = startupCheckbox.Checked;
            SaveSettings();
        };
        footer.Controls.Add(startupCheckbox);
        var gamesCheckbox = new Forms.CheckBox
        {
            Text = "Show clickable desktop games",
            Checked = _gameVisible, AutoSize = true,
            Location = new Drawing.Point(405, 48), ForeColor = ink
        };
        gamesCheckbox.CheckedChanged += (_, _) =>
        {
            if (gamesCheckbox.Checked != _gameVisible) ToggleGame();
        };
        footer.Controls.Add(gamesCheckbox);
        var tickerCheckbox = new Forms.CheckBox
        {
            Text = "Show scrolling sports ticker on dashboards",
            Checked = _settings.ShowSportsTicker, AutoSize = true,
            Location = new Drawing.Point(25, 78), ForeColor = ink
        };
        footer.Controls.Add(tickerCheckbox);
        footer.Controls.Add(new Forms.Label
        {
            Text = "Ticker speed",
            Location = new Drawing.Point(405, 80), Size = new Drawing.Size(105, 23), ForeColor = ink
        });
        var tickerSpeed = new Forms.ComboBox
        {
            DropDownStyle = Forms.ComboBoxStyle.DropDownList,
            Location = new Drawing.Point(516, 76), Size = new Drawing.Size(130, 29)
        };
        tickerSpeed.Items.AddRange(new object[] { "Slow", "Normal", "Fast" });
        tickerSpeed.SelectedIndex = _settings.SportsTickerSpeed <= 65 ? 0 :
            _settings.SportsTickerSpeed >= 100 ? 2 : 1;
        footer.Controls.Add(tickerSpeed);
        var buttonPanel = new Forms.FlowLayoutPanel
        {
            Dock = Forms.DockStyle.Bottom, Height = 57, AutoScroll = false,
            FlowDirection = Forms.FlowDirection.RightToLeft, WrapContents = false,
            Padding = new Forms.Padding(18, 7, 18, 5)
        };
        footer.Controls.Add(buttonPanel);
        Forms.Button MakeButton(string text, int width, bool primary = false)
        {
            var button = new Forms.Button
            {
                Text = text, Size = new Drawing.Size(width, 37),
                FlatStyle = Forms.FlatStyle.Flat, BackColor = primary ? accent : panelColor,
                ForeColor = ink, Margin = new Forms.Padding(5, 1, 5, 0),
                Cursor = Forms.Cursors.Hand
            };
            button.FlatAppearance.BorderColor = primary ? accent : Drawing.Color.FromArgb(61, 75, 96);
            return button;
        }
        var selectors = new Dictionary<string, Forms.ComboBox>();
        var applyButton = MakeButton("Apply to monitors", 180, true);
        applyButton.Click += (_, _) =>
        {
            _settings.DashboardByDisplay ??= new Dictionary<string, string>();
            foreach (var pair in selectors)
                if (pair.Value.SelectedIndex >= 0)
                    _settings.DashboardByDisplay[pair.Key] = DashboardKinds[pair.Value.SelectedIndex];
            _settings.ShowSportsTicker = tickerCheckbox.Checked;
            _settings.SportsTickerSpeed = new[] { 55, 80, 120 }[tickerSpeed.SelectedIndex < 0 ? 1 : tickerSpeed.SelectedIndex];
            SaveSettings();
            RebuildDisplays();
            status.Text = "Saved and applied to " + screens.Length + " monitor(s) at " + DateTime.Now.ToString("h:mm tt") + ".";
            status.ForeColor = Drawing.Color.FromArgb(139, 218, 174);
        };
        buttonPanel.Controls.Add(applyButton);
        var refreshButton = MakeButton("Refresh feeds", 125);
        refreshButton.Click += (_, _) =>
        {
            foreach (var w in _wallpapers.Concat(_previews)) w.RefreshDashboard();
            status.Text = "Dashboard feeds refreshed.";
        };
        buttonPanel.Controls.Add(refreshButton);
        var pauseButton = MakeButton(_paused ? "Resume" : "Pause", 96);
        pauseButton.Click += (_, _) =>
        {
            _pauseItem?.PerformClick();
            pauseButton.Text = _paused ? "Resume" : "Pause";
        };
        buttonPanel.Controls.Add(pauseButton);
        var diagnosticsButton = MakeButton("Diagnostics", 117);
        diagnosticsButton.Click += (_, _) => ShowDiagnostics();
        buttonPanel.Controls.Add(diagnosticsButton);
        var windowsStartupButton = MakeButton(IsStartupEnabled() ? "Disable autostart" : "Windows autostart", 158);
        windowsStartupButton.Click += (_, _) =>
        {
            ToggleStartup();
            windowsStartupButton.Text = IsStartupEnabled() ? "Disable autostart" : "Windows autostart";
        };
        buttonPanel.Controls.Add(windowsStartupButton);
        var githubButton = MakeButton("GitHub builds", 128);
        githubButton.Click += (_, _) => Process.Start(new ProcessStartInfo(
            "https://github.com/sportomax1/desktop/actions") { UseShellExecute = true });
        buttonPanel.Controls.Add(githubButton);
        form.Controls.Add(footer);

        var cards = new Forms.FlowLayoutPanel
        {
            Dock = Forms.DockStyle.Fill, BackColor = frameColor,
            AutoScroll = true, WrapContents = true,
            Padding = new Forms.Padding(18, 4, 8, 8)
        };
        form.Controls.Add(cards);
        cards.BringToFront();
        footer.BringToFront();
        heading.BringToFront();
        for (int i = 0; i < screens.Length; i++)
        {
            var screen = screens[i];
            var card = new Forms.Panel
            {
                Size = new Drawing.Size(506, 207),
                BackColor = panelColor,
                Margin = new Forms.Padding(7, 7, 10, 10)
            };
            card.Controls.Add(new Forms.Label
            {
                Text = "MONITOR " + (i + 1),
                Location = new Drawing.Point(18, 15), Size = new Drawing.Size(180, 27),
                Font = new Drawing.Font("Segoe UI", 12, Drawing.FontStyle.Bold), ForeColor = ink
            });
            card.Controls.Add(new Forms.Label
            {
                Text = screen.DeviceName + "   ·   " + screen.Bounds.Width + " × " + screen.Bounds.Height +
                       (screen.Primary ? "   ·   PRIMARY" : ""),
                Location = new Drawing.Point(18, 48), Size = new Drawing.Size(465, 23),
                ForeColor = muted, Font = new Drawing.Font("Segoe UI", 9)
            });
            var combo = new Forms.ComboBox
            {
                DropDownStyle = Forms.ComboBoxStyle.DropDownList,
                Location = new Drawing.Point(18, 93), Size = new Drawing.Size(457, 34),
                Font = new Drawing.Font("Segoe UI", 11)
            };
            foreach (var kind in DashboardKinds) combo.Items.Add(DisplayName(kind));
            combo.SelectedIndex = Array.IndexOf(DashboardKinds, DashboardFor(screen));
            selectors[screen.DeviceName] = combo;
            card.Controls.Add(combo);
            var preview = MakeButton("Preview selected view", 190);
            preview.Location = new Drawing.Point(18, 151);
            preview.Click += (_, _) =>
            {
                if (combo.SelectedIndex < 0) return;
                var selected = DashboardKinds[combo.SelectedIndex];
                if (selected != "off") OpenPreview(selected);
            };
            card.Controls.Add(preview);
            var hint = new Forms.Label
            {
                Text = "Changes take effect when you click Apply",
                Location = new Drawing.Point(221, 160), Size = new Drawing.Size(260, 30),
                ForeColor = muted, Font = new Drawing.Font("Segoe UI", 8)
            };
            card.Controls.Add(hint);
            cards.Controls.Add(card);
        }
        form.Show();
        form.BringToFront();
    }

    private void OpenMonitorManager()
    {
        var screens = Screens();
        using var dialog = new Forms.Form
        {
            Text = "Monitor Manager — Four Monitor Command Center",
            StartPosition = Forms.FormStartPosition.CenterScreen,
            FormBorderStyle = Forms.FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            ShowInTaskbar = false,
            ClientSize = new Drawing.Size(615, Math.Max(265, 160 + screens.Length * 48))
        };
        var title = new Forms.Label { Text = "Assign an independent dashboard to each detected monitor", 
            Location = new Drawing.Point(18, 15), Size = new Drawing.Size(580, 28),
            Font = new Drawing.Font("Segoe UI", 10, Drawing.FontStyle.Bold) };
        dialog.Controls.Add(title);
        var combos = new Dictionary<string, Forms.ComboBox>();
        for (int i = 0; i < screens.Length; i++)
        {
            var screen = screens[i];
            dialog.Controls.Add(new Forms.Label { Text = $"{screen.DeviceName}   {screen.Bounds.Width}×{screen.Bounds.Height}" +
                (screen.Primary ? "  • primary" : ""),
                Location = new Drawing.Point(18, 58 + i * 48), Size = new Drawing.Size(260, 26),
                Font = new Drawing.Font("Segoe UI", 9) });
            var combo = new Forms.ComboBox { DropDownStyle = Forms.ComboBoxStyle.DropDownList,
                Location = new Drawing.Point(287, 53 + i * 48), Size = new Drawing.Size(300, 29) };
            foreach (var kind in DashboardKinds) combo.Items.Add(DisplayName(kind));
            combo.SelectedIndex = Array.IndexOf(DashboardKinds, DashboardFor(screen));
            combos[screen.DeviceName] = combo;
            dialog.Controls.Add(combo);
        }
        int footerY = 65 + screens.Length * 48;
        var info = new Forms.Label { Text = "Saved by Windows display ID. Restart after major display reconfiguration if needed.",
            Location = new Drawing.Point(18, footerY), Size = new Drawing.Size(565, 23) };
        dialog.Controls.Add(info);
        var apply = new Forms.Button { Text = "Apply assignments", Location = new Drawing.Point(430, footerY + 39),
            Size = new Drawing.Size(157, 33), DialogResult = Forms.DialogResult.OK };
        var cancel = new Forms.Button { Text = "Cancel", Location = new Drawing.Point(319, footerY + 39),
            Size = new Drawing.Size(100, 33), DialogResult = Forms.DialogResult.Cancel };
        dialog.AcceptButton = apply;
        dialog.CancelButton = cancel;
        dialog.Controls.Add(apply);
        dialog.Controls.Add(cancel);
        if (dialog.ShowDialog() != Forms.DialogResult.OK) return;
        _settings.DashboardByDisplay ??= new Dictionary<string, string>();
        foreach (var kv in combos) _settings.DashboardByDisplay[kv.Key] = DashboardKinds[kv.Value.SelectedIndex];
        SaveSettings();
        RebuildDisplays();
    }

    private void RebuildDisplays()
    {
        foreach (var w in _wallpapers) w.Close();
        _wallpapers.Clear();
        foreach (var game in _games) game.Dispose();
        foreach (var game in _games2048) game.Dispose();
        _games.Clear();
        _games2048.Clear();
        TryStartWallpapers();
        StartGames();
    }

    // Explorer consumes click events over the wallpaper layer. Native non-topmost
    // game panels are therefore used for actual on-desktop interaction.
    private void StartGames()
    {
        foreach (var screen in Screens().Where(s => DashboardFor(s) == "clocks"))
        {
            try
            {
                var game = new DesktopTicTacToeWindow(screen);
                _games.Add(game);
                if (_gameVisible && !_paused) game.Show();
                var puzzle = new Desktop2048Window(screen);
                _games2048.Add(puzzle);
                if (_gameVisible && !_paused) puzzle.Show();
            }
            catch (Exception ex) { AppLog.Write("Desktop games start failed: " + ex); }
        }
    }

    private void ToggleGame()
    {
        _gameVisible = !_gameVisible;
        _settings.ShowGamePanels = _gameVisible;
        SaveSettings();
        foreach (var game in _games) { if (_gameVisible && !_paused) game.Show(); else game.Hide(); }
        foreach (var game in _games2048) { if (_gameVisible && !_paused) game.Show(); else game.Hide(); }
        if (_gameItem != null) _gameItem.Text = _gameVisible ? "Hide desktop games" : "Show desktop games";
    }

    private void BringGameToFront()
    {
        if (!_gameVisible) ToggleGame();
        foreach (var game in _games) { if (!game.Visible) game.Show(); game.BringToFront(); }
        foreach (var game in _games2048) { if (!game.Visible) game.Show(); game.BringToFront(); }
    }

    private void TryStartWallpapers()
    {
        try
        {
            foreach (var s in Screens())
            {
                if (DashboardFor(s) == "off") continue;
                var wallpaper = new WallpaperWindow(s, DashboardFor(s), _settings.ShowSportsTicker, _settings.SportsTickerSpeed);
                _wallpapers.Add(wallpaper);
                wallpaper.ShowAndAttach();
                if (_paused) wallpaper.Hide();
            }
        }
        catch (Exception ex)
        {
            AppLog.Write("Wallpaper launch failure: " + ex);
            MessageBox.Show("The desktop host could not attach to Windows Explorer. " +
                            "Open the interactive preview from the tray to verify the dashboard.\n\n" + ex.Message,
                            "Four Monitor Command Center", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private void OpenPreview(string view = "weather")
    {
        var preview = new WallpaperWindow(null, view, _settings.ShowSportsTicker, _settings.SportsTickerSpeed);
        _previews.Add(preview);
        preview.Closed += (_, _) => _previews.Remove(preview);
        preview.Show();
        preview.Activate();
    }

    private static string ExePath => Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule?.FileName ?? "";
    private static bool IsStartupEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(StartupKey, false);
        return string.Equals(key?.GetValue(StartupValue) as string,
            $"\"{ExePath}\"", StringComparison.OrdinalIgnoreCase);
    }
    private void ToggleStartup()
    {
        using var key = Registry.CurrentUser.CreateSubKey(StartupKey, true);
        if (IsStartupEnabled()) key.DeleteValue(StartupValue, false);
        else key.SetValue(StartupValue, $"\"{ExePath}\"");
    }
    private static void OpenReadme()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "README.md");
        if (!File.Exists(path)) path = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "README.md"));
        if (File.Exists(path)) Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        else MessageBox.Show("See README.md in the ZIP folder for setup and troubleshooting.");
    }

    protected override void OnExit(ExitEventArgs e)
    {
        foreach (var game in _games) game.Dispose();
        foreach (var game in _games2048) game.Dispose();
        _games.Clear();
        _games2048.Clear();
        _controlCenter?.Dispose();
        if (_tray != null) { _tray.Visible = false; _tray.Dispose(); }
        base.OnExit(e);
    }
}

internal sealed class WallpaperWindow : Window
{
    private static readonly HttpClient Client = CreateClient();
    private readonly Forms.Screen? _screen;
    private readonly string _view;
    private readonly bool _showTicker;
    private readonly int _tickerSpeed;
    private readonly WebView2 _web;
    private bool _attached;
    private bool _webReady;
    private bool _initializationStarted;
    private string _webStatus = "WebView2 initializing";
    private AttachmentResult _lastAttachment;
    private readonly DispatcherTimer? _healthCheck;

    internal string StatusLine => $"{_screen?.DeviceName ?? "Preview"} ({_view}): " +
        $"{(_attached ? "attached" : "not attached")}, Web: {_webStatus}, {_lastAttachment.Method}. {_lastAttachment.Detail}";

    internal WallpaperWindow(Forms.Screen? screen, string view, bool showTicker, int tickerSpeed)
    {
        _screen = screen;
        _view = view;
        _showTicker = showTicker;
        _tickerSpeed = Math.Clamp(tickerSpeed, 40, 160);
        Title = screen == null ? "Denver Sports Wallpaper · Preview" : "Four Monitor Command Center";
        WindowStyle = screen == null ? WindowStyle.SingleBorderWindow : WindowStyle.None;
        ResizeMode = screen == null ? ResizeMode.CanResize : ResizeMode.NoResize;
        ShowInTaskbar = screen == null;
        ShowActivated = screen == null;
        Background = System.Windows.Media.Brushes.Black;
        WindowStartupLocation = screen == null ? WindowStartupLocation.CenterScreen : WindowStartupLocation.Manual;
        Width = screen == null ? 1380 : screen.Bounds.Width;
        Height = screen == null ? 850 : screen.Bounds.Height;
        // Initialize the browser as a normal WPF top-level HWND BEFORE using
        // SetParent. Reparenting from SourceInitialized was causing 0x8007139F.
        if (screen != null)
        {
            Left = -32000;
            Top = -32000;
        }
        _web = new WebView2();
        Content = _web;
        Loaded += OnLoaded;
        if (screen != null)
        {
            _healthCheck = new DispatcherTimer { Interval = TimeSpan.FromSeconds(40) };
            _healthCheck.Tick += (_, _) =>
            {
                if (_webReady && (!_attached || !Native.IsWindow(_lastAttachment.Parent)))
                    AttachToDesktop();
            };
            _healthCheck.Start();
        }
        Closed += (_, _) => _healthCheck?.Stop();
    }

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(18) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36");
        client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        return client;
    }

    internal void ShowAndAttach()
    {
        if (!IsVisible) Show();
        if (_screen != null && _webReady)
            Dispatcher.BeginInvoke(new Action(AttachToDesktop), DispatcherPriority.Loaded);
    }

    private void AttachToDesktop()
    {
        if (_screen == null || !_webReady) return;
        var hwnd = new WindowInteropHelper(this).Handle;
        if (hwnd == IntPtr.Zero) return;
        try
        {
            _lastAttachment = Native.Embed(hwnd, _screen.Bounds);
            _attached = _lastAttachment.Success;
            AppLog.Write(StatusLine);
            if (!_attached)
            {
                // Never cover desktop icons with an unattached window.
                Hide();
            }
        }
        catch (Exception ex)
        {
            _attached = false;
            AppLog.Write("Attach error: " + ex);
            Hide();
        }
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (_initializationStarted) return;
        _initializationStarted = true;
        try
        {
            var folder = Path.Combine(AppContext.BaseDirectory, "web");
            if (!File.Exists(Path.Combine(folder, "index.html")))
                throw new FileNotFoundException("web/index.html was not copied next to the executable.");
            // A new user-data folder isolates old browser processes and profile
            // state from the previous wallpaper version. No existing data deleted.
            var profileName = _screen == null ? "preview" :
                new string(_screen.DeviceName.Where(char.IsLetterOrDigit).ToArray());
            var userData = Path.Combine(WallpaperApp.DataDir, "WebView2-v4", profileName);
            Directory.CreateDirectory(userData);
            AppLog.Write(($"Starting WebView2: {_screen?.DeviceName ?? "Preview"}; " +
                          $"HWND=0x{new WindowInteropHelper(this).Handle.ToInt64():X}; " +
                          $"Runtime={CoreWebView2Environment.GetAvailableBrowserVersionString()}; Profile={userData}"));
            var browserEnvironment = await CoreWebView2Environment.CreateAsync(null, userData);
            await _web.EnsureCoreWebView2Async(browserEnvironment);
            _webStatus = "WebView2 ready";
            _webReady = true;
            AppLog.Write(_webStatus + ": " + (_screen?.DeviceName ?? "Preview"));
            _web.CoreWebView2.SetVirtualHostNameToFolderMapping("denverwalls.local", folder,
                CoreWebView2HostResourceAccessKind.Allow);
            _web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _web.CoreWebView2.Settings.IsZoomControlEnabled = false;
            _web.CoreWebView2.WebMessageReceived += HandleWebRequest;
            // Register before Navigate so even a very fast local navigation
            // cannot complete without triggering desktop attachment.
            // Keep the host a normal top-level window until WebView2 has created
            // its child HWND and navigated. Only then move it behind desktop icons.
            if (_screen != null)
            {
                _web.CoreWebView2.NavigationCompleted += (_, args) =>
                {
                    AppLog.Write("First navigation: " + args.IsSuccess + ", " + args.WebErrorStatus);
                    if (!_attached) Dispatcher.BeginInvoke(new Action(AttachToDesktop), DispatcherPriority.Background);
                };
            }
            var page = _view == "denver" ? "denver.html" :
                "index.html?view=" + Uri.EscapeDataString(_view) + "&embedded=" + (_screen != null ? "1" : "0");
            page += (page.Contains("?") ? "&" : "?") + "ticker=" + (_showTicker ? "1" : "0") +
                    "&tickerSpeed=" + _tickerSpeed;
            _web.CoreWebView2.Navigate("https://denverwalls.local/" + page);
        }
        catch (Exception ex)
        {
            _webStatus = "FAILED " + $"0x{ex.HResult:X8}: " + ex.Message;
            AppLog.Write("WebView2 initialization failure (" + (_screen?.DeviceName ?? "Preview") + "): " + ex);
            // Avoid disruptive dialogs on every monitor. The tray diagnostics
            // contain the complete exception; show an error for previews only.
            if (_screen == null)
                MessageBox.Show("The HTML preview could not initialize.\n\n" + _webStatus +
                                "\n\nOpen the tray's diagnostic log for details.",
                    "Four Monitor Command Center", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void HandleWebRequest(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string id = "";
        try
        {
            using var message = JsonDocument.Parse(e.WebMessageAsJson);
            var root = message.RootElement;
            if (root.GetProperty("type").GetString() != "api") return;
            id = root.GetProperty("requestId").GetString() ?? "";
            var rawUrl = root.GetProperty("url").GetString() ?? "";
            if (id.Length > 64 || !IsApprovedApi(rawUrl))
                throw new InvalidOperationException("API endpoint is not approved.");
            using var response = await Client.GetAsync(rawUrl);
            response.EnsureSuccessStatusCode();
            var raw = await response.Content.ReadAsStringAsync();
            if (raw.Length > 5_000_000) throw new InvalidOperationException("API response exceeded size limit.");
            if (new Uri(rawUrl).Host.Equals("stooq.com", StringComparison.OrdinalIgnoreCase))
            {
                SendResponse(id, new { type = "api-response", requestId = id, ok = true, data = raw });
            }
            else
            {
                using var payload = JsonDocument.Parse(raw);
                SendResponse(id, new { type = "api-response", requestId = id, ok = true, data = payload.RootElement });
            }
        }
        catch (Exception ex)
        {
            SendResponse(id, new { type = "api-response", requestId = id, ok = false, error = ex.Message });
        }
    }

    private static bool IsApprovedApi(string raw)
    {
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttps) return false;
        if (url.Host == "site.api.espn.com")
            return url.AbsolutePath.StartsWith("/apis/site/v2/sports/", StringComparison.OrdinalIgnoreCase)
                && (url.AbsolutePath.EndsWith("/schedule", StringComparison.OrdinalIgnoreCase)
                    || url.AbsolutePath.EndsWith("/scoreboard", StringComparison.OrdinalIgnoreCase));
        if ((url.Host == "query1.finance.yahoo.com" || url.Host == "query2.finance.yahoo.com") &&
            url.AbsolutePath.StartsWith("/v8/finance/chart/", StringComparison.OrdinalIgnoreCase))
        {
            var symbol = url.AbsolutePath.Substring("/v8/finance/chart/".Length);
            var query = System.Web.HttpUtility.ParseQueryString(url.Query);
            return System.Text.RegularExpressions.Regex.IsMatch(symbol, @"^[a-zA-Z0-9.\^-]{1,20}$") &&
                query["interval"] == "1d" && query["range"] == "1mo";
        }
        if (url.Host == "stooq.com" && url.AbsolutePath == "/q/d/l/")
        {
            var query = System.Web.HttpUtility.ParseQueryString(url.Query);
            var symbol = query["s"] ?? "";
            return System.Text.RegularExpressions.Regex.IsMatch(symbol, @"^[a-z0-9.\^-]{1,20}$") &&
                query["i"] == "d" && System.Text.RegularExpressions.Regex.IsMatch(query["d1"] ?? "", @"^\d{8}$");
        }
        if (url.Host == "api.open-meteo.com") return url.AbsolutePath == "/v1/forecast";
        if (url.Host == "archive-api.open-meteo.com") return url.AbsolutePath == "/v1/archive";
        return false;
    }

    private void SendResponse(string id, object data)
    {
        if (string.IsNullOrEmpty(id) || _web.CoreWebView2 == null) return;
        // Serialize while the source JsonDocument is still alive.
        var json = JsonSerializer.Serialize(data);
        Dispatcher.BeginInvoke(new Action(() =>
        {
            try { _web.CoreWebView2?.PostWebMessageAsJson(json); }
            catch { /* Window closed during a fetch. */ }
        }));
    }

    internal void RefreshDashboard()
    {
        try { _web.CoreWebView2?.Reload(); } catch { }
    }
}

internal static class AppLog
{
    internal static string Path => System.IO.Path.Combine(WallpaperApp.DataDir, "desktop-host.log");
    internal static void Write(string text)
    {
        try
        {
            Directory.CreateDirectory(WallpaperApp.DataDir);
            File.AppendAllText(Path, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {text}\n");
        }
        catch { /* Logging must never prevent a wallpaper from starting. */ }
    }
}

internal readonly record struct AttachmentResult(bool Success, IntPtr Parent, string Method, string Detail);

internal static class Native
{
    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] private struct Point { internal int X; internal int Y; }

    private const long WsPopup = unchecked((long)0x80000000);
    private const long WsChild = 0x40000000;
    private const long WsExNoActivate = 0x08000000;
    private const long WsExToolWindow = 0x00000080;
    private const long WsExNoRedirectionBitmap = 0x00200000;
    private const uint SwpNoActivate = 0x0010;
    private const uint SwpFrameChanged = 0x0020;
    private const uint SwpShowWindow = 0x0040;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string className, string? windowName);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string? windowName);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc proc, IntPtr lParam);
    [DllImport("user32.dll")] private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wParam,
        IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr newLong);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetParent(IntPtr child, IntPtr newParent);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool ScreenToClient(IntPtr hwnd, ref Point p);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr hwnd, IntPtr after,
        int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] internal static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);

    private static IntPtr GetProgman() => FindWindow("Progman", null);

    private static bool UsesRaisedDesktop(IntPtr progman) => progman != IntPtr.Zero &&
        (GetWindowLongPtr(progman, -20).ToInt64() & WsExNoRedirectionBitmap) != 0;

    private static void RequestWorker(IntPtr progman, bool raised)
    {
        // Windows 11 24H2+ uses different arguments than the classic WorkerW command.
        if (raised)
            SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), 0, 1200, out _);
        else
            SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1200, out _);
    }

    private static IntPtr FindClassicWorker()
    {
        IntPtr worker = IntPtr.Zero;
        EnumWindows((hwnd, _) =>
        {
            if (FindWindowEx(hwnd, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero) return true;
            worker = FindWindowEx(IntPtr.Zero, hwnd, "WorkerW", null);
            return worker == IntPtr.Zero;
        }, IntPtr.Zero);
        return worker;
    }

    internal static string DesktopDiagnostics()
    {
        var progman = GetProgman();
        if (progman == IntPtr.Zero) return "Progman not found (Explorer may not be running).";
        var raised = UsesRaisedDesktop(progman);
        var childWorker = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
        var classicWorker = FindClassicWorker();
        var iconLayer = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        return $"Shell: {(raised ? "Windows 11 raised desktop" : "classic desktop")}\n" +
            $"Progman: 0x{progman.ToInt64():X} (visible: {IsWindowVisible(progman)})\n" +
            $"Child WorkerW: 0x{childWorker.ToInt64():X} (visible: {(childWorker != IntPtr.Zero && IsWindowVisible(childWorker))})\n" +
            $"Classic WorkerW: 0x{classicWorker.ToInt64():X}\n" +
            $"Desktop icons layer: 0x{iconLayer.ToInt64():X}";
    }

    internal static AttachmentResult Embed(IntPtr window, Drawing.Rectangle bounds)
    {
        var progman = GetProgman();
        if (progman == IntPtr.Zero)
            return new AttachmentResult(false, IntPtr.Zero, "No Progman", "Windows Explorer desktop was not found.");

        var raised = UsesRaisedDesktop(progman);
        RequestWorker(progman, raised);
        IntPtr worker;
        string mode;
        if (raised)
        {
            // Modern Windows 11: WorkerW is a CHILD of Progman, below ShellDLL_DefView.
            worker = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
            mode = "Windows 11 child WorkerW";
            if (worker == IntPtr.Zero)
            {
                // Prefer an attached Progman layer over silently hiding all wallpaper windows.
                worker = progman;
                mode = "Windows 11 Progman fallback";
            }
        }
        else
        {
            worker = FindClassicWorker();
            mode = "Classic WorkerW";
            if (worker == IntPtr.Zero)
            {
                worker = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
                mode = "Progman child WorkerW fallback";
            }
            if (worker == IntPtr.Zero)
            {
                worker = progman;
                mode = "Classic Progman fallback";
            }
        }

        // WPF creates a top-level popup window. Make it a child of the desktop layer.
        var style = GetWindowLongPtr(window, -16).ToInt64();
        style = (style & ~WsPopup) | WsChild;
        SetWindowLongPtr(window, -16, new IntPtr(style));

        var exStyle = GetWindowLongPtr(window, -20).ToInt64();
        exStyle |= WsExNoActivate | WsExToolWindow;
        // Do not force WS_EX_LAYERED on the WebView2 parent window.
        // Its browser controller uses a child HWND and can fail when the
        // parent changes composition modes during initialization.
        SetWindowLongPtr(window, -20, new IntPtr(exStyle));

        // Do not treat SetParent's zero return value alone as an error; it returns the OLD
        // parent, which can legitimately be NULL for a previously top-level window.
        SetParent(window, worker);

        var p = new Point { X = bounds.Left, Y = bounds.Top };
        if (!ScreenToClient(worker, ref p))
            return new AttachmentResult(false, worker, mode,
                $"Monitor coordinate conversion failed: Win32 error {Marshal.GetLastWin32Error()}");

        // The Progman fallback must be BELOW the desktop icons, not the top child.
        var after = worker == progman ? new IntPtr(1) : IntPtr.Zero; // HWND_BOTTOM
        var flags = SwpNoActivate | SwpFrameChanged | SwpShowWindow;
        if (worker != progman) flags |= 0x0004; // SWP_NOZORDER
        var positioned = SetWindowPos(window, after, p.X, p.Y, bounds.Width, bounds.Height, flags);
        if (!positioned)
            return new AttachmentResult(false, worker, mode,
                $"SetWindowPos failed: Win32 error {Marshal.GetLastWin32Error()}");

        return new AttachmentResult(true, worker, mode,
            $"Parent 0x{worker.ToInt64():X}; screen ({bounds.Left},{bounds.Top}) {bounds.Width}x{bounds.Height}." +
            (worker == progman ? " Progman fallback may be covered by Windows static wallpaper." : ""));
    }
}
