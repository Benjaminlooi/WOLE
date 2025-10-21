import React, { useEffect, useMemo, useState } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'

function useToken() {
  const [token, setToken] = useState('')
  useEffect(() => {
    try { setToken(localStorage.getItem('token') || '') } catch {}
  }, [])
  const save = (t) => {
    setToken(t)
    try { localStorage.setItem('token', t) } catch {}
  }
  return [token, save]
}

async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {})
  const t = localStorage.getItem('token') || ''
  if (t) headers.set('X-Auth-Token', t)
  const res = await fetch(path, { ...opts, headers })
  if (!res.ok) {
    let msg = `${res.status}`
    try { const j = await res.json(); msg = j.error || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export default function App() {
  const [token, setToken] = useToken()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'))

  const headers = useMemo(() => ({ 'Content-Type': 'application/json' }), [])

  async function load() {
    setLoading(true); setError('')
    try {
      const list = await api('/api/devices')
      setDevices(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])

  async function saveDevice(d) {
    await api('/api/devices', { method: 'POST', headers, body: JSON.stringify(d) })
    await load()
  }

  async function del(id) {
    await api(`/api/devices/${id}`, { method: 'DELETE' })
    await load()
  }

  async function wake(d) {
    const data = new URLSearchParams()
    data.set('mac', d.mac); if (d.ip) data.set('ip', d.ip); if (d.port) data.set('port', d.port)
    const headers = {}
    if (token) headers['X-Auth-Token'] = token
    const res = await fetch('/wol', { method: 'POST', body: data, headers })
    const text = await res.text()
    alert(res.ok ? text : `Error: ${text}`)
  }

  return (
    <div className='min-h-dvh'>
      <div className='mx-auto max-w-4xl p-4 md:p-6'>
        <header className='mb-4 flex items-center justify-between gap-3'>
          <h1 className='m-0 flex items-center gap-2 text-2xl font-semibold'>
            Wake On LAN <span className='rounded-full border px-2 py-0.5 text-xs text-muted-foreground'>Web</span>
          </h1>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </header>

        <section className='rounded-xl border bg-card p-4 text-card-foreground shadow-sm md:p-5' aria-labelledby='auth-heading'>
          <h3 id='auth-heading' className='mb-3 text-base font-medium'>Auth</h3>
          <div className='flex flex-wrap items-center gap-2'>
            <Input placeholder='Enter token if configured' value={token} onChange={(e) => setToken(e.target.value)} aria-label='Auth token' className='w-64' />
            <Button variant='ghost' type='button' onClick={() => setToken('')}>Clear</Button>
          </div>
          <div className='mt-2 text-xs text-muted-foreground'>Token is stored locally and added to requests.</div>
        </section>

        <section className='mt-4 rounded-xl border bg-card p-0 text-card-foreground shadow-sm'>
          <div className='p-4 md:p-5'>
            <h3 id='devices-heading' className='mb-3 text-base font-medium'>Devices</h3>
            {loading ? (
              <div className='flex items-center gap-2' role='status' aria-live='polite'>
                <span className='inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent'></span>
                <span>Loading…</span>
              </div>
            ) : error ? (
              <div className='text-sm text-red-500' role='alert'>Error: {error}</div>
            ) : devices.length === 0 ? (
              <div className='text-sm text-muted-foreground'>No devices yet. Add one below.</div>
            ) : null}
          </div>
          {devices.length > 0 && !loading && !error && (
            <div className='overflow-x-auto rounded-b-xl border-t'>
              <table className='w-full min-w-[640px] border-collapse text-sm'>
                <thead className='bg-muted/40 text-muted-foreground'>
                  <tr>
                    <th className='px-3 py-2 text-left text-xs uppercase tracking-wide'>Name</th>
                    <th className='px-3 py-2 text-left text-xs uppercase tracking-wide'>MAC</th>
                    <th className='px-3 py-2 text-left text-xs uppercase tracking-wide'>IP</th>
                    <th className='px-3 py-2 text-left text-xs uppercase tracking-wide'>Port</th>
                    <th className='px-3 py-2 text-left text-xs uppercase tracking-wide'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id} className='hover:bg-accent/40'>
                      <td className='border-t border-border px-3 py-2'>{d.name}</td>
                      <td className='border-t border-border px-3 py-2 font-mono text-xs'>{d.mac}</td>
                      <td className='border-t border-border px-3 py-2'>{d.ip}</td>
                      <td className='border-t border-border px-3 py-2'>{d.port}</td>
                      <td className='border-t border-border px-3 py-2'>
                        <div className='flex gap-2'>
                          <Button onClick={() => wake(d)}>Wake</Button>
                          <Button variant='outline' onClick={() => saveDevice(d)}>Edit</Button>
                          <Button variant='destructive' onClick={() => del(d.id)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className='mt-4 rounded-xl border bg-card p-4 text-card-foreground shadow-sm md:p-5' aria-labelledby='form-heading'>
          <h3 id='form-heading' className='mb-3 text-base font-medium'>Add / Update Device</h3>
          <DeviceForm onSave={saveDevice} />
        </section>
      </div>
    </div>
  )
}

function DeviceForm({ onSave }) {
  const [name, setName] = useState('')
  const [mac, setMac] = useState('')
  const [ip, setIp] = useState('255.255.255.255')
  const [port, setPort] = useState(9)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit(e) {
    e.preventDefault()
    setSaving(true); setMsg('')
    try {
      await onSave({ name, mac, ip, port: Number(port) || 9 })
      setMsg('Saved')
      setName(''); setMac(''); setIp('255.255.255.255'); setPort(9)
    } catch (e) {
      setMsg(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className='grid max-w-[600px] gap-2'>
      <label className='grid gap-1 text-sm text-muted-foreground'>
        Name
        <Input required value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className='grid gap-1 text-sm text-muted-foreground'>
        MAC
        <Input required placeholder='AA:BB:CC:DD:EE:FF' value={mac} onChange={e => setMac(e.target.value)} />
      </label>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <label className='grid gap-1 text-sm text-muted-foreground'>
          Broadcast IP
          <Input value={ip} onChange={e => setIp(e.target.value)} />
        </label>
        <label className='grid gap-1 text-sm text-muted-foreground'>
          Port
          <Input type='number' value={port} onChange={e => setPort(e.target.value)} />
        </label>
      </div>
      <div className='mt-1 flex items-center gap-2'>
        <Button type='submit' disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {msg ? <span className='text-xs text-muted-foreground' role='status' aria-live='polite'>{msg}</span> : null}
      </div>
    </form>
  )
}

function ThemeToggle({ theme, setTheme }) {
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <Button
      variant='outline'
      type='button'
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
    </Button>
  )
}
