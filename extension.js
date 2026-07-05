const vscode = require('vscode');

let currentPanel = undefined; // WebviewPanel reference

// Simplified, robust extension implementation
class WallpaperViewProvider {
  constructor(context) {
    this.context = context;
    this._view = undefined;
  }

  resolveWebviewView(webviewView) {
    console.log('VS Wallpaper: resolveWebviewView called');
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml(webviewView.webview);

    const stored = this.context.globalState.get('vswallpaper.image');
    if (stored) {
      console.log('VS Wallpaper: resolveWebviewView posting stored image to webview');
      webviewView.webview.postMessage({ type: 'loadImage', image: stored });
    }

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      console.log('VS Wallpaper: webview message', msg && msg.type);
      if (msg.type === 'setImage') {
        try {
          const ext = (msg.image.mime || '').split('/').pop() || 'img';
          const filename = `current_wallpaper.${ext}`;
          const uri = vscode.Uri.joinPath(this.context.globalStorageUri, filename);
          const bytes = Buffer.from(msg.image.data, 'base64');
          await vscode.workspace.fs.createDirectory(this.context.globalStorageUri).catch(() => {});
          await vscode.workspace.fs.writeFile(uri, bytes);
          const stored = { mime: msg.image.mime, data: msg.image.data, filename };
          await this.context.globalState.update('vswallpaper.image', stored);
          // Ask the extension to refresh any tree view
          await vscode.commands.executeCommand('vswallpaper.refresh');
          console.log('VS Wallpaper: stored image from webview', filename);
        } catch (e) {
          console.error('VS Wallpaper: failed storing image from webview', e);
        }
      } else if (msg.type === 'clearImage') {
        await this.context.globalState.update('vswallpaper.image', undefined);
        await vscode.commands.executeCommand('vswallpaper.refresh');
        console.log('VS Wallpaper: cleared stored image');
      }
    });
  }

  _getHtml(webview) {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: transparent; margin:8px; background-size: cover; background-position: center; }
  .drop { border: 2px dashed var(--vscode-editorWidget-border); padding:8px; border-radius:6px; text-align:center; background: rgba(0,0,0,0.25); }
  img { max-width:100%; max-height:240px; display:block; margin:8px auto; box-shadow: 0 0 8px rgba(0,0,0,0.6) }
  .controls { display:flex; gap:8px; justify-content:center }
</style>
</head>
<body>
  <div id="drop" class="drop">
    <div id="placeholder">Drag & drop an image/GIF here or click +</div>
    <img id="preview" style="display:none" />
    <div class="controls">
      <button id="pick">+ Add</button>
      <button id="clear">Clear</button>
    </div>
    <input id="file" type="file" accept="image/*" style="display:none" />
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const pick = document.getElementById('pick');
  const file = document.getElementById('file');
  const preview = document.getElementById('preview');
  const placeholder = document.getElementById('placeholder');
  const clear = document.getElementById('clear');

  function show(img) {
    if (!img) {
      preview.style.display='none';
      placeholder.style.display='block';
      preview.src='';
      document.body.style.backgroundImage = 'none';
      return;
    }
    const dataUrl = 'data:' + img.mime + ';base64,' + img.data;
    // set as background (cover) and also show a preview image
    document.body.style.backgroundImage = 'url(' + dataUrl + ')';
    preview.src = dataUrl;
    preview.style.display = 'block';
    placeholder.style.display='none';
  }

  window.addEventListener('message', e => { const m = e.data; if (m.type === 'loadImage') show(m.image); });

  pick.onclick = () => file.click();
  file.onchange = () => { if (file.files.length) read(file.files[0]); file.value=''; };
  clear.onclick = () => { show(null); vscode.postMessage({ type: 'clearImage' }); };

  function read(f) {
    const r = new FileReader();
    r.onload = () => {
      const res = r.result; const idx = res.indexOf(','); const header = res.substring(5, idx); const mime = header.split(';')[0]; const b64 = res.substring(idx+1);
      show({ mime, data: b64 });
      vscode.postMessage({ type: 'setImage', image: { mime, data: b64 } });
    };
    r.readAsDataURL(f);
  }

  const drop = document.getElementById('drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', e => { drop.classList.remove('dragover'); });
  drop.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) read(f); });
</script>
</body>
</html>`;
  }
}

function createOrShowPanel(context, stored) {
  const column = vscode.ViewColumn.One;
  if (currentPanel) {
    currentPanel.reveal(column);
    currentPanel.webview.postMessage({ type: 'loadImage', image: stored });
    return;
  }

  currentPanel = vscode.window.createWebviewPanel('vswallpaper.panel', 'Wallpaper', column, { enableScripts: true, retainContextWhenHidden: true });
  currentPanel.webview.html = getPanelHtml(stored);
  currentPanel.onDidDispose(() => { currentPanel = undefined; }, null, context.subscriptions);
}

function getPanelHtml(stored) {
  const dataUrl = stored ? ('data:' + stored.mime + ';base64,' + stored.data) : null;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" /><style>html,body{height:100%;margin:0}body{background:#1e1e1e;display:flex;align-items:center;justify-content:center}#bg{position:absolute;inset:0;background-size:cover;background-position:center;filter: none;}#content{position:relative;z-index:2;color:white;padding:20px;background:rgba(0,0,0,0.25);border-radius:6px}img{max-width:80vw;max-height:80vh;box-shadow:0 8px 30px rgba(0,0,0,0.6)}</style></head><body>` +
    (dataUrl ? (`<div id="bg" style="background-image:url('${dataUrl}')"></div><div id="content"><img src="${dataUrl}"></div>`) : `<div id="content">No wallpaper set</div>`) +
    `<script>window.addEventListener('message',e=>{const m=e.data;if(m.type==='loadImage'){const d='data:'+m.image.mime+';base64,'+m.image.data;document.getElementById('bg').style.backgroundImage='url('+d+')';document.querySelector('#content img').src=d}})</script></body></html>`;
}

function activate(context) {
  console.log('VS Wallpaper: activate');

  const provider = new WallpaperViewProvider(context);
  // Register the WebviewViewProvider under the Explorer view id
  try {
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('vswallpaper.explorer', provider));
    console.log('VS Wallpaper: registered webview provider for vswallpaper.explorer');
  } catch (e) {
    console.error('VS Wallpaper: failed to register webview provider', e);
  }

  // Status bar item to reveal the Wallpaper view on demand
  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  sb.text = '$(image) Show Wallpaper';
  sb.command = 'vswallpaper.show';
  sb.tooltip = 'Show Wallpaper view';
  sb.show();
  context.subscriptions.push(sb);

  context.subscriptions.push(vscode.commands.registerCommand('vswallpaper.show', async () => {
    // Try to reveal the Explorer view and post stored image if any
    try {
      await vscode.commands.executeCommand('workbench.view.explorer');
    } catch (e) { console.warn('VS Wallpaper: reveal command failed', e && e.message); }
    // small delay then post
    await new Promise(r => setTimeout(r, 300));
    const stored = context.globalState.get('vswallpaper.image');
    if (provider._view && stored) {
      try { provider._view.webview.postMessage({ type: 'loadImage', image: stored }); console.log('VS Wallpaper: posted stored image on show'); } catch (e) { console.error('VS Wallpaper: post on show failed', e); }
    }
  }));

  // If there's already an image stored, show the Wallpaper view once so user sees content
  (async () => {
    const stored = context.globalState.get('vswallpaper.image');
    if (stored) {
      try { await vscode.commands.executeCommand('workbench.view.explorer'); } catch (e) {}
      await new Promise(r => setTimeout(r, 300));
      if (provider._view) {
        try { provider._view.webview.postMessage({ type: 'loadImage', image: stored }); } catch (e) {}
      }
    }
  })();

  // Removed TreeDataProvider so the Explorer view will host the WebviewView directly.
  // Provide a refresh command that notifies the webview to reload the stored image.
  context.subscriptions.push(vscode.commands.registerCommand('vswallpaper.refresh', async () => {
    const stored = context.globalState.get('vswallpaper.image');
    if (provider._view) {
      provider._view.webview.postMessage({ type: 'loadImage', image: stored });
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vswallpaper.addImage', async () => {
    try {
      const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Images: ['png','jpg','jpeg','gif','webp','svg','bmp'] } });
      if (!uris || uris.length === 0) return;
      const file = uris[0];
      const bytes = await vscode.workspace.fs.readFile(file);
      const b64 = Buffer.from(bytes).toString('base64');
      const mime = getMime(file.path);
      const ext = (mime||'').split('/').pop() || 'img';
      const filename = `current_wallpaper.${ext}`;
      const uri = vscode.Uri.joinPath(context.globalStorageUri, filename);
      await vscode.workspace.fs.createDirectory(context.globalStorageUri).catch(()=>{});
      await vscode.workspace.fs.writeFile(uri, Buffer.from(b64, 'base64'));
      const stored = { mime, data: b64, filename };
      await context.globalState.update('vswallpaper.image', stored);
      // Try to reveal the Activity Bar view container so the WebviewView resolves.
      const revealCommands = ['workbench.view.explorer'];
      for (const cmd of revealCommands) {
        try {
          await vscode.commands.executeCommand(cmd);
          console.log('VS Wallpaper: executed reveal command', cmd);
          break;
        } catch (e) {
          console.warn('VS Wallpaper: reveal command failed', cmd, e && e.message);
        }
      }

      // Trigger refresh hook in case the view is already resolved
      try { await vscode.commands.executeCommand('vswallpaper.refresh'); } catch (e) { }

      // Poll for the webview to be available and post the image when it is
      let posted = false;
      for (let i = 0; i < 20; i++) {
        if (provider._view) {
          try {
            provider._view.webview.postMessage({ type: 'loadImage', image: stored });
            console.log('VS Wallpaper: posted image to webview');
            posted = true;
            break;
          } catch (e) {
            console.error('VS Wallpaper: post error', e);
          }
        }
        await new Promise(r => setTimeout(r, 100));
      }

      if (!posted) {
        console.warn('VS Wallpaper: webview not resolved after reveal attempts — opening the image in an editor as a fallback.');
        try {
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(context.globalStorageUri, filename));
        } catch (e) { console.error('VS Wallpaper: failed to open fallback editor', e); }
      }

      // Also open or show the panel that reliably displays the wallpaper
      try {
        createOrShowPanel(context, stored);
      } catch (e) { console.error('VS Wallpaper: createOrShowPanel error', e); }

      console.log('VS Wallpaper: added image', filename);
    } catch (e) { console.error('VS Wallpaper: addImage error', e); vscode.window.showErrorMessage('Failed to add image'); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vswallpaper.openWallpaper', async () => {
    const stored = context.globalState.get('vswallpaper.image');
    if (!stored) { vscode.window.showInformationMessage('No wallpaper stored'); return; }
    const filename = stored.filename || `current_wallpaper.${(stored.mime||'').split('/').pop()||'img'}`;
    const uri = vscode.Uri.joinPath(context.globalStorageUri, filename);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(stored.data, 'base64')).catch(e => { console.error('VS Wallpaper: open write error', e); });
    await vscode.commands.executeCommand('vscode.open', uri).catch(e => { console.error('VS Wallpaper: open command error', e); });
  }));

  // Command to open a reliable wallpaper panel
  context.subscriptions.push(vscode.commands.registerCommand('vswallpaper.openPanel', async () => {
    const stored = context.globalState.get('vswallpaper.image');
    if (!stored) { vscode.window.showInformationMessage('No wallpaper stored'); return; }
    createOrShowPanel(context, stored);
  }));
}

function getMime(path) { const ext = (path||'').split('.').pop().toLowerCase(); switch (ext) { case 'png': return 'image/png'; case 'jpg': case 'jpeg': return 'image/jpeg'; case 'gif': return 'image/gif'; case 'webp': return 'image/webp'; case 'svg': return 'image/svg+xml'; case 'bmp': return 'image/bmp'; default: return 'application/octet-stream'; } }
function getNonce() { let text=''; const possible='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; for (let i=0;i<16;i++) text+=possible.charAt(Math.floor(Math.random()*possible.length)); return text; }

module.exports = { activate };
