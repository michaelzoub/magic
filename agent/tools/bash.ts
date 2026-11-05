// Magic drives the browser, not a shell: Eve's sandbox tools have no
// sandbox provider in the packaged app (no Docker or Vercel), so remove them.
import { disableTool } from 'eve/tools'

export default disableTool()
