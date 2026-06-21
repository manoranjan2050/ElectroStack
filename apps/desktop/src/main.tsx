import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  Archive,
  Boxes,
  ChevronRight,
  Code2,
  Container,
  Database,
  Download,
  Edit3,
  Eye,
  FileCode2,
  FolderGit2,
  Globe2,
  HardDrive,
  KeyRound,
  Lock,
  Moon,
  Network,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Square,
  Power,
  Trash2,
  Sun,
  Terminal,
  UploadCloud,
  Users,
  Workflow,
  Zap,
  Mail
} from "lucide-react";
import clsx from "clsx";
import "./styles.css";

type ServiceStatus = "Running" | "Stopped" | "Missing" | "Unknown";

type ServiceInfo = {
  key: string;
  name: string;
  status: ServiceStatus;
  port?: number;
  version?: string;
  executable: string;
};

type Overview = {
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  hostname: string;
  os: string;
  stackRoot: string;
  runningServices: number;
  services: ServiceInfo[];
};

type Website = {
  domain: string;
  root: string;
  phpVersion: string;
  ssl: boolean;
  createdAt: string;
};

type DatabaseInfo = {
  name: string;
  sizeMb: number;
  createdAt?: string;
};

const nav = [
  ["Dashboard", Activity],
  ["Websites", Globe2],
  ["Databases", Database],
  ["PHP Versions", FileCode2],
  ["Nginx", Server],
  ["Redis", Zap],
  ["Docker", Container],
  ["FTP", UploadCloud],
  ["SSL", Lock],
  ["Mail Catcher", Mail],
  ["Backups", Archive],
  ["Logs", Terminal],
  ["Composer", Boxes],
  ["Node.js", Workflow],
  ["Git", FolderGit2],
  ["Settings", Settings]
] as const;

function App() {
  const [active, setActive] = React.useState("Dashboard");
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [websites, setWebsites] = React.useState<Website[]>([]);
  const [databases, setDatabases] = React.useState<DatabaseInfo[]>([]);
  const [message, setMessage] = React.useState("Ready");
  const [authReady, setAuthReady] = React.useState(false);
  const [adminConfigured, setAdminConfigured] = React.useState(false);
  const [authenticated, setAuthenticated] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [overviewData, websiteData, databaseData] = await Promise.all([
      invoke<Overview>("get_overview"),
      invoke<Website[]>("get_websites").catch(() => []),
      invoke<DatabaseInfo[]>("get_databases").catch(() => [])
    ]);
    setOverview(overviewData);
    setWebsites(websiteData);
    setDatabases(databaseData);
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  React.useEffect(() => {
    invoke<boolean>("is_admin_configured")
      .then((configured) => {
        setAdminConfigured(configured);
        setAuthenticated(!configured);
      })
      .catch(() => setAuthenticated(true))
      .finally(() => setAuthReady(true));
  }, []);

  React.useEffect(() => {
    if (!authenticated) return;
    refresh().catch((error) => setMessage(String(error)));
    const id = window.setInterval(() => refresh().catch(() => undefined), 7000);
    return () => window.clearInterval(id);
  }, [authenticated, refresh]);

  async function run<T>(label: string, action: () => Promise<T>) {
    setMessage(`${label}...`);
    try {
      await action();
      setMessage(`${label} completed`);
      await refresh();
    } catch (error) {
      setMessage(String(error));
    }
  }

  if (!authReady) {
    return <div className="loginShell"><div className="loginBox"><Zap size={28} /><strong>ElectroStack</strong><span>Starting secure session...</span></div></div>;
  }

  if (!authenticated) {
    return <LoginScreen configured={adminConfigured} onDone={() => setAuthenticated(true)} />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <Zap size={22} />
          </div>
          <div>
            <strong>ElectroStack</strong>
            <span>Local web stack</span>
          </div>
        </div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={clsx("navItem", active === name && "active")}
              onClick={() => setActive(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <label className="search">
            <Search size={17} />
            <input placeholder="Search websites, services, logs" />
          </label>
          <div className="topActions">
            <StatusPill services={overview?.services ?? []} />
            <button className="iconButton" title="Refresh" onClick={() => refresh()}>
              <RefreshCw size={18} />
            </button>
            <button className="iconButton" title="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="userMenu" title="User menu">
              <Users size={17} />
              Admin
            </button>
          </div>
        </header>

        <section className="content">
          <div className="pageTitle">
            <div>
              <h1>{active}</h1>
              <p>{message}</p>
            </div>
            <div className="pageActions">
              <button onClick={() => run("Start all services", () => invoke("control_all_services", { action: "start" }))}>
                <Play size={17} />
                Start All
              </button>
              <button onClick={() => run("Stop all services", () => invoke("control_all_services", { action: "stop" }))}>
                <Power size={17} />
                Stop All
              </button>
              <button className="primary" onClick={() => run("Initialize stack", () => invoke("initialize_stack"))}>
                <Shield size={17} />
                Initialize
              </button>
            </div>
          </div>

          {active === "Dashboard" && <Dashboard overview={overview} run={run} />}
          {active === "Websites" && <WebsiteManager websites={websites} databases={databases} run={run} />}
          {active === "Databases" && <DatabaseManager databases={databases} run={run} />}
          {active === "PHP Versions" && <PhpManager run={run} />}
          {active === "Nginx" && <NginxManager run={run} />}
          {active === "Redis" && <RedisManager run={run} />}
          {active === "Docker" && <DockerManager run={run} />}
          {active === "FTP" && <FtpManager run={run} />}
          {active === "SSL" && <SslManager run={run} />}
          {active === "Mail Catcher" && <MailCatcher run={run} />}
          {active === "Backups" && <BackupManager run={run} />}
          {active === "Logs" && <LogsManager />}
          {active === "Composer" && <ComposerManager websites={websites} run={run} />}
          {active === "Node.js" && <NodeManager websites={websites} run={run} />}
          {active === "Git" && <GitManager websites={websites} run={run} />}
          {active === "Settings" && <SettingsView run={run} />}
        </section>

        <footer>
          <span>ElectroStack 0.1.0</span>
          <a href="https://github.com/electrostack/electrostack">GitHub</a>
          <span>{overview?.hostname ?? "Windows"} · {overview?.os ?? "Detecting system"}</span>
        </footer>
      </main>
    </div>
  );
}

function StatusPill({ services }: { services: ServiceInfo[] }) {
  const running = services.filter((service) => service.status.toLowerCase() === "running").length;
  return <div className="statusPill">{running}/{services.length} services running</div>;
}

function LoginScreen({ configured, onDone }: { configured: boolean; onDone: () => void }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (configured) {
        await invoke("login_admin", { password });
      } else {
        if (password !== confirm) throw new Error("Passwords do not match");
        await invoke("setup_admin_password", { password });
      }
      onDone();
    } catch (error) {
      setError(String(error));
    }
  }

  return (
    <div className="loginShell">
      <form className="loginBox" onSubmit={submit}>
        <div className="brandMark"><Zap size={22} /></div>
        <h1>{configured ? "Admin Login" : "Create Admin Password"}</h1>
        <p>{configured ? "Enter your ElectroStack admin password." : "Protect deletes, restores, and destructive stack actions."}</p>
        <input type="password" placeholder="Admin password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {!configured && (
          <input type="password" placeholder="Confirm password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        )}
        {error && <span className="formError">{error}</span>}
        <button className="primary">{configured ? "Login" : "Save Password"}</button>
      </form>
    </div>
  );
}

function Dashboard({ overview, run }: { overview: Overview | null; run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const services = overview?.services ?? [];
  return (
    <>
      <div className="metrics">
        <Metric title="CPU Usage" value={overview?.cpuUsage ?? 0} icon={Activity} />
        <Metric title="RAM Usage" value={overview?.ramUsage ?? 0} icon={Server} />
        <Metric title="Disk Usage" value={overview?.diskUsage ?? 0} icon={HardDrive} />
        <div className="metric">
          <Network size={20} />
          <span>Running Services</span>
          <strong>{overview?.runningServices ?? 0}</strong>
        </div>
      </div>
      <div className="grid two">
        <section className="panel">
          <h2>Services</h2>
          <div className="serviceList">
            {services.map((service) => (
              <ServiceRow key={service.key} service={service} run={run} />
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Quick Actions</h2>
          <div className="quickGrid">
            {["Create Website", "Launch phpMyAdmin", "Backup Stack", "Check Updates"].map((label) => (
              <button key={label} onClick={() => run(label, () => invoke(label === "Check Updates" ? "check_updates" : "initialize_stack"))}>
                <ChevronRight size={17} />
                {label}
              </button>
            ))}
            <button onClick={() => run("Open websites folder", () => invoke("open_sites_folder"))}>
              <ChevronRight size={17} />
              Open Websites Folder
            </button>
            <button onClick={() => run("Restart all services", () => invoke("control_all_services", { action: "restart" }))}>
              <RefreshCw size={17} />
              Restart All Services
            </button>
          </div>
          <div className="systemBox">
            <strong>System Information</strong>
            <span>{overview?.stackRoot ?? "C:\\ElectroStack"}</span>
            <span>{overview?.hostname}</span>
            <span>{overview?.os}</span>
          </div>
        </section>
      </div>
    </>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: typeof Activity }) {
  return (
    <div className="metric">
      <Icon size={20} />
      <span>{title}</span>
      <strong>{Math.round(value)}%</strong>
      <div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
    </div>
  );
}

function ServiceRow({ service, run }: { service: ServiceInfo; run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  return (
    <div className="serviceRow">
      <div>
        <strong>{service.name}</strong>
        <span>{service.port ? `:${service.port}` : service.executable}</span>
      </div>
      <span className={clsx("badge", service.status.toLowerCase())}>{service.status}</span>
      <button title="Start" onClick={() => run(`Start ${service.name}`, () => invoke("control_service", { key: service.key, action: "start" }))}><Play size={15} /></button>
      <button title="Stop" onClick={() => run(`Stop ${service.name}`, () => invoke("control_service", { key: service.key, action: "stop" }))}><Square size={15} /></button>
      <button title="Restart" onClick={() => run(`Restart ${service.name}`, () => invoke("control_service", { key: service.key, action: "restart" }))}><RefreshCw size={15} /></button>
    </div>
  );
}

function WebsiteManager({ websites, databases, run }: { websites: Website[]; databases: DatabaseInfo[]; run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [domain, setDomain] = React.useState("trading.local");
  const [phpVersion, setPhpVersion] = React.useState("8.3");
  const [ssl, setSsl] = React.useState(false);
  const [template, setTemplate] = React.useState("none");
  const [downloadDb, setDownloadDb] = React.useState("");
  const [tunnels, setTunnels] = React.useState<Record<string, string>>({});

  async function handleCreate() {
    await run(`Create website ${domain}`, async () => {
      await invoke("create_website", { request: { domain, phpVersion, ssl } });
      if (template !== "none") {
        await invoke("install_app_template", { domain, template });
      }
    });
  }

  async function shareTunnel(domain: string) {
    await run(`Start local tunnel for ${domain}`, async () => {
      const url = await invoke<string>("start_local_tunnel", { domain });
      setTunnels(prev => ({ ...prev, [domain]: url }));
    });
  }

  return (
    <div className="grid two">
      <section className="panel stackedForm">
        <h2>Create Website</h2>
        <label>Domain Name
          <input value={domain} onChange={(event) => setDomain(event.target.value)} />
        </label>
        <div className="formRow" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <label>PHP Version
            <select value={phpVersion} onChange={(event) => setPhpVersion(event.target.value)}>
              <option value="8.1">PHP 8.1</option>
              <option value="8.2">PHP 8.2</option>
              <option value="8.3">PHP 8.3</option>
              <option value="8.4">PHP 8.4</option>
            </select>
          </label>
          <label>Template
            <select value={template} onChange={(event) => setTemplate(event.target.value)}>
              <option value="none">Plain PHP</option>
              <option value="wordpress">WordPress Installer</option>
              <option value="laravel">Laravel Installer</option>
              <option value="react">React (Vite) Setup</option>
            </select>
          </label>
        </div>
        <div style={{ margin: "10px 0" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input type="checkbox" checked={ssl} onChange={(event) => setSsl(event.target.checked)} />
            <span>Enable Local SSL (HTTPS)</span>
          </label>
        </div>
        <button className="primary" onClick={handleCreate}>
          <Globe2 size={17} />
          Create Website
        </button>
        <div className="formHint">Use domains like `trading.local`, `mycalc.local`, or `electroiot.local`.</div>
      </section>

      <section className="panel">
        <h2>Sites</h2>
        <div className="formRow compact">
          <select value={downloadDb} onChange={(event) => setDownloadDb(event.target.value)}>
            <option value="">No database in ZIP</option>
            {databases.map((database) => <option key={database.name} value={database.name}>{database.name}</option>)}
          </select>
        </div>
        <div className="table">
          {websites.map((site) => {
            const urlName = site.domain.replace('.local', '');
            return (
              <div className="tableRow websiteRow" key={site.domain} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.4fr 0.4fr 0.4fr 0.4fr 0.4fr 0.4fr", alignItems: "center", gap: "6px" }}>
                <strong>{site.domain}</strong>
                <span style={{ fontSize: "12px", color: "var(--es-teal)" }}>PHP {site.phpVersion}</span>
                
                <button 
                  title="Trust SSL Certificate globally" 
                  onClick={() => run(`Trust Certificate for ${site.domain}`, () => invoke("trust_website_certificate", { domain: site.domain }))}
                  style={{ border: "none", background: "none", cursor: "pointer", display: "inline-flex", justifyContent: "center" }}
                >
                  <Shield size={15} style={{ color: site.ssl ? "#18a999" : "#8e9bb0" }} />
                </button>

                <button title="Open website" onClick={() => run("Open browser", () => invoke("open_url", { url: `http://localhost/${urlName}/` }))}><Eye size={15} /></button>
                <button title="Open folder" onClick={() => run("Open folder", () => invoke("open_path", { path: site.root }))}>Folder</button>
                <button title="Edit in VS Code" onClick={() => run("Open VS Code", () => invoke("open_vscode", { path: site.root }))}><Edit3 size={15} /></button>
                <button title="Download ZIP" onClick={() => run("Download website", () => invoke("download_website", { request: { domain: site.domain, database: downloadDb || null } }))}><Download size={15} /></button>
                <button title="Delete website" onClick={() => protectedRun("Delete website", (adminPassword) => run("Delete website", () => invoke("delete_website", { request: { domain: site.domain, adminPassword } })))}><Trash2 size={15} /></button>
                
                {tunnels[site.domain] && (
                  <div className="tunnelUrl" style={{ display: "flex", gap: "10px", alignItems: "center", width: "100%", gridColumn: "1 / -1", marginTop: "6px", background: "rgba(24,169,153,0.08)", padding: "6px 10px", borderRadius: "5px" }}>
                    <span style={{ fontSize: "11px", color: "#18a999", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>Tunnel: {tunnels[site.domain]}</span>
                    <button style={{ minHeight: "26px", fontSize: "11px", padding: "0 8px" }} onClick={() => invoke("open_url", { url: tunnels[site.domain] })}>Open</button>
                    <button style={{ minHeight: "26px", fontSize: "11px", padding: "0 8px" }} onClick={() => { navigator.clipboard.writeText(tunnels[site.domain]); alert("Copied to clipboard!"); }}>Copy</button>
                  </div>
                )}
                
                {!tunnels[site.domain] && (
                  <button 
                    title="Share Tunnel publicly" 
                    style={{ gridColumn: "1 / -1", marginTop: "5px", minHeight: "28px", fontSize: "12px" }} 
                    onClick={() => shareTunnel(site.domain)}
                  >
                    Share Local Tunnel (Localtunnel)
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function DatabaseManager({ databases, run }: { databases: DatabaseInfo[]; run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [name, setName] = React.useState("app_db");
  const [username, setUsername] = React.useState("app_user");
  const [password, setPassword] = React.useState("Password123");
  const [restorePath, setRestorePath] = React.useState("");
  return (
    <div className="grid two">
      <section className="panel">
        <h2>Create Database</h2>
        <div className="stackedForm">
          <label>DB Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>DB Username<input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>DB Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="primary" onClick={() => run("Create database", () => invoke("create_database", { request: { name, username, password } }))}>
            <Database size={17} />
            Create DB + User
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Databases</h2>
        <div className="formRow compact">
          <input placeholder="SQL file path for restore" value={restorePath} onChange={(event) => setRestorePath(event.target.value)} />
          <button onClick={() => run("Open phpMyAdmin", () => invoke("open_url", { url: "http://localhost/phpmyadmin" }))}>phpMyAdmin</button>
        </div>
        <div className="table">
          {databases.map((database) => (
            <div className="tableRow dbRow" key={database.name}>
              <strong>{database.name}</strong>
              <button title="View DB" onClick={() => run("View database", () => invoke("open_url", { url: `http://localhost/phpmyadmin/index.php?route=/database/structure&db=${database.name}` }))}><Eye size={15} /></button>
              <button title="Backup DB" onClick={() => run("Backup database", () => invoke("backup_database", { name: database.name }))}>Backup</button>
              <button title="Restore DB" onClick={() => run("Restore database", () => invoke("restore_database", { name: database.name, sqlPath: restorePath }))}>Restore</button>
              <button title="Download DB" onClick={() => run("Download database", () => invoke("download_database", { name: database.name }))}><Download size={15} /></button>
              <button title="Delete DB" onClick={() => protectedRun("Delete database", (adminPassword) => run("Delete database", () => invoke("delete_database", { request: { name: database.name, adminPassword } })))}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function protectedRun(label: string, action: (adminPassword: string) => void) {
  const adminPassword = window.prompt(`${label} requires admin password`);
  if (!adminPassword) return;
  action(adminPassword);
}

function PhpManager({ run }: { run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const versions = ["8.1", "8.2", "8.3", "8.4"];
  const [tab, setTab] = React.useState<"switch" | "ini">("switch");
  const [selectedVersion, setSelectedVersion] = React.useState("8.3");
  const [iniContent, setIniContent] = React.useState("");
  const [xdebug, setXdebug] = React.useState<Record<string, boolean>>({});
  const [installedVersions, setInstalledVersions] = React.useState<string[]>([]);
  const [activeVersion, setActiveVersion] = React.useState("8.3");
  
  const refreshXdebug = React.useCallback(async () => {
    const statuses: Record<string, boolean> = {};
    for (const v of versions) {
      try {
        statuses[v] = await invoke<boolean>("is_xdebug_enabled", { version: v });
      } catch {
        statuses[v] = false;
      }
    }
    setXdebug(statuses);
  }, []);

  const refreshPhpInfo = React.useCallback(async () => {
    try {
      const installed = await invoke<string[]>("get_php_versions");
      setInstalledVersions(installed);
      const active = await invoke<string>("get_active_php_version");
      setActiveVersion(active);
    } catch (e) {
      console.error(e);
    }
    await refreshXdebug();
  }, [refreshXdebug]);

  React.useEffect(() => {
    refreshPhpInfo();
  }, [refreshPhpInfo]);

  React.useEffect(() => {
    if (tab === "ini") {
      invoke<string>("read_php_ini", { version: selectedVersion })
        .then(setIniContent)
        .catch((err) => setIniContent(`Failed to load php.ini: ${err}`));
    }
  }, [tab, selectedVersion]);

  async function saveIni() {
    await run(`Save PHP ${selectedVersion} php.ini`, () =>
      invoke("save_php_ini", { version: selectedVersion, content: iniContent })
    );
  }

  async function handleSwitch(version: string) {
    await run(`Switch to PHP ${version}`, async () => {
      await invoke("switch_php_version", { version });
      await refreshPhpInfo();
    });
  }

  async function handleInstall(version: string) {
    await run(`Download & Install PHP ${version}`, async () => {
      await invoke("install_php_version", { version });
      await refreshPhpInfo();
    });
  }

  return (
    <div className="panel">
      <div className="tabHeader">
        <button className={clsx(tab === "switch" && "active")} onClick={() => setTab("switch")}>Switch PHP Version</button>
        <button className={clsx(tab === "ini" && "active")} onClick={() => setTab("ini")}>php.ini Editor</button>
      </div>

      {tab === "switch" && (
        <div style={{ marginTop: "1rem" }}>
          <h2>Switch PHP Versions</h2>
          <div className="versionGrid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "15px", marginTop: "1rem" }}>
            {versions.map((version) => {
              const isInstalled = installedVersions.includes(version);
              const isActive = activeVersion === version;
              return (
                <div key={version} className="phpVersionCard" style={{ background: "rgba(132, 145, 166, 0.08)", padding: "15px", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", border: isActive ? "2px solid #18a999" : "2px solid transparent" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong style={{ fontSize: "16px" }}>PHP {version}</strong>
                    {isActive && <span className="badge" style={{ padding: "2px 8px", fontSize: "10px" }}>Active</span>}
                  </div>
                  
                  {isInstalled ? (
                    <>
                      <button 
                        className={clsx(isActive ? "disabled" : "primary")} 
                        style={{ width: "100%" }} 
                        disabled={isActive}
                        onClick={() => handleSwitch(version)}
                      >
                        <FileCode2 size={18} />
                        {isActive ? "Active Version" : "Activate"}
                      </button>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={xdebug[version] || false}
                          onChange={(e) => run(`Toggle Xdebug PHP ${version}`, async () => {
                            await invoke("toggle_xdebug", { version, enable: e.target.checked });
                            await refreshXdebug();
                          })}
                        />
                        <span>Enable Xdebug</span>
                      </label>
                    </>
                  ) : (
                    <button 
                      style={{ width: "100%", background: "#f5b141", color: "#061614", fontWeight: 700 }} 
                      onClick={() => handleInstall(version)}
                    >
                      <Download size={18} />
                      Download & Install
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "ini" && (
        <div style={{ marginTop: "1rem" }} className="stackedForm">
          <h2>Edit php.ini</h2>
          <div className="formRow compact">
            <select value={selectedVersion} onChange={(e) => setSelectedVersion(e.target.value)}>
              {versions.map((v) => <option key={v} value={v}>PHP {v}</option>)}
            </select>
            <button className="primary" onClick={saveIni}>Save Config</button>
          </div>
          <textarea
            className="codeArea"
            rows={18}
            value={iniContent}
            onChange={(e) => setIniContent(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function NginxManager({ run }: { run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  return (
    <section className="panel">
      <h2>Nginx Manager</h2>
      <p className="muted">Manage Virtual Hosts and configurations for Nginx server.</p>
      <div className="quickGrid">
        <button onClick={() => run("Open Sites Folder", () => invoke("open_sites_folder"))}>
          <ChevronRight size={17} /> Open sites-enabled Folder
        </button>
        <button onClick={() => run("Open Nginx Root", () => invoke("open_path", { path: "C:\\ElectroStack\\nginx" }))}>
          <ChevronRight size={17} /> Open Nginx Root Folder
        </button>
        <button onClick={() => run("Restart Nginx", () => invoke("control_service", { key: "nginx", action: "restart" }))}>
          <RefreshCw size={17} /> Restart Nginx Service
        </button>
      </div>
    </section>
  );
}

function RedisManager({ run }: { run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [stats, setStats] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);

  const loadStats = React.useCallback(() => {
    setLoading(true);
    invoke<Record<string, string>>("get_redis_stats")
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => {
        setStats({});
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="grid two">
      <section className="panel">
        <h2>Redis Statistics</h2>
        {loading ? (
          <p>Loading Redis stats...</p>
        ) : Object.keys(stats).length === 0 ? (
          <p className="muted">Redis is stopped or statistics could not be loaded.</p>
        ) : (
          <div className="systemBox" style={{ maxHeight: "400px", overflowY: "auto" }}>
            <strong>Server Details</strong>
            <span>Version: {stats["redis_version"] || "Unknown"}</span>
            <span>Uptime: {stats["uptime_in_days"] ? `${stats["uptime_in_days"]} days` : "Unknown"}</span>
            <span>Connected Clients: {stats["connected_clients"] || "0"}</span>
            <span>Memory Human: {stats["used_memory_human"] || "Unknown"}</span>
            <span>Memory Peak: {stats["used_memory_peak_human"] || "Unknown"}</span>
            <span>Role: {stats["role"] || "Unknown"}</span>
            <span>Keyspace: {stats["db0"] || "No keys"}</span>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Quick Actions</h2>
        <div className="quickGrid">
          <button className="primary" onClick={() => run("Flush Redis", () => invoke("flush_redis"))}>
            <Trash2 size={17} /> Flush Cache (FLUSHALL)
          </button>
          <button onClick={() => run("Start Redis", () => invoke("control_service", { key: "redis", action: "start" }))}>
            <Play size={17} /> Start Service
          </button>
          <button onClick={() => run("Stop Redis", () => invoke("control_service", { key: "redis", action: "stop" }))}>
            <Square size={17} /> Stop Service
          </button>
          <button onClick={loadStats}>
            <RefreshCw size={17} /> Refresh Stats
          </button>
        </div>
      </section>
    </div>
  );
}

type DockerContainerInfo = {
  id: string;
  name: string;
  image: string;
  status: string;
};

function DockerManager({ run }: { run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [containers, setContainers] = React.useState<DockerContainerInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedLogs, setSelectedLogs] = React.useState<string | null>(null);
  const [logContent, setLogContent] = React.useState("");

  const refreshContainers = React.useCallback(() => {
    setLoading(true);
    invoke<DockerContainerInfo[]>("get_docker_containers")
      .then((data) => {
        setContainers(data);
        setLoading(false);
      })
      .catch(() => {
        setContainers([]);
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    refreshContainers();
  }, [refreshContainers]);

  async function showLogs(id: string) {
    setSelectedLogs(id);
    setLogContent("Fetching logs...");
    try {
      const logs = await invoke<string>("control_docker_container", { id, action: "logs" });
      setLogContent(logs || "No logs found.");
    } catch (e) {
      setLogContent(`Error fetching logs: ${e}`);
    }
  }

  return (
    <div className="stackedForm">
      <div className="panel">
        <div className="pageTitle" style={{ padding: 0, marginBottom: "1rem" }}>
          <h2>Docker Containers</h2>
          <button onClick={refreshContainers}><RefreshCw size={15} /> Refresh</button>
        </div>

        {loading ? (
          <p>Loading Docker containers...</p>
        ) : containers.length === 0 ? (
          <p className="muted">No Docker containers found (or Docker is not running).</p>
        ) : (
          <div className="table">
            {containers.map((c) => (
              <div className="tableRow" key={c.id} style={{ gridTemplateColumns: "1fr 1.5fr 1fr 1.5fr" }}>
                <strong>{c.name}</strong>
                <span className="muted" style={{ fontSize: "12px" }}>{c.image}</span>
                <span className={clsx("badge", c.status.toLowerCase().includes("up") ? "running" : "stopped")}>{c.status}</span>
                <div style={{ display: "flex", gap: "5px" }}>
                  <button title="Start" onClick={() => run(`Start ${c.name}`, () => invoke("control_docker_container", { id: c.id, action: "start" }))}><Play size={13} /></button>
                  <button title="Stop" onClick={() => run(`Stop ${c.name}`, () => invoke("control_docker_container", { id: c.id, action: "stop" }))}><Square size={13} /></button>
                  <button title="Logs" onClick={() => showLogs(c.id)}><Terminal size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedLogs && (
        <section className="panel">
          <div className="pageTitle" style={{ padding: 0, marginBottom: "0.5rem" }}>
            <h3>Container Logs ({containers.find(c => c.id === selectedLogs)?.name})</h3>
            <button onClick={() => setSelectedLogs(null)}>Close Logs</button>
          </div>
          <pre className="codeArea" style={{ maxHeight: "250px", overflowY: "auto", fontSize: "12px", background: "var(--es-ink)", color: "#fff", padding: "10px", borderRadius: "4px" }}>
            {logContent}
          </pre>
        </section>
      )}
    </div>
  );
}

type FtpUser = {
  username: string;
  website: string;
  permissions: string[];
};

function FtpManager({ run }: { run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [users, setUsers] = React.useState<FtpUser[]>([]);
  const [username, setUsername] = React.useState("dev_user");
  const [website, setWebsite] = React.useState("");
  const [read, setRead] = React.useState(true);
  const [write, setWrite] = React.useState(false);

  const loadUsers = React.useCallback(() => {
    invoke<FtpUser[]>("get_ftp_users")
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function createUser() {
    const perms: string[] = [];
    if (read) perms.push("read");
    if (write) perms.push("write");
    await run(`Save FTP user ${username}`, () =>
      invoke("save_ftp_user", { user: { username, website, permissions: perms } })
    );
    loadUsers();
  }

  async function deleteUser(user: string) {
    await run(`Delete FTP user ${user}`, () =>
      invoke("delete_ftp_user", { username: user })
    );
    loadUsers();
  }

  return (
    <div className="grid two">
      <section className="panel stackedForm">
        <h2>Create FTP User</h2>
        <label>Username <input value={username} onChange={e => setUsername(e.target.value)} /></label>
        <label>Directory/Path <input placeholder="e.g. trading.local" value={website} onChange={e => setWebsite(e.target.value)} /></label>
        <div style={{ display: "flex", gap: "15px", margin: "10px 0" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} /> Read
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <input type="checkbox" checked={write} onChange={e => setWrite(e.target.checked)} /> Write
          </label>
        </div>
        <button className="primary" onClick={createUser}><UploadCloud size={17} /> Save FTP User</button>
      </section>

      <section className="panel">
        <h2>FTP Users</h2>
        <div className="table">
          {users.length === 0 ? (
            <p className="muted">No FTP users configured.</p>
          ) : (
            users.map((u) => (
              <div className="tableRow" key={u.username} style={{ gridTemplateColumns: "1.2fr 1.5fr 1fr 0.5fr" }}>
                <strong>{u.username}</strong>
                <span className="muted">{u.website || "/"}</span>
                <span>{u.permissions.join(", ")}</span>
                <button title="Delete FTP User" onClick={() => deleteUser(u.username)}><Trash2 size={13} /></button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function SslManager({ run }: { run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [domain, setDomain] = React.useState("trading.local");
  const [certPath, setCertPath] = React.useState("");

  async function generateCert() {
    setCertPath("");
    await run(`Generate SSL for ${domain}`, async () => {
      const path = await invoke<string>("generate_certificate", { domain });
      setCertPath(path);
    });
  }

  return (
    <div className="grid two">
      <section className="panel stackedForm">
        <h2>Generate Local SSL Certificate</h2>
        <label>Local Domain <input value={domain} onChange={e => setDomain(e.target.value)} /></label>
        <button className="primary" onClick={generateCert}><Lock size={17} /> Generate Self-Signed Cert</button>
        {certPath && (
          <div className="systemBox" style={{ marginTop: "1rem" }}>
            <strong>Certificate Generated Successfully!</strong>
            <span style={{ fontSize: "11px", wordBreak: "break-all" }}>{certPath}</span>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Trust Certificate</h2>
        <p className="muted">To trust the generated SSL certificate on your local Windows system, execute the following command in PowerShell as Administrator:</p>
        <pre className="codeArea" style={{ fontSize: "11px" }}>
          {`Import-Certificate -FilePath "C:\\ElectroStack\\ssl\\${domain || "example.local"}\\localhost.crt" -CertStoreLocation "Cert:\\LocalMachine\\Root"`}
        </pre>
        <p className="formHint">This will trust the self-signed certificate, allowing secure local HTTPS workflows without warnings in Chrome/Edge.</p>
      </section>
    </div>
  );
}

type BackupInfo = {
  name: string;
  path: string;
  kind: string;
  sizeMb: number;
  createdAt: string;
};

function BackupManager({ run }: { run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [backups, setBackups] = React.useState<BackupInfo[]>([]);
  const [kind, setKind] = React.useState("website");
  const [name, setName] = React.useState("trading.local");

  const refreshBackups = React.useCallback(() => {
    invoke<BackupInfo[]>("get_backups")
      .then(setBackups)
      .catch(() => setBackups([]));
  }, []);

  React.useEffect(() => {
    refreshBackups();
  }, [refreshBackups]);

  async function triggerBackup() {
    await run(`Create ${kind} backup`, () =>
      invoke("create_backup", { kind, name })
    );
    refreshBackups();
  }

  return (
    <div className="grid two">
      <section className="panel stackedForm">
        <h2>Create Manual Backup</h2>
        <label>Backup Scope
          <select value={kind} onChange={e => setKind(e.target.value)}>
            <option value="website">Website Folder</option>
            <option value="full">Full ElectroStack Folder</option>
          </select>
        </label>
        <label>Target Name (Domain / Ident)
          <input value={name} onChange={e => setName(e.target.value)} disabled={kind === "full"} />
        </label>
        <button className="primary" onClick={triggerBackup}><Archive size={17} /> Create Backup</button>
      </section>

      <section className="panel">
        <div className="pageTitle" style={{ padding: 0, marginBottom: "1rem" }}>
          <h2>Available Backups</h2>
          <button onClick={refreshBackups}><RefreshCw size={15} /> Refresh</button>
        </div>
        <div className="table" style={{ maxHeight: "300px", overflowY: "auto" }}>
          {backups.length === 0 ? (
            <p className="muted">No backups found.</p>
          ) : (
            backups.map((b) => (
              <div className="tableRow" key={b.path} style={{ gridTemplateColumns: "1.2fr 0.8fr 0.8fr" }}>
                <div>
                  <strong>{b.name}</strong>
                  <span className="muted" style={{ fontSize: "10px", display: "block" }}>{new Date(b.createdAt).toLocaleString()}</span>
                </div>
                <span>{b.sizeMb.toFixed(2)} MB</span>
                <span className="badge" style={{ textTransform: "capitalize" }}>{b.kind}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ComposerManager({ websites, run }: { websites: Website[]; run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [selectedSite, setSelectedSite] = React.useState(websites[0]?.root || "");
  const [args, setArgs] = React.useState("diagnose");
  const [consoleOut, setConsoleOut] = React.useState("");

  async function executeComposer() {
    setConsoleOut("Running Composer...\n");
    const cmdArgs = args.split(" ").filter(a => a.trim().length > 0);
    try {
      const output = await invoke<string>("run_composer_command", { projectDir: selectedSite, args: cmdArgs });
      setConsoleOut(output || "Execution completed (no output).");
    } catch (e) {
      setConsoleOut(`Error: ${e}`);
    }
  }

  return (
    <div className="stackedForm">
      <div className="panel">
        <h2>Composer Package Manager</h2>
        <div className="formRow">
          <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
            <option value="">Select a website root</option>
            {websites.map(s => <option key={s.domain} value={s.root}>{s.domain}</option>)}
          </select>
          <input placeholder="Arguments (e.g. update, require slim/slim)" value={args} onChange={e => setArgs(e.target.value)} />
          <button className="primary" onClick={executeComposer}><Boxes size={17} /> Run Command</button>
        </div>
      </div>
      <section className="panel">
        <h3>Console Output</h3>
        <pre className="codeArea" style={{ maxHeight: "300px", overflowY: "auto", fontSize: "12px", background: "var(--es-ink)", color: "#fff", padding: "10px", borderRadius: "4px" }}>
          {consoleOut}
        </pre>
      </section>
    </div>
  );
}

function NodeManager({ websites, run }: { websites: Website[]; run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [selectedSite, setSelectedSite] = React.useState(websites[0]?.root || "");
  const [args, setArgs] = React.useState("install");
  const [consoleOut, setConsoleOut] = React.useState("");
  const [nodeVer, setNodeVer] = React.useState("Detecting...");

  React.useEffect(() => {
    invoke<string[]>("get_node_versions")
      .then(vers => setNodeVer(vers.join(", ") || "Not Found"))
      .catch(() => setNodeVer("Not Found"));
  }, []);

  async function executeNpm() {
    setConsoleOut("Running npm...\n");
    const cmdArgs = args.split(" ").filter(a => a.trim().length > 0);
    try {
      const output = await invoke<string>("run_npm_command", { projectDir: selectedSite, args: cmdArgs });
      setConsoleOut(output || "Execution completed.");
    } catch (e) {
      setConsoleOut(`Error: ${e}`);
    }
  }

  return (
    <div className="stackedForm">
      <div className="grid two">
        <section className="panel">
          <h2>Node.js Environment</h2>
          <div className="systemBox">
            <strong>System Node Version</strong>
            <span>{nodeVer}</span>
          </div>
        </section>

        <section className="panel">
          <h2>npm Script Runner</h2>
          <div className="stackedForm">
            <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
              <option value="">Select a website root</option>
              {websites.map(s => <option key={s.domain} value={s.root}>{s.domain}</option>)}
            </select>
            <div className="formRow">
              <input placeholder="Arguments (e.g. install, run build)" value={args} onChange={e => setArgs(e.target.value)} />
              <button className="primary" onClick={executeNpm}><Workflow size={17} /> Run npm</button>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <h3>Console Output</h3>
        <pre className="codeArea" style={{ maxHeight: "300px", overflowY: "auto", fontSize: "12px", background: "var(--es-ink)", color: "#fff", padding: "10px", borderRadius: "4px" }}>
          {consoleOut}
        </pre>
      </section>
    </div>
  );
}

interface GitProfile {
  id: string;
  name: string;
  email: string;
}

function GitManager({ websites, run }: { websites: Website[]; run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [selectedSite, setSelectedSite] = React.useState(websites[0]?.root || "");
  const [currentBranch, setCurrentBranch] = React.useState("Detecting...");
  const [gitStatus, setGitStatus] = React.useState("");
  const [commitMessage, setCommitMessage] = React.useState("");
  const [newBranch, setNewBranch] = React.useState("");
  const [consoleOut, setConsoleOut] = React.useState("");

  // PortaGit Station features
  const [profiles, setProfiles] = React.useState<GitProfile[]>(() => {
    try {
      const saved = localStorage.getItem("es_git_profiles");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: "personal", name: "manoranjan2050", email: "manoranjan2050@gmail.com" },
      { id: "work", name: "ElectroStack Developer", email: "dev@electrostack.local" }
    ];
  });
  const [newProfileName, setNewProfileName] = React.useState("");
  const [newProfileEmail, setNewProfileEmail] = React.useState("");
  const [activeUser, setActiveUser] = React.useState({ name: "", email: "" });

  const [selectedDiffFile, setSelectedDiffFile] = React.useState("");
  const [diffContent, setDiffContent] = React.useState("");
  const [heatmapData, setHeatmapData] = React.useState<Record<string, number>>({});

  const refreshGitState = React.useCallback(async (sitePath: string) => {
    if (!sitePath) return;
    try {
      const branch = await invoke<string>("git_action", { repoDir: sitePath, args: ["branch", "--show-current"] });
      setCurrentBranch(branch.trim() || "DETACHED/NONE");
      
      const status = await invoke<string>("git_action", { repoDir: sitePath, args: ["status", "-s"] });
      setGitStatus(status.trim() || "Working directory clean");

      // Fetch active user config
      const name = await invoke<string>("git_action", { repoDir: sitePath, args: ["config", "user.name"] });
      const email = await invoke<string>("git_action", { repoDir: sitePath, args: ["config", "user.email"] });
      setActiveUser({ name: name.trim(), email: email.trim() });

      // Fetch git log for heatmap
      const logOut = await invoke<string>("git_action", { repoDir: sitePath, args: ["log", "-n", "150", "--pretty=format:%ad", "--date=short"] });
      const counts: Record<string, number> = {};
      logOut.split("\n").forEach((line) => {
        const d = line.trim();
        if (d) {
          counts[d] = (counts[d] || 0) + 1;
        }
      });
      setHeatmapData(counts);
    } catch (e) {
      setCurrentBranch("Not a git repository");
      setGitStatus(String(e));
      setActiveUser({ name: "Not configured", email: "" });
      setHeatmapData({});
    }
  }, []);

  React.useEffect(() => {
    refreshGitState(selectedSite);
    setSelectedDiffFile("");
    setDiffContent("");
  }, [selectedSite, refreshGitState]);

  async function executeGitCmd(label: string, args: string[]) {
    setConsoleOut(prev => prev + `> git ${args.join(" ")}\n`);
    try {
      const output = await invoke<string>("git_action", { repoDir: selectedSite, args });
      setConsoleOut(prev => prev + (output || "Success (no output)\n") + "\n");
      await refreshGitState(selectedSite);
    } catch (e) {
      setConsoleOut(prev => prev + `Error: ${e}\n\n`);
    }
  }

  async function handleCommit(push: boolean) {
    if (!commitMessage.trim()) {
      alert("Please enter a commit message");
      return;
    }
    await run(push ? "Commit & Push" : "Commit Changes", async () => {
      setConsoleOut(prev => prev + `Staging files...\n`);
      await invoke("git_action", { repoDir: selectedSite, args: ["add", "."] });
      setConsoleOut(prev => prev + `Committing...\n`);
      const commitOut = await invoke<string>("git_action", { repoDir: selectedSite, args: ["commit", "-m", commitMessage] });
      setConsoleOut(prev => prev + commitOut + "\n");
      if (push) {
        setConsoleOut(prev => prev + `Pushing to remote...\n`);
        const pushOut = await invoke<string>("git_action", { repoDir: selectedSite, args: ["push"] });
        setConsoleOut(prev => prev + pushOut + "\n");
      }
      setCommitMessage("");
      await refreshGitState(selectedSite);
    });
  }

  async function handleSync() {
    await run("Sync Repository (Pull & Push)", async () => {
      setConsoleOut(prev => prev + `Fetching and pulling latest changes...\n`);
      try {
        const pullOut = await invoke<string>("git_action", { repoDir: selectedSite, args: ["pull"] });
        setConsoleOut(prev => prev + pullOut + "\n");
      } catch (e) {
        setConsoleOut(prev => prev + `Pull status: ${e}\n`);
      }
      setConsoleOut(prev => prev + `Pushing local commits...\n`);
      try {
        const pushOut = await invoke<string>("git_action", { repoDir: selectedSite, args: ["push"] });
        setConsoleOut(prev => prev + pushOut + "\n");
      } catch (e) {
        setConsoleOut(prev => prev + `Push status: ${e}\n`);
      }
      await refreshGitState(selectedSite);
    });
  }

  async function handleCreateBranch() {
    if (!newBranch.trim()) return;
    await run(`Create Branch ${newBranch}`, async () => {
      await executeGitCmd("Checkout Branch", ["checkout", "-b", newBranch]);
      setNewBranch("");
    });
  }

  async function applyProfile(p: GitProfile) {
    if (!selectedSite) return;
    await run(`Switch to profile: ${p.name}`, async () => {
      await invoke("git_action", { repoDir: selectedSite, args: ["config", "user.name", p.name] });
      await invoke("git_action", { repoDir: selectedSite, args: ["config", "user.email", p.email] });
      setConsoleOut(prev => prev + `Configured Git user.name="${p.name}", user.email="${p.email}"\n`);
      await refreshGitState(selectedSite);
    });
  }

  const addProfile = () => {
    if (!newProfileName.trim() || !newProfileEmail.trim()) return;
    const updated = [...profiles, { id: Date.now().toString(), name: newProfileName, email: newProfileEmail }];
    setProfiles(updated);
    localStorage.setItem("es_git_profiles", JSON.stringify(updated));
    setNewProfileName("");
    setNewProfileEmail("");
  };

  const deleteProfile = (id: string) => {
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated);
    localStorage.setItem("es_git_profiles", JSON.stringify(updated));
  };

  const getModifiedFiles = () => {
    if (!gitStatus || gitStatus === "Working directory clean" || gitStatus.includes("Not a git repository")) return [];
    return gitStatus.split("\n").map(line => {
      const trimmed = line.trim();
      const status = trimmed.substring(0, 2).trim() || "M";
      const filepath = trimmed.substring(2).trim();
      return { status, filepath };
    }).filter(f => f.filepath);
  };

  const loadDiff = async (filepath: string) => {
    setSelectedDiffFile(filepath);
    try {
      const diff = await invoke<string>("git_action", { repoDir: selectedSite, args: ["diff", filepath] });
      setDiffContent(diff || "(No modifications found or changes staged/untracked. Stage files to commit.)");
    } catch (e) {
      setDiffContent(`Error loading diff: ${e}`);
    }
  };

  // Generate date grid for heatmap (past 105 days, 15 weeks x 7 days)
  const renderHeatmap = () => {
    const items = [];
    const now = new Date();
    for (let i = 104; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const str = d.toISOString().split("T")[0];
      const count = heatmapData[str] || 0;
      let color = "rgba(132, 145, 166, 0.1)";
      if (count > 0 && count <= 2) color = "rgba(24, 169, 153, 0.35)";
      else if (count > 2 && count <= 4) color = "rgba(24, 169, 153, 0.65)";
      else if (count > 4) color = "rgba(24, 169, 153, 0.95)";
      items.push({ date: str, count, color });
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(15, 1fr)", gap: "4px", width: "100%", maxWidth: "320px", marginTop: "8px" }}>
        {items.map((item, idx) => (
          <div 
            key={idx} 
            title={`${item.date}: ${item.count} commits`} 
            style={{ width: "16px", height: "16px", background: item.color, borderRadius: "2px", transition: "all 0.2s" }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="stackedForm">
      <div className="panel">
        <h2>Git Station (PortaGit style)</h2>
        <div className="formRow">
          <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)}>
            <option value="">Select a repository</option>
            {websites.map(s => <option key={s.domain} value={s.root}>{s.domain}</option>)}
          </select>
          <button onClick={() => refreshGitState(selectedSite)}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>

      <div className="grid two">
        <section className="panel stackedForm">
          <h3>Repository Details</h3>
          <div className="systemBox">
            <strong>Current Branch</strong>
            <span style={{ fontSize: "16px", color: "var(--es-teal)", fontWeight: "bold" }}>{currentBranch}</span>
            <strong style={{ marginTop: "10px" }}>Active Git Config User</strong>
            <span style={{ fontSize: "13px" }}>{activeUser.name} {activeUser.email ? `<${activeUser.email}>` : ""}</span>
          </div>

          <div style={{ marginTop: "15px" }}>
            <strong>Git Profiles (Multi-Account Switcher)</strong>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
              {profiles.map(p => (
                <div key={p.id} style={{ display: "flex", justifyItems: "center", alignItems: "center", gap: "10px", background: "rgba(132,145,166,0.06)", padding: "6px 10px", borderRadius: "5px" }}>
                  <div style={{ flex: 1, fontSize: "13px" }}>
                    <strong>{p.name}</strong> <span style={{ color: "#8e9bb0", fontSize: "11px" }}>({p.email})</span>
                  </div>
                  <button style={{ minHeight: "26px", fontSize: "11px", padding: "0 8px" }} className="primary" onClick={() => applyProfile(p)}>Apply</button>
                  <button style={{ minHeight: "26px", fontSize: "11px", padding: "0 8px", background: "rgba(242,94,94,0.15)", color: "#ff7777" }} onClick={() => deleteProfile(p.id)}><Trash2 size={12} /></button>
                </div>
              ))}
              <div className="formRow compact" style={{ marginTop: "8px" }}>
                <input placeholder="Name..." value={newProfileName} onChange={e => setNewProfileName(e.target.value)} style={{ fontSize: "12px" }} />
                <input placeholder="Email..." value={newProfileEmail} onChange={e => setNewProfileEmail(e.target.value)} style={{ fontSize: "12px" }} />
                <button className="primary" onClick={addProfile} style={{ fontSize: "12px", minHeight: "32px" }}>Add</button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "15px" }}>
            <strong>Commit changes</strong>
            <textarea 
              placeholder="Write commit message..." 
              value={commitMessage} 
              onChange={e => setCommitMessage(e.target.value)} 
              rows={2} 
              className="codeArea" 
              style={{ width: "100%", background: "rgba(132,145,166,0.06)", color: "inherit", border: "1px solid rgba(132,145,166,0.2)", borderRadius: "4px", padding: "8px", marginTop: "5px" }}
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button className="primary" style={{ flex: 1 }} onClick={() => handleCommit(false)}>Commit All</button>
              <button style={{ flex: 1, background: "#f5b141", color: "#061614", fontWeight: 700 }} onClick={() => handleCommit(true)}>Commit & Push</button>
            </div>
          </div>

          <div style={{ marginTop: "15px" }}>
            <strong>One-Click Sync & Stash</strong>
            <div className="quickGrid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginTop: "5px" }}>
              <button onClick={() => executeGitCmd("Pull", ["pull"])}>Pull</button>
              <button onClick={() => executeGitCmd("Push", ["push"])}>Push</button>
              <button className="primary" onClick={handleSync}>Sync (Sync)</button>
              <button onClick={() => executeGitCmd("Fetch", ["fetch"])}>Fetch</button>
              <button onClick={() => executeGitCmd("Stash", ["stash"])}>Stash</button>
              <button onClick={() => executeGitCmd("Stash Pop", ["stash", "pop"])}>Stash Pop</button>
            </div>
          </div>

          <div style={{ marginTop: "15px" }}>
            <strong>Branch Creator</strong>
            <div className="formRow" style={{ marginTop: "5px" }}>
              <input placeholder="New branch name..." value={newBranch} onChange={e => setNewBranch(e.target.value)} />
              <button className="primary" onClick={handleCreateBranch}>Create</button>
            </div>
          </div>
        </section>

        <section className="panel" style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <div>
            <h3>Git Heatmap (PortaGit Style)</h3>
            {renderHeatmap()}
          </div>

          <div>
            <h3>Stage & Status</h3>
            <pre className="codeArea" style={{ maxHeight: "120px", overflowY: "auto", fontSize: "12px", background: "var(--es-ink)", color: "#fff", padding: "10px", borderRadius: "4px" }}>
              {gitStatus}
            </pre>
            
            {getModifiedFiles().length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <strong>Modified Files (Click to view diff)</strong>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "5px" }}>
                  {getModifiedFiles().map(f => (
                    <button 
                      key={f.filepath} 
                      onClick={() => loadDiff(f.filepath)}
                      style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        padding: "6px 10px", 
                        background: selectedDiffFile === f.filepath ? "rgba(24,169,153,0.15)" : "rgba(132,145,166,0.06)", 
                        border: selectedDiffFile === f.filepath ? "1px solid var(--es-teal)" : "1px solid transparent",
                        borderRadius: "4px", 
                        textAlign: "left", 
                        fontSize: "12px",
                        cursor: "pointer"
                      }}
                    >
                      <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>{f.filepath}</span>
                      <span style={{ color: f.status === "M" ? "#f5b141" : "#ff7777", fontWeight: "bold" }}>{f.status}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {selectedDiffFile && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <h3>Diff: {selectedDiffFile}</h3>
              <div 
                className="codeArea" 
                style={{ 
                  flex: 1, 
                  maxHeight: "220px", 
                  overflowY: "auto", 
                  fontSize: "11px", 
                  background: "var(--es-ink)", 
                  padding: "10px", 
                  borderRadius: "4px", 
                  fontFamily: "monospace", 
                  whiteSpace: "pre-wrap" 
                }}
              >
                {diffContent.split("\n").map((line, idx) => {
                  let color = "#e8edf7";
                  if (line.startsWith("+") && !line.startsWith("+++")) color = "#2ea44f";
                  else if (line.startsWith("-") && !line.startsWith("---")) color = "#cf222e";
                  else if (line.startsWith("@@")) color = "#0969da";
                  return <div key={idx} style={{ color }}>{line}</div>;
                })}
              </div>
            </div>
          )}

          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <h3>Git Console Output</h3>
            <pre className="codeArea" style={{ flex: 1, minHeight: "150px", maxHeight: "200px", overflowY: "auto", fontSize: "11px", background: "var(--es-ink)", color: "#92d0ff", padding: "10px", borderRadius: "4px", fontFamily: "monospace" }}>
              {consoleOut || "No commands run yet."}
            </pre>
            <button style={{ alignSelf: "flex-end", marginTop: "5px", minHeight: "26px", fontSize: "11px" }} onClick={() => setConsoleOut("")}>Clear Console</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function parseLogTimestamp(line: string): Date | null {
  // Nginx error: 2026/06/21 13:35:44
  const mNginxErr = line.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (mNginxErr) {
    return new Date(`${mNginxErr[1]}-${mNginxErr[2]}-${mNginxErr[3]}T${mNginxErr[4]}:${mNginxErr[5]}:${mNginxErr[6]}`);
  }
  // Nginx access: [21/Jun/2026:13:35:44 +0530]
  const mNginxAcc = line.match(/\[(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
  if (mNginxAcc) {
    const months: Record<string, string> = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
    const month = months[mNginxAcc[2]] || '01';
    return new Date(`${mNginxAcc[3]}-${month}-${mNginxAcc[1]}T${mNginxAcc[4]}:${mNginxAcc[5]}:${mNginxAcc[6]}`);
  }
  // Redis: 21 Jun 2026 13:35:44.123
  const mRedis = line.match(/\d+:\w+\s+(\d{2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (mRedis) {
    const months: Record<string, string> = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
    const month = months[mRedis[2]] || '01';
    return new Date(`${mRedis[3]}-${month}-${mRedis[1]}T${mRedis[4]}:${mRedis[5]}:${mRedis[6]}`);
  }
  // PHP error: [21-Jun-2026 13:35:44 UTC]
  const mPhp = line.match(/^\[(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
  if (mPhp) {
    const months: Record<string, string> = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
    const month = months[mPhp[2]] || '01';
    return new Date(`${mPhp[3]}-${month}-${mPhp[1]}T${mPhp[4]}:${mPhp[5]}:${mPhp[6]}Z`);
  }
  return null;
}

interface UnifiedLogLine {
  source: string;
  line: string;
  time: Date;
}

function LogsManager() {
  const [source, setSource] = React.useState("");
  const [filter, setFilter] = React.useState("");
  const [entries, setEntries] = React.useState<{ source: string; path: string; lines: string[] }[]>([]);

  const fetchLogs = React.useCallback(() => {
    invoke<{ source: string; path: string; lines: string[] }[]>("get_logs", { source: source || null, filter: filter || null })
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [source, filter]);

  React.useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 1000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  const getUnifiedLogs = () => {
    const combined: UnifiedLogLine[] = [];
    entries.forEach((entry) => {
      let currentTimestamp = new Date();
      entry.lines.forEach((line) => {
        if (!line.trim()) return;
        const parsed = parseLogTimestamp(line);
        if (parsed) {
          currentTimestamp = parsed;
        }
        combined.push({
          source: entry.source,
          line,
          time: currentTimestamp
        });
      });
    });
    combined.sort((a, b) => a.time.getTime() - b.time.getTime());
    return combined;
  };

  const unified = getUnifiedLogs();

  return (
    <section className="panel logs stackedForm">
      <div className="pageTitle" style={{ padding: 0, marginBottom: "1rem" }}>
        <h2>System Logs</h2>
        <button onClick={fetchLogs}><RefreshCw size={15} /> Refresh</button>
      </div>
      <div className="formRow">
        <select value={source} onChange={e => setSource(e.target.value)}>
          <option value="">All System Logs (Unified Stream)</option>
          <option value="nginx-access">Nginx Access Logs</option>
          <option value="nginx-error">Nginx Error Logs</option>
          <option value="redis">Redis Server Logs</option>
        </select>
        <input placeholder="Keyword filter..." value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "15px" }}>
        {entries.length === 0 ? (
          <p className="muted">No logs found matching selection.</p>
        ) : source === "" ? (
          <div className="codeArea" style={{ fontSize: "12px", padding: "15px", overflowX: "auto", maxHeight: "500px", overflowY: "auto", background: "var(--es-ink)", borderRadius: "6px", fontFamily: "monospace" }}>
            {unified.map((item, idx) => (
              <div key={idx} style={{ display: "flex", gap: "12px", margin: "4px 0", borderBottom: "1px solid rgba(255, 255, 255, 0.03)", paddingBottom: "2px" }}>
                <span style={{ color: item.source.includes("error") ? "#ff7777" : "var(--es-teal)", minWidth: "100px", fontWeight: "bold" }}>
                  [{item.source}]
                </span>
                <span style={{ color: "#8e9bb0" }}>{item.time.toLocaleTimeString()}</span>
                <span style={{ color: "#e8edf7", flex: 1, wordBreak: "break-all" }}>{item.line}</span>
              </div>
            ))}
          </div>
        ) : (
          entries.map((entry) => (
            <pre key={entry.source} className="codeArea" style={{ fontSize: "12px", padding: "10px", overflowX: "auto", maxHeight: "350px", overflowY: "auto" }}>
              <strong>Source: {entry.source} ({entry.path})</strong>
              {"\n\n"}
              {entry.lines.join("\n")}
            </pre>
          ))
        )}
      </div>
    </section>
  );
}

function SettingsView({ run }: { run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  const [startWin, setStartWin] = React.useState(true);
  const [minTray, setMinTray] = React.useState(true);
  const [enableRest, setEnableRest] = React.useState(false);
  const [prefPhp, setPrefPhp] = React.useState("8.3");
  const [apiToken, setApiToken] = React.useState("");

  React.useEffect(() => {
    invoke<any>("get_settings").then(data => {
      setStartWin(data.startWithWindows);
      setMinTray(data.minimizeToTray);
      setEnableRest(data.enableRestBridge);
      setPrefPhp(data.preferredPhp || "8.3");
      setApiToken(data.adminPasswordHash || "No admin password configured");
    }).catch(() => {});
  }, []);

  async function save() {
    await run("Save settings", () =>
      invoke("save_settings", {
        settings: {
          startWithWindows: startWin,
          minimizeToTray: minTray,
          telemetryEnabled: false,
          preferredPhp: prefPhp,
          enableRestBridge: enableRest
        }
      })
    );
  }

  return (
    <div className="grid two">
      <section className="panel stackedForm">
        <h2>App Settings</h2>
        <div className="settingsList" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <input type="checkbox" checked={startWin} onChange={e => setStartWin(e.target.checked)} /> Start with Windows
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <input type="checkbox" checked={minTray} onChange={e => setMinTray(e.target.checked)} /> Minimize to tray
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <input type="checkbox" checked={enableRest} onChange={e => setEnableRest(e.target.checked)} /> Enable REST bridge
          </label>
        </div>
        <label style={{ marginTop: "10px" }}>Preferred PHP Version
          <select value={prefPhp} onChange={e => setPrefPhp(e.target.value)}>
            <option value="8.1">PHP 8.1</option>
            <option value="8.2">PHP 8.2</option>
            <option value="8.3">PHP 8.3</option>
            <option value="8.4">PHP 8.4</option>
          </select>
        </label>
        <button className="primary" style={{ marginTop: "1rem" }} onClick={save}><KeyRound size={17} /> Save Settings</button>
      </section>

      {enableRest && (
        <section className="panel">
          <h2>REST Bridge Details</h2>
          <div className="systemBox">
            <strong>API Endpoint (Localhost only)</strong>
            <span style={{ fontSize: "12px", color: "var(--es-teal)" }}>http://127.0.0.1:4820/api</span>
            
            <strong style={{ marginTop: "10px" }}>Bearer Token (Admin Password Hash)</strong>
            <span style={{ fontSize: "11px", wordBreak: "break-all", fontFamily: "monospace" }}>{apiToken}</span>
          </div>
          <p className="formHint" style={{ marginTop: "10px" }}>Include the header <code>Authorization: Bearer &lt;Token&gt;</code> in your external client automation scripts.</p>
        </section>
      )}
    </div>
  );
}

function MailCatcher({ run }: { run: <T>(label: string, action: () => Promise<T>) => Promise<void> }) {
  return (
    <div className="stackedForm">
      <div className="panel">
        <h2>Mail Catcher (Mailpit)</h2>
        <p className="muted">Mailpit captures all outgoing emails sent from your local applications via SMTP (Port 1025).</p>
        <div className="formRow compact">
          <button className="primary" onClick={() => run("Open Mailpit UI", () => invoke("open_url", { url: "http://localhost:8025/" }))}>
            Open Mailpit UI in Browser
          </button>
        </div>
      </div>
      <section className="panel" style={{ height: "600px", padding: 0 }}>
        <iframe
          src="http://localhost:8025/"
          title="Mailpit Web UI"
          style={{ width: "100%", height: "100%", border: "none", borderRadius: "4px" }}
        />
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
