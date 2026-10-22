# Lively integration

The wallpaper is a direct URL package (`Type: 3`) pointing to the local bridge. It loads exactly one HTML/Canvas scene. Graph/image toggles use the bridge event stream; neither `setwp`, wallpaper reload nor window activation is used for toggles.

Start bridge first. Run `Install-Wallpaper.ps1` after browser verification and Lively first-run setup. It writes only a small Lively metadata package to Lively's configured library; all application code and runtime data remain in the development folder. The default target is the primary display. `-PrepareOnly` writes metadata without setting the wallpaper. `-Monitor 1` can explicitly select the display ID shown by Lively.

Configure the hotkey in `runtime/config.json` (`hotkey.modifiers` and `hotkey.key`), then restart `windows/Stop-Hotkey.ps1` / `Start-Hotkey.ps1`. The helper logs registration failures (including occupied shortcuts) and foreground handles to `runtime/hotkey.log`. It is a windowless Win32 message loop, with `RegisterHotKey` + `MOD_NOREPEAT`, no polling and one named-mutex instance. Every physical key press is queued in order for the bridge. If bridge is unavailable the event fails with a log entry rather than opening a window.

Sources inspected 2026-10-21:

- https://github.com/lively-community/lively/wiki/Command-Line-Controls
- https://github.com/lively-community/lively/blob/core-separation/src/Lively/Lively/Commandline/CommandHandler.cs (project directory must be below configured wallpaper directory)
- https://github.com/lively-community/lively/blob/core-separation/src/Lively/Lively.Models/LivelyInfoModel.cs
- https://github.com/lively-community/lively/blob/core-separation/src/Lively/Lively.Models/Enums/WallpaperType.cs
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey

No upstream Lively code is included in this implementation; the project uses its public metadata/CLI interfaces. Lively is separately installed GPLv3 software.

## Verification on this machine

Actual Lively WebView2 acceptance was run using Microsoft's documented temporary process environment flag `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=47832`, inherited only by the test Lively launch. `windows/Test-Lively.mjs` connects to that actual player page and records graph/image screenshots, settled worker/frame counters, timings, rapid target changes and the unchanged page time origin/positions. Normal operation has no debugging port. Lively's own `--debug` option opens developer tools and ignores the port in its WebView2 player; its CLI screenshot timed out here, so neither was used as proof of rendering.

Run `windows/Measure-Idle.ps1` to sample graph and image modes for 20 seconds each, including bridge, helper, Lively and WebView2 processes. It returns to graph mode. Percentages represent one CPU core; working sets include shared pages and must not be mistaken for unique physical memory.

The separately installed Lively 2.2.1.0 WinUI configuration window consumed substantial CPU while hidden on this machine. Closing its window only hid it. During final measurements only that auxiliary `Lively.UI.WinUI` process was stopped; tray/core, watchdog and wallpaper player continued normally. The prototype does not silently terminate a user-opened configuration window. GPU/power consumption has not been measured.

Temporary test flag documentation: https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code

## Desktop mouse interaction (installed Lively 2.2.1.0)

The current `InputForward: 1` setting already enables mouse input. `0` disables forwarding; `2` also forwards keyboard input. Keep mouse-only for this prototype: interacting with the graph should not require forwarding arbitrary typing.

Lively forwards primary-button down/up only while Windows desktop (`Progman` / original `WorkerW`) has focus. Therefore the wallpaper does not react to clicks inside foreground applications. The prototype uses `MouseInputMovAlways: false`, so mouse movement is also forwarded only while the desktop has focus. This preserves desktop dragging and prevents hover redraws behind foreground applications. `Configure-DesktopInput.ps1` applies these ordinary input preferences after a graceful restart, retaining mouse-only forwarding.

Lively's raw-input handler explicitly disables wheel forwarding. The prototype therefore adds a narrowly scoped native wheel hook to the existing hotkey helper. It routes wheel-based touchpad/zoom input only when the bridge reports an actual live wallpaper connection, Windows desktop is foreground, and the pointer is over the primary desktop. Graph mode consumes the native wheel before Explorer can resize icons and emits cursor-anchored zoom through the bridge. Photo mode consumes only Ctrl+wheel/pinch to protect icon size, without zooming the photo; ordinary photo-mode wheel passes through. Other apps and an absent wallpaper always pass through. No keyboard hook or typing capture is used; the Ctrl modifier is queried only for a wheel message. High-resolution deltas coalesce using a 16 ms one-shot timer; there is no active idle timer or synchronous HTTP in the hook.

Native touchpads are device-dependent: this implementation supports gestures Windows exposes as mouse-wheel messages. Actual user wheel/touchpad events were observed reaching the helper and changing the live Canvas zoom, alongside two native Canvas pans; no native input was injected for these checks. Visible zoom buttons remain available. Lively posts down/up messages without explicitly forwarding native double-click messages. Forwarded move messages do not carry the held-left-button flag, so drag state tracks down/up rather than depending on `event.buttons`. Selection uses the actual click event independently of a cancelled drag lifecycle.

Windows shell selection and right-click retain their normal behavior. The visibility companion described below now hides desktop icons in graph mode and shows them after the photo transition. If the companion is disabled, icons remain above the wallpaper and Lively does not exclude icon rectangles from forwarded clicks. The prototype does not hook keyboard input.

The user selected Small (32 px) desktop icons. `windows/desktop-settings` applies the documented Shell `IFolderView2::SetViewModeAndIconSize(FVM_ICON,32)` method, queries the live view before/after, and preserves all existing item positions. It does not write the registry or restart Explorer. Final verification confirmed 32 px and all 80 positions unchanged. Registry values alone were observed to be stale and are not treated as proof of the live setting. Icon size is set only by this explicitly invoked utility, never continuously reset by the helper.

Sources: installed-release `v2.2.1.0` files `Lively.Models/Enums/InputForwardMode.cs`, `Lively/Views/WindowMsg/RawInputMsgWindow.xaml.cs`, `Lively/Core/WinDesktopCore.cs`, and `Lively.Common/Helpers/InputUtil.cs` in the upstream repository.

Native API sources: https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelmouseproc ; https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-msllhookstruct ; https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifolderview2-setviewmodeandiconsize

## Automatic desktop icon visibility

The separate windowless `windows/DesktopVisibility` companion subscribes to bridge mode/presence events. It uses `IFolderView2::SetCurrentFolderFlags` with only the `FWF_NOICONS` mask; it does not hide the taskbar or modify icon size, layout or other folder flags. `Start.ps1` launches it alongside the unchanged hotkey/wheel helper. `windows/Stop-DesktopVisibility.ps1` stops it and restores the original visibility; it also recovers a stale lease if the companion previously crashed.

The user's explicit preference is `desktopIconsInImage: "show"` in `runtime/config.json`: active graph hides icons immediately, active photo shows them after the approximately 500 ms scene transition. Every newer target cancels a pending photo-show request, and stale delayed requests cannot override graph mode. The delay uses a one-shot task; there is no idle polling. The photo policy applies only while the wallpaper is connected. An inactive wallpaper, disconnected bridge or orderly companion shutdown restores the original visibility, including an originally hidden desktop.

The original state is atomically recorded before the first mutation in `runtime/icon-visibility-lease.json` and kept throughout the active wallpaper lifecycle, including photo mode. Photo-show never becomes a newly captured baseline. Startup restores a stale lease before following current mode/presence again. An invalid lease is retained rather than guessing whether icons should be shown. Only this companion owns the lease, enforced by a named mutex. A hard process kill cannot run cleanup immediately; the next start or explicit stop/recovery command uses the saved original state.

Native acceptance covers originally visible and originally hidden baselines, photo-show, the transition delay, rapid reversal, crash/start recovery and orderly shutdown. Live Shell queries verify 32 px, all 80 item positions, taskbar visibility and unrelated flags remain unchanged. Shell item enumeration briefly becomes empty when visibility changes; tests wait for it to settle before comparing positions. Evidence: `runtime/acceptance/desktop-visibility-acceptance.json`.

API reference: https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifolderview2-setcurrentfolderflags

## Host playback notifications

The Lively URL package requests `Arguments: "--pause-event true"`, supported by the installed 2.2.1.0 WebView2 player. Lively invokes `livelyWallpaperPlaybackChanged` with a JSON string containing `IsPaused`. This allows the scene to stop its optional live rendering while the host pauses playback. Direct callback/CLI playback checks do not establish that every fullscreen/power policy was physically exercised.
