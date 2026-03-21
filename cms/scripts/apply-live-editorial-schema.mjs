#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const ROOT = new URL("../", import.meta.url);
const ENV_PATH = new URL("../.env", import.meta.url);

const STATUS_CHOICES = [
  { text: "$t:draft", value: "draft", icon: "draft_orders", color: "#A2B5CD" },
  { text: "In Review", value: "in_review", icon: "rate_review", color: "#FFA439" },
  { text: "$t:published", value: "published", icon: "check", color: "#2ECDA7" },
  { text: "Archived", value: "archived", icon: "inventory_2", color: "#6B7280" },
];

const SOURCE_KIND_CHOICES = [
  { text: "Repo Sync", value: "repo_sync", icon: "sync" },
  { text: "CMS Manual", value: "cms_manual", icon: "edit_document" },
  { text: "CMS AI", value: "cms_ai", icon: "auto_awesome" },
];

const EDITOR_MODE_CHOICES = [
  {
    text: "Markdown",
    value: "markdown",
    icon: "code",
    icon_type: "icon",
    description: "Canonical markdown body for repo-driven content and technical drafting.",
  },
  {
    text: "WYSIWYG",
    value: "wysiwyg",
    icon: "edit_note",
    icon_type: "icon",
    description: "Rich text authoring for CMS-native content when visual editing is preferred.",
  },
];

const HTML_TOOLBAR = [
  "blockquote",
  "bold",
  "bullist",
  "code",
  "customImage",
  "customLink",
  "customMedia",
  "fullscreen",
  "h1",
  "h2",
  "h3",
  "hr",
  "italic",
  "numlist",
  "redo",
  "removeformat",
  "underline",
  "undo",
];

const MD_TOOLBAR = [
  "heading",
  "bold",
  "italic",
  "strikethrough",
  "blockquote",
  "bullist",
  "numlist",
  "table",
  "code",
  "empty",
];

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

  async listCollections() {
    return this.request("GET", "/collections?limit=-1");
  }

  async listFields(collection) {
    return this.request("GET", `/fields/${collection}?fields=*.*`);
  }

  async listPermissions(collection) {
    return this.request("GET", `/permissions?filter[collection][_eq]=${collection}&limit=-1`);
  }

  async listFlows() {
    return this.request("GET", "/flows?fields=*&fields[]=operations.*&limit=-1");
  }

  async listPresets(collection) {
    return this.request("GET", `/presets?filter[collection][_eq]=${collection}&limit=-1`);
  }

  async listRelations(collection) {
    return this.request("GET", `/relations/${collection}`);
  }

  async ensureCollection(spec) {
    const collections = await this.listCollections();
    const existing = collections.find((entry) => entry.collection === spec.collection);
    const payload = { collection: spec.collection, meta: spec.meta, schema: { name: spec.collection } };
    if (existing) {
      return this.request("PATCH", `/collections/${spec.collection}`, payload);
    }
    return this.request("POST", "/collections", payload);
  }

  async ensureField(collection, spec) {
    const fields = await this.listFields(collection);
    const existing = fields.find((entry) => entry.field === spec.field);
    if (existing) {
      return this.request("PATCH", `/fields/${collection}/${spec.field}`, spec);
    }
    try {
      return await this.request("POST", `/fields/${collection}`, spec);
    } catch (error) {
      if (String(error.message).includes("already exists")) {
        return this.request("PATCH", `/fields/${collection}/${spec.field}`, spec);
      }
      throw error;
    }
  }

  async ensurePermissionsFrom(sourceCollection, targetCollection) {
    const source = await this.listPermissions(sourceCollection);
    const target = await this.listPermissions(targetCollection);
    for (const permission of source) {
      const match = target.find(
        (entry) => entry.policy === permission.policy && entry.action === permission.action,
      );
      const payload = {
        collection: targetCollection,
        action: permission.action,
        permissions: permission.permissions,
        validation: permission.validation,
        presets: permission.presets,
        fields: permission.fields,
        policy: permission.policy,
      };
      if (match) {
        await this.request("PATCH", `/permissions/${match.id}`, payload);
      } else {
        await this.request("POST", "/permissions", payload);
      }
    }
  }

  async ensureFlow(spec) {
    const flows = await this.listFlows();
    const existing = flows.find((entry) => entry.name === spec.name);
    const payload = {
      name: spec.name,
      icon: spec.icon,
      description: spec.description,
      status: "active",
      trigger: "manual",
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
    const opIds = [];
    for (let index = 0; index < spec.operations.length; index += 1) {
      const operation = spec.operations[index];
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
      opIds.push(created.id);
    }
    for (let index = 0; index < spec.operations.length; index += 1) {
      await this.request("PATCH", `/operations/${opIds[index]}`, {
        resolve: index < opIds.length - 1 ? opIds[index + 1] : null,
      });
    }
    await this.request("PATCH", `/flows/${flowId}`, { operation: opIds[0] });
    return flowId;
  }

  async ensurePreset(spec) {
    const presets = await this.listPresets(spec.collection);
    const existing = presets.find((entry) => entry.bookmark === spec.bookmark && !entry.user && !entry.role);
    const payload = {
      bookmark: spec.bookmark,
      collection: spec.collection,
      layout: "tabular",
      layout_query: spec.layout_query,
      filter: spec.filter,
      icon: spec.icon,
      color: spec.color,
    };
    if (existing) {
      return this.request("PATCH", `/presets/${existing.id}`, payload);
    }
    return this.request("POST", "/presets", payload);
  }

  async ensureRelation(spec) {
    const existing = await this.listRelations(spec.collection);
    const match = existing.find((entry) => entry.field === spec.field);
    const payload = {
      collection: spec.collection,
      field: spec.field,
      related_collection: spec.related_collection,
      meta: spec.meta,
      schema: spec.schema,
    };
    if (match) {
      return this.request("PATCH", `/relations/${spec.collection}/${spec.field}`, payload);
    }
    return this.request("POST", "/relations", payload);
  }
}

function visibleWhen(field, value) {
  return [{ name: `Show if ${field} = ${value}`, hidden: false, rule: { _and: [{ [field]: { _eq: value } }] } }];
}

function hiddenReadonlyWhenRepoSync(field) {
  return [
    {
      name: `Readonly when ${field} = repo_sync`,
      readonly: true,
      hidden: false,
      rule: { _and: [{ [field]: { _eq: "repo_sync" } }] },
    },
  ];
}

function readonlyWhenRepoSync(field) {
  return [
    {
      name: `Readonly when ${field} = repo_sync`,
      readonly: true,
      rule: { _and: [{ [field]: { _eq: "repo_sync" } }] },
    },
  ];
}

function editorBodyConditions(mode, sourceField) {
  return [
    {
      name: `Show if editor_mode = ${mode}`,
      hidden: false,
      rule: { _and: [{ editor_mode: { _eq: mode } }] },
    },
    {
      name: `Readonly when editor_mode = ${mode} and ${sourceField} = repo_sync`,
      hidden: false,
      readonly: true,
      rule: { _and: [{ editor_mode: { _eq: mode } }, { [sourceField]: { _eq: "repo_sync" } }] },
    },
  ];
}

function aliasMeta(interfaceId, extra = {}) {
  return {
    interface: interfaceId,
    special: ["alias", "no-data"],
    ...extra,
  };
}

function groupAliasMeta(interfaceId, extra = {}) {
  return {
    interface: interfaceId,
    special: ["alias", "no-data", "group"],
    ...extra,
  };
}

function collectionMeta(spec) {
  return {
    collection: spec.collection,
    meta: {
      icon: spec.icon,
      note: spec.note,
      display_template: "{{title}}",
      hidden: false,
      singleton: false,
      archive_field: "status",
      archive_app_filter: true,
      archive_value: "archived",
      unarchive_value: "draft",
      sort_field: "sort",
      accountability: "all",
      sort: spec.sort,
      group: "website",
      collapse: "open",
      preview_url: spec.preview_url,
      versioning: true,
      item_duplication_fields: spec.duplication,
    },
  };
}

function shellFields(spec, flowId) {
  const topHelp = spec.collection === "documentation"
    ? "<h2>Managing Documentation</h2><p>Use this collection for CMS-native documentation drafts. Repo-synced docs remain markdown-first and should stay owned by the repository.</p>"
    : "<h2>Managing Changelog Entries</h2><p>Use this collection for release notes and changelog drafts. Published releases can stay repo-driven while CMS-native drafts iterate here.</p>";
  return [
    {
      field: "meta_header_main",
      type: "alias",
      meta: aliasMeta("super-header", {
        sort: 2,
        width: "fill",
        options: { title: "{{title}}", subtitle: spec.subtitle, help: topHelp },
      }),
    },
    {
      field: "meta_tabs",
      type: "alias",
      meta: groupAliasMeta("group-tabs", {
        sort: 3,
        width: "full",
        options: { fillWidth: true },
        translations: [{ language: "en-US", translation: "Tabs" }],
      }),
    },
    {
      field: "meta_content",
      type: "alias",
      meta: groupAliasMeta("group-raw", {
        sort: 1,
        width: "full",
        group: "meta_tabs",
        translations: [{ language: "en-US", translation: "Content" }],
      }),
    },
    {
      field: "meta_source",
      type: "alias",
      meta: groupAliasMeta("group-raw", {
        sort: 2,
        width: "full",
        group: "meta_tabs",
        translations: [{ language: "en-US", translation: "Source" }],
      }),
    },
    {
      field: "meta_seo",
      type: "alias",
      meta: groupAliasMeta("group-raw", {
        sort: 3,
        width: "full",
        group: "meta_tabs",
        translations: [{ language: "en-US", translation: "SEO" }],
      }),
    },
    {
      field: "meta_notice_repo_sync",
      type: "alias",
      meta: aliasMeta("presentation-notice", {
        sort: 1,
        width: "full",
        group: "meta_content",
        hidden: true,
        options: { text: "This item is repo-owned. Keep the canonical markdown in the repository; Directus stays read-only for the synced body." },
        conditions: visibleWhen("source_kind", "repo_sync"),
      }),
    },
    {
      field: "meta_notice_editor_mode",
      type: "alias",
      meta: aliasMeta("presentation-notice", {
        sort: 2,
        width: "full",
        group: "meta_content",
        options: { text: "Choose Markdown for repository-style drafting or WYSIWYG for CMS-native rich text. Only one body editor is shown at a time." },
      }),
    },
    {
      field: "meta_header_content",
      type: "alias",
      meta: aliasMeta("super-header", {
        sort: 8,
        width: "full",
        group: "meta_content",
        options: {
          title: "Content Assistance",
          icon: "auto_awesome",
          help: "<p>Use the AI flow to draft or improve CMS-authored content. Repo-owned items keep AI actions hidden to avoid drifting away from repository truth.</p>",
          actions: [
            {
              label: "AI Ghostwriter",
              icon: "text_increase",
              type: "normal",
              actionType: "flow",
              flow: { key: flowId, collection: "directus_flows" },
              hideWhenField: "source_kind",
              hideWhenValue: "repo_sync",
            },
          ],
        },
      }),
    },
  ];
}

function contentFields(spec) {
  return [
    { field: "sort", type: "integer", meta: { hidden: true, sort: 2 }, schema: { data_type: "integer", is_nullable: true } },
    { field: "title", type: "string", meta: { interface: "input", sort: 3, width: "half", group: "meta_content", required: true, note: spec.title_note }, schema: { data_type: "character varying", max_length: 255, is_nullable: true } },
    { field: "slug", type: "string", meta: { interface: "extension-wpslug", display: "formatted-value", display_options: { font: "monospace" }, sort: 4, width: "half", group: "meta_content", note: spec.slug_note, conditions: hiddenReadonlyWhenRepoSync("source_kind"), options: { font: "monospace", template: "{{title}}" } }, schema: { data_type: "character varying", max_length: 255, is_nullable: true } },
    { field: "status", type: "string", meta: { interface: "select-dropdown", display: "labels", display_options: { choices: STATUS_CHOICES }, sort: 5, width: "half", group: "meta_content", note: "Publishing state for this item.", options: { choices: STATUS_CHOICES } }, schema: { data_type: "character varying", max_length: 255, is_nullable: false, default_value: "draft" } },
    { field: "published_at", type: "timestamp", meta: { interface: "datetime", display: "datetime", display_options: { format: "short" }, sort: 6, width: "half", group: "meta_content", note: "Publish now or schedule for later.", conditions: [{ name: "Show If Published", hidden: false, rule: { _and: [{ status: { _eq: "published" } }] }, options: { includeSeconds: false, use24: true } }] }, schema: { data_type: "timestamp with time zone", is_nullable: true } },
    { field: "description", type: "text", meta: { interface: "input-multiline", sort: 7, width: "half", group: "meta_content", note: spec.description_note, conditions: hiddenReadonlyWhenRepoSync("source_kind") }, schema: { data_type: "text", is_nullable: true } },
    { field: "author", type: "uuid", meta: { interface: "select-dropdown-m2o", display: "user", display_options: { circle: true }, sort: 8, width: "half", group: "meta_content", note: "Select the editor responsible for this item.", options: { template: "{{avatar.$thumbnail}} {{first_name}} {{last_name}}" } }, schema: { data_type: "uuid", is_nullable: true, foreign_key_table: "directus_users", foreign_key_column: "id" } },
    ...(spec.version ? [{ field: "version", type: "string", meta: { interface: "input", sort: 9, width: "half", group: "meta_content", note: "Release or version label for this changelog entry.", conditions: hiddenReadonlyWhenRepoSync("source_kind") }, schema: { data_type: "character varying", max_length: 64, is_nullable: true } }] : []),
    { field: "editor_mode", type: "string", meta: { interface: "radio-cards-interface", display: "labels", display_options: { choices: EDITOR_MODE_CHOICES.map(({ text, value, icon }) => ({ text, value, icon })) }, sort: spec.version ? 10 : 9, width: "full", group: "meta_content", note: "Switch between markdown and WYSIWYG authoring.", options: { gridSize: 2, enableSearch: false, choices: EDITOR_MODE_CHOICES }, conditions: hiddenReadonlyWhenRepoSync("source_kind") }, schema: { data_type: "character varying", max_length: 32, is_nullable: false, default_value: "markdown" } },
    { field: "markdown_raw", type: "text", meta: { interface: "input-rich-text-md", sort: spec.version ? 11 : 10, width: "full", group: "meta_content", hidden: true, note: "Canonical markdown body.", options: { toolbar: MD_TOOLBAR }, conditions: editorBodyConditions("markdown", "source_kind") }, schema: { data_type: "text", is_nullable: true } },
    { field: "wysiwyg_content", type: "text", meta: { interface: "input-rich-text-html", sort: spec.version ? 12 : 11, width: "full", group: "meta_content", hidden: true, note: "Rich text body used when the editor mode is WYSIWYG.", options: { toolbar: HTML_TOOLBAR }, conditions: editorBodyConditions("wysiwyg", "source_kind") }, schema: { data_type: "text", is_nullable: true } },
    { field: "html_rendered", type: "text", meta: { interface: "input-rich-text-html", sort: spec.version ? 13 : 12, width: "full", group: "meta_content", hidden: true, readonly: true, note: "Derived HTML preview. Not editor-owned." }, schema: { data_type: "text", is_nullable: true } },
    { field: "source_kind", type: "string", meta: { interface: "select-dropdown", display: "labels", display_options: { choices: SOURCE_KIND_CHOICES }, sort: 1, width: "half", group: "meta_source", note: "Ownership of this content item.", options: { choices: SOURCE_KIND_CHOICES } }, schema: { data_type: "character varying", max_length: 32, is_nullable: false, default_value: "cms_manual" } },
    { field: "source_path", type: "string", meta: { interface: "input", sort: 2, width: "full", group: "meta_source", note: "Repository source path when this item is repo-synced.", options: { font: "monospace" }, conditions: hiddenReadonlyWhenRepoSync("source_kind") }, schema: { data_type: "character varying", max_length: 255, is_nullable: true } },
    { field: "source_sha", type: "string", meta: { interface: "input", sort: 3, width: "half", group: "meta_source", note: "Last synced commit or content digest.", options: { font: "monospace" }, readonly: true }, schema: { data_type: "character varying", max_length: 255, is_nullable: true } },
    { field: "source_url", type: "string", meta: { interface: "input", sort: 4, width: "half", group: "meta_source", note: "Canonical upstream source URL.", options: { font: "monospace" }, readonly: true }, schema: { data_type: "character varying", max_length: 2048, is_nullable: true } },
    { field: "seo", type: "json", meta: { special: ["cast-json"], interface: "seo-interface", display: "seo-display", display_options: { showSearchPreview: true }, sort: 1, width: "full", group: "meta_seo", options: { titleTemplate: spec.seo_title, descriptionTemplate: "{{description}}", additionalFields: null } }, schema: { data_type: "json", is_nullable: true } },
  ];
}

function draftFlowSpec(spec) {
  const modeChoices = EDITOR_MODE_CHOICES.map(({ text, value }) => ({ text, value }));
  return {
    name: spec.flow_name,
    icon: "magic_button",
    description: spec.flow_description,
    options: {
      collections: [spec.collection],
      requireConfirmation: true,
      confirmationDescription: spec.flow_name,
      location: "item",
      fields: [
        { field: "prompt", type: "text", name: "Prompt", meta: { interface: "input-multiline", note: spec.flow_prompt_note, width: "full" } },
        { field: "output_mode", type: "string", name: "Output Mode", meta: { interface: "select-radio", options: { choices: modeChoices }, width: "full" } },
      ],
    },
    operations: [
      { name: "Globals", key: "globals", type: "trigger", position_x: 20, position_y: 20, options: { flow: "69e87d0b-df14-4779-bdc8-abc05f2f1e97" } },
      {
        name: "Write",
        key: "write",
        type: "directus-labs-ai-writer-operation",
        position_x: 40,
        position_y: 20,
        options: {
          apiKey: "{{globals.openai_api_key}}",
          model: "gpt-4o-mini",
          promptKey: "custom",
          aiProvider: "openai",
          apiKeyOpenAi: "{{globals.openai_api_key}}",
          json_mode: true,
          system: spec.flow_system,
          text: "Create or improve this item based on the editor request.\n\nPrompt:\n{{$trigger.body.prompt}}\n\nRequested output mode:\n{{$trigger.body.output_mode}}",
        },
      },
      {
        name: "Format",
        key: "format",
        type: "exec",
        position_x: 60,
        position_y: 20,
        options: {
          code: spec.format_code,
        },
      },
      {
        name: "Update",
        key: "update",
        type: "item-update",
        position_x: 80,
        position_y: 20,
        options: {
          collection: spec.collection,
          permissions: "$full",
          key: ["{{$trigger.body.keys}}"],
          payload: "{{format}}",
        },
      },
    ],
  };
}

function authorRelationSpec(collection) {
  return {
    collection,
    field: "author",
    related_collection: "directus_users",
    meta: {
      many_collection: collection,
      many_field: "author",
      one_collection: "directus_users",
      one_field: null,
      sort_field: "sort",
      one_deselect_action: "nullify",
    },
    schema: {
      table: collection,
      column: "author",
      foreign_key_schema: "public",
      foreign_key_table: "directus_users",
      foreign_key_column: "id",
      on_update: "NO ACTION",
      on_delete: "SET NULL",
    },
  };
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const client = new DirectusClient(env.PUBLIC_URL, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  await client.login();

  const specs = [
    {
      collection: "documentation",
      icon: "menu_book",
      sort: 3,
      note: "Documentation drafts and repo-synced docs. Markdown remains canonical for repository-owned content.",
      preview_url: "http://localhost:3000/docs/{{slug}}?preview=true&version={{$version}}",
      duplication: ["title", "slug", "status", "description", "editor_mode", "markdown_raw", "wysiwyg_content", "seo"],
      subtitle: "{{status}} • {{source_kind}}",
      title_note: "Title of the documentation entry.",
      slug_note: "Unique URL slug for this documentation entry.",
      description_note: "Short summary or excerpt shown in docs listings and search previews.",
      seo_title: "{{title}} | Zenith Documentation",
      flow_name: "AI Documentation Ghostwriter",
      flow_description: "Draft or improve documentation content with AI.",
      flow_prompt_note: "Describe the documentation draft or improvement you want. Keep it concrete and technical.",
      flow_system: "You write Zenith framework documentation. Return only JSON with keys title, slug, description, editor_mode, markdown_raw, wysiwyg_content. If editor_mode is markdown, markdown_raw must contain the body and wysiwyg_content must be empty. If editor_mode is wysiwyg, wysiwyg_content must contain clean HTML and markdown_raw must be empty. Keep tone technical, direct, and accurate.",
      format_code: "module.exports = function(data) { const out = JSON.parse(data.write); return { title: out.title, slug: out.slug, description: out.description, editor_mode: out.editor_mode || 'markdown', markdown_raw: out.markdown_raw || null, wysiwyg_content: out.wysiwyg_content || null, source_kind: 'cms_ai', status: 'draft' }; }",
    },
    {
      collection: "changelogs",
      icon: "history_edu",
      sort: 4,
      note: "Release notes and changelog drafts. Repo-synced releases stay repository-owned; CMS drafts can iterate here.",
      preview_url: "http://localhost:3000/changelog/{{slug}}?preview=true&version={{$version}}",
      duplication: ["title", "slug", "version", "status", "description", "editor_mode", "markdown_raw", "wysiwyg_content", "seo"],
      subtitle: "{{version}} • {{status}} • {{source_kind}}",
      title_note: "Title of the changelog entry.",
      slug_note: "Unique URL slug for this changelog entry.",
      description_note: "Short summary of the release or change set.",
      seo_title: "{{title}} | Zenith Changelog",
      version: true,
      flow_name: "AI Changelog Ghostwriter",
      flow_description: "Draft or improve changelog entries with AI.",
      flow_prompt_note: "Describe the release or change set you want summarized.",
      flow_system: "You write Zenith framework changelog entries. Return only JSON with keys title, slug, version, description, editor_mode, markdown_raw, wysiwyg_content. If editor_mode is markdown, markdown_raw must contain the body and wysiwyg_content must be empty. If editor_mode is wysiwyg, wysiwyg_content must contain clean HTML and markdown_raw must be empty. Keep tone technical, direct, and release-note focused.",
      format_code: "module.exports = function(data) { const out = JSON.parse(data.write); return { title: out.title, slug: out.slug, version: out.version || null, description: out.description, editor_mode: out.editor_mode || 'markdown', markdown_raw: out.markdown_raw || null, wysiwyg_content: out.wysiwyg_content || null, source_kind: 'cms_ai', status: 'draft' }; }",
    },
  ];

  for (const spec of specs) {
    await client.ensureCollection(collectionMeta(spec));
    const flowId = await client.ensureFlow(draftFlowSpec(spec));
    for (const fieldSpec of [...shellFields(spec, flowId), ...contentFields(spec)]) {
      await client.ensureField(spec.collection, fieldSpec);
    }
    await client.ensureRelation(authorRelationSpec(spec.collection));
    await client.ensurePermissionsFrom("posts", spec.collection);
    await client.ensurePreset({
      bookmark: spec.collection === "documentation" ? "Active Documentation" : "Active Changelogs",
      collection: spec.collection,
      icon: spec.collection === "documentation" ? "menu_book" : "history_edu",
      color: "#6644FF",
      filter: { status: { _neq: "archived" } },
      layout_query: { sort: ["sort", "title"] },
    });
  }

  console.log("Applied live documentation and changelog schema to Directus.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
