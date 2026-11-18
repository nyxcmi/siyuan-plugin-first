import {
  Plugin,
  getFrontend,
} from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { destroy, init } from '@/main'
import { modules } from '@/modules'

let PluginInfo = {
  version: '',
}
try {
  PluginInfo = PluginInfoString
} catch (err) {
  console.log('Plugin info parse error: ', err)
}
const {
  version,
} = PluginInfo

export default class PluginSample extends Plugin {
  // Run as mobile
  public isMobile: boolean
  // Run in browser
  public isBrowser: boolean
  // Run as local
  public isLocal: boolean
  // Run in Electron
  public isElectron: boolean
  // Run in window
  public isInWindow: boolean
  public platform: SyFrontendTypes
  public readonly version = version

  /** 各模块注册的清理函数，卸载时按顺序调用 */
  private cleanups: Array<() => void> = []

  async onload() {
    const frontEnd = getFrontend();
    this.platform = frontEnd as SyFrontendTypes
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile"
    this.isBrowser = frontEnd.includes('browser')
    this.isLocal =
      location.href.includes('127.0.0.1')
      || location.href.includes('localhost')
    this.isInWindow = location.href.includes('window.html')

    try {
      require("@electron/remote")
        .require("@electron/remote/main")
      this.isElectron = true
    } catch (err) {
      this.isElectron = false
    }

    console.log('Plugin loaded, the plugin is ', this)

    init(this)

    // 逐个挂载模块。单个模块出错不影响其他模块。00
    for (const m of modules) {
      try {
        const cleanup = await m.setup(this)
        if (typeof cleanup === "function") {
          this.cleanups.push(cleanup)
        }
        console.log(`[module] ${m.id} (${m.name}) ready`)
      } catch (err) {
        console.error(`[module] ${m.id} (${m.name}) setup failed:`, err)
      }
    }
  }

  onunload() {
    for (const cleanup of this.cleanups) {
      try {
        cleanup()
      } catch (err) {
        console.error('[module] cleanup failed:', err)
      }
    }
    this.cleanups = []

    destroy()
  }
}
