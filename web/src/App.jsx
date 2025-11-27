import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Plus, Power, Trash2, Edit2, X, Monitor, Wifi } from 'lucide-react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

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
  const [showSettings, setShowSettings] = useState(false)
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [editingDevice, setEditingDevice] = useState(null)

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

  async function saveDevice(d) {
    await api('/api/devices', { method: 'POST', headers, body: JSON.stringify(d) })
    await load()
    setShowAddDevice(false)
    setEditingDevice(null)
  }

  async function del(id) {
    if (!confirm('Are you sure you want to remove this device?')) return
    await api(`/api/devices/${id}`, { method: 'DELETE' })
    await load()
  }

  async function wake(d) {
    const data = new URLSearchParams()
    data.set('mac', d.mac); if (d.ip) data.set('ip', d.ip); if (d.port) data.set('port', d.port)
    const headers = {}
    if (token) headers['X-Auth-Token'] = token
    
    try {
      const res = await fetch('/wol', { method: 'POST', body: data, headers })
      const text = await res.text()
      // Optional: Show toast notification here instead of alert
      if (!res.ok) throw new Error(text)
    } catch (e) {
      alert(`Error: ${e.message}`)
    }
  }

  return (
    <div className='min-h-screen w-full relative overflow-hidden text-foreground selection:bg-primary/30'>
      {/* Background Ambience */}
      <div className='fixed inset-0 pointer-events-none z-0'>
        <div className='absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px]' />
        <div className='absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px]' />
      </div>

      <div className='relative z-10 container mx-auto px-4 py-8 md:py-12 max-w-5xl'>
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className='flex items-center justify-between mb-12'
        >
          <div>
            <h1 className='text-4xl md:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 drop-shadow-sm'>
              WOLE
            </h1>
            <p className='text-muted-foreground mt-1 font-sans text-lg'>Wake On LAN Relay</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="w-6 h-6" />
          </Button>
        </motion.header>

        <main>
          {loading ? (
            <div className='flex justify-center py-20'>
              <div className='animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary'></div>
            </div>
          ) : error ? (
            <div className='text-red-400 bg-red-900/20 p-4 rounded-xl border border-red-500/20 text-center'>
              Error: {error}
            </div>
          ) : (
            <motion.div 
              className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.1
                  }
                }
              }}
            >
              <AnimatePresence>
                {devices.map((d) => (
                  <DeviceCard 
                    key={d.id} 
                    device={d} 
                    onWake={() => wake(d)} 
                    onEdit={() => { setEditingDevice(d); setShowAddDevice(true) }}
                    onDelete={() => del(d.id)}
                  />
                ))}
              </AnimatePresence>
              
              {/* Add Device Card */}
              <motion.button
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: { opacity: 1, y: 0 }
                }}
                whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.08)" }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setEditingDevice(null); setShowAddDevice(true) }}
                className='glass-panel rounded-2xl p-6 flex flex-col items-center justify-center min-h-[200px] gap-4 group cursor-pointer border-dashed border-white/20 hover:border-primary/50 transition-colors'
              >
                <div className='w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary/20 transition-colors'>
                  <Plus className='w-6 h-6 text-white/50 group-hover:text-primary transition-colors' />
                </div>
                <span className='text-muted-foreground font-medium group-hover:text-primary transition-colors'>Add Device</span>
              </motion.button>
            </motion.div>
          )}
        </main>
      </div>

      {/* Settings Modal */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings">
        <div className='space-y-4'>
          <div className='space-y-2'>
            <label className='text-sm font-medium text-muted-foreground'>Auth Token</label>
            <div className='flex gap-2'>
              <Input 
                type="password"
                placeholder='Enter token if configured' 
                value={token} 
                onChange={(e) => setToken(e.target.value)} 
                className='bg-white/5 border-white/10 focus:border-primary/50'
              />
              <Button variant='outline' onClick={() => setToken('')}>Clear</Button>
            </div>
            <p className='text-xs text-muted-foreground'>Token is stored locally and added to requests.</p>
          </div>
        </div>
      </Modal>

      {/* Add/Edit Device Modal */}
      <Modal 
        open={showAddDevice} 
        onClose={() => { setShowAddDevice(false); setEditingDevice(null) }} 
        title={editingDevice ? "Edit Device" : "Add Device"}
      >
        <DeviceForm 
          initialData={editingDevice} 
          onSave={saveDevice} 
          onCancel={() => { setShowAddDevice(false); setEditingDevice(null) }} 
        />
      </Modal>
    </div>
  )
}

function DeviceCard({ device, onWake, onEdit, onDelete }) {
  const [waking, setWaking] = useState(false)

  const handleWake = async () => {
    setWaking(true)
    await onWake()
    setTimeout(() => setWaking(false), 2000)
  }

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
      }}
      className='glass-panel rounded-2xl p-6 relative group overflow-hidden'
    >
      <div className='absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2'>
        <button onClick={onEdit} className='p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors'>
          <Edit2 className='w-4 h-4' />
        </button>
        <button onClick={onDelete} className='p-2 hover:bg-red-500/20 rounded-full text-white/60 hover:text-red-400 transition-colors'>
          <Trash2 className='w-4 h-4' />
        </button>
      </div>

      <div className='flex items-start gap-4 mb-6'>
        <div className='p-3 rounded-xl bg-primary/10 text-primary'>
          <Monitor className='w-6 h-6' />
        </div>
        <div>
          <h3 className='font-bold text-lg leading-tight text-white'>{device.name}</h3>
          <p className='text-xs font-mono text-muted-foreground mt-1'>{device.mac}</p>
        </div>
      </div>

      <div className='space-y-2 mb-6'>
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>IP Address</span>
          <span className='font-mono text-white/80'>{device.ip || 'Broadcast'}</span>
        </div>
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>Port</span>
          <span className='font-mono text-white/80'>{device.port}</span>
        </div>
      </div>

      <Button 
        className={cn(
          "w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 transition-all duration-500",
          waking ? "bg-green-500 hover:bg-green-600 text-white shadow-green-500/20" : "bg-primary hover:bg-primary/90 text-primary-foreground"
        )}
        onClick={handleWake}
        disabled={waking}
      >
        <Power className={cn("w-5 h-5 mr-2", waking && "animate-pulse")} />
        {waking ? "Signal Sent" : "Wake Up"}
      </Button>
    </motion.div>
  )
}

function Modal({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <h2 className="text-xl font-bold font-display">{title}</h2>
                <button onClick={onClose} className="text-muted-foreground hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

function DeviceForm({ initialData, onSave, onCancel }) {
  const [name, setName] = useState(initialData?.name || '')
  const [mac, setMac] = useState(initialData?.mac || '')
  const [ip, setIp] = useState(initialData?.ip || '255.255.255.255')
  const [port, setPort] = useState(initialData?.port || 9)
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ ...initialData, name, mac, ip, port: Number(port) || 9 })
    } catch (e) {
      alert(e.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className='space-y-4'>
      <div className='space-y-2'>
        <label className='text-sm font-medium text-muted-foreground'>Name</label>
        <Input 
          required 
          value={name} 
          onChange={e => setName(e.target.value)} 
          className='bg-white/5 border-white/10 focus:border-primary/50'
          placeholder="My PC"
        />
      </div>
      <div className='space-y-2'>
        <label className='text-sm font-medium text-muted-foreground'>MAC Address</label>
        <Input 
          required 
          placeholder='AA:BB:CC:DD:EE:FF' 
          value={mac} 
          onChange={e => setMac(e.target.value)} 
          className='bg-white/5 border-white/10 focus:border-primary/50 font-mono'
        />
      </div>
      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-2'>
          <label className='text-sm font-medium text-muted-foreground'>IP Address</label>
          <Input 
            value={ip} 
            onChange={e => setIp(e.target.value)} 
            className='bg-white/5 border-white/10 focus:border-primary/50 font-mono'
          />
        </div>
        <div className='space-y-2'>
          <label className='text-sm font-medium text-muted-foreground'>Port</label>
          <Input 
            type='number' 
            value={port} 
            onChange={e => setPort(e.target.value)} 
            className='bg-white/5 border-white/10 focus:border-primary/50 font-mono'
          />
        </div>
      </div>
      <div className='flex gap-3 pt-4'>
        <Button type='button' variant='ghost' className='flex-1' onClick={onCancel}>Cancel</Button>
        <Button type='submit' className='flex-1' disabled={saving}>
          {saving ? 'Saving…' : 'Save Device'}
        </Button>
      </div>
    </form>
  )
}
