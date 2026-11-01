import net from 'net'
import { describe, expect, it } from 'vitest'
import { watch } from './watch-github'

const connect = port =>
  new Promise(resolve => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => socket.end())
    socket.once('close', resolve)
    socket.once('error', resolve)
  })

const nothing = async () => undefined

describe('watch', () => {
  it('has no connections when the command makes none, after a control request that was seen', async () => {
    expect(await watch({ ports: [0], probe: ([port]) => connect(port), run: nothing, wait: nothing })).toEqual([])
  })

  it('returns the connections that were made while the command ran, not the control request', async () => {
    let ports = []
    const connections = await watch({
      ports: [0, 0],
      probe: async found => {
        ports = found
        await connect(found[0])
      },
      run: () => connect(ports[1]),
      wait: nothing
    })

    expect(connections).toHaveLength(1)
    expect(connections[0]).toContain(`to port ${ports[1]}`)
  })

  it('fails when the control request is not seen, as the check would pass for the wrong reason', async () => {
    await expect(watch({ ports: [0], probe: nothing, run: nothing, wait: nothing })).rejects.toThrow('did not reach the listener')
  })
})
