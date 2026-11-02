// نافذة السؤال (prompt.html): ترسل الجواب إلى العملية الرئيسية، ولا شيء غيره.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('warraqPrompt', {
  /** الجواب: نصٌّ، أو null (إلغاء) */
  done: (v) => ipcRenderer.send('warraq:prompt-done', v == null ? null : String(v)),
});
