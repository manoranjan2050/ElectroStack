import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  Play,
  Power,
  RefreshCw,
  Server,
  Square,
  X,
  Zap
} from "lucide-react";
import clsx from "clsx";
import "./styles.css";

type ServiceStatus = "Running" | "Stopped" | "Missing" | "Unknown";

type ServiceInfo = {
  key: string;
  name: string;
  status: ServiceStatus;
  port?: number;
};

type Overview = {
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  runningServices: number;
  services: ServiceInfo[];
};

function TrayPanel() {
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("Ready");

  const services = overview?.services ?? [];
  const running = services.filter((service) => service.status === "Running").length;
  const percent = services.length ? Math.round((running / services.length) * 100) : 0;

  const refresh = React.useCallback(async () => {
    const data = await invoke<Overview>("get_overview");
    setOverview(data);
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    refresh().catch((error) => setMessage(String(error)));
    const id = window.setInterval(() => refresh().catch(() => undefined), 3000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setMessage(`${label}...`);
    try {
      await action();
      await refresh();
      setMessage(`${label} complete`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="trayPanel">
      <header className="trayHero">
        <div className="trayBrand">
          <span className="trayLogo"><Zap size={20} /></span>
          <div>
            <strong>ElectroStack</strong>
            <small>{running}/{services.length} services running</small>
          </div>
        </div>
        <button className="trayIconButton" title="Close" onClick={() => invoke("hide_tray_panel")}>
          <X size={17} />
        </button>
      </header>

      <section className="trayHealth">
        <div className="healthRing" style={{ "--health": `${percent}%` } as React.CSSProperties}>
          <span>{percent}%</span>
        </div>
        <div className="trayStats">
          <MetricMini icon={Activity} label="CPU" value={overview?.cpuUsage ?? 0} />
          <MetricMini icon={Server} label="RAM" value={overview?.ramUsage ?? 0} />
          <MetricMini icon={Gauge} label="Disk" value={overview?.diskUsage ?? 0} />
        </div>
      </section>

      <section className="trayActions">
        <button onClick={() => run("Start all", () => invoke("control_all_services", { action: "start" }))}>
          <Play size={16} />
          Start All
        </button>
        <button onClick={() => run("Stop all", () => invoke("control_all_services", { action: "stop" }))}>
          <Square size={16} />
          Stop All
        </button>
        <button onClick={() => run("Restart all", () => invoke("control_all_services", { action: "restart" }))}>
          <RefreshCw size={16} />
          Restart
        </button>
      </section>

      <section className="trayServices">
        {services.map((service) => (
          <ServiceToggle key={service.key} service={service} busy={busy} run={run} />
        ))}
      </section>

      <section className="trayShortcuts">
        <button onClick={() => invoke("open_dashboard")}>
          <LayoutDashboard size={16} />
          Dashboard
        </button>
        <button onClick={() => invoke("open_sites_folder")}>
          <FolderOpen size={16} />
          Websites
        </button>
        <button onClick={() => invoke("open_stack_folder")}>
          <FolderOpen size={16} />
          Stack
        </button>
      </section>

      <footer className="trayFooter">
        <span className={clsx("dot", busy && "pulse")} />
        <span>{message}</span>
      </footer>
    </div>
  );
}

function ServiceToggle({
  service,
  busy,
  run
}: {
  service: ServiceInfo;
  busy: string | null;
  run: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
  const running = service.status === "Running";
  const disabled = service.status === "Missing" || Boolean(busy);
  const action = running ? "stop" : "start";

  return (
    <button
      className={clsx("serviceToggle", running && "on", service.status === "Missing" && "missing")}
      disabled={disabled}
      onClick={() => run(`${running ? "Stop" : "Start"} ${service.name}`, () => invoke("control_service", { key: service.key, action }))}
    >
      <span className="serviceText">
        <strong>{service.name}</strong>
        <small>{service.status} {service.port ? `:${service.port}` : ""}</small>
      </span>
      <span className="switchTrack">
        <Power size={13} />
      </span>
    </button>
  );
}

function MetricMini({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: number }) {
  return (
    <div className="metricMini">
      <Icon size={15} />
      <span>{label}</span>
      <strong>{Math.round(value)}%</strong>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("tray-root")!).render(<TrayPanel />);
