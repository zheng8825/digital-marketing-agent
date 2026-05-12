import type { AppBridge } from './index'

declare global {
  interface Window {
    appBridge: AppBridge
  }
}

export {}
