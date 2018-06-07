import { execution } from 'remix-lib';
const Txlistener= execution.txListener;
const EventsDecoder = execution.EventsDecoder;

console.log(execution);
const initTxListener = (self, executionContext, compiler, udapp) => {
  const transactionReceiptResolver = {
    _transactionReceipts: {},
    resolve: function (tx, cb) {
      if (self._transactionReceipts[tx.hash]) {
        return cb(null, self._transactionReceipts[tx.hash])
      }
      executionContext.web3().eth.getTransactionReceipt(tx.hash, (error, receipt) => {
        if (!error) {
          self._transactionReceipts[tx.hash] = receipt
          cb(null, receipt)
        } else {
          cb(error)
        }
      })
    }
  }

  const compiledContracts = function () {
    if (compiler.lastCompilationResult && compiler.lastCompilationResult.data) {
      return compiler.lastCompilationResult.data.contracts
    }
    return null
  }
  const txlistener = new Txlistener({
    api: {
      contracts: compiledContracts,
      resolveReceipt: function (tx, cb) {
        transactionReceiptResolver.resolve(tx, cb)
      }
    },
    event: {
      udapp: udapp.event
    }})

  const eventsDecoder = new EventsDecoder({
    api: {
      resolveReceipt: function (tx, cb) {
        transactionReceiptResolver.resolve(tx, cb)
      }
    }
  })

  txlistener.startListening()
  return txlistener;
}

export default initTxListener;