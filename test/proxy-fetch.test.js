const assert = require('node:assert/strict')
const http = require('node:http')
const net = require('node:net')
const { afterEach, test } = require('node:test')

const { proxyFetch } = require('../app/lib/proxy-fetch')

const originalHttpProxy = process.env.HTTP_PROXY

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
}

function close(server, sockets = []) {
  sockets.forEach((socket) => socket.destroy())
  return new Promise((resolve) => server.close(resolve))
}

function trackSockets(server) {
  const sockets = new Set()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  return sockets
}

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

  await listen(proxy)

  const { port } = proxy.address()
  process.env.HTTP_PROXY = `http://127.0.0.1:${port}`

  try {
    await assert.rejects(proxyFetch('https://example.invalid'))
    assert.equal(receivedProxyConnection, true)
  } finally {
    await close(proxy)
  }
})

test('proxyFetch connects directly when HTTP_PROXY is not configured', async () => {
  const target = http.createServer((_request, response) =>
    response.end('direct')
  )
  await listen(target)
  delete process.env.HTTP_PROXY

  try {
    const { port } = target.address()
    const response = await proxyFetch(`http://127.0.0.1:${port}`)
    assert.equal(await response.text(), 'direct')
  } finally {
    await close(target)
  }
})

test('proxyFetch reuses proxy connections', async () => {
  let proxyConnectionCount = 0
  const proxy = http.createServer((_request, response) => {
    response.end('proxied')
  })
  const proxySockets = trackSockets(proxy)
  proxy.on('connection', () => proxyConnectionCount++)
  await listen(proxy)

  const { port: proxyPort } = proxy.address()
  process.env.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`

  try {
    const requestCount = 6
    for (let index = 0; index < requestCount; index++) {
      const response = await proxyFetch('http://example.invalid/test')
      assert.equal(await response.text(), 'proxied')
    }
    assert.ok(proxyConnectionCount < requestCount)
  } finally {
    await close(proxy, proxySockets)
  }
})
