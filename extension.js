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
 
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        const visibleStored = this.context.globalState.get('vswallpaper.image');
        if (visibleStored) {
          console.log('VS Wallpaper: view became visible, reloading stored image');
          webviewView.webview.postMessage({ type: 'loadImage', image: visibleStored });
        }
      }
    });
 
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
          await vscode.commands.executeCommand('vswallpaper.refresh');
          console.log('VS Wallpaper: stored image from webview', filename);
          webviewView.webview.postMessage({ type: 'loadImage', image: stored });
        } catch (e) {
          console.error('VS Wallpaper: failed storing image from webview', e);
        }
      } else if (msg.type === 'setRemoteImage') {
        try {
          const url = msg.url;
          const bytes = await downloadRemoteBytes(url);
        const contentType = resolveMime(url, msg.mime);
          const ext = (contentType || '').split('/').pop() || 'gif';
          const filename = `current_wallpaper.${ext}`;
          const uri = vscode.Uri.joinPath(this.context.globalStorageUri, filename);
          await vscode.workspace.fs.createDirectory(this.context.globalStorageUri).catch(() => {});
          await vscode.workspace.fs.writeFile(uri, bytes);
          const b64 = bytes.toString('base64');
          const stored = { mime: contentType || 'image/gif', data: b64, filename };
          await this.context.globalState.update('vswallpaper.image', stored);
          await vscode.commands.executeCommand('vswallpaper.refresh');
          console.log('VS Wallpaper: stored remote image from webview', filename);
          webviewView.webview.postMessage({ type: 'loadImage', image: stored });
        } catch (e) {
          console.error('VS Wallpaper: failed storing remote image from webview', e);
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; connect-src https:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html, body { height:100%; margin:0; padding:0; }
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: transparent; background-size: cover; background-position: center; }
  body.hasImage { background-repeat: no-repeat; }
  .drop { border: 2px dashed var(--vscode-editorWidget-border); padding:16px; border-radius:6px; background: rgba(0,0,0,0.05); position:relative; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; box-sizing:border-box; }
  .drop.dragover { background: rgba(128,128,128,0.12); }
  .drop.hasImage { border: none; background: transparent; }
  .placeholder { color: var(--vscode-descriptionForeground); margin-bottom: 18px; text-align:center; }
  .controls { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:8px; }
  .controls button { cursor:pointer; }
  .browse-panel { position:absolute; top: 8px; left: 8px; right: 8px; bottom: 8px; background: rgba(18,18,18,0.95); color: var(--vscode-foreground); border-radius:8px; padding:12px; display:none; overflow:auto; z-index:10; }
  .browse-panel.visible { display:block; }
  .browse-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px; }
  .browse-toolbar input { flex:1 1 160px; min-width:0; padding:6px 8px; border:1px solid var(--vscode-editorWidget-border); border-radius:4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
  .browse-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap:8px; margin-top:8px; }
  .browse-item { border:1px solid var(--vscode-panel-border); border-radius:6px; overflow:hidden; display:flex; flex-direction:column; background: var(--vscode-panel-background); }
  .browse-item img { width:100%; height:100px; object-fit:cover; }
  .browse-item button { width:100%; border:none; padding:6px 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor:pointer; }
  .browse-item button:hover { opacity:0.9; }
  .status { margin-top:8px; color: var(--vscode-descriptionForeground); font-size:0.9em; }
</style>
</head>
<body>
  <div id="drop" class="drop">
    <div id="placeholder" class="placeholder">Drag & drop an image/GIF here or use the view header buttons to Add, Browse, or Clear.</div>

      <div id="browsePanel" class="browse-panel" role="dialog" aria-label="Browse GIFs from the internet">
        <div class="browse-toolbar">
          <input id="searchQuery" placeholder="Search GIFs (e.g. cats, coding)" />
          <button id="searchButton">Search</button>
          <button id="trendingButton">Trending</button>
          <button id="closeBrowse">Close</button>
        </div>
        <div id="browser" class="browse-grid"></div>
        <div id="browseStatus" class="status">Search for GIFs or click Trending.</div>
      </div>
    </div>
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const closeBrowse = document.getElementById('closeBrowse');
  const searchQuery = document.getElementById('searchQuery');
  const searchButton = document.getElementById('searchButton');
  const trendingButton = document.getElementById('trendingButton');
  const placeholder = document.getElementById('placeholder');
  const browsePanel = document.getElementById('browsePanel');
  const browser = document.getElementById('browser');
  const browseStatus = document.getElementById('browseStatus');
  const drop = document.getElementById('drop');

  var sampleGifs = [];

  function show(img) {
    if (!img) {
      document.body.classList.remove('hasImage');
      drop.classList.remove('hasImage');
      placeholder.style.display = 'block';
      document.body.style.backgroundImage = 'none';
      return;
    }
    var dataUrl = 'data:' + img.mime + ';base64,' + img.data;
    document.body.classList.add('hasImage');
    drop.classList.add('hasImage');
    document.body.style.backgroundImage = 'url(' + dataUrl + ')';
    placeholder.style.display = 'none';
  }

  function renderBrowser() {
    browser.innerHTML = '';
    if (!sampleGifs.length) {
      browseStatus.textContent = 'No GIFs found. Try another search or click Trending.';
      return;
    }
    browseStatus.textContent = '';
    sampleGifs.forEach(function(item) {
      var card = document.createElement('div');
      card.className = 'browse-item';
      var thumb = document.createElement('img');
      thumb.src = item.preview;
      thumb.alt = item.name || 'GIF';
      var btn = document.createElement('button');
      btn.textContent = 'Use';
      btn.addEventListener('click', function() { selectGif(item.url, item.name || 'GIF'); });
      card.appendChild(thumb);
      card.appendChild(btn);
      browser.appendChild(card);
    });
  }

  function fetchGifs(endpoint, query) {
    browseStatus.textContent = 'Loading...';
    var base = 'https://g.tenor.com/v1/';
    var url = base + endpoint + '?key=LIVDSRZULELA&limit=12&media_filter=minimal';
    if (query) url += '&q=' + encodeURIComponent(query);
    fetch(url)
      .then(function(response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function(data) {
        sampleGifs = (data.results || []).map(function(item) {
          var media = (item.media && item.media[0]) || {};
          var gifUrl = media.gif && media.gif.url;
          var previewUrl = media.tinygif && media.tinygif.url || media.nanogif && media.nanogif.url || gifUrl;
          return { name: item.content_description || item.title || 'GIF', url: gifUrl, preview: previewUrl };
        }).filter(function(item) { return item.url; });
        renderBrowser();
      })
      .catch(function(err) {
        console.error(err);
        browseStatus.textContent = 'Could not load GIF search results. Check your connection.';
      });
  }

  function selectGif(url, name) {
    browseStatus.textContent = 'Saving ' + name + '...';
    vscode.postMessage({ type: 'setRemoteImage', url: url, name: name });
  }

  window.addEventListener('message', function(e) { var m = e.data; if (m.type === 'loadImage') show(m.image); if (m.type === 'openBrowse') { browsePanel.classList.add('visible'); fetchGifs('trending'); } });

  closeBrowse.onclick = function() { browsePanel.classList.remove('visible'); browseStatus.textContent = ''; };
  searchButton.onclick = function() { var q = searchQuery.value.trim(); if (q) fetchGifs('search', q); };
  trendingButton.onclick = function() { searchQuery.value = ''; fetchGifs('trending'); };

  function read(f) {
    var r = new FileReader();
    r.onload = function() {
      var res = r.result;
      var idx = res.indexOf(',');
      var header = res.substring(5, idx);
      var mime = header.split(';')[0];
      var b64 = res.substring(idx + 1);
      show({ mime: mime, data: b64 });
      vscode.postMessage({ type: 'setImage', image: { mime: mime, data: b64 } });
    };
    r.readAsDataURL(f);
  }

  drop.addEventListener('dragover', function(e) { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', function(e) { e.preventDefault(); drop.classList.remove('dragover'); });
  drop.addEventListener('drop', function(e) { e.preventDefault(); drop.classList.remove('dragover'); var files = e.dataTransfer.files; if (files && files.length) { for (var i = 0; i < files.length; i++) read(files[i]); } });
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
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('vswallpaper.explorer', provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }));
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
    const revealCommands = ['workbench.view.extension.vswallpaper', 'workbench.view.extension.vswallpaper.explorer', 'workbench.view.explorer'];
    for (const cmd of revealCommands) {
      try {
        await vscode.commands.executeCommand(cmd);
        console.log('VS Wallpaper: executed reveal command', cmd);
        break;
      } catch (e) {
        console.warn('VS Wallpaper: reveal command failed', cmd, e && e.message);
      }
    }
    if (provider._view && typeof provider._view.show === 'function') {
      provider._view.show(true);
    }
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
      const revealCommands = ['workbench.view.extension.vswallpaper', 'workbench.view.extension.vswallpaper.explorer', 'workbench.view.explorer'];
      for (const cmd of revealCommands) {
        try {
          await vscode.commands.executeCommand(cmd);
          console.log('VS Wallpaper: executed reveal command', cmd);
          break;
        } catch (e) {
          console.warn('VS Wallpaper: reveal command failed', cmd, e && e.message);
        }
      }
      if (provider._view && typeof provider._view.show === 'function') {
        provider._view.show(true);
      }
      try { await vscode.commands.executeCommand('vswallpaper.refresh'); } catch (e) { }
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
      console.log('VS Wallpaper: added image', filename);
    } catch (e) { console.error('VS Wallpaper: addImage error', e); vscode.window.showErrorMessage('Failed to add image'); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vswallpaper.browseGifs', async () => {
    try {
      const revealCommands = ['workbench.view.extension.vswallpaper', 'workbench.view.extension.vswallpaper.explorer', 'workbench.view.explorer'];
      for (const cmd of revealCommands) {
        try {
          await vscode.commands.executeCommand(cmd);
          console.log('VS Wallpaper: executed reveal command', cmd);
          break;
        } catch (e) {
          console.warn('VS Wallpaper: reveal command failed', cmd, e && e.message);
        }
      }
      if (provider._view && typeof provider._view.show === 'function') {
        provider._view.show(true);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (provider._view) {
        provider._view.webview.postMessage({ type: 'openBrowse' });
      }
    } catch (e) {
      console.error('VS Wallpaper: browse command failed', e);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vswallpaper.clearImage', async () => {
    await context.globalState.update('vswallpaper.image', undefined);
    if (provider._view) {
      provider._view.webview.postMessage({ type: 'loadImage', image: undefined });
    }
    try { await vscode.commands.executeCommand('vswallpaper.refresh'); } catch (e) { }
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

function downloadRemoteBytes(url) {
  if (typeof fetch === 'function') {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error('Failed to download remote image: ' + res.status);
      return res.arrayBuffer();
    }).then((arrayBuffer) => Buffer.from(arrayBuffer));
  }
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? require('https') : require('http');
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error('Failed to download remote image: ' + res.statusCode));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function resolveMime(url, explicitMime) {
  if (explicitMime) return explicitMime;
  return getMime(url) || 'image/gif';
}

function getMime(path) { const ext = (path||'').split('.').pop().toLowerCase(); switch (ext) { case 'png': return 'image/png'; case 'jpg': case 'jpeg': return 'image/jpeg'; case 'gif': return 'image/gif'; case 'webp': return 'image/webp'; case 'svg': return 'image/svg+xml'; case 'bmp': return 'image/bmp'; default: return 'application/octet-stream'; } }
function getNonce() { let text=''; const possible='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; for (let i=0;i<16;i++) text+=possible.charAt(Math.floor(Math.random()*possible.length)); return text; }

module.exports = { activate };
