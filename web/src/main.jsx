import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Apply initial theme from localStorage or system preference using `.dark` class
const savedTheme = (() => {
  try { return localStorage.getItem('theme') } catch { return null }
})()
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
const theme = (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : (prefersDark ? 'dark' : 'light')
document.documentElement.classList.toggle('dark', theme === 'dark')

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
