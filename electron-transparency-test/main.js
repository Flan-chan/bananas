const { app, BrowserWindow } = require('electron')

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    transparent: true,  // Crucial for transparency
    frame: false,         // Usually needed for custom transparent windows
    backgroundColor: '#00000000' // Explicitly transparent background
  })

  // Load a very simple HTML page with a transparent body
  win.loadURL('data:text/html,<body style="background: transparent;"></body>')

  // Set overall window opacity
  win.setOpacity(0.75)

  win.on('ready-to-show', () => {
    win.show()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})