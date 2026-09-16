const { fetch, ProxyAgent } = require('undici')

const KEEP_ALIVE_TIMEOUT = 10_000
const KEEP_ALIVE_MAX_TIMEOUT = 30_000

let proxyAgent
let proxyAgentUrl

function getProxyAgent(url) {
  if (proxyAgent && proxyAgentUrl === url) {
    return proxyAgent
  }

  const previousProxyAgent = proxyAgent

  proxyAgent = new ProxyAgent({
    uri: url,
    keepAliveTimeout: KEEP_ALIVE_TIMEOUT,
    keepAliveMaxTimeout: KEEP_ALIVE_MAX_TIMEOUT
  })
  proxyAgentUrl = url

  if (previousProxyAgent) {
    previousProxyAgent.close().catch(() => {})
  }

  return proxyAgent
}

/**
 * Fetch with optional proxy support
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function proxyFetch(url, options) {
  const proxyUrlConfig = process.env.HTTP_PROXY

  if (!proxyUrlConfig) {
    return await fetch(url, options)
  }

  return await fetch(url, {
    ...options,
    dispatcher: getProxyAgent(proxyUrlConfig)
  })
}

module.exports = { proxyFetch }
