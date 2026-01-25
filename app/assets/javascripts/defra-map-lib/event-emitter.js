//
// Minimal event emitter used by the Defra mapping client library.
// Not a module (loaded via <script> tags).
//

;(function (window) {
  'use strict'

  function DefraEventEmitter() {
    this._listeners = {}
  }

  DefraEventEmitter.prototype.on = function (eventName, handler) {
    if (!eventName || typeof handler !== 'function') {
      return
    }

    if (!this._listeners[eventName]) {
      this._listeners[eventName] = []
    }

    this._listeners[eventName].push(handler)
  }

  DefraEventEmitter.prototype.off = function (eventName, handler) {
    if (!eventName || !this._listeners[eventName]) {
      return
    }

    if (!handler) {
      delete this._listeners[eventName]
      return
    }

    this._listeners[eventName] = this._listeners[eventName].filter(
      (h) => h !== handler
    )
  }

  DefraEventEmitter.prototype.emit = function (eventName, payload) {
    const handlers = this._listeners[eventName] || []
    handlers.forEach((handler) => {
      try {
        handler(payload)
      } catch (e) {
        // Do not break other handlers.
        // eslint-disable-next-line no-console
        console.error(
          'DefraEventEmitter handler error for event:',
          eventName,
          e
        )
      }
    })
  }

  window.DefraMapLib = window.DefraMapLib || {}
  window.DefraMapLib.DefraEventEmitter = DefraEventEmitter
})(window)
