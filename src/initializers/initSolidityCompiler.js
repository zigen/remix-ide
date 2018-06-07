import { Compiler } from 'remix-solidity';
import OffsetToLineColumnConverter from  '../lib/offsetToLineColumnConverter';

const initSolidityCompiler = (self, fileManager, filesProviders) => { 
  function importExternal (url, cb) {
    self._components.compilerImport.import(url,
      (loadingMsg) => {
        toolTip(loadingMsg)
      },
      (error, content, cleanUrl, type, url) => {
        if (!error) {
          filesProviders[type].addReadOnly(cleanUrl, content, url)
          cb(null, content)
        } else {
          cb(error)
        }
      })
  }

  function importFileCb (url, filecb) {
    var provider = fileManager.fileProviderOf(url)
    if (provider) {
      provider.exists(url, (error, exist) => {
        if (error) return filecb(error)
        if (exist) {
          return provider.get(url, filecb)
        } else {
          importExternal(url, filecb)
        }
      })
    } else if (self._components.compilerImport.isRelativeImport(url)) {
      // try to resolve localhost modules (aka truffle imports)
      const splitted = /([^/]+)\/(.*)$/g.exec(url)
      async.tryEach([
        (cb) => { importFileCb('localhost/installed_contracts/' + url, cb) },
        (cb) => { if (!splitted) { cb('url not parseable' + url) } else { importFileCb('localhost/installed_contracts/' + splitted[1] + '/contracts/' + splitted[2], cb) } },
        (cb) => { importFileCb('localhost/node_modules/' + url, cb) },
        (cb) => { if (!splitted) { cb('url not parseable' + url) } else { importFileCb('localhost/node_modules/' + splitted[1] + '/contracts/' + splitted[2], cb) } }],
        (error, result) => { filecb(error, result) }
      )
    } else {
      importExternal(url, filecb)
    }
  }

  // ----------------- Compiler -----------------
  const compiler = new Compiler(importFileCb)
  const offsetToLineColumnConverter = new OffsetToLineColumnConverter(compiler.event)
  return { compiler, offsetToLineColumnConverter };
}
export default initSolidityCompiler;
