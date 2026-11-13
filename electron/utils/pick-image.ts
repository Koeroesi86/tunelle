import { BrowserWindow, dialog } from 'electron';
import type { OpenDialogOptions, WebContents } from 'electron';

/** Ask the user for a JPEG, PNG or WebP file, over the window of the page that asked; undefined when the dialog is cancelled */
export const pickImage = async (sender: WebContents, title: string, filterName: string) => {
  const options: OpenDialogOptions = {
    title,
    properties: ['openFile'],
    filters: [{ name: filterName, extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  };
  const window = BrowserWindow.fromWebContents(sender);
  const { canceled, filePaths } = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options));
  return canceled ? undefined : filePaths[0];
};
