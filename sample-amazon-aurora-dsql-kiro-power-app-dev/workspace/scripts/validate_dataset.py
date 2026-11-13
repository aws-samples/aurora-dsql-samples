#!/usr/bin/env python3
"""Validate the synthetic material-control blog dataset using the standard library."""

from __future__ import annotations

import csv
import json
import sys
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def load_csv(name: str) -> list[dict[str, str]]:
    path = DATA / name
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_uuid_rows(rows: list[dict[str, str]], key: str, table: str) -> None:
    values: set[str] = set()
    for row_number, row in enumerate(rows, start=2):
        value = row[key]
        try:
            uuid.UUID(value)
        except ValueError as error:
            raise ValueError(f"{table}:{row_number} has invalid {key}: {value}") from error
        require(value not in values, f"{table} contains duplicate {key}: {value}")
        values.add(value)


def values(rows: list[dict[str, str]], key: str) -> set[str]:
    return {row[key] for row in rows}


def validate_foreign_key(
    rows: list[dict[str, str]],
    child_key: str,
    parent_values: set[str],
    table: str,
    *,
    nullable: bool = False,
) -> None:
    for row_number, row in enumerate(rows, start=2):
        value = row[child_key]
        if nullable and not value:
            continue
        require(
            value in parent_values,
            f"{table}:{row_number} has unknown {child_key}: {value}",
        )


def one_by(rows: list[dict[str, str]], key: str, value: str, table: str) -> dict[str, str]:
    matches = [row for row in rows if row[key] == value]
    require(len(matches) == 1, f"{table} expected one {key}={value}, found {len(matches)}")
    return matches[0]


def main() -> int:
    manifest = json.loads((DATA / "dataset-manifest.json").read_text(encoding="utf-8"))
    tables = {
        item["table"]: load_csv(item["file"])
        for item in manifest["canonical_files"]
    }

    for item in manifest["canonical_files"]:
        observed = len(tables[item["table"]])
        require(
            observed == item["rows"],
            f"{item['file']} expected {item['rows']} rows, found {observed}",
        )

    primary_keys = {
        "plant": "plant_id",
        "supplier": "supplier_id",
        "part": "part_id",
        "part_revision": "part_revision_id",
        "bom_component": "bom_component_id",
        "work_order": "work_order_id",
        "inventory_lot": "inventory_lot_id",
        "quality_hold": "quality_hold_id",
        "work_order_output": "work_order_output_id",
        "material_issue": "material_issue_id",
        "lot_genealogy_edge": "lot_genealogy_edge_id",
    }
    for table, key in primary_keys.items():
        validate_uuid_rows(tables[table], key, table)

    plant_ids = values(tables["plant"], "plant_id")
    supplier_ids = values(tables["supplier"], "supplier_id")
    part_ids = values(tables["part"], "part_id")
    revision_ids = values(tables["part_revision"], "part_revision_id")
    work_order_ids = values(tables["work_order"], "work_order_id")
    lot_ids = values(tables["inventory_lot"], "inventory_lot_id")

    validate_foreign_key(tables["part_revision"], "part_id", part_ids, "part_revision")
    validate_foreign_key(
        tables["bom_component"], "parent_revision_id", revision_ids, "bom_component"
    )
    validate_foreign_key(
        tables["bom_component"], "component_revision_id", revision_ids, "bom_component"
    )
    validate_foreign_key(tables["work_order"], "plant_id", plant_ids, "work_order")
    validate_foreign_key(
        tables["work_order"], "product_revision_id", revision_ids, "work_order"
    )
    validate_foreign_key(
        tables["inventory_lot"], "part_revision_id", revision_ids, "inventory_lot"
    )
    validate_foreign_key(tables["inventory_lot"], "plant_id", plant_ids, "inventory_lot")
    validate_foreign_key(
        tables["inventory_lot"],
        "supplier_id",
        supplier_ids,
        "inventory_lot",
        nullable=True,
    )
    validate_foreign_key(
        tables["quality_hold"], "inventory_lot_id", lot_ids, "quality_hold"
    )
    validate_foreign_key(
        tables["work_order_output"], "work_order_id", work_order_ids, "work_order_output"
    )
    validate_foreign_key(
        tables["work_order_output"], "produced_lot_id", lot_ids, "work_order_output"
    )
    validate_foreign_key(
        tables["material_issue"], "work_order_id", work_order_ids, "material_issue"
    )
    validate_foreign_key(
        tables["material_issue"], "inventory_lot_id", lot_ids, "material_issue"
    )
    validate_foreign_key(
        tables["lot_genealogy_edge"],
        "work_order_id",
        work_order_ids,
        "lot_genealogy_edge",
    )
    validate_foreign_key(
        tables["lot_genealogy_edge"],
        "consumed_lot_id",
        lot_ids,
        "lot_genealogy_edge",
    )
    validate_foreign_key(
        tables["lot_genealogy_edge"],
        "produced_lot_id",
        lot_ids,
        "lot_genealogy_edge",
    )

    require(
        len(values(tables["plant"], "plant_code")) == len(tables["plant"]),
        "plant_code values must be unique",
    )
    require(
        len(values(tables["part"], "part_number")) == len(tables["part"]),
        "part_number values must be unique",
    )
    require(
        len(values(tables["work_order"], "work_order_number")) == len(tables["work_order"]),
        "work_order_number values must be unique",
    )
    require(
        len(values(tables["inventory_lot"], "lot_code")) == len(tables["inventory_lot"]),
        "lot_code values must be unique",
    )

    source_keys: set[tuple[str, str]] = set()
    allowed_dispositions = {"RELEASED", "HOLD", "REJECTED"}
    for row in tables["inventory_lot"]:
        on_hand = int(row["quantity_on_hand"])
        reserved = int(row["quantity_reserved"])
        require(on_hand >= 0, f"{row['lot_code']} has negative on-hand quantity")
        require(reserved >= 0, f"{row['lot_code']} has negative reserved quantity")
        require(reserved <= on_hand, f"{row['lot_code']} reserves more than is on hand")
        require(
            row["inspection_disposition"] in allowed_dispositions,
            f"{row['lot_code']} has invalid disposition",
        )
        source_key = (row["source_system"], row["source_record_id"])
        require(source_key not in source_keys, f"duplicate inventory source key: {source_key}")
        source_keys.add(source_key)

    conflict = manifest["conflict_scenario"]
    conflict_lot = one_by(
        tables["inventory_lot"], "lot_code", conflict["lot_code"], "inventory_lot"
    )
    conflict_work_order = one_by(
        tables["work_order"],
        "work_order_number",
        conflict["work_order_number"],
        "work_order",
    )
    available = int(conflict_lot["quantity_on_hand"]) - int(
        conflict_lot["quantity_reserved"]
    )
    require(conflict_lot["inspection_disposition"] == "RELEASED", "conflict lot is not released")
    require(available == conflict["reservation_quantity"], "conflict lot is not exactly scarce")
    require(
        conflict_lot["plant_id"] == conflict_work_order["plant_id"],
        "conflict lot and work order are in different plants",
    )
    open_holds = [
        hold
        for hold in tables["quality_hold"]
        if hold["inventory_lot_id"] == conflict_lot["inventory_lot_id"]
        and hold["status"] == "OPEN"
    ]
    require(not open_holds, "conflict lot already has an open hold")

    genealogy = manifest["genealogy_scenario"]
    suspect_lot = one_by(
        tables["inventory_lot"], "lot_code", genealogy["suspect_lot_code"], "inventory_lot"
    )
    affected_work_order = one_by(
        tables["work_order"],
        "work_order_number",
        genealogy["affected_work_order_number"],
        "work_order",
    )
    finished_lot = one_by(
        tables["inventory_lot"],
        "lot_code",
        genealogy["finished_lot_code"],
        "inventory_lot",
    )
    matching_edges = [
        edge
        for edge in tables["lot_genealogy_edge"]
        if edge["consumed_lot_id"] == suspect_lot["inventory_lot_id"]
        and edge["work_order_id"] == affected_work_order["work_order_id"]
        and edge["produced_lot_id"] == finished_lot["inventory_lot_id"]
    ]
    require(len(matching_edges) == 1, "expected genealogy edge was not found")

    matching_issues = [
        issue
        for issue in tables["material_issue"]
        if issue["inventory_lot_id"] == suspect_lot["inventory_lot_id"]
        and issue["work_order_id"] == affected_work_order["work_order_id"]
    ]
    require(len(matching_issues) == 1, "expected material issue was not found")

    duplicate_fixture = load_csv("fixtures/inventory_lots_duplicate.csv")
    require(len(duplicate_fixture) == 1, "duplicate fixture must contain one row")
    duplicate_key = (
        duplicate_fixture[0]["source_system"],
        duplicate_fixture[0]["source_record_id"],
    )
    require(duplicate_key in source_keys, "duplicate fixture does not duplicate a canonical key")

    invalid_fixture = load_csv("fixtures/inventory_lots_invalid.csv")
    require(len(invalid_fixture) == 3, "invalid fixture must contain three rows")

    total_rows = sum(len(rows) for rows in tables.values())
    print(f"PASS: validated {len(tables)} canonical files and {total_rows} rows")
    print(
        "PASS: conflict target "
        f"{conflict['lot_code']} has exactly {conflict['reservation_quantity']} available units"
    )
    print(
        "PASS: genealogy target "
        f"{genealogy['suspect_lot_code']} -> "
        f"{genealogy['affected_work_order_number']} -> "
        f"{genealogy['finished_lot_code']}"
    )
    print("PASS: duplicate and invalid negative-test fixtures are present")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
