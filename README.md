# PixelPal

PixelPal displays a custom image or GIF in an Explorer sidebar view. It is a visual companion for your workspace; it does not alter VS Code's editor background.

## Features

- Drag and drop a local image or GIF into the PixelPal view.
- Use the view header buttons to add, browse, or clear a wallpaper.
- Search trending or keyword-based GIFs through KLIPY.
- Keep the selected image across VS Code restarts.

## GIF search

To search GIFs, add your KLIPY app key in Settings under `vswallpaper.klipyAppKey`. KLIPY testing keys have rate limits; request production access from KLIPY if needed.

PixelPal sends GIF-search requests directly to KLIPY only when you open the GIF browser. The selected image or GIF is stored locally in VS Code's extension storage.

## Development

The shipped extension is implemented in `extension.js`. Open this folder in VS Code and press F5 to run it in an Extension Development Host.

Run `npm run check` before packaging or publishing.

## Publishing

1. Create and verify the `PixelPal-Studios` publisher in the Visual Studio Marketplace.
2. Install the VS Code extension manager: `npm install --global @vscode/vsce`.
3. Run `vsce package` to inspect the generated VSIX, then `vsce publish` to release it.

## License

MIT. The full license text is included in the extension package.
