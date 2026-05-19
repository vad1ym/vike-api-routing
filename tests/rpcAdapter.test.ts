import { describe, it, expect } from 'vitest'
import { dispatchRpc } from '../lib/middleware/rpcAdapter.js'

const handlers = {
  userHandler: {
    getUser: async (id: string) => ({ id, name: 'Alice' }),
    listUsers: async () => [{ id: '1' }, { id: '2' }],
    failingFn: async () => { throw new Error('something broke') },
  },
}

function makeRequest(url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const RPC = '/_rpc'

describe('dispatchRpc', () => {
  it('returns null for non-rpc path', async () => {
    const req = makeRequest('/api/users')
    const res = await dispatchRpc(req, handlers, RPC)
    expect(res).toBeNull()
  })

  it('returns null for GET method', async () => {
    const req = new Request('http://localhost/_rpc/userHandler/getUser', { method: 'GET' })
    const res = await dispatchRpc(req, handlers, RPC)
    expect(res).toBeNull()
  })

  it('calls handler function with args and returns JSON', async () => {
    const req = makeRequest('/_rpc/userHandler/getUser', ['123'])
    const res = await dispatchRpc(req, handlers, RPC)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ id: '123', name: 'Alice' })
  })

  it('calls handler function with no args', async () => {
    const req = makeRequest('/_rpc/userHandler/listUsers', [])
    const res = await dispatchRpc(req, handlers, RPC)
    expect(res!.status).toBe(200)
    const body = await res!.json()
    expect(body).toHaveLength(2)
  })

  it('returns 404 for unknown handler', async () => {
    const req = makeRequest('/_rpc/unknownHandler/getUser', [])
    const res = await dispatchRpc(req, handlers, RPC)
    expect(res!.status).toBe(404)
    const body = await res!.json()
    expect(body.message).toContain('unknownHandler')
  })

  it('returns 404 for unknown function in known handler', async () => {
    const req = makeRequest('/_rpc/userHandler/nonExistentFn', [])
    const res = await dispatchRpc(req, handlers, RPC)
    expect(res!.status).toBe(404)
    const body = await res!.json()
    expect(body.message).toContain('nonExistentFn')
  })

  it('returns 500 when handler function throws', async () => {
    const req = makeRequest('/_rpc/userHandler/failingFn', [])
    const res = await dispatchRpc(req, handlers, RPC)
    expect(res!.status).toBe(500)
    const body = await res!.json()
    expect(body.message).toBe('something broke')
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/_rpc/userHandler/getUser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await dispatchRpc(req, handlers, RPC)
    expect(res!.status).toBe(400)
  })

  it('respects custom rpcPrefix', async () => {
    const req = makeRequest('/rpc/userHandler/getUser', ['1'])
    const res = await dispatchRpc(req, handlers, '/rpc')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
  })
})
