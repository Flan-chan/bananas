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



// State for window visibility toggle

let isWindowVisible = true

let windowPositionBeforeHidden: { x: number; y: number } | null = null

let windowSizeBeforeHidden: { width: number; height: number } | null = null



// State for clickthrough toggle

let isClickthroughEnabled = false



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



// Functions for toggling window visibility

function hideMainWindow(): void {

  if (MAIN_WINDOW && !MAIN_WINDOW.isDestroyed()) {

    const bounds = MAIN_WINDOW.getBounds()

    windowPositionBeforeHidden = { x: bounds.x, y: bounds.y }

    windowSizeBeforeHidden = { width: bounds.width, height: bounds.height } // Though not strictly needed if we don't move/resize

    MAIN_WINDOW.setIgnoreMouseEvents(true, { forward: true })

    MAIN_WINDOW.setOpacity(0) // Make it fully invisible

    isWindowVisible = false

    console.log('Window hidden, opacity set to 0')

  }

}



function showMainWindow(): void {

  if (MAIN_WINDOW && !MAIN_WINDOW.isDestroyed()) {

    MAIN_WINDOW.setOpacity(0.85) // Restore to the default semi-transparent state

    // Only disable mouse events if clickthrough is not enabled

    if (!isClickthroughEnabled) {

      MAIN_WINDOW.setIgnoreMouseEvents(false)

    }

    // Optionally restore position/size if they could change while hidden

    // if (windowPositionBeforeHidden && windowSizeBeforeHidden) {

    //   MAIN_WINDOW.setBounds({ ...windowPositionBeforeHidden, ...windowSizeBeforeHidden })

    // }

    isWindowVisible = true

    console.log('Window shown, opacity set to 0.85')

  }

}



function toggleMainWindow(): void {

  console.log(`Toggling window. Current state: ${isWindowVisible ? 'visible' : 'hidden'}`)

  if (isWindowVisible) {

    hideMainWindow()

  } else {

    showMainWindow()

  }

}



// Functions for toggling clickthrough

function enableClickthrough(): void {

  if (MAIN_WINDOW && !MAIN_WINDOW.isDestroyed()) {

    MAIN_WINDOW.setIgnoreMouseEvents(true, { forward: true })

    isClickthroughEnabled = true

    console.log('Clickthrough enabled - mouse events will pass through')

  }

}



function disableClickthrough(): void {

  if (MAIN_WINDOW && !MAIN_WINDOW.isDestroyed()) {

    MAIN_WINDOW.setIgnoreMouseEvents(false)

    isClickthroughEnabled = false

    console.log('Clickthrough disabled - window will receive mouse events')

  }

}



function toggleClickthrough(): void {

  console.log(`Toggling clickthrough. Current state: ${isClickthroughEnabled ? 'enabled' : 'disabled'}`)

  if (isClickthroughEnabled) {

    disableClickthrough()

  } else {

    enableClickthrough()

  }

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

    transparent: true, // Enable window transparency

    backgroundColor: '#00000000', // Make the window background fully transparent

    frame: false, // Disable window frame

    skipTaskbar: true, // Do not show in taskbar/dock

    focusable: true, // Ensure panel can be focused

    ...(process.platform === 'darwin' ? { type: 'panel' } : {}), // macOS specific panel type

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

    MAIN_WINDOW.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    MAIN_WINDOW.setAlwaysOnTop(true, 'screen-saver'); // Keep on top, screen-saver level

    MAIN_WINDOW.setContentProtection(true); // Prevent screen capture

    MAIN_WINDOW.setOpacity(0.85); // Default semi-transparent visible state

    MAIN_WINDOW.show();

  })



  MAIN_WINDOW.webContents.setWindowOpenHandler((details) => {

    shell.openExternal(details.url)

    return { action: 'deny' }

  })



  // HMR for renderer base on electron-vite cli.

  // Load the remote URL for development or the local html file for production.

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

  globalShortcut.register('Alt+Left', () => {

    updateWindowState()

    moveWindowHorizontal((x) => x - 20) // Move left by 20 pixels

  })

  globalShortcut.register('Alt+Right', () => {

    updateWindowState()

    moveWindowHorizontal((x) => x + 20) // Move right by 20 pixels

  })

  globalShortcut.register('Alt+Up', () => {

    updateWindowState()

    moveWindowVertical((y) => y - 20) // Move up by 20 pixels

  })

  globalShortcut.register('Alt+Down', () => {

    updateWindowState()

    moveWindowVertical((y) => y + 20) // Move down by 20 pixels

  })



  // Register shortcut for toggling window visibility

  globalShortcut.register('Alt+H', () => {

    console.log('Alt+H pressed. Toggling window visibility.')

    toggleMainWindow()

  })



  // Register shortcut for toggling clickthrough

  globalShortcut.register('Alt+C', () => {

    console.log('Alt+C pressed. Toggling clickthrough.')

    toggleClickthrough()

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
