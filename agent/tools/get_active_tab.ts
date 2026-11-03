import { toEveTool } from '../lib/eve/tool'
import { getActiveTab } from '../lib/tools/browser-tools'

export default toEveTool(getActiveTab)
