// goodMob · default plugin set.
//
// A stock Blockbench web build has no plugins installed, so every fresh browser profile starts naked: no Asset
// Browser, no entity wizard, no WASD. This installs the set the goodMob workflow expects, once per profile, then
// leaves them alone (install/uninstall them in Plugins as usual).
//
// Plugin-only: uses the public Plugins API, needs no core patch. Re-run for a profile with:
//   localStorage.removeItem('goodmob_defaults_v1')   (then reload)
//
// Unknown ids, ids the store says are not installable here (desktop-only, too new/old) and offline boots are all
// no-ops that only log. Deprecated entries in the list are installed without the deprecation prompt so boot can
// never block on a dialog.
(() => {
  'use strict';
  const KEY = 'goodmob_defaults_v1';
  const WANTED = [
    'asset_browser',            // Asset Browser
    'minecraft_entity_wizard',  // Minecraft Entity Wizard
    'export_to_blender',        // Export to Blender
    'free_rotation',            // Free Rotation
    'wasd_controls',            // WASD Controls
    'ambient_occlusion',        // Ambient Occlusion
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function boot() {
    // Wait for the store index: setup_successful is set before loadInstalledPlugins() finishes, and Plugins.all is
    // filled from the store JSON only when that fetch succeeds (so offline boot just times out quietly).
    for (let i = 0; i < 300; i++) {
      if (window.Blockbench?.setup_successful && window.Plugins && Plugins.all?.length) return true;
      await sleep(100);
    }
    return false;
  }

  async function main() {
    if (!await boot()) return;
    if (localStorage.getItem(KEY)) return;

    const missing = WANTED.filter(id => !Plugins.installed.some(i => i.id === id));
    for (const id of missing) {
      const plugin = Plugins.all.find(p => p.id === id);
      if (!plugin) { console.warn(`[goodMob defaults] plugin "${id}" is not in the store index; skipped`); continue; }
      // Some of these are desktop-only (variant "desktop") or version-gated: on the web build they would throw
      // "require is not a function", so honour the store's own installability flag and say why.
      const installable = plugin.isInstallable();
      if (installable !== true) { console.info(`[goodMob defaults] skip ${id}: ${installable}`); continue; }
      try {
        // install() stops at a "this plugin is deprecated" message box; at boot that would hang until someone
        // clicks it, so go straight to the download for deprecated entries. This list is an explicit request.
        if (plugin.tags?.includes('Deprecated') || plugin.deprecation_note) {
          console.warn(`[goodMob defaults] ${id} is deprecated upstream; installing it because this list asks for it`);
          await plugin.download(true);
        } else {
          await plugin.install();
        }
        console.log(`[goodMob defaults] installed ${id}`);
      } catch (e) {
        console.error(`[goodMob defaults] could not install ${id}`, e);
      }
    }
    localStorage.setItem(KEY, '1');
  }

  main().catch(e => console.error('[goodMob defaults]', e));
})();
