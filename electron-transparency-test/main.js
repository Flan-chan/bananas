const { app, BrowserWindow } = require('electron')

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000' // Explicitly transparent background
  })

  win.loadURL('data:text/html,<body style="background: transparent;"></body>')

  win.setOpacity(0.85)

  win.on('ready-to-show', () => {
    win.show()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
