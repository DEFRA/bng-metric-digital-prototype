const assert = require('node:assert/strict')
const net = require('node:net')
const { afterEach, test } = require('node:test')

const { proxyFetch } = require('../app/lib/proxy-fetch')

const originalHttpProxy = process.env.HTTP_PROXY

afterEach(() => {
  if (originalHttpProxy === undefined) {
    delete process.env.HTTP_PROXY
  } else {
    process.env.HTTP_PROXY = originalHttpProxy
  }
})

test('proxyFetch uses a dispatcher compatible with its fetch implementation', async () => {
  let receivedProxyConnection = false
  const proxy = net.createServer((socket) => {
    receivedProxyConnection = true
    socket.destroy()
  })

  await new Promise((resolve, reject) => {
    proxy.once('error', reject)
    proxy.listen(0, '127.0.0.1', resolve)
  })

  const { port } = proxy.address()
  process.env.HTTP_PROXY = `http://127.0.0.1:${port}`

  try {
    await assert.rejects(proxyFetch('https://example.invalid'))
    assert.equal(receivedProxyConnection, true)
  } finally {
    await new Promise((resolve) => proxy.close(resolve))
  }
})
