# M3.0-R1 PDF Report

The main process now exposes PDF export through Electron `webContents.printToPDF` for generated HTML reports. The output is stored under the application user-data `reports` directory. Markdown and HTML remain available from the Renderer.

A packaged Electron PDF smoke test is still required. PDF preview and report history management remain follow-up work.
