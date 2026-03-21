#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const ENV_PATH = new URL("../.env", import.meta.url);

function loadEnv(fileUrl) {
  return Object.fromEntries(
    readFileSync(fileUrl, "utf8")
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

class DirectusClient {
  constructor(baseUrl, email, password) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.email = email;
    this.password = password;
    this.token = null;
  }

  async login() {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`Login failed: ${JSON.stringify(payload)}`);
    this.token = payload.data.access_token;
  }

  async request(method, path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${method} ${path} failed: ${text}`);
    return payload?.data ?? null;
  }

  async listFields(collection) {
    return this.request("GET", `/fields/${collection}?fields=*.*`);
  }

  async ensureField(collection, spec) {
    const fields = await this.listFields(collection);
    const existing = fields.find((entry) => entry.field === spec.field);
    if (existing) {
      return this.request("PATCH", `/fields/${collection}/${spec.field}`, spec);
    }
    return this.request("POST", `/fields/${collection}`, spec);
  }

  async listFlows() {
    return this.request("GET", "/flows?fields=*&fields[]=operations.*&limit=-1");
  }

  async ensureFlow(spec) {
    const flows = await this.listFlows();
    const existing = flows.find((entry) => entry.name === spec.name);
    const payload = {
      name: spec.name,
      icon: spec.icon,
      color: spec.color || null,
      description: spec.description,
      status: "active",
      trigger: spec.trigger,
      accountability: "all",
      options: spec.options,
    };
    const flow = existing
      ? await this.request("PATCH", `/flows/${existing.id}`, payload)
      : await this.request("POST", "/flows", payload);
    const flowId = flow.id;

    if (existing?.operations?.length) {
      await this.request("PATCH", `/flows/${flowId}`, { operation: null });
      for (const operation of existing.operations) {
        await this.request("PATCH", `/operations/${operation.id}`, { resolve: null, reject: null });
      }
      for (const operation of [...existing.operations].reverse()) {
        await this.request("DELETE", `/operations/${operation.id}`);
      }
    }

    const operationIds = [];
    for (const operation of spec.operations) {
      const created = await this.request("POST", "/operations", {
        id: randomUUID(),
        name: operation.name,
        key: operation.key,
        type: operation.type,
        position_x: operation.position_x,
        position_y: operation.position_y,
        options: operation.options,
        resolve: null,
        reject: null,
        flow: flowId,
      });
      operationIds.push(created.id);
    }

    for (let index = 0; index < operationIds.length - 1; index += 1) {
      await this.request("PATCH", `/operations/${operationIds[index]}`, {
        resolve: operationIds[index + 1],
      });
    }

    await this.request("PATCH", `/flows/${flowId}`, { operation: operationIds[0] || null });
    return flowId;
  }
}

function sourceFields() {
  return [
    {
      collection: "documentation",
      fields: [
        hiddenStringField("category", 10, "Derived docs category slug from the repo path."),
        hiddenStringField("category_label", 11, "Derived docs category label for future navigation queries."),
        hiddenIntegerField("category_order", 12, "Derived category ordering from the docs IA."),
        hiddenIntegerField("doc_order", 13, "Derived document ordering within the category."),
        hiddenTimestampField("last_synced_at", 14, "Timestamp of the last successful repo sync."),
        hiddenTextField("sync_error", 15, "Last repo sync error for this item, if any."),
      ],
    },
    {
      collection: "changelogs",
      fields: [
        hiddenTimestampField("last_synced_at", 10, "Timestamp of the last successful repo sync."),
        hiddenTextField("sync_error", 11, "Last repo sync error for this item, if any."),
      ],
    },
  ];
}

function hiddenStringField(field, sort, note) {
  return {
    field,
    type: "string",
    meta: {
      interface: "input",
      hidden: true,
      readonly: true,
      sort,
      width: "half",
      group: "meta_source",
      note,
      options: { font: "monospace" },
    },
    schema: { data_type: "character varying", max_length: 255, is_nullable: true },
  };
}

function hiddenIntegerField(field, sort, note) {
  return {
    field,
    type: "integer",
    meta: {
      interface: "numeric",
      hidden: true,
      readonly: true,
      sort,
      width: "half",
      group: "meta_source",
      note,
    },
    schema: { data_type: "integer", is_nullable: true },
  };
}

function hiddenTimestampField(field, sort, note) {
  return {
    field,
    type: "timestamp",
    meta: {
      interface: "datetime",
      display: "datetime",
      hidden: true,
      readonly: true,
      sort,
      width: "half",
      group: "meta_source",
      note,
      options: { use24: true, includeSeconds: false },
    },
    schema: { data_type: "timestamp with time zone", is_nullable: true },
  };
}

function hiddenTextField(field, sort, note) {
  return {
    field,
    type: "text",
    meta: {
      interface: "input-multiline",
      hidden: true,
      readonly: true,
      sort,
      width: "full",
      group: "meta_source",
      note,
    },
    schema: { data_type: "text", is_nullable: true },
  };
}

function syncFlowSpec(env, scope, trigger) {
  const paths = scope === "documentation"
    ? ["/zenith-sync/documentation", "/@zenithbuild/zenith-sync/documentation"]
    : ["/zenith-sync/changelogs", "/@zenithbuild/zenith-sync/changelogs"];
  const label = scope === "documentation" ? "Documentation" : "Changelogs";
  const cron = scope === "documentation" ? env.DOCS_SYNC_CRON : env.CHANGELOG_SYNC_CRON;
  const name = trigger === "schedule" ? `Repo Sync Schedule: ${label}` : `Repo Sync: ${label}`;
  const description = trigger === "schedule"
    ? `Scheduled repo sync for ${scope}.`
    : `Manual repo sync for ${scope}.`;

  return {
    name,
    icon: scope === "documentation" ? "menu_book" : "history_edu",
    color: "#6644FF",
    description,
    trigger,
    options: trigger === "schedule"
      ? { cron }
      : { requireConfirmation: true, confirmationDescription: name },
    operations: [
      {
        name: "Sync",
        key: "sync",
        type: "exec",
        position_x: 20,
        position_y: 20,
        options: {
          code: syncExecCode(paths, env.REPO_SYNC_SHARED_TOKEN || "", env.PUBLIC_URL || "http://localhost:8055"),
        },
      },
    ],
  };
}

function syncExecCode(paths, token, publicUrl) {
  return `module.exports = async function() {
    const paths = ${JSON.stringify(paths)};
    let lastFailure = null;
    for (const path of paths) {
      const response = await fetch(${JSON.stringify(publicUrl)} + path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-repo-sync-token': ${JSON.stringify(token)}
        }
      });
      const payload = await response.json();
      if (response.status === 404) {
        lastFailure = payload;
        continue;
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(JSON.stringify(payload));
      }
      return payload;
    }
    throw new Error(JSON.stringify(lastFailure || { ok: false, error: 'No repo sync endpoint was available.' }));
  }`;
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const client = new DirectusClient(env.PUBLIC_URL, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  await client.login();

  for (const collection of sourceFields()) {
    for (const field of collection.fields) {
      await client.ensureField(collection.collection, field);
    }
  }

  await client.ensureFlow(syncFlowSpec(env, "documentation", "manual"));
  await client.ensureFlow(syncFlowSpec(env, "documentation", "schedule"));
  await client.ensureFlow(syncFlowSpec(env, "changelogs", "manual"));
  await client.ensureFlow(syncFlowSpec(env, "changelogs", "schedule"));

  console.log("Applied repo sync fields and flows to Directus.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
