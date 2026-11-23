const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const env = require('./lib/env');

const envFile = (app) => path.join(app, '.env');
const readEnv = (app) => fs.readFileSync(envFile(app), 'utf8');
const isLaravel = (dir) => fs.existsSync(envFile(dir)) && fs.existsSync(path.join(dir, 'artisan'));
const subdirs = (root) =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(root, d.name));

function discover() {
  const groups = [];
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const root = folder.uri.fsPath;
    const config = vscode.workspace.getConfiguration('envSwitcher', folder.uri);
    const keys = config.get('keys');
    const configured = config.get('groups');

    if (configured.length) {
      for (const g of configured) {
        groups.push({ name: g.name, keys, apps: g.paths.map((p) => path.resolve(root, p)).filter(isLaravel) });
      }
    } else {
      for (const dir of [root, ...subdirs(root)].filter(isLaravel)) {
        groups.push({ name: path.basename(dir), keys, apps: [dir] });
      }
    }
  }
  return groups.filter((g) => g.apps.length && g.keys.length);
}

const state = (group, key) => env.group(group.apps.map(readEnv), key);

function tooltip(group) {
  const lines = [];
  for (const key of group.keys) {
    lines.push(key);
    for (const app of group.apps) lines.push(`    ${path.basename(app)}: ${env.read(readEnv(app), key).current ?? 'not set'}`);
  }
  return [...lines, '', 'Click to switch'].join('\n');
}

let items = [];

function render() {
  items.forEach((item) => item.dispose());
  items = discover().map((group) => {
    const { synced, current } = state(group, group.keys[0]);
    const item = vscode.window.createStatusBarItem(`envSwitcher.${group.name}`, vscode.StatusBarAlignment.Left, 0);
    item.name = `Env Switcher: ${group.name}`;
    item.text = synced ? `$(database) ${group.name}: ${current ?? 'not set'}` : `$(warning) ${group.name}: out of sync`;
    item.backgroundColor = synced ? undefined : new vscode.ThemeColor('statusBarItem.warningBackground');
    item.tooltip = tooltip(group);
    item.command = { command: 'envSwitcher.switch', title: 'Switch', arguments: [group.name] };
    item.show();
    return item;
  });
}

async function switchValue(name) {
  const groups = discover();
  if (!groups.length) return vscode.window.showWarningMessage('Env Switcher: no Laravel app with a .env file found.');

  let group = groups.find((g) => g.name === name) || (groups.length === 1 && groups[0]);
  if (!group) {
    const picked = await vscode.window.showQuickPick(
      groups.map((g) => ({ label: g.name, description: g.apps.map((a) => path.basename(a)).join(' + '), group: g })),
      { placeHolder: 'Which apps?' }
    );
    if (!picked) return;
    group = picked.group;
  }

  let key = group.keys[0];
  if (group.keys.length > 1) {
    const picked = await vscode.window.showQuickPick(
      group.keys.map((k) => ({ label: k, description: state(group, k).current ?? 'out of sync' })),
      { placeHolder: `${group.name}: which setting?` }
    );
    if (!picked) return;
    key = picked.label;
  }

  const { current, options } = state(group, key);
  if (!options.length) {
    return vscode.window.showWarningMessage(
      `Env Switcher: no ${key} value is present in every .env of ${group.name}. Add it as a commented line to each file.`
    );
  }

  const picked = await vscode.window.showQuickPick(
    options.map((value) => ({ label: value, description: value === current ? 'current' : '' })),
    { placeHolder: `${group.name}: ${key}` }
  );
  if (!picked || picked.label === current) return;

  for (const app of group.apps) {
    const before = readEnv(app);
    const after = env.write(before, key, picked.label);
    if (after !== null && after !== before) fs.writeFileSync(envFile(app), after);
    //DROP THE CACHED CONFIG WHEN SWITCHING, LARAVEL IGNORES .ENV WHILE IT EXISTS
    fs.rmSync(path.join(app, 'bootstrap', 'cache', 'config.php'), { force: true });
  }

  render();
  vscode.window.setStatusBarMessage(`${group.name}: ${key} is now ${picked.label}`, 4000);
}

function activate(context) {
  let timer;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  };

  const watchers = (vscode.workspace.workspaceFolders || []).map((folder) => {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '{.env,*/.env}'));
    watcher.onDidChange(refresh);
    watcher.onDidCreate(refresh);
    watcher.onDidDelete(refresh);
    return watcher;
  });

  context.subscriptions.push(
    ...watchers,
    vscode.commands.registerCommand('envSwitcher.switch', switchValue),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('envSwitcher') && refresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    { dispose: () => items.forEach((item) => item.dispose()) }
  );

  render();
}

module.exports = { activate, deactivate() {} };
