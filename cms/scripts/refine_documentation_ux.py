#!/usr/bin/env python3

import sqlite3
from pathlib import Path

from directus_metadata import AI_PROVIDER_CHOICES
from directus_metadata import configure_editor_mode
from directus_metadata import ensure_column
from directus_metadata import ensure_field
from directus_metadata import ensure_preset
from directus_metadata import ensure_request_flow
from directus_metadata import field_row
from directus_metadata import set_repo_sync_readonly
from directus_metadata import update_collection
from directus_metadata import update_field


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "database" / "data.db"


def update_documentation_collection(conn):
    update_collection(
        conn,
        "documentation",
        display_template="{{title}}",
        note="Documentation content. Repo-synced items stay markdown-first and read-only in Studio; CMS-authored items can use markdown or WYSIWYG.",
    )
    configure_editor_mode(
        conn,
        "documentation",
        "Choose the body editor for CMS-authored docs. Repo-owned docs stay locked to Markdown.",
    )
    configure_editor_mode(
        conn,
        "posts",
        "Choose markdown or WYSIWYG for CMS-authored post bodies.",
    )


def ensure_documentation_body_fields(conn):
    ensure_field(
        conn,
        collection="documentation",
        field="repo_sync_notice",
        interface="presentation-notice",
        special="alias,no-data",
        sort=18,
        width="full",
        group="body",
        options={
            "text": "This item is **repo-owned**. Markdown stays canonical and editing happens in Git. Studio body fields and AI draft actions are limited for this item.",
            "icon": "lock",
            "color": "#b45309",
        },
        conditions=[
            {
                "name": "Show For Repo-Sync",
                "hidden": False,
                "rule": {"source_kind": {"_eq": "repo_sync"}},
            }
        ],
        note="Shown when the documentation item is repo-owned and therefore not editable in Studio.",
    )

    update_field(
        conn,
        "documentation",
        "editor_mode_notice",
        options={
            "text": "Choose **Markdown** for source-first authoring or **WYSIWYG** for CMS-native drafting. Imported repo docs stay locked to Markdown and read-only in Studio.",
            "icon": "edit_note",
            "color": "var(--theme--primary)",
        },
        note="Documentation body mode selector guidance.",
    )

    for field, note in {
        "slug": "Stable route slug. Repo imports derive this from source_path; CMS drafts manage it directly.",
        "title": "Reader-facing document title used in docs navigation and page headers.",
        "source_kind": "Repo sync only mutates repo_sync items. Manual and AI-authored docs remain CMS-owned.",
        "summary": "Short technical summary used for cards, search, and AI summary refresh actions.",
        "excerpt": "Optional introductory copy for docs listings and future related-reading surfaces.",
        "section": "Section relation used for admin grouping and future docs navigation queries.",
        "tags": "Relational docs tags reused across documentation and posts.",
        "status": "Repo-owned docs import as published or archived. CMS-authored docs default to draft.",
        "source_path": "Stable repository path used for repo-owned item upserts. Leave empty for CMS-owned docs.",
    }.items():
        update_field(conn, "documentation", field, note=note)

    for readonly_field in [
        "slug",
        "title",
        "summary",
        "excerpt",
        "source_kind",
        "editor_mode",
        "markdown_raw",
        "wysiwyg_content",
        "section",
        "tags",
        "status",
        "source_path",
    ]:
        set_repo_sync_readonly(conn, readonly_field)


def ensure_documentation_seo(conn):
    ensure_column(conn, "documentation", "seo", "TEXT")
    seo_row = field_row(conn, "documentation", "seo")
    if seo_row and seo_row["interface"] == "group-raw":
        conn.execute(
            "UPDATE directus_fields SET field = ?, sort = ?, note = ? WHERE collection = 'documentation' AND field = 'seo'",
            (
                "seo_group",
                100,
                "SEO group for future docs page metadata and search previews.",
            ),
        )

    ensure_field(
        conn,
        collection="documentation",
        field="seo_group",
        interface="group-raw",
        special="alias,no-data,group",
        sort=100,
        width="full",
        note="SEO metadata used for future docs page titles, search previews, and canonical routing.",
    )
    ensure_field(
        conn,
        collection="documentation",
        field="seo",
        interface="seo-interface",
        display="seo-display",
        sort=101,
        width="full",
        group="seo_group",
        note="Docs-specific SEO metadata for future page titles, descriptions, and canonical metadata.",
        options={
            "titleTemplate": "{{title}} | Zenith Documentation",
            "descriptionTemplate": "{{summary}}",
            "showOgImage": False,
            "showSearchControls": True,
            "showSitemap": True,
            "defaultChangeFrequency": "weekly",
            "defaultPriority": "0.5",
            "additionalFields": [],
        },
        display_options={"showSearchPreview": True},
    )


def ensure_documentation_flows(conn):
    improve_docs_flow_id = ensure_request_flow(
        conn,
        "Improve Documentation Draft",
        {
            "collections": ["documentation"],
            "requireSelection": True,
            "requireConfirmation": True,
            "confirmationDescription": "Improve Documentation Draft",
            "fields": [
                {
                    "field": "instruction",
                    "type": "text",
                    "name": "Instruction",
                    "meta": {"interface": "input-multiline", "required": True},
                },
                {
                    "field": "target_field",
                    "type": "string",
                    "name": "Target Field",
                    "meta": {
                        "interface": "select-dropdown",
                        "required": True,
                        "options": {
                            "choices": [
                                {"value": "title", "text": "Title"},
                                {"value": "summary", "text": "Summary"},
                                {"value": "excerpt", "text": "Excerpt"},
                                {"value": "body", "text": "Body"},
                            ],
                            "defaultValue": "body",
                        },
                    },
                },
                provider_field("primary_provider", "Primary Provider", "google"),
                provider_field("fallback_provider", "Fallback Provider", "openai"),
            ],
        },
        "Run Documentation Improve Workflow",
        "http://127.0.0.1:8055/zenith-ai/items/improve",
        {
            "collection": "{{ $trigger.body.collection }}",
            "keys": "{{ $trigger.body.keys }}",
            "instruction": "{{ $trigger.body.instruction }}",
            "targetField": "{{ $trigger.body.target_field }}",
            "primaryProvider": "{{ $trigger.body.primary_provider }}",
            "fallbackProvider": "{{ $trigger.body.fallback_provider }}",
        },
    )

    summary_docs_flow_id = ensure_request_flow(
        conn,
        "Generate Documentation Summary/Excerpt",
        {
            "collections": ["documentation"],
            "requireSelection": True,
            "requireConfirmation": True,
            "confirmationDescription": "Generate Documentation Summary/Excerpt",
            "fields": [
                {
                    "field": "target_field",
                    "type": "string",
                    "name": "Target Field",
                    "meta": {
                        "interface": "select-dropdown",
                        "required": True,
                        "options": {
                            "choices": [
                                {"value": "summary", "text": "Summary"},
                                {"value": "excerpt", "text": "Excerpt"},
                            ],
                            "defaultValue": "summary",
                        },
                    },
                },
                provider_field("primary_provider", "Primary Provider", "google"),
                provider_field("fallback_provider", "Fallback Provider", "openai"),
            ],
        },
        "Run Documentation Summary Workflow",
        "http://127.0.0.1:8055/zenith-ai/items/improve",
        {
            "collection": "{{ $trigger.body.collection }}",
            "keys": "{{ $trigger.body.keys }}",
            "instruction": "Generate a precise, technically accurate summary or excerpt for the selected documentation item. Keep Zenith tone direct, concrete, and free of marketing filler.",
            "targetField": "{{ $trigger.body.target_field }}",
            "primaryProvider": "{{ $trigger.body.primary_provider }}",
            "fallbackProvider": "{{ $trigger.body.fallback_provider }}",
        },
    )

    update_field(
        conn,
        "documentation",
        "super_header",
        options={
            "title": "{{ title }}",
            "subtitle": "{{ category_label }} · {{ status }} · {{ source_kind }}",
            "icon": "menu_book",
            "color": "#6644FF",
            "help": (
                "<p>Repo-synced docs stay markdown-first and read-only in Studio. "
                "CMS-authored docs can switch between Markdown and WYSIWYG, then use the AI actions to refine drafts.</p>"
            ),
            "actions": [
                {
                    "label": "Improve Draft",
                    "icon": "auto_fix_high",
                    "type": "normal",
                    "actionType": "flow",
                    "flow": {"collection": "directus_flows", "key": improve_docs_flow_id},
                    "hideWhenField": "source_kind",
                    "hideWhenValue": "repo_sync",
                },
                {
                    "label": "Generate Summary/Excerpt",
                    "icon": "short_text",
                    "type": "secondary",
                    "actionType": "flow",
                    "flow": {"collection": "directus_flows", "key": summary_docs_flow_id},
                    "hideWhenField": "source_kind",
                    "hideWhenValue": "repo_sync",
                },
            ],
        },
        interface="extension-super-header-interface",
        hidden=0,
        readonly=0,
        sort=0,
        width="full",
    )


def provider_field(field_name, label, default_value):
    return {
        "field": field_name,
        "type": "string",
        "name": label,
        "meta": {
            "interface": "select-dropdown",
            "required": True,
            "options": {"choices": AI_PROVIDER_CHOICES, "defaultValue": default_value},
        },
    }


def ensure_documentation_presets(conn):
    ensure_preset(
        conn,
        collection="documentation",
        bookmark="CMS Docs Drafts",
        icon="edit_document",
        color="#0f766e",
        filter_value={
            "_and": [
                {"source_kind": {"_neq": "repo_sync"}},
                {"status": {"_in": ["draft", "in_review"]}},
            ]
        },
    )


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("BEGIN")
    update_documentation_collection(conn)
    ensure_documentation_body_fields(conn)
    ensure_documentation_seo(conn)
    ensure_documentation_flows(conn)
    ensure_documentation_presets(conn)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
