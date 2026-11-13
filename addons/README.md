# Add-ons built with Solder

The libraries that ship apart from Solder, laid out as an add-ons folder (DT-081): one folder per add-on and API
version, the common part in `<name>/` and the compiled code of each platform in `<name>-<os>-<arch>/`.

- `daq/`: DAQ (DT-076, DT-087). Its platform parts hold Solder's own `nilvaiu` in `resource/`, built there by
  `node scripts/build-native.mjs` (never committed; Windows' is built in the Windows virtual machine). A node naming
  `nilvaiu.*` loads that copy by its full path (DT-087, amendment of 2026-11-13 §8).

Installing is copying these folders into an add-ons folder Solder reads (`~/.local/share/solder/addons` on Linux,
`%APPDATA%\Solder\Addons` on Windows), with the libraries built.
