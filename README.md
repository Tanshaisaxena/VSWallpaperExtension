VS Wallpaper - VS Code Sidebar Extension (TypeScript, disk storage, gallery)

This extension provides a sidebar view where you can:
- Drag and drop images or GIFs into the view (supports multiple)
- Click the + button to open a file picker and add one or more images
- View a gallery of saved images, set an "Active" wallpaper, delete items, or clear all

Storage
- Images are stored on disk inside the extension global storage directory (context.globalStorageUri) as files
- Metadata (id, filename, mime) is stored in globalState under "vswallpaper.images"
- Active wallpaper id is stored under "vswallpaper.activeId"

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
