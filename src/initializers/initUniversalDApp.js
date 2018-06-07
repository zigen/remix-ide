const $ = require('jquery')
const UniversalDApp = require('../universal-dapp.js')
const UniversalDAppUI = require('../universal-dapp-ui.js')
const initUniversalDApp = (self, executionContext) => {
  const transactionContextAPI = {
    getAddress: (cb) => {
      cb(null, $('#txorigin').val())
    },
    getValue: (cb) => {
      try {
        var number = document.querySelector('#value').value
        var select = document.getElementById('unit')
        var index = select.selectedIndex
        var selectedUnit = select.querySelectorAll('option')[index].dataset.unit
        var unit = 'ether' // default
        if (selectedUnit === 'ether') {
          unit = 'ether'
        } else if (selectedUnit === 'finney') {
          unit = 'finney'
        } else if (selectedUnit === 'gwei') {
          unit = 'gwei'
        } else if (selectedUnit === 'wei') {
          unit = 'wei'
        }
        cb(null, executionContext.web3().toWei(number, unit))
      } catch (e) {
        cb(e)
      }
    },
    getGasLimit: (cb) => {
      cb(null, $('#gasLimit').val())
    }
  }

  const udapp = new UniversalDApp({
    api: {
      logMessage: (msg) => {
        self._components.editorpanel.log({ type: 'log', value: msg })
      },
      logHtmlMessage: (msg) => {
        self._components.editorpanel.log({ type: 'html', value: msg })
      },
      config: self._api.config,
      detectNetwork: (cb) => {
        executionContext.detectNetwork(cb)
      },
      personalMode: () => {
        return self._api.config.get('settings/personal-mode')
      }
    },
    opt: { removable: false, removable_instances: true }
  })

  const udappUI = new UniversalDAppUI(udapp)

  udapp.reset({}, transactionContextAPI)
  udappUI.reset()
  udapp.event.register('debugRequested', this, function (txResult) {
    startdebugging(txResult.transactionHash)
  })
  return { udapp, udappUI, transactionContextAPI }
};
export default initUniversalDApp;
