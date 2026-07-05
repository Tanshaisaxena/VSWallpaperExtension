VS Wallpaper - VS Code Explorer Wallpaper Sidebar

This extension provides a sidebar view inside the Explorer where you can:
- Drag and drop a local image or GIF into the wallpaper panel
- Use the view header buttons to add a local image, browse internet GIFs, or clear the current wallpaper
- Click the + Add button in the view header to open a file picker and choose an image/GIF
- Click Browse GIFs to search trending or keyword-based GIFs and set one as the background
- Clear the wallpaper to remove the current image and return to the placeholder state

Storage
- Images are stored on disk inside the extension global storage directory (context.globalStorageUri) as files
- The active wallpaper is stored in globalState under "vswallpaper.image"

Build & run (development)
1. Open this folder in VS Code
2. Run `npm install` to install dev dependencies
3. Run `npm run build` to compile TypeScript to the out/ folder
4. Press F5 (Run Extension) to launch an Extension Development Host
5. In the new host window, open the Activity Bar icon named "Wallpaper" and use the view

Files of interest
- src/extension.ts: TypeScript source implementing the WebviewViewProvider, disk storage, and gallery
- package.json: scripts and build configuration
- tsconfig.json: TypeScript compiler options
- media/icon.svg: Activity bar icon

Notes & improvements
- Large images are stored as files; consider limiting file size or adding thumbnails generated on disk
- Could add export/import, multiple galleries, or sync to cloud
