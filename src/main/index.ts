import { app, shell, BrowserWindow, session, desktopCapturer, globalShortcut, screen } from 'electron'
import path from 'path'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { windowStateKeeper } from './stateKeeper'
import { ipcMainHandlersInit } from './ipcMainHandlers'
import { isInProductionMode } from './utils'

const CUSTOM_PROTOCOL = 'bananas'

let MAIN_WINDOW: BrowserWindow

// State for window movement
let currentX = 0
let currentY = 0
let windowSize = { width: 800, height: 600 }
let screenHeight = 0

function updateWindowState() {
  if (!MAIN_WINDOW) return
  const [x, y] = MAIN_WINDOW.getPosition()
  const [width, height] = MAIN_WINDOW.getSize()
  currentX = x
  currentY = y
  windowSize = { width, height }
  screenHeight = screen.getPrimaryDisplay().workAreaSize.height
}

function moveWindowHorizontal(updateFn: (x: number) => number) {
  if (!MAIN_WINDOW) return
  currentX = updateFn(currentX)
  MAIN_WINDOW.setPosition(Math.round(currentX), Math.round(currentY))
}

function moveWindowVertical(updateFn: (y: number) => number) {
  if (!MAIN_WINDOW) return
  const newY = updateFn(currentY)
  const maxUpLimit = (-(windowSize.height || 0) * 2) / 3
  const maxDownLimit = screenHeight + ((windowSize.height || 0) * 2) / 3
  currentY = Math.max(Math.min(newY, maxDownLimit), maxUpLimit)
  MAIN_WINDOW.setPosition(Math.round(currentX), Math.round(currentY))
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1])
    ])
  }
} else {
  app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL)
}

if (isInProductionMode()) {
  const SINGLE_INSTANCE_LOCK = app.requestSingleInstanceLock()

  if (!SINGLE_INSTANCE_LOCK) {
    app.quit()
  }
}

const sendOpenBananasUrlToRenderer = (url: string): void => {
  MAIN_WINDOW.webContents.send('openBananasURL', url)
}

app.on('second-instance', (_, commandLine) => {
  if (MAIN_WINDOW) {
    if (MAIN_WINDOW.isMinimized()) MAIN_WINDOW.restore()
    MAIN_WINDOW.focus()
  }
  const url = commandLine.pop()
  if (url) sendOpenBananasUrlToRenderer(url)
})

app.on('open-url', (evt, url: string) => {
  evt.preventDefault()
  sendOpenBananasUrlToRenderer(url)
})

async function createWindow(): Promise<void> {
  const mainWindowState = await windowStateKeeper('main')

  MAIN_WINDOW = new BrowserWindow({
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 400,
    minHeight: 200,
    x: mainWindowState.x,
    y: mainWindowState.y,
    show: false,
    autoHideMenuBar: true,
    transparent: true, // Enable window transparency for glassmorphism
    backgroundColor: '#00000000', // Make the window background fully transparent
    frame: false, // Disable window frame for transparency support
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: true
    }
  })

  mainWindowState.track(MAIN_WINDOW)

  session.defaultSession.setDisplayMediaRequestHandler((_, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0] })
    })
  })

  MAIN_WINDOW.on('ready-to-show', () => {
    MAIN_WINDOW.setAlwaysOnTop(true, 'floating')
    MAIN_WINDOW.show()
  })

  MAIN_WINDOW.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    MAIN_WINDOW.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    MAIN_WINDOW.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (mainWindowState.isMaximized) {
    MAIN_WINDOW.maximize()
  }
}

app.whenReady().then(async () => {
  // Register window movement shortcuts
  globalShortcut.register('CommandOrControl+Left', () => {
    updateWindowState()
    moveWindowHorizontal(x => x - 50)
  })
  globalShortcut.register('CommandOrControl+Right', () => {
    updateWindowState()
    moveWindowHorizontal(x => x + 50)
  })
  globalShortcut.register('CommandOrControl+Up', () => {
    updateWindowState()
    moveWindowVertical(y => y - 50)
  })
  globalShortcut.register('CommandOrControl+Down', () => {
    updateWindowState()
    moveWindowVertical(y => y + 50)
  })

  electronApp.setAppUserModelId('net.getbananas')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMainHandlersInit()

  await createWindow()
  const coldStartUrl = process.argv.find((arg) => arg.startsWith(CUSTOM_PROTOCOL + '://'))
  if (coldStartUrl) {
    sendOpenBananasUrlToRenderer(coldStartUrl)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
