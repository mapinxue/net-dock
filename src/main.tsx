import React from 'react'
import { createRoot } from 'react-dom/client'
import { Toast } from '@heroui/react'
import App from './App'
import './styles.css'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('App root not found')
}

createRoot(root).render(
  <React.StrictMode>
    <>
      <Toast.Provider placement="bottom end" />
      <App />
    </>
  </React.StrictMode>,
)
