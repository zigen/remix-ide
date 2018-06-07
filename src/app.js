'use strict'

const $ = require('jquery')
const csjs = require('csjs-inject')
const yo = require('yo-yo')
const async = require('async')
const request = require('request')
const remixLib = require('remix-lib')
const EventManager = remixLib.EventManager

const Remixd = require('./lib/remixd')

const QueryParams = require('./lib/query-params')
const GistHandler = require('./lib/gist-handler')
const helper = require('./lib/helper')
const Storage = remixLib.Storage
const Browserfiles = require('./app/files/browser-files')
const BrowserfilesTree = require('./app/files/browser-files-tree')
const chromeCloudStorageSync = require('./app/files/chromeCloudStorageSync')
const SharedFolder = require('./app/files/shared-folder')
const Config = require('./config')
const Editor = require('./app/editor/editor')
const Renderer = require('./app/ui/renderer')
const executionContext = require('./execution-context')
const Debugger = require('./app/debugger/debugger')
const StaticAnalysis = require('./app/staticanalysis/staticAnalysisView')
const FilePanel = require('./app/panels/file-panel')
const EditorPanel = require('./app/panels/editor-panel')
const RighthandPanel = require('./app/panels/righthand-panel')
const examples = require('./app/editor/example-contracts')
const modalDialogCustom = require('./app/ui/modal-dialog-custom')
const TxLogger = require('./app/execution/txLogger')

const CompilerImport = require('./app/compiler/compiler-imports')
const FileManager = require('./app/files/fileManager')
const ContextualListener = require('./app/editor/contextualListener')
const ContextView = require('./app/editor/contextView')
const BasicReadOnlyExplorer = require('./app/files/basicReadOnlyExplorer')
const NotPersistedExplorer = require('./app/files/NotPersistedExplorer')
const toolTip = require('./app/ui/tooltip')
const CommandInterpreter = require('./lib/cmdInterpreter')
const PluginAPI = require('./app/plugin/pluginAPI')

const styleGuide = require('./app/ui/styles-guide/theme-chooser')
const styles = styleGuide.chooser()

import {
  locationChecker,
  initSolidityCompiler,
  initUniversalDApp,
  initTxListener
} from './initializers';
const css = csjs`
  html { box-sizing: border-box; }
  *, *:before, *:after { box-sizing: inherit; }
  body                 {
    font: 14px/1.5 Lato, "Helvetica Neue", Helvetica, Arial, sans-serif;
    margin             : 0;
    padding            : 0;
    font-size          : 12px;
    color              : ${styles.leftPanel.text_Primary};
    font-weight        : normal;
  }
  pre {
    overflow-x: auto;
  }
  .browsersolidity     {
    position           : relative;
    width              : 100vw;
    height             : 100vh;
    overflow           : hidden;
  }
  .centerpanel         {
    background-color  : ${styles.colors.transparent};
    display            : flex;
    flex-direction     : column;
    position           : absolute;
    top                : 0;
    bottom             : 0;
    overflow           : hidden;
  }
  .leftpanel           {
    background-color  : ${styles.leftPanel.backgroundColor_Panel};
    display            : flex;
    flex-direction     : column;
    position           : absolute;
    top                : 0;
    bottom             : 0;
    left               : 0;
    overflow           : hidden;
  }
  .rightpanel          {
    background-color  : ${styles.rightPanel.backgroundColor_Panel};
    display            : flex;
    flex-direction     : column;
    position           : absolute;
    top                : 0;
    right              : 0;
    bottom             : 0;
    overflow           : hidden;
  }
  .highlightcode {
    position:absolute;
    z-index:20;
    background-color: ${styles.editor.backgroundColor_DebuggerMode};
  }
  .highlightcode_fullLine {
    position:absolute;
    z-index:20;
    background-color: ${styles.editor.backgroundColor_DebuggerMode};
    opacity: 0.5;
  }
`

class App {
  constructor (api = {}, events = {}, opts = {}) {
    this._api = {}
    // Storage: remix/remix-core/src/storage.js : the simple wrapper for localStorage
    const fileStorage = new Storage('sol:')
    const configStorage = new Storage('config:')
    this._api.config = new Config(fileStorage)
    executionContext.init(this._api.config)
    executionContext.listenOnLastBlock()
    this._api.filesProviders = {}
    this._api.filesProviders['browser'] = new Browserfiles(fileStorage)
    this._api.filesProviders['config'] = new BrowserfilesTree('config', configStorage)
    this._api.filesProviders['config'].init()
    const remixd = new Remixd()
    remixd.event.register('system', (message) => {
      if (message.error) toolTip(message.error)
    })
    this._api.filesProviders['localhost'] = new SharedFolder(remixd)
    this._api.filesProviders['swarm'] = new BasicReadOnlyExplorer('swarm')
    this._api.filesProviders['github'] = new BasicReadOnlyExplorer('github')
    this._api.filesProviders['gist'] = new NotPersistedExplorer('gist')
    this._api.filesProviders['ipfs'] = new BasicReadOnlyExplorer('ipfs')
    this._view = {}
    this._components = {}
    this._components.compilerImport = new CompilerImport()
    this.data = {
      _layout: {
        right: {
          offset: this._api.config.get('right-offset') || 400,
          show: true
        }, // @TODO: adapt sizes proportionally to browser window size
        left: {
          offset: this._api.config.get('left-offset') || 200,
          show: true
        }
      }
    }
  }
  _adjustLayout (direction, delta) {

    const layout = this.data._layout[direction]
    if (layout) {
      if (delta === undefined) {
        layout.show = !layout.show
        if (layout.show) delta = layout.offset
        else delta = 0
      } else {
        this._api.config.set(`${direction}-offset`, delta)
        layout.offset = delta
      }
    }
    if (direction === 'left') {
      this._view.leftpanel.style.width = delta + 'px'
      this._view.centerpanel.style.left = delta + 'px'
    }
    if (direction === 'right') {
      this._view.rightpanel.style.width = delta + 'px'
      this._view.centerpanel.style.right = delta + 'px'
    }
  }
  init () {
    const self = this
    run.apply(self)
  }
  render () {
    const self = this
    if (self._view.el) return self._view.el
    self._view.leftpanel = yo`
      <div id="filepanel" class=${css.leftpanel}>
        ${''}
      </div>
    `
    self._view.centerpanel = yo`
      <div id="editor-container" class=${css.centerpanel}>
        ${''}
      </div>
    `
    self._view.rightpanel = yo`
      <div class=${css.rightpanel}>
        ${''}
      </div>
    `
    self._view.el = yo`
      <div class=${css.browsersolidity}>
        ${self._view.leftpanel}
        ${self._view.centerpanel}
        ${self._view.rightpanel}
      </div>
    `
    // INIT
    self._adjustLayout('left', self.data._layout.left.offset)
    self._adjustLayout('right', self.data._layout.right.offset)
    return self._view.el
  }
}

module.exports = App

const run = function () {
  const self = this
  locationChecker()

  var config = self._api.config
  var filesProviders = self._api.filesProviders
  // ----------------- editor ----------------------------
  this._components.editor = new Editor({}) // @TODO: put into editorpanel
  var editor = self._components.editor // shortcut for the editor

  var fileManager = new FileManager({
    config: config,
    editor: editor,
    filesProviders: filesProviders,
    compilerImport: self._components.compilerImport
  })

  const { compiler, offsetToLineColumnConverter} = initSolidityCompiler(self, fileManager, filesProviders);
  const { udapp, udappUI, transactionContextAPI } = initUniversalDApp(self, executionContext);
  
  const txlistener = initTxListener(self, executionContext, compiler, udapp);

  // ----------------- Command Interpreter -----------------
  /*
    this module basically listen on user input (from terminal && editor)
    and interpret them as commands
  */
  var cmdInterpreter = new CommandInterpreter()
  cmdInterpreter.event.register('debug', (hash, cb) => {
    startdebugging(hash)
    if (cb) cb()
  })
  cmdInterpreter.event.register('loadgist', (id, cb) => {
    loadFromGist({gist: id})
    if (cb) cb()
  })
  cmdInterpreter.event.register('loadurl', (url, cb) => {
    importExternal(url, (err, content) => {
      if (err) {
        toolTip(`Unable to load ${url} from swarm: ${err}`)
        if (cb) cb(err)
      } else {
        try {
          content = JSON.parse(content)
          async.eachOfSeries(content.sources, (value, file, callbackSource) => {
            var url = value.urls[0] // @TODO retrieve all other contents ?
            importExternal(url, (error, content) => {
              if (error) {
                toolTip(`Cannot retrieve the content of ${url}: ${error}`)
              }
              callbackSource()
            })
          }, (error) => {
            if (cb) cb(error)
          })
        } catch (e) {}
        if (cb) cb()
      }
    })
  })
  cmdInterpreter.event.register('setproviderurl', (url, cb) => {
    executionContext.setProviderFromEndpoint(url, 'web3', (error) => {
      if (error) toolTip(error)
      if (cb) cb()
    })
  })
  cmdInterpreter.event.register('batch', (url, cb) => {
    var content = editor.get(editor.current())
    if (!content) {
      toolTip('no content to execute')
      if (cb) cb()
      return
    }
    var split = content.split('\n')
    async.eachSeries(split, (value, cb) => {
      if (!cmdInterpreter.interpret(value, (error) => {
        error ? cb(`Cannot run ${value}. stopping`) : cb()
      })) {
        cb(`Cannot interpret ${value}. stopping`)
      }
    }, (error) => {
      if (error) toolTip(error)
      if (cb) cb()
    })
  })


  // ---------------- ContextualListener -----------------------
  this._components.contextualListener = new ContextualListener({
    getCursorPosition: () => {
      return this._components.editor.getCursorPosition()
    },
    getCompilationResult: () => {
      return compiler.lastCompilationResult
    },
    getCurrentFile: () => {
      return config.get('currentFile')
    },
    getSourceName: (index) => {
      return compiler.getSourceName(index)
    },
    highlight: (position, node) => {
      if (compiler.lastCompilationResult && compiler.lastCompilationResult.data) {
        var lineColumn = offsetToLineColumnConverter.offsetToLineColumn(position, position.file, compiler.lastCompilationResult)
        var css = 'highlightreference'
        if (node.children && node.children.length) {
          // If node has children, highlight the entire line. if not, just highlight the current source position of the node.
          css = 'highlightreference'
          lineColumn = {
            start: {
              line: lineColumn.start.line,
              column: 0
            },
            end: {
              line: lineColumn.start.line + 1,
              column: 0
            }
          }
        }
        var fileName = compiler.getSourceName(position.file)
        if (fileName) {
          return editor.addMarker(lineColumn, fileName, css)
        }
      }
      return null
    },
    stopHighlighting: (event) => {
      editor.removeMarker(event.eventId, event.fileTarget)
    }
  }, {
    compiler: compiler.event,
    editor: editor.event
  })

  // ---------------- ContextView -----------------------
  this._components.contextView = new ContextView({
    contextualListener: this._components.contextualListener,
    jumpTo: (position) => {
      function jumpToLine (lineColumn) {
        if (lineColumn.start && lineColumn.start.line && lineColumn.start.column) {
          editor.gotoLine(lineColumn.start.line, lineColumn.end.column + 1)
        }
      }
      if (compiler.lastCompilationResult && compiler.lastCompilationResult.data) {
        var lineColumn = offsetToLineColumnConverter.offsetToLineColumn(position, position.file, compiler.lastCompilationResult)
        var filename = compiler.getSourceName(position.file)
        // TODO: refactor with rendererAPI.errorClick
        if (filename !== config.get('currentFile')) {
          var provider = fileManager.fileProviderOf(filename)
          if (provider) {
            provider.exists(filename, (error, exist) => {
              if (error) return console.log(error)
              fileManager.switchFile(filename)
              jumpToLine(lineColumn)
            })
          }
        } else {
          jumpToLine(lineColumn)
        }
      }
    }
  }, {
    contextualListener: this._components.contextualListener.event
  })

  // ----------------- editor panel ----------------------
  this._components.editorpanel = new EditorPanel({
    api: {
      cmdInterpreter: cmdInterpreter,
      editor: self._components.editor,
      config: self._api.config,
      txListener: txlistener,
      contextview: self._components.contextView,
      udapp: () => { return udapp }
    }
  })
  this._components.editorpanel.event.register('resize', direction => self._adjustLayout(direction))

  this._view.centerpanel.appendChild(this._components.editorpanel.render())

  var queryParams = new QueryParams()
  var gistHandler = new GistHandler()

  // The event listener needs to be registered as early as possible, because the
  // parent will send the message upon the "load" event.
  var filesToLoad = null
  var loadFilesCallback = function (files) { filesToLoad = files } // will be replaced later

  window.addEventListener('message', function (ev) {
    if (typeof ev.data === typeof [] && ev.data[0] === 'loadFiles') {
      loadFilesCallback(ev.data[1])
    }
  }, false)

  this.event = new EventManager()

 
  // Add files received from remote instance (i.e. another remix-ide)
  function loadFiles (filesSet, fileProvider, callback) {
    if (!fileProvider) fileProvider = 'browser'

    async.each(Object.keys(filesSet), (file, callback) => {
      helper.createNonClashingName(file, filesProviders[fileProvider],
      (error, name) => {
        if (error) {
          modalDialogCustom.alert('Unexpected error loading the file ' + error)
        } else if (helper.checkSpecialChars(name)) {
          modalDialogCustom.alert('Special characters are not allowed')
        } else {
          filesProviders[fileProvider].set(name, filesSet[file].content)
        }
        callback()
      })
    }, (error) => {
      if (!error) fileManager.switchFile()
      if (callback) callback(error)
    })
  }

  // Replace early callback with instant response
  loadFilesCallback = function (files) {
    loadFiles(files)
  }

  // Run if we did receive an event from remote instance while starting up
  if (filesToLoad !== null) {
    loadFiles(filesToLoad)
  }

  // ------------------ gist load ----------------
  function loadFromGist (gistId) {
    return gistHandler.handleLoad(gistId, function (gistId) {
      request.get({
        url: `https://api.github.com/gists/${gistId}`,
        json: true
      }, (error, response, data = {}) => {
        if (error || !data.files) {
          modalDialogCustom.alert(`Gist load error: ${error || data.message}`)
          return
        }
        loadFiles(data.files, 'gist', (errorLoadingFile) => {
          if (!errorLoadingFile) filesProviders['gist'].id = gistId
        })
      })
    })
  }

  var loadingFromGist = loadFromGist(queryParams.get())

  // insert ballot contract if there are no files available
  if (!loadingFromGist) {
    filesProviders['browser'].resolveDirectory('browser', (error, filesList) => {
      if (error) console.error(error)
      if (Object.keys(filesList).length === 0) {
        if (!filesProviders['browser'].set(examples.ballot.name, examples.ballot.content)) {
          modalDialogCustom.alert('Failed to store example contract in browser. Remix will not work properly. Please ensure Remix has access to LocalStorage. Safari in Private mode is known not to work.')
        } else {
          filesProviders['browser'].set(examples.ballot_test.name, examples.ballot_test.content)
        }
      }
    })
  }

  window.syncStorage = chromeCloudStorageSync
  chromeCloudStorageSync()

  // ---------------- FilePanel --------------------
  var FilePanelAPI = {
    switchFile: function (path) {
      fileManager.switchFile(path)
    },
    event: fileManager.event,
    config: config,
    currentContent: function () {
      return editor.get(config.get('currentFile'))
    },
    setText: function (text) {
      editor.setText(text)
    }
  }
  var filePanel = new FilePanel(FilePanelAPI, filesProviders)

  // TODO this should happen inside file-panel.js
  var filepanelContainer = document.querySelector('#filepanel')
  filepanelContainer.appendChild(filePanel.render())

  filePanel.event.register('resize', delta => self._adjustLayout('left', delta))

  var previouslyOpenedFile = config.get('currentFile')
  if (previouslyOpenedFile) {
    filesProviders['browser'].get(previouslyOpenedFile, (error, content) => {
      if (!error && content) {
        fileManager.switchFile(previouslyOpenedFile)
      } else {
        fileManager.switchFile()
      }
    })
  } else {
    fileManager.switchFile()
  }

  // ----------------- Renderer -----------------
  var rendererAPI = {
    error: (file, error) => {
      if (file === config.get('currentFile')) {
        editor.addAnnotation(error)
      }
    },
    errorClick: (errFile, errLine, errCol) => {
      if (errFile !== config.get('currentFile')) {
        // TODO: refactor with this._components.contextView.jumpTo
        var provider = fileManager.fileProviderOf(errFile)
        if (provider) {
          provider.exists(errFile, (error, exist) => {
            if (error) return console.log(error)
            fileManager.switchFile(errFile)
            editor.gotoLine(errLine, errCol)
          })
        }
      } else {
        editor.gotoLine(errLine, errCol)
      }
    }
  }
  var renderer = new Renderer(rendererAPI)

  // ----------------- StaticAnalysis -----------------

  var staticAnalysisAPI = {
    renderWarning: (label, warningContainer, type) => {
      return renderer.error(label, warningContainer, type)
    },
    offsetToLineColumn: (location, file) => {
      return offsetToLineColumnConverter.offsetToLineColumn(location, file, compiler.lastCompilationResult)
    }
  }
  var staticanalysis = new StaticAnalysis(staticAnalysisAPI, compiler.event)

  // ---------------- Righthand-panel --------------------

  var rhpAPI = {
    newAccount: (pass, cb) => {
      udapp.newAccount(pass, cb)
    },
    setEditorSize (delta) {
      $('#righthand-panel').css('width', delta)
      self._view.centerpanel.style.right = delta + 'px'
      document.querySelector(`.${css.dragbar2}`).style.right = delta + 'px'
      onResize()
    },
    switchFile: function (path) {
      fileManager.switchFile(path)
    },
    filesProviders: filesProviders,
    fileProviderOf: (path) => {
      return fileManager.fileProviderOf(path)
    },
    fileProvider: (name) => {
      return self._api.filesProviders[name]
    },
    currentPath: function () {
      return fileManager.currentPath()
    },
    getBalance: (address, callback) => {
      udapp.getBalance(address, (error, balance) => {
        if (error) {
          callback(error)
        } else {
          callback(null, executionContext.web3().fromWei(balance, 'ether'))
        }
      })
    },
    currentCompiledSourceCode: () => {
      if (compiler.lastCompilationResult.source) {
        return compiler.lastCompilationResult.source.sources[compiler.lastCompilationResult.source.target]
      }
      return ''
    },
    resetDapp: (contracts) => {
      udapp.reset(contracts, transactionContextAPI)
      udappUI.reset()
    },
    setOptimize: (optimize, runCompilation) => {
      compiler.setOptimize(optimize)
      if (runCompilation) runCompiler()
    },
    runCompiler: () => {
      runCompiler()
    },
    logMessage: (msg) => {
      self._components.editorpanel.log({type: 'log', value: msg})
    }
  }
  var rhpEvents = {
    compiler: compiler.event,
    app: self.event,
    udapp: udapp.event,
    editor: editor.event,
    staticAnalysis: staticanalysis.event
  }
  var rhpOpts = {
    pluginAPI: new PluginAPI(self, compiler),
    udapp: udapp,
    udappUI: udappUI,
    compiler: compiler,
    renderer: renderer,
    editor: editor,
    config: config
  }

  self._components.righthandpanel = new RighthandPanel(rhpAPI, rhpEvents, rhpOpts)
  self._view.rightpanel.appendChild(self._components.righthandpanel.render())
  self._components.righthandpanel.init()
  self._components.righthandpanel.event.register('resize', delta => self._adjustLayout('right', delta))

  var node = document.getElementById('staticanalysisView')
  node.insertBefore(staticanalysis.render(), node.childNodes[0])

  // ----------------- editor resize ---------------

  function onResize () {
    editor.resize(document.querySelector('#editorWrap').checked)
  }
  onResize()

  self._view.el.addEventListener('change', onResize)
  document.querySelector('#editorWrap').addEventListener('change', onResize)

  // ----------------- Debugger -----------------
  var debugAPI = {
    statementMarker: null,
    fullLineMarker: null,
    source: null,
    currentSourceLocation: (lineColumnPos, location) => {
      if (this.statementMarker) editor.removeMarker(this.statementMarker, this.source)
      if (this.fullLineMarker) editor.removeMarker(this.fullLineMarker, this.source)
      this.statementMarker = null
      this.fullLineMarker = null
      this.source = null
      if (lineColumnPos) {
        this.source = compiler.getSourceName(location.file)
        if (config.get('currentFile') !== this.source) {
          fileManager.switchFile(this.source)
        }
        this.statementMarker = editor.addMarker(lineColumnPos, this.source, css.highlightcode)
        editor.scrollToLine(lineColumnPos.start.line, true, true, function () {})
        if (lineColumnPos.start.line === lineColumnPos.end.line) {
          this.fullLineMarker = editor.addMarker({
            start: {
              line: lineColumnPos.start.line,
              column: 0
            },
            end: {
              line: lineColumnPos.start.line + 1,
              column: 0
            }
          }, this.source, css.highlightcode_fullLine)
        }
      }
    },
    lastCompilationResult: () => {
      return compiler.lastCompilationResult
    },
    offsetToLineColumn: (location, file) => {
      return offsetToLineColumnConverter.offsetToLineColumn(location, file, compiler.lastCompilationResult)
    }
  }
  var transactionDebugger = new Debugger('#debugger', debugAPI, editor.event)
  transactionDebugger.addProvider('vm', executionContext.vm())
  transactionDebugger.addProvider('injected', executionContext.internalWeb3())
  transactionDebugger.addProvider('web3', executionContext.internalWeb3())
  transactionDebugger.switchProvider(executionContext.getProvider())

  var txLogger = new TxLogger({
    api: {
      editorpanel: self._components.editorpanel,
      resolvedTransaction: function (hash) {
        return txlistener.resolvedTransaction(hash)
      },
      parseLogs: function (tx, contractName, contracts, cb) {
        eventsDecoder.parseLogs(tx, contractName, contracts, cb)
      },
      compiledContracts: function () {
        return compiledContracts()
      }
    },
    events: {
      txListener: txlistener.event
    }
  })

  txLogger.event.register('debugRequested', (hash) => {
    startdebugging(hash)
  })

  function runCompiler () {
    if (transactionDebugger.isActive) return

    fileManager.saveCurrentFile()
    editor.clearAnnotations()
    var currentFile = config.get('currentFile')
    if (currentFile) {
      if (/.(.sol)$/.exec(currentFile)) {
        // only compile *.sol file.
        var target = currentFile
        var sources = {}
        var provider = fileManager.fileProviderOf(currentFile)
        if (provider) {
          provider.get(target, (error, content) => {
            if (error) {
              console.log(error)
            } else {
              sources[target] = { content }
              compiler.compile(sources, target)
            }
          })
        } else {
          console.log('cannot compile ' + currentFile + '. Does not belong to any explorer')
        }
      }
    }
  }

  var previousInput = ''
  var saveTimeout = null

  function editorOnChange () {
    var currentFile = config.get('currentFile')
    if (!currentFile) {
      return
    }
    var input = editor.get(currentFile)
    if (!input) {
      return
    }
    // if there's no change, don't do anything
    if (input === previousInput) {
      return
    }
    previousInput = input

    // fire storage update
    // NOTE: save at most once per 5 seconds
    if (saveTimeout) {
      window.clearTimeout(saveTimeout)
    }
    saveTimeout = window.setTimeout(() => {
      fileManager.saveCurrentFile()
    }, 5000)
  }

  editor.event.register('contentChanged', editorOnChange)
  // in order to save the file when switching
  editor.event.register('sessionSwitched', editorOnChange)

  executionContext.event.register('contextChanged', this, function (context) {
    runCompiler()
  })

  executionContext.event.register('web3EndpointChanged', this, function (context) {
    runCompiler()
  })

  compiler.event.register('compilerLoaded', this, function (version) {
    previousInput = ''
    runCompiler()

    if (queryParams.get().context) {
      let context = queryParams.get().context
      let endPointUrl = queryParams.get().endPointUrl
      executionContext.setContext(context, endPointUrl,
      () => {
        modalDialogCustom.confirm(null, 'Are you sure you want to connect to an ethereum node?', () => {
          if (!endPointUrl) {
            endPointUrl = 'http://localhost:8545'
          }
          modalDialogCustom.prompt(null, 'Web3 Provider Endpoint', endPointUrl, (target) => {
            executionContext.setProviderFromEndpoint(target, context)
          }, () => {})
        }, () => {})
      },
      (alertMsg) => {
        modalDialogCustom.alert(alertMsg)
      })
    }

    if (queryParams.get().debugtx) {
      startdebugging(queryParams.get().debugtx)
    }
  })

  function startdebugging (txHash) {
    self.event.trigger('debuggingRequested', [])
    transactionDebugger.debug(txHash)
  }
}
