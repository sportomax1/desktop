# Four Monitor Command Center

A Windows desktop application that shows **independent live HTML dashboards behind desktop icons**, without Lively Wallpaper. Includes a **native Control Center**, the original Denver Sports wallpaper, and interactive mini-game windows.

## Dashboards

| View | Display | Data |
|---|---|---|
| USA Weather | Monitor 1 by default | 15 U.S. cities, temperatures, current weather and Denver details via Open-Meteo |
| Sports | Monitor 2 by default | NFL, NBA, NHL, MLB, NCAA football and men's basketball scoreboards via ESPN's unofficial feed |
| Stocks | Monitor 3 by default | ETFs and selected stocks with daily/delayed prices; Stooq/Yahoo fallbacks |
| Clocks & Games | Monitor 4 by default | Analog and digital clocks, calendar, native clickable Tic-Tac-Toe and 2048 |
| Denver Sports | Optional | Denver Broncos, Nuggets and Avalanche last/next home games and Denver weather |
| No wallpaper | Optional | Leave the Windows background unchanged for that monitor |

**Continuous sports ticker:** Every active dashboard (including Denver Sports) can display a 42px ESPN BottomLine-style ticker along the bottom of its wallpaper. It scrolls NFL, NBA, NHL, MLB, NCAA football and men's basketball scores from ESPN's unofficial scoreboard endpoints, prioritizing Denver/Colorado matchups, with team logos when available. It checks scores every five minutes and displays a clear offline message when data is unavailable. This is **animated ticker content**, not page scrolling. In the Control Center, use **Show scrolling sports ticker on dashboards** and the Slow/Normal/Fast speed selector, then click **Apply to monitors**. The setting applies to all active wallpaper displays and previews. To test without the Windows host, open `web/index.html?view=sports&ticker=1&tickerSpeed=80` from a local web server.

The ticker is **behind regular Windows application windows**, because it is part of the wallpaper. It is not an always-on-top overlay. The ticker automatically stops moving when the operating system requests reduced motion.

**No page scrolling** is designed into the primary dashboard views. The dashboard content adapts to make room for the ticker.

## Get the Windows app from GitHub

1. Open **[Actions → Build Windows desktop app](https://github.com/sportomax1/desktop/actions/workflows/windows-build.yml)**.
2. Select the latest **successful** run on `main` (or run it from **Run workflow**).
3. Download the `FourMonitorCommandCenter-win-x64` artifact ZIP.
4. Unzip both layers if GitHub's artifact contains `FourMonitorCommandCenter-win-x64.zip` inside.
5. Extract to a durable location, for example `C:\Tools\FourMonitorCommandCenter`. Run `DenverFourMonitorWallpaper.exe`.

The GitHub Actions build produces a self-contained .NET runtime deployment, but **Microsoft Edge WebView2 Runtime** must be available (normally included on Windows 11). Do not run the EXE directly from inside the ZIP.

## Local development

On Windows 10/11, with .NET 9 or 10 SDK installed, run **`Start-Here.cmd`** from the repository root. This builds into `Published/` and launches the EXE. `dotnet publish` performs restore and may require internet access.

```powershell
node tests/test-dashboard.js
node tests/test-ticker.js
node tests/test-tictactoe.js
dotnet publish WindowsHost/DenverFourMonitorWallpaper.csproj -c Release -r win-x64 --self-contained true -p:PublishTrimmed=false -o Published
```

## Control Center

The native **Control Center opens automatically at first launch**. It shows each Windows display ID and resolution with:

- Dashboard selector (Weather, Sports, Stocks, Clocks & Games, Denver, or Off)
- Interactive preview button per monitor
- Apply to monitors (persists the selected views)
- Refresh feeds, pause/resume wallpaper, desktop games visibility
- Windows login autostart setting, diagnostics and an optional setting to suppress the Control Center on future launches

Double-click the system-tray icon to reopen Control Center at any time. Your dashboard assignment is saved to `%LOCALAPPDATA%\DenverFourMonitorWallpaper\settings.json` by display ID. Changing which physical monitor Windows calls `DISPLAY1` may require reassigning it.

### Architecture

- `WindowsHost/Program.cs`: WPF/WinForms tray + native control panel, monitor routing, WebView2, desktop WorkerW embedding, API proxy, diagnostics
- `WindowsHost/DesktopTicTacToeWindow.cs`: clickable Tic-Tac-Toe native overlay
- `WindowsHost/Desktop2048Window.cs`: clickable native 2048 overlay
- `web/index.html`, `web/dashboard.js`, `web/dashboard.css`: weather, sports, stocks, clocks SPA
- `web/denver.html`, `web/app.js`, `web/styles.css`: original Denver Sports dashboard
- `tests/`: JS regression tests
- `.github/workflows/windows-build.yml`: automatic Windows x64 build on pushes to `main`

### Important limitations

- ESPN scoreboards and Stooq/Yahoo stock feeds are **unofficial** and may throttle or change. The app shows unavailable feeds rather than fabricated prices/scores. Stock data is **not a real-time exchange feed**.
- Weather uses Open-Meteo; the national overview is a **15-city map**, not precipitation radar. The calendar is a local month view, not connected to Google Calendar.
- Live desktop HTML surfaces cannot reliably receive clicks under Windows Explorer desktop icons, so Tic-Tac-Toe and 2048 use native interactive windows over the clocks display. The preview windows are fully interactive.
- Explorer's `WorkerW`/`Progman` embedding is an **undocumented technique** and can be affected by Windows 11 updates. Tray diagnostics can verify the shell layer.
- Automatic GitHub builds do **not** automatically update an already installed EXE. Download a newer artifact and replace the installation files after quitting the app.

### Troubleshooting

If the tray launches but no background appears, open **Desktop diagnostics** and **Test desktop layer (12 seconds)** in the system tray. If only preview fails, check WebView2. Check `%LOCALAPPDATA%\DenverFourMonitorWallpaper\desktop-host.log`.
