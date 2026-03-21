#!/usr/bin/env python3

import json
import sqlite3
import uuid


STATUS_CHOICES = [
    {"value": "draft", "text": "Draft"},
    {"value": "in_review", "text": "In Review"},
    {"value": "published", "text": "Published"},
    {"value": "archived", "text": "Archived"},
]

SOURCE_KIND_CHOICES = [
    {"value": "repo_sync", "text": "Repo Sync"},
    {"value": "cms_manual", "text": "CMS Manual"},
    {"value": "cms_ai", "text": "CMS AI"},
]

AI_PROVIDER_CHOICES = [
    {"value": "google", "text": "Google Gemini"},
    {"value": "openai", "text": "OpenAI"},
]

EDITOR_MODE_CARD_OPTIONS = {
    "gridSize": 2,
    "enableSearch": False,
    "choices": [
        {
            "text": "Markdown",
            "value": "markdown",
            "description": "Canonical raw markdown for repo-synced docs and technical drafting.",
            "icon_type": "icon",
            "icon": "code",
        },
        {
            "text": "WYSIWYG",
            "value": "wysiwyg",
            "description": "Rich-text authoring for CMS-native documentation and editorial polish.",
            "icon_type": "icon",
            "icon": "edit_note",
        },
    ],
}


def parse_json(value, default):
    if not value:
        return default
    return json.loads(value)


def dump_json(value):
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def field_row(conn, collection, field):
    cur = conn.execute(
        "SELECT * FROM directus_fields WHERE collection = ? AND field = ?",
        (collection, field),
    )
    return cur.fetchone()


def ensure_column(conn, table, column, column_sql):
    cur = conn.execute(f"PRAGMA table_info({table})")
    columns = {row[1] for row in cur.fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_sql}")


def merge_conditions(existing, additions):
    merged = {}
    for condition in existing:
        if isinstance(condition, dict):
            key = condition.get("name") or dump_json(condition.get("rule"))
            merged[key] = condition
    for condition in additions:
        key = condition.get("name") or dump_json(condition.get("rule"))
        merged[key] = condition
    return list(merged.values())


def update_field(conn, collection, field, **updates):
    allowed = {
        "special",
        "interface",
        "options",
        "display",
        "display_options",
        "readonly",
        "hidden",
        "sort",
        "width",
        "translations",
        "note",
        "conditions",
        "required",
        "group",
        "validation",
        "validation_message",
        "searchable",
    }
    update_pairs = []
    values = []
    for key, value in updates.items():
        if key not in allowed:
            continue
        column_name = '"group"' if key == "group" else key
        update_pairs.append(f"{column_name} = ?")
        if key in {"options", "display_options", "translations", "conditions", "validation"}:
            values.append(dump_json(value) if value is not None else None)
        else:
            values.append(value)
    if not update_pairs:
        return
    values.extend([collection, field])
    conn.execute(
        f"UPDATE directus_fields SET {', '.join(update_pairs)} WHERE collection = ? AND field = ?",
        values,
    )


def insert_field(
    conn,
    *,
    collection,
    field,
    interface=None,
    display=None,
    hidden=0,
    readonly=0,
    sort=None,
    width="full",
    special=None,
    options=None,
    display_options=None,
    note=None,
    conditions=None,
    required=0,
    group=None,
    searchable=1,
):
    conn.execute(
        """
        INSERT INTO directus_fields (
            collection, field, special, interface, options, display, display_options,
            readonly, hidden, sort, width, note, conditions, required, "group", searchable
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            collection,
            field,
            special,
            interface,
            dump_json(options) if options is not None else None,
            display,
            dump_json(display_options) if display_options is not None else None,
            readonly,
            hidden,
            sort,
            width,
            note,
            dump_json(conditions) if conditions is not None else None,
            required,
            group,
            searchable,
        ),
    )


def ensure_field(conn, **kwargs):
    row = field_row(conn, kwargs["collection"], kwargs["field"])
    if row is None:
        insert_field(conn, **kwargs)
        return
    update_field(
        conn,
        kwargs["collection"],
        kwargs["field"],
        special=kwargs.get("special"),
        interface=kwargs.get("interface"),
        options=kwargs.get("options"),
        display=kwargs.get("display"),
        display_options=kwargs.get("display_options"),
        readonly=kwargs.get("readonly", 0),
        hidden=kwargs.get("hidden", 0),
        sort=kwargs.get("sort"),
        width=kwargs.get("width", "full"),
        note=kwargs.get("note"),
        conditions=kwargs.get("conditions"),
        required=kwargs.get("required", 0),
        group=kwargs.get("group"),
        searchable=kwargs.get("searchable", 1),
    )


def update_collection(conn, collection, **updates):
    allowed = {
        "icon",
        "note",
        "display_template",
        "hidden",
        "singleton",
        "translations",
        "archive_field",
        "archive_app_filter",
        "archive_value",
        "unarchive_value",
        "sort_field",
        "accountability",
        "color",
        "item_duplication_fields",
        "sort",
        "group",
        "collapse",
        "preview_url",
        "versioning",
    }
    update_pairs = []
    values = []
    for key, value in updates.items():
        if key not in allowed:
            continue
        column_name = '"group"' if key == "group" else key
        update_pairs.append(f"{column_name} = ?")
        if key in {"translations", "item_duplication_fields"}:
            values.append(dump_json(value) if value is not None else None)
        else:
            values.append(value)
    values.append(collection)
    conn.execute(
        f"UPDATE directus_collections SET {', '.join(update_pairs)} WHERE collection = ?",
        values,
    )


def flow_id_by_name(conn, name):
    cur = conn.execute("SELECT id FROM directus_flows WHERE name = ?", (name,))
    row = cur.fetchone()
    return row[0] if row else None


def ensure_request_flow(conn, name, options, request_name, request_url, body):
    flow_id = flow_id_by_name(conn, name)
    op_options = {
        "url": request_url,
        "method": "POST",
        "body": body,
        "headers": [{"header": "Content-Type", "value": "application/json"}],
    }
    if flow_id is None:
        flow_id = str(uuid.uuid4())
        operation_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO directus_flows (id, name, icon, color, status, trigger, accountability, options, operation)
            VALUES (?, ?, ?, ?, 'active', 'manual', 'all', ?, ?)
            """,
            (flow_id, name, "auto_awesome", "#6644FF", dump_json(options), operation_id),
        )
        conn.execute(
            """
            INSERT INTO directus_operations (
                id, name, key, type, position_x, position_y, options, resolve, reject, flow
            ) VALUES (?, ?, ?, 'request', 20, 20, ?, NULL, NULL, ?)
            """,
            (operation_id, request_name, request_name.lower().replace(" ", "-"), dump_json(op_options), flow_id),
        )
        return flow_id

    conn.execute(
        "UPDATE directus_flows SET icon = ?, color = ?, status = 'active', trigger = 'manual', accountability = 'all', options = ? WHERE id = ?",
        ("auto_awesome", "#6644FF", dump_json(options), flow_id),
    )
    cur = conn.execute("SELECT id FROM directus_operations WHERE flow = ? ORDER BY date_created LIMIT 1", (flow_id,))
    row = cur.fetchone()
    if row is None:
        operation_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO directus_operations (
                id, name, key, type, position_x, position_y, options, resolve, reject, flow
            ) VALUES (?, ?, ?, 'request', 20, 20, ?, NULL, NULL, ?)
            """,
            (operation_id, request_name, request_name.lower().replace(" ", "-"), dump_json(op_options), flow_id),
        )
        conn.execute("UPDATE directus_flows SET operation = ? WHERE id = ?", (operation_id, flow_id))
        return flow_id

    operation_id = row[0]
    conn.execute(
        """
        UPDATE directus_operations
        SET name = ?, key = ?, type = 'request', position_x = 20, position_y = 20, options = ?, resolve = NULL, reject = NULL
        WHERE id = ?
        """,
        (request_name, request_name.lower().replace(" ", "-"), dump_json(op_options), operation_id),
    )
    conn.execute("UPDATE directus_flows SET operation = ? WHERE id = ?", (operation_id, flow_id))
    return flow_id


def ensure_preset(conn, *, collection, bookmark, icon, color, filter_value):
    cur = conn.execute(
        "SELECT id FROM directus_presets WHERE collection = ? AND bookmark = ?",
        (collection, bookmark),
    )
    row = cur.fetchone()
    payload = (bookmark, collection, "tabular", dump_json(filter_value), icon, color)
    if row is None:
        conn.execute(
            """
            INSERT INTO directus_presets (bookmark, collection, layout, filter, icon, color)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            payload,
        )
        return
    conn.execute(
        """
        UPDATE directus_presets
        SET layout = ?, filter = ?, icon = ?, color = ?
        WHERE id = ?
        """,
        ("tabular", dump_json(filter_value), icon, color, row[0]),
    )


def readonly_when_repo_sync(existing_conditions):
    return merge_conditions(
        existing_conditions,
        [
            {
                "name": "Readonly For Repo-Sync",
                "readonly": True,
                "rule": {"source_kind": {"_eq": "repo_sync"}},
            }
        ],
    )


def set_repo_sync_readonly(conn, field):
    row = field_row(conn, "documentation", field)
    conditions = parse_json(row["conditions"], []) if row and row["conditions"] else []
    update_field(
        conn,
        "documentation",
        field,
        conditions=readonly_when_repo_sync(conditions),
    )


def configure_editor_mode(conn, collection, note):
    row = field_row(conn, collection, "editor_mode")
    conditions = parse_json(row["conditions"], []) if row and row["conditions"] else []
    update_field(
        conn,
        collection,
        "editor_mode",
        interface="radio-cards-interface",
        options=EDITOR_MODE_CARD_OPTIONS,
        width="full",
        note=note,
        conditions=conditions,
    )
