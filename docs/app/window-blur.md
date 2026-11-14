# Window blur

The parts of the window that are translucent show a blurred backdrop where the system provides one:

| System | Blur behind the window |
| :----- | :--------------------- |
| macOS | Built in (vibrancy), nothing to set up. |
| Windows | Not available yet; the window gets a darker, more opaque tint. |
| GNOME on Linux | Through the [Blur my Shell](https://extensions.gnome.org/extension/3193/blur-my-shell/) extension, see below. |
| Other Linux desktops | Only if the desktop blurs windows itself (for example a KDE Plasma blur rule); the app cannot ask for it. |

Electron cannot blur behind a window on Linux and the app cannot tell whether the desktop does, so it starts with opaque panels and a solid window background. Once the desktop blurs the window, choose **Use translucent panels** under **Window blur** on the Settings tab (**Use opaque panels** goes back). The choice is saved with the other settings. The window itself stays transparent, so the choice applies at once without a restart: with the opaque panels the page paints the background of the theme over the whole window, with the translucent ones only a light tint (`PlayerHome.scss`).

## GNOME with Blur my Shell

1. Install Blur my Shell from [extensions.gnome.org](https://extensions.gnome.org/extension/3193/blur-my-shell/) or the Extension Manager app, and turn it on.
2. In its preferences, open the **Applications** tab and turn on **Blur all windows** (or add `Tunelle` to the whitelist; the window class is `Tunelle`, `tunelle-dev` for a development run).
3. Turn off **Opaque focused window**. Left on, the extension blurs only windows that are not focused, so Tunelle would show no blur while you use it.
4. Leave **Opacity** at 255: the extension then keeps the window's own transparency and the blur shows through the translucent parts. Lower values make the whole window, panels included, more see-through.
5. In Tunelle, choose **Use translucent panels** on the Settings tab.

Tested with Blur my Shell 76 on GNOME 50 (Wayland). Without the extension, GNOME draws nothing behind the window, so keep the opaque panels there.
