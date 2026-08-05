import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Admin from './Admin'
import './styles.css'

const root = createRoot(document.getElementById('root'))
if (window.location.pathname.startsWith('/admin')) {
  root.render(<Admin />)
} else {
  root.render(<App />)
}
