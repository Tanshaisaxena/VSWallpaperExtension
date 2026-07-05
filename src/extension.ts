import * as vscode from 'vscode';

type StoredImage = { id: string; filename: string; mime: string };

class WallpaperViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'vswallpaper.sidebar';
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Ensure storage dir exists
    try {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    } catch (e) {
      // ignore
    }

    // Send current images
    this.postImages();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'addFromData':
          await this.addImageFromData(msg.mime, msg.data);
          break;
        case 'delete':
          await this.deleteImage(msg.id);
          break;
        case 'setActive':
          await this.setActive(msg.id);
          break;
        case 'requestImages':
          await this.postImages();
          break;
      }
    });
  }

  private async postImages() {
    const images: StoredImage[] = this.context.globalState.get('vswallpaper.images', []);
    const active = this.context.globalState.get('vswallpaper.activeId', undefined);
    // For thumbnails, construct data uris by reading files
    const imgs = await Promise.all(images.map(async (img) => {
      try {
        const uri = vscode.Uri.joinPath(this.context.globalStorageUri, img.filename);
        const bytes = await vscode.workspace.fs.readFile(uri);
        const b64 = Buffer.from(bytes).toString('base64');
        return { ...img, data: `data:${img.mime};base64,${b64}` };
      } catch (e) {
        return { ...img, data: null };
      }
    }));

    this._view?.webview.postMessage({ type: 'images', images: imgs, active });
  }

  private async addImageFromData(mime: string, b64: string) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const ext = mime.split('/').pop() || 'bin';
    const filename = `${id}.${ext}`;
    const uri = vscode.Uri.joinPath(this.context.globalStorageUri, filename);
    const bytes = Buffer.from(b64, 'base64');
    await vscode.workspace.fs.writeFile(uri, bytes);

    const images: StoredImage[] = this.context.globalState.get('vswallpaper.images', []);
    images.unshift({ id, filename, mime });
    await this.context.globalState.update('vswallpaper.images', images);
    await this.setActive(id);
    await this.postImages();
  }

  public async addImageFromUri(fileUri: vscode.Uri) {
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const b64 = Buffer.from(bytes).toString('base64');
      const mime = getMime(fileUri.path);
      await this.addImageFromData(mime, b64);
    } catch (e) {
      vscode.window.showErrorMessage('Failed to add image: ' + String(e));
    }
  }

  private async deleteImage(id: string) {
    const images: StoredImage[] = this.context.globalState.get('vswallpaper.images', []);
    const idx = images.findIndex(i => i.id === id);
    if (idx === -1) return;
    const [removed] = images.splice(idx, 1);
    try {
      const uri = vscode.Uri.joinPath(this.context.globalStorageUri, removed.filename);
      await vscode.workspace.fs.delete(uri);
    } catch (e) {
      // ignore
    }
    await this.context.globalState.update('vswallpaper.images', images);
    const active = this.context.globalState.get('vswallpaper.activeId');
    if (active === id) {
      await this.context.globalState.update('vswallpaper.activeId', images[0]?.id);
    }
    await this.postImages();
  }

  private async setActive(id: string) {
    await this.context.globalState.update('vswallpaper.activeId', id);
    await this.postImages();
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https: http:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: transparent; margin: 8px; }
  .drop { border: 2px dashed var(--vscode-editorWidget-border); border-radius: 6px; padding: 10px; text-align: center; }
  .drop.dragover { border-color: var(--vscode-button-secondaryBackground); background: rgba(128,128,128,0.03); }
  .gallery { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
  .thumb { width:72px; height:72px; border-radius:4px; overflow:hidden; display:flex; align-items:center; justify-content:center; border:1px solid var(--vscode-panel-border); position:relative; }
  .thumb img { max-width:100%; max-height:100%; }
  .thumb .badge { position:absolute; right:2px; top:2px; background:rgba(0,0,0,0.5); color:white; padding:2px 4px; font-size:10px; border-radius:3px; }
  .controls { display:flex; gap:8px; justify-content:center; margin-top:8px; }
  button { padding:6px 8px; }
  .empty { color: var(--vscode-descriptionForeground); text-align:center; margin-top:8px; }
</style>
</head>
<body>
  <div id="dropzone" class="drop">
    <div id="placeholder">Drag & drop images/GIFs here, or click +</div>
    <div class="controls">
      <button id="pick">+ Add</button>
      <button id="clearAll">Clear All</button>
    </div>
    <input id="fileInput" type="file" accept="image/*" style="display:none" multiple />
    <div id="gallery" class="gallery"></div>
    <div id="empty" class="empty">No wallpapers yet</div>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const drop = document.getElementById('dropzone');
  const pick = document.getElementById('pick');
  const fileInput = document.getElementById('fileInput');
  const gallery = document.getElementById('gallery');
  const empty = document.getElementById('empty');
  const clearAll = document.getElementById('clearAll');

  function render(images, active) {
    gallery.innerHTML = '';
    if (!images || images.length === 0) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    images.forEach(img => {
      const div = document.createElement('div');
      div.className = 'thumb';
      const im = document.createElement('img');
      im.src = img.data || '';
      div.appendChild(im);
      if (img.id === active) {
        const b = document.createElement('div'); b.className='badge'; b.textContent='Active'; div.appendChild(b);
      }
      const setBtn = document.createElement('button'); setBtn.textContent = 'Set'; setBtn.style.position='absolute'; setBtn.style.left='2px'; setBtn.style.bottom='2px'; setBtn.style.padding='2px 6px'; setBtn.onclick = () => vscode.postMessage({ type: 'setActive', id: img.id });
      const delBtn = document.createElement('button'); delBtn.textContent = 'Del'; delBtn.style.position='absolute'; delBtn.style.right='2px'; delBtn.style.bottom='2px'; delBtn.style.padding='2px 6px'; delBtn.onclick = () => { if (confirm('Delete this wallpaper?')) vscode.postMessage({ type: 'delete', id: img.id }); };
      div.appendChild(setBtn);
      div.appendChild(delBtn);
      gallery.appendChild(div);
    });
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'images') {
      render(msg.images, msg.active);
    }
  });

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', (e) => { drop.classList.remove('dragover'); });
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('dragover'); const files = e.dataTransfer.files; if (files && files.length) { for (let i=0;i<files.length;i++) readFile(files[i]); } });

  pick.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => { const files = e.target.files; if (files && files.length) { for (let i=0;i<files.length;i++) readFile(files[i]); } fileInput.value = ''; });

  clearAll.addEventListener('click', () => {
    if (!confirm('Delete all saved wallpapers?')) return;
    // delete all: ask extension to send current and delete one by one
    vscode.postMessage({ type: 'requestImages' });
    // extension will send images; we'll then delete them by issuing delete for each
    // to keep simple, after receiving images we'll call deletes
  });

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      const idx = res.indexOf(',');
      const header = res.substring(5, idx);
      const mime = header.split(';')[0];
      const b64 = res.substring(idx+1);
      vscode.postMessage({ type: 'addFromData', mime, data: b64 });
    };
    reader.readAsDataURL(file);
  }

  // When 'images' message arrives after clearAll request, this will be called and delete each
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'images' && msg._requestClearAll) {
      const imgs = msg.images || [];
      for (const i of imgs) { vscode.postMessage({ type: 'delete', id: i.id }); }
    }
  });

  // request initial images
  vscode.postMessage({ type: 'requestImages' });
</script>
</body>
</html>`;
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const provider = new WallpaperViewProvider(context);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(WallpaperViewProvider.viewType, provider));

  context.subscriptions.push(vscode.commands.registerCommand('vswallpaper.addImage', async () => {
    const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] } });
    if (!uris || uris.length === 0) return;
    await provider.addImageFromUri(uris[0]);
  }));
}

export function deactivate() {}

function getMime(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    case 'bmp': return 'image/bmp';
    default: return 'application/octet-stream';
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 16; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
