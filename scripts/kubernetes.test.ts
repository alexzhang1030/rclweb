import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const unitPath = path.join(root, "packaging", "kubernetes", "rclwebd.yaml");
const kustomizationPath = path.join(root, "packaging", "kubernetes", "kustomization.yaml");

function uncommented(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

function read(rel: string): string {
  return readFileSync(rel, "utf8");
}

type YamlMap = Record<string, unknown>;

function parseDocuments(source: string): YamlMap[] {
  const docs = Bun.YAML.parse(source);
  if (Array.isArray(docs)) {
    return docs.filter((doc): doc is YamlMap => doc !== null && typeof doc === "object");
  }
  if (docs !== null && typeof docs === "object") {
    return [docs as YamlMap];
  }
  throw new Error("expected Kubernetes YAML documents");
}

function asMap(value: unknown, label: string): YamlMap {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`expected object for ${label}`);
  }
  return value as YamlMap;
}

function envNames(container: YamlMap): string[] {
  const env = container.env;
  if (!Array.isArray(env)) return [];
  return env.map((entry) => {
    const row = asMap(entry, "env");
    return String(row.name ?? "");
  });
}

describe("kubernetes units", () => {
  const source = read(unitPath);
  const body = uncommented(source);
  const docs = parseDocuments(source);
  const kinds = docs.map((doc) => String(doc.kind ?? ""));
  const deployment = asMap(
    docs.find((doc) => doc.kind === "Deployment"),
    "Deployment",
  );
  const service = asMap(
    docs.find((doc) => doc.kind === "Service"),
    "Service",
  );
  const spec = asMap(deployment.spec, "Deployment.spec");
  const template = asMap(spec.template, "template");
  const podSpec = asMap(template.spec, "pod spec");
  const containers = podSpec.containers;
  if (!Array.isArray(containers) || containers.length !== 1) {
    throw new Error("expected one container");
  }
  const container = asMap(containers[0], "container");
  const names = envNames(container);

  test("kustomization lists the unit file", () => {
    const kustomization = read(kustomizationPath);
    expect(kustomization).toContain("kind: Kustomization");
    expect(kustomization).toContain("rclwebd.yaml");
  });

  test("ships a Deployment and a ClusterIP Service", () => {
    expect(kinds).toEqual(["Deployment", "Service"]);
    expect(asMap(service.spec, "Service.spec").type).toBe("ClusterIP");
    expect(body).not.toMatch(/\bkind:\s*Ingress\b/);
    expect(body).not.toMatch(/\bkind:\s*LoadBalancer\b/);
    expect(asMap(service.spec, "Service.spec").type).not.toBe("LoadBalancer");
  });

  test("keeps the host-network robot-edge contract", () => {
    expect(podSpec.hostNetwork).toBe(true);
    expect(podSpec.dnsPolicy).toBe("ClusterFirstWithHostNet");
    expect(spec.replicas).toBe(1);
    expect(asMap(spec.strategy, "strategy").type).toBe("Recreate");
    expect(podSpec.terminationGracePeriodSeconds).toBe(30);
    expect(container.image).toBe("ghcr.io/alexzhang1030/rclwebd:jazzy");
  });

  test("probes liveness and readiness separately and drains on stop", () => {
    const live = asMap(asMap(container.livenessProbe, "liveness").httpGet, "liveness.httpGet");
    const ready = asMap(asMap(container.readinessProbe, "readiness").httpGet, "readiness.httpGet");
    const start = asMap(asMap(container.startupProbe, "startup").httpGet, "startup.httpGet");
    expect(live.path).toBe("/healthz");
    expect(ready.path).toBe("/readyz");
    expect(start.path).toBe("/readyz");
    const preStop = asMap(
      asMap(asMap(container.lifecycle, "lifecycle").preStop, "preStop").exec,
      "preStop.exec",
    );
    const command = preStop.command;
    expect(Array.isArray(command)).toBe(true);
    expect(command).toContain("POST");
    expect(command).toContain("http://127.0.0.1:8794/drain");
    expect(command).toContain("curl");
  });

  test("does not bake a support row, oidc, or intranet WebTransport", () => {
    expect(names).toContain("RCLWEBD_BIND");
    expect(names).toContain("RCLWEBD_GATEWAY_INSTANCE_ID");
    expect(names).toContain("ROS_DOMAIN_ID");
    expect(names).not.toContain("RCLWEBD_SUPPORT_ROW");
    expect(names).not.toContain("RMW_IMPLEMENTATION");
    expect(names).not.toContain("RCLWEBD_AUTH_MODE");
    expect(names).not.toContain("RCLWEBD_OFFER_WEBTRANSPORT");
    expect(body).not.toMatch(/RCLWEBD_AUTH_MODE=/);
    expect(body).not.toMatch(/RCLWEBD_OFFER_WEBTRANSPORT=/);
    expect(body).not.toContain("rmw_zenohd");
  });

  test("runs as the image uid and does not request privileges", () => {
    const podSecurity = asMap(podSpec.securityContext, "pod securityContext");
    const containerSecurity = asMap(container.securityContext, "container securityContext");
    expect(podSecurity.runAsUser).toBe(10001);
    expect(podSecurity.runAsNonRoot).toBe(true);
    expect(containerSecurity.allowPrivilegeEscalation).toBe(false);
    expect(podSpec.privileged).not.toBe(true);
    expect(containerSecurity.privileged).not.toBe(true);
  });
});
