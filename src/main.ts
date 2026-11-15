import {
  Plugin,
} from "siyuan";

let plugin: Plugin | null = null

/** 绑定插件实例，供其他模块取用 */
export function usePlugin(pluginProps?: Plugin): Plugin {
  if (pluginProps) {
    plugin = pluginProps
  }
  if (!plugin) {
    console.error('need bind plugin')
  }
  return plugin as Plugin
}

/**
 * 插件 onload 钩子。
 * 模板原本会在这里挂一个 Vue 演示面板到 body 上，已移除。
 */
export function init(pluginProps: Plugin) {
  usePlugin(pluginProps)
}

/** 插件 onunload 钩子 */
export function destroy() {
  plugin = null
}
